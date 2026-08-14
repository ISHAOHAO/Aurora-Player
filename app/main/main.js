/**
 * Aurora Player — 主进程
 * 窗口模型（单窗方案）：唯一主窗口 transparent 透明窗，React hash 路由 #/home、
 * #/settings、#/player 同窗切换；首页/设置 body 不透明遮住下层，播放路由 body
 * 透明透出 mpv --wid 子窗口（黑屏根因：Chromium DComp 合成层遮盖 mpv 子窗口，
 * 故窗口必须 transparent）。
 */
const { app, BrowserWindow, Menu, dialog, ipcMain, utilityProcess, Tray, nativeImage, screen } = require('electron');
const { spawn } = require('child_process');
const net = require('net');
const path = require('path');
const fs = require('fs');
const { decide } = require('./hdr');
const db = require('./db');

const MPV_EXE = path.join(__dirname, '..', '..', 'runtime', 'mpv', 'mpv.exe');
const PIPE_PATH = '\\\\.\\pipe\\aurora-mpv';
const DIST_HTML = path.join(__dirname, '..', 'renderer', 'dist', 'index.html');
const PRELOAD = path.join(__dirname, '..', 'preload', 'preload.js');
const DLNA_ENTRY = path.join(__dirname, '..', 'dlna', 'dlna.js');
const RECENT_FILE = () => path.join(app.getPath('userData'), 'recent.json');
const SETTINGS_FILE = () => path.join(app.getPath('userData'), 'settings.json');
const RECENT_CAP = 10;

/* ---------------- 设置（规范 §3.4） ---------------- */
const DEFAULT_SETTINGS = {
  theme: 'auto',            // auto | light | dark
  rememberPosition: true,
  volumeStep: 2,            // 滚轮步进
  defaultVolume: 100,
  subFontSize: 34,
  audioGain: 0,             // 增益 -60..+30 dB（D33）
  audioEq: null,            // 10 段 EQ 数组 [-12..+12]，null=关闭（D33）
  replayGain: 'off',        // off | track | album（D33）
  audioNormalize: false,    // dynaudnorm 动态归一化（D33）
  audioChannels: 'auto-safe', // 声道映射 auto-safe/stereo/5.1/7.1（D33）
  audioExclusive: false,    // WASAPI 独占（D33）
  audioBitstream: 'none',   // SPDIF 透传 none/ac3/eac3/dts/dtshd/truehd（D33）
  hdrMode: 'auto',          // auto | passthrough | tonemap
  hdrAlgo: 'spline',
  dlnaEnabled: true,
  dlnaFriendlyName: 'Aurora Player',
  bgCasting: false,         // 后台接收投屏（关窗不退应用）
  lockPolicy: 'none',       // none | takeover | full（规格 §8：投屏期间本地控制权策略）
  libraryFolders: [],       // 媒体库文件夹
  targetPeak: 0,            // HDR 高级调参：目标峰值 nits（0=自动）
  targetContrast: 0,        // 对比度恢复（0=自动）
  saturation: 0,            // 饱和度 -1..1
  hdrPeakPercentile: 99.995,// 峰值检测百分位（高光恢复）
  visualMode: 'cinema',      // 视觉模式六态（规范 §5）：cinema/aurora/minimal/glass/oled/custom（D26）
  shaderDir: '',             // 用户 Shader 目录（D32；空 = 不启用）
  shaders: [],               // 已启用的 .glsl/.hook 列表（D32）
};

function readSettings() {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(SETTINGS_FILE(), 'utf8')) }; }
  catch { return { ...DEFAULT_SETTINGS }; }
}
let settings = { ...DEFAULT_SETTINGS };   // 磁盘读取延迟到 whenReady（app.getPath 需 ready 后才可靠）
function writeSettings() {
  try { fs.writeFileSync(SETTINGS_FILE(), JSON.stringify(settings, null, 2)); } catch {}
}

let homeWin = null;
let mpvProc = null;
let currentPath = null;
let casting = null;          // { cp, title } — DLNA 投屏会话标识
let dlnaProc = null;
let dlnaState = { running: false, friendlyName: 'Aurora Player', port: 0 };
let videoFs = false;         // 透明窗 isFullScreen() 回报不可靠，事件自行跟踪
let quitting = false;        // 托盘/菜单退出标志（bgCasting 模式下区分关窗与退出）

/* 规格 §8 控制权仲裁：本地 UI > 远程 CP；双向互抢（3s 内）→ Toast */
let lastRemoteCmdAt = 0;
let lastLocalCmdAt = 0;
let lastToastAt = 0;
function sendCastToast(text) {
  if (homeWin && !homeWin.isDestroyed()) homeWin.webContents.send('cast:toast', text);
}
function maybeCastToast() {
  if (!casting) return;
  const now = Date.now();
  if (now - lastToastAt < 3000) return;
  lastToastAt = now;
  sendCastToast(`正在由 ${casting.cp} 投放`);
}
function markRemote() {
  lastRemoteCmdAt = Date.now();
  if (lastLocalCmdAt && Date.now() - lastLocalCmdAt < 3000) maybeCastToast();
}
function markLocal() {
  lastLocalCmdAt = Date.now();
  if (lastRemoteCmdAt && Date.now() - lastRemoteCmdAt < 3000) maybeCastToast();
}

let pipe = null;
let reqSeq = 0;
const pending = new Map();
let statusTimer = null;
let vrTimer = null;
let hdrRetry = 0;
let forceSoftwareDecode = false;   // D25 错误卡片「切换软件解码」
let loadPending = false;           // D25：载入请求未确认（file-loaded 前为 true）
let perfDegrade = { tier: 0, since: 0, notified: false };   // D34 自动性能降级

/* ---------------- mpv 进程 ---------------- */

