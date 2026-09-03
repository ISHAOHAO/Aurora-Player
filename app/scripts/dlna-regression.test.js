const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { resolveLan, isLan, createMediaGateway } = require('../dlna/lan-network');
const { startHttpd } = require('../dlna/httpd');
function request(port, method, url, headers = {}, body = '') {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, method, path: url, headers, timeout: 2000 }, res => {
      let text = ''; res.on('data', c => text += c); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: text }));
    });
    req.on('error', reject); req.on('timeout', () => req.destroy(new Error('timeout'))); req.end(body);
  });
}
test('LAN policy rejects public/mixed DNS, metadata, credentials and callback peer mismatch', async () => {
  assert.equal(isLan('::ffff:192.168.1.2'), true);
  assert.equal(isLan('169.254.169.254'), false);
  assert.equal(isLan('8.8.8.8'), false);
  await assert.rejects(resolveLan('http://outside.example', { lookup: async () => [{ address: '8.8.8.8', family: 4 }] }));
  await assert.rejects(resolveLan('http://nas.example', { lookup: async () => [{ address: '192.168.1.2', family: 4 }, { address: '8.8.8.8', family: 4 }] }));
  await assert.rejects(resolveLan('http://192.168.1.3', { peer: '192.168.1.2' }));
  await assert.rejects(resolveLan('http://user:pass@192.168.1.2'));
  assert.equal((await resolveLan('http://nas.example', { lookup: async () => [{ address: '192.168.1.2', family: 4 }] })).address, '192.168.1.2');
});
test('GENA renewal, cross-service rejection, callback restrictions and unsubscribe', async t => {
  const callback = http.createServer((_req, res) => res.end());
  await new Promise(resolve => callback.listen(0, '127.0.0.1', resolve));
  const service = await startHttpd({ cfg: { port: 0, host: '127.0.0.1' }, state: {}, sendCmd() {}, log() {} });
  const port = service.server.address().port;
  t.after(() => { service.server.closeAllConnections(); service.server.close(); callback.closeAllConnections(); callback.close(); });
  const first = await request(port, 'SUBSCRIBE', '/evt/avt', { callback: `<http://127.0.0.1:${callback.address().port}/notify>`, nt: 'upnp:event' });
  assert.equal(first.status, 200);
  const sid = first.headers.sid;
  assert.equal((await request(port, 'SUBSCRIBE', '/evt/avt', { sid, timeout: 'Second-1800' })).status, 200);
  assert.equal((await request(port, 'SUBSCRIBE', '/evt/rc', { sid })).status, 412);
  assert.equal((await request(port, 'SUBSCRIBE', '/evt/avt', { sid, nt: 'upnp:event' })).status, 412);
  assert.equal((await request(port, 'SUBSCRIBE', '/evt/avt', { callback: '<http://203.0.113.1/notify>', nt: 'upnp:event' })).status, 412);
  assert.equal((await request(port, 'UNSUBSCRIBE', '/evt/avt', { sid })).status, 200);
  assert.equal((await request(port, 'SUBSCRIBE', '/evt/avt', { sid })).status, 412);
});
test('media gateway checks redirects and rejects manifest responses', async t => {
  let outsideRequests = 0;
  const origin = http.createServer((req, res) => {
    if (req.url === '/redirect') { res.writeHead(302, { location: 'http://8.8.8.8/private' }); res.end(); }
    else { res.writeHead(200, { 'content-type': 'application/vnd.apple.mpegurl' }); res.end('#EXTM3U'); }
  });
  await new Promise(resolve => origin.listen(0, '127.0.0.1', resolve));
  const gateway = createMediaGateway({ resolve: async uri => { if (new URL(uri).hostname === '8.8.8.8') outsideRequests++; return resolveLan(uri); } });
  const server = http.createServer((req, res) => gateway.serve(req, res));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { origin.closeAllConnections(); origin.close(); server.closeAllConnections(); server.close(); });
  for (const name of ['redirect', 'manifest']) {
    const uri = await gateway.register(`http://127.0.0.1:${origin.address().port}/${name}`, 'current', server.address().port);
    assert.equal((await request(server.address().port, 'GET', new URL(uri).pathname)).status, 502);
  }
  assert.equal(outsideRequests, 1); // rejected during resolution, no external connection
});
