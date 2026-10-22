// Upload to your own host (g84.bid/snsupload.php). See server/snsupload.php.
// POST multipart/form-data, field "file", header "X-Api-Key".
// Expects JSON back: { "ok": true, "url": "https://g84.bid/i/abc123.jpg" }

// The API key travels in a header, so the URL must be https (plain http is allowed only for
// localhost testing) and we never follow a redirect, which could hand the key to another host.
function checkUrl(raw) {
  let u;
  try { u = new URL(String(raw || '')); } catch { throw new Error('Custom host: upload URL is not a valid URL'); }
  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) {
    throw new Error('Custom host: upload URL must start with https://');
  }
  return u.toString();
}

async function upload({ buffer, filename, mime }, cfg) {
  if (!cfg.uploadUrl) throw new Error('Custom host: upload URL not set');
  if (!cfg.apiKey) throw new Error('Custom host: API key not set');
  const url = checkUrl(cfg.uploadUrl);

  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mime }), filename);

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'X-Api-Key': cfg.apiKey },
    body: form,
    redirect: 'error'
  });

  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { throw new Error(`Custom host: bad response (${res.status}): ${text.slice(0, 200)}`); }
  if (!res.ok || !json.ok || !json.url) throw new Error(`Custom host: ${json.error || res.status}`);
  return json.url;
}

async function test(cfg) {
  if (!cfg.uploadUrl) throw new Error('Upload URL not set');
  const res = await fetch(checkUrl(cfg.uploadUrl), { method: 'GET', headers: { 'X-Api-Key': cfg.apiKey || '' }, redirect: 'error' });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { throw new Error(`Bad response (${res.status}): ${text.slice(0, 200)}`); }
  if (!json.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json.message || 'OK';
}

module.exports = { upload, test };
