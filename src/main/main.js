const {
  app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, clipboard,
  nativeImage, Notification, shell, dialog, screen
} = require('electron');
const path = require('path');
const fs = require('fs');

const settings = require('./settings');
const history = require('./history');
const capture = require('./capture');
const updater = require('./updater');
const dropbox = require('./uploaders/dropbox');
const custom = require('./uploaders/custom');

const ASSETS = path.join(__dirname, '..', '..', 'assets');
const RENDERER = path.join(__dirname, '..', 'renderer');
const PRELOAD = path.join(__dirname, '..', 'preload');

let tray = null;
let editorWin = null;
let settingsWin = null;
let capturing = false;
let currentHotkey = null;

app.setAppUserModelId('bid.g84.snipnshare'); // needed for Windows toasts

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => openSettings());
  app.whenReady().then(init);
}

function init() {
  createTray();
  registerHotkey(settings.get().hotkey);
  applyStartup();
  updater.onStatus((s) => settingsWin && !settingsWin.isDestroyed() && settingsWin.webContents.send('updater:status', s));
  if (settings.get().autoCheckUpdates && app.isPackaged) {
    setTimeout(() => updater.check(false), 15000);
  }
  toast('Snip n Share is running', `Press ${prettyHotkey(settings.get().hotkey)} to capture.`);
}

app.on('window-all-closed', () => { /* stay in tray */ });
app.on('will-quit', () => globalShortcut.unregisterAll());

// ---------- tray ----------
function createTray() {
  const icon = nativeImage.createFromPath(path.join(ASSETS, 'tray.png'));
  tray = new Tray(icon);
  tray.setToolTip('Snip n Share');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Capture region', click: () => startCapture() },
    { type: 'separator' },
    { label: 'History', click: () => openSettings('history') },
    { label: 'Settings', click: () => openSettings('general') },
    { label: 'Check for updates', click: () => updater.check(true) },
    { type: 'separator' },
    { label: `v${app.getVersion()}`, enabled: false },
    { label: 'Quit', click: () => app.quit() }
  ]));
  tray.on('double-click', () => openSettings());
}

// ---------- hotkey ----------
function prettyHotkey(k) {
  return k.replace('CommandOrControl', 'Ctrl').replace('Control', 'Ctrl').replace(/\+/g, ' + ');
}

function registerHotkey(accel) {
  if (currentHotkey) globalShortcut.unregister(currentHotkey);
  currentHotkey = null;
  try {
    const ok = globalShortcut.register(accel, () => startCapture());
    if (!ok) throw new Error('already in use by another app');
    currentHotkey = accel;
    return { ok: true };
  } catch (e) {
    return { ok: false, error: `Could not register ${accel}: ${e.message}` };
  }
}

function applyStartup() {
  app.setLoginItemSettings({ openAtLogin: !!settings.get().launchAtStartup });
}

// ---------- capture flow ----------
async function startCapture() {
  if (capturing) return;
  capturing = true;
  try {
    const result = await capture.selectRegion();
    if (!result) return;
    const cfg = settings.get();
    if (cfg.showEditor) {
      openEditor(result.image);
    } else {
      await finalize(encode(result.image, cfg.format, cfg.jpegQuality), cfg.format, result.image.getSize());
    }
  } catch (e) {
    dialog.showErrorBox('Capture failed', e.message);
  } finally {
    capturing = false;
  }
}

function encode(image, format, quality) {
  return format === 'png' ? image.toPNG() : image.toJPEG(quality);
}