function spawnMpv(hwnd, file, seek) {
  // 调试开关（黑屏定位用，见 docs/05-实现偏差清单.md）：
  //   AURORA_VO=direct3d   强制 VO
  //   AURORA_HWDEC=no      关闭硬解
  //   AURORA_MPV_EXTRA='["--x","y"]'  追加任意参数
  const extra = JSON.parse(process.env.AURORA_MPV_EXTRA || '[]');
  const hwdec = forceSoftwareDecode ? 'no' : (process.env.AURORA_HWDEC || 'auto-safe');
  mpvProc = spawn(MPV_EXE, [
    `--wid=${hwnd}`,
    `--input-ipc-server=${PIPE_PATH}`,
    '--idle=yes',              // 载入失败也保持进程存活（否则 pipe 随进程退出，end-file 事件丢失）
    '--keep-open=yes',
    '--no-terminal',
    '--osc=no',                // M2：自绘控制层，关掉 mpv OSC
    '--osd-level=1',
    `--hwdec=${hwdec}`,
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
        loadPending = false;
        // 应用设置默认值（每新文件一次）
        mpvCommand('set_property', 'volume', settings.defaultVolume);
        mpvCommand('set_property', 'sub-font-size', settings.subFontSize);
        applyAudioSettings();
        applyShaders();
        refreshMetadata();
      } else if (msg.event === 'video-reconfig') {
        // 视频参数就绪/变化（解码器重初始化后 video-params 才可用）→ 重跑决策链（去抖）
        clearTimeout(vrTimer);
        vrTimer = setTimeout(refreshMetadata, 300);
      } else if (msg.event === 'end-file' && msg.reason === 'error') {
        // 播放失败（D25）：无法识别格式/解码初始化失败等 → 组装错误对象推给渲染层
        pushPlaybackError();
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

let hdrOverride = { mode: 'auto', algo: null };   // 启动后由 settings 初始化（见 whenReady）
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
    { targetPeak: settings.targetPeak, targetContrast: settings.targetContrast,
      saturation: settings.saturation, hdrPeakPercentile: settings.hdrPeakPercentile },
  );
  for (const [k, v] of Object.entries(result.props)) {
    mpvCommand('set_property', k, v);
  }
  return result;
}

/* ---------------- 缩略图进程（规范 §4 SeekBar 缩略图气泡；消化 D13） ----------------
   独立 mpv --vo=image --sstep=N 抽帧到 userData/thumbs/<hash>/；
   悬停时按时间映射最近帧。网络流/短视频跳过。 */

const crypto = require('crypto');
let thumbProc = null;
let thumbs = null;   // { dir, interval, count, files: string[]|null }

function startThumbs(file, duration) {
  stopThumbs();
  if (!duration || duration < 15 || /^https?:/i.test(file)) return;
  const key = crypto.createHash('md5').update(`${file}|${Math.round(duration)}`).digest('hex').slice(0, 12);
  const dir = path.join(app.getPath('userData'), 'thumbs', key);
  const interval = Math.max(2, Math.round(duration / 160));
  thumbs = { dir, interval, duration, files: null };
  // 缓存命中（.done 标记 + 有帧）
  try {
    if (fs.existsSync(path.join(dir, '.done'))) {
      const existing = fs.readdirSync(dir).filter((f) => f.endsWith('.jpg')).sort();
      if (existing.length) { thumbs.files = existing; return; }
    }
  } catch {}

  fs.mkdirSync(dir, { recursive: true });
  thumbProc = spawn(MPV_EXE, [
    '--no-config', '--no-audio', '--no-sub',
    '--vo=image', '--vo-image-format=jpg', '--vo-image-jpeg-quality=80',
    `--vo-image-outdir=${dir}`, `--sstep=${interval}`,
    '--no-terminal', file,
  ], { stdio: 'ignore' });
  thumbProc.on('exit', () => {
    thumbProc = null;
    if (!thumbs || thumbs.dir !== dir) return;
    try {
      thumbs.files = fs.readdirSync(dir).filter((f) => f.endsWith('.jpg')).sort();
      if (thumbs.files.length) fs.writeFileSync(path.join(dir, '.done'), String(thumbs.files.length));
    } catch {}
  });
}

function stopThumbs() {
  if (thumbProc) { thumbProc.kill(); thumbProc = null; }
  thumbs = null;
}

/* 用户 Shader（D32）：.glsl/.hook 加载 + 静态校验（禁止文件/网络 IO 内置函数） */
const SHADER_FORBIDDEN = ['texture(', 'sample(', 'ImageLoad', 'gl_FragCoord', 'fopen', 'read(', 'write(', 'load(', 'store('];

function validateShader(content) {
  const forbidden = [];
  for (const tok of SHADER_FORBIDDEN) {
    if (content.includes(tok)) forbidden.push(tok);
  }
  return { ok: forbidden.length === 0, forbidden };
}

function listShaders(dir) {
  try {
    if (!dir || !fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter((f) => /\.(glsl|hook)$/i.test(f));
  } catch { return []; }
}

function applyShaders() {
  if (!settings.shaderDir || !settings.shaders.length) {
    mpvCommand('set_property', 'glsl-shaders', '');
    return;
  }
  const paths = settings.shaders
    .map((f) => path.join(settings.shaderDir, path.basename(f)))
    .filter((p) => fs.existsSync(p));
  mpvCommand('set_property', 'glsl-shaders', paths.join(';'));
}

/* ---------------- 元数据（轨道/章节，file-loaded 时拉取） ---------------- */

/* 音频高级处理（D33）：增益/EQ/ReplayGain/Normalize/声道/WASAPI 独占/Bitstream */
function applyAudioSettings() {
  mpvCommand('set_property', 'volume-gain', settings.audioGain ?? 0);
  mpvCommand('set_property', 'replaygain', settings.replayGain ?? 'off');
  mpvCommand('set_property', 'audio-exclusive', settings.audioExclusive ? 'yes' : 'no');
  mpvCommand('set_property', 'audio-spdif', settings.audioBitstream === 'none' ? '' : settings.audioBitstream);
  if (settings.audioChannels && settings.audioChannels !== 'auto-safe') {
    mpvCommand('set_property', 'audio-channels', settings.audioChannels);
  } else {
    mpvCommand('set_property', 'audio-channels', 'auto-safe');
  }
  // EQ + Normalize：经 af 滤镜链（equalizer 为 two-pole peaking EQ；dynaudnorm 动态归一化）
  const af = [];
  if (settings.audioNormalize) af.push('dynaudnorm');
  if (Array.isArray(settings.audioEq) && settings.audioEq.some((v) => v !== 0)) {
    const FREQS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
    settings.audioEq.forEach((gain, i) => {
      if (gain !== 0) af.push(`equalizer=f=${FREQS[i]}:g=${gain}`);
    });
  }
  mpvCommand('set_property', 'af', af.join(','));
}

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
  if (homeWin && !homeWin.isDestroyed()) homeWin.webContents.send('mpv:status', status);
};
const pushMeta = (meta) => {
  if (homeWin && !homeWin.isDestroyed()) homeWin.webContents.send('mpv:meta', meta);
};

/* ---------------- 播放失败错误卡片（规范 §6，消化 D25） ----------------
   四段式：原因 / 已尝试 / 操作按钮。mpv end-file reason=error 时触发，
   从 mpv.log 尾部提取最后一条 [e] 错误行作为原因。 */

const pushPlaybackError = (overrides) => {
  if (!homeWin || homeWin.isDestroyed()) return;
  const file = currentPath;
  const reason = overrides?.reason || readLastMpvError();
  const attempted = overrides?.attempted
    || `硬件解码(${process.env.AURORA_HWDEC || 'auto-safe'}) → 软件解码兜底`;
  const err = {
    file,
    reason: reason || '未知错误（详见 mpv 日志）',
    attempted,
  };
  homeWin.webContents.send('mpv:error', err);
};

/** 从 mpv.log 尾部（最后 32KB）提取最后一条 [e] 错误行 */
function readLastMpvError() {
  try {
    const f = MPV_LOG();
    const size = fs.statSync(f).size;
    if (!size) return null;
    const fd = fs.openSync(f, 'r');
    const len = Math.min(size, 32768);
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, size - len);
    fs.closeSync(fd);
    const lines = buf.toString('utf8').split('\n').filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
      const m = lines[i].match(/\]\[e\]\[[^\]]+\]\s*(.*)$/);
      if (m) return m[1].trim();
    }
  } catch {}
  return null;
}

