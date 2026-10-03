// Dropbox uploader with OAuth2 PKCE + refresh tokens.
//
// Setup (once): create an app at https://www.dropbox.com/developers/apps
//   - Scoped access, "App folder" or "Full Dropbox"
//   - Permissions: files.content.write, sharing.write, sharing.read, account_info.read
//   - Copy the App key into Settings > Upload > Dropbox
// Connect: click "Connect", approve in browser, paste the code back.
// The refresh token never expires (unless revoked); short-lived access tokens
// are refreshed automatically before each upload.

const crypto = require('crypto');
const settings = require('../settings');

const AUTH_URL = 'https://www.dropbox.com/oauth2/authorize';
const TOKEN_URL = 'https://api.dropboxapi.com/oauth2/token';

let pendingVerifier = null;

function b64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Step 1: build the URL the user opens in the browser. */
function beginAuth(appKey) {
  if (!appKey) throw new Error('Dropbox app key not set');
  pendingVerifier = b64url(crypto.randomBytes(48));
  const challenge = b64url(crypto.createHash('sha256').update(pendingVerifier).digest());
  const p = new URLSearchParams({
    client_id: appKey,
    response_type: 'code',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    token_access_type: 'offline'
  });
  return `${AUTH_URL}?${p.toString()}`;
}

/** Step 2: exchange the pasted code for tokens. */
async function finishAuth(appKey, code) {
  if (!pendingVerifier) throw new Error('Click Connect first');
  const body = new URLSearchParams({
    code: code.trim(),
    grant_type: 'authorization_code',
    code_verifier: pendingVerifier,
    client_id: appKey
  });
  const res = await fetch(TOKEN_URL, { method: 'POST', body });
  const json = await res.json();
  if (!res.ok) throw new Error(`Dropbox auth failed: ${json.error_description || json.error || res.status}`);
  pendingVerifier = null;

  const patch = {
    dropbox: {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresAt: Date.now() + (json.expires_in - 60) * 1000
    }
  };
  settings.set(patch);

  // Grab the account email for display
  try {
    const acc = await api('users/get_current_account', null, json.access_token);
    settings.set({ dropbox: { accountEmail: acc.email || '' } });
  } catch {}
  return settings.get().dropbox;
}

function disconnect() {
  settings.set({ dropbox: { accessToken: '', refreshToken: '', expiresAt: 0, accountEmail: '' } });
}

async function getAccessToken() {
  const cfg = settings.get().dropbox;
  if (!cfg.refreshToken) throw new Error('Dropbox not connected (Settings > Upload > Dropbox)');
  if (cfg.accessToken && Date.now() < cfg.expiresAt) return cfg.accessToken;

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: cfg.refreshToken,
    client_id: cfg.appKey
  });
  const res = await fetch(TOKEN_URL, { method: 'POST', body });
  const json = await res.json();
  if (!res.ok) throw new Error(`Dropbox token refresh failed: ${json.error_description || json.error || res.status}`);
  settings.set({ dropbox: { accessToken: json.access_token, expiresAt: Date.now() + (json.expires_in - 60) * 1000 } });
  return json.access_token;
}

async function api(endpoint, arg, token) {
  const res = await fetch(`https://api.dropboxapi.com/2/${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(arg === null ? {} : { 'Content-Type': 'application/json' })
    },
    body: arg === null ? undefined : JSON.stringify(arg)
  });
  const text = await res.text();
  let json = {};
  try { json = JSON.parse(text); } catch {}
  if (!res.ok) {
    const err = new Error(`Dropbox ${endpoint}: ${json.error_summary || text.slice(0, 200)}`);
    err.body = json;
    throw err;
  }
  return json;
}

/** Turn a share link into a direct image link: ?dl=0 -> ?raw=1 */
function toRawUrl(url) {
  const u = new URL(url);
  u.searchParams.delete('dl');
  u.searchParams.set('raw', '1');
  return u.toString();
}

async function upload({ buffer, filename, mime }) {
  const token = await getAccessToken();
  const cfg = settings.get().dropbox;
  const folder = (cfg.folder || '/SnipNShare').replace(/\/+$/, '');
  const dbxPath = `${folder}/${filename}`;

  const up = await fetch('https://content.dropboxapi.com/2/files/upload', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/octet-stream',
      'Dropbox-API-Arg': JSON.stringify({ path: dbxPath, mode: 'add', autorename: true, mute: true })
    },
    body: buffer
  });
  const meta = await up.json();
  if (!up.ok) throw new Error(`Dropbox upload failed: ${meta.error_summary || up.status}`);

  let link;
  try {
    const r = await api('sharing/create_shared_link_with_settings', {
      path: meta.path_lower,
      settings: { requested_visibility: 'public' }
    }, token);
    link = r.url;
  } catch (e) {
    if (e.body && e.body.error && e.body.error['.tag'] === 'shared_link_already_exists') {
      const r = await api('sharing/list_shared_links', { path: meta.path_lower, direct_only: true }, token);
      link = r.links[0].url;
    } else {
      throw e;
    }
  }
  return toRawUrl(link);
}

module.exports = { beginAuth, finishAuth, disconnect, upload, toRawUrl };
