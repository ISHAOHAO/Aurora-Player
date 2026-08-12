const net = require('net');
const c = net.connect('\\\\.\\pipe\\aurora-mpv');
let step = 0;
c.on('connect', () => {
  c.write(JSON.stringify({ command: ['get_property', 'time-pos'], request_id: 1 }) + '\n');
});
c.on('data', (d) => {
  for (const line of d.toString().split('\n')) {
    if (!line.trim()) continue;
    const m = JSON.parse(line);
    if (m.request_id === 1) {
      console.log('time-pos #1:', m.data);
      setTimeout(() => c.write(JSON.stringify({ command: ['get_property', 'time-pos'], request_id: 2 }) + '\n'), 1500);
    }
    if (m.request_id === 2) {
      console.log('time-pos #2:', m.data, m.data > 0 ? '→ PLAYING OK' : '→ NOT ADVANCING');
      process.exit(0);
    }
  }
});
c.on('error', (e) => { console.log('PIPE FAIL:', e.message); process.exit(1); });
setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 6000);
