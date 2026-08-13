/**
 * aurora-dlna — HTTP 服务：描述文档 / SOAP 控制 / GENA 事件（规格 §3-§6）
 */
'use strict';
const http = require('http');
const net = require('net');
const crypto = require('crypto');
const X = require('./xml');

/** 防 SSRF（规格 §7）：仅允许 RFC1918/回环/链路本地 IP；域名（NAS 主机名）放行并记录 */
function assertLanUrl(uri) {
  let u;
  try { u = new URL(uri); } catch { return false; }
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host)) {
    return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|127\.|169\.254\.|::1$|fe80:)/i.test(host);
  }
  return true; // 域名：局域网主机名场景，放行
}

const PROTOCOL_INFO_SINK = [
  'http-get:*:video/mp4:*', 'http-get:*:video/x-matroska:*', 'http-get:*:video/webm:*',
  'http-get:*:video/mpeg:*', 'http-get:*:video/x-msvideo:*', 'http-get:*:video/quicktime:*',
  'http-get:*:video/x-ms-wmv:*', 'http-get:*:video/x-flv:*', 'http-get:*:video/MP2T:*',
  'http-get:*:audio/mpeg:*', 'http-get:*:audio/mp4:*', 'http-get:*:audio/flac:*', 'http-get:*:audio/wav:*',
].join(',');

const fmtTime = (sec) => {
  if (sec == null || isNaN(sec)) return '00:00:00';
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};
const parseTime = (str) => {
  const m = String(str || '').match(/(\d+):(\d{2}):(\d{2})(?:\.\d+)?/);
  return m ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) : null;
};

