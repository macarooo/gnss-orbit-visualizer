// ui_controller.js - User interface management and event handling
// Controls UI interactions, panels, and coordinates between components

class UIController {
    constructor(cesiumManager, satelliteData, orbitCalculator) {
        this.cesiumManager = cesiumManager;
        this.satelliteData = satelliteData;
        this.orbitCalculator = orbitCalculator;
        this.isSimulationRunning = false;
        this.currentTime = 0;
        this.timeMultiplier = 1;
        this.pauseCallbacks = [];
        this.resumeCallbacks = [];
        this.initializeUI();
        this.setupEventListeners();
    }

    initializeUI() {
        this.createControlPanel();
        this.createSatelliteList();
        this.createInfoPanel();
        this.updateSatelliteCount();
        this.updateTimeDisplay();
    }

    createControlPanel() {
        // Control panel is already in HTML, just get references
        this.playBtn = document.getElementById('playBtn');
        this.pauseBtn = document.getElementById('pauseBtn');
        this.speedSlider = document.getElementById('speedSlider');
        this.speedValue = document.getElementById('speedValue');
        this.timeDisplay = document.getElementById('timeDisplay');
        this.dateDisplay = document.getElementById('dateDisplay');

        if (this.speedSlider) {
            this.speedSlider.addEventListener('input', (e) => {
                this.setTimeMultiplier(parseFloat(e.target.value));
            });
        }
    }

