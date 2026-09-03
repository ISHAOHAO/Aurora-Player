const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { EventEmitter } = require('node:events');
function fixture() {
  const filename = path.join(__dirname, '../main/main.js');
  const localRequire = createRequire(filename);
  const processes = [];
  const children = [];
  const commands = [];
  const events = [];
  const transports = [];
  const timers = new Set();
  const makeProcess = list => {
    const proc = new EventEmitter();
    proc.kill = () => {}; proc.postMessage = () => {};
    list.push(proc); return proc;
  };
  class Transport extends EventEmitter {
    constructor() { super(); transports.push(this); }
    connect() {} dispose() {}
    command(...args) { commands.push(args); return Promise.resolve({ error: 'success' }); }
  }
  const ctx = {
    Buffer, console, process: { ...process, env: { ...process.env } }, __dirname: path.dirname(filename),
    setTimeout: (fn, ms) => { const id = setTimeout(fn, ms === 1500 || ms === 2000 ? 10 : ms); timers.add(id); return id; },
    clearTimeout, clearInterval, setInterval,
    require: name => {
      if (name === 'electron') return {
        app: { isPackaged: false, requestSingleInstanceLock: () => false, quit() {}, getPath: () => __dirname },
        ipcMain: { handle() {}, on() {} }, utilityProcess: { fork: () => makeProcess(children) },
      };
      if (name === 'child_process') return { spawn: (_exe, args) => { const proc = makeProcess(processes); proc.args = args; return proc; } };
      if (name === './mpv-transport') return { MpvTransport: Transport };
      if (name === './db') return { allMedia: () => [], recentGet: () => null, recentAdd() {} };
      if (name === './updater') return { init() {} };
      return localRequire(name);
    },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(filename, 'utf8') + `
    homeWin = { isDestroyed: () => false, show() {}, setFullScreen(value) { videoFs = value; }, webContents: { send: (...args) => testEvents.push(args) }, getNativeWindowHandle: () => Buffer.alloc(8) };
    globalThis.api = { startPlayback, stopPlayback, startDlna, restartDlna, mpvCommand, confirmLoaded,
      fullscreen: () => { videoFs = true; }, defaultVolume: value => { settings.defaultVolume = value; },
      snapshot: () => ({ file: currentPath, proc: mpvProc, dlna: dlnaProc, generation: sessionGeneration, fullscreen: videoFs, volume: lastStatus.volume, mute: lastStatus.mute }) };
  `, ctx, { filename });
  ctx.testEvents = events;
  return { api: ctx.api, processes, children, commands, events, transports, cleanup: () => timers.forEach(clearTimeout) };
}

test('episode switch preserves fullscreen, latest volume and mute before polling or file-loaded', async t => {
  const f = fixture(); t.after(f.cleanup);
  f.api.defaultVolume(64);
  await f.api.startPlayback('http://192.168.1.2/one.mp4', undefined, { cp: 'phone' });
  assert.ok(f.processes[0].args.includes('--volume=64'));
  f.api.fullscreen();
  await f.api.mpvCommand('set_property', 'volume', 23);
  await f.api.mpvCommand('cycle', 'mute');
  await f.api.startPlayback('http://192.168.1.2/two.mp4', undefined, { cp: 'phone' });
  assert.equal(f.api.snapshot().fullscreen, true);
  assert.ok(f.processes[1].args.includes('--volume=23'));
  assert.ok(f.processes[1].args.includes('--mute=yes'));
  f.api.confirmLoaded();
  assert.equal(f.commands.some(args => args[1] === 'volume' && args[2] === 64), false);
  f.api.stopPlayback();
  assert.equal(f.api.snapshot().fullscreen, false);
  assert.ok(f.events.some(args => args[0] === 'nav:goto' && args[1] === 'home'));
});

test('DLNA Stop then load keeps presentation and zero volume; remote changes during switch survive', async t => {
  const f = fixture(); t.after(f.cleanup);
  f.api.startDlna();
  await f.api.startPlayback('http://192.168.1.2/one.mp4', undefined, { cp: 'phone' });
  f.api.fullscreen();
  f.children[0].emit('message', { type: 'cmd', cmd: 'volume', value: 0 });
  f.children[0].emit('message', { type: 'cmd', cmd: 'stop' });
  assert.equal(f.api.snapshot().fullscreen, true);
  assert.equal(f.events.some(args => args[0] === 'nav:goto' && args[1] === 'home'), false);
  const next = f.api.startPlayback('http://192.168.1.2/two.mp4', undefined, { cp: 'phone' });
  await next;
  assert.ok(f.processes[1].args.includes('--volume=0'));
  const third = f.api.startPlayback('http://192.168.1.2/three.mp4', undefined, { cp: 'phone' });
  f.children[0].emit('message', { type: 'cmd', cmd: 'volume', value: 36 });
  await third;
  assert.ok(f.processes[2].args.includes('--volume=36'));
  await f.api.mpvCommand('add', 'volume', -5);
  assert.equal(f.api.snapshot().volume, 31);
  f.children[0].emit('message', { type: 'cmd', cmd: 'stop' });
  await f.api.mpvCommand('cycle', 'pause');
  assert.equal(f.api.snapshot().file, 'http://192.168.1.2/three.mp4');
  assert.ok(f.processes[3].args.includes('--volume=31'));
  assert.equal(f.api.snapshot().fullscreen, true);
});
test('rapid opens spawn only final file; stopping during a switch cancels the launch', async t => {
  const f = fixture(); t.after(f.cleanup);
  await Promise.all(['a', 'b', 'c'].map(name => f.api.startPlayback(path.resolve(name + '.mkv'))));
  assert.equal(f.processes.length, 1);
  assert.equal(f.api.snapshot().file, path.resolve('c.mkv'));
  const switching = f.api.startPlayback(path.resolve('d.mkv'));
  f.api.stopPlayback();
  await switching;
  assert.equal(f.processes.length, 1);
  assert.equal(f.api.snapshot().proc, null);
});

test('volume changes while the engine connects are replayed before polling', async t => {
  const f = fixture(); t.after(f.cleanup);
  await f.api.startPlayback(path.resolve('a.mkv'));
  await f.api.mpvCommand('set_property', 'volume', 17);
  await f.api.mpvCommand('set_property', 'mute', true);
  f.commands.length = 0;
  f.transports[0].emit('connected');
  assert.deepEqual(f.commands.slice(0, 2), [['set_property', 'volume', 17], ['set_property', 'mute', true]]);
  f.api.stopPlayback();
});
test('old mpv and DLNA exits cannot clear newer process references', async t => {
  const f = fixture(); t.after(f.cleanup);
  await f.api.startPlayback(path.resolve('a.mkv'));
  const old = f.processes[0];
  await f.api.startPlayback(path.resolve('b.mkv'));
  old.emit('exit', 0);
  assert.equal(f.api.snapshot().proc, f.processes[1]);
  f.api.startDlna();
  const oldDlna = f.children[0];
  await f.api.restartDlna();
  oldDlna.emit('exit', 0);
  assert.equal(f.api.snapshot().dlna, f.children[1]);
});
