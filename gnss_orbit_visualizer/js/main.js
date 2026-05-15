/**
 * 主入口文件
 * 初始化并协调各个模块
 */

// 全局状态
const AppState = {
    isPlaying: false,
    timeMultiplier: 1,
    currentTime: new Date(),
    displayOptions: { orbits: true, labels: true, groundTrack: true, coverage: false }
};

window.rinexSatellites = [];
window.stateVectorSatellites = [];
window.currentSatelliteData = [];

async function init() {
    console.log('初始化卫星轨道可视化系统...');
    try {
        showLoading('正在初始化Cesium...');
        const cesiumReady = await cesiumManager.init('cesiumContainer', CONFIG.cesiumIonToken);
        if (!cesiumReady) throw new Error('Cesium初始化失败');

        showLoading('正在加载轨道计算器...');
        const calcReady = await orbitCalculator.init();
        if (!calcReady) throw new Error('轨道计算器初始化失败');

        showLoading('正在初始化UI...');
        uiController.init();
        bindGlobalCallbacks();
        startFrameRateUpdate();
        startTimeUpdate();
        console.log('初始化完成');
        hideLoading();
    } catch (error) {
        console.error('初始化错误:', error);
        hideLoading();
        const detail = document.getElementById('satelliteDetail');
        if (detail) detail.innerHTML = `<p style="color:#ff6b6b">初始化失败: ${error.message}</p>`;
    }
}

function showLoading(text) {
    const overlay = document.getElementById('loadingOverlay');
    const textEl = document.getElementById('loadingText');
    if (overlay) { overlay.style.display = 'flex'; if (textEl) textEl.textContent = text || '加载中...'; }
}

function hideLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.style.display = 'none';
}

function bindGlobalCallbacks() {
    window.onPlay = () => { AppState.isPlaying = true; cesiumManager.play(); };
    window.onPause = () => { AppState.isPlaying = false; cesiumManager.pause(); };
    window.onSpeedChange = (speed) => { AppState.timeMultiplier = speed; cesiumManager.setTimeMultiplier(speed); };
    window.onTimeSliderChange = (value) => {
        const now = new Date();
        const offset = (value - 50) / 50 * CONFIG.time.startOffset;
        const newTime = new Date(now.getTime() + offset * 1000);
        AppState.currentTime = newTime;
        cesiumManager.setTime(newTime);
        uiController.updateTimeDisplay(newTime);
    };
    window.onSystemVisibilityChange = async () => { await displaySatellites(); };
    window.onDisplayOptionChange = () => { updateDisplayOptions(); };
    window.onRefresh = async () => { await refreshData(); };
    window.onDataSourceChange = async (source) => { await refreshData(source); };
    window.onSatelliteSelect = (satellite) => { uiController.selectSatellite(satellite); cesiumManager.flyToSatellite(satellite.id); };
    window.onSatelliteSearch = (query) => { const results = satelliteData.searchSatellites(query); uiController.updateSatelliteList(results); };

    window.onRinexUpload = async (files) => {
        if (!files || files.length === 0) return;
        const file = files[0];
        console.log('上传RINEX文件:', file.name);
        showLoading('正在解析RINEX文件...');
        try {
            const formData = new FormData();
            formData.append('file', file);
            const response = await fetch(`${CONFIG.apiBase}/api/rinex/upload`, { method: 'POST', body: formData });
            if (!response.ok) throw new Error(`上传失败: ${response.status}`);
            const result = await response.json();
            console.log('RINEX解析结果:', result);
            window.rinexSatellites = result.satellites || [];
            if (window.rinexSatellites.length === 0) { hideLoading(); alert('RINEX文件中未解析到卫星数据'); return; }
            displayRinexSatellites();
            showLoading(`正在生成 ${window.rinexSatellites.length} 颗卫星轨道...`);
            await displayAllRinexOrbits();
            uiController.updateStatus({ dataSource: `RINEX (${result.unique_satellites || window.rinexSatellites.length}颗)` });
            showLoading(`解析成功！${window.rinexSatellites.length}颗卫星，轨道已生成`);
            setTimeout(hideLoading, 2000);
        } catch (error) {
            console.error('RINEX上传失败:', error);
            hideLoading();
            alert('RINEX解析失败: ' + error.message);
        }
    };

    window.onTokenSet = (token) => { CONFIG.cesiumIonToken = token; localStorage.setItem('cesiumIonToken', token); };

    window.onTleUpload = async (files) => {
        if (!files || files.length === 0) return;
        const file = files[0];
        console.log('上传TLE文件:', file.name);
        showLoading('正在解析TLE文件...');
        try {
            const loaded = await satelliteData.loadTLEFromFile(file);
            if (!loaded) { hideLoading(); alert('TLE文件解析失败或未找到有效卫星数据'); return; }
            cesiumManager.clearAll?.();
            await displaySatellites();
            uiController.updateSatelliteList(satelliteData.satellites);
            uiController.updateStatus({ dataSource: `TLE (${satelliteData.satellites.length}颗)`, updateTime: new Date().toLocaleTimeString() });
            hideLoading();
        } catch (error) {
            console.error('TLE上传失败:', error);
            hideLoading();
            alert('TLE解析失败: ' + error.message);
        }
    };
}

