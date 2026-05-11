// GNSS Orbit Visualizer - Configuration
window.GNSS_CONFIG = {
    cesiumToken: '',
    backendUrl: 'http://localhost:8000',
    satelliteNames: {
        GPS: 'GPS',
        GLONASS: 'GLONASS',
        Galileo: 'Galileo',
        BeiDou: 'BeiDou',
        QZSS: 'QZSS',
        IRNSS: 'IRNSS',
        SBAS: 'SBAS'
    },
    colors: {
        GPS: '#2563eb',
        GLONASS: '#dc2626',
        Galileo: '#d97706',
        BeiDou: '#16a34a',
        QZSS: '#7c3aed',
        IRNSS: '#0891b2',
        SBAS: '#db2777'
    },
    orbitTypes: ['line', 'path', 'point'],
    defaultOrbitType: 'line',
    autoStart: true
};
