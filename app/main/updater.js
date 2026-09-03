/** Updates: hashes check integrity; publisher identity needs a trusted feed/signature. */
const { autoUpdater } = require('electron-updater');
const { ipcMain, BrowserWindow, app } = require('electron');
const UPDATE_FEED = 'https://gitee.com/is-haohao/Aurora-Player/raw/main/update/';
let initialized = false;
let available = false;
let status = { state: 'idle', revision: 0 };
function publish(next) {
  status = { ...next, revision: status.revision + 1 };
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send('update:status', status);
  }
}
async function check() {
  if (!available) return { ok: false, error: status.message || '当前环境无法检查更新' };
  if (status.state === 'downloaded') return { ok: true, updateAvailable: true };
  try {
    const result = await autoUpdater.checkForUpdates();
    return { ok: true, updateAvailable: result?.isUpdateAvailable === true };
  } catch (e) {
    publish({ state: 'error', message: e.message });
    return { ok: false, error: e.message };
  }
}
function init() {
  if (initialized) return;
  initialized = true;
  ipcMain.handle('update:get-status', () => status);
  ipcMain.handle('update:check', check);
  ipcMain.handle('update:install-now', () => {
    if (!available || status.state !== 'downloaded') return { ok: false, error: '更新尚未下载完成' };
    autoUpdater.quitAndInstall(false, true);
    return { ok: true };
  });
  if (!app.isPackaged) { publish({ state: 'unavailable', message: '开发环境不检查更新' }); return; }
  autoUpdater.on('checking-for-update', () => publish({ state: 'checking' }));
  autoUpdater.on('update-available', info => publish({ state: 'available', version: info.version }));
  autoUpdater.on('update-not-available', info => publish({ state: 'latest', version: info.version }));
  autoUpdater.on('download-progress', p => publish({ state: 'downloading', percent: Math.floor(p.percent || 0), bytesPerSecond: p.bytesPerSecond, transferred: p.transferred, total: p.total }));
  autoUpdater.on('update-downloaded', info => publish({ state: 'downloaded', version: info.version }));
  autoUpdater.on('error', e => publish({ state: 'error', message: e.message }));
  try {
    autoUpdater.setFeedURL({ provider: 'generic', url: UPDATE_FEED });
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    available = true;
    setTimeout(check, 3000).unref?.();
  } catch (e) { publish({ state: 'error', message: e.message }); }
}
module.exports = { init };
