/**
 * Aurora Player — 主进程
 * 窗口模型（M3 修复版，黑屏根因：Chromium DComp 合成层遮盖 mpv 子窗口）：
 *   homeWin   主窗口，React #/home（媒体中心首页）
 *   videoWin  播放窗口：transparent 透明窗，React #/player 自绘控制层在上，
 *             mpv --wid 子窗口嵌入在下层透出（单窗方案，无独立叠加窗）
 */
const { app, BrowserWindow, Menu, dialog, ipcMain, utilityProcess } = require('electron');
const { spawn } = require('child_process');
const net = require('net');
const path = require('path');
const fs = require('fs');
const { decide } = require('./hdr');

const MPV_EXE = path.join(__dirname, '..', '..', 'runtime', 'mpv', 'mpv.exe');
const PIPE_PATH = '\\\\.\\pipe\\aurora-mpv';
const DIST_HTML = path.join(__dirname, '..', 'renderer', 'dist', 'index.html');
const PRELOAD = path.join(__dirname, '..', 'preload', 'preload.js');
const DLNA_ENTRY = path.join(__dirname, '..', 'dlna', 'dlna.js');
const RECENT_FILE = () => path.join(app.getPath('userData'), 'recent.json');
const RECENT_CAP = 20;

let homeWin = null;
let videoWin = null;
let mpvProc = null;
let currentPath = null;
let casting = null;          // { cp, title } — DLNA 投屏会话标识
let dlnaProc = null;
let dlnaState = { running: false, friendlyName: 'Aurora Player', port: 0 };
let videoFs = false;         // 透明窗 isFullScreen() 回报不可靠，事件自行跟踪

let pipe = null;
let reqSeq = 0;
const pending = new Map();
let statusTimer = null;
let vrTimer = null;
let hdrRetry = 0;

/* ---------------- mpv 进程 ---------------- */

function spawnMpv(hwnd, file, seek) {
  // 调试开关（黑屏定位用，见 docs/05-实现偏差清单.md）：
  //   AURORA_VO=direct3d   强制 VO
  //   AURORA_HWDEC=no      关闭硬解
  //   AURORA_MPV_EXTRA='["--x","y"]'  追加任意参数
  const extra = JSON.parse(process.env.AURORA_MPV_EXTRA || '[]');
  mpvProc = spawn(MPV_EXE, [
    `--wid=${hwnd}`,
    `--input-ipc-server=${PIPE_PATH}`,
    '--keep-open=yes',
    '--no-terminal',
    '--osc=no',                // M2：自绘控制层，关掉 mpv OSC
    '--osd-level=1',
    `--hwdec=${process.env.AURORA_HWDEC || 'auto-safe'}`,
    `--log-file=${path.join(app.getPath('userData'), 'mpv.log')}`,
    ...(process.env.AURORA_VO ? [`--vo=${process.env.AURORA_VO}`] : []),
    ...extra,
    ...(seek ? [`--start=${seek}`] : []),
    ...(file ? [file] : ['--idle=yes']),
  ], { stdio: 'ignore' });

  mpvProc.on('exit', () => { mpvProc = null; });
  connectPipe(30);
}

/* ---------------- 命名管道 IPC ---------------- */

function connectPipe(retriesLeft) {
  pipe = net.connect(PIPE_PATH);
  let buf = '';

  pipe.on('connect', () => {
    startStatusPolling();
    hdrRetry = 0;
    refreshMetadata();   // 启动事件可能在管道连接前已发，主动拉一次（定时重试兜底参数未就绪）
  });

  pipe.on('data', (chunk) => {
    buf += chunk.toString('utf8');
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { continue; }
      if (msg.request_id !== undefined && pending.has(msg.request_id)) {
        pending.get(msg.request_id)(msg);
        pending.delete(msg.request_id);
      } else if (msg.event === 'file-loaded') {
        refreshMetadata();
      } else if (msg.event === 'video-reconfig') {
        // 视频参数就绪/变化（解码器重初始化后 video-params 才可用）→ 重跑决策链（去抖）
        clearTimeout(vrTimer);
        vrTimer = setTimeout(refreshMetadata, 300);
      }
    }
  });

  pipe.on('error', () => {
    pipe.destroy();
    if (retriesLeft > 0) setTimeout(() => connectPipe(retriesLeft - 1), 200);
  });
}

