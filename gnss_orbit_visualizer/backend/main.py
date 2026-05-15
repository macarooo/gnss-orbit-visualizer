"""
卫星轨道后端服务
支持TLE数据获取、轨道计算、RINEX 3.04解析（纯Python解析器）
"""

from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict
from datetime import datetime, timedelta, timezone
import sgp4.api
from sgp4.api import Satrec, WGS72
from sgp4.conveniences import jday
from contextlib import asynccontextmanager
import asyncio
import math
import os
import tempfile
import sys

# ECEF → 经纬度转换（WGS-84椭球）
def ecef_to_geodetic(X, Y, Z):
    """ECEF (X,Y,Z 米) → 经纬度高度"""
    a = 6378137.0  # WGS-84 长半轴
    f = 1 / 298.257223563
    e2 = 2 * f - f * f  # 第一偏心率平方

    lon = math.atan2(Y, X)
    p = math.sqrt(X * X + Y * Y)
    lat = math.atan2(Z, p * (1 - e2))  # 初值

    for _ in range(10):  # 迭代收敛
        sin_lat = math.sin(lat)
        N = a / math.sqrt(1 - e2 * sin_lat * sin_lat)
        lat_new = math.atan2(Z + e2 * N * sin_lat, p)
        if abs(lat_new - lat) < 1e-12:
            lat = lat_new
            break
        lat = lat_new

    sin_lat = math.sin(lat)
    N = a / math.sqrt(1 - e2 * sin_lat * sin_lat)
    alt = p / math.cos(lat) - N
    return lat * 180 / math.pi, lon * 180 / math.pi, alt

# 导入RINEX 3.04解析器（纯Python，不依赖georinex）
sys.path.insert(0, os.path.dirname(__file__))
from rinex304_parser import (
    parse_nav, compute_position, PREFIX_MAP, SYS_NAME,
    LINES_PER_BLOCK, BROADCAST_30, GLONASS_12
)


# ============ 全局缓存 ============

tle_cache: Dict[str, Dict] = {
    "gps": {"data": [], "updated": None},
    "glonass": {"data": [], "updated": None},
    "galileo": {"data": [], "updated": None},
    "beidou": {"data": [], "updated": None},
}

rinex_nav_cache: Dict[str, Dict] = {}  # sv_id -> latest params


TLE_SOURCES = {
    "gps": "https://celestrak.org/NORAD/elements/gp.php?GROUP=gps-ops&FORMAT=tle",
    "glonass": "https://celestrak.org/NORAD/elements/gp.php?GROUP=gnss&FORMAT=tle",
    "galileo": "https://celestrak.org/NORAD/elements/gp.php?GROUP=galileo&FORMAT=tle",
    "beidou": "https://celestrak.org/NORAD/elements/gp.php?GROUP=beidou&FORMAT=tle",
}

SYSTEM_COLORS = {
    "gps": "#2563eb", "glonass": "#dc2626",
    "galileo": "#d97706", "beidou": "#16a34a",
}

SYSTEM_NAMES = {
    "gps": "GPS", "glonass": "GLONASS",
    "galileo": "Galileo", "beidou": "北斗",
}


@asynccontextmanager
async def lifespan(app: FastAPI):
    await fetch_all_tle()
    yield


