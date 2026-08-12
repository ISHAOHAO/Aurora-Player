/** 查询显示相关只读属性（探测 HDR 显示器检测手段） */
'use strict';
const net = require('net');
const c = net.connect('\\\\.\\pipe\\aurora-mpv');
const props = ['display-swapchain', 'display-tags', 'display-names', 'target-trc', 'target-prim', 'target-peak'];
let id = 0;
const results = {};
c.on('connect', () => {
  for (const p of props) c.write(JSON.stringify({ command: ['get_property', p], request_id: ++id }) + '\n');
});
c.on('data', (d) => {
  for (const line of d.toString().split('\n')) {
    if (!line.trim()) continue;
    const m = JSON.parse(line);
    if (m.request_id !== undefined) {
      results[props[m.request_id - 1]] = m.error === 'success' ? m.data : `<${m.error}>`;
      if (Object.keys(results).length === props.length) {
        console.log(JSON.stringify(results, null, 2));
        process.exit(0);
      }
    }
  }
});
c.on('error', (e) => { console.log('PIPE FAIL:', e.message); process.exit(1); });
setTimeout(() => { console.log('TIMEOUT', JSON.stringify(results)); process.exit(1); }, 8000);