async function displaySatellites() {
    if (!cesiumManager.viewer) { console.warn('Cesium viewer 未就绪'); return; }
    const toRemove = [];
    cesiumManager.viewer.entities.values.forEach(entity => { if (entity.id && entity.id.startsWith('satellite-')) toRemove.push(entity); });
    toRemove.forEach(e => cesiumManager.viewer.entities.remove(e));
    const visibleSystems = uiController.visibleSystems;
    const filteredSatellites = satelliteData.satellites.filter(sat => visibleSystems[sat.system]);
    window.currentSatelliteData = filteredSatellites;
    let count = 0;
    for (const sat of filteredSatellites) {
        const position = orbitCalculator.getPosition(sat, AppState.currentTime);
        if (position) { cesiumManager.addSatellite(sat, position); count++; }
    }
    console.log(`显示 ${count} 颗TLE卫星`);
}

function displayRinexSatellites() {
    if (!cesiumManager.viewer) return;
    cesiumManager.clearRinex();
    cesiumManager.clearRinexOrbits();
    let rinexSats = window.rinexSatellites;
    if (!rinexSats || rinexSats.length === 0) {
        try {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', '/api/rinex/satellites', false);
            xhr.send();
            if (xhr.status === 200) { const apiData = JSON.parse(xhr.responseText); rinexSats = apiData.satellites || []; window.rinexSatellites = rinexSats; }
        } catch (e) { console.warn('从API获取RINEX卫星失败:', e); }
    }
    if (!rinexSats || rinexSats.length === 0) return;
    const visibleSystems = uiController.visibleSystems;
    const systemKeyMap = { 'GPS': 'gps', 'GLONASS': 'glonass', 'Galileo': 'galileo', 'BeiDou': 'beidou', 'IRNSS': 'irnss', 'QZSS': 'qzss', 'SBAS': 'sbas' };
    const BATCH_SIZE = 20;
    const filtered = rinexSats.filter(sat => {
        const sysKey = systemKeyMap[sat.system] || sat.system?.toLowerCase?.();
        if (!visibleSystems[sysKey]) return false;
        if (sat.latitude == null || sat.longitude == null) return false;
        return true;
    });
    let shownCount = 0;
    function renderBatch(startIdx) {
        const endIdx = Math.min(startIdx + BATCH_SIZE, filtered.length);
        for (let i = startIdx; i < endIdx; i++) {
            const sat = filtered[i];
            const sysKey = systemKeyMap[sat.system] || sat.system?.toLowerCase?.();
            const satId = sat.sv_id || sat.id;
            const satName = sat.name || sat.sv_id;
            const alt = (sat.altitude != null) ? parseFloat(sat.altitude) : 0;
            if (!cesiumManager._rinexSatData) cesiumManager._rinexSatData = {};
            cesiumManager._rinexSatData[satId] = sat;
            let satColorKey = sysKey;
            if (sat.system === 'BeiDou' || sysKey === 'beidou') {
                const satAlt = sat.altitude || 0;
                if (satAlt > 35000) { const latAbs = Math.abs(sat.latitude || 0); satColorKey = latAbs < 5 ? 'beidou_geo' : 'beidou_igso'; }
                else { satColorKey = 'beidou_meo'; }
            }
            cesiumManager.addRinexSatellite(satId, satName, satColorKey, { lonDeg: sat.longitude, latDeg: sat.latitude, altitude: alt });
            shownCount++;
        }
        if (endIdx < filtered.length) { requestAnimationFrame(() => renderBatch(endIdx)); }
        else { console.log(`显示 ${shownCount} 颗RINEX卫星`); }
    }
    renderBatch(0);
    const satList = filtered.map(sat => ({ id: sat.sv_id || sat.id, name: sat.name || sat.sv_id, system: systemKeyMap[sat.system] || sat.system?.toLowerCase?.() || sat.system }));
    uiController.updateSatelliteList(satList);
    uiController.updateStatus({ dataSource: `RINEX (${filtered.length}颗)`, updateTime: new Date().toLocaleTimeString() });
}

