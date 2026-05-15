#!/bin/bash
# 启动脚本 - 启动前后端服务

cd "$(dirname "$0")"

echo "=== 卫星轨道可视化系统启动 ==="
echo ""

# 启动后端 (8000端口)
if lsof -i:8000 &>/dev/null; then
    echo "[后端] 8000端口已被占用，跳过"
else
    echo "[后端] 启动 FastAPI 服务..."
    cd backend
    python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 &
    cd ..
    sleep 2
fi

# 启动前端 (8080端口)
if lsof -i:8080 &>/dev/null; then
    echo "[前端] 8080端口已被占用，跳过"
else
    echo "[前端] 启动 HTTP 服务..."
    python3 -m http.server 8080 &
    sleep 1
fi

echo ""
echo "=== 启动完成 ==="
echo "前端: http://localhost:8080"
echo "后端: http://localhost:8000"
echo "API文档: http://localhost:8000/docs"
echo ""