app = FastAPI(
    title="卫星轨道多源数据综合可视化 API",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============ 数据模型 ============

class Satellite(BaseModel):
    id: int
    name: str
    tle1: str
    tle2: str
    system: str


class Position(BaseModel):
    longitude: float; latitude: float; altitude: float; velocity: float
    lon_deg: float; lat_deg: float


class OrbitalParams(BaseModel):
    inclination: float; raan: float; eccentricity: float
    argument_of_perigee: float; mean_anomaly: float; mean_motion: float
    period: float; semi_major_axis: float; altitude: float


# ============ TLE 获取 ============

async def fetch_tle(source: str, system: str) -> List[Satellite]:
    try:
        import httpx
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(source)
            response.raise_for_status()
            text = response.text
    except Exception as e:
        print(f"获取{system} TLE失败: {e}")
        return []

    lines = text.strip().split('\n')
    satellites = []; sat_id = 0
    for i in range(0, len(lines) - 2, 3):
        name = lines[i].strip(); line1 = lines[i + 1]; line2 = lines[i + 2]
        if len(line1) >= 69 and len(line2) >= 69 and len(line1) <= 72 and len(line2) <= 72:
            satellites.append(Satellite(id=sat_id, name=name, tle1=line1, tle2=line2, system=system))
            sat_id += 1
    return satellites


async def fetch_all_tle() -> Dict:
    import httpx
    async with httpx.AsyncClient(timeout=60.0) as client:
        tasks = [fetch_tle(TLE_SOURCES[sys], sys) for sys in TLE_SOURCES]
        results = await asyncio.gather(*tasks)
    for sys, sats in zip(TLE_SOURCES.keys(), results):
        tle_cache[sys]["data"] = sats
        tle_cache[sys]["updated"] = datetime.now()
    return {sys: tle_cache[sys]["data"] for sys in TLE_SOURCES}


# ============ 轨道计算 (SGP4) ============

def calculate_position(sat: Satellite, dt: datetime) -> Optional[Position]:
    try:
        satrec = sgp4.api.twoline2rv(sat.tle1, sat.tle2, WGS72)
        jd, fr = jday(dt.year, dt.month, dt.day, dt.hour, dt.minute, dt.second)
        error, position, velocity = satrec.propagate(jd, fr)
        if error != 0: return None
        gmst = sgp4.api.gstime(jd)
        lon, lat, alt = sgp4.api.eci_to_geodetic(position, gmst)
        vel_mag = (velocity.x**2 + velocity.y**2 + velocity.z**2) ** 0.5
        return Position(
            longitude=lon, latitude=lat, altitude=alt, velocity=vel_mag,
            lon_deg=lon * 180 / math.pi, lat_deg=lat * 180 / math.pi
        )
    except Exception as e:
        print(f"计算位置失败 {sat.name}: {e}")
        return None


def calculate_orbital_params(sat: Satellite) -> Optional[OrbitalParams]:
    try:
        satrec = sgp4.api.twoline2rv(sat.tle1, sat.tle2, WGS72)
        incl = satrec.inclo * 180 / math.pi
        raan = satrec.nodeo * 180 / math.pi
        ecc = satrec.ecco
        arg_p = satrec.argpo * 180 / math.pi
        mean_anom = satrec.mo * 180 / math.pi
        mean_mot = satrec.no_kozai * 1440 / (2 * math.pi)
        period = 1440 / mean_mot
        sma = ((period / (2 * math.pi / 1440)) ** 2) ** (1/3) * 6378.137
        return OrbitalParams(
            inclination=incl, raan=raan, eccentricity=ecc,
            argument_of_perigee=arg_p, mean_anomaly=mean_anom,
            mean_motion=mean_mot, period=period,
            semi_major_axis=sma, altitude=sma - 6378.137
        )
    except Exception as e:
        print(f"提取轨道参数失败: {e}")
        return None


# ============ RINEX API（纯Python解析器） ============

@app.post("/api/rinex/upload")
async def upload_rinex(file: UploadFile = File(...)):
    """上传并解析RINEX文件（纯Python解析器，支持RINEX 3.04全星座）"""
    try:
        content = await file.read()
        suffix = os.path.splitext(file.filename or '')[1] or '.rnx'
        if not suffix.startswith('.'):
            suffix = '.' + suffix
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(content)
            tmp_path = tmp.name

        try:
            header, sv_data = parse_nav(tmp_path)
            return process_rinex_result(header, sv_data)
        finally:
            os.unlink(tmp_path)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, f"RINEX解析失败: {str(e)}")


def _clean(val):
    """过滤NaN/Inf，JSON序列化时转为null"""
    if isinstance(val, float):
        if math.isnan(val) or math.isinf(val):
            return None
    return val


