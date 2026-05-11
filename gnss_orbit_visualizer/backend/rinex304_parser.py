#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""RINEX 3.04 Parser for GNSS data"""
import re, math, datetime

def parse_rinex304_file(filepath):
    """Parse RINEX 3.04 observation file."""
    try:
        with open(filepath, 'r', encoding='latin-1') as f:
            lines = f.readlines()
    except Exception as e:
        return {'error': str(e)}

    header = {}
    obs_types = {}
    satellites = []
    epochs = []

    i = 0
    while i < len(lines):
        line = lines[i]
        if 'RINEX VERSION' in line:
            header['version'] = line[:10].strip()
        elif 'TYPE' in line and 'OBSERVATION' in line:
            header['obs_type'] = line[:40].strip()
        elif 'SYS / # / OBS' in line or ('G' in line[0] if len(line)>0 else False):
            if line[0] in 'GREJCSI':
                sys_code = line[0]
                n_obs = int(line[3:6].strip())
                obs_types_line = ''.join(lines[i:i+math.ceil(n_obs/9)])
                obs_codes = [obs_types_line[j:j+3].strip() for j in range(7, 7+n_obs*3, 3)]
                obs_types[sys_code] = obs_codes
                i += math.ceil(n_obs/9) - 1
        elif line[0] == '>' and len(line) > 1:
            epoch_str = line[1:30].strip()
            try:
                year = int(epoch_str[0:4])
                month = int(epoch_str[4:7])
                day = int(epoch_str[7:10])
                hour = int(epoch_str[10:13])
                minute = int(epoch_str[13:16])
                second = float(epoch_str[16:26])
                flag = int(epoch_str[28:30].strip())
                if flag >= 2:
                    i += 1
                    continue
                epoch = datetime.datetime(year, month, day, hour, minute, int(second))
                epochs.append(epoch.isoformat())
                n_sat = int(line[30:33].strip())
                sat_lines = ''.join(lines[i+1:i+1+math.ceil(n_sat/12)])
                sv_list = [sat_lines[j:j+3].strip() for j in range(0, n_sat*3, 3)]
                for sv in sv_list:
                    sys_code = sv[0] if sv else '?'
                    satellites.append({'sv': sv, 'epoch': epoch.isoformat(), 'system': sys_code})
                i += math.ceil(n_sat/12)
            except Exception:
                pass
        i += 1

    header['obs_types'] = obs_types
    return {'header': header, 'satellites': satellites, 'epochs': epochs}
