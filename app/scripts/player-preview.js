// 本地 UI 回归夹具：只提供内存桥接，不连接 mpv、DLNA 或用户数据。
// npm run build 后执行 node scripts/player-preview.js，浏览启动时打印的本机 URL。
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../renderer/dist');
const mock = `
const listeners = new Map();
const status = { title: '播放界面回归预览', path: 'preview.mp4', timePos: 125, duration: 1800,
  pause: true, volume: 35, mute: false, idle: false, fullscreen: false, casting: { cp: '测试手机' }, lockPolicy: 'none',
  stats: { codec: 'h264', w: 1920, h: 1080, fps: 24 } };
let delay = 500;
const emit = (key, value) => listeners.get(key)?.forEach(cb => cb(value));
const snapshot = () => JSON.parse(JSON.stringify(status));
const push = () => { const value = snapshot(); setTimeout(() => emit('onStatus', value), delay); };
const commands = [];
const log = args => {
  commands.push(args); if(commands.length > 8) commands.shift();
  document.querySelector('#preview-commands').textContent = commands.map(x => x.join(' ')).join(' | ');
};
window.aurora = new Proxy({
  getSettings: async () => ({ theme: 'dark', volumeStep: 2, audioEq: Array(10).fill(0) }),
  visualGet: async () => ({ version: 1, activeThemeId: 'aqua', presets: [] }),
  getRecent: async () => [], getLibrary: async () => [],
  getScanStatus: async () => ({ state: 'idle', count: 0 }),
  getDlnaState: async () => ({ running: false, friendlyName: 'UI preview', port: 0 }),
  mpv: async (...args) => {
    log(args);
    if(args[0] === 'set_property') status[args[1]] = args[2];
    if(args[0] === 'add') status[args[1]] = Math.max(0, Math.min(100, status[args[1]] + args[2]));
    if(args[0] === 'cycle') status[args[1]] = !status[args[1]];
    push(); return null;
  },
  toggleFullscreen: async () => { status.fullscreen = !status.fullscreen; emit('onFullscreen', status.fullscreen); push(); },
  stop: async () => { location.hash = '#/home'; },
}, { get(target, key) {
  if(key in target) return target[key];
  if(key.startsWith('on')) return cb => {
    if(!listeners.has(key)) listeners.set(key, new Set());
    listeners.get(key).add(cb);
    if(key === 'onStatus') push();
    return () => listeners.get(key).delete(cb);
  };
  return async () => null;
} });
document.documentElement.dataset.theme = 'dark';
document.addEventListener('DOMContentLoaded', () => {
  const panel = document.createElement('aside');
  panel.id = 'preview-panel';
  panel.style.cssText = 'position:fixed;top:85px;left:24px;right:24px;z-index:99999;background:#18212b;color:white;padding:12px;font:12px monospace;border-radius:8px';
  panel.innerHTML = '<b>仅测试：模拟播放状态，未连接真实视频</b> <button id="preview-home">浏览页</button> <button id="preview-player">播放页</button> <button id="preview-pause">播放/暂停测试</button> <button id="preview-lock">锁定/解锁音量</button> <button id="preview-theme">明暗外观</button><p id="preview-state"></p><p id="preview-commands"></p>';
  document.body.appendChild(panel);
  document.querySelector('#preview-home').onclick = () => location.hash = '#/home';
  document.querySelector('#preview-player').onclick = () => location.hash = '#/player';
  document.querySelector('#preview-pause').onclick = () => { status.pause = !status.pause; push(); };
  document.querySelector('#preview-lock').onclick = () => { status.lockPolicy = status.lockPolicy === 'full' ? 'none' : 'full'; push(); };
  document.querySelector('#preview-theme').onclick = () => { document.documentElement.dataset.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; };
  setInterval(() => {
    const layers = document.querySelectorAll('#vs-atmosphere, #vs-edge-top, #vs-edge-bottom, .vs-spot-glow').length;
    document.querySelector('#preview-state').textContent = '装饰层=' + layers + ' 音量=' + status.volume + ' 静音=' + status.mute + ' 暂停=' + status.pause + ' 全屏标记=' + status.fullscreen;
    push();
  }, 500);
});
`;
const server = http.createServer((req, res) => {
  if (req.url === '/preview-bridge.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(mock); return; }
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const filename = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!filename.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  try {
    let body = fs.readFileSync(filename);
    const ext = path.extname(filename);
    if (ext === '.html') body = body.toString().replace('<head>', '<head><script src="/preview-bridge.js"></script>');
    res.setHeader('Content-Type', ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' })[ext] || 'application/octet-stream');
    res.end(body);
  } catch { res.writeHead(404).end(); }
});
server.listen(Number(process.env.AURORA_PREVIEW_PORT) || 0, '127.0.0.1', () => console.log(`UI fixture: http://127.0.0.1:${server.address().port}/#/player`));
