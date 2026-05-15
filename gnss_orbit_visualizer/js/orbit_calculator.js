// orbit_calculator.js - Orbital mechanics calculations for GNSS satellites
// Implements SGP4/SDP4 propagation model simplified for visualization

class OrbitCalculator {
    constructor() {
        this.tleData = new Map();
        this.satelliteConstants = new Map();
        this.initializeConstants();
    }

    initializeConstants() {
        // Earth constants
        this.EARTH_RADIUS = 6378137.0; // meters
        this.EARTH_MU = 3.986004418e14; // m^3/s^2 (gravitational parameter)
        this.EARTH_OMEGA = 7.292115e-5; // rad/s (rotation rate)
        this.J2 = 1.08263e-3; // Second zonal harmonic

        // Common GNSS orbital parameters
        this.GPS_ORBIT_RADIUS = 26559800; // meters (approx 20,200 km altitude)
        this.GLONASS_ORBIT_RADIUS = 25510000; // meters
        this.GALILEO_ORBIT_RADIUS = 29999378; // meters
        this.BEIDOU_ORBIT_RADIUS = 27906150; // meters

        this.GPS_ORBITAL_PERIOD = 43082; // seconds (approx 11h 58m)
        this.GLONASS_ORBITAL_PERIOD = 40545; // seconds (approx 11h 15m)
        this.GALILEO_ORBITAL_PERIOD = 51060; // seconds (approx 14h 22m)
        this.BEIDOU_ORBITAL_PERIOD = 46640; // seconds (approx 12h 58m)
    }

    loadTLEData(satelliteId, tleLine1, tleLine2) {
        this.tleData.set(satelliteId, {
            line1: tleLine1,
            line2: tleLine2,
            epoch: this.parseTLEEpoch(tleLine1),
            inclination: this.parseTLEInclination(tleLine2),
            rightAscension: this.parseTLERightAscension(tleLine2),
            eccentricity: this.parseTLEEccentricity(tleLine2),
            argumentPerigee: this.parseTLEArgumentPerigee(tleLine2),
            meanAnomaly: this.parseTLEMeanAnomaly(tleLine2),
            meanMotion: this.parseTLEMeanMotion(tleLine2)
        });
    }

    parseTLEEpoch(line) {
        // Parse epoch from TLE line 1 (days since 1950)
        const year = parseInt(line.substring(18, 20)) + (parseInt(line.substring(18, 20)) < 50 ? 2000 : 1900);
        const dayOfYear = parseFloat(line.substring(20, 32));
        return { year, dayOfYear };
    }

    parseTLEInclination(line) {
        return parseFloat(line.substring(8, 16)) * Math.PI / 180;
    }

    parseTLERightAscension(line) {
        return parseFloat(line.substring(17, 25)) * Math.PI / 180;
    }

    parseTLEEccentricity(line) {
        const eccStr = line.substring(26, 33);
        return parseInt(eccStr) / 10000000;
    }

    parseTLEArgumentPerigee(line) {
        return parseFloat(line.substring(34, 42)) * Math.PI / 180;
    }

    parseTLEMeanAnomaly(line) {
        return parseFloat(line.substring(43, 51)) * Math.PI / 180;
    }

    parseTLEMeanMotion(line) {
        return parseFloat(line.substring(52, 63)) * 2 * Math.PI / 86400; // rev/day to rad/s
    }

    calculatePosition(satelliteId, time) {
        const tle = this.tleData.get(satelliteId);
        if (!tle) {
            return this.calculateDefaultPosition(satelliteId, time);
        }

        return this.calculateFromTLE(tle, time);
    }

