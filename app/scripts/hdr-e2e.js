/** HDR E2E：连管道读取片源参数与决策链已应用的 mpv 属性（按显示器 HDR 状态断言对应分支） */
'use strict';
const net = require('net');
const fs = require('fs');
const os = require('os');
const path = require('path');
const c = net.connect('\\\\.\\pipe\\aurora-mpv');
let id = 0;
const results = {};
const props = [
  'video-params/gamma', 'video-params/primaries', 'video-params/sig-peak',
  'target-colorspace-hint', 'tone-mapping', 'hdr-compute-peak', 'gamut-mapping-mode',
];

/** 与主进程同法：解析 VO 日志 "Queried output: … colorspace: RGB_FULL_G2084…"（G2084 = HDR 开） */
function detectDisplayHdr() {
  try {
    const f = path.join(os.homedir(), 'AppData', 'Roaming', 'aurora-player', 'mpv.log');
    const size = fs.statSync(f).size;
    const fd = fs.openSync(f, 'r');
    let buf = Buffer.alloc(Math.min(size, 16384));
    fs.readSync(fd, buf, 0, buf.length, Math.max(0, size - buf.length));
    let text = buf.toString('latin1');
    if (!/Queried output:/.test(text) && size > buf.length) {
      buf = Buffer.alloc(size);
      fs.readSync(fd, buf, 0, size, 0);
      text = buf.toString('latin1');
    }
    fs.closeSync(fd);
    const matches = [...text.matchAll(/Queried output:.*?colorspace: (\w+)/g)];
    if (!matches.length) return null;
    return /G2084/i.test(matches[matches.length - 1][1]);
  } catch { return null; }
}

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
        if (!hdr) { console.log('E2E PASS：SDR 源原生输出'); process.exit(0); }
        const displayHdr = detectDisplayHdr();
        console.log(`显示器 HDR: ${displayHdr === null ? '未知' : displayHdr}`);
        let ok;
        if (displayHdr) {
          // HDR 显示器 + HDR 源 → 直通：target-colorspace-hint=yes，hdr-compute-peak=auto（缺元数据时自检）
          ok = results['target-colorspace-hint'] === true
            && (results['hdr-compute-peak'] === 'auto');
        } else {
          // SDR 显示器 + HDR 源 → 色调映射全链
          ok = results['tone-mapping'] === 'spline'
            && (results['hdr-compute-peak'] === true || results['hdr-compute-peak'] === 'yes')
            && results['target-colorspace-hint'] === false
            && results['gamut-mapping-mode'] === 'perceptual';
        }
        console.log(ok
          ? `E2E PASS：PQ 源 + ${displayHdr ? 'HDR' : 'SDR'} 显示器 → ${displayHdr ? '直通' : 'tonemap'} 已应用`
          : 'E2E FAIL：决策链未按预期应用');
        process.exit(ok ? 0 : 1);
      }
    }
  }
});
c.on('error', (e) => { console.log('PIPE FAIL:', e.message); process.exit(1); });
setTimeout(() => { console.log('TIMEOUT', JSON.stringify(results)); process.exit(1); }, 8000);
