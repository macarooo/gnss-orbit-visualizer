/**
 * 主入口文件
 * 初始化并协调各个模块
 */

// 全局状态
const AppState = {
    isPlaying: false,
    timeMultiplier: 1,
    currentTime: new Date(),
    dataSource: 'tle',
    rinexSatellites: []
};

window.rinexSatellites = [];

// 初始化
function init() {
    const token = prompt('请输入 Cesium Ion Token (或留空使用公开token):');
    if (token !== null) {
        cesiumManager.init('cesiumContainer', token);
        uiController.init();
        if (window.GNSS_CONFIG.autoStart) {
            loadAllSatellites();
        }
    }
}

function loadAllSatellites() {
    if (typeof displaySatellites === 'function') {
        displaySatellites();
    }
}

// RINEX 上传处理
async function onRinexUpload(file) {
    const status = document.getElementById('uploadStatus');
    if (!status) return;
    status.textContent = '解析中...';

    try {
        const formData = new FormData();
        formData.append('file', file);
        const response = await fetch('http://localhost:8000/api/process-rinex', { method: 'POST', body: formData });
        const result = await response.json();
        if (result.satellites) {
            window.rinexSatellites = result.satellites;
            status.textContent = `解析成功: ${result.satellites.length} 颗卫星`;
            displayRinexSatellites(result.satellites);
        } else if (result.detail) {
            status.textContent = '错误: ' + result.detail;
        } else {
            status.textContent = '解析结果为空';
        }
    } catch (e) {
        status.textContent = '上传失败: ' + e.message;
    }
}

function displayRinexSatellites(satellites) {
    if (!cesiumManager || !cesiumManager.viewer) {
        console.warn('Cesium not initialized');
        return;
    }
    satellites.forEach(sat => {
        if (sat.latitude != null && sat.longitude != null) {
            cesiumManager.addEntity(sat.sv, {
                name: sat.sv,
                lat: sat.latitude,
                lon: sat.longitude,
                alt: sat.altitude_km || 20200,
                color: window.GNSS_CONFIG.colors[sat.system] || '#ffffff',
                size: 6
            });
        }
    });
}

// 启动
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