function mpvCommand(...args) {
  return new Promise((resolve) => {
    if (!pipe || pipe.destroyed) return resolve(null);
    const id = ++reqSeq;
    pending.set(id, resolve);
    pipe.write(JSON.stringify({ command: args, request_id: id }) + '\n');
  });
}

const mpvGet = (prop) =>
  mpvCommand('get_property', prop).then((r) => (r && r.error === 'success' ? r.data : null));

/* ---------------- HDR 画质决策链（docs/02 §4.3） ---------------- */

let hdrOverride = { mode: 'auto', algo: null };   // 控制台"视频"分页的用户覆盖
let lastDisplayHdr = false;
let lastLogSize = 0;

const MPV_LOG = () => path.join(app.getPath('userData'), 'mpv.log');

/**
 * 显示器 HDR 能力检测：mpv 无运行时属性（0.41 无 display-hdr-peak），
 * 解析 VO 日志 "Queried output: … colorspace: RGB_FULL_G2084_NONE_P2020"（G2084 = Windows HDR 开启）。
 * 仅在日志增长时重读（500ms 轮询驱动）。
 */
function detectDisplayHdr() {
  try {
    const f = MPV_LOG();
    const size = fs.statSync(f).size;
    if (size === lastLogSize) return lastDisplayHdr;
    lastLogSize = size;
    const fd = fs.openSync(f, 'r');
    let buf = Buffer.alloc(Math.min(size, 16384));
    fs.readSync(fd, buf, 0, buf.length, Math.max(0, size - buf.length));
    let text = buf.toString('latin1');
    if (!/Queried output:/.test(text) && size > buf.length) {
      // "Queried output" 在 VO 初始化早期打出，日志长大后会掉出尾部窗口 → 全量重读
      buf = Buffer.alloc(size);
      fs.readSync(fd, buf, 0, size, 0);
      text = buf.toString('latin1');
    }
    fs.closeSync(fd);
    const matches = [...text.matchAll(/Queried output:.*?colorspace: (\w+)/g)];
    if (!matches.length) return lastDisplayHdr;
    return /G2084/i.test(matches[matches.length - 1][1]);
  } catch {}
  return lastDisplayHdr;
}

async function hdrEvaluate() {
  if (!mpvProc) return null;
  const [gamma, primaries, sigPeak] = await Promise.all([
    mpvGet('video-params/gamma'),
    mpvGet('video-params/primaries'),
    mpvGet('video-params/sig-peak'),
  ]);
  if (!gamma) return null;   // video-reconfig 前参数未就绪
  lastDisplayHdr = detectDisplayHdr();
  const result = decide(
    { gamma, primaries, sigPeak },
    { hdr: lastDisplayHdr },
    hdrOverride,
  );
  for (const [k, v] of Object.entries(result.props)) {
    mpvCommand('set_property', k, v);
  }
  return result;
}

/* ---------------- 元数据（轨道/章节，file-loaded 时拉取） ---------------- */

async function refreshMetadata() {
  const [tracks, chapters, hdr] = await Promise.all([
    mpvGet('track-list'), mpvGet('chapter-list'), hdrEvaluate(),
  ]);
  const meta = {
    tracks: (tracks || []).map((t) => ({
      id: t.id, type: t.type, lang: t.lang || null,
      title: t.title || null, codec: t.codec || null,
      selected: !!t.selected, default: !!t.default,
    })),
    chapters: (chapters || []).map((c) => ({ title: c.title || null, time: c.time })),
    hdr,
  };
  pushMeta(meta);
  if (!hdr && hdrRetry++ < 6) setTimeout(refreshMetadata, 400); // video-params 未就绪，短轮询兜底
}