/* ---------------- 状态轮询 → 推送到窗口 + DLNA 进程 ---------------- */

function dlnaSendState() {
  if (!dlnaProc) return;
  const volume = lastStatus.volume ?? 100;
  const mute = lastStatus.mute === true;
  dlnaProc.postMessage({
    type: 'state',
    state: !currentPath ? 'NO_MEDIA_PRESENT' : (lastStatus.pause ? 'PAUSED_PLAYBACK' : 'PLAYING'),
    uri: currentPath, title: lastStatus.title,
    pos: lastStatus.timePos, dur: lastStatus.duration,
    volume, mute,
    volumeChanged: lastSentVolume !== null && volume !== lastSentVolume,
    muteChanged: lastSentMute !== null && mute !== lastSentMute,
    eof: lastStatus.eof === true,
  });
  lastSentVolume = volume;
  lastSentMute = mute;
}

let lastStatus = { title: null, timePos: null, duration: null, pause: true, volume: 100, mute: false, eof: false };
let lastSentVolume = null;
let lastSentMute = null;
let thumbsStarted = false;

/* D34 自动性能降级：缩放预设档 节能→平衡→高画质→极致（0..3，越大越贵）。
   丢帧率 >0.5% 持续 5s 降一档；恢复 30s 稳定不自动升档（防抖动，仅 Toast 提示）。 */
const SCALE_TIERS = [
  { up: 'bilinear', down: 'bilinear' },                    // 节能
  { up: 'spline36', down: 'bicubic' },                     // 平衡（默认）
  { up: 'ewa_lanczos', down: 'spline36' },                 // 高画质
  { up: 'ewa_lanczossharp', down: 'ewa_lanczos' },         // 极致
];
const DEGRADE_DROP_RATE = 0.005;   // 0.5%
const DEGRADE_WINDOW_MS = 5000;
const DEGRADE_RECOVER_MS = 30000;
let perfBaseTier = 1;
let perfDropsAccum = 0;
let perfFramesAccum = 0;
let perfWindowStart = 0;
let perfRecoverSince = 0;
let perfTier = 1;

function autoPerfDegrade(drops, vfFps, containerFps) {
  if (!currentPath || !mpvProc) { perfDropsAccum = 0; perfFramesAccum = 0; return; }
  const now = Date.now();
  if (!perfWindowStart) perfWindowStart = now;
  // 累加本窗口丢帧与输出帧
  perfDropsAccum += (drops ?? 0);
  perfFramesAccum += Math.round((vfFps ?? 0) * 0.5);   // 0.5s 轮询
  if (now - perfWindowStart >= DEGRADE_WINDOW_MS) {
    const rate = perfFramesAccum > 0 ? perfDropsAccum / perfFramesAccum : 0;
    if (rate > DEGRADE_DROP_RATE && perfTier > 0) {
      perfTier--;
      applyScaleTier(perfTier);
      sendCastToast(`性能自动降级：缩放 ${['节能', '平衡', '高画质', '极致'][perfTier]}（丢帧 ${(rate * 100).toFixed(1)}%）`);
      perfRecoverSince = now;
    } else if (rate <= DEGRADE_DROP_RATE && perfTier < perfBaseTier) {
      if (!perfRecoverSince) perfRecoverSince = now;
      if (now - perfRecoverSince >= DEGRADE_RECOVER_MS) {
        // 恢复稳定 → 不自动升档（防抖动），仅提示
        perfRecoverSince = now;
      }
    } else {
      perfRecoverSince = 0;
    }
    perfDropsAccum = 0; perfFramesAccum = 0; perfWindowStart = now;
  }
}

function applyScaleTier(tier) {
  const t = SCALE_TIERS[tier] || SCALE_TIERS[1];
  mpvCommand('set_property', 'scale', t.up);
  mpvCommand('set_property', 'dscale', t.down);
  mpvCommand('set_property', 'cscale', t.down);
}

function startStatusPolling() {
  if (statusTimer) return;
  statusTimer = setInterval(async () => {
    const [title, timePos, duration, pause, volume, mute, eof,
      codec, vw, vh, fps, vfFps, drops, hwdec, vo, vb, ab, cacheDur, idleActive] = await Promise.all([
      mpvGet('media-title'), mpvGet('time-pos'), mpvGet('duration'),
      mpvGet('pause'), mpvGet('volume'), mpvGet('mute'),
      mpvGet('eof-reached'),
      mpvGet('video-codec'), mpvGet('video-params/w'), mpvGet('video-params/h'),
      mpvGet('container-fps'), mpvGet('estimated-vf-fps'), mpvGet('frame-drop-count'),
      mpvGet('hwdec-current'), mpvGet('current-vo'),
      mpvGet('video-bitrate'), mpvGet('audio-bitrate'), mpvGet('demuxer-cache-duration'),
      mpvGet('idle-active'),
    ]);
    lastStatus = { title, timePos, duration, pause, volume, mute, eof: eof === true };
    const stats = { codec, w: vw, h: vh, fps, vfFps, drops, hwdec, vo, vBitrate: vb, aBitrate: ab, cacheDur };
    const status = { ...lastStatus, path: currentPath, casting, lockPolicy: settings.lockPolicy, idle: !mpvProc, stats };
    pushStatus(status);
    dlnaSendState();
    // D25 载入失败判定：请求了文件但未收到 file-loaded，且 mpv 回到 idle → 失败
    if (loadPending && idleActive === true) {
      loadPending = false;
      pushPlaybackError();
    }
    // D34 自动性能降级：丢帧率 >0.5% 持续 5s → 逐级降缩放（永不降源分辨率/帧率）
    autoPerfDegrade(drops, vfFps, fps);
    // 记录续播位置
    if (currentPath && timePos != null && duration) updateRecentPosition(currentPath, timePos, duration);
    // 首次拿到时长 → 启动缩略图抽帧
    if (currentPath && duration && !thumbsStarted) { thumbsStarted = true; startThumbs(currentPath, duration); }
    // 显示器 HDR 能力热变化（系统 HDR 开关/跨屏拖动）→ 重跑决策链
    if (currentPath && detectDisplayHdr() !== lastDisplayHdr) refreshMetadata();
  }, 500);
}