function openEditor(image) {
  if (editorWin && !editorWin.isDestroyed()) editorWin.destroy();
  const { width, height } = image.getSize();
  const cursor = screen.getCursorScreenPoint();
  const area = screen.getDisplayNearestPoint(cursor).workArea;
  const sf = screen.getDisplayNearestPoint(cursor).scaleFactor;
  const toolbar = 64;
  const winW = Math.min(area.width - 40, Math.max(720, Math.round(width / sf) + 40));
  const winH = Math.min(area.height - 40, Math.max(420, Math.round(height / sf) + toolbar + 40));

  editorWin = new BrowserWindow({
    width: winW,
    height: winH,
    x: Math.round(area.x + (area.width - winW) / 2),
    y: Math.round(area.y + (area.height - winH) / 2),
    title: 'Snip n Share',
    icon: path.join(ASSETS, 'icon.png'),
    autoHideMenuBar: true,
    alwaysOnTop: true,
    backgroundColor: '#1e1e22',
    webPreferences: {
      preload: path.join(PRELOAD, 'editor.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  editorWin.loadFile(path.join(RENDERER, 'editor.html'));
  editorWin.webContents.once('did-finish-load', () => {
    const cfg = settings.get();
    editorWin.webContents.send('editor:init', {
      dataUrl: image.toDataURL(),
      width,
      height,
      format: cfg.format,
      jpegQuality: cfg.jpegQuality,
      activeHost: cfg.activeHost
    });
  });
  editorWin.on('closed', () => { editorWin = null; });
}

function hostName(id) {
  return id === 'dropbox' ? 'Dropbox' : 'Custom host';
}

/** Upload bytes, copy URL, toast, history. Returns { url } or throws. */
async function finalize(buffer, format, size) {
  const cfg = settings.get();
  const ts = new Date();
  const stamp = ts.toISOString().replace(/[-:T]/g, '').slice(0, 15);
  const filename = `snip-${stamp}.${format}`;
  const mime = format === 'png' ? 'image/png' : 'image/jpeg';

  const payload = { buffer, filename, mime };
  let url;
  if (cfg.activeHost === 'dropbox') url = await dropbox.upload(payload);
  else url = await custom.upload(payload, cfg.custom);

  clipboard.writeText(url);
  if (cfg.copyImageToo) {
    // Text + image can't both live on the clipboard; URL wins. Image is in history.
  }

  const item = history.add({
    url, host: cfg.activeHost, buffer, format,
    width: size.width, height: size.height, keepLocalCopy: cfg.keepLocalCopy
  });
  if (settingsWin && !settingsWin.isDestroyed()) settingsWin.webContents.send('history:changed');

  toast('Ready to paste', url, () => shell.openExternal(url));
  return { url, item };
}

function toast(title, body, onClick) {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title, body, icon: path.join(ASSETS, 'icon.png'), silent: false });
  if (onClick) n.on('click', onClick);
  n.show();
}

// ---------- settings window ----------
function openSettings(tab = 'general') {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.show();
    settingsWin.focus();
    settingsWin.webContents.send('settings:tab', tab);
    return;
  }
  settingsWin = new BrowserWindow({
    width: 760,
    height: 620,
    minWidth: 640,
    minHeight: 480,
    title: 'Snip n Share — Settings',
    icon: path.join(ASSETS, 'icon.png'),
    autoHideMenuBar: true,
    backgroundColor: '#1e1e22',
    webPreferences: {
      preload: path.join(PRELOAD, 'settings.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  settingsWin.loadFile(path.join(RENDERER, 'settings.html'));
  settingsWin.webContents.once('did-finish-load', () => settingsWin.webContents.send('settings:tab', tab));
  settingsWin.on('closed', () => { settingsWin = null; });
}

// ---------- IPC: editor ----------
ipcMain.handle('editor:upload', async (_e, { dataUrl, format, width, height }) => {
  const buffer = Buffer.from(dataUrl.split(',')[1], 'base64');
  try {
    const r = await finalize(buffer, format, { width, height });
    if (editorWin && !editorWin.isDestroyed()) editorWin.close();
    return { ok: true, url: r.url };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('editor:copyImage', async (_e, { dataUrl }) => {
  clipboard.writeImage(nativeImage.createFromDataURL(dataUrl));
  toast('Image copied', 'The image is on your clipboard.');
  if (editorWin && !editorWin.isDestroyed()) editorWin.close();
  return { ok: true };
});

ipcMain.handle('editor:saveAs', async (_e, { dataUrl, format }) => {
  const r = await dialog.showSaveDialog(editorWin, {
    defaultPath: path.join(app.getPath('pictures'), `snip-${Date.now()}.${format}`),
    filters: [{ name: format.toUpperCase(), extensions: [format] }]
  });
  if (r.canceled || !r.filePath) return { ok: false };
  fs.writeFileSync(r.filePath, Buffer.from(dataUrl.split(',')[1], 'base64'));
  return { ok: true, path: r.filePath };
});

ipcMain.on('editor:cancel', () => {
  if (editorWin && !editorWin.isDestroyed()) editorWin.close();
});

// ---------- IPC: settings ----------
ipcMain.handle('settings:get', () => ({ ...settings.get(), version: app.getVersion(), hotkeyRegistered: !!currentHotkey }));

ipcMain.handle('settings:set', (_e, patch) => {
  const before = settings.get();
  const after = settings.set(patch);
  let hotkeyResult = { ok: true };
  if (patch.hotkey && patch.hotkey !== before.hotkey) {
    hotkeyResult = registerHotkey(after.hotkey);
    if (!hotkeyResult.ok) {
      settings.set({ hotkey: before.hotkey });
      registerHotkey(before.hotkey);
    }
  }
  if ('launchAtStartup' in patch) applyStartup();
  return { settings: settings.get(), hotkeyResult };
});

ipcMain.handle('settings:testCustom', async (_e, cfg) => {
  try { return { ok: true, message: await custom.test(cfg) }; }
  catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('dropbox:begin', async (_e, appKey) => {
  try {
    settings.set({ dropbox: { appKey } });
    const url = dropbox.beginAuth(appKey);
    shell.openExternal(url);
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('dropbox:finish', async (_e, { appKey, code }) => {
  try { return { ok: true, dropbox: await dropbox.finishAuth(appKey, code) }; }
  catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('dropbox:disconnect', () => { dropbox.disconnect(); return { ok: true }; });

ipcMain.handle('history:list', () => history.list());
ipcMain.handle('history:remove', (_e, id) => history.remove(id));
ipcMain.handle('history:clear', () => { history.clear(); return []; });
ipcMain.handle('history:copy', (_e, url) => { clipboard.writeText(url); return true; });
ipcMain.handle('history:open', (_e, url) => shell.openExternal(url));
ipcMain.handle('history:showFile', (_e, p) => shell.showItemInFolder(p));
ipcMain.handle('history:openFolder', () => shell.openPath(history.dir()));

ipcMain.handle('updater:check', () => { updater.check(true); return true; });
ipcMain.handle('app:capture', () => { startCapture(); return true; });
ipcMain.handle('app:openExternal', (_e, url) => shell.openExternal(url));
