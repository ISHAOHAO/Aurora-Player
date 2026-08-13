/**
 * aurora-dlna — 独立进程入口（Electron utilityProcess，Node 语义）
 * 职责：SSDP 宣告 + HTTP/SOAP/GENA 服务 + 与主进程双向 IPC
 * 规格：docs/03-DLNA-UPnP技术规格.md
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { startSsdp, privateIPv4 } = require('./ssdp');
const { startHttpd } = require('./httpd');

const cfgFile = process.env.AURORA_DLNA_CFG; // 主进程传入 userData/dlna.json
const logFile = process.env.AURORA_DLNA_LOG; // userData/logs/dlna.log

function log(...args) {
  const line = `[${new Date().toISOString()}] ${args.join(' ')}\n`;
  try { fs.appendFileSync(logFile, line); } catch {}
}

/* ---------------- 配置持久化（UDN/friendlyName/port） ---------------- */
function loadCfg() {
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf8')); } catch {}
  cfg.udn = cfg.udn || `uuid:${require('crypto').randomUUID()}`;
  cfg.friendlyName = cfg.friendlyName || 'Aurora Player';
  cfg.port = cfg.port || 53201;
  return cfg;
}

/* ---------------- 渲染状态缓存（主进程推送） ---------------- */
const state = {
  state: 'NO_MEDIA_PRESENT', // STOPPED/PLAYING/PAUSED_PLAYBACK/TRANSITIONING/NO_MEDIA_PRESENT
  uri: null, title: null, meta: null, metaRaw: '',
  nextUri: null, nextTitle: null, nextMetaRaw: null, nextCp: null,   // D17：预载下一首
  pos: 0, dur: null,
  volume: 100, mute: false,
  cp: null,
};

const parent = process.parentPort;

/* ---------------- dlna_session 持久化（D19：JSON 环形日志，500 条上限） ---------------- */
const sessionFile = cfgFile ? path.join(path.dirname(cfgFile), 'dlna_sessions.json') : null;
function recordSession(entry) {
  if (!sessionFile) return;
  const rec = { ts: new Date().toISOString(), ...entry };
  try {
    let arr = [];
    try { arr = JSON.parse(fs.readFileSync(sessionFile, 'utf8')); } catch {}
    if (!Array.isArray(arr)) arr = [];
    arr.push(rec);
    if (arr.length > 500) arr = arr.slice(-500);
    fs.writeFileSync(sessionFile, JSON.stringify(arr));
  } catch {}
}

async function main() {
  const cfg = loadCfg();
  const httpd = await startHttpd({
    cfg, state, log, recordSession,
    sendCmd: (m) => parent.postMessage({ type: 'cmd', ...m }),
  });
  cfg.port = httpd.port;
  fs.writeFileSync(cfgFile, JSON.stringify(cfg, null, 2));

  const locationFor = (ip) => `http://${ip}:${cfg.port}/devicedesc.xml`;
  const ssdp = startSsdp({ udn: cfg.udn, friendlyName: cfg.friendlyName, locationFor });

  log('DLNA 启动', cfg.friendlyName, `port=${cfg.port}`, `ifaces=${privateIPv4().join(',')}`);
  parent.postMessage({ type: 'ready', friendlyName: cfg.friendlyName, port: cfg.port, udn: cfg.udn });

  /* 主进程 → dlna：状态推送 */
  let eofHandled = false;
  parent.on('message', (e) => {
    const m = e.data;
    if (!m || m.type !== 'state') return;
    const prev = state.state;
    Object.assign(state, {
      state: m.state, pos: m.pos, dur: m.dur, volume: m.volume, mute: m.mute,
    });
    if (m.uri !== undefined) state.uri = m.uri;
    if (m.title !== undefined) state.title = m.title;
    if (m.state !== prev) {
      recordSession({ event: 'transition', from: prev, to: m.state, cp: state.cp || null, uri: state.uri || null });
      httpd.emitAvt();           // 状态迁移 → LastChange
    }
    if (m.volumeChanged || m.muteChanged) httpd.emitRc();
    // D17：主进程上报播放结束(eof-reached) → 有预载则自动续播下一首
    if (m.eof) {
      if (state.nextUri && !eofHandled) { eofHandled = true; httpd.advanceNext(); }
    } else {
      eofHandled = false;
    }
  });

  const shutdown = () => { ssdp.close(); process.exit(0); };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((e) => { log('FATAL', String(e && e.stack || e)); process.exit(1); });
