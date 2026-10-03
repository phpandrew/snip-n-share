const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  testCustom: (cfg) => ipcRenderer.invoke('settings:testCustom', cfg),
  dropboxBegin: (appKey) => ipcRenderer.invoke('dropbox:begin', appKey),
  dropboxFinish: (appKey, code) => ipcRenderer.invoke('dropbox:finish', { appKey, code }),
  dropboxDisconnect: () => ipcRenderer.invoke('dropbox:disconnect'),
  historyList: () => ipcRenderer.invoke('history:list'),
  historyRemove: (id) => ipcRenderer.invoke('history:remove', id),
  historyClear: () => ipcRenderer.invoke('history:clear'),
  historyCopy: (url) => ipcRenderer.invoke('history:copy', url),
  historyOpen: (url) => ipcRenderer.invoke('history:open', url),
  historyShowFile: (p) => ipcRenderer.invoke('history:showFile', p),
  historyOpenFolder: () => ipcRenderer.invoke('history:openFolder'),
  checkUpdates: () => ipcRenderer.invoke('updater:check'),
  capture: () => ipcRenderer.invoke('app:capture'),
  openExternal: (url) => ipcRenderer.invoke('app:openExternal', url),
  onTab: (fn) => ipcRenderer.on('settings:tab', (_e, tab) => fn(tab)),
  onHistoryChanged: (fn) => ipcRenderer.on('history:changed', () => fn()),
  onUpdaterStatus: (fn) => ipcRenderer.on('updater:status', (_e, s) => fn(s))
});
