/**
 * Aurora Player — 自动更新（electron-updater）
 *
 * 设计：
 *  - 版本真相源 = Gitee raw 的 update/latest.yml（URL 永不变）
 *  - 安装包本体 = Gitee release 附件，以绝对直链写进 latest.yml（与 raw 解耦）
 *  - 启动时后台静默检查 → 发现新版自动后台下载 → 退出时 per-user 静默安装（免 UAC）
 *  - latest.yml 里的 sha512 自动做完整性校验（防篡改，无需签名证书）
 *  - dev / 未打包环境安全跳过，避免开发期误拉生产包
 */
const { autoUpdater } = require('electron-updater');
const { ipcMain, BrowserWindow, app } = require('electron');

// Gitee raw 托管的 update 目录（main 分支，稳定不变）
const UPDATE_FEED = 'https://gitee.com/is-haohao/Aurora-Player/raw/main/update/';

let initialized = false;

/** 向所有渲染窗口广播更新状态 */
function broadcast(channel, payload) {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(channel, payload);
  }
}

function init() {
  if (initialized) return;
  initialized = true;

  // 未打包（dev / 解包调试）：跳过，不连生产更新源
  if (!app.isPackaged) {
    console.log('[updater] 开发模式，跳过自动更新');
    return;
  }

  try {
    autoUpdater.setFeedURL({ url: UPDATE_FEED, serverType: 'generic' });
  } catch (e) {
    console.error('[updater] setFeedURL 失败', e);
    return;
  }

  autoUpdater.autoDownload = true;          // 发现新版后后台自动下载
  autoUpdater.autoInstallOnAppQuit = true;  // 退出时静默安装

  autoUpdater.on('checking-for-update', () =>
    broadcast('update:status', { state: 'checking' }));

  autoUpdater.on('update-available', (info) =>
    broadcast('update:status', { state: 'available', version: info && info.version }));

  autoUpdater.on('update-not-available', (info) =>
    broadcast('update:status', { state: 'latest', version: info && info.version }));

  autoUpdater.on('download-progress', (p) =>
    broadcast('update:status', {
      state: 'downloading',
      percent: Math.floor(p.percent || 0),
      bytesPerSecond: p.bytesPerSecond,
      transferred: p.transferred,
      total: p.total,
    }));

  autoUpdater.on('update-downloaded', (info) =>
    broadcast('update:status', { state: 'downloaded', version: info && info.version }));

  autoUpdater.on('error', (err) =>
    broadcast('update:status', { state: 'error', message: err && err.message }));

  // 手动检查
  ipcMain.handle('update:check', async () => {
    try {
      const r = await autoUpdater.checkForUpdates();
      return { ok: true, updateAvailable: !!(r && r.updateInfo) };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  // 立即退出并安装（用户点「重启安装」时）
  ipcMain.handle('update:install-now', async () => {
    autoUpdater.quitAndInstall(false, true);
    return { ok: true };
  });

  // 启动后延迟检查，避免阻塞启动
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((e) => console.error('[updater] 检查失败', e));
  }, 3000);
}

module.exports = { init };
