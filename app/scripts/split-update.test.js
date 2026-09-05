const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { splitRelease } = require('./split-release');
const { download, validate, newer, readManifest } = require('../main/split-update');
async function fixture(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aurora-split-test-'));
  try {
    const data = Buffer.from('a real installer stand-in with multiple chunks');
    const input = path.join(dir, 'setup.exe'), out = path.join(dir, 'parts');
    fs.writeFileSync(input, data);
    const m = await splitRelease(input, '1.0.2', out, 'https://example.com/v1.0.2/', 10);
    const fetcher = async url => new Response(fs.readFileSync(path.join(out, path.basename(new URL(url).pathname))));
    await fn({ dir, data, m, fetcher });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
test('split publication round-trips exactly and cached installer needs no network', () => fixture(async ({ dir, data, m, fetcher }) => {
  let progress = 0;
  const file = await download(m, dir, n => { progress = n; }, fetcher);
  assert.deepEqual(fs.readFileSync(file), data);
  assert.equal(progress, data.length);
  assert.equal(await download(m, dir, () => {}, () => { throw new Error('offline'); }), file);
}));
test('corrupt and interrupted parts retry; completed parts survive failure', () => fixture(async ({ dir, data, m, fetcher }) => {
  let count = 0;
  await assert.rejects(download(m, dir, () => {}, async url => {
    count++;
    if (url === m.parts[1].url) return new Response('bad');
    return fetcher(url);
  }), /校验/);
  assert.equal(count, 4);
  const requested = [];
  const file = await download(m, dir, () => {}, async url => { requested.push(url); return fetcher(url); });
  assert.ok(!requested.includes(m.parts[0].url));
  assert.deepEqual(fs.readFileSync(file), data);
}));
test('complete hash mismatch cannot produce an installable target', () => fixture(async ({ dir, m, fetcher }) => {
  m.sha512 = Buffer.alloc(64).toString('base64');
  await assert.rejects(download(m, dir, () => {}, fetcher), /完整安装包校验/);
  assert.ok(!fs.readdirSync(dir, { recursive: true }).some(p => p.endsWith('installer.exe')));
}));
test('reject bad size, insecure URL, HTML response and oversized payload', () => fixture(async ({ dir, m }) => {
  assert.throws(() => validate({ ...m, size: m.size + 1 }));
  assert.throws(() => validate({ ...m, parts: [{ ...m.parts[0], url: 'http://example.com/a' }] }));
  await assert.rejects(readManifest('https://example.com/m', async () => new Response('<html>login</html>')));
  await assert.rejects(download(m, dir, () => {}, async () => new Response(Buffer.alloc(100))), /超过/);
}));
test('versions compare numerically and reject prerelease or malformed values', () => {
  assert.equal(newer('1.0.10', '1.0.9'), true);
  assert.equal(newer('1.0.1', '1.0.1'), false);
  assert.equal(newer('1.0.1', '1.1.0'), false);
  assert.throws(() => newer('1.0.2-beta', '1.0.1'));
});
