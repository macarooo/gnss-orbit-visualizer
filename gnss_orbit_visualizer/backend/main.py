from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import sys, os, numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from rinex304_parser import parse_rinex304_file
from rinex_parser import parse_rinex_obs

app = FastAPI(title="GNSS Orbit Visualizer API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

class RINEXRequest(BaseModel):
    file_content: str
    filename: str

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
    a, f, b, e2 = 6378.1370, 1/298.257223563, 6378.1370*(1-1/298.257223563), 1-(6378.1370*(1-1/298.257223563)/6378.1370)**2
    lon = np.degrees(np.arctan2(y_km, x_km))
    p = np.sqrt(x_km**2 + y_km**2)
    lat = np.degrees(np.arctan2(z_km, p*(1-e2)))
    for _ in range(5):
        N = a / np.sqrt(1 - e2*np.sin(np.radians(lat))**2)
        lat = np.degrees(np.arctan2(z_km + e2*N*np.sin(np.radians(lat)), p))
    N = a / np.sqrt(1 - e2*np.sin(np.radians(lat))**2)
    alt = p/np.cos(np.radians(lat)) - N
    return lat, lon, alt

@app.get('/api/tle')
def get_tle(): return {'detail': 'TLE endpoint'}

@app.post('/api/process-rinex')
def process_rinex(req: RINEXRequest):
    import tempfile
    with tempfile.NamedTemporaryFile(suffix='_'+req.filename, delete=False, mode='wb') as tmp:
        tmp.write(req.file_content.encode('latin-1') if isinstance(req.file_content, str) else req.file_content)
        tmp_path = tmp.name
    try:
        result = parse_rinex304_file(tmp_path)
        if result and 'satellites' in result:
            positions = []
            for sat in result['satellites']:
                sv = sat.get('sv','')
                try:
                    from satellite_position import compute_position
                    pos = compute_position(sat, result.get('epochs',[]))
                    if pos and len(pos) >= 3:
                        lat, lon, alt = ecefToGeodetic(pos[0], pos[1], pos[2])
                        positions.append({'sv': sv, 'system': sv[:1] if sv else '?', 'x': pos[0], 'y': pos[1], 'z': pos[2], 'latitude': lat, 'longitude': lon, 'altitude_km': alt, 'epoch': sat.get('epoch','')})
                except: pass
            result['positions'] = positions
        os.unlink(tmp_path)
        return _clean(result)
    except Exception as e:
        if os.path.exists(tmp_path): os.unlink(tmp_path)
        raise HTTPException(status_code=500, detail=str(e))
