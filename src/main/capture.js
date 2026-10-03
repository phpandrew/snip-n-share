// Multi-monitor region capture.
//
// Speed notes:
//  - Overlay windows are created ONCE (hidden) and reused, so a capture doesn't
//    pay for window creation + page load every time.
//  - The frozen-screen preview is sent as JPEG (fast to encode / transfer);
//    the actual crop is taken from the lossless original.
//  - Windows are shown only after the renderer reports the image has loaded,
//    so there is no black flash.
const { BrowserWindow, desktopCapturer, screen, ipcMain, app } = require('electron');
const path = require('path');

const pool = new Map();   // displayId -> BrowserWindow (hidden when idle)
let active = null;        // { resolve, shots: Map<displayId, {image, display}>, pending: Set }

function makeOverlay(display) {
  const win = new BrowserWindow({
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    frame: false,
    transparent: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    enableLargerThanScreen: true,
    show: false,
    backgroundColor: '#000000',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'overlay.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, '..', 'renderer', 'overlay.html'));
  win.on('closed', () => pool.delete(display.id));
  return win;
}

/** Make sure there is one hidden overlay per current display. */
function warmPool() {
  const displays = screen.getAllDisplays();
  const ids = new Set(displays.map((d) => d.id));
  for (const [id, w] of pool) {
    if (!ids.has(id)) { try { w.destroy(); } catch {} pool.delete(id); }
  }
  for (const d of displays) {
    const w = pool.get(d.id);
    if (!w || w.isDestroyed()) pool.set(d.id, makeOverlay(d));
    else w.setBounds(d.bounds);
  }
}

app.whenReady().then(() => {
  warmPool();
  screen.on('display-added', warmPool);
  screen.on('display-removed', warmPool);
  screen.on('display-metrics-changed', warmPool);
});

async function grabDisplays() {
  const displays = screen.getAllDisplays();
  const shots = new Map();
  // One getSources call per display so each comes back at its own native size.
  const results = await Promise.all(displays.map((d) => desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: {
      width: Math.round(d.size.width * d.scaleFactor),
      height: Math.round(d.size.height * d.scaleFactor)
    }
  })));
  displays.forEach((d, i) => {
    const sources = results[i];
    let src = sources.find((s) => String(s.display_id) === String(d.id));
    if (!src) src = sources[i] || sources[0];
    if (src && !src.thumbnail.isEmpty()) shots.set(d.id, { image: src.thumbnail, display: d });
  });
  return shots;
}

function hideAll() {
  for (const w of pool.values()) {
    if (w.isDestroyed()) continue;
    w.hide();
    w.webContents.send('overlay:reset');
  }
}

function cancel() {
  if (!active) return;
  const { resolve } = active;
  active = null;
  hideAll();
  resolve(null);
}

/** Resolves with { image: nativeImage, display, rect } or null if cancelled. */
function selectRegion() {
  if (active) return Promise.resolve(null);

  return new Promise(async (resolve, reject) => {
    let shots;
    try {
      shots = await grabDisplays();
    } catch (e) {
      return reject(e);
    }
    if (!shots.size) return reject(new Error('No displays captured'));

    warmPool();
    active = { resolve, shots, pending: new Set(shots.keys()) };

    for (const [id, { image, display }] of shots) {
      const win = pool.get(id);
      if (!win || win.isDestroyed()) { active.pending.delete(id); continue; }
      const send = () => win.webContents.send('overlay:init', {
        displayId: id,
        dataUrl: `data:image/jpeg;base64,${image.toJPEG(88).toString('base64')}`,
        width: display.bounds.width,
        height: display.bounds.height
      });
      if (win.webContents.isLoading()) win.webContents.once('did-finish-load', send);
      else send();
    }
  });
}

// Renderer has decoded the image: show that overlay. Show all together once every one is ready.
ipcMain.on('overlay:ready', (_e, displayId) => {
  if (!active) return;
  active.pending.delete(displayId);
  if (active.pending.size) return;
  for (const id of active.shots.keys()) {
    const w = pool.get(id);
    if (!w || w.isDestroyed()) continue;
    w.setBounds(active.shots.get(id).display.bounds);
    w.show();
  }
  // Focus the overlay under the cursor so Esc works immediately.
  const cur = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const w = pool.get(cur.id);
  if (w && !w.isDestroyed()) w.focus();
});

ipcMain.on('overlay:cancel', () => cancel());

ipcMain.on('overlay:select', (_e, { displayId, rect }) => {
  if (!active) return;
  const shot = active.shots.get(displayId) || [...active.shots.values()].find((s) => String(s.display.id) === String(displayId));
  const { resolve } = active;
  active = null;
  hideAll();
  if (!shot) return resolve(null);

  const sf = shot.display.scaleFactor;
  const crop = {
    x: Math.max(0, Math.round(rect.x * sf)),
    y: Math.max(0, Math.round(rect.y * sf)),
    width: Math.max(1, Math.round(rect.width * sf)),
    height: Math.max(1, Math.round(rect.height * sf))
  };
  const image = shot.image.crop(crop);
  resolve({ image, display: shot.display, rect: crop });
});

module.exports = { selectRegion };
