/**
 * UI 控制器
 * 处理用户界面交互
 */

class UIController {
    constructor() {
        this.selectedSatellite = null;
        this.currentFilter = 'all';
        this.orbitDisplayMode = 'line';
    }

    init() {
        this.bindEvents();
        this.updateSatelliteCount();
    }

    bindEvents() {
        const sourceSelect = document.getElementById('dataSourceSelect');
        if (sourceSelect) {
            sourceSelect.addEventListener('change', (e) => this.onDataSourceChange(e.target.value));
        }

        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.onRefresh());
        }

        document.querySelectorAll('.checkbox-item input').forEach(cb => {
            cb.addEventListener('change', () => this.onSystemToggle());
        });
    }

    onDataSourceChange(source) {
        window.currentDataSource = source;
        if (source === 'rinex') {
            document.getElementById('uploadArea').style.display = 'block';
        } else {
            document.getElementById('uploadArea').style.display = 'none';
        }
    }

    onRefresh() {
        if (window.currentDataSource === 'tle') {
            if (typeof refreshAllSatellites === 'function') refreshAllSatellites();
        }
    }

    onSystemToggle() {
        const systems = ['gps', 'glonass', 'galileo', 'beidou', 'qzss', 'irnss', 'sbas'];
        systems.forEach(sys => {
            const cb = document.getElementById(`${sys}-check`);
            if (cb) window[`${sys}Visible`] = cb.checked;
        });
        if (typeof updateVisibility === 'function') updateVisibility();
    }

    updateSatelliteCount() {
        const countEl = document.getElementById('satelliteCount');
        if (countEl && window.visibleSatellites) {
            countEl.textContent = window.visibleSatellites.length;
        }
    }
}

const uiController = new UIController();
