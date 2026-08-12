/**
 * aurora-dlna — SSDP 发现（规格 §2）
 * 监听 239.255.255.250:1900，响应 M-SEARCH；周期 alive；退出 byebye。
 */
'use strict';
const dgram = require('dgram');
const os = require('os');

const MCAST = '239.255.255.250';
const PORT = 1900;

function privateIPv4() {
  const out = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family === 'IPv4' && !a.internal) out.push(a.address);
    }
  }
  return out;
}

function startSsdp({ udn, friendlyName, locationFor }) {
  const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  const ST_RENDERER = 'urn:schemas-upnp-org:device:MediaRenderer:1';
  const targets = ['upnp:rootdevice', ST_RENDERER, 'ssdp:all'];

  sock.on('message', (msg, rinfo) => {
    const text = msg.toString('latin1');
    if (!/^M-SEARCH/i.test(text)) return;
    const stM = text.match(/^ST:\s*(.+?)\s*$/im);
    if (!stM) return;
    const st = stM[1].replace(/"/g, '');
    if (!targets.includes(st)) return;
    const mxM = text.match(/^MX:\s*(\d+)/im);
    const delay = Math.floor(Math.random() * Math.min(mxM ? +mxM[1] * 1000 : 1000, 1200));
    setTimeout(() => respond(st, rinfo), delay);
  });

  function respond(st, rinfo) {
    const ip = pickLocalFor(rinfo.address);
    if (!ip) return;
    const location = locationFor(ip);
    const usn = st === 'upnp:rootdevice' ? `${udn}::upnp:rootdevice` : `${udn}::${st}`;
    const lines = [
      'HTTP/1.1 200 OK',
      `CACHE-CONTROL: max-age=1800`,
      `LOCATION: ${location}`,
      `SERVER: ${require('./xml').SERVER}`,
      `ST: ${st}`,
      `USN: ${usn}`,
      '', '',
    ].join('\r\n');
    sock.send(lines, rinfo.port, rinfo.address);
  }

  function notify(nt, nts) {
    for (const ip of privateIPv4()) {
      const lines = [
        'NOTIFY * HTTP/1.1',
        `HOST: ${MCAST}:${PORT}`,
        `CACHE-CONTROL: max-age=1800`,
        `LOCATION: ${locationFor(ip)}`,
        `NT: ${nt}`,
        `NTS: ${nts}`,
        `SERVER: ${require('./xml').SERVER}`,
        `USN: ${nt.includes('::') ? nt : `${udn}::${nt}`}`,
        '', '',
      ].join('\r\n');
      sock.send(lines, PORT, MCAST);
    }
  }

  function alive() {
    notify('upnp:rootdevice', 'ssdp:alive');
    notify(ST_RENDERER, 'ssdp:alive');
    notify(udn, 'ssdp:alive');
  }
  function byebye() {
    notify('upnp:rootdevice', 'ssdp:byebye');
    notify(ST_RENDERER, 'ssdp:byebye');
    notify(udn, 'ssdp:byebye');
  }

  function pickLocalFor(remoteIp) {
    const ips = privateIPv4();
    const same = ips.find((ip) => ip.split('.').slice(0, 3).join('.') === remoteIp.split('.').slice(0, 3).join('.'));
    return same || ips[0] || null;
  }

  sock.on('error', (e) => console.error('[ssdp]', e.message));
  sock.bind(PORT, () => {
    try {
      for (const ip of privateIPv4()) sock.addMembership(MCAST, ip);
      sock.setMulticastTTL(4);
    } catch (e) { console.error('[ssdp] membership:', e.message); }
    alive();
  });

  // 周期 alive（规格：间隔 ≤900s）+ 网络变化重宣告（轻量轮询）
  let lastIfaces = JSON.stringify(privateIPv4());
  const timer = setInterval(() => {
    const now = JSON.stringify(privateIPv4());
    if (now !== lastIfaces) { lastIfaces = now; byebye(); setTimeout(alive, 500); }
    else alive();
  }, 300_000);
  timer.unref();

  return { byebye, close: () => { try { byebye(); sock.close(); } catch {} clearInterval(timer); } };
}

module.exports = { startSsdp, privateIPv4 };