def process_rinex_result(header, sv_data) -> Dict:
    """处理RINEX解析结果"""
    systems = {}
    satellites = []
    now_utc = datetime.now(timezone.utc)

    # 一次性计算所有卫星位置（避免循环内重复计算）
    try:
        all_positions = {p['sv_id']: p for p in compute_position(sv_data, now_utc)}
    except Exception:
        all_positions = {}

    for sv_id in sorted(sv_data.keys()):
        sat_list = sv_data[sv_id]
        sys_char = sv_id[0]
        system_name = SYS_NAME.get(sys_char, sys_char)
        prefix = PREFIX_MAP.get(sys_char, sys_char)

        # 取最新历元的星历
        latest = max(sat_list, key=lambda p: p['epoch_dt'])
        pos = all_positions.get(sv_id)

        sat_info = {
            "sv_id": sv_id,
            "system": system_name,
            "prefix": prefix,
            "epoch_count": len(sat_list),
            "latest_epoch": latest['epoch_dt'].isoformat() if latest.get('epoch_dt') else None,
        }

        # 提取关键广播参数
        if sys_char in ('G', 'C', 'E', 'I', 'J', 'S'):
            for param in ['sqrtA', 'e', 'M0', 'omega', 'Omega0', 'i0', 'DeltaN', 'IDOT']:
                key = f'{prefix}_{param}'
                if key in latest:
                    sat_info[param.lower()] = _clean(latest.get(key))
            toe_key = f'{prefix}_Toe'
            if toe_key in latest:
                sat_info['toe'] = _clean(latest.get(toe_key))
        elif sys_char == 'R':
            for param in ['X', 'Y', 'Z']:
                key = f'GLO_{param}'
                if key in latest:
                    sat_info[param.lower()] = _clean(latest.get(key))

        # ECEF → 经纬度
        if pos:
            x, y, z = pos.get('X'), pos.get('Y'), pos.get('Z')
            if x is not None and y is not None and z is not None and not (math.isnan(x) or math.isnan(y) or math.isnan(z)):
                sat_info['x'] = _clean(x)
                sat_info['y'] = _clean(y)
                sat_info['z'] = _clean(z)
                sat_info['altitude_km'] = _clean(math.sqrt(x**2 + y**2 + z**2) / 1000.0)
                # ECEF → 经纬度（WGS-84）
                lat_deg, lon_deg, alt = ecef_to_geodetic(x, y, z)
                sat_info['latitude'] = _clean(lat_deg)
                sat_info['longitude'] = _clean(lon_deg)
                sat_info['altitude'] = _clean(alt)

        satellites.append(sat_info)

        # 统计各系统
        systems[sys_char] = systems.get(sys_char, 0) + 1

    return {
        "file_type": f"N (导航星历) - RINEX {header.get('version', '?')}",
        "system": header.get('system', 'N'),
        "leap_seconds": header.get('leap_seconds', 18),
        "total_satellites": len(sv_data),
        "total_epochs": sum(len(v) for v in sv_data.values()),
        "by_system": {SYS_NAME.get(k, k): v for k, v in sorted(systems.items())},
        "satellites": satellites,
    }


# ============ API 路由 ============

@app.get("/")
async def root():
    return {"name": "卫星轨道多源数据综合可视化 API", "version": "1.0.0"}


@app.get("/api/tle")
async def get_tle(system: Optional[str] = None, refresh: bool = False):
    if refresh: await fetch_all_tle()
    if system:
        if system not in tle_cache: raise HTTPException(400, f"未知系统: {system}")
        sats = tle_cache[system]["data"]; updated = tle_cache[system]["updated"]
    else:
        all_sats = []
        for sys in tle_cache: all_sats.extend(tle_cache[sys]["data"])
        sats = all_sats; updated = datetime.now()
    return {"count": len(sats), "updated": updated.isoformat() if updated else None,
            "satellites": [sat.model_dump() for sat in sats]}