    calculateFromTLE(tle, time) {
        // Simplified SGP4 propagation
        const minutesSinceEpoch = this.getMinutesSinceEpoch(time, tle.epoch);
        const n0 = tle.meanMotion; // mean motion (rad/s)
        const e0 = tle.eccentricity;
        const i0 = tle.inclination;
        const omega0 = tle.rightAscension;
        const w0 = tle.argumentPerigee;
        const M0 = tle.meanAnomaly;

        // Mean motion adjustment for J2 perturbation
        const cosI = Math.cos(i0);
        const p = Math.pow(n0 * this.EARTH_RADIUS, 2) / this.EARTH_MU;
        const j2Correction = 1.5 * this.J2 * Math.pow(this.EARTH_RADIUS / p, 2) * (3 * cosI * cosI - 1);

        const n = n0 * (1 + j2Correction);

        // Mean anomaly at time
        const M = M0 + n * minutesSinceEpoch * 60;
        const Mmod = ((M % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

        // Solve Kepler's equation (simplified)
        const E = this.solveKeplerEquation(Mmod, e0);

        // True anomaly
        const sinNu = Math.sqrt(1 - e0 * e0) * Math.sin(E) / (1 - e0 * Math.cos(E));
        const cosNu = (Math.cos(E) - e0) / (1 - e0 * Math.cos(E));
        const nu = Math.atan2(sinNu, cosNu);

        // Semi-major axis
        const a = Math.pow(this.EARTH_MU / (n * n), 1/3);

        // Radius at true anomaly
        const r = a * (1 - e0 * e0) / (1 + e0 * Math.cos(nu));

        // Argument of latitude
        const u = nu + w0;

        // Longitude of ascending node (with time progression)
        const omega = omega0 - (3/2) * this.J2 * Math.pow(this.EARTH_RADIUS / a, 2) * 
                      (minutesSinceEpoch / 60) * cosI;

        // Convert to ECEF coordinates
        const x_perif = r * Math.cos(u);
        const y_perif = r * Math.sin(u);
        const z_perif = 0;

        // Rotate by argument of perigee
        const x_arg = x_perif * Math.cos(w0) - y_perif * Math.sin(w0);
        const y_arg = x_perif * Math.sin(w0) + y_perif * Math.cos(w0);
        const z_arg = z_perif;

        // Rotate by inclination
        const x_inc = x_arg;
        const y_inc = y_arg * Math.cos(i0) - z_arg * Math.sin(i0);
        const z_inc = y_arg * Math.sin(i0) + z_arg * Math.cos(i0);

        // Rotate by right ascension and account for Earth rotation
        const theta = this.EARTH_OMEGA * minutesSinceEpoch * 60 + omega;
        const x_ecef = x_inc * Math.cos(theta) - y_inc * Math.sin(theta);
        const y_ecef = x_inc * Math.sin(theta) + y_inc * Math.cos(theta);
        const z_ecef = z_inc;

        return {
            x: x_ecef,
            y: y_ecef,
            z: z_ecef,
            latitude: this.calculateLatitude(x_ecef, y_ecef, z_ecef),
            longitude: this.calculateLongitude(x_ecef, y_ecef, z_ecef),
            altitude: r - this.EARTH_RADIUS
        };
    }

    solveKeplerEquation(M, e) {
        // Newton-Raphson iteration
        let E = M;
        for (let i = 0; i < 10; i++) {
            const dE = (M - E + e * Math.sin(E)) / (1 - e * Math.cos(E));
            E += dE;
            if (Math.abs(dE) < 1e-12) break;
        }
        return E;
    }

    calculateLatitude(x, y, z) {
        return Math.atan2(z, Math.sqrt(x * x + y * y)) * 180 / Math.PI;
    }

    calculateLongitude(x, y, z) {
        return Math.atan2(y, x) * 180 / Math.PI;
    }

    getMinutesSinceEpoch(time, epoch) {
        // Simplified: assumes time is in minutes from epoch
        return time / 60;
    }

    calculateDefaultPosition(satelliteId, time) {
        // Generate a simple circular orbit based on satellite type
        const type = satelliteId.startsWith('G') ? 'GPS' :
                     satelliteId.startsWith('R') ? 'GLONASS' :
                     satelliteId.startsWith('E') ? 'Galileo' :
                     satelliteId.startsWith('C') ? 'BeiDou' : 'GPS';

        const orbitalRadius = type === 'GPS' ? this.GPS_ORBIT_RADIUS :
                             type === 'GLONASS' ? this.GLONASS_ORBIT_RADIUS :
                             type === 'Galileo' ? this.GALILEO_ORBIT_RADIUS :
                             type === 'BeiDou' ? this.BEIDOU_ORBIT_RADIUS :
                             this.GPS_ORBIT_RADIUS;

        const orbitalPeriod = type === 'GPS' ? this.GPS_ORBITAL_PERIOD :
                             type === 'GLONASS' ? this.GLONASS_ORBITAL_PERIOD :
                             type === 'Galileo' ? this.GALILEO_ORBITAL_PERIOD :
                             type === 'BeiDou' ? this.BEIDOU_ORBITAL_PERIOD :
                             this.GPS_ORBITAL_PERIOD;

        const prn = parseInt(satelliteId.substring(1)) || 1;
        const slotAngle = (prn * 30) * Math.PI / 180; // Slot angle based on PRN
        const timeAngle = (time / orbitalPeriod) * 2 * Math.PI;

        const inclination = 55 * Math.PI / 180; // Typical GNSS inclination

        const x_orb = orbitalRadius * Math.cos(slotAngle + timeAngle);
        const y_orb = orbitalRadius * Math.sin(slotAngle + timeAngle);
        const z_orb = orbitalRadius * Math.sin(inclination) * Math.sin(slotAngle + timeAngle);

        return {
            x: x_orb,
            y: y_orb,
            z: z_orb,
            latitude: this.calculateLatitude(x_orb, y_orb, z_orb),
            longitude: this.calculateLongitude(x_orb, y_orb, z_orb),
            altitude: orbitalRadius - this.EARTH_RADIUS
        };
    }

    calculateGroundTrack(satelliteId, numPoints = 100) {
        const positions = [];
        const orbitalPeriod = this.GPS_ORBITAL_PERIOD;
        const timeStep = orbitalPeriod / numPoints;

        for (let i = 0; i < numPoints; i++) {
            const time = i * timeStep;
            const pos = this.calculatePosition(satelliteId, time);
            positions.push(Cesium.Cartesian3.fromDegrees(pos.longitude, pos.latitude, pos.altitude * 1000));
        }

        return positions;
    }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = OrbitCalculator;
}
