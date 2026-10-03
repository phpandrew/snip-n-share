// Upload to your own host (g84.bid/snsupload.php). See server/snsupload.php.
// POST multipart/form-data, field "file", header "X-Api-Key".
// Expects JSON back: { "ok": true, "url": "https://g84.bid/i/abc123.jpg" }

async function upload({ buffer, filename, mime }, cfg) {
  if (!cfg.uploadUrl) throw new Error('Custom host: upload URL not set');
  if (!cfg.apiKey) throw new Error('Custom host: API key not set');

  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mime }), filename);

  const res = await fetch(cfg.uploadUrl, {
    method: 'POST',
    headers: { 'X-Api-Key': cfg.apiKey },
    body: form
  });

  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { throw new Error(`Custom host: bad response (${res.status}): ${text.slice(0, 200)}`); }
  if (!res.ok || !json.ok || !json.url) throw new Error(`Custom host: ${json.error || res.status}`);
  return json.url;
}

async function test(cfg) {
  if (!cfg.uploadUrl) throw new Error('Upload URL not set');
  const res = await fetch(cfg.uploadUrl, { method: 'GET', headers: { 'X-Api-Key': cfg.apiKey || '' } });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { throw new Error(`Bad response (${res.status}): ${text.slice(0, 200)}`); }
  if (!json.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json.message || 'OK';
}

module.exports = { upload, test };
