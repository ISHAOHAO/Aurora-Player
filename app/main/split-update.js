const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Readable, Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const LIMIT = 80 * 1024 * 1024;
const versionPattern = /^\d+\.\d+\.\d+$/;
function newer(a, b) {
  if (!versionPattern.test(a) || !versionPattern.test(b)) throw new Error('不支持的版本号');
  const x = a.split('.').map(Number), y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
}
function validate(m) {
  const hash = x => typeof x === 'string' && /^[A-Za-z0-9+/]{86}==$/.test(x);
  if (!m || m.schema !== 1 || !versionPattern.test(m.version) || m.platform !== 'win32-x64' ||
      !Number.isSafeInteger(m.size) || m.size <= 0 || !hash(m.sha512) ||
      !Array.isArray(m.parts) || !m.parts.length || m.parts.length > 128) throw new Error('分片更新清单无效');
  let size = 0;
  for (const p of m.parts) {
    if (!Number.isSafeInteger(p.size) || p.size <= 0 || p.size > LIMIT || !hash(p.sha512) || new URL(p.url).protocol !== 'https:') throw new Error('分片信息无效');
    size += p.size;
  }
  if (size !== m.size) throw new Error('分片总大小不匹配');
  return m;
}
async function matches(file, size, sha512) {
  try {
    if ((await fs.promises.stat(file)).size !== size) return false;
    const h = crypto.createHash('sha512');
    for await (const b of fs.createReadStream(file)) h.update(b);
    return h.digest('base64') === sha512;
  } catch (e) { if (e.code === 'ENOENT') return false; throw e; }
}
async function readManifest(url, fetcher = fetch) {
  const r = await fetcher(url, { signal: AbortSignal.timeout(30000), cache: 'no-store' });
  if (!r.ok || new URL(r.url || url).protocol !== 'https:') throw new Error(`读取更新清单失败 HTTP ${r.status}`);
  const chunks = []; let size = 0;
  for await (const b of r.body) {
    size += b.length;
    if (size > 256 * 1024) throw new Error('更新清单过大');
    chunks.push(Buffer.from(b));
  }
  return validate(JSON.parse(Buffer.concat(chunks).toString('utf8')));
}
async function download(m, root, progress = () => {}, fetcher = fetch) {
  validate(m);
  const dir = path.join(root, crypto.createHash('sha256').update(m.sha512).digest('hex'));
  await fs.promises.mkdir(dir, { recursive: true });
  const target = path.join(dir, 'installer.exe');
  if (await matches(target, m.size, m.sha512)) return target;
  let completed = 0;
  for (let i = 0; i < m.parts.length; i++) {
    const p = m.parts[i], file = path.join(dir, `${i}.part`), temp = file + '.tmp';
    if (!await matches(file, p.size, p.sha512)) {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const r = await fetcher(p.url, { signal: AbortSignal.timeout(10 * 60 * 1000) });
          if (!r.ok || new URL(r.url || p.url).protocol !== 'https:') throw new Error(`分片下载失败 HTTP ${r.status}`);
          let received = 0;
          const meter = new Transform({ transform(chunk, enc, cb) {
            received += chunk.length;
            if (received > p.size) return cb(new Error('分片超过声明大小'));
            progress(completed + received, m.size); cb(null, chunk);
          } });
          await pipeline(Readable.fromWeb(r.body), meter, fs.createWriteStream(temp));
          if (!await matches(temp, p.size, p.sha512)) throw new Error('分片校验失败');
          await fs.promises.rm(file, { force: true });
          await fs.promises.rename(temp, file); break;
        } catch (e) {
          await fs.promises.rm(temp, { force: true });
          if (attempt === 2) throw e;
        }
      }
    }
    completed += p.size; progress(completed, m.size);
  }
  const temp = target + '.tmp';
  try {
    async function* chunks() {
      for (let i = 0; i < m.parts.length; i++) yield* fs.createReadStream(path.join(dir, `${i}.part`));
    }
    await pipeline(Readable.from(chunks()), fs.createWriteStream(temp));
    if (!await matches(temp, m.size, m.sha512)) throw new Error('完整安装包校验失败');
    await fs.promises.rm(target, { force: true });
    await fs.promises.rename(temp, target);
    return target;
  } finally { await fs.promises.rm(temp, { force: true }); }
}
module.exports = { LIMIT, newer, validate, matches, readManifest, download };
