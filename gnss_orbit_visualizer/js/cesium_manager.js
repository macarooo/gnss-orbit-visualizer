// cesium_manager.js - CesiumJS globe and entity management
class CesiumManager {
    constructor() {
        this.viewer = null;
        this.entities = new Map();
    }

    init(containerId, token) {
        CesiumIon.defaultAccessToken = token || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
        this.viewer = new Cesium.Viewer(containerId, {
            imageryProvider: new Cesium.TileMapServiceImageryProvider({ url: Cesium.buildModuleUrl('Assets/Textures/NaturalEarthII') }),
            baseLayerPicker: false,
            imageryProviderViewModels: [],
            geocoder: false,
            homeButton: false,
            sceneModePicker: false,
            navigationHelpButton: false,
            animation: false,
            timeline: false,
            fullscreenButton: false,
            selectionIndicator: false,
            infoBox: false
        });
        this.viewer.scene.globe.enableLighting = false;
        this.viewer.scene.skyAtmosphere.show = true;
        this.viewer.sceneRef = null;
    }

    addEntity(id, data) {
        if (this.viewer) {
            const entity = this.viewer.entities.add({
                id: id,
                position: Cesium.Cartesian3.fromDegrees(data.lon || 0, data.lat || 0, data.alt || 0),
                point: { pixelSize: data.size || 8, color: Cesium.Color.fromCssColorString(data.color || '#ffffff') },
                label: { text: data.name || id, show: false }
            });
            this.entities.set(id, entity);
            return entity;
        }
    }

    removeEntity(id) {
        if (this.viewer && this.entities.has(id)) {
            this.viewer.entities.remove(this.entities.get(id));
            this.entities.delete(id);
        }
    }

    clearAll() {
        if (this.viewer) {
            this.viewer.entities.removeAll();
            this.entities.clear();
        }
    }

    flyTo(lon, lat, alt) {
        if (this.viewer) {
            this.viewer.camera.flyTo({ destination: Cesium.Cartesian3.fromDegrees(lon, lat, alt * 1000) });
        }
    }
}

const cesiumManager = new CesiumManager();
