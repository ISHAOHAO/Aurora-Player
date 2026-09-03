const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { scan } = require('../main/scan-worker');
const { Worker } = require('node:worker_threads');
const db = require('../main/db');
test('scan preserves offline roots, removes unconfigured roots and reports limits', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aurora-scan-test-'));
  try {
    const offline = path.join(dir, 'offline');
    const old = { path: path.join(offline, 'old.mkv'), name: 'old', title: 'Old', mtime: 1 };
    assert.equal((await scan({ folders: [offline], previous: [old] })).items.length, 1);
    assert.equal((await scan({ folders: [], previous: [old] })).items.length, 0);
    await fs.writeFile(path.join(dir, 'Film.2024.mkv'), 'fixture');
    await fs.writeFile(path.join(dir, 'Film.2024.nfo'), '<movie><title>Title from NFO</title></movie>');
    const result = await scan({ folders: [dir], previous: [] });
    assert.equal(result.items[0].title, 'Title from NFO');
    assert.equal((await scan({ folders: [dir], previous: [], limit: 0 })).errors[0].code, 'INCOMPLETE');
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
test('real worker scans and commits to a temporary SQLite database', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aurora-worker-test-'));
  const dbPath = path.join(dir, 'library.db');
  try {
    await fs.writeFile(path.join(dir, 'A.mkv'), 'fixture');
    const worker = new Worker(path.join(__dirname, '../main/scan-worker.js'), { workerData: { folders: [dir], dbPath } });
    await new Promise((resolve, reject) => { worker.on('error', reject); worker.on('exit', code => code ? reject(new Error('worker exit ' + code)) : resolve()); });
    const connection = db.open(dbPath);
    try { assert.equal(db.allMedia().length, 1); } finally { connection.close(); }
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
