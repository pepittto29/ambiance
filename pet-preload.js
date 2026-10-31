const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pet', {
  onState: (cb) => ipcRenderer.on('pet-state', (_e, s) => cb(s)),
  hover: (on) => ipcRenderer.send('pet-hover', on),
  ignore: (on) => ipcRenderer.send('pet-ignore', on),
  down: () => ipcRenderer.send('pet-down'),
  up: () => ipcRenderer.send('pet-up'),
  pickerDone: (ok) => ipcRenderer.send('picker-done', ok),
  info: (action) => ipcRenderer.send('pet-info', action),
  gardenIgnore: (on) => ipcRenderer.send('garden-ignore', on),
  gardenClick: (i) => ipcRenderer.invoke('garden-click', i),
});