    createSatelliteList() {
        this.satelliteListContainer = document.getElementById('satelliteList');
        this.filterButtons = document.querySelectorAll('.filter-btn');

        if (this.filterButtons) {
            this.filterButtons.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const filter = e.target.dataset.filter;
                    this.filterSatellites(filter);
                });
            });
        }
    }

    createInfoPanel() {
        this.infoPanel = document.getElementById('infoPanel');
        this.statsPanel = document.getElementById('statsPanel');
    }

    setupEventListeners() {
        // Play button
        if (this.playBtn) {
            this.playBtn.addEventListener('click', () => this.play());
        }

        // Pause button
        if (this.pauseBtn) {
            this.pauseBtn.addEventListener('click', () => this.pause());
        }

        // Cesium clock tick callback
        if (this.cesiumManager) {
            this.cesiumManager.addFinishedCallback((time) => {
                this.onTimeUpdate(time);
            });
        }

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space') {
                e.preventDefault();
                this.toggleSimulation();
            } else if (e.code === 'ArrowLeft') {
                this.stepBackward();
            } else if (e.code === 'ArrowRight') {
                this.stepForward();
            }
        });
    }

    play() {
        this.isSimulationRunning = true;
        if (this.cesiumManager) {
            this.cesiumManager.startSimulation();
        }
        this.updatePlayPauseButtons();
        this.pauseCallbacks.forEach(cb => cb());
    }

    pause() {
        this.isSimulationRunning = false;
        if (this.cesiumManager) {
            this.cesiumManager.stopSimulation();
        }
        this.updatePlayPauseButtons();
        this.resumeCallbacks.forEach(cb => cb());
    }

    toggleSimulation() {
        if (this.isSimulationRunning) {
            this.pause();
        } else {
            this.play();
        }
    }

    setTimeMultiplier(multiplier) {
        this.timeMultiplier = multiplier;
        if (this.cesiumManager) {
            this.cesiumManager.setTimeMultiplier(multiplier);
        }
        if (this.speedValue) {
            this.speedValue.textContent = `${multiplier}x`;
        }
    }

    stepForward() {
        this.currentTime += 60; // Step 1 minute
        if (this.cesiumManager) {
            this.cesiumManager.setTime(this.currentTime);
        }
        this.updateTimeDisplay();
    }

    stepBackward() {
        this.currentTime -= 60; // Step back 1 minute
        if (this.cesiumManager) {
            this.cesiumManager.setTime(this.currentTime);
        }
        this.updateTimeDisplay();
    }

    onTimeUpdate(time) {
        if (typeof time === 'number') {
            this.currentTime = time;
        } else if (time && time.secondsOfDay) {
            this.currentTime = time.secondsOfDay;
        }
        this.updateTimeDisplay();
    }

    updateTimeDisplay() {
        if (this.timeDisplay) {
            const hours = Math.floor(this.currentTime / 3600);
            const minutes = Math.floor((this.currentTime % 3600) / 60);
            const seconds = Math.floor(this.currentTime % 60);
            this.timeDisplay.textContent = 
                `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }

        if (this.dateDisplay) {
            const now = new Date();
            now.setSeconds(this.currentTime);
            this.dateDisplay.textContent = now.toISOString().slice(0, 19).replace('T', ' ');
        }
    }

    updatePlayPauseButtons() {
        if (this.playBtn && this.pauseBtn) {
            this.playBtn.style.display = this.isSimulationRunning ? 'none' : 'inline-block';
            this.pauseBtn.style.display = this.isSimulationRunning ? 'inline-block' : 'none';
        }
    }

    filterSatellites(filter) {
        // Update filter button states
        if (this.filterButtons) {
            this.filterButtons.forEach(btn => {
                btn.classList.toggle('active', btn.dataset.filter === filter);
            });
        }

        // Clear current selection
        this.satelliteData.deselectAll();

        // Select based on filter
        if (filter === 'all') {
            this.satelliteData.selectAll();
        } else if (filter === 'gps') {
            this.satelliteData.selectByType('GPS');
        } else if (filter === 'glonass') {
            this.satelliteData.selectByType('GLONASS');
        } else if (filter === 'galileo') {
            this.satelliteData.selectByType('Galileo');
        } else if (filter === 'beidou') {
            this.satelliteData.selectByType('BeiDou');
        }

        this.updateSatelliteList();
        this.updateSelectedSatellites();
    }

    updateSatelliteList() {
        if (!this.satelliteListContainer) return;

        this.satelliteListContainer.innerHTML = '';

        const satellites = this.satelliteData.getAllSatellites();

        satellites.forEach(sat => {
            const item = document.createElement('div');
            item.className = `satellite-item ${sat.type.toLowerCase()}`;
            item.innerHTML = `
                <span class="satellite-color" style="background-color: ${sat.color}"></span>
                <span class="satellite-name">${sat.name}</span>
                <span class="satellite-prn">PRN ${sat.prn}</span>
            `;

            if (this.satelliteData.isSelected(sat.id)) {
                item.classList.add('selected');
            }

            item.addEventListener('click', () => {
                this.satelliteData.toggleSatellite(sat.id);
                item.classList.toggle('selected');
                this.updateSelectedSatellites();
            });

            this.satelliteListContainer.appendChild(item);
        });
    }

    updateSelectedSatellites() {
        const selected = this.satelliteData.getSelectedSatellites();

        // Update Cesium entities based on selection
        const allSatellites = this.satelliteData.getAllSatellites();

        allSatellites.forEach(sat => {
            const isSelected = this.satelliteData.isSelected(sat.id);

            if (isSelected && !this.cesiumManager.entities.has(sat.id)) {
                // Add satellite to visualization
                const position = this.orbitCalculator.calculatePosition(sat.id, this.currentTime);
                const cartesian = Cesium.Cartesian3.fromDegrees(
                    position.longitude,
                    position.latitude,
                    position.altitude * 1000
                );
                this.cesiumManager.addSatelliteEntity(sat.id, cartesian, sat);

                // Add orbit path
                const orbitPositions = this.orbitCalculator.calculateGroundTrack(sat.id, 50);
                const color = Cesium.Color.fromCssColorString(sat.color);
                this.cesiumManager.addOrbitPath(sat.id, orbitPositions, color);
            } else if (!isSelected && this.cesiumManager.entities.has(sat.id)) {
                // Remove satellite from visualization
                this.cesiumManager.removeSatelliteEntity(sat.id);
            }
        });
    }

    updateSatelliteCount() {
        const stats = this.satelliteData.getSatelliteStats();

        if (this.statsPanel) {
            this.statsPanel.innerHTML = `
                <div class="stat-item">
                    <span class="stat-label">Total Satellites:</span>
                    <span class="stat-value">${stats.total}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">GPS:</span>
                    <span class="stat-value">${stats.byType.GPS}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">GLONASS:</span>
                    <span class="stat-value">${stats.byType.GLONASS}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Galileo:</span>
                    <span class="stat-value">${stats.byType.Galileo}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">BeiDou:</span>
                    <span class="stat-value">${stats.byType.BeiDou}</span>
                </div>
            `;
        }
    }

    showSatelliteInfo(satelliteId) {
        const satellite = this.satelliteData.getSatellite(satelliteId);
        if (!satellite) return;

        if (this.infoPanel) {
            const position = this.orbitCalculator.calculatePosition(satelliteId, this.currentTime);

            this.infoPanel.innerHTML = `
                <h3>${satellite.name}</h3>
                <div class="info-grid">
                    <div class="info-item">
                        <span class="info-label">PRN:</span>
                        <span class="info-value">${satellite.prn}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Type:</span>
                        <span class="info-value">${satellite.type}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Status:</span>
                        <span class="info-value">${satellite.active ? 'Active' : 'Inactive'}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Latitude:</span>
                        <span class="info-value">${position.latitude.toFixed(6)}°</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Longitude:</span>
                        <span class="info-value">${position.longitude.toFixed(6)}°</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Altitude:</span>
                        <span class="info-value">${(position.altitude / 1000).toFixed(2)} km</span>
                    </div>
                </div>
            `;

            this.infoPanel.style.display = 'block';
        }
    }

    hideInfoPanel() {
        if (this.infoPanel) {
            this.infoPanel.style.display = 'none';
        }
    }

    onPause(callback) {
        this.pauseCallbacks.push(callback);
    }

    onResume(callback) {
        this.resumeCallbacks.push(callback);
    }

    destroy() {
        this.pauseCallbacks = [];
        this.resumeCallbacks = [];
    }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UIController;
}
