const fs = require('fs');
const path = require('path');

// Read all files from the js directory
const jsDir = '/home/gnss/work/html_profile/gnss_orbit_visualizer/js';
const files = fs.readdirSync(jsDir).filter(f => f.endsWith('.js'));

const output = files.map(f => {
    const content = fs.readFileSync(path.join(jsDir, f), 'utf8');
    return { path: `gnss_orbit_visualizer/js/${f}`, content };
});

output.push(
    { path: 'gnss_orbit_visualizer/index.html', content: fs.readFileSync('/home/gnss/work/html_profile/gnss_orbit_visualizer/index.html', 'utf8') },
    { path: 'gnss_orbit_visualizer/css/style.css', content: fs.readFileSync('/home/gnss/work/html_profile/gnss_orbit_visualizer/css/style.css', 'utf8') }
);

console.log(JSON.stringify(output.slice(0,2), null, 2));
