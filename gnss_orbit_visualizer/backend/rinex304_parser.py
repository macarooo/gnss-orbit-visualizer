#!/usr/bin/env python3
"""
RINEX 3.04 NAV 多星座解析器 + 卫星位置计算 | v6（教学版）

功能：
  1. 纯Python解析RINEX 3.04混合NAV（不依赖georinex）
  2. 支持7大星座：GPS, Galileo, BeiDou, QZSS, IRNSS, SBAS, GLONASS
  3. 广播星历 → ECEF坐标计算

算法支持：
  - GPS/Galileo/BeiDou/QZSS/IRNSS/SBAS：开普勒根数算法
  - GLONASS：XYZ坐标+速度积分（PZ-90坐标系）

教学特点：
  - 每步有print中间结果
  - 代码可逐段注释调试
  - 关键算法有详细中文注释

使用方法：
  python3 30-rinex304_parser.py [nav_file]
"""

import sys, re, math
from pathlib import Path
from datetime import datetime, timezone, timedelta

# ============================================================
# 常量
# ============================================================
MU = 3.9860050e14          # 地心引力常数 × 地球质量 (m³/s²)
OMEGA_E = 7.2921151467e-5  # 地球自转角速度 (rad/s)

LINES_PER_BLOCK = {'G': 8, 'C': 8, 'E': 8, 'R': 4, 'I': 8, 'J': 8, 'S': 4}
BROADCAST_30 = [
    'IODE','Cr','DeltaN','M0','Cuc','e','Cus','sqrtA','Toe','CIC',
    'Omega0','CIS','i0','Crc','omega','OmegaDot','IDOT','L2Codes',
    'GPSWeek','L2Pflag','SAV','health','TGD','IODC','TT','FitInt',
    'Spare1','Spare2','Spare3','Spare4'
]
GLONASS_12 = ['X','dX','ddX','Y','dY','ddY','Z','dZ','ddZ','gamma','tau','dtau']
SYS_NAME = {'G':'GPS','C':'BeiDou','E':'Galileo','R':'GLONASS',
            'I':'IRNSS','J':'QZSS','S':'SBAS'}
PREFIX_MAP = {'G':'GPS','C':'BDS','E':'GAL','R':'GLO',
               'I':'IRN','J':'QZS','S':'SBAS'}


# ============================================================
# 工具函数
# ============================================================

def rinex_num(s):
    """解析RINEX数字（D→E，处理粘连符号）"""
    s = s.strip()
    if not s:
        return float('nan')
    s = re.sub(r'D', 'E', s, flags=re.IGNORECASE)
    s = re.sub(r'E-(\d)(?!\d)', r'E-0\\1', s)
    s = re.sub(r'E\+(\d)(?!\d)', r'E+0\\1', s)
    try:
        return float(s)
    except:
        return float('nan')


def find_all_scinums(line):
    """
    提取一行中所有数值
    GPS/Galileo/北斗：用科学计数法
    GLONASS第4列：用普通小数（行末的 " 0.0" 或 " 1.0"）
    """
    sci = re.findall(r'[+-]?\d+\.\d+[DEde][+-]\d+', line)
    # GLONASS第4列特征：科学计数法数字后跟" 0.0"或" 1.0"（行末简单小数）
    dec = re.findall(r'[DEde][+-]\d+ ([+-]?\d+\.\d+)$', line.strip())
    return sci + dec


# ============================================================
# 算法1：开普勒根数 → ECEF坐标（GPS/Galileo/BDS/QZSS/IRNSS/SBAS）
# ============================================================

def kepler_eccentric_anomaly(M, e, tol=1e-12, max_iter=50):
    """
    求解开普勒方程 M = E - e*sin(E)
    迭代法: E_{n+1} = M + e*sin(E_n)

    教学说明：GNSS定位核心算法之一。
    M=平近点角(已知), e=离心率(已知), 求E=偏近点角。
    """
    E = M if e < 0.9 else math.pi
    for _ in range(max_iter):
        dE = (M - E + e * math.sin(E)) / (1.0 - e * math.cos(E))
        E += dE
        if abs(dE) < tol:
            break
    return E


