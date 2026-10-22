// Tiny JSON settings store in app.getPath('userData')/settings.json
const { app, safeStorage } = require('electron');
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
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    if (over[k] && typeof over[k] === 'object' && !Array.isArray(over[k]) && base[k] && typeof base[k] === 'object') {
      out[k] = deepMerge(base[k], over[k]);
    } else {
      out[k] = over[k];
    }
  }
  return out;
}

// Secrets are encrypted on disk with Windows DPAPI (tied to your Windows account) via safeStorage.
// In memory they're plain text. Older plain-text values are read as-is and encrypted on the next save.
const SECRETS = [['custom', 'apiKey'], ['dropbox', 'accessToken'], ['dropbox', 'refreshToken']];
const canEncrypt = () => { try { return safeStorage.isEncryptionAvailable(); } catch { return false; } };

function mapSecrets(obj, fn) {
  const out = JSON.parse(JSON.stringify(obj));
  for (const [a, b] of SECRETS) if (out[a] && typeof out[a][b] === 'string' && out[a][b]) out[a][b] = fn(out[a][b]);
  return out;
}
function decrypt(v) {
  if (!v.startsWith('enc:')) return v;
  try { return safeStorage.decryptString(Buffer.from(v.slice(4), 'base64')); } catch { return ''; }
}
function encrypt(v) {
  return canEncrypt() ? 'enc:' + safeStorage.encryptString(v).toString('base64') : v;
}

function load() {
  if (cache) return cache;
  let raw = null;
  try {
    raw = JSON.parse(fs.readFileSync(file(), 'utf8'));
    cache = deepMerge(DEFAULTS, mapSecrets(raw, decrypt));
  } catch {
    cache = JSON.parse(JSON.stringify(DEFAULTS));
  }
  // Migrate any plain-text secrets from older versions.
  if (raw && canEncrypt() && SECRETS.some(([a, b]) => raw[a] && raw[a][b] && !String(raw[a][b]).startsWith('enc:'))) persist();
  return cache;
}

function persist() {
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(mapSecrets(cache, encrypt), null, 2));
}

function get() {
  return load();
}

function set(patch) {
  cache = deepMerge(load(), patch);
  persist();
  return cache;
}

module.exports = { get, set, DEFAULTS };
