const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('editor', {
  onInit: (fn) => ipcRenderer.on('editor:init', (_e, data) => fn(data)),
  upload: (payload) => ipcRenderer.invoke('editor:upload', payload),
  copyImage: (payload) => ipcRenderer.invoke('editor:copyImage', payload),
  saveAs: (payload) => ipcRenderer.invoke('editor:saveAs', payload),
  cancel: () => ipcRenderer.send('editor:cancel')
});