function startHttpd({ cfg, state, sendCmd, log, recordSession }) {
  const subscribers = new Map(); // sid -> {service, callbacks[], seq, timer, fails}
  const icons = { '/icon48.png': X.makeIcon(48), '/icon120.png': X.makeIcon(120) };

  /* ---------------- 动作实现 ---------------- */

  const actions = {
    /* ----- AVTransport ----- */
    SetAVTransportURI(args, req) {
      const uri = (args.CurrentURI || '').trim();
      if (!uri) throw fault(714, 'empty URI');
      if (!/^https?:\/\//i.test(uri)) throw fault(714, 'scheme not allowed'); // 防 SSRF：禁 file/smb 等
      if (!assertLanUrl(uri)) throw fault(714, 'SSRF guard: non-LAN address rejected');
      state.metaRaw = args.CurrentURIMetaData || '';
      const meta = X.parseDidl(state.metaRaw);
      state.uri = uri;
      state.title = meta.title || uri.split('/').pop() || uri;
      state.meta = meta;
      state.state = 'STOPPED';
      state.pos = 0; state.dur = meta.duration ? parseTime(meta.duration) : null;
      state.cp = req.socket.remoteAddress;
      sendCmd({ cmd: 'load', uri, title: state.title, cp: state.cp });
      log('SetAVTransportURI', state.cp, uri);
      recordSession?.({ event: 'set_uri', cp: state.cp, uri, title: state.title, result: 'ok' });
      emitAvt();
      return {};
    },
    SetNextAVTransportURI(args, req) {   // D17：预载下一首（当前曲目结束时自动续播）
      const uri = (args.NextURI || '').trim();
      if (!uri) throw fault(714, 'empty NextURI');
      if (!/^https?:\/\//i.test(uri)) throw fault(714, 'scheme not allowed');
      if (!assertLanUrl(uri)) throw fault(714, 'SSRF guard: non-LAN address rejected');
      state.nextMetaRaw = args.NextURIMetaData || '';
      const meta = X.parseDidl(state.nextMetaRaw);
      state.nextUri = uri;
      state.nextTitle = meta.title || uri.split('/').pop() || uri;
      state.nextCp = req.socket.remoteAddress;
      log('SetNextAVTransportURI', state.nextCp, uri);
      recordSession?.({ event: 'set_next', cp: state.nextCp, uri, result: 'ok' });
      return {};
    },
    Play(args) {
      if (!state.uri) throw fault(701, 'no media');
      sendCmd({ cmd: 'play' });
      return {};
    },
    Pause() {
      if (!state.uri) throw fault(701, 'no media');
      sendCmd({ cmd: 'pause' });
      return {};
    },
    Stop() {
      sendCmd({ cmd: 'stop' });
      state.state = 'STOPPED'; state.pos = 0;
      log('Stop', state.cp || '-', state.uri || '-');
      recordSession?.({ event: 'stop', cp: state.cp || null, uri: state.uri || null, result: 'ok' });
      emitAvt();
      return {};
    },
    Seek(args) {
      const mode = args.Unit;
      if (mode === 'REL_TIME' || mode === 'ABS_TIME') {
        const t = parseTime(args.Target);
        if (t == null) throw fault(710, 'bad seek target');
        if (state.dur != null && state.dur <= 0) throw fault(710, 'stream not seekable');
        sendCmd({ cmd: 'seek', seconds: t });
        return {};
      }
      throw fault(710, `seek mode ${mode || '?'} not supported`); // X_DLNA_REL_BYTE 等
    },
    GetTransportInfo() {
      return {
        CurrentTransportState: state.uri ? state.state : 'NO_MEDIA_PRESENT',
        CurrentTransportStatus: 'OK',
        CurrentSpeed: '1',
      };
    },
    GetPositionInfo() {
      return {
        Track: state.uri ? '1' : '0',
        TrackDuration: fmtTime(state.dur),
        TrackMetaData: state.metaRaw || '',
        TrackURI: state.uri || '',
        RelTime: fmtTime(state.pos),
        AbsTime: fmtTime(state.pos),
        RelCount: String(Math.floor(state.pos || 0)),
        AbsCount: '0',
      };
    },
    GetMediaInfo() {
      return {
        NrTracks: state.uri ? '1' : '0',
        MediaDuration: fmtTime(state.dur),
        CurrentURI: state.uri || '',
        CurrentURIMetaData: state.metaRaw || '',
        NextURI: state.nextUri || '', NextURIMetaData: state.nextMetaRaw || '',
        PlayMedium: 'NETWORK', RecordMedium: 'NOT_IMPLEMENTED', WriteStatus: 'NOT_IMPLEMENTED',
      };
    },
    GetTransportSettings() {
      return { PlayMode: 'NORMAL', RecQualityMode: 'NOT_IMPLEMENTED' };
    },
    GetCurrentTransportActions() {
      if (!state.uri) return { Actions: '' };
      const base = { PLAYING: ['Pause', 'Stop'], PAUSED_PLAYBACK: ['Play', 'Stop'], STOPPED: ['Play'] }[state.state] || ['Play'];
      if (state.dur > 0) base.push('Seek');
      return { Actions: base.join(',') };
    },

    /* ----- RenderingControl ----- */
    GetVolume() { return { CurrentVolume: String(Math.round(state.volume ?? 100)) }; },
    SetVolume(args) {
      const v = Math.max(0, Math.min(100, parseInt(args.DesiredVolume, 10) || 0));
      sendCmd({ cmd: 'volume', value: v });
      state.volume = v;
      emitRc();
      return {};
    },
    GetMute() { return { CurrentMute: state.mute ? '1' : '0' }; },
    SetMute(args) {
      const m = args.DesiredMute === '1' || args.DesiredMute === 'true';
      sendCmd({ cmd: 'mute', value: m });
      state.mute = m;
      emitRc();
      return {};
    },
    ListPresets() { return { CurrentPresetNameList: 'FactoryDefaults' }; },
    SelectPreset(args) {
      if (args.PresetName !== 'FactoryDefaults') throw fault(701, 'unknown preset');
      return {};
    },
    GetVolumeDBRange() { return { MinValue: '-60', MaxValue: '0' }; },

    /* ----- ConnectionManager ----- */
    GetProtocolInfo() { return { Source: '', Sink: PROTOCOL_INFO_SINK }; },
    GetCurrentConnectionIDs() { return { ConnectionIDs: state.uri ? '0' : '' }; },
    GetCurrentConnectionInfo(args) {
      if (String(args.ConnectionID) !== '0' || !state.uri) throw fault(701, 'bad connection id');
      return {
        RcsID: '0', AVTransportID: '0', ProtocolInfo: 'http-get:*:video/mp4:*',
        PeerConnectionManager: '', PeerConnectionID: '-1', Direction: 'Input',
        Status: state.state === 'PLAYING' ? 'OK' : 'Unknown',
      };
    },
  };

  function fault(code, desc) { return { upnpCode: code, desc }; }

  /* ---------------- GENA ---------------- */

  const emitDebounce = {};
  function emit(service) {
    clearTimeout(emitDebounce[service]);
    emitDebounce[service] = setTimeout(() => {
      const lastChange = service === 'avt'
        ? X.lastChangeAvt({ ...state, posStr: fmtTime(state.pos), durStr: fmtTime(state.dur), actions: actions.GetCurrentTransportActions().Actions })
        : X.lastChangeRc({ volume: Math.round(state.volume ?? 100), mute: state.mute });
      for (const [sid, sub] of subscribers) {
        if (sub.service !== service) continue;
        const body = X.genaNotify(sid, sub.seq, service, lastChange);
        for (const cb of sub.callbacks) postNotify(cb, body, sid, sub, service);
      }
    }, 200); // 规格 §6：合并去抖 200ms
  }
  const emitAvt = () => emit('avt');
  const emitRc = () => emit('rc');

  /* 预载续播：当前曲目播放结束（主进程上报 eof）时，若存在 nextUri 则自动加载下一首 */
  function advanceNext() {
    if (!state.nextUri) return false;
    const next = state.nextUri;
    state.uri = next;
    state.title = state.nextTitle || next.split('/').pop() || next;
    state.metaRaw = state.nextMetaRaw || '';
    state.meta = X.parseDidl(state.metaRaw);
    state.cp = state.nextCp || state.cp;
    state.nextUri = null; state.nextTitle = null; state.nextMetaRaw = null; state.nextCp = null;
    state.state = 'STOPPED';
    state.pos = 0; state.dur = state.meta.duration ? parseTime(state.meta.duration) : null;
    sendCmd({ cmd: 'load', uri: next, title: state.title, cp: state.cp });
    log('自动续播', state.cp, next);
    recordSession?.({ event: 'advance', cp: state.cp, uri: next, result: 'ok' });
    emitAvt();
    return true;
  }

  function postNotify(urlStr, body, sid, sub, service) {
    let u;
    try { u = new URL(urlStr); } catch { return; }
    const req = http.request({
      hostname: u.hostname, port: u.port || 80, path: u.pathname + u.search,
      method: 'NOTIFY',
      headers: {
        'CONTENT-TYPE': 'text/xml; charset="utf-8"',
        NT: 'upnp:event', NTS: 'upnp:propchange',
        SID: sid, SEQ: String(sub.seq),
        'CONTENT-LENGTH': Buffer.byteLength(body),
      },
      timeout: 5000,
    }, (res) => { res.resume(); sub.fails = 0; });
    req.on('error', () => {
      sub.fails++;
      if (sub.fails >= 3) { subscribers.delete(sid); log('订阅清理(不可达)', sid, ''); } // 规格 §6
    });
    req.on('timeout', () => req.destroy());
    req.end(body);
    sub.seq++;
  }

  function handleSubscribe(req, res, service) {
    if (req.method === 'UNSUBSCRIBE') {
      const sid = req.headers.sid;
      if (sid && subscribers.has(sid)) { subscribers.delete(sid); res.writeHead(200); res.end(); }
      else { res.writeHead(412); res.end(); }
      return;
    }
    const cbHeader = req.headers.callback;
    const nt = req.headers.nt;
    if (!cbHeader || nt !== 'upnp:event') { res.writeHead(412); res.end(); return; }
    const sid = req.headers.sid;
    if (sid) { // 续订
      const sub = subscribers.get(sid);
      if (!sub) { res.writeHead(412); res.end(); return; }
      renew(sub);
      res.writeHead(200, { SID: sid, TIMEOUT: 'Second-1800' });
      res.end();
      return;
    }
    const callbacks = [...cbHeader.matchAll(/<([^>]+)>/g)].map((m) => m[1]);
    if (!callbacks.length) { res.writeHead(412); res.end(); return; }
    const newSid = `uuid:${crypto.randomUUID()}`;
    const sub = { service, callbacks, seq: 0, fails: 0, timer: null };
    renew(sub);
    subscribers.set(newSid, sub);
    res.writeHead(200, { SID: newSid, TIMEOUT: 'Second-1800' });
    res.end();
    // 初始 NOTIFY（携带当前状态快照）
    setTimeout(() => {
      const lastChange = service === 'avt'
        ? X.lastChangeAvt({ ...state, posStr: fmtTime(state.pos), durStr: fmtTime(state.dur), actions: actions.GetCurrentTransportActions().Actions })
        : X.lastChangeRc({ volume: Math.round(state.volume ?? 100), mute: state.mute });
      const body = X.genaNotify(newSid, sub.seq, service, lastChange);
      for (const cb of sub.callbacks) postNotify(cb, body, newSid, sub, service);
    }, 50);
  }

  function renew(sub) {
    clearTimeout(sub.timer);
    sub.timer = setTimeout(() => {
      for (const [sid, s] of subscribers) if (s === sub) subscribers.delete(sid);
    }, 1830_000); // 1800s + 30s 宽限
    sub.timer.unref();
  }

  /* ---------------- HTTP 路由 ---------------- */

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const p = url.pathname;

    const xmlOut = (body, code = 200) => {
      res.writeHead(code, { 'Content-Type': 'text/xml; charset="utf-8"', SERVER: X.SERVER });
      res.end(body);
    };

    if (req.method === 'GET') {
      if (p === '/devicedesc.xml') return xmlOut(X.deviceDesc(cfg));
      if (p === '/scpd/avtransport.xml' || p === '/scpd/avt.xml') return xmlOut(X.scpd('avtransport'));
      if (p === '/scpd/renderingcontrol.xml' || p === '/scpd/rc.xml') return xmlOut(X.scpd('renderingcontrol'));
      if (p === '/scpd/connectionmanager.xml' || p === '/scpd/cm.xml') return xmlOut(X.scpd('connectionmanager'));
      if (icons[p]) {
        res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': icons[p].length });
        return res.end(icons[p]);
      }
    }

    if (req.method === 'SUBSCRIBE' || req.method === 'UNSUBSCRIBE') {
      const svc = { '/evt/avtransport': 'avt', '/evt/avt': 'avt', '/evt/renderingcontrol': 'rc', '/evt/rc': 'rc', '/evt/connectionmanager': 'cm', '/evt/cm': 'cm' }[p];
      if (svc === 'cm') { res.writeHead(412); res.end(); return; } // CM 无事件变量
      if (svc) return handleSubscribe(req, res, svc);
    }

    if (req.method === 'POST' && p.startsWith('/ctrl/')) {
      const service = { '/ctrl/avtransport': 'AVTransport', '/ctrl/avt': 'AVTransport', '/ctrl/renderingcontrol': 'RenderingControl', '/ctrl/rc': 'RenderingControl', '/ctrl/connectionmanager': 'ConnectionManager', '/ctrl/cm': 'ConnectionManager' }[p];
      let body = '';
      req.on('data', (c) => { body += c; if (body.length > 1e6) req.destroy(); });
      req.on('end', () => {
        if (!service) { res.writeHead(404); return res.end(); }
        if (X.rejectUnsafe(body)) return xmlOut(X.soapFault(401, 'DTD/ENTITY forbidden'), 500);
        const action = X.soapAction(body);
        const fn = action && actions[action];
        if (!fn) return xmlOut(X.soapFault(401, `Invalid Action: ${action || '?'}`), 500);
        try {
          const out = fn(X.soapArgs(body, action), req);
          xmlOut(X.soapResp(action, service, out));
        } catch (e) {
          if (e && e.upnpCode) xmlOut(X.soapFault(e.upnpCode, e.desc), 500);
          else { log('SOAP 异常', action, String(e)); xmlOut(X.soapFault(501, 'internal error'), 500); }
        }
      });
      return;
    }

    res.writeHead(404); res.end();
  });

  return new Promise((resolve) => {
    server.on('error', (e) => {
      if (e.code === 'EADDRINUSE' && cfg.port < 53300) { cfg.port++; server.listen(cfg.port); }
      else throw e;
    });
    server.listen(cfg.port, () => resolve({ server, port: cfg.port, emitAvt, emitRc, advanceNext }));
  });
}

module.exports = { startHttpd, fmtTime };