/* ---------------- 最近播放（SQLite play_history；D35） ---------------- */

function readRecent() {
  try { return db.recentList(); } catch { return []; }
}

function writeRecent() { /* no-op：写路径已并入 db.recentAdd/recentUpdatePosition */ }

function addRecent(file) {
  try { db.recentAdd(file, path.basename(file), Date.now()); } catch {}
}

function updateRecentPosition(file, timePos, duration) {
  if (!settings.rememberPosition) return;
  try { db.recentUpdatePosition(file, Math.floor(timePos), Math.floor(duration)); } catch {}
}

/* ---------------- 播放会话（单窗：mpv 嵌入唯一主窗口，路由切换 home/player） ---------------- */

/** 主进程 → 渲染层：切换 hash 路由（渲染层 hashchange 驱动 React 路由） */
function goto(route) {
  if (homeWin && !homeWin.isDestroyed()) homeWin.webContents.send('nav:goto', route);
}

function startPlayback(file, seek, castingInfo) {
  cleanupPlayback();          // 先收掉旧会话（不切路由，避免闪一下 home）
  currentPath = file;
  casting = castingInfo || null;  // DLNA 投屏会话（规格 §8：CASTING 徽标）
  addRecent(file);
  loadPending = true;   // D25：等待 file-loaded 确认；超时+idle-active → 判定失败

  // 单窗：复用唯一主窗口（透明），mpv --wid 嵌入其 HWND 在下层透出
  const doSpawn = () => {
    const buf = homeWin.getNativeWindowHandle();
    const hwnd = Number(buf.length >= 8 ? buf.readBigUInt64LE(0) : buf.readUInt32LE(0));
    spawnMpv(hwnd, file, seek);
  };
  if (!homeWin || homeWin.isDestroyed()) {
    // 冷启动（命令行带文件路径）：直接以播放路由加载，避免 nav:goto 与渲染层监听注册竞态
    createHomeWindow('/player');
    // transparent 窗 ready-to-show 不可靠（偶发不触发）→ did-finish-load + 3s 超时双兜底
    let spawned = false;
    const safeSpawn = () => { if (!spawned) { spawned = true; doSpawn(); } };
    homeWin.once('ready-to-show', safeSpawn);
    homeWin.webContents.once('did-finish-load', safeSpawn);
    setTimeout(safeSpawn, 3000);
  } else {
    homeWin.show();
    doSpawn();
    goto('player');
  }
}

function cleanupPlayback() {
  if (statusTimer) { clearInterval(statusTimer); statusTimer = null; }
  if (pipe && !pipe.destroyed) pipe.destroy();
  pipe = null;
  if (mpvProc) { mpvProc.kill(); mpvProc = null; }
  stopThumbs();
  thumbsStarted = false;
  currentPath = null;
  casting = null;
  videoFs = false;
  loadPending = false;
  perfTier = perfBaseTier; perfDropsAccum = 0; perfFramesAccum = 0; perfWindowStart = 0; perfRecoverSince = 0;
  lastStatus = { title: null, timePos: null, duration: null, pause: true, volume: 100, mute: false, eof: false };
  lastSentVolume = null;
  lastSentMute = null;
  dlnaSendState();
}

function stopPlayback() {
  const wasFs = videoFs;
  cleanupPlayback();
  if (wasFs && homeWin && !homeWin.isDestroyed()) homeWin.setFullScreen(false);
  goto('home');   // 返回首页
}

/* ---------------- 防火墙自检（规格 §9：缺失则添加，结果记日志） ---------------- */

function ensureFirewallRules(port) {
  const { execFile } = require('child_process');
  const logFile = path.join(app.getPath('userData'), 'logs', 'dlna.log');
  const log = (s) => { try { fs.appendFileSync(logFile, `[${new Date().toISOString()}] [fw] ${s}\n`); } catch {} };
  const rules = [
    ['Aurora Player DLNA', 'TCP', String(port)],
    ['Aurora Player SSDP', 'UDP', '1900'],
  ];
  for (const [name, proto, lport] of rules) {
    execFile('netsh', ['advfirewall', 'firewall', 'show', 'rule', `name=${name}`], (err, stdout) => {
      if (!err && stdout && stdout.includes(name)) return;   // 已存在
      execFile('netsh', ['advfirewall', 'firewall', 'add', 'rule',
        `name=${name}`, 'dir=in', 'action=allow', `protocol=${proto}`, `localport=${lport}`],
        (e2) => log(e2 ? `添加失败 ${name}: ${e2.message}(需管理员)` : `已添加入站规则 ${name} ${proto}/${lport}`));
    });
  }
}

/* ---------------- DLNA 独立进程（规格 docs/03；utilityProcess, Node 语义） ---------------- */

function startDlna() {
  if (!settings.dlnaEnabled) { dlnaState = { ...dlnaState, running: false }; return; }
  const userData = app.getPath('userData');
  // settings 为 friendlyName 唯一事实源 → 同步进 dlna 配置
  const dlnaCfgFile = path.join(userData, 'dlna.json');
  try {
    const c = JSON.parse(fs.readFileSync(dlnaCfgFile, 'utf8'));
    c.friendlyName = settings.dlnaFriendlyName;
    fs.writeFileSync(dlnaCfgFile, JSON.stringify(c, null, 2));
  } catch {}
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
      updateTrayMenu();
      ensureFirewallRules(m.port);
      return;
    }
    if (m.type !== 'cmd') return;
    // 规格 §8 控制权仲裁：本地 UI > 远程 CP；CP 命令直接执行，状态经 LastChange 回推
    switch (m.cmd) {
      case 'load': startPlayback(m.uri, undefined, { cp: m.cp, title: m.title }); break;
      case 'play': markRemote(); mpvCommand('set_property', 'pause', false); break;
      case 'pause': markRemote(); mpvCommand('set_property', 'pause', true); break;
      case 'stop': stopPlayback(); break;
      case 'seek': markRemote(); mpvCommand('seek', m.seconds, 'absolute'); break;
      case 'volume': markRemote(); mpvCommand('set_property', 'volume', m.value); break;
      case 'mute': markRemote(); mpvCommand('set_property', 'mute', m.value); break;
    }
  });
  dlnaProc.on('exit', (code) => {
    dlnaState.running = false;
    dlnaProc = null;
    console.error('[dlna] exited', code);
  });
}

