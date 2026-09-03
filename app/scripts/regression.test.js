const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const db = require('../main/db');

test('media deletion persists, failed replacement rolls back and connection recovers', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aurora-db-test-'));
  const conn = db.open(path.join(dir, 'test.db'));
  try {
    db.replaceMedia([{ path: 'a', name: 'A', title: 'A' }]);
    assert.throws(() => db.replaceMedia([{ path: 'b', name: 'B', title: 'B' }, { path: 'c', name: 'C' }]));
    assert.deepEqual(db.allMedia().map(x => x.path), ['a']);
    db.replaceMedia([]);
    assert.equal(db.allMedia().length, 0);
  } finally { conn.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('refreshing recent metadata preserves resume position', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aurora-recent-test-'));
  const conn = db.open(path.join(dir, 'test.db'));
  try {
    db.recentAdd('a', 'A', 1, 'cover');
    db.recentUpdatePosition('a', 120, 600);
    db.recentAdd('a', 'A', 2, null);
    assert.equal(db.recentList()[0].position, 120);
    assert.equal(db.recentList()[0].poster, 'cover');
  } finally { conn.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

function updaterFixture(packaged) {
  const handlers = new Map();
  const updater = new EventEmitter();
  updater.setFeedURL = config => assert.equal(config.provider, 'generic');
  updater.checkForUpdates = async () => ({ isUpdateAvailable: false, updateInfo: { version: '1.0.0' } });
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../main/updater.js'), 'utf8'), {
    module, console, setTimeout: () => ({ unref() {} }),
    require: id => id === 'electron-updater' ? { autoUpdater: updater } : {
      app: { isPackaged: packaged }, ipcMain: { handle: (name, fn) => handlers.set(name, fn) },
      BrowserWindow: { getAllWindows: () => [] },
    },
  });
  module.exports.init();
  return { handlers, updater };
}

test('updater initializes provider, reports no-update correctly and retains latest status', async () => {
  const { handlers, updater } = updaterFixture(true);
  assert.ok(handlers.has('update:check'));
  assert.equal((await handlers.get('update:check')()).updateAvailable, false);
  updater.emit('update-downloaded', { version: '1.1.0' });
  assert.equal(handlers.get('update:get-status')().state, 'downloaded');
});

test('development updater handlers return unavailable without contacting production', async () => {
  const { handlers } = updaterFixture(false);
  assert.ok(handlers.has('update:check'));
  assert.equal((await handlers.get('update:check')()).ok, false);
});

test('packaged and development launches keep file arguments; resume honors settings', () => {
  const { fileFromArgs, resumePosition } = require('../main/launch');
  assert.equal(fileFromArgs(['player.exe', 'movie.mkv'], false, () => true), path.resolve('movie.mkv'));
  assert.equal(fileFromArgs(['electron', '.', 'movie.mkv'], true, () => true), path.resolve('movie.mkv'));
  assert.equal(resumePosition({ position: 120, duration: 600 }, true), 120);
  assert.equal(resumePosition({ position: 120, duration: 600 }, false, 120), 0);
  assert.equal(resumePosition({ position: 595, duration: 600 }, true), 0);
});

test('mpv requests time out, disconnect settles requests and disposal prevents reconnect', async () => {
  const { MpvTransport } = require('../main/mpv-transport');
  let connections = 0;
  const socket = new EventEmitter();
  socket.write = () => {};
  socket.destroy = () => socket.emit('close');
  const client = new MpvTransport('test', { connect: () => { connections++; return socket; }, timeout: 15, retryDelay: 5 });
  client.connect(); socket.emit('connect');
  assert.equal((await client.command('get_property', 'time-pos')).error, 'timeout');
  assert.equal(client.pending.size, 0);
  const pending = client.command('get_property', 'pause');
  socket.emit('close');
  assert.equal((await pending).error, 'disconnected');
  client.dispose();
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(connections, 1);
  assert.equal(client.pending.size, 0);
});

test('historical drops do not trigger degradation; new drops and pause reset work', () => {
  const { DropMeter } = require('../main/drop-meter');
  const meter = new DropMeter();
  let rate;
  for (let i = 0; i <= 10; i++) rate = meter.sample(1, 60, true, i * 500);
  assert.equal(rate, 0);
  for (let i = 11; i <= 20; i++) rate = meter.sample(i, 60, true, i * 500);
  assert.ok(rate > 0.005);
  meter.sample(20, 60, false, 11000);
  assert.equal(meter.sample(20, 60, true, 11500), null);
});

test('HDR transitions explicitly restore auto and zero properties', () => {
  const { decide } = require('../main/hdr');
  const actual = decide({ gamma: 'pq' }, { hdr: false }, {}, { targetPeak: 800, targetContrast: 1000, saturation: 0.5 }).props;
  Object.assign(actual, decide({ gamma: 'pq' }, { hdr: true }).props);
  assert.equal(actual['target-peak'], 'auto');
  assert.equal(actual['target-contrast'], 'auto');
  assert.equal(actual.saturation, 0);
  assert.equal(actual['gamut-mapping-mode'], 'auto');
  assert.equal(actual['tone-mapping'], 'auto');
});
