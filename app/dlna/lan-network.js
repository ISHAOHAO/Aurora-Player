'use strict';
const dns = require('node:dns').promises;
const net = require('node:net');
const http = require('node:http');
const https = require('node:https');
const crypto = require('node:crypto');
const allowed = new net.BlockList();
for (const [address, prefix] of [['10.0.0.0', 8], ['172.16.0.0', 12], ['192.168.0.0', 16], ['127.0.0.0', 8], ['169.254.0.0', 16]]) allowed.addSubnet(address, prefix, 'ipv4');
allowed.addAddress('::1', 'ipv6');
allowed.addSubnet('fe80::', 10, 'ipv6');
allowed.addSubnet('fc00::', 7, 'ipv6');
function normalize(address) { return address.replace(/^\[|\]$/g, '').replace(/^::ffff:/i, ''); }
function isLan(address) {
  const ip = normalize(address);
  const version = net.isIP(ip);
  if (!version || ip === '169.254.169.254' || ip === '169.254.170.2') return false;
  return allowed.check(ip, version === 6 ? 'ipv6' : 'ipv4');
}
async function resolveLan(uri, { peer, lookup = dns.lookup } = {}) {
  const url = new URL(uri);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Only LAN HTTP(S) URLs without credentials are allowed');
  const host = normalize(url.hostname);
  let timer;
  const records = net.isIP(host) ? [{ address: host, family: net.isIP(host) }] : await Promise.race([
    lookup(host, { all: true, verbatim: true }),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('DNS timeout')), 3000); }),
  ]).finally(() => clearTimeout(timer));
  if (!records.length || records.some(r => !isLan(r.address) || (peer && normalize(r.address) !== normalize(peer)))) throw new Error('Address outside allowed LAN/peer');
  return { url, address: normalize(records[0].address), family: records[0].family };
}
function pinnedRequest(target, options, callback) {
  const transport = target.url.protocol === 'https:' ? https : http;
  const req = transport.request(target.url, {
    ...options, agent: false, timeout: 5000,
    lookup: (_hostname, opts, done) => opts.all
      ? done(null, [{ address: target.address, family: target.family }])
      : done(null, target.address, target.family),
  }, callback);
  req.on('timeout', () => req.destroy(new Error('Network timeout')));
  return req;
}

/** Only these two session resources can be streamed. Every request/redirect is DNS-validated and pinned. */
function createMediaGateway({ resolve = resolveLan, request = pinnedRequest } = {}) {
  const resources = new Map();
  const inflight = new Set();
  return {
    async register(uri, slot, port, isCurrent = () => true) {
      await resolve(uri);
      if (!isCurrent()) throw new Error('Superseded request');
      for (const [token, item] of resources) if (item.slot === slot) resources.delete(token);
      const token = crypto.randomBytes(24).toString('hex');
      resources.set(token, { uri, slot });
      return `http://127.0.0.1:${port}/media/${token}`;
    },
    promote(uri) {
      const token = new URL(uri).pathname.split('/').pop();
      for (const [key, item] of resources) if (item.slot === 'current' && key !== token) resources.delete(key);
      if (resources.has(token)) resources.get(token).slot = 'current';
    },
    async serve(req, res) {
      if (!req.url.startsWith('/media/')) return false;
      const item = resources.get(req.url.slice('/media/'.length));
      if (!item || !['127.0.0.1', '::1'].includes(normalize(req.socket.remoteAddress)) || !['GET', 'HEAD'].includes(req.method)) {
        res.writeHead(403); res.end(); return true;
      }
      if (inflight.size >= 16) { res.writeHead(503); res.end(); return true; }
      const slot = {};
      inflight.add(slot);
      let upstream;
      let closed = false;
      res.on('close', () => { closed = true; upstream?.destroy(); inflight.delete(slot); });
      const forward = async (uri, redirects = 0) => {
        if (closed) return;
        const target = await resolve(uri);
        if (closed) return;
        const headers = {};
        if (req.headers.range && /^bytes=\d*-\d*$/.test(req.headers.range)) headers.range = req.headers.range;
        upstream = request(target, { method: req.method, headers }, response => {
          if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
            response.resume();
            if (!response.headers.location || redirects >= 5) { fail(); return; }
            let next;
            try { next = new URL(response.headers.location, target.url).href; } catch { fail(); return; }
            forward(next, redirects + 1).catch(fail); return;
          }
          const contentType = response.headers['content-type'] || '';
          if (/mpegurl|dash\+xml|text\/|application\/(?:xml|json)/i.test(contentType)) {
            response.destroy(); fail(); return;
          }
          const output = {};
          for (const key of ['content-type', 'content-length', 'content-range', 'accept-ranges']) if (response.headers[key]) output[key] = response.headers[key];
          res.writeHead(response.statusCode, output);
          response.on('error', fail); response.pipe(res);
        });
        upstream.once('error', fail); upstream.end();
      };
      const fail = () => {
        inflight.delete(slot);
        if (closed) return;
        if (res.headersSent) res.destroy(); else { res.writeHead(502); res.end('LAN media unavailable or unsupported'); }
      };
      await forward(item.uri).catch(fail);
      return true;
    },
    close() { resources.clear(); },
  };
}
module.exports = { normalize, isLan, resolveLan, pinnedRequest, createMediaGateway };