/* ---------------- 打开文件流程（菜单/首页/托盘共用） ---------------- */

async function openFileFlow() {
  const target = homeWin && !homeWin.isDestroyed() ? homeWin : null;
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
}

/* ---------------- 媒体库（本地刮削：文件名解析 + nfo + 同目录封面；无在线依赖；SQLite 持久化 D35） ---------------- */

const LIBRARY_FILE = () => path.join(app.getPath('userData'), 'library.json');   // 仅作迁移源，迁移后 .bak
const LIBRARY_SCHEMA = 2;   // v2：新增 specs 规格标签（D27）
const POSTER_DIR = () => path.join(app.getPath('userData'), 'posters');
const VIDEO_EXTS = new Set(['mkv', 'mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'ts', 'm2ts', 'rmvb', 'mpg', 'mpeg']);
const POSTER_NAMES = ['poster.jpg', 'poster.png', 'folder.jpg', 'cover.jpg', 'cover.png'];

let library = [];
try { library = db.allMedia(); } catch {}
let scanning = false;

function saveLibrary() {
  try { db.replaceMedia(library); } catch {}
}

function notifyLibrary() {
  if (homeWin && !homeWin.isDestroyed()) homeWin.webContents.send('library:updated', library);
}

/** 文件名解析：标题/年份/剧集号（S01E02 / E02 / 第02集） */
function parseName(filename) {
  const base = filename.replace(/\.[^.]+$/, '');
  let title = base, year = null, season = null, episode = null;
  let m = base.match(/[Ss](\d{1,2})[Ee](\d{1,3})/) || base.match(/第\s*(\d{1,3})\s*[集话]/);
  if (m) {
    if (m.length === 3) { season = +m[1]; episode = +m[2]; } else { episode = +m[1]; }
    title = base.slice(0, m.index);
  }
  // 年份取最后一个 19xx/20xx 匹配（片名自带数字年份时，发行年通常在后："Blade.Runner.2049.2017.1080p"）
  const years = [...title.matchAll(/(?:19|20)\d{2}/g)];
  if (years.length) {
    const last = years[years.length - 1];
    year = +last[0];
    title = title.slice(0, last.index);
  }
  title = title
    .replace(/[\[【(（].*?(?:[\]】)）])/g, ' ')    // 制作组/标签括号
    .replace(/[._]+/g, ' ')
    .replace(/\b(1080p|720p|2160p|4k|8k|bluray|blu-ray|web-?dl|webrip|hdtv|hdr|hevc|x26[45]|avc|aac|dts|remux)\b.*$/i, '')
    .replace(/[-–—\s]+$/, '')
    .trim();
  return { title: title || base, year, season, episode };
}

/** 规格标签提取（D27）：分辨率 / HDR / ASS 字幕，从文件名+同目录 .ass 探测 */
function parseSpecs(filename, dir) {
  const s = filename.replace(/\.[^.]+$/, '');
  const low = s.toLowerCase();
  const specs = { res: null, hdr: null, sub: null };
  if (/\b(2160p|4k|uhd)\b/.test(low)) specs.res = '4K';
  else if (/\b1080p\b/.test(low)) specs.res = '1080p';
  else if (/\b720p\b/.test(low)) specs.res = '720p';
  if (/\b(dv|dovi|dolby.?vision)\b/.test(low)) specs.hdr = 'Dolby Vision';
  else if (/\b(hdr10\+|hdr10plus)\b/.test(low)) specs.hdr = 'HDR10+';
  else if (/\b(hdr10|hdr|pq)\b/.test(low)) specs.hdr = 'HDR10';
  else if (/\bhlg\b/.test(low)) specs.hdr = 'HLG';
  if (/\bass\b/.test(low)) specs.sub = 'ASS';
  if (!specs.sub && dir) {
    // 同目录 .ass 字幕文件（整目录算一次，命中任一即标记）
    try {
      if (fs.readdirSync(dir).some((f) => /\.ass$/i.test(f))) specs.sub = 'ASS';
    } catch {}
  }
  return specs;
}

/** nfo 容错解析（<title>/<year>） */
function readNfo(dir, base) {
  for (const name of [`${base}.nfo`, 'movie.nfo', 'tvshow.nfo']) {
    try {
      const xml = fs.readFileSync(path.join(dir, name), 'utf8');
      if (/<!DOCTYPE|<!ENTITY/i.test(xml)) continue;
      const t = xml.match(/<title>([^<]+)<\/title>/i);
      const y = xml.match(/<year>(\d{4})<\/year>/i);
      if (t) return { title: t[1].trim(), year: y ? +y[1] : null };
    } catch {}
  }
  return null;
}

/** 同目录封面探测 */
function findPoster(dir, base) {
  for (const name of [...POSTER_NAMES, `${base}-poster.jpg`, `${base}.jpg`]) {
    const p = path.join(dir, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/** 递归收集视频文件（深度≤4，跳隐藏目录，上限 2000） */
function walkVideos(dir, depth = 0, out = []) {
  if (depth > 4 || out.length > 2000) return out;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.name.startsWith('.') || e.name.startsWith('$')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walkVideos(full, depth + 1, out);
    else if (VIDEO_EXTS.has(e.name.split('.').pop().toLowerCase())) out.push(full);
  }
  return out;
}

let coverQueue = [];
let coverRunning = false;

/** 无封面 → mpv 抽帧生成（8% 处一帧，jpg） */
function queueCover(item) {
  coverQueue.push(item);
  if (coverRunning) return;
  coverRunning = true;
  const next = () => {
    const it = coverQueue.shift();
    if (!it) { coverRunning = false; return; }
    const out = path.join(POSTER_DIR(), crypto.createHash('md5').update(it.path).digest('hex').slice(0, 12) + '.jpg');
    const tmpDir = path.join(POSTER_DIR(), '_tmp');
    fs.mkdirSync(tmpDir, { recursive: true });
    const proc = spawn(MPV_EXE, [
      '--no-config', '--no-audio', '--no-sub', '--frames=1', '--start=8%',
      '--vo=image', '--vo-image-format=jpg', '--vo-image-jpeg-quality=82',
      `--vo-image-outdir=${tmpDir}`, '--no-terminal', it.path,
    ], { stdio: 'ignore' });
    const done = () => {
      try {
        const f = fs.readdirSync(tmpDir).filter((x) => x.endsWith('.jpg'))[0];
        if (f) {
          fs.renameSync(path.join(tmpDir, f), out);
          it.poster = out;
          saveLibrary();
          notifyLibrary();
        }
      } catch {}
      next();
    };
    proc.on('exit', done);
    proc.on('error', done);
    setTimeout(() => { try { proc.kill(); } catch {} }, 20000).unref?.();   // 单帧 20s 超时保护
  };
  next();
}

function scanLibrary() {
  if (scanning) return;
  scanning = true;
  try {
    // 增量扫描：mtime+size 未变则复用缓存（db 内旧条目）
    const seen = new Map(library.map((it) => [it.path, it]));
    const next = [];
    for (const folder of settings.libraryFolders || []) {
      for (const file of walkVideos(folder)) {
        const st = fs.statSync(file, { throwIfNoEntry: false });
        if (!st) continue;
        const old = seen.get(file);
        if (old && old.mtime === st.mtimeMs && old.size === st.size) { next.push(old); continue; }
        const dir = path.dirname(file);
        const base = path.basename(file).replace(/\.[^.]+$/, '');
        const parsed = parseName(path.basename(file));
        const nfo = readNfo(dir, base);
        const item = {
          path: file,
          name: path.basename(file),
          title: nfo?.title || parsed.title,
          year: nfo?.year || parsed.year,
          season: parsed.season, episode: parsed.episode,
          size: st.size, mtime: st.mtimeMs,
          poster: findPoster(dir, base) || null,
          specs: parseSpecs(path.basename(file), dir),
        };
        if (!item.poster) {
          const gen = path.join(POSTER_DIR(), crypto.createHash('md5').update(file).digest('hex').slice(0, 12) + '.jpg');
          if (fs.existsSync(gen)) item.poster = gen; else queueCover(item);
        }
        next.push(item);
      }
    }
    next.sort((a, b) => b.mtime - a.mtime);
    library = next;
    saveLibrary();
    notifyLibrary();
  } finally {
    scanning = false;
  }
}

/* ---------------- 托盘（规范 §4 TrayMenu；bgCasting 待机模式宿主） ---------------- */

let tray = null;

function showHome() {
  if (homeWin && !homeWin.isDestroyed()) {
    homeWin.show();
    homeWin.focus();
  } else {
    createHomeWindow();
  }
}

function updateTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示播放器', click: showHome },
    { label: '打开视频…', click: () => openFileFlow() },
    { type: 'separator' },
    { label: `DLNA：${dlnaState.running ? `在线 · ${dlnaState.friendlyName}` : '未运行'}`, enabled: false },
    { type: 'separator' },
    { label: '退出', click: () => { quitting = true; app.quit(); } },
  ]));
}

