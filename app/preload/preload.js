/** Aurora Player — preload 桥（M2） */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('aurora', {
  platform: process.platform,
  versions: { electron: process.versions.electron, node: process.versions.node },

  mpv: (...args) =>
    ipcRenderer.invoke('mpv:command', args).then((r) => (r && r.error === 'success' ? r.data : null)),

  openFile: () => ipcRenderer.invoke('app:open-file'),
  openPath: (path, seek) => ipcRenderer.invoke('app:open-path', path, seek),
  stop: () => ipcRenderer.invoke('app:stop'),
  getRecent: () => ipcRenderer.invoke('recent:list'),
  getDlnaState: () => ipcRenderer.invoke('dlna:state'),
  toggleFullscreen: () => ipcRenderer.invoke('app:toggle-fullscreen'),
  setHdrOverride: (o) => ipcRenderer.invoke('hdr:override', o),
  dragStart: () => ipcRenderer.send('win:drag-start'),
  dragEnd: () => ipcRenderer.send('win:drag-end'),

  onStatus: (cb) => {
    const listener = (_e, status) => cb(status);
    ipcRenderer.on('mpv:status', listener);
    return () => ipcRenderer.removeListener('mpv:status', listener);
  },

  onMeta: (cb) => {
    const listener = (_e, meta) => cb(meta);
    ipcRenderer.on('mpv:meta', listener);
    return () => ipcRenderer.removeListener('mpv:meta', listener);
  },
});
