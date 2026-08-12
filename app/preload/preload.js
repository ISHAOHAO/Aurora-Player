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
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  getLibrary: () => ipcRenderer.invoke('library:list'),
  rescanLibrary: () => ipcRenderer.invoke('library:rescan'),
  addLibraryFolder: () => ipcRenderer.invoke('library:add-folder'),
  onLibraryUpdated: (cb) => {
    const listener = (_e, items) => cb(items);
    ipcRenderer.on('library:updated', listener);
    return () => ipcRenderer.removeListener('library:updated', listener);
  },
  toggleFullscreen: () => ipcRenderer.invoke('app:toggle-fullscreen'),
  setHdrOverride: (o) => ipcRenderer.invoke('hdr:override', o),
  addSubtitle: () => ipcRenderer.invoke('sub:add'),
  getThumb: (time) => ipcRenderer.invoke('thumbs:nearest', time),
  dragStart: () => ipcRenderer.send('win:drag-start'),
  dragEnd: () => ipcRenderer.send('win:drag-end'),
  resizeStart: (dir) => ipcRenderer.send('win:resize-start', dir),
  resizeEnd: () => ipcRenderer.send('win:resize-end'),
  minimizeWindow: () => ipcRenderer.send('win:minimize'),
  toggleMaximize: () => ipcRenderer.send('win:maximize-toggle'),

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
