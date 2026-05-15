// satellite_data.js - GNSS satellite definitions and data management
// Contains satellite metadata, TLE data, and state management

class SatelliteData {
    constructor() {
        this.satellites = new Map();
        this.selectedSatellites = new Set();
        this.initializeDefaultSatellites();
    }

    initializeDefaultSatellites() {
        // GPS Satellites (PRN 1-32)
        const gpsColors = [
            '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF',
            '#FF8800', '#88FF00', '#0088FF', '#FF0088', '#8800FF', '#00FF88',
            '#FF4444', '#44FF44', '#4444FF', '#FFFF44', '#FF44FF', '#44FFFF',
            '#FFAA44', '#AAFF44', '#44AAFF', '#FF44AA', '#AA44FF', '#44FFAA',
            '#FF6666', '#66FF66', '#6666FF', '#FFFF66', '#FF66FF', '#66FFFF',
            '#FF8888', '#88FF88'
        ];

        for (let prn = 1; prn <= 32; prn++) {
            const id = `G${prn.toString().padStart(2, '0')}`;
            this.satellites.set(id, {
                prn: prn,
                name: `GPS SV-${prn.toString().padStart(2, '0')}`,
                id: id,
                type: 'GPS',
                color: gpsColors[prn - 1] || '#FFFFFF',
                active: true,
                slot: prn,
                orbitRadius: 26559800,
                orbitalPeriod: 43082
            });
        }

        // GLONASS Satellites (PRN 1-24)
        const glonassColors = [
            '#FF1111', '#11FF11', '#1111FF', '#FFaa11', '#aaFF11', '#11aaFF',
            '#FF11aa', '#11FFaa', '#aa11FF', '#FF5511', '#55FF11', '#1155FF',
            '#FF1155', '#11FF55', '#5511FF', '#FFaa55', '#aaFF55', '#55aaFF',
            '#FF55aa', '#55FFaa', '#aa55FF', '#FF5555', '#55FF55', '#5555FF'
        ];

        for (let prn = 1; prn <= 24; prn++) {
            const id = `R${prn.toString().padStart(2, '0')}`;
            this.satellites.set(id, {
                prn: prn,
                name: `GLONASS-M ${prn.toString().padStart(2, '0')}`,
                id: id,
                type: 'GLONASS',
                color: glonassColors[prn - 1] || '#FFFFFF',
                active: true,
                slot: prn + 64,
                orbitRadius: 25510000,
                orbitalPeriod: 40545
            });
        }

        // Galileo Satellites (PRN 1-30)
        const galileoColors = [
            '#FFCC00', '#CCFFCC', '#CCCCFF', '#FFCC88', '#88FFCC', '#CCFF88',
            '#88CCFF', '#FF88CC', '#CC88FF', '#88FF88', '#FF88FF', '#88FFFF',
            '#FFCC44', '#44FFCC', '#CC44FF', '#FF44CC', '#44CCFF', '#44FF44',
            '#FF44FF', '#44FFFF', '#FFCC66', '#66FFCC', '#CC66FF', '#FF66CC',
            '#66CCFF', '#66FF66', '#FF66FF', '#66FFFF', '#FFCC00', '#CCFFCC'
        ];

        for (let prn = 1; prn <= 30; prn++) {
            const id = `E${prn.toString().padStart(2, '0')}`;
            this.satellites.set(id, {
                prn: prn,
                name: `Galileo-${prn.toString().padStart(2, '0')}`,
                id: id,
                type: 'Galileo',
                color: galileoColors[prn - 1] || '#FFFFFF',
                active: true,
                slot: prn + 100,
                orbitRadius: 29999378,
                orbitalPeriod: 51060
            });
        }

        // BeiDou Satellites (PRN 1-35)
        const beidouColors = [
            '#FF00AA', '#AA00FF', '#00FFAA', '#AAFF00', '#00AAFF', '#FFAA00',
            '#FF55AA', '#AA55FF', '#55FFAA', '#AAFF55', '#55AAFF', '#FFAA55',
            '#FF00AA', '#AA00FF', '#00FFAA', '#AAFF00', '#00AAFF', '#FFAA00',
            '#FF55AA', '#AA55FF', '#55FFAA', '#AAFF55', '#55AAFF', '#FFAA55',
            '#FF00AA', '#AA00FF', '#00FFAA', '#AAFF00', '#00AAFF', '#FFAA00',
            '#FF55AA', '#AA55FF', '#55FFAA', '#AAFF55', '#55AAFF'
        ];

        for (let prn = 1; prn <= 35; prn++) {
            const id = `C${prn.toString().padStart(2, '0')}`;
            this.satellites.set(id, {
                prn: prn,
                name: `BeiDou-M${prn.toString().padStart(2, '0')}`,
                id: id,
                type: 'BeiDou',
                color: beidouColors[prn - 1] || '#FFFFFF',
                active: true,
                slot: prn + 200,
                orbitRadius: 27906150,
                orbitalPeriod: 46640
            });
        }
    }

    getSatellite(id) {
        return this.satellites.get(id);
    }

    getAllSatellites() {
        return Array.from(this.satellites.values());
    }

    getSatellitesByType(type) {
        return this.getAllSatellites().filter(s => s.type === type);
    }

    getActiveSatellites() {
        return this.getAllSatellites().filter(s => s.active);
    }

    selectSatellite(id) {
        this.selectedSatellites.add(id);
    }

    deselectSatellite(id) {
        this.selectedSatellites.delete(id);
    }

    toggleSatellite(id) {
        if (this.selectedSatellites.has(id)) {
            this.selectedSatellites.delete(id);
        } else {
            this.selectedSatellites.add(id);
        }
    }

    selectAll() {
        this.getAllSatellites().forEach(s => this.selectedSatellites.add(s.id));
    }

    deselectAll() {
        this.selectedSatellites.clear();
    }

    selectByType(type) {
        this.getSatellitesByType(type).forEach(s => this.selectedSatellites.add(s.id));
    }

    deselectByType(type) {
        const typeSatellites = this.getSatellitesByType(type);
        typeSatellites.forEach(s => this.selectedSatellites.delete(s.id));
    }

    getSelectedSatellites() {
        return Array.from(this.selectedSatellites).map(id => this.satellites.get(id)).filter(Boolean);
    }

    getSelectedIds() {
        return Array.from(this.selectedSatellites);
    }

    isSelected(id) {
        return this.selectedSatellites.has(id);
    }

    updateSatelliteStatus(id, active) {
        const satellite = this.satellites.get(id);
        if (satellite) {
            satellite.active = active;
        }
    }

    getSatelliteStats() {
        const all = this.getAllSatellites();
        const active = this.getActiveSatellites();
        return {
            total: all.length,
            active: active.length,
            byType: {
                GPS: this.getSatellitesByType('GPS').length,
                GLONASS: this.getSatellitesByType('GLONASS').length,
                Galileo: this.getSatellitesByType('Galileo').length,
                BeiDou: this.getSatellitesByType('BeiDou').length
            }
        };
    }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SatelliteData;
}
