"""
RINEX 导航星历文件解析器
支持 RINEX 2.10/2.11/3.00 格式的 N 文件（GPS 导航消息）
"""

from pydantic import BaseModel
from typing import List, Optional, Dict
from datetime import datetime
import math


class RinexNav(BaseModel):
    """单条星历数据"""
    prn: int              # 卫星PRN编号 (1-32)
    year: int
    month: int
    day: int
    hour: int
    minute: int
    second: float
    # 广播轨道 - 最小一组
    sv_clock_bias: float       # 卫星时钟偏差 (秒)
    sv_clock_drift: float      # 卫星时钟漂移 (秒/秒)
    sv_clock_drift_rate: float # 卫星时钟漂移率 (秒/秒²)
    toe: float                 # 星历参考时间 (秒)
    sqrt_a: float             # 轨道长半轴的平方根 (sqrt(m))
    e: float                  # 离心率
    omega: float              # 近地点角距 (弧度)
    delta_n: float            # 平均角速度修正 (弧度/秒)
    m0: float                 # 参考时刻平近点角 (弧度)
    omega0: float             # 参考时刻升交点赤经 (弧度)
    omega_dot: float          # 升交点赤经变化率 (弧度/秒)
    i0: float                 # 参考时刻轨道倾角 (弧度)
    i_dot: float              # 轨道倾角变化率 (弧度/秒)
    ecc: float                # 离心率 (同上e)
    a: float                  # 半长轴 (m) 从 sqrt_a 计算
    # 可选：其他参数
    cuc: Optional[float] = None
    cus: Optional[float] = None
    crc: Optional[float] = None
    crs: Optional[float] = None
    cic: Optional[float] = None
    cis: Optional[float] = None


