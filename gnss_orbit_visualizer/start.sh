#!/bin/bash
cd "$(dirname "$0")/backend" || exit 1
pip install -q -r requirements.txt 2>/dev/null
uvicorn main:app --host 0.0.0.0 --port 8000 &
sleep 2
echo "Backend running at http://localhost:8000"