def compute_satellite_ecef(params, prefix, dt_seconds):
    """
    广播星历 → ECEF坐标（核心算法，7步）

    步骤：
      1. 计算轨道长半轴 A = sqrtA²
      2. 计算平均角速度 n = n0 + DeltaN, n0 = sqrt(MU/A³)
      3. 计算平近点角 M = M0 + n·dt
      4. 求解开普勒方程 → 偏近点角 E
      5. 计算真近点角 ν = atan2(...)
      6. 计算轨道半径 r 和纬度参数 u（含谐波修正）
      7. 分解到ECEF: 先算升交点经度L，再投影

    参数说明：
      dt_seconds: 卫星信号发射时刻与星历参考时刻的时间差（秒）
                  正数=信号比参考历元新，负数=信号比参考历元旧
    """
    sqrtA = params.get(f'{prefix}_sqrtA', float('nan'))
    e = params.get(f'{prefix}_e', float('nan'))
    M0 = params.get(f'{prefix}_M0', float('nan'))
    omega = params.get(f'{prefix}_omega', float('nan'))
    Omega0 = params.get(f'{prefix}_Omega0', float('nan'))
    i0 = params.get(f'{prefix}_i0', float('nan'))
    Toe = params.get(f'{prefix}_Toe', float('nan'))
    DeltaN = params.get(f'{prefix}_DeltaN', 0.0)
    IDOT = params.get(f'{prefix}_IDOT', 0.0)
    OmegaDot = params.get(f'{prefix}_OmegaDot', 0.0)
    Cuc = params.get(f'{prefix}_Cuc', 0.0)
    Cus = params.get(f'{prefix}_Cus', 0.0)
    Crc = params.get(f'{prefix}_Crc', 0.0)
    Crs = params.get(f'{prefix}_Cr', 0.0)
    CIC = params.get(f'{prefix}_CIC', 0.0)
    CIS = params.get(f'{prefix}_CIS', 0.0)

    if any(math.isnan(x) for x in [sqrtA, e, M0, omega, Omega0, i0]):
        return float('nan'), float('nan'), float('nan')

    # 步骤1: 轨道长半轴
    A = sqrtA ** 2

    # 步骤2: 平均角速度
    n0 = math.sqrt(MU / (A ** 3))
    n = n0 + DeltaN

    # 步骤3: 平近点角
    M = M0 + n * dt_seconds

    # 步骤4: 偏近点角
    E = kepler_eccentric_anomaly(M, e)

    # 步骤5: 真近点角
    sinE, cosE = math.sin(E), math.cos(E)
    sin_nu = sinE * math.sqrt(1.0 - e**2) / (1.0 - e * cosE)
    cos_nu = (cosE - e) / (1.0 - e * cosE)
    nu = math.atan2(sin_nu, cos_nu)

    # 步骤6: 轨道半径和纬度参数（含谐波修正）
    r = A * (1.0 - e * cosE)
    u0 = nu + omega
    u = u0 + Cuc * math.cos(2*u0) + Cus * math.sin(2*u0)
    r += Crc * math.cos(2*u0) + Crs * math.sin(2*u0)
    i = i0 + IDOT * dt_seconds + CIC * math.cos(2*u0) + CIS * math.sin(2*u0)

    # 步骤7: 升交点经度 + ECEF分解
    L = Omega0 + (OmegaDot - OMEGA_E) * dt_seconds - OMEGA_E * Toe

    x_orb = r * math.cos(u)
    y_orb = r * math.sin(u)

    X = x_orb * math.cos(L) - y_orb * math.sin(L) * math.cos(i)
    Y = x_orb * math.sin(L) + y_orb * math.cos(L) * math.cos(i)
    Z = y_orb * math.sin(i)

    return X, Y, Z


# ============================================================
# 算法2：GLONASS XYZ坐标（PZ-90坐标系）
# ============================================================

