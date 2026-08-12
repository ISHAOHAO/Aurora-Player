/** HDR E2E：连管道读取片源参数与决策链已应用的 mpv 属性 */
'use strict';
const net = require('net');
const c = net.connect('\\\\.\\pipe\\aurora-mpv');
let id = 0;
const results = {};
const props = [
  'video-params/gamma', 'video-params/primaries', 'video-params/sig-peak',
  'target-colorspace-hint', 'tone-mapping', 'hdr-compute-peak', 'gamut-mapping-mode',
];
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
        const hdr = ['pq', 'hlg', 'smpte2084', 'arib-std-b67'].includes(String(results['video-params/gamma']).toLowerCase());
        // 本机 SDR 显示器：期望 tonemap 全链应用
        const ok = hdr
          ? results['tone-mapping'] === 'spline'
            && (results['hdr-compute-peak'] === true || results['hdr-compute-peak'] === 'yes')
            && results['target-colorspace-hint'] === false
            && results['gamut-mapping-mode'] === 'perceptual'
          : true;
        console.log(ok ? 'E2E PASS：PQ 源 + SDR 显示器 → tonemap 已应用' : 'E2E FAIL：决策链未按预期应用');
        process.exit(ok ? 0 : 1);
      }
    }
  }
});
c.on('error', (e) => { console.log('PIPE FAIL:', e.message); process.exit(1); });
setTimeout(() => { console.log('TIMEOUT', JSON.stringify(results)); process.exit(1); }, 8000);
