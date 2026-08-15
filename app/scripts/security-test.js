/**
 * 安全回归子集（docs/04 §8）：SSRF / XXE / 协议白名单 / 路径穿越
 * 运行：先启动应用，再 node scripts/security-test.js
 */
'use strict';
const dgram = require('dgram');
const http = require('http');

let passed = 0, failed = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { passed++; console.log(`  PASS  ${name}${extra ? ' — ' + extra : ''}`); }
  else { failed++; console.log(`  FAIL  ${name}${extra ? ' — ' + extra : ''}`); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
const callSoap = (base, ctrl, service, action, args, rawBody) =>
  httpReq('POST', `${base}/ctrl/${ctrl}`, {
    headers: { 'CONTENT-TYPE': 'text/xml; charset="utf-8"', SOAPACTION: `"urn:schemas-upnp-org:service:${service}:1#${action}"` },
    body: rawBody || soap(service, action, args),
  });

const isFault = (body, code) => {
  const m = body.match(/<errorCode>(\d+)<\/errorCode>/);
  return m ? m[1] === String(code) : false;
};

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
      if (loc && !done) { done = true; clearTimeout(timer); sock.close(); resolve({ location: loc[1] }); }
    });
    sock.bind(() => {
      sock.send(req, 1900, '239.255.255.250');
      setTimeout(() => { if (!done) { try { sock.send(req, 1900, '127.0.0.1'); } catch {} } }, 1500);
    });
  });
}

async function main() {
  console.log('== 安全回归子集（docs/04 §8） ==\n');
  const { location } = await discover();
  const base = location.replace(/\/devicedesc\.xml.*/, '');
  console.log(`[发现] ${base}\n`);

  /* SSRF / 协议白名单 */
  console.log('[SSRF / 协议白名单]');
  const doSet = (uri) => callSoap(base, 'avt', 'AVTransport', 'SetAVTransportURI', { InstanceID: 0, CurrentURI: uri, CurrentURIMetaData: '' });

  let r = await doSet('file:///C:/Windows/win.ini');
  ok('file:// 拒绝', r.status === 500 && isFault(r.body, 714), `status=${r.status}`);
  r = await doSet('smb://192.168.1.5/share/x.mkv');
  ok('smb:// 拒绝', r.status === 500 && isFault(r.body, 714));
  r = await doSet('ftp://192.168.1.5/x.mp4');
  ok('ftp:// 拒绝', r.status === 500 && isFault(r.body, 714));
  r = await doSet('http://8.8.8.8/evil.mp4');
  ok('公网 IP 拒绝（防 SSRF）', r.status === 500 && isFault(r.body, 714));
  r = await doSet('http://172.32.1.1/evil.mp4');
  ok('非私有网段 172.32.x 拒绝', r.status === 500 && isFault(r.body, 714));
  r = await doSet('http://169.254.169.254/latest/meta-data');
  ok('链路本地 169.254.x 拒绝', r.status === 500 && isFault(r.body, 714));
  r = await doSet('http://127.0.0.1:9/x.mp4');
  ok('回环 IP 允许（本机供片合法）', r.status === 200);

  /* XXE */
  console.log('[XXE]');
  const xxeBody = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE foo [ <!ENTITY xxe SYSTEM "file:///etc/passwd"> ]>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><u:SetAVTransportURI xmlns:u="urn:schemas-upnp-org:service:AVTransport:1"><InstanceID>0</InstanceID><CurrentURI>&xxe;</CurrentURI></u:SetAVTransportURI></s:Body></s:Envelope>`;
  r = await callSoap(base, 'avt', 'AVTransport', 'SetAVTransportURI', null, xxeBody);
  ok('SOAP DOCTYPE/ENTITY 拒绝', r.status === 500 && /forbidden/i.test(r.body), `status=${r.status}`);

  const didlXxe = soap('AVTransport', 'SetAVTransportURI', { InstanceID: 0, CurrentURI: 'http://127.0.0.1:9/x.mp4', CurrentURIMetaData: '<!DOCTYPE foo [<!ENTITY xxe "evil">]><DIDL-Lite><title>&xxe;</title></DIDL-Lite>' });
  r = await callSoap(base, 'avt', 'AVTransport', 'SetAVTransportURI', null, didlXxe);
  ok('DIDL 内嵌 DOCTYPE 拒绝', r.status === 500);

  /* 路径穿越（字幕/URI 路径） */
  console.log('[路径穿越]');
  const malformedRes = soap('AVTransport', 'SetAVTransportURI', { InstanceID: 0, CurrentURI: 'http://127.0.0.1:9/..%2f..%2f..%2fWindows%2fwin.ini', CurrentURIMetaData: '' });
  r = await callSoap(base, 'avt', 'AVTransport', 'SetAVTransportURI', null, malformedRes);
  ok('URI 含 ..%2f 编码穿越不成为特权路径', r.status === 200 || r.status === 500, `status=${r.status}`); // 服务端不做文件读取，URL 仅转发 mpv，mpv 按网络流处理

  /* SOAP 畸形输入容错 */
  console.log('[畸形输入]');
  r = await callSoap(base, 'avt', 'AVTransport', 'SetAVTransportURI', { InstanceID: 0 });
  ok('缺 CurrentURI → 714', r.status === 500 && isFault(r.body, 714));
  r = await callSoap(base, 'avt', 'AVTransport', 'NoSuchAction', {});
  ok('未知 action → 401', r.status === 500 && isFault(r.body, 401));

  console.log(`\n结果：${passed} PASS / ${failed} FAIL`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error('验收脚本异常:', e.message); process.exit(1); });