def compute_glonass_ecef(params, epoch_dt):
    """
    GLONASS广播星历 → ECEF坐标（PZ-90）

    参数（17个，与GPS完全不同）：
      X, dX, ddX: X坐标(米), X速度(米/秒), X加速度(米/秒²)
      Y, dY, ddY: 同上
      Z, dZ, ddZ: 同上
      gamma: 钟相对改正参数
      tau: 钟差 (秒)

    算法：二阶牛顿积分（简化版）
      X(t) = X0 + dX·dt + 0.5·ddX·dt²

    时间参考：GLONASS星历的Toe是"莫斯科时"(UTC+3小时)的当日秒数。
    RINEX 3.04中GLONASS数据块结构为：
      第1行: X, dX, ddX
      第2行: Y, dY, ddY
      第3行: Z, dZ, ddZ
      第4行: gamma, tau, dtau, Ekn, NT, n_4, GPSWeek, Spare
    其中Ekn是GLONASS时当日起点(UTC+3h)的秒数。
    """
    X0 = params.get('GLO_X', float('nan'))
    dX = params.get('GLO_dX', 0.0)
    ddX = params.get('GLO_ddX', 0.0)
    Y0 = params.get('GLO_Y', float('nan'))
    dY = params.get('GLO_dY', 0.0)
    ddY = params.get('GLO_ddY', 0.0)
    Z0 = params.get('GLO_Z', float('nan'))
    dZ = params.get('GLO_dZ', 0.0)
    ddZ = params.get('GLO_ddZ', 0.0)

    if math.isnan(X0):
        return float('nan'), float('nan'), float('nan')

    # GLONASS参考时间（Ekn=当日秒，UTC+3）
    glo_t_ref = params.get('GLO_Ekn', 0.0)

    # 计算当前时刻的GLONASS时秒数
    # GLONASS日=UTC+3小时，所以UTC当日起点=当天03:00:00 UTC
    epoch_utc = epoch_dt.replace(tzinfo=None)
    # GLONASS当天起点(UTC)
    glo_day_start = epoch_utc.replace(hour=0, minute=0, second=0, microsecond=0)
    # 但GLONASS日从03:00开始（UTC+3）
    # 所以GLONASS时秒数 = (UTC时间 - 当天03:00 UTC)的秒数
    # 如果UTC < 03:00，则属于前一天（03:00开始算）
    glo_sec = (epoch_utc.hour * 3600 + epoch_utc.minute * 60 + epoch_utc.second
               + epoch_utc.microsecond * 1e-6)
    # UTC转GLONASS时：+3小时
    glo_sec += 3 * 3600
    if glo_sec >= 86400:
        glo_sec -= 86400  # 跨天

    dt = glo_sec - glo_t_ref

    # GLONASS速度单位：km/s（不是m/s）
    # 所以位置公式：X = X0 + dX_km_s * dt + 0.5 * ddX * dt²（dt单位为秒）
    X = X0 * 1000.0 + dX * dt + 0.5 * ddX * dt ** 2  # X0是km，转m
    Y = Y0 * 1000.0 + dY * dt + 0.5 * ddY * dt ** 2  # Y0是km，转m
    Z = Z0 * 1000.0 + dZ * dt + 0.5 * ddZ * dt ** 2  # Z0是km，转m

    return X, Y, Z


# ============================================================
# 时间转换
# ============================================================

