const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ambiance', {
  info: () => ipcRenderer.invoke('info'),
  setCompact: (on) => ipcRenderer.invoke('set-compact', on),
  setFullscreen: (on) => ipcRenderer.invoke('set-fullscreen', on),
  setOpenAtLogin: (on) => ipcRenderer.invoke('set-open-at-login', on),
  setConfig: (patch) => ipcRenderer.invoke('set-config', patch),
  pickBurrow: () => ipcRenderer.invoke('pick-burrow'),
  setPlaying: (on) => ipcRenderer.send('playing', on),
  onTogglePlay: (cb) => ipcRenderer.on('toggle-play', () => cb()),
  onPause: (cb) => ipcRenderer.on('pause', () => cb()),
  onConfig: (cb) => ipcRenderer.on('config', (_e, c) => cb(c)),
  importSounds: () => ipcRenderer.invoke('import-sounds'),
  readSound: (file) => ipcRenderer.invoke('read-sound', file),
  readBuiltin: (name) => ipcRenderer.invoke('read-builtin', name),
  deleteSound: (file) => ipcRenderer.invoke('delete-sound', file),
});
