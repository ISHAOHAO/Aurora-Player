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
  clearLibrary: () => ipcRenderer.invoke('library:clear'),
  clearRecent: () => ipcRenderer.invoke('recent:clear'),
  addLibraryFolder: () => ipcRenderer.invoke('library:add-folder'),
  listNas: (dir) => ipcRenderer.invoke('nas:list', dir),
  openNasExplorer: (unc) => ipcRenderer.invoke('nas:open-explorer', unc),
  favList: () => ipcRenderer.invoke('fav:list'),
  favToggle: (file) => ipcRenderer.invoke('fav:toggle', file),
  favIsOn: (file) => ipcRenderer.invoke('fav:is-on', file),
  playlistList: () => ipcRenderer.invoke('playlist:list'),
  playlistCreate: (name) => ipcRenderer.invoke('playlist:create', name),
  playlistDelete: (id) => ipcRenderer.invoke('playlist:delete', id),
  playlistAdd: (id, file) => ipcRenderer.invoke('playlist:add', id, file),
  playlistItems: (id) => ipcRenderer.invoke('playlist:items', id),
  collectionList: () => ipcRenderer.invoke('collection:list'),
  collectionCreate: (name) => ipcRenderer.invoke('collection:create', name),
  shaderList: () => ipcRenderer.invoke('shader:list'),
  shaderSetDir: () => ipcRenderer.invoke('shader:set-dir'),
  shaderApply: (shaders) => ipcRenderer.invoke('shader:apply', shaders),
  onLibraryUpdated: (cb) => {
    const listener = (_e, items) => cb(items);
    ipcRenderer.on('library:updated', listener);
    return () => ipcRenderer.removeListener('library:updated', listener);
  },
  onNavigate: (cb) => {
    const listener = (_e, route) => cb(route);
    ipcRenderer.on('nav:goto', listener);
    return () => ipcRenderer.removeListener('nav:goto', listener);
  },
  toggleFullscreen: () => ipcRenderer.invoke('app:toggle-fullscreen'),
  setHdrOverride: (o) => ipcRenderer.invoke('hdr:override', o),
  addSubtitle: () => ipcRenderer.invoke('sub:add'),
  getThumb: (time) => ipcRenderer.invoke('thumbs:nearest', time),
  screenshot: () => ipcRenderer.invoke('app:screenshot'),
  retryPlayback: (software) => ipcRenderer.invoke('app:retry', software),
  exportLog: () => ipcRenderer.invoke('app:export-log'),
  dragStart: () => ipcRenderer.send('win:drag-start'),
  dragEnd: () => ipcRenderer.send('win:drag-end'),
  resizeStart: (dir) => ipcRenderer.send('win:resize-start', dir),
  resizeEnd: () => ipcRenderer.send('win:resize-end'),
  minimizeWindow: () => ipcRenderer.send('win:minimize'),
  toggleMaximize: () => ipcRenderer.send('win:maximize-toggle'),
  closeWindow: () => ipcRenderer.send('win:close'),

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

  onCastToast: (cb) => {
    const listener = (_e, text) => cb(text);
    ipcRenderer.on('cast:toast', listener);
    return () => ipcRenderer.removeListener('cast:toast', listener);
  },

  onPlayError: (cb) => {
    const listener = (_e, err) => cb(err);
    ipcRenderer.on('mpv:error', listener);
    return () => ipcRenderer.removeListener('mpv:error', listener);
  },

  onFullscreen: (cb) => {
    const listener = (_e, fs) => cb(fs);
    ipcRenderer.on('fs-status', listener);
    return () => ipcRenderer.removeListener('fs-status', listener);
  },
});