def utc_to_gps_tow(epoch_dt):
    """UTC → GPS周 + 周内秒"""
    gps_epoch = datetime(1980, 1, 6, 0, 0, 0, tzinfo=timezone.utc)
    diff = (epoch_dt - gps_epoch).total_seconds()
    week = int(diff // 604800)
    tow = diff - week * 604800
    return week, tow


# ============================================================
# 主解析器
# ============================================================

def parse_epoch_line(line):
    """解析历元行（RINEX 3.04 column固定宽）"""
    sv_id = line[0:3]
    parts = line.split()
    year = int(parts[1])
    month = int(parts[2])
    day = int(parts[3])
    hour = int(parts[4])
    minute = int(parts[5])
    if year < 80:
        year += 2000
    elif year < 100:
        year += 1900
    sec_int = int(line[21:23])
    cb_raw = line[23:42]
    cd_raw = line[42:61] if len(line) > 42 else ''
    cb = rinex_num(cb_raw)
    cd = rinex_num(cd_raw) if cd_raw else float('nan')
    epoch_dt = datetime(year, month, day, hour, minute, sec_int, 0, tzinfo=timezone.utc)
    return sv_id, epoch_dt, cb, cd


def parse_data_block(lines_data, n_lines):
    """解析数据块（正则找科学计数法数字）"""
    all_nums = []
    for ln in lines_data[:n_lines]:
        nums = find_all_scinums(ln.rstrip())
        all_nums.extend([rinex_num(n) for n in nums])
    return all_nums


def parse_nav(filepath):
    """解析RINEX 3.04 NAV文件"""
    filepath = Path(filepath)
    print(f"\n[解析] {filepath.name} ({filepath.stat().st_size/1e6:.1f} MB)")

    with open(filepath, 'r', errors='ignore') as f:
        raw_lines = f.readlines()

    header_end = max(i for i, ln in enumerate(raw_lines) if 'END OF HEADER' in ln)
    header_info = raw_lines[:header_end+1]
    data_lines = [ln for ln in raw_lines[header_end+1:] if ln.strip()]

    # 解析头部
    header = {'version':'3.04', 'system':'N', 'leap_seconds':18}
    for ln in header_info:
        if 'RINEX VERSION' in ln:
            parts = ln.split()
            header['version'] = parts[0]
            header['system'] = parts[1]
        elif 'LEAP SECONDS' in ln:
            parts = ln.split()
            header['leap_seconds'] = int(parts[0])

    print(f"  版本: {header['version']}, 系统: {header['system']}, 闰秒: {header['leap_seconds']}")

    # 解析数据块
    sv_data = {}
    i = 0
    n_epochs = 0
    while i < len(data_lines):
        line = data_lines[i].strip()
        if not line:
            i += 1
            continue
        sys_char = line[0]
        n_lines = LINES_PER_BLOCK.get(sys_char, 8)
        if i + n_lines > len(data_lines):
            break
        try:
            sv_id, epoch_dt, cb, cd = parse_epoch_line(line)
        except:
            i += 1
            continue
        block = data_lines[i+1:i+n_lines]
        all_nums = parse_data_block(block, n_lines)
        params = {'sv_id': sv_id, 'epoch_dt': epoch_dt, 'clockBias': cb, 'clockDrift': cd}
        prefix = PREFIX_MAP.get(sys_char, sys_char)
        if sys_char in ('G','C','E','I','J','S'):
            for k, name in enumerate(BROADCAST_30):
                params[f'{prefix}_{name}'] = all_nums[k] if k < len(all_nums) else float('nan')
        elif sys_char == 'R':
            # GLONASS: 每历元3行数据，每行4列（最后1列是spare）
            # all_nums布局: [X,dX,ddX,_, Y,dY,ddY,_, Z,dZ,ddZ,_] (12个值，3个spare)
            # 所以有效参数顺序: X,dX,ddX, Y,dY,ddY, Z,dZ,ddZ, gamma,tau,dtau
            #                    跳过   跳过   跳过
            # i=0,1,2映射k=0,1,2 (X,dX,ddX)
            # i=4,5,6映射k=3,4,5 (Y,dY,ddY)
            # i=8,9,10映射k=6,7,8 (Z,dZ,ddZ)
            # i=12,13,14映射k=9,10,11 (gamma,tau,dtau) — 需要第4行数据！
            # GLONASS第4行在RINEX 3.04中不存在（只有3行）
            # 因此gamma/tau/dtau = NaN（暂时忽略）
            valid = []
            for j, v in enumerate(all_nums):
                if j % 4 != 3:  # 跳过每行第4列（spare）
                    valid.append(v)
            for k, name in enumerate(GLONASS_12):
                params[f'GLO_{name}'] = valid[k] if k < len(valid) else float('nan')
        if sv_id not in sv_data:
            sv_data[sv_id] = []
        sv_data[sv_id].append(params)
        n_epochs += 1
        i += n_lines

    # 统计
    systems = {}
    for sv_id in sorted(sv_data.keys()):
        sc = sv_id[0]
        systems[sc] = systems.get(sc, 0) + 1
    print(f"  历元: {n_epochs}个, 卫星: {len(sv_data)}颗")
    for sc in sorted(systems):
        print(f"    {SYS_NAME.get(sc,sc)}({sc}): {systems[sc]}颗")

    return header, sv_data


# ============================================================
# 位置计算
# ============================================================

def compute_position(sv_data, epoch_dt):
    """
    计算所有卫星在指定历元的ECEF坐标

    算法：
      1. 对每颗卫星找最近星历
      2. 计算GPS TOW
      3. 调用对应算法（开普勒或GLONASS XYZ）
    """
    gps_week, gps_tow = utc_to_gps_tow(epoch_dt)
    results = []

    for sv_id in sorted(sv_data.keys()):
        sat_list = sv_data[sv_id]
        # 找时间最近的星历
        nearest = min(sat_list,
                     key=lambda p: abs((p['epoch_dt'] - epoch_dt).total_seconds()))
        sys_char = sv_id[0]

        if sys_char in ('G','C','E','I','J','S'):
            prefix = PREFIX_MAP.get(sys_char, 'GPS')
            toe = nearest.get(f'{prefix}_Toe', 0.0)
            dt = gps_tow - toe  # 时间差（秒）
            X, Y, Z = compute_satellite_ecef(nearest, prefix, dt)
        elif sys_char == 'R':
            X, Y, Z = compute_glonass_ecef(nearest, epoch_dt)
        else:
            X, Y, Z = float('nan'), float('nan'), float('nan')

        if not math.isnan(X):
            results.append({
                'sv_id': sv_id,
                'system': SYS_NAME.get(sys_char, sys_char),
                'X': X, 'Y': Y, 'Z': Z,
                'age': abs((nearest['epoch_dt'] - epoch_dt).total_seconds())
            })

    return results

class MultiConstellationNavParser:
    """兼容旧API的包装器
    sv_data = {sv_id: [params_dict, ...]} — 每个卫星一个key，value是各历元参数列表
    """
    def __init__(self, filepath_or_data):
        if isinstance(filepath_or_data, dict):
            self._data = filepath_or_data
        elif isinstance(filepath_or_data, tuple):
            self._header, self._data = filepath_or_data
        else:
            self._header, self._data = parse_nav(filepath_or_data)
    
    def sv_ids(self):
        return sorted(self._data.keys())
    
    def epoch_times(self):
        all_times = set()
        for sat_list in self._data.values():
            for p in sat_list:
                all_times.add(p.get('epoch_dt'))
        return sorted(all_times)
    
    def epoch_index(self, sow):
        times = self.epoch_times()
        if not times:
            return -1
        ref = datetime(1980, 1, 6) + timedelta(seconds=float(sow))
        closest = min(times, key=lambda t: abs((t - ref).total_seconds()))
        return times.index(closest)




# ============================================================
# 主程序
# ============================================================

if __name__ == '__main__':
    test_file = '/home/gnss/data/0401dong/brdm0910.26p'
    if len(sys.argv) > 1:
        test_file = sys.argv[1]

    print("="*60)
    print("RINEX 3.04 多星座NAV解析器 + 卫星位置计算 | v6")
    print("="*60)

    # ---- 解析 ----
    header, sv_data = parse_nav(test_file)

    # ---- 坐标计算 ----
    target_epoch = datetime(2026, 4, 1, 0, 0, 0, tzinfo=timezone.utc)
    print(f"\n[计算] 历元: {target_epoch}")
    results = compute_position(sv_data, target_epoch)

    print(f"\n{'='*60}")
    print(f"卫星ECEF坐标（WGS-84）")
    print(f"{'='*60}")
    print(f"{'卫星':<6} {'系统':<8} {'X (m)':>16} {'Y (m)':>16} {'Z (m)':>16}")
    print("-"*60)
    for r in results:
        print(f"{r['sv_id']:<6} {r['system']:<8} {r['X']:>16.2f} {r['Y']:>16.2f} {r['Z']:>16.2f}")
    print(f"\n共 {len(results)} 颗卫星（含{sum(1 for r in results if r['system']=='GLONASS')}颗GLONASS）")

    # ---- 验证GPS G01 ----
    print(f"\n{'='*60}")
    print("精度验证")
    print(f"{'='*60}")
    g01 = next((r for r in results if r['sv_id'] == 'G01'), None)
    if g01:
        r_geo = math.sqrt(g01['X']**2 + g01['Y']**2 + g01['Z']**2)
        print(f"  G01 (GPS): X={g01['X']:.2f}, Y={g01['Y']:.2f}, Z={g01['Z']:.2f}")
        print(f"    地心距离: {r_geo/1000:.1f} km（参考值: ~26600 km）")
        print(f"    星历时效: {g01['age']:.0f} 秒")
        print(f"  ✓ 距离在GPS轨道高度范围内" if 25000 < r_geo/1000 < 28000 else f"  ✗ 距离异常!")

    glo = [r for r in results if r['system'] == 'GLONASS']
    if glo:
        r_glo = math.sqrt(glo[0]['X']**2 + glo[0]['Y']**2 + glo[0]['Z']**2)
        print(f"\n  R01 (GLONASS): X={glo[0]['X']:.2f}, Y={glo[0]['Y']:.2f}, Z={glo[0]['Z']:.2f}")
        print(f"    地心距离: {r_glo/1000:.1f} km（参考值: ~25500 km）")
