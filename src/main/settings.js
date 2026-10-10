// Tiny JSON settings store in app.getPath('userData')/settings.json
const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  hotkey: 'Control+Alt+PrintScreen',
  format: 'jpg',            // 'jpg' | 'png'
  jpegQuality: 90,          // 1-100
  copyImageToo: false,      // also put the image itself on the clipboard
  keepLocalCopy: true,      // save full image into history folder
  launchAtStartup: false,
  showEditor: true,         // false = upload immediately after selection
  activeHost: 'custom',     // 'custom' | 'dropbox'
  autoCheckUpdates: true,
  editor: { tool: 'pen', color: '#ff3b30', size: 3, blur: 5 },   // last-used editor settings
  enabledTools: ['pen', 'highlight', 'arrow', 'rect', 'box', 'text', 'step', 'blur', 'crop'],
  custom: {
    uploadUrl: 'https://g84.bid/snsupload.php',
    apiKey: ''
  },
  dropbox: {
    appKey: '',
    folder: '/SnipNShare',
    accessToken: '',
    refreshToken: '',
    expiresAt: 0,
    accountEmail: ''
  }
};

let cache = null;

function file() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function deepMerge(base, over) {
  const out = { ...base };
  for (const k of Object.keys(over || {})) {
    if (over[k] && typeof over[k] === 'object' && !Array.isArray(over[k]) && base[k] && typeof base[k] === 'object') {
      out[k] = deepMerge(base[k], over[k]);
    } else {
      out[k] = over[k];
    }
  }
  return out;
}

function load() {
  if (cache) return cache;
  try {
    cache = deepMerge(DEFAULTS, JSON.parse(fs.readFileSync(file(), 'utf8')));
  } catch {
    cache = JSON.parse(JSON.stringify(DEFAULTS));
  }
  return cache;
}

function get() {
  return load();
}

function set(patch) {
  cache = deepMerge(load(), patch);
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(cache, null, 2));
  return cache;
}

module.exports = { get, set, DEFAULTS };
