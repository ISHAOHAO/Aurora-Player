const net = require('net');
const c = net.connect('\\\\.\\pipe\\aurora-mpv');
c.on('connect', () => {
  c.write(JSON.stringify({ command: ['get_property', 'mpv-version'], request_id: 1 }) + '\n');
});
c.on('data', (d) => {
  for (const line of d.toString().split('\n')) {
    if (!line.trim()) continue;
    const m = JSON.parse(line);
    if (m.request_id === 1) { console.log('PIPE OK:', m.data); process.exit(0); }
  }
});
c.on('error', (e) => { console.log('PIPE FAIL:', e.message); process.exit(1); });
setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 5000);