async function displayAllRinexOrbits() {
    if (!cesiumManager.viewer) return;
    cesiumManager.clearRinexOrbits();
    const rinexSats = window.rinexSatellites;
    if (!rinexSats || rinexSats.length === 0) return;
    const visibleSystems = uiController.visibleSystems;
    const systemKeyMap = { 'GPS': 'gps', 'GLONASS': 'glonass', 'Galileo': 'galileo', 'BeiDou': 'beidou', 'IRNSS': 'irnss', 'QZSS': 'qzss', 'SBAS': 'sbas' };
    const filtered = rinexSats.filter(sat => { const sysKey = systemKeyMap[sat.system] || sat.system?.toLowerCase?.(); return visibleSystems[sysKey]; });
    function isValidPoint(p) {
        if (p == null) return false;
        const { longitude, latitude, altitude } = p;
        if (!isFinite(longitude) || !isFinite(latitude) || !isFinite(altitude)) return false;
        if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return false;
        if (altitude <= 0 || altitude > 40_000_000) return false;
        return true;
    }
    function validateAndInterpolate(positions, stepMinutes = 30, maxGapRatio = 2.5) {
        if (positions.length < 2) return positions;
        const fixed = [positions[0]];
        for (let i = 1; i < positions.length; i++) {
            const prev = fixed[fixed.length - 1];
            const curr = positions[i];
            const prevT = typeof prev.time === 'number' ? prev.time : new Date(prev.time).getTime();
            const currT = typeof curr.time === 'number' ? curr.time : new Date(curr.time).getTime();
            const expectedInterval = stepMinutes * 60 * 1000;
            const actualGap = currT - prevT;
            if (actualGap <= expectedInterval * maxGapRatio) { fixed.push(curr); }
            else {
                const numToInsert = Math.min(2, Math.floor(actualGap / expectedInterval) - 1);
                for (let k = 1; k <= numToInsert; k++) {
                    const t = prevT + (currT - prevT) * (k / (numToInsert + 1));
                    fixed.push({ longitude: prev.longitude + (curr.longitude - prev.longitude) * (k / (numToInsert + 1)), latitude: prev.latitude + (curr.latitude - prev.latitude) * (k / (numToInsert + 1)), altitude: prev.altitude + (curr.altitude - prev.altitude) * (k / (numToInsert + 1)), epoch: t });
                }
                fixed.push(curr);
            }
        }
        return fixed;
    }
    const BATCH_SIZE = 2;
    let completed = 0, failed = 0;
    for (let i = 0; i < filtered.length; i += BATCH_SIZE) {
        const batch = filtered.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(batch.map(async (sat) => {
            const satId = sat.sv_id || sat.id;
            const sysKey = systemKeyMap[sat.system] || sat.system?.toLowerCase?.();
            let orbitType = 'meo', satColorKey = sysKey;
            if (sat.system === 'BeiDou' || sysKey === 'beidou') {
                const alt = sat.altitude || 0;
                if (alt > 35_000_000) { orbitType = 'geo'; satColorKey = 'beidou_geo'; }
                else if (alt > 21_550_000) { orbitType = 'igso'; satColorKey = 'beidou_igso'; }
                else { orbitType = 'meo'; satColorKey = 'beidou_meo'; }
            }
            const color = Cesium.Color.fromCssColorString(CONFIG.systemColors[satColorKey] || CONFIG.systemColors[sysKey] || '#ffffff');
            const resp = await fetch(`${CONFIG.apiBase}/api/rinex/orbit/${encodeURIComponent(satId)}?hours=6&step_minutes=30`);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            const positions = data.positions;
            if (!positions || positions.length < 2) throw new Error('positions 少于 2 个');
            const validPositions = positions.filter(isValidPoint);
            if (validPositions.length < 2) throw new Error(`有效点仅 ${validPositions.length} 个`);
            const interpolated = validateAndInterpolate(validPositions, 30, 2.5);
            const finalPositions = interpolated.filter(isValidPoint);
            if (finalPositions.length < 3) throw new Error(`插值后有效点仅 ${finalPositions.length} 个`);
            const cartesian = finalPositions.map(p => Cesium.Cartesian3.fromDegrees(p.longitude, p.latitude, p.altitude));
            const isGeo = orbitType === 'geo';
            cesiumManager.viewer.entities.add({
                id: `rinex-orbit-${satId}`, name: satId,
                polyline: {
                    positions: cartesian,
                    width: isGeo ? 4 : (CONFIG.orbitDisplay.width || 2),
                    material: new Cesium.PolylineGlowMaterialProperty({ glowPower: isGeo ? 0.5 : 0.2, color: color.withAlpha(isGeo ? 0.95 : 0.6) }),
                    followSurface: false
                },
                label: isGeo ? { text: `${satId} [GEO]`, font: 'bold 11px sans-serif', fillColor: Cesium.Color.fromCssColorString(CONFIG.systemColors.beidou_geo), outlineColor: Cesium.Color.WHITE, outlineWidth: 2, style: Cesium.LabelStyle.FILL_AND_OUTLINE, verticalOrigin: Cesium.VerticalOrigin.BOTTOM, pixelOffset: new Cesium.Cartesian2(0, -14), scaleByDistance: new Cesium.NearFarScalar(1e7, 1.0, 3e7, 0.5), disableDepthTestDistance: Number.POSITIVE_INFINITY } : undefined,
                description: `<b>系统:</b> ${sat.system} ${orbitType.toUpperCase()}<br><b>卫星:</b> ${satId}<br><b>高度:</b> ${(sat.altitude/1000).toFixed(0)} km`
            });
            return satId;
        }));
        for (const result of results) {
            if (result.status === 'fulfilled') { completed++; if (completed % 20 === 0) showLoading(`已生成 ${completed}/${filtered.length} 条轨道...`); }
            else { failed++; console.warn(`[orbit] 渲染失败:`, result.reason?.message || result.reason); }
        }
    }
    console.log(`RINEX轨道生成完成: ${completed} 成功, ${failed} 失败`);
}

