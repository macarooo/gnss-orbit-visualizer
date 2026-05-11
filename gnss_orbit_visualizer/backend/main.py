#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""FastAPI backend for GNSS orbit visualization"""
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import sys, os, math, numpy as np
from typing import List

sys.path.insert(0, os.path.dirname(__file__))

app = FastAPI(title='GNSS Orbit Visualizer API')
app.add_middleware(CORSMiddleware, allow_origins=['*'], allow_credentials=True, allow_methods=['*'], allow_headers=['*'])

def _clean(obj):
    if isinstance(obj, dict):
        return {k: _clean(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [_clean(v) for v in obj]
    elif isinstance(obj, float):
        if obj != obj or abs(obj) == float('inf'):
            return None
        return obj
    return obj

def ecefToGeodetic(x_km, y_km, z_km):
    a = 6378.1370
    f = 1 / 298.257223563
    b = a * (1 - f)
    e2 = 1 - (b/a)**2
    lon = np.degrees(np.arctan2(y_km, x_km))
    p = np.sqrt(x_km**2 + y_km**2)
    lat = np.degrees(np.arctan2(z_km, p*(1-e2)))
    for _ in range(5):
        N = a / np.sqrt(1 - e2*np.sin(np.radians(lat))**2)
        lat = np.degrees(np.arctan2(z_km + e2*N*np.sin(np.radians(lat)), p))
    N = a / np.sqrt(1 - e2*np.sin(np.radians(lat))**2)
    alt = p/np.cos(np.radians(lat)) - N if np.cos(np.radians(lat)) != 0 else 0
    return lat, lon, alt

@app.get('/api/tle')
def get_tle():
    return {'detail': 'Use frontend to load TLE data'}

@app.post('/api/process-rinex')
async def process_rinex(file: UploadFile = File(...)):
    import tempfile
    content = await file.read()
    with tempfile.NamedTemporaryFile(suffix='_'+file.filename, delete=False, mode='wb') as tmp:
        tmp.write(content)
        tmp_path = tmp.name
    try:
        from rinex304_parser import parse_rinex304_file
        result = parse_rinex304_file(tmp_path)
        if result and 'satellites' in result:
            positions = []
            for sat in result['satellites']:
                sv = sat.get('sv','')
                sys_code = sv[:1] if sv else '?'
                try:
                    from satellite_position import compute_position
                    pos = compute_position(sat, result.get('epochs',[]))
                    if pos and len(pos) >= 3:
                        lat, lon, alt = ecefToGeodetic(pos[0], pos[1], pos[2])
                        positions.append({'sv': sv, 'system': sys_code, 'x': pos[0], 'y': pos[1], 'z': pos[2], 'latitude': lat, 'longitude': lon, 'altitude_km': alt, 'epoch': sat.get('epoch','')})
                except Exception as e:
                    pass
            result['positions'] = positions
        os.unlink(tmp_path)
        return _clean(result)
    except Exception as e:
        if os.path.exists(tmp_path): os.unlink(tmp_path)
        raise HTTPException(status_code=500, detail=str(e))
