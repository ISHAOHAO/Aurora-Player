// Run via Electron. Uses an isolated profile and generated WAVs; DLNA and updates stay disabled.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aurora-electron-smoke-'));
const deadline = setTimeout(() => { console.error('Electron smoke exceeded 30 seconds'); app.exit(1); }, 30000);
app.disableHardwareAcceleration();
app.setPath('userData', temp);
fs.writeFileSync(path.join(temp, 'settings.json'), JSON.stringify({ dlnaEnabled: false, libraryFolders: [] }));
// Existing cover suppresses background cover generation for these synthetic audio fixtures.
fs.writeFileSync(path.join(temp, 'poster.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
const wav = Buffer.alloc(44 + 8000 * 2 * 10);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28);
wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
for (const name of ['a.wav', 'b.wav', 'c.wav']) fs.writeFileSync(path.join(temp, name), wav);
process.env.AURORA_VO = 'null';
process.env.AURORA_MPV_EXTRA = JSON.stringify(['--ao=null', '--no-config']);
app.on('browser-window-created', (_event, window) => { window.hide(); window.show = () => {}; });
require('../main/main');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(read, predicate, message) {
  for (let i = 0; i < 60; i++) { const value = await read(); if (predicate(value)) return value; await sleep(100); }
  throw new Error(message);
}
app.whenReady().then(async () => {
  try {
    const window = await until(() => BrowserWindow.getAllWindows()[0], Boolean, 'window missing');
    await until(() => window.webContents.executeJavaScript('Boolean(window.aurora)').catch(() => false), Boolean, 'preload missing');
    const execute = source => window.webContents.executeJavaScript(source);
    assert.equal((await execute('window.aurora.getSettings()')).dlnaEnabled, false);
    assert.equal((await execute('window.aurora.getUpdateStatus()')).state, 'unavailable');
    await execute(`window.aurora.openPath(${JSON.stringify(path.join(temp, 'a.wav'))})`);
    await until(() => execute("window.aurora.mpv('get_property', 'path')"), value => value?.endsWith('a.wav'), 'first media did not load');
    await execute(`Promise.all([window.aurora.openPath(${JSON.stringify(path.join(temp, 'b.wav'))}), window.aurora.openPath(${JSON.stringify(path.join(temp, 'c.wav'))})])`);
    await until(() => execute("window.aurora.mpv('get_property', 'path')"), value => value?.endsWith('c.wav'), 'latest media did not win');
    await until(() => execute('window.aurora.getRecent()'), value => value.some(item => item.path.endsWith('c.wav')), 'history was not saved');
    await execute('window.aurora.stop()');
    assert.equal(await execute("window.aurora.mpv('get_property', 'path')"), null);
    await execute('window.aurora.clearLibrary()');
    assert.equal((await execute('window.aurora.getLibrary()')).length, 0);
    console.log('ELECTRON SMOKE PASS: preload, settings, update state, real mpv playback, rapid switching, history, stop, clear');
  } catch (error) { console.error(error); process.exitCode = 1; }
  finally { app.quit(); }
});
// Keep the profile on failure for diagnosis. Successful runs clean up after all handles close.
app.on('will-quit', () => { clearTimeout(deadline); if (!process.exitCode) setTimeout(() => { try { fs.rmSync(temp, { recursive: true, force: true }); } catch {} }, 100); });
