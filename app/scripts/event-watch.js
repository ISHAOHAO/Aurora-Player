/** 监听 mpv IPC 事件流 8 秒（调试事件时序） */
'use strict';
const net = require('net');
const c = net.connect('\\\\.\\pipe\\aurora-mpv');
c.on('data', (d) => {
  for (const line of d.toString().split('\n')) {
    if (!line.trim()) continue;
    try {
      const m = JSON.parse(line);
      if (m.event) console.log(new Date().toISOString().slice(17, 23), m.event);
    } catch {}
  }
});
c.on('error', (e) => { console.log('PIPE FAIL:', e.message); process.exit(1); });
setTimeout(() => process.exit(0), 8000);
