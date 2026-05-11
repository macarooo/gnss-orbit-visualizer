#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Generic RINEX parser"""
def parse_rinex_obs(filepath):
    with open(filepath, 'r', encoding='latin-1') as f:
        return {'data': f.read()}