function createTray() {
  const { makeIcon } = require('../dlna/xml');
  tray = new Tray(nativeImage.createFromBuffer(makeIcon(32)));
  tray.setToolTip('Aurora Player');
  tray.on('click', showHome);
  updateTrayMenu();
}

/* ---------------- IPC ---------------- */

ipcMain.handle('mpv:command', (_e, args) => {
  // 投屏期间本地播放/进度/音量操作视为「本地接管」，用于互抢 Toast 判定（读属性不算）
  if (casting && Array.isArray(args) && args[0] && !/^get_property$/.test(args[0])) markLocal();
  return mpvCommand(...args);
});

ipcMain.handle('app:open-file', () => openFileFlow());

ipcMain.handle('app:open-path', (_e, file, seek) => startPlayback(file, seek));
ipcMain.handle('app:stop', () => stopPlayback());
ipcMain.handle('recent:list', () => readRecent());
ipcMain.handle('dlna:state', () => dlnaState);
ipcMain.handle('settings:get', () => settings);
ipcMain.handle('settings:set', (_e, patch) => {
  const dlnaKeys = ['dlnaEnabled', 'dlnaFriendlyName'];
  const needDlnaRestart = dlnaKeys.some((k) => k in patch && patch[k] !== settings[k]);
  const foldersChanged = 'libraryFolders' in patch
    && JSON.stringify(patch.libraryFolders) !== JSON.stringify(settings.libraryFolders);
  settings = { ...settings, ...patch };
  writeSettings();
  if ('hdrMode' in patch || 'hdrAlgo' in patch
    || 'targetPeak' in patch || 'targetContrast' in patch
    || 'saturation' in patch || 'hdrPeakPercentile' in patch) {
    hdrOverride = { mode: settings.hdrMode, algo: settings.hdrAlgo };
    if (currentPath) refreshMetadata();
  }
  // 音频高级处理（D33）：改值实时生效
  if (['audioGain', 'audioEq', 'replayGain', 'audioNormalize', 'audioChannels', 'audioExclusive', 'audioBitstream'].some((k) => k in patch)) {
    if (currentPath && mpvProc) applyAudioSettings();
  }
  if (needDlnaRestart) {
    if (dlnaProc) { dlnaProc.kill(); dlnaProc = null; }
    startDlna();
  }
  if (foldersChanged) scanLibrary();
  return settings;
});

/* 媒体库 */
ipcMain.handle('library:list', () => library);
ipcMain.handle('library:clear', () => {   // 清空条目（保留文件夹配置，重扫可重建）
  library = [];
  saveLibrary();
  notifyLibrary();
  return true;
});
ipcMain.handle('recent:clear', () => { db.recentClear(); return true; });
ipcMain.handle('library:rescan', () => { scanLibrary(); return true; });

/* 收藏 + 播放列表 + 合集（SQLite；D35） */
ipcMain.handle('fav:list', () => db.favoriteList());
ipcMain.handle('fav:toggle', (_e, file) => db.favoriteToggle(file));
ipcMain.handle('fav:is-on', (_e, file) => db.favoriteIsOn(file));
ipcMain.handle('playlist:list', () => db.playlistList());
ipcMain.handle('playlist:create', (_e, name) => db.playlistCreate(String(name || '').trim()));
ipcMain.handle('playlist:delete', (_e, id) => { db.playlistDelete(id); return true; });
ipcMain.handle('playlist:add', (_e, id, file) => { db.playlistAddItem(id, file); return true; });
ipcMain.handle('playlist:items', (_e, id) => db.playlistItems(id));
ipcMain.handle('collection:list', () => db.collectionList());
ipcMain.handle('collection:create', (_e, name) => db.collectionCreate(String(name || '').trim()));