function displayStateVectorSatellites() {
    if (!cesiumManager.viewer || !window.stateVectorSatellites || window.stateVectorSatellites.length === 0) return;
    window.stateVectorSatellites.forEach(sv => {
        const color = Cesium.Color.fromCssColorString(sv.color || '#ff00ff');
        const pos = stateVectorToPosition(sv);
        if (!pos) return;
        cesiumManager.viewer.entities.add({
            id: `sv-${sv.id}`, name: sv.name, orbitType: 'STATE_VECTOR', system: sv.system || 'sim',
            position: Cesium.Cartesian3.fromDegrees(pos.lonDeg, pos.latDeg, pos.altitude * 1000),
            point: { pixelSize: 11, color: color, outlineColor: Cesium.Color.MAGENTA, outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY },
            label: { text: sv.name, font: '11px sans-serif', fillColor: Cesium.Color.MAGENTA, outlineColor: Cesium.Color.BLACK, outlineWidth: 2, style: Cesium.LabelStyle.FILL_AND_OUTLINE, verticalOrigin: Cesium.VerticalOrigin.BOTTOM, pixelOffset: new Cesium.Cartesian2(0, -12) }
        });
    });
}

function stateVectorToPosition(sv) {
    try {
        const r = Math.sqrt(sv.x * sv.x + sv.y * sv.y + sv.z * sv.z);
        return { lonDeg: Math.atan2(sv.y, sv.x) * 180 / Math.PI, latDeg: Math.asin(sv.z / r) * 180 / Math.PI, altitude: r / 1000 - 6378.137 };
    } catch (e) { return null; }
}

window.addStateVector = function (sv) { sv.id = Date.now(); window.stateVectorSatellites = window.stateVectorSatellites || []; window.stateVectorSatellites.push(sv); displayStateVectorSatellites(); };

window.parseSP3 = async function (file) {
    const text = await file.text();
    const records = [], lines = text.split('\n');
    let epoch = null;
    for (const line of lines) {
        if (line.startsWith('EOF')) break;
        if (line.startsWith('##')) { const m = line.match(/(\d{4})\s+(\d+)\s+(\d+)\s+(\d+)\s+([.\d]+)/); if (m) epoch = new Date(Date.UTC(+m[1], +m[2]-1, +m[3], +m[4], 0, 0)); }
        if ((line.startsWith('PC') || line.startsWith('EP')) && epoch) {
            const id = line.substring(3,15).trim(), x = parseFloat(line.substring(15,30)), y = parseFloat(line.substring(30,45)), z = parseFloat(line.substring(45,60));
            if (!isNaN(x) && !isNaN(y) && !isNaN(z)) records.push({ id, epoch, x: x*1000, y: y*1000, z: z*1000 });
        }
    }
    const timePosPairs = {}, r2d = 180 / Math.PI;
    records.forEach(r => {
        if (!timePosPairs[r.id]) timePosPairs[r.id] = [];
        const gmst = (typeof satellite !== 'undefined') ? satellite.gstime(r.epoch) : 0;
        const lon = (typeof satellite !== 'undefined') ? satellite.degreesLong(Math.atan2(r.y, r.x) - gmst) : Math.atan2(r.y, r.x) * r2d;
        const lat = (typeof satellite !== 'undefined') ? satellite.degreesLat(Math.asin(r.z / Math.sqrt(r.x*r.x+r.y*r.y+r.z*r.z))) : Math.asin(r.z / Math.sqrt(r.x*r.x+r.y*r.y+r.z*r.z)) * r2d;
        const alt = Math.sqrt(r.x*r.x+r.y*r.y+r.z*r.z) / 1000 - 6378.137;
        timePosPairs[r.id].push({ time: Cesium.JulianDate.fromDate(r.epoch), position: Cesium.Cartesian3.fromDegrees(lon, lat, alt * 1000) });
    });
    return timePosPairs;
};

