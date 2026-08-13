/**
 * 虚拟 DMC 验收脚本（决策 8A/14A：自研 DMC 做 DLNA 验收）
 * 流程：M-SEARCH → 设备描述 → GENA 订阅 → SetAVTransportURI → Play →
 *       GetPositionInfo 推进 → Pause → Seek → Volume → Stop → UNSUBSCRIBE
 * 运行：先启动应用（npm start），再 node scripts/dmc-test.js
 */
'use strict';
const dgram = require('dgram');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CLIP = path.join(__dirname, '..', '..', 'runtime', 'test-clip.mp4');
let passed = 0, failed = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { passed++; console.log(`  PASS  ${name}${extra ? ' — ' + extra : ''}`); }
  else { failed++; console.log(`  FAIL  ${name}${extra ? ' — ' + extra : ''}`); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- 工具 ---------- */
function httpReq(method, urlStr, { headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const req = http.request({
      hostname: u.hostname, port: u.port, path: u.pathname + u.search, method,
      headers: body ? { ...headers, 'CONTENT-LENGTH': Buffer.byteLength(body) } : headers,
      timeout: 6000,
    }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.end(body);
  });
}

function soap(service, action, args = {}) {
  const inner = Object.entries(args).map(([k, v]) => `<${k}>${v}</${k}>`).join('');
  return `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
<s:Body><u:${action} xmlns:u="urn:schemas-upnp-org:service:${service}:1">${inner}</u:${action}></s:Body>
</s:Envelope>`;
}
const callSoap = (base, ctrl, service, action, args) =>
  httpReq('POST', `${base}/ctrl/${ctrl}`, {
    headers: { 'CONTENT-TYPE': 'text/xml; charset="utf-8"', SOAPACTION: `"urn:schemas-upnp-org:service:${service}:1#${action}"` },
    body: soap(service, action, args),
  });

const tagOf = (xml, name) => {
  const m = xml.match(new RegExp(`<(?:[\\w.-]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w.-]+:)?${name}>`, 'i'));
  return m ? m[1] : null;
};

/* ---------- 1. SSDP M-SEARCH ---------- */
function discover() {
  return new Promise((resolve, reject) => {
    const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    const req = [
      'M-SEARCH * HTTP/1.1', 'HOST: 239.255.255.250:1900', 'MAN: "ssdp:discover"',
      'MX: 2', 'ST: urn:schemas-upnp-org:device:MediaRenderer:1', '', '',
    ].join('\r\n');
    const timer = setTimeout(() => { sock.close(); reject(new Error('M-SEARCH 无响应')); }, 6000);
    let done = false;
    sock.on('message', (msg, rinfo) => {
      const text = msg.toString('latin1');
      const loc = text.match(/^LOCATION:\s*(.+?)\s*$/im);
      if (loc && !done) { done = true; clearTimeout(timer); sock.close(); resolve({ location: loc[1], raw: text, rinfo }); }
    });
    sock.bind(() => {
      sock.send(req, 1900, '239.255.255.250');
      setTimeout(() => { if (!done) { try { sock.send(req, 1900, '127.0.0.1'); } catch {} } }, 1500); // 单播兜底
    });
  });
}

/* ---------- 主流程 ---------- */
async function main() {
  console.log('== Aurora DLNA 虚拟 DMC 验收 ==\n');

  // 本地供片服务器（模拟手机/NAS 提供的媒体 URL）
  const mediaServer = http.createServer((req, res) => {
    const range = req.headers.range;
    const stat = fs.statSync(CLIP);
    if (range) {
      const m = range.match(/bytes=(\d+)-(\d*)/);
      const start = +m[1], end = m[2] ? +m[2] : stat.size - 1;
      res.writeHead(206, { 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Content-Length': end - start + 1, 'Content-Type': 'video/mp4' });
      fs.createReadStream(CLIP, { start, end }).pipe(res);
    } else {
      res.writeHead(200, { 'Content-Length': stat.size, 'Content-Type': 'video/mp4' });
      fs.createReadStream(CLIP).pipe(res);
    }
  });
  await new Promise((r) => mediaServer.listen(0, r));
  const mediaPort = mediaServer.address().port;
  const mediaUrl = `http://127.0.0.1:${mediaPort}/test-clip.mp4`;

  // GENA 回调服务器
  const notifyLog = [];
  const cbServer = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => { notifyLog.push({ headers: req.headers, body }); res.writeHead(200); res.end(); });
  });
  await new Promise((r) => cbServer.listen(0, r));
  const cbUrl = `http://127.0.0.1:${cbServer.address().port}/cb`;

  /* 1. 发现 */
  console.log('[1] SSDP 发现');
  const { location } = await discover();
  ok('M-SEARCH 响应含 LOCATION', !!location, location);
  const base = location.replace(/\/devicedesc\.xml.*/, '');

  /* 2. 描述 */
  console.log('[2] 设备描述');
  const desc = await httpReq('GET', location);
  ok('devicedesc 可获取', desc.status === 200);
  ok('deviceType = MediaRenderer:1', desc.body.includes('MediaRenderer:1'));
  for (const s of ['AVTransport', 'RenderingControl', 'ConnectionManager']) {
    ok(`服务 ${s}`, desc.body.includes(`service:${s}:1`));
  }

  /* 3. 订阅 */
  console.log('[3] GENA 订阅');
  const sub = await httpReq('SUBSCRIBE', `${base}/evt/avt`, {
    headers: { CALLBACK: `<${cbUrl}>`, NT: 'upnp:event', TIMEOUT: 'Second-1800' },
  });
  const sid = sub.headers.sid;
  ok('SUBSCRIBE 返回 SID', sub.status === 200 && !!sid, sid);
  await sleep(600);
  ok('收到初始 NOTIFY(LastChange)', notifyLog.length >= 1);

  /* 4. 投片播放 */
  console.log('[4] SetAVTransportURI + Play');
  const didl = `<DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/" xmlns:dc="http://purl.org/dc/elements/1.1/"><item id="0" parentID="-1" restricted="1"><dc:title>DMC 测试片</dc:title><res protocolInfo="http-get:*:video/mp4:*">${mediaUrl}</res></item></DIDL-Lite>`
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  let r = await callSoap(base, 'avt', 'AVTransport', 'SetAVTransportURI', { InstanceID: 0, CurrentURI: mediaUrl, CurrentURIMetaData: didl });
  ok('SetAVTransportURI', r.status === 200, String(r.status));
  await sleep(1500); // 等播放窗与 mpv 拉起
  r = await callSoap(base, 'avt', 'AVTransport', 'Play', { InstanceID: 0, Speed: 1 });
  ok('Play', r.status === 200);
  await sleep(1500);

  /* 5. 状态与进度 */
  console.log('[5] 状态/进度');
  r = await callSoap(base, 'avt', 'AVTransport', 'GetTransportInfo', { InstanceID: 0 });
  ok('GetTransportInfo = PLAYING', tagOf(r.body, 'CurrentTransportState') === 'PLAYING', tagOf(r.body, 'CurrentTransportState') || '');
  const p1 = tagOf((await callSoap(base, 'avt', 'AVTransport', 'GetPositionInfo', { InstanceID: 0 })).body, 'RelTime');
  await sleep(1500);
  const p2 = tagOf((await callSoap(base, 'avt', 'AVTransport', 'GetPositionInfo', { InstanceID: 0 })).body, 'RelTime');
  ok('RelTime 推进', !!p1 && !!p2 && p1 !== p2, `${p1} → ${p2}`);
  ok('GetPositionInfo 含 Duration', !!tagOf(r.body = (await callSoap(base, 'avt', 'AVTransport', 'GetPositionInfo', { InstanceID: 0 })).body, 'TrackDuration'));

  /* 6. 控制 */
  console.log('[6] Pause / Seek / Volume / Stop');
  r = await callSoap(base, 'avt', 'AVTransport', 'Pause', { InstanceID: 0 });
  await sleep(800);
  const st = tagOf((await callSoap(base, 'avt', 'AVTransport', 'GetTransportInfo', { InstanceID: 0 })).body, 'CurrentTransportState');
  ok('Pause → PAUSED_PLAYBACK', r.status === 200 && st === 'PAUSED_PLAYBACK', st || '');

  r = await callSoap(base, 'avt', 'AVTransport', 'Seek', { InstanceID: 0, Unit: 'REL_TIME', Target: '00:00:02' });
  await sleep(800);
  const pos = tagOf((await callSoap(base, 'avt', 'AVTransport', 'GetPositionInfo', { InstanceID: 0 })).body, 'RelTime');
  ok('Seek REL_TIME 00:00:02', r.status === 200 && /^00:00:0[23]$/.test(pos || ''), pos || '');

  r = await callSoap(base, 'rc', 'RenderingControl', 'SetVolume', { InstanceID: 0, Channel: 'Master', DesiredVolume: 42 });
  await sleep(800);
  const vol = tagOf((await callSoap(base, 'rc', 'RenderingControl', 'GetVolume', { InstanceID: 0, Channel: 'Master' })).body, 'CurrentVolume');
  ok('SetVolume 42 → GetVolume 42', vol === '42', vol || '');

  r = await callSoap(base, 'avt', 'AVTransport', 'Stop', { InstanceID: 0 });
  await sleep(800);
  const st2 = tagOf((await callSoap(base, 'avt', 'AVTransport', 'GetTransportInfo', { InstanceID: 0 })).body, 'CurrentTransportState');
  ok('Stop → STOPPED/NO_MEDIA', ['STOPPED', 'NO_MEDIA_PRESENT'].includes(st2 || ''), st2 || '');

  /* 6.5 预载下一首（D17） */
  console.log('[6.5] SetNextAVTransportURI 预载');
  r = await callSoap(base, 'avt', 'AVTransport', 'SetNextAVTransportURI', { InstanceID: 0, NextURI: mediaUrl, NextURIMetaData: '' });
  ok('SetNextAVTransportURI', r.status === 200, String(r.status));
  const nextUri = tagOf((await callSoap(base, 'avt', 'AVTransport', 'GetMediaInfo', { InstanceID: 0 })).body, 'NextURI');
  ok('GetMediaInfo 含 NextURI', nextUri === mediaUrl, nextUri || '');

  /* 7. 事件与退订 */
  console.log('[7] 事件推送与退订');
  ok('状态迁移产生 LastChange NOTIFY(≥3 条)', notifyLog.length >= 3, `${notifyLog.length} 条`);
  const un = await httpReq('UNSUBSCRIBE', `${base}/evt/avt`, { headers: { SID: sid } });
  ok('UNSUBSCRIBE', un.status === 200);

  mediaServer.close();
  cbServer.close();
  console.log(`\n结果：${passed} PASS / ${failed} FAIL`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error('验收脚本异常:', e.message); process.exit(1); });