/* 用户 Shader（D32） */
ipcMain.handle('shader:list', () => listShaders(settings.shaderDir));
ipcMain.handle('shader:set-dir', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(homeWin, { title: '选择 Shader 目录', properties: ['openDirectory'] });
  if (canceled || !filePaths[0]) return null;
  const dir = filePaths[0];
  const files = listShaders(dir);
  if (!files.length) return { error: '该目录没有 .glsl 或 .hook 文件' };
  settings.shaderDir = dir;
  settings.shaders = [];
  writeSettings();
  return { dir, files };
});
ipcMain.handle('shader:apply', (_e, shaders) => {
  const files = Array.isArray(shaders) ? shaders : [];
  // 静态校验：禁 IO 内置函数（沙箱）
  const bad = [];
  for (const f of files) {
    try {
      const content = fs.readFileSync(path.join(settings.shaderDir, path.basename(f)), 'utf8');
      const r = validateShader(content);
      if (!r.ok) bad.push({ file: f, forbidden: r.forbidden });
    } catch {}
  }
  settings.shaders = files.filter((f) => !bad.some((b) => b.file === f));
  writeSettings();
  if (currentPath && mpvProc) applyShaders();
  return { ok: bad.length === 0, bad };
});

ipcMain.handle('library:add-folder', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(homeWin, {
    title: '添加媒体库文件夹', properties: ['openDirectory'],
  });
  if (canceled || !filePaths[0]) return settings.libraryFolders;
  if (!settings.libraryFolders.includes(filePaths[0])) {
    settings.libraryFolders = [...settings.libraryFolders, filePaths[0]];
    writeSettings();
    scanLibrary();
  }
  return settings.libraryFolders;
});

/* NAS/SMB：UNC 路径规范化（Windows 上 SMB = UNC，无需 smb 库） */
function normalizeUnc(input) {
  const s = String(input || '').trim().replace(/\//g, '\\').replace(/^\\+/, '');
  const parts = s.split('\\').filter(Boolean);
  if (parts.length < 2) return null;   // 至少需要 \\服务器\共享
  return '\\\\' + parts.join('\\');
}

ipcMain.handle('nas:open-explorer', (_e, unc) => {
  const { shell } = require('electron');
  shell.openPath(unc);   // 触发 Windows 凭据登录框
});

/* NAS 在线浏览：列目录（文件夹 + 视频文件），用于在线选择播放，不扫描入库 */
ipcMain.handle('nas:list', async (_e, input) => {
  const unc = normalizeUnc(input);
  if (!unc) return { ok: false, error: '路径无效' };
  try {
    const ents = fs.readdirSync(unc, { withFileTypes: true });
    const entries = ents
      .filter((e) => !e.name.startsWith('.') && !e.name.startsWith('$'))
      .filter((e) => e.isDirectory() || VIDEO_EXTS.has(e.name.split('.').pop().toLowerCase()))
      .map((e) => ({ name: e.name, path: unc + '\\' + e.name, isDir: e.isDirectory() }))
      .sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name, 'zh-Hans-CN') : a.isDir ? -1 : 1));
    return { ok: true, unc, entries };
  } catch (err) {
    const needAuth = err.code === 'EACCES' || err.code === 'EPERM';
    return {
      ok: false, unc, needAuth,
      error: needAuth ? '需要登录凭据：点"去登录"在资源管理器中输入账号密码后重试'
        : (err.code === 'ENOENT' || err.code === 'ENOTFOUND') ? '找不到该路径'
        : `连接失败：${err.code || err.message}`,
    };
  }
});
ipcMain.handle('hdr:override', async (_e, o) => {
  hdrOverride = { mode: o?.mode || 'auto', algo: o?.algo || null };
  await refreshMetadata();   // 重跑决策链并推送新 meta
});

/* 缩略图查询：时间 → 最近帧 file:// URL（按实际帧数比例映射，缓存未就绪返回 null） */
ipcMain.handle('thumbs:nearest', (_e, time) => {
  if (!thumbs) return null;
  if (!thumbs.files) {
    try { thumbs.files = fs.readdirSync(thumbs.dir).filter((f) => f.endsWith('.jpg')).sort(); } catch { return null; }
  }
  const len = thumbs.files.length;
  if (!len) return null;
  const idx = Math.min(Math.max(0, Math.floor((time / thumbs.duration) * len)), len - 1);
  return 'file:///' + path.join(thumbs.dir, thumbs.files[idx]).replace(/\\/g, '/');
});

/* 载入外部字幕（规范 §3.3 字幕页） */
ipcMain.handle('sub:add', async () => {
  if (!homeWin || homeWin.isDestroyed()) return;
  const { canceled, filePaths } = await dialog.showOpenDialog(homeWin, {
    title: '载入外部字幕',
    properties: ['openFile'],
    filters: [
      { name: '字幕文件', extensions: ['srt', 'ass', 'ssa', 'vtt', 'sub', 'idx'] },
      { name: '所有文件', extensions: ['*'] },
    ],
  });
  if (canceled || !filePaths[0]) return;
  await mpvCommand('sub-add', filePaths[0], 'select');
  refreshMetadata();   // 新字幕轨进轨道列表
});
ipcMain.handle('app:toggle-fullscreen', () => {
  if (homeWin && !homeWin.isDestroyed()) homeWin.setFullScreen(!videoFs);
});

/* ---------------- 播放失败操作（规范 §6 错误卡片；D25） ---------------- */

ipcMain.handle('app:retry', (_e, software) => {
  const file = currentPath;
  if (!file) return false;
  if (software) forceSoftwareDecode = true;
  startPlayback(file);
  return true;
});

ipcMain.handle('app:export-log', async () => {
  if (!homeWin || homeWin.isDestroyed()) return null;
  const { canceled, filePath } = await dialog.showSaveDialog(homeWin, {
    title: '导出 mpv 日志',
    defaultPath: path.join(app.getPath('downloads'), 'aurora-mpv.log'),
    filters: [{ name: '日志文件', extensions: ['log', 'txt'] }],
  });
  if (canceled || !filePath) return null;
  try { fs.copyFileSync(MPV_LOG(), filePath); return filePath; } catch { return null; }
});

