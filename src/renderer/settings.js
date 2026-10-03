const $ = (id) => document.getElementById(id);
let S = null;

// ---------- tabs ----------
function showTab(tab) {
  document.querySelectorAll('nav button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('section').forEach((s) => s.classList.toggle('active', s.id === `tab-${tab}`));
  if (tab === 'history') loadHistory();
}
document.querySelectorAll('nav button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
window.api.onTab(showTab);
window.api.onHistoryChanged(() => { if ($('tab-history').classList.contains('active')) loadHistory(); });

document.querySelectorAll('[data-ext]').forEach((a) => a.addEventListener('click', (e) => {
  e.preventDefault();
  window.api.openExternal(a.dataset.ext);
}));

function msg(id, text, cls = '') {
  const el = $(id);
  el.textContent = text;
  el.className = `msg ${cls}`;
}

// ---------- load ----------
async function load() {
  S = await window.api.getSettings();
  $('ver').textContent = `v${S.version}`;
  $('ver2').textContent = `v${S.version}`;
  $('hotkey').value = S.hotkey;
  if (!S.hotkeyRegistered) msg('hotkeyMsg', 'Hotkey is NOT registered — another app may be using it.', 'err');
  $('format').value = S.format;
  $('jpegQuality').value = S.jpegQuality;
  $('showEditor').checked = S.showEditor;
  $('keepLocalCopy').checked = S.keepLocalCopy;
  $('launchAtStartup').checked = S.launchAtStartup;
  $('autoCheckUpdates').checked = S.autoCheckUpdates;

  document.querySelector(`input[name=activeHost][value=${S.activeHost}]`).checked = true;
  markActiveHost();
  $('customUrl').value = S.custom.uploadUrl;
  $('customKey').value = S.custom.apiKey;
  $('dbxKey').value = S.dropbox.appKey;
  $('dbxFolder').value = S.dropbox.folder;
  renderDbxState();
}

function markActiveHost() {
  const v = document.querySelector('input[name=activeHost]:checked').value;
  document.querySelectorAll('.host').forEach((h) => h.classList.toggle('active', h.id === `host-${v}`));
}

function renderDbxState() {
  const on = !!S.dropbox.refreshToken;
  $('dbxConnected').style.display = on ? '' : 'none';
  $('dbxDisconnected').style.display = on ? 'none' : '';
  $('dbxEmail').textContent = S.dropbox.accountEmail || '(account)';
}

async function save(patch, msgId) {
  const r = await window.api.setSettings(patch);
  S = { ...S, ...r.settings };
  if (msgId) msg(msgId, 'Saved', 'ok');
  return r;
}

// ---------- general ----------
$('hotkeySave').addEventListener('click', async () => {
  const r = await save({ hotkey: $('hotkey').value.trim() });
  if (r.hotkeyResult.ok) msg('hotkeyMsg', `Hotkey set to ${S.hotkey}`, 'ok');
  else { msg('hotkeyMsg', r.hotkeyResult.error, 'err'); $('hotkey').value = S.hotkey; }
});
$('captureNow').addEventListener('click', () => window.api.capture());
$('format').addEventListener('change', () => save({ format: $('format').value }, 'generalMsg'));
$('jpegQuality').addEventListener('change', () => save({ jpegQuality: Number($('jpegQuality').value) || 90 }, 'generalMsg'));
$('showEditor').addEventListener('change', () => save({ showEditor: $('showEditor').checked }, 'generalMsg'));
$('keepLocalCopy').addEventListener('change', () => save({ keepLocalCopy: $('keepLocalCopy').checked }, 'generalMsg'));
$('launchAtStartup').addEventListener('change', () => save({ launchAtStartup: $('launchAtStartup').checked }, 'generalMsg'));
$('autoCheckUpdates').addEventListener('change', () => save({ autoCheckUpdates: $('autoCheckUpdates').checked }));

// ---------- upload ----------
document.querySelectorAll('input[name=activeHost]').forEach((r) => r.addEventListener('change', async () => {
  markActiveHost();
  await save({ activeHost: r.value }, 'uploadMsg');
}));
for (const id of ['customUrl', 'customKey']) {
  $(id).addEventListener('change', () => save({ custom: { uploadUrl: $('customUrl').value.trim(), apiKey: $('customKey').value.trim() } }, 'customMsg'));
}
$('customTest').addEventListener('click', async () => {
  const cfg = { uploadUrl: $('customUrl').value.trim(), apiKey: $('customKey').value.trim() };
  await save({ custom: cfg });
  msg('customMsg', 'Testing…');
  const r = await window.api.testCustom(cfg);
  msg('customMsg', r.ok ? `OK — ${r.message}` : r.error, r.ok ? 'ok' : 'err');
});

for (const id of ['dbxKey', 'dbxFolder']) {
  $(id).addEventListener('change', () => save({ dropbox: { appKey: $('dbxKey').value.trim(), folder: $('dbxFolder').value.trim() || '/SnipNShare' } }, 'dbxMsg'));
}
$('dbxConnect').addEventListener('click', async () => {
  const r = await window.api.dropboxBegin($('dbxKey').value.trim());
  msg('dbxMsg', r.ok ? 'Approve in the browser, then paste the code here and click Finish.' : r.error, r.ok ? '' : 'err');
});
$('dbxFinish').addEventListener('click', async () => {
  msg('dbxMsg', 'Exchanging code…');
  const r = await window.api.dropboxFinish($('dbxKey').value.trim(), $('dbxCode').value);
  if (r.ok) {
    S.dropbox = { ...S.dropbox, ...r.dropbox };
    $('dbxCode').value = '';
    renderDbxState();
    msg('dbxMsg', 'Dropbox connected.', 'ok');
  } else {
    msg('dbxMsg', r.error, 'err');
  }
});
$('dbxDisconnect').addEventListener('click', async () => {
  await window.api.dropboxDisconnect();
  S.dropbox = { ...S.dropbox, refreshToken: '', accessToken: '', accountEmail: '' };
  renderDbxState();
  msg('dbxMsg', 'Disconnected.');
});

// ---------- history ----------
function fmtDate(ts) {
  return new Date(ts).toLocaleString();
}

async function loadHistory() {
  const items = await window.api.historyList();
  const root = $('hist');
  root.innerHTML = '';
  if (!items.length) { root.innerHTML = '<div class="empty">No captures yet.</div>'; return; }
  for (const it of items) {
    const div = document.createElement('div');
    div.className = 'item';
    div.innerHTML = `
      <img src="file:///${it.thumb.replace(/\\/g, '/')}" alt="">
      <div class="meta">
        <div class="url" title="Click to copy">${it.url || '(not uploaded)'}</div>
        <div class="sub">${fmtDate(it.ts)} · ${it.width}×${it.height} ${it.format.toUpperCase()} · ${it.host || ''}</div>
      </div>
      <div class="acts">
        <button data-a="copy" ${it.url ? '' : 'disabled'}>Copy URL</button>
        <button data-a="open" ${it.url ? '' : 'disabled'}>Open</button>
        <button data-a="file" ${it.file ? '' : 'disabled'} title="Show local file">File</button>
        <button data-a="del" class="danger">✕</button>
      </div>`;
    div.querySelector('.url').addEventListener('click', () => it.url && window.api.historyCopy(it.url));
    div.querySelector('[data-a=copy]').addEventListener('click', () => window.api.historyCopy(it.url));
    div.querySelector('[data-a=open]').addEventListener('click', () => window.api.historyOpen(it.url));
    div.querySelector('[data-a=file]').addEventListener('click', () => window.api.historyShowFile(it.file));
    div.querySelector('[data-a=del]').addEventListener('click', async () => { await window.api.historyRemove(it.id); loadHistory(); });
    root.appendChild(div);
  }
}
$('histFolder').addEventListener('click', () => window.api.historyOpenFolder());
$('histClear').addEventListener('click', async () => {
  if (confirm('Delete all history entries and local copies?')) { await window.api.historyClear(); loadHistory(); }
});

// ---------- updates ----------
$('checkUpdates').addEventListener('click', () => { msg('updMsg', 'Checking…'); window.api.checkUpdates(); });
window.api.onUpdaterStatus((s) => {
  const map = {
    checking: ['Checking for updates…', ''],
    available: [`v${s.version} available — downloading…`, 'ok'],
    none: [`You're up to date (v${s.version}).`, 'ok'],
    downloading: [`Downloading… ${s.percent}%`, ''],
    downloaded: [`v${s.version} downloaded — restart to install.`, 'ok'],
    error: [s.message, 'err']
  };
  const [t, c] = map[s.state] || ['', ''];
  msg('updMsg', t, c);
});

load();
