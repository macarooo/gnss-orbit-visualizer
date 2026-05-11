#!/bin/bash
cd "$(dirname "$0")/backend" || exit 1
pip install -q -r requirements.txt 2>/dev/null
uvicorn main:app --host 0.0.0.0 --port 8000 &
sleep 2
cd ../..
python3 -m http.server 8080 &
echo "Backend: http://localhost:8000"
echo "Frontend: http://localhost:8080"
