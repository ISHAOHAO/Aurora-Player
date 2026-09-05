/** SHA-512 checks integrity; the HTTPS manifest remains the trusted release source. */
const { ipcMain, BrowserWindow, app } = require('electron');
const path = require('node:path');
const { spawn } = require('node:child_process');
const split = require('./split-update');
const UPDATE_FEED = 'https://gitee.com/is-haohao/Aurora-Player/raw/main/update/latest-split.json';
let initialized = false, active = null, ready = null, installing = false;
let status = { state: 'idle', revision: 0 };
function publish(next) {
  status = { ...next, revision: status.revision + 1 };
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send('update:status', status);
  }
}
async function runCheck() {
  try {
    publish({ state: 'checking' });
    const m = await split.readManifest(UPDATE_FEED);
    if (!split.newer(m.version, app.getVersion())) {
      publish({ state: 'latest', version: app.getVersion() });
      return { ok: true, updateAvailable: false };
    }
    publish({ state: 'available', version: m.version });
    const started = Date.now();
    let lastProgress = 0;
    const file = await split.download(m, path.join(app.getPath('userData'), 'split-updates'), (transferred, total) => {
      if (Date.now() - lastProgress < 200 && transferred !== total) return;
      lastProgress = Date.now();
      publish({ state: 'downloading', version: m.version, transferred, total,
        percent: Math.floor(transferred / total * 100), bytesPerSecond: transferred * 1000 / Math.max(1, Date.now() - started) });
    });
    ready = { file, manifest: m };
    publish({ state: 'downloaded', version: m.version });
    return { ok: true, updateAvailable: true };
  } catch (e) {
    publish({ state: 'error', message: e.message });
    return { ok: false, error: e.message };
  }
}
function check() {
  if (!app.isPackaged) return Promise.resolve({ ok: false, error: '开发环境不检查更新' });
  if (ready) {
    publish({ state: 'downloaded', version: ready.manifest.version });
    return Promise.resolve({ ok: true, updateAvailable: true });
  }
  if (!active) active = runCheck().finally(() => { active = null; });
  return active;
}
async function install() {
  if (!ready || installing) return { ok: false, error: '更新尚未就绪或正在安装' };
  installing = true;
  try {
    if (!await split.matches(ready.file, ready.manifest.size, ready.manifest.sha512)) {
      ready = null; throw new Error('安装包校验失败，请重新检查更新');
    }
    // Interactive NSIS preserves elevation and installation-directory prompts.
    await new Promise((resolve, reject) => {
      const child = spawn(ready.file, [], { detached: true, stdio: 'ignore', windowsHide: false });
      child.once('error', reject);
      child.once('spawn', () => { child.unref(); resolve(); });
    });
    app.quit();
    return { ok: true };
  } catch (e) {
    installing = false;
    publish({ state: 'error', message: e.message });
    return { ok: false, error: e.message };
  }
}
function init() {
  if (initialized) return;
  initialized = true;
  ipcMain.handle('update:get-status', () => status);
  ipcMain.handle('update:check', check);
  ipcMain.handle('update:install-now', install);
  if (!app.isPackaged) { publish({ state: 'unavailable', message: '开发环境不检查更新' }); return; }
  setTimeout(check, 3000).unref?.();
}
module.exports = { init };
