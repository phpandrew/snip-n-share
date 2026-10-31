// Check-for-update / install via electron-updater against GitHub Releases.
//
// Behaviour:
//  - Updates are checked on startup (if enabled) and from About / the tray.
//  - When an update has downloaded you're asked once per version. "Later" puts a
//    "Restart to update" item in the tray instead of asking again on every launch.
//  - "Restart now" installs silently and relaunches the app.
//  - Copies installed for all users (Program Files) need admin rights to update.
//    Windows can't show that prompt while shutting down, so for those copies we
//    don't try to install on quit; the update waits for "Restart now".
//  - Everything is logged to %APPDATA%\snip-n-share\logs\updater.log.
const { app, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const fs = require('fs');
const path = require('path');
const settings = require('./settings');

let notify = () => {};
let onReadyChange = () => {};
let manualCheck = false;
let readyVersion = null;

// ---------- logging ----------
function logFile() {
  const dir = path.join(app.getPath('userData'), 'logs');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'updater.log');
}
function write(level, args) {
  try {
    const f = logFile();
    try { if (fs.statSync(f).size > 512 * 1024) fs.renameSync(f, f + '.old'); } catch {}
    const msg = args.map((a) => (a instanceof Error ? a.stack || a.message : typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
    fs.appendFileSync(f, `${new Date().toISOString()} [${level}] ${msg}\n`);
  } catch {}
}
const log = {
  info: (...a) => write('info', a),
  warn: (...a) => write('warn', a),
  error: (...a) => write('error', a),
  debug: () => {}
};
autoUpdater.logger = log;

// ---------- install location ----------
function isPerMachineInstall() {
  const exe = process.execPath.toLowerCase();
  return [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.ProgramW6432]
    .filter(Boolean)
    .some((p) => exe.startsWith(p.toLowerCase() + path.sep));
}

autoUpdater.autoDownload = false;
// At reboot/shutdown an all-users install can't get its admin prompt, so installing
// on quit would silently fail and the same update would be offered again next boot.
autoUpdater.autoInstallOnAppQuit = !isPerMachineInstall();

function status(state, data = {}) {
  notify({ state, ...data });
}

// ---------- startup bookkeeping ----------
function startupCheck() {
  const cur = app.getVersion();
  log.info(`--- app start v${cur} at ${process.execPath} (${isPerMachineInstall() ? 'all users / Program Files' : 'per user'}) ---`);
  const pending = settings.get().updatePending;
  if (pending && pending.version) {
    if (pending.version === cur) {
      log.info(`update to v${cur} installed successfully`);
    } else {
      log.warn(`update to v${pending.version} was started but this is still v${cur} - the install did not complete`);
      if (isPerMachineInstall()) {
        dialog.showMessageBox({
          type: 'warning',
          title: 'Snip n Share update',
          message: `The update to v${pending.version} didn't install.`,
          detail: 'This copy is installed for all users in Program Files, which needs administrator approval to update. '
            + 'Accept the Windows prompt when updating, or reinstall Snip n Share choosing "Only for me" so updates never need admin rights.'
        });
      }
    }
    settings.set({ updatePending: null });
  }
}

// ---------- events ----------
autoUpdater.on('checking-for-update', () => status('checking'));
autoUpdater.on('update-available', (info) => {
  status('available', { version: info.version });
  autoUpdater.downloadUpdate().catch((e) => status('error', { message: e.message }));
});
autoUpdater.on('update-not-available', () => {
  status('none', { version: app.getVersion() });
  if (manualCheck) {
    dialog.showMessageBox({ type: 'info', title: 'Snip n Share', message: `You're up to date (v${app.getVersion()}).` });
  }
  manualCheck = false;
});
autoUpdater.on('download-progress', (p) => status('downloading', { percent: Math.round(p.percent) }));
autoUpdater.on('update-downloaded', async (info) => {
  readyVersion = info.version;
  onReadyChange(readyVersion);
  status('downloaded', { version: info.version });
  const wasManual = manualCheck;
  manualCheck = false;

  // Ask once per version; after "Later" the tray offers "Restart to update" instead.
  if (!wasManual && settings.get().updateDeferred === info.version) {
    log.info(`v${info.version} ready; previously deferred, not prompting again`);
    return;
  }
  const r = await dialog.showMessageBox({
    type: 'question',
    title: 'Update ready',
    message: `Snip n Share v${info.version} has been downloaded.`,
    detail: isPerMachineInstall()
      ? 'Restart now to install it. Windows will ask for administrator approval because this copy is installed for all users.'
      : 'Restart now to install it?',
    buttons: ['Restart now', 'Later'],
    defaultId: 0,
    cancelId: 1
  });
  if (r.response === 0) installNow();
  else {
    settings.set({ updateDeferred: info.version });
    log.info(`v${info.version} deferred by user`);
  }
});
autoUpdater.on('error', (e) => {
  log.error('updater error:', e);
  status('error', { message: e.message });
  if (manualCheck) {
    dialog.showMessageBox({ type: 'error', title: 'Update check failed', message: e.message });
  }
  manualCheck = false;
});

function installNow() {
  if (!readyVersion) return;
  settings.set({ updatePending: { version: readyVersion, at: Date.now() }, updateDeferred: null });
  log.info(`installing v${readyVersion} (silent, relaunch)`);
  // isSilent: no installer wizard; isForceRunAfter: start the app again afterwards.
  setImmediate(() => autoUpdater.quitAndInstall(true, true));
}

function check(manual = false) {
  manualCheck = manual;
  if (!app.isPackaged) {
    status('error', { message: 'Update check only works in the packaged (installed) app.' });
    if (manual) dialog.showMessageBox({ type: 'info', title: 'Snip n Share', message: 'Update check only works in the installed build.' });
    return;
  }
  autoUpdater.checkForUpdates().catch((e) => status('error', { message: e.message }));
}

function onStatus(fn) { notify = fn; }
function onReady(fn) { onReadyChange = fn; }

module.exports = {
  check, onStatus, onReady, installNow, startupCheck,
  readyVersion: () => readyVersion,
  logPath: () => logFile(),
  installInfo: () => ({ path: process.execPath, perMachine: isPerMachineInstall() })
};