class RinexParser:
    """RINEX 导航文件解析器"""

    def __init__(self):
        self.records: List[RinexNav] = []
        self.header: Dict = {}

    def parse_file(self, filepath: str) -> List[RinexNav]:
        """解析RINEX导航文件"""
        with open(filepath, 'r') as f:
            content = f.read()
        return self.parse_string(content)

    def parse_string(self, content: str) -> List[RinexNav]:
        """解析RINEX导航文件字符串"""
        lines = content.split('\n')
        
        # 解析头部
        header_end = self._parse_header(lines)
        
        # 解析数据记录
        self.records = []
        i = header_end
        
        while i < len(lines):
            line = lines[i].strip()
            if not line:
                i += 1
                continue
            
            # 检测是否是PRN行 (格式: PRN yyMMdddd ...)
            if self._is_prn_line(line):
                record = self._parse_record(lines, i)
                if record:
                    self.records.append(record)
                i += 8  # 每条记录8行
            else:
                i += 1
        
        return self.records

    def _is_prn_line(self, line: str) -> bool:
        """判断是否是PRN数据行"""
        if len(line) < 2:
            return False
        # PRN行以 "PRN" 开头，或以数字开头（如 " 1 24 01 15 00 00  0.1234567890123e-..."
        try:
            parts = line.split()
            if len(parts) < 3:
                return False
            # 第一个非空应该是 PRN 或 数字
            first = parts[0]
            if first == 'PRN':
                return True
            # 可能是 " 1 24 01 15 00 00 ..."
            prn = int(first) if first.isdigit() else None
            if prn and 1 <= prn <= 32:
                return True
        except:
            pass
        return False

    def _parse_header(self, lines: List[str]) -> int:
        """解析RINEX头部，返回数据开始行号"""
        i = 0
        while i < len(lines):
            line = lines[i]
            if 'END OF HEADER' in line:
                return i + 1
            # 解析关键头部信息
            if 'RINEX VERSION' in line:
                self.header['version'] = line[:9].strip()
                self.header['filetype'] = line[20:40].strip()
            i += 1
        return i

    def _parse_record(self, lines: List[str], start: int) -> Optional[RinexNav]:
        """解析单条星历记录 (8行)"""
        try:
            # 第一行: PRN, 年月日时分秒, 卫星时钟参数
            line0 = lines[start]
            
            # 解析PRN (卫星编号)
            prn = int(line0[0:2].strip())
            
            # 解析时间 (年/月/日/时/分/秒)
            year = int(line0[2:5].strip())
            month = int(line0[5:8].strip())
            day = int(line0[8:11].strip())
            hour = int(line0[11:14].strip())
            minute = int(line0[14:17].strip())
            second = float(line0[17:22].strip())
            
            # 处理两位年份
            if year < 80:
                year += 2000
            else:
                year += 1900
            
            # 卫星时钟参数
            sv_clock_bias = float(line0[22:38].strip())
            sv_clock_drift = float(line0[38:54].strip())
            sv_clock_drift_rate = float(line0[54:70].strip())
            
            # 第二行: 广播轨道 - 半长轴平方根, 离心率
            line1 = lines[start + 1]
            sqrt_a = float(line1[0:22].strip())
            e = float(line1[22:44].strip())
            # 第三行: 近地点角距, 角速度修正, 参考时刻平近点角
            line2 = lines[start + 2]
            omega = float(line2[0:22].strip())
            delta_n = float(line2[22:44].strip())
            m0 = float(line2[44:66].strip())
            
            # 第四行: 升交点赤经, 倾角, 离心率 (重复), 近地点幅角
            line3 = lines[start + 3]
            omega0 = float(line3[0:22].strip())
            i0 = float(line3[22:44].strip())
            # 第四行的e和omega
            line3_2 = lines[start + 4]
            ecc_check = float(line3_2[0:22].strip())  # 离心率重复
            omega_dot = float(line3_2[22:44].strip())
            
            # 第五行: 倾角变化率
            line4 = lines[start + 4] if start + 4 < len(lines) else lines[start + 3]
            i_dot = float(line4[44:66].strip()) if len(line4) > 66 else 0.0
            
            # 第六行: 星历参考时间, cuc, ecc, cus
            line5 = lines[start + 5]
            toe = float(line5[0:22].strip())
            cuc = float(line5[22:44].strip())
            ecc_from5 = float(line5[44:66].strip())
            cus = float(line5[66:86].strip()) if len(line5) > 66 else 0.0
            
            # 第七行: crc, crs, cic, cis
            line6 = lines[start + 6]
            crc = float(line6[0:22].strip())
            crs = float(line6[22:44].strip())
            cic = float(line6[44:66].strip())
            cis = float(line6[66:86].strip()) if len(line6) > 66 else 0.0
            
            # 第八行: toe (重复), i0 (重复), omega0 (重复), omega (重复)
            line7 = lines[start + 7]
            
            # 计算半长轴 a = (sqrt_a)^2
            a = sqrt_a * sqrt_a
            
            return RinexNav(
                prn=prn,
                year=year,
                month=month,
                day=day,
                hour=hour,
                minute=minute,
                second=second,
                sv_clock_bias=sv_clock_bias,
                sv_clock_drift=sv_clock_drift,
                sv_clock_drift_rate=sv_clock_drift_rate,
                toe=toe,
                sqrt_a=sqrt_a,
                e=e,
                omega=omega,
                delta_n=delta_n,
                m0=m0,
                omega0=omega0,
                omega_dot=omega_dot,
                i0=i0,
                i_dot=i_dot,
                ecc=e,
                a=a,
                cuc=cuc,
                cus=cus,
                crc=crc,
                crs=crs,
                cic=cic,
                cis=cis
            )
        except Exception as ex:
            print(f"解析星历记录失败: {ex}")
            return None

    def get_latest_for_each_sat(self) -> Dict[int, RinexNav]:
        """获取每颗卫星最新的一条星历"""
        latest = {}
        for rec in self.records:
            key = rec.prn

            if key not in latest:
                # 比较时间
                t1 = datetime(rec.year, rec.month, rec.day, rec.hour, rec.minute, int(rec.second))
                latest[key] = (t1, rec)
            else:
                t2 = datetime(latest[key][0].year, latest[key][0].month, latest[key][0].day, 
                             latest[key][0].hour, latest[key][0].minute, int(latest[key][0].second))
                t1 = datetime(rec.year, rec.month, rec.day, rec.hour, rec.minute, int(rec.second))
                if t1 > t2:
                    latest[key] = (t1, rec)
        return {k: v[1] for k, v in latest.items()}


# ============ 简单测试 ============

if __name__ == '__main__':
    import sys
    if len(sys.argv) > 1:
        parser = RinexParser()
        records = parser.parse_file(sys.argv[1])
        print(f"解析到 {len(records)} 条星历")
        if records:
            r = records[0]
            print(f"第一条: PRN{r.prn}, {r.year}/{r.month}/{r.day} {r.hour}:{r.minute}:{r.second}")
            print(f"  半长轴: {r.a/1000:.2f} km")
            print(f"  离心率: {r.e:.10f}")
            print(f"  倾角: {math.degrees(r.i0):.4f}°")
