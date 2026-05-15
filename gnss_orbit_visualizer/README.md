# 卫星轨道多源数据综合可视化系统

## 项目概述

| 项目 | 内容 |
|------|------|
| **项目名称** | GNSS Satellite Orbit Visualizer |
| **功能定位** | CesiumJS 三维地球 + 多源轨道数据可视化，支持 TLE、RINEX NAV、SP3 精密星历 |
| **前端地址** | http://192.168.0.56:10022/ |
| **后端地址** | http://192.168.0.56:10023/ |
| **前端端口** | 10022（http.server） |
| **后端端口** | 10023（uvicorn） |
| **技术栈** | CesiumJS 1.104 CDN + satellite.js（前端），FastAPI + SGP4/解析器（后端） |

---

## 目录结构

```
gnss_orbit_visualizer/
├── index.html                  ← 前端入口页面
├── css/
│   └── style.css               ← 深色科技风样式，15个 CSS 变量
├── js/
│   ├── main.js                 ← 前端主逻辑
│   ├── config.js               ← 配置文件
│   ├── cesium_manager.js       ← Cesium 地图管理类（40个方法）
│   ├── ui_controller.js        ← UI 控制器类（46个方法）
│   ├── satellite_data.js        ← 卫星数据管理类
│   └── orbit_calculator.js     ← SGP4 轨道计算器
├── backend/
│   ├── main.py                 ← FastAPI 主服务（9个 API 端点）
│   ├── rinex304_parser.py      ← RINEX 3.04 导航电文解析器（纯 Python）
│   ├── rinex_parser.py         ← RINEX 旧版解析器
│   └── requirements.txt        ← 后端依赖
├── start.sh                    ← 启动脚本（配置 8080/8000）
├── http_proxy.py               ← 前端代理（绕过 CORS）
└── requirements.txt            ← 依赖说明
```

---

## 功能清单

### 已完成

#### 数据源加载

| 功能 | 说明 |
|------|------|
| TLE 文件上传 | 上传 .tle/.txt，解析后缓存到后端 |
| TLE 卫星显示 | 加载全部 TLE 缓存中的卫星（292颗） |
| TLE 轨道线 | SGP4 轨道计算，贴地飞行 |
| TLE 地面轨迹 | 星下点轨迹线 |
| 多系统筛选 | GPS/GLONASS/Galileo/北斗独立开关 |
| Cesium Token 配置 | 首次加载弹窗，保存到 sessionStorage |

#### Cesium 三维地球

| 功能 | 说明 |
|------|------|
| Cesium 全球视图 | Cesium 1.104，暗色底图 |
| 时间轴播放控制 | 播放/暂停/速度选择（1x~1000x） |
| 时间滑块 | 手动拖动跳转时间 |
| 轨迹线开关 | showOrbits / showLabels |
| 飞向卫星 | flyToSatellite() |
| 卫星点击信息 | 位置/速度/高度 |
| 卫星搜索 | satSearch 过滤 |

#### RINEX 导航电文

| 功能 | 说明 |
|------|------|
| RINEX 文件上传 | 已有上传按钮和文件选择框 |
| RINEX 卫星列表 | 解析后列出卫星 |
| RINEX 轨道线 | 按系统分色（GPS 蓝/北斗绿/GLONASS 红/Galileo 橙） |

#### 实验性功能（代码存在，UI 未完成）

| 功能 | 状态 |
|------|------|
| SP3 精密星历解析 | window.parseSP3/displaySP3 已实现 |
| StateVector 仿真 | window.addStateVector/stateVectorToPosition 已实现 |
| 动态轨道轨迹线 | 播放时动态追加轨迹 |

---

### 未完成 / 有 Bug

| 功能 | 问题 | 优先级 |
|------|------|--------|
| RINEX 文件上传后显示"解析失败" | 后端 compute_position 偶发 NaN，JSON 序列化失败 | 🔴 高 |
| Cesium Ion Token 弹窗 | 无 Token 时弹出许可提示 | 🟡 中 |
| SP3 Tab 完整集成 | UI tab 存在但功能未和 cesium_manager 打通 | 🟡 中 |
| RINEX 解析速度慢 | BATCH_SIZE=2（应为5） | 🟢 低 |

---

## 后端 API 端点

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/` | 根路径（健康检查） |
| GET | `/api/satellites` | 获取全部 TLE 卫星列表 |
| GET | `/api/tle` | 获取 TLE 数据 |
| GET | `/api/position/{sat_id}` | 获取卫星实时位置 |
| GET | `/api/orbits/{sat_id}` | 获取卫星轨道 |
| GET | `/api/groundtrack/{sat_id}` | 获取卫星地面轨迹 |
| GET | `/api/params/{sat_id}` | 获取卫星轨道根数 |
| POST | `/api/refresh` | 刷新 TLE 数据 |
| GET | `/api/stats` | 获取统计信息 |
| POST | `/api/rinex/upload` | 上传 RINEX 文件 |
| GET | `/api/rinex/list` | 获取 RINEX 卫星列表 |

---

## 四大 GNSS 系统配色

| 系统 | 颜色 |
|------|------|
| GPS | #2563eb（蓝） |
| GLONASS | #dc2626（红） |
| Galileo | #d97706（橙） |
| 北斗/BDS | #16a34a（绿） |
