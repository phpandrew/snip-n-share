// Check-for-update / install via electron-updater against GitHub Releases.
// Requires build.publish in package.json to point at your repo, and releases
// that contain SnipNShare-Setup-x.y.z.exe + latest.yml (electron-builder makes both).
const { app, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');

let notify = () => {};
let manualCheck = false;

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

function status(state, data = {}) {
  notify({ state, ...data });
}

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
  status('downloaded', { version: info.version });
  manualCheck = false;
  const r = await dialog.showMessageBox({
    type: 'question',
    title: 'Update ready',
    message: `Snip n Share v${info.version} has been downloaded.`,
    detail: 'Restart now to install it?',
    buttons: ['Restart now', 'Later'],
    defaultId: 0,
    cancelId: 1
  });
  if (r.response === 0) setImmediate(() => autoUpdater.quitAndInstall());
});
autoUpdater.on('error', (e) => {
  status('error', { message: e.message });
  if (manualCheck) {
    dialog.showMessageBox({ type: 'error', title: 'Update check failed', message: e.message });
  }
  manualCheck = false;
});

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

module.exports = { check, onStatus };
