/**
 * 配置文件
 */
const CONFIG = {
    // API配置
    apiBase: 'http://192.168.0.56:10023',  // 后端API
    cesiumIonToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',  // Cesium Ion令牌（已内置）
    
    // Cesium 设置
    cesium: {
        homeButton: false,
        sceneModePicker: false,
        navigationHelpButton: false,
        animation: true,
        timeline: true,
        fullscreenButton: false,
        vrButton: false,
        infoBox: true,
        selectionIndicator: true,
        shadows: false,
        shouldAnimate: true
    },
    
    // TLE 数据源
    tleSources: {
        gps: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=gps-ops&FORMAT=tle',
        glonass: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=gnss&FORMAT=tle',
        galileo: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=galileo&FORMAT=tle',
        beidou: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=beidou&FORMAT=tle'
    },
    
    // 卫星系统颜色
    systemColors: {
        gps: '#2563eb',
        glonass: '#dc2626',
        galileo: '#d97706',
        beidou: '#16a34a',
        beidou_geo: '#15803d',
        beidou_igso: '#22c55e',
        beidou_meo: '#86efac'
    },
    
    // 卫星系统名称
    systemNames: {
        gps: 'GPS',
        glonass: 'GLONASS',
        galileo: 'Galileo',
        beidou: '北斗'
    },
    
    // 轨道显示设置
    orbitDisplay: {
        leadTime: 720,
        trailTime: 360,
        width: 2,
        resolution: 60
    },
    
    // 时间设置
    time: {
        startOffset: -24 * 3600,
        endOffset: 24 * 3600,
        playInterval: 1000
    },
    
    // 地图设置
    map: {
        initialLongitude: 116.4,
        initialLatitude: 39.9,
        initialHeight: 20000000,
        maxHeight: 50000000,
        minHeight: 1000
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
}