const pushStatus = (status) => {
  if (videoWin && !videoWin.isDestroyed()) videoWin.webContents.send('mpv:status', status);
};
const pushMeta = (meta) => {
  if (videoWin && !videoWin.isDestroyed()) videoWin.webContents.send('mpv:meta', meta);
};

/* ---------------- 状态轮询 → 推送到窗口 + DLNA 进程 ---------------- */

function dlnaSendState() {
  if (!dlnaProc) return;
  dlnaProc.postMessage({
    type: 'state',
    state: !currentPath ? 'NO_MEDIA_PRESENT' : (lastStatus.pause ? 'PAUSED_PLAYBACK' : 'PLAYING'),
    uri: currentPath, title: lastStatus.title,
    pos: lastStatus.timePos, dur: lastStatus.duration,
    volume: lastStatus.volume, mute: lastStatus.mute,
  });
}

let lastStatus = { title: null, timePos: null, duration: null, pause: true, volume: 100, mute: false };

function startStatusPolling() {
  if (statusTimer) return;
  statusTimer = setInterval(async () => {
    const [title, timePos, duration, pause, volume, mute] = await Promise.all([
      mpvGet('media-title'), mpvGet('time-pos'), mpvGet('duration'),
      mpvGet('pause'), mpvGet('volume'), mpvGet('mute'),
    ]);
    lastStatus = { title, timePos, duration, pause, volume, mute };
    const status = { ...lastStatus, path: currentPath, casting, idle: !mpvProc };
    pushStatus(status);
    dlnaSendState();
    // 记录续播位置
    if (currentPath && timePos != null && duration) updateRecentPosition(currentPath, timePos, duration);
    // 显示器 HDR 能力热变化（系统 HDR 开关/跨屏拖动）→ 重跑决策链
    if (currentPath && detectDisplayHdr() !== lastDisplayHdr) refreshMetadata();
  }, 500);
}

/* ---------------- 最近播放（userData/recent.json） ---------------- */

function readRecent() {
  try { return JSON.parse(fs.readFileSync(RECENT_FILE(), 'utf8')); } catch { return []; }
}

function writeRecent(list) {
  try { fs.writeFileSync(RECENT_FILE(), JSON.stringify(list.slice(0, RECENT_CAP), null, 2)); } catch {}
}

function addRecent(file) {
  const name = path.basename(file);
  const list = readRecent().filter((it) => it.path !== file);
  list.unshift({ path: file, name, at: Date.now() });
  writeRecent(list);
}

function updateRecentPosition(file, timePos, duration) {
  const list = readRecent();
  const it = list.find((x) => x.path === file);
  if (!it) return;
  it.position = Math.floor(timePos);
  it.duration = Math.floor(duration);
  writeRecent(list);
}

/* ---------------- 播放会话 ---------------- */

function startPlayback(file, seek, castingInfo) {
  stopPlayback();           // 先收掉旧会话
  currentPath = file;
  casting = castingInfo || null;  // DLNA 投屏会话（规格 §8：CASTING 徽标）
  addRecent(file);

  // 单窗方案：透明 Electron 窗，React 控制层在上，mpv 子窗口在下层透出
  videoWin = new BrowserWindow({
    width: 1280, height: 760, minWidth: 640, minHeight: 400,
    backgroundColor: '#00000000',
    transparent: true,
    title: 'Aurora Player',
    autoHideMenuBar: true,
    webPreferences: { preload: PRELOAD, contextIsolation: true, nodeIntegration: false },
  });
  videoWin.loadFile(DIST_HTML, { hash: '/player' });

  videoWin.once('ready-to-show', () => {
    const buf = videoWin.getNativeWindowHandle();
    const hwnd = Number(buf.length >= 8 ? buf.readBigUInt64LE(0) : buf.readUInt32LE(0));
    spawnMpv(hwnd, file, seek);
  });

  videoWin.on('enter-full-screen', () => { videoFs = true; });
  videoWin.on('leave-full-screen', () => { videoFs = false; });

  videoWin.on('closed', () => {
    videoWin = null;
    stopPlayback();
  });
}