@app.get("/api/satellites")
async def get_satellites():
    all_sats = []
    for sys in tle_cache:
        for sat in tle_cache[sys]["data"]:
            params = calculate_orbital_params(sat)
            all_sats.append({
                "id": sat.id, "name": sat.name, "system": sat.system,
                "color": SYSTEM_COLORS[sys], "name_cn": SYSTEM_NAMES[sys],
                "inclination": params.inclination if params else None,
                "altitude": params.altitude if params else None,
            })
    return {"count": len(all_sats), "satellites": all_sats}


@app.get("/api/position/{sat_id}")
async def get_position(sat_id: int, time: Optional[str] = None):
    sat = None
    for sys in tle_cache:
        for s in tle_cache[sys]["data"]:
            if s.id == sat_id: sat = s; break
        if sat: break
    if not sat: raise HTTPException(404, f"未找到卫星 ID: {sat_id}")
    dt = datetime.fromisoformat(time.replace('Z', '+00:00')) if time else datetime.now()
    position = calculate_position(sat, dt)
    if not position: raise HTTPException(500, "位置计算失败")
    return {"satellite_id": sat_id, "name": sat.name, "system": sat.system,
            "time": dt.isoformat(), "position": position.model_dump()}


@app.get("/api/orbits/{sat_id}")
async def get_orbit_positions(sat_id: int, duration: int = 720, step: int = 60):
    sat = None
    for sys in tle_cache:
        for s in tle_cache[sys]["data"]:
            if s.id == sat_id: sat = s; break
        if sat: break
    if not sat: raise HTTPException(404, f"未找到卫星 ID: {sat_id}")
    now = datetime.now(); positions = []
    for i in range(0, duration * 60, step):
        dt = now + timedelta(seconds=i)
        pos = calculate_position(sat, dt)
        if pos: positions.append({"time": dt.isoformat(), **pos.model_dump()})
    return {"satellite_id": sat_id, "name": sat.name, "system": sat.system,
            "start_time": now.isoformat(), "positions": positions}


@app.get("/api/groundtrack/{sat_id}")
async def get_groundtrack(sat_id: int, duration: int = 360, step: int = 60):
    sat = None
    for sys in tle_cache:
        for s in tle_cache[sys]["data"]:
            if s.id == sat_id: sat = s; break
        if sat: break
    if not sat: raise HTTPException(404, f"未找到卫星 ID: {sat_id}")
    now = datetime.now(); track = []
    for i in range(0, duration * 60, step):
        dt = now + timedelta(seconds=i)
        pos = calculate_position(sat, dt)
        if pos: track.append({"time": dt.isoformat(), "longitude": pos.longitude,
                              "latitude": pos.latitude, "lon_deg": pos.lon_deg, "lat_deg": pos.lat_deg})
    return {"satellite_id": sat_id, "name": sat.name, "system": sat.system,
            "start_time": now.isoformat(), "track": track}


@app.get("/api/params/{sat_id}")
async def get_orbital_params(sat_id: int):
    sat = None
    for sys in tle_cache:
        for s in tle_cache[sys]["data"]:
            if s.id == sat_id: sat = s; break
        if sat: break
    if not sat: raise HTTPException(404, f"未找到卫星 ID: {sat_id}")
    params = calculate_orbital_params(sat)
    if not params: raise HTTPException(500, "轨道参数计算失败")
    return {"satellite_id": sat_id, "name": sat.name, "system": sat.system,
            "params": params.model_dump()}


@app.post("/api/refresh")
async def refresh_tle():
    await fetch_all_tle()
    return {"message": "TLE已刷新", "updated": datetime.now().isoformat()}


@app.get("/api/stats")
async def get_stats():
    stats = {}
    for sys in tle_cache:
        stats[sys] = {"count": len(tle_cache[sys]["data"]),
                       "updated": tle_cache[sys]["updated"].isoformat() if tle_cache[sys]["updated"] else None}
    return {"total": sum(s["count"] for s in stats.values()), "systems": stats}


@app.get("/api/rinex/list")
async def list_rinex_sats():
    return {"satellites": list(rinex_nav_cache.keys()), "count": len(rinex_nav_cache)}


# ============ 主程序 ============

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
