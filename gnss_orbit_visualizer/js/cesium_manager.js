// cesium_manager.js - Full Cesium wrapper for GNSS orbit visualization
// Manages the Cesium viewer, entities, and visualization

class CesiumManager {
    constructor(containerId) {
        this.viewer = null;
        this.containerId = containerId;
        this.entities = new Map();
        this.orbitLines = new Map();
        this.finishedCallbacks = [];
    }

    async initialize() {
        return new Promise((resolve, reject) => {
            try {
                Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI5N2UyMjcwOS00MDY1LTQxYjEtYjZjMy00YTU0ZTg5MmViYWQiLCJpZCI6MjU5LCJpYXQiOjE3MjU0MzI1Njh9.2E8bZs8D3XgmR7D3JJlRu-3z9OHq5PLAlAQj2aD4l8c';

                const viewer = new Cesium.Viewer(this.containerId, {
                    terrainProvider: Cesium.createWorldTerrain(),
                    baseLayerPicker: true,
                    imageryProvider: Cesium.createOpenStreetMapImageryProvider({
                        url: 'https://tile.openstreetmap.org/'
                    }),
                    timeline: true,
                    animation: true,
                    homeButton: true,
                    sceneModePicker: true,
                    navigationHelpButton: true,
                    infoBox: true,
                    selectionIndicator: true,
                    shadows: true,
                    shouldAnimate: true
                });

                this.viewer = viewer;
                this.setupEventHandlers();
                resolve();
            } catch (error) {
                reject(error);
            }
        });
    }

    setupEventHandlers() {
        this.viewer.clock.onTick.addEventListener(() => {
            this.finishedCallbacks.forEach(callback => callback(this.viewer.clock.currentTime));
        });
    }

    addFinishedCallback(callback) {
        this.finishedCallbacks.push(callback);
    }

    removeFinishedCallback(callback) {
        const index = this.finishedCallbacks.indexOf(callback);
        if (index > -1) {
            this.finishedCallbacks.splice(index, 1);
        }
    }

    addSatelliteEntity(satelliteId, position, satelliteInfo) {
        const entity = this.viewer.entities.add({
            id: satelliteId,
            name: satelliteInfo.name,
            position: position,
            point: {
                pixelSize: 8,
                color: Cesium.Color.fromCssColorString(satelliteInfo.color),
                outlineColor: Cesium.Color.WHITE,
                outlineWidth: 2,
                heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
            },
            label: {
                text: satelliteInfo.name,
                font: '12px sans-serif',
                fillColor: Cesium.Color.WHITE,
                outlineColor: Cesium.Color.BLACK,
                outlineWidth: 2,
                style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                verticalOrigin: Cesium.VerticalOrigin.TOP,
                pixelOffset: new Cesium.Cartesian2(0, 10),
                heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
            },
            description: `<p><b>PRN:</b> ${satelliteInfo.prn}</p>
                          <p><b>Type:</b> ${satelliteInfo.type}</p>
                          <p><b>Status:</b> ${satelliteInfo.active ? 'Active' : 'Inactive'}</p>`
        });

        this.entities.set(satelliteId, entity);
        return entity;
    }

    updateSatellitePosition(satelliteId, position) {
        const entity = this.entities.get(satelliteId);
        if (entity) {
            entity.position = position;
        }
    }

    addOrbitPath(satelliteId, positions, color) {
        const orbitPath = this.viewer.entities.add({
            id: `orbit_${satelliteId}`,
            name: `Orbit ${satelliteId}`,
            polyline: {
                positions: positions,
                width: 2,
                material: color || Cesium.Color.YELLOW,
                clampToGround: false
            }
        });

        this.orbitLines.set(satelliteId, orbitPath);
        return orbitPath;
    }

    updateOrbitPath(satelliteId, positions) {
        const orbitPath = this.orbitLines.get(satelliteId);
        if (orbitPath) {
            orbitPath.polyline.positions = positions;
        }
    }

    removeOrbitPath(satelliteId) {
        const orbitPath = this.orbitLines.get(satelliteId);
        if (orbitPath) {
            this.viewer.entities.remove(orbitPath);
            this.orbitLines.delete(satelliteId);
        }
    }

    removeSatelliteEntity(satelliteId) {
        const entity = this.entities.get(satelliteId);
        if (entity) {
            this.viewer.entities.remove(entity);
            this.entities.delete(satelliteId);
        }
        this.removeOrbitPath(satelliteId);
    }

    flyToSatellite(satelliteId) {
        const entity = this.entities.get(satelliteId);
        if (entity) {
            this.viewer.flyTo(entity, {
                duration: 1.5,
                offset: new Cesium.HeadingPitchRange(
                    Cesium.Math.toRadians(0),
                    Cesium.Math.toRadians(-45),
                    5000000
                )
            });
        }
    }

    getCurrentTime() {
        return this.viewer.clock.currentTime;
    }

    setTime(time) {
        this.viewer.clock.currentTime = time;
    }

    setTimeMultiplier(multiplier) {
        this.viewer.clock.multiplier = multiplier;
    }

    startSimulation() {
        this.viewer.clock.shouldAnimate = true;
    }

    stopSimulation() {
        this.viewer.clock.shouldAnimate = false;
    }

    destroy() {
        if (this.viewer) {
            this.viewer.destroy();
            this.viewer = null;
        }
        this.entities.clear();
        this.orbitLines.clear();
        this.finishedCallbacks = [];
    }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CesiumManager;
}
