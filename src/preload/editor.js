const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('editor', {
  onInit: (fn) => ipcRenderer.on('editor:init', (_e, data) => fn(data)),
  upload: (payload) => ipcRenderer.invoke('editor:upload', payload),
  copyImage: (payload) => ipcRenderer.invoke('editor:copyImage', payload),
  saveAs: (payload) => ipcRenderer.invoke('editor:saveAs', payload),
  savePrefs: (prefs) => ipcRenderer.send('editor:savePrefs', prefs),
  saveOutput: (patch) => ipcRenderer.send('editor:saveOutput', patch),
  cancel: () => ipcRenderer.send('editor:cancel')
});