/* 快照（规范 §8 快照 Ctrl+S；D31）：原始视频帧（video 模式，非 UI 截图） */
ipcMain.handle('app:screenshot', async () => {
  if (!mpvProc || !currentPath) return null;
  const dir = path.join(app.getPath('userData'), 'snapshots');
  fs.mkdirSync(dir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
  const name = `aurora-${ts}.png`;
  const out = path.join(dir, name);
  const r = await mpvCommand('screenshot-to-file', out, 'video');
  if (r && r.error === 'success' && fs.existsSync(out)) return out;
  return null;
});

/* 手动拖拽：透明窗在 Windows 上 -webkit-app-region:drag 失效（Electron 已知问题），
   改为渲染层报起止，主进程跟随光标语义移动（16ms 节流） */
let dragTimer = null;
ipcMain.on('win:drag-start', () => {
  if (!homeWin || homeWin.isDestroyed() || videoFs) return;
  const startCursor = screen.getCursorScreenPoint();
  // 用 getBounds 记录初始尺寸，拖动时用 setBounds 锁定 width/height：
  // 透明 frameless 窗跨屏移动时，setPosition 会被 DWM 反复重算导致窗口缓慢放大（width/height 每帧 +1px）。
  const b = homeWin.getBounds();
  clearInterval(dragTimer);
  dragTimer = setInterval(() => {
    if (!homeWin || homeWin.isDestroyed()) return clearInterval(dragTimer);
    const cur = screen.getCursorScreenPoint();
    homeWin.setBounds({
      x: b.x + cur.x - startCursor.x,
      y: b.y + cur.y - startCursor.y,
      width: b.width,
      height: b.height,
    });
  }, 16);
});
ipcMain.on('win:drag-end', () => clearInterval(dragTimer));

/* 手动边缘缩放：透明窗无原生边框，8 向热区 → 主进程按方向改 bounds（16ms 节流，最小 640×400） */
let resizeTimer = null;
ipcMain.on('win:resize-start', (_e, dir) => {
  if (!homeWin || homeWin.isDestroyed() || videoFs || homeWin.isMaximized()) return;
  const startCursor = screen.getCursorScreenPoint();
  const b = homeWin.getBounds();
  clearInterval(resizeTimer);
  resizeTimer = setInterval(() => {
    if (!homeWin || homeWin.isDestroyed()) return clearInterval(resizeTimer);
    const cur = screen.getCursorScreenPoint();
    const dx = cur.x - startCursor.x, dy = cur.y - startCursor.y;
    let { x, y, width, height } = b;
    if (dir.includes('e')) width = b.width + dx;
    if (dir.includes('s')) height = b.height + dy;
    if (dir.includes('w')) { width = b.width - dx; x = b.x + dx; }
    if (dir.includes('n')) { height = b.height - dy; y = b.y + dy; }
    if (width < 640) { if (dir.includes('w')) x += width - 640; width = 640; }
    if (height < 400) { if (dir.includes('n')) y += height - 400; height = 400; }
    homeWin.setBounds({ x, y, width, height });
  }, 16);
});
ipcMain.on('win:resize-end', () => clearInterval(resizeTimer));
ipcMain.on('win:minimize', () => { if (homeWin && !homeWin.isDestroyed()) homeWin.minimize(); });
ipcMain.on('win:maximize-toggle', () => {
  if (!homeWin || homeWin.isDestroyed()) return;
  if (homeWin.isMaximized()) homeWin.unmaximize(); else homeWin.maximize();
});
ipcMain.on('win:close', () => { if (homeWin && !homeWin.isDestroyed()) homeWin.close(); });

/* ---------------- 首页窗口 + 菜单 ---------------- */

function createHomeWindow(hash = '/home') {
  homeWin = new BrowserWindow({
    width: 1280, height: 800, minWidth: 960, minHeight: 640,
    backgroundColor: '#00000000',
    transparent: true,
    title: 'Aurora Player',
    autoHideMenuBar: true,
    webPreferences: { preload: PRELOAD, contextIsolation: true, nodeIntegration: false },
  });
  homeWin.loadFile(DIST_HTML, { hash });
  homeWin.on('enter-full-screen', () => { videoFs = true; homeWin.webContents.send('fs-status', true); });
  homeWin.on('leave-full-screen', () => { videoFs = false; homeWin.webContents.send('fs-status', false); });
  // 渲染层 console → 文件日志（无头排障）
  homeWin.webContents.on('console-message', (_e, _level, message) => {
    try {
      fs.appendFileSync(path.join(app.getPath('userData'), 'logs', 'renderer.log'),
        `[${new Date().toISOString()}] ${message}\n`);
    } catch {}
  });
  homeWin.on('close', (e) => {
    // 后台接收投屏（规格 §9 待机模式）：关窗 → 隐藏到托盘，DLNA 保持可发现
    if (settings.bgCasting && !quitting) {
      e.preventDefault();
      homeWin.hide();
    }
  });
  homeWin.on('closed', () => { homeWin = null; });

  // D22 跨屏：窗口移动/缩放时检测所在显示器变化 → HDR 能力变化 → 重跑决策链
  let lastDisplayId = null;
  homeWin.on('moved', () => checkCrossDisplay());
  homeWin.on('resized', () => checkCrossDisplay());
  homeWin.on('enter-full-screen', () => checkCrossDisplay());
  function checkCrossDisplay() {
    if (!homeWin || homeWin.isDestroyed()) return;
    const bounds = homeWin.getBounds();
    const disp = screen.getDisplayMatching(bounds);
    const id = disp ? disp.id : null;
    if (id !== lastDisplayId) {
      lastDisplayId = id;
      // 换屏 → 立即重跑决策链（mpv VO 也会因窗口 HWND 位置变化而可能重建）
      if (currentPath && mpvProc) {
        lastLogSize = 0;   // 强制 detectDisplayHdr 重读日志
        refreshMetadata();
      }
    }
  }
  checkCrossDisplay();
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

/* 单实例锁：多开会共享 userData 且互相抢 DLNA 端口/截图探针目标。
   注意：init 必须整体收进 else 分支，否则二实例 app.quit() 后 whenReady 仍可能触发建窗 */
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => { showHome(); });

  app.whenReady().then(() => {
    if (!fs.existsSync(MPV_EXE)) {
      dialog.showErrorBox('缺少 mpv 运行时', `未找到 ${MPV_EXE}`);
      app.quit();
      return;
    }
    settings = readSettings();   // app.getPath 需 ready 后可靠，磁盘读取在此进行
    db.open(path.join(app.getPath('userData'), 'aurora.db'));
    library = db.allMedia();     // db 打开后加载媒体库（含 JSON 迁移）
    hdrOverride = { mode: settings.hdrMode, algo: settings.hdrAlgo };
    buildMenu();
    createTray();
    startDlna();
    if ((settings.libraryFolders || []).length) scanLibrary();
    // 命令行带视频文件路径时直接播放（文件关联/拖放 exe 的基础）
    const fileArg = process.argv.slice(2).find((a) => fs.existsSync(a) && fs.statSync(a).isFile());
    if (fileArg) startPlayback(path.resolve(fileArg));
    else createHomeWindow();
  });

  app.on('before-quit', () => {
    quitting = true;
    stopPlayback();
    if (dlnaProc) { dlnaProc.kill(); dlnaProc = null; }
  });
  app.on('window-all-closed', () => app.quit());
}
