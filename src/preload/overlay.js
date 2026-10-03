const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('overlay', {
  onInit: (fn) => ipcRenderer.on('overlay:init', (_e, data) => fn(data)),
  onReset: (fn) => ipcRenderer.on('overlay:reset', () => fn()),
  ready: (displayId) => ipcRenderer.send('overlay:ready', displayId),
  select: (displayId, rect) => ipcRenderer.send('overlay:select', { displayId, rect }),
  cancel: () => ipcRenderer.send('overlay:cancel')
});