window.displaySP3 = function (timePosPairs, system = 'sp3', color = '#00ffff') {
    if (!cesiumManager.viewer) return;
    const cesiumColor = Cesium.Color.fromCssColorString(color);
    Object.entries(timePosPairs).forEach(([satId, pairs]) => {
        if (pairs.length < 2) return;
        const positionProperty = new Cesium.SampledPositionProperty();
        pairs.forEach(pair => { positionProperty.addSample(pair.time, pair.position); });
        cesiumManager.viewer.entities.add({
            id: `sp3-${satId}-${Date.now()}`, name: `SP3-${satId}`, orbitType: 'SP3', system: system, position: positionProperty,
            point: { pixelSize: 9, color: cesiumColor, outlineColor: Cesium.Color.CYAN, outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY },
            label: { text: `SP3-${satId}`, font: '11px sans-serif', fillColor: cesiumColor, outlineColor: Cesium.Color.BLACK, outlineWidth: 2, style: Cesium.LabelStyle.FILL_AND_OUTLINE, verticalOrigin: Cesium.VerticalOrigin.BOTTOM, pixelOffset: new Cesium.Cartesian2(0, -12) },
            description: `<b>类型:</b> 精密星历 (SP3)<br><b>历元数:</b> ${pairs.length}`
        });
    });
};

function updateDisplayOptions() { displaySatellites(); }

async function refreshData(source = 'tle') {
    showLoading('刷新数据中...');
    try {
        if (source === 'tle') await satelliteData.loadAllTLE();
        await displaySatellites();
        uiController.updateSatelliteList(satelliteData.satellites);
        uiController.updateStatus({ updateTime: new Date().toLocaleTimeString() });
    } catch (error) { console.error('刷新失败:', error); }
    hideLoading();
}

function loadDemoData() {
    satelliteData.satellites = [
        { id: 1, name: 'GPS BIIR-5 (PRN 22)', system: 'gps', tle1: '1 26407U 00040A   26130.40916067  .00000002  00000+0  00000+0 0  9998', tle2: '2 26407  54.8580 216.6628 0121441 302.3501  64.5345  2.00557393189198' },
        { id: 2, name: 'GLONASS-M (COSMOS 2471)', system: 'glonass', tle1: '1 37826U 11060A   26129.13386752 -.00000065  00000+0  00000+0 0  9991', tle2: '2 37826  57.0080 342.8206 0003847  35.7476 324.3172  1.70475815 90457' },
        { id: 3, name: 'Galileo-PFM (GSAT0101)', system: 'galileo', tle1: '1 37846U 11060A   26129.13386752 -.00000065  00000+0  00000+0 0  9991', tle2: '2 37846  57.0080 342.8206 0003847  35.7476 324.3172  1.70475815 90457' },
        { id: 4, name: 'BeiDou-M1 (COMPASS-M1)', system: 'beidou', tle1: '1 32063U 07011A   26130.00000000  .00000000  00000+0  00000+0 0  9990', tle2: '2 32063  55.0000  55.0000 0000000  0.0000  0.0000  1.00270000    10' }
    ];
    satelliteData.updateStats();
    console.log('演示数据已加载，共', satelliteData.satellites.length, '颗卫星');
}

function startFrameRateUpdate() { setInterval(() => { if (cesiumManager && cesiumManager.getFrameRate) uiController.updateStatus({ fps: cesiumManager.getFrameRate() }); }, 1000); }
function startTimeUpdate() { setInterval(() => { if (AppState.isPlaying && cesiumManager) { AppState.currentTime = cesiumManager.getCurrentTime(); uiController.updateTimeDisplay(AppState.currentTime); } }, 1000); }

document.addEventListener('DOMContentLoaded', init);