function stopPlayback() {
  if (statusTimer) { clearInterval(statusTimer); statusTimer = null; }
  if (pipe && !pipe.destroyed) pipe.destroy();
  pipe = null;
  if (mpvProc) { mpvProc.kill(); mpvProc = null; }
  if (videoWin && !videoWin.isDestroyed()) videoWin.destroy();
  videoWin = null;
  currentPath = null;
  casting = null;
  videoFs = false;
  lastStatus = { title: null, timePos: null, duration: null, pause: true, volume: 100, mute: false };
  dlnaSendState();
}

/* ---------------- DLNA 独立进程（规格 docs/03；utilityProcess, Node 语义） ---------------- */

function startDlna() {
  const userData = app.getPath('userData');
  fs.mkdirSync(path.join(userData, 'logs'), { recursive: true });
  dlnaProc = utilityProcess.fork(DLNA_ENTRY, [], {
    env: {
      ...process.env,
      AURORA_DLNA_CFG: path.join(userData, 'dlna.json'),
      AURORA_DLNA_LOG: path.join(userData, 'logs', 'dlna.log'),
    },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  dlnaProc.stdout?.on('data', (d) => console.log('[dlna]', String(d).trim()));
  dlnaProc.stderr?.on('data', (d) => console.error('[dlna]', String(d).trim()));

  dlnaProc.on('message', (m) => {
    if (!m) return;
    if (m.type === 'ready') {
      dlnaState = { running: true, friendlyName: m.friendlyName, port: m.port };
      return;
    }
    if (m.type !== 'cmd') return;
    // 规格 §8 控制权仲裁：本地 UI > 远程 CP；CP 命令直接执行，状态经 LastChange 回推
    switch (m.cmd) {
      case 'load': startPlayback(m.uri, undefined, { cp: m.cp, title: m.title }); break;
      case 'play': mpvCommand('set_property', 'pause', false); break;
      case 'pause': mpvCommand('set_property', 'pause', true); break;
      case 'stop': stopPlayback(); break;
      case 'seek': mpvCommand('seek', m.seconds, 'absolute'); break;
      case 'volume': mpvCommand('set_property', 'volume', m.value); break;
      case 'mute': mpvCommand('set_property', 'mute', m.value); break;
    }
  });
  dlnaProc.on('exit', (code) => {
    dlnaState.running = false;
    dlnaProc = null;
    console.error('[dlna] exited', code);
  });
}

/* ---------------- IPC ---------------- */

ipcMain.handle('mpv:command', (_e, args) => mpvCommand(...args));

ipcMain.handle('app:open-file', async () => {
  const target = videoWin && !videoWin.isDestroyed() ? videoWin : homeWin;
  const { canceled, filePaths } = await dialog.showOpenDialog(target, {
    title: '打开视频文件',
    properties: ['openFile'],
    filters: [
      { name: '视频文件', extensions: ['mkv', 'mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'ts', 'm2ts', 'rmvb'] },
      { name: '所有文件', extensions: ['*'] },
    ],
  });
  if (canceled || !filePaths[0]) return;
  startPlayback(filePaths[0]);
});

ipcMain.handle('app:open-path', (_e, file, seek) => startPlayback(file, seek));
ipcMain.handle('app:stop', () => stopPlayback());
ipcMain.handle('recent:list', () => readRecent());
ipcMain.handle('dlna:state', () => dlnaState);
ipcMain.handle('hdr:override', async (_e, o) => {
  hdrOverride = { mode: o?.mode || 'auto', algo: o?.algo || null };
  await refreshMetadata();   // 重跑决策链并推送新 meta
});
ipcMain.handle('app:toggle-fullscreen', () => {
  if (videoWin && !videoWin.isDestroyed()) videoWin.setFullScreen(!videoFs);
});

/* 手动拖拽：透明窗在 Windows 上 -webkit-app-region:drag 失效（Electron 已知问题），
   改为渲染层报起止，主进程跟随光标语义移动（16ms 节流） */
const { screen } = require('electron');
let dragTimer = null;
ipcMain.on('win:drag-start', () => {
  if (!videoWin || videoWin.isDestroyed() || videoWin.isFullScreen()) return;
  const startCursor = screen.getCursorScreenPoint();
  const [startX, startY] = videoWin.getPosition();
  clearInterval(dragTimer);
  dragTimer = setInterval(() => {
    if (!videoWin || videoWin.isDestroyed()) return clearInterval(dragTimer);
    const cur = screen.getCursorScreenPoint();
    videoWin.setPosition(startX + cur.x - startCursor.x, startY + cur.y - startCursor.y);
  }, 16);
});
ipcMain.on('win:drag-end', () => clearInterval(dragTimer));

/* 手动边缘缩放：透明窗无原生边框，8 向热区 → 主进程按方向改 bounds（16ms 节流，最小 640×400） */
let resizeTimer = null;
ipcMain.on('win:resize-start', (_e, dir) => {
  if (!videoWin || videoWin.isDestroyed() || videoWin.isFullScreen() || videoWin.isMaximized()) return;
  const startCursor = screen.getCursorScreenPoint();
  const b = videoWin.getBounds();
  clearInterval(resizeTimer);
  resizeTimer = setInterval(() => {
    if (!videoWin || videoWin.isDestroyed()) return clearInterval(resizeTimer);
    const cur = screen.getCursorScreenPoint();
    const dx = cur.x - startCursor.x, dy = cur.y - startCursor.y;
    let { x, y, width, height } = b;
    if (dir.includes('e')) width = b.width + dx;
    if (dir.includes('s')) height = b.height + dy;
    if (dir.includes('w')) { width = b.width - dx; x = b.x + dx; }
    if (dir.includes('n')) { height = b.height - dy; y = b.y + dy; }
    if (width < 640) { if (dir.includes('w')) x += width - 640; width = 640; }
    if (height < 400) { if (dir.includes('n')) y += height - 400; height = 400; }
    videoWin.setBounds({ x, y, width, height });
  }, 16);
});
ipcMain.on('win:resize-end', () => clearInterval(resizeTimer));
ipcMain.on('win:minimize', () => { if (videoWin && !videoWin.isDestroyed()) videoWin.minimize(); });
ipcMain.on('win:maximize-toggle', () => {
  if (!videoWin || videoWin.isDestroyed()) return;
  if (videoWin.isMaximized()) videoWin.unmaximize(); else videoWin.maximize();
});

/* ---------------- 首页窗口 + 菜单 ---------------- */

function createHomeWindow() {
  homeWin = new BrowserWindow({
    width: 1280, height: 800, minWidth: 960, minHeight: 640,
    backgroundColor: '#0A0A0A',
    title: 'Aurora Player',
    autoHideMenuBar: true,
    webPreferences: { preload: PRELOAD, contextIsolation: true, nodeIntegration: false },
  });
  homeWin.loadFile(DIST_HTML, { hash: '/home' });
  homeWin.on('closed', () => { homeWin = null; });
}

function buildMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: '文件',
      submenu: [
        { label: '打开视频…', accelerator: 'CmdOrCtrl+O', click: () => {
            // 直接走与 IPC 相同的逻辑
            const wc = homeWin && !homeWin.isDestroyed() ? homeWin.webContents : null;
            if (wc) wc.executeJavaScript('window.aurora && window.aurora.openFile()');
          } },
        { type: 'separator' },
        { label: '退出', role: 'quit' },
      ],
    },
  ]));
}

app.whenReady().then(() => {
  if (!fs.existsSync(MPV_EXE)) {
    dialog.showErrorBox('缺少 mpv 运行时', `未找到 ${MPV_EXE}`);
    app.quit();
    return;
  }
  buildMenu();
  startDlna();
  // 命令行带视频文件路径时直接播放（文件关联/拖放 exe 的基础）
  const fileArg = process.argv.slice(2).find((a) => fs.existsSync(a) && fs.statSync(a).isFile());
  if (fileArg) startPlayback(path.resolve(fileArg));
  else createHomeWindow();
});

app.on('before-quit', () => {
  stopPlayback();
  if (dlnaProc) { dlnaProc.kill(); dlnaProc = null; }
});
app.on('window-all-closed', () => app.quit());
