// orbit_calculator.js - Satellite orbit calculations using satellite.js SGP4/SDP4
// Fixed: parameter renamed from 'satellite' to 'tleSat' to avoid shadowing global 'satellite' library

class OrbitCalculator {
    constructor() {
        this.tleCache = new Map();
    }

    parseTLE(tle1, tle2) {
        const key = tle1 + tle2;
        if (this.tleCache.has(key)) return this.tleCache.get(key);
        try {
            const sat = satellite.twoline2satrec(tle1, tle2);
            this.tleCache.set(key, sat);
            return sat;
        } catch (e) {
            console.error('TLE parse error:', e);
            return null;
        }
    }

    getPosition(tleSat, date) {
        try {
            const satrec = this.tleSat ? this.tleSat : tleSat;
            const positionAndVelocity = satellite.propagate(satrec, new Date(date));
            if (positionAndVelocity.position.x === 0 && positionAndVelocity.position.y === 0 && positionAndVelocity.position.z === 0) {
                return null;
            }
            const gmst = satellite.gstime(new Date(date));
            const positionEcf = satellite.eciToEcf(positionAndVelocity.position, gmst);
            return {
                x: positionEcf.x,
                y: positionEcf.y,
                z: positionEcf.z,
                x_eci: positionAndVelocity.position.x,
                y_eci: positionAndVelocity.position.y,
                z_eci: positionAndVelocity.position.z
            };
        } catch (e) {
            console.error('Position calc failed:', e);
            return null;
        }
    }

    getOrbitPositions(tleSat, startDate, endDate, stepMinutes = 1) {
        const positions = [];
        const start = new Date(startDate);
        const end = new Date(endDate);
        const satrec = typeof tleSat === 'string' ? this.parseTLE(tleSat, arguments[1]) : tleSat;
        const actualSat = this.tleSat || satrec;
        let current = new Date(start);
        while (current <= end) {
            const pos = this.getPosition(actualSat, current);
            if (pos) positions.push(pos);
            current.setMinutes(current.getMinutes() + stepMinutes);
        }
        return positions;
    }

    getGroundTrack(tleSat, startDate, endDate, stepMinutes = 1) {
        const positions = [];
        const satrec = typeof tleSat === 'string' ? this.parseTLE(tleSat, arguments[1]) : tleSat;
        const actualSat = this.tleSat || satrec;
        const start = new Date(startDate);
        const end = new Date(endDate);
        let current = new Date(start);
        while (current <= end) {
            const pos = this.getPosition(actualSat, current);
            if (pos) {
                const lat = satellite.ecfToLatLonAlt(pos).latitude;
                const lon = satellite.ecfToLatLonAlt(pos).longitude;
                positions.push({ latitude: lat, longitude: lon, altitude: satellite.ecfToLatLonAlt(pos).altitude });
            }
            current.setMinutes(current.getMinutes() + stepMinutes);
        }
        return positions;
    }

    getOrbitalParameters(tleSat) {
        const satrec = typeof tleSat === 'string' ? this.parseTLE(tleSat, arguments[1]) : tleSat;
        const actualSat = this.tleSat || satrec;
        try {
            return {
                inclination: satellite.degreesLat(actualSat.inclination),
                eccentricity: actualSat.eccentricity,
                raan: satellite.degreesLong(actualSat.rightAscensionOfAscendingNode),
                argPerigee: satellite.degreesLong(actualSat.argumentOfPerigee),
                meanAnomaly: satellite.degreesLong(actualSat.meanAnomaly),
                meanMotion: actualSat.no * 60 * 24 / (2 * Math.PI)
            };
        } catch (e) { return null; }
    }
}

const orbitCalculator = new OrbitCalculator();
