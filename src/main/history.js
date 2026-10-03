// Capture history: userData/history.json + userData/history/<id>.(jpg|png) + thumbs
const { app, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');

const MAX_ITEMS = 500;

function dir() {
  const d = path.join(app.getPath('userData'), 'history');
  fs.mkdirSync(d, { recursive: true });
  return d;
}
function indexFile() {
  return path.join(app.getPath('userData'), 'history.json');
}

function list() {
  try {
    return JSON.parse(fs.readFileSync(indexFile(), 'utf8'));
  } catch {
    return [];
  }
}

function save(items) {
  fs.writeFileSync(indexFile(), JSON.stringify(items, null, 2));
}

/**
 * @param {Object} entry  { url, host, buffer (Buffer), format ('jpg'|'png'), width, height, keepLocalCopy }
 */
function add(entry) {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const img = nativeImage.createFromBuffer(entry.buffer);
  const thumb = img.resize({ width: 240 });
  const thumbPath = path.join(dir(), `${id}.thumb.png`);
  fs.writeFileSync(thumbPath, thumb.toPNG());

  let filePath = null;
  if (entry.keepLocalCopy) {
    filePath = path.join(dir(), `${id}.${entry.format}`);
    fs.writeFileSync(filePath, entry.buffer);
  }

  const items = list();
  const item = {
    id,
    ts: Date.now(),
    url: entry.url || null,
    host: entry.host || null,
    format: entry.format,
    width: entry.width,
    height: entry.height,
    thumb: thumbPath,
    file: filePath
  };
  items.unshift(item);

  // trim
  while (items.length > MAX_ITEMS) {
    const old = items.pop();
    remove(old.id, items, false);
  }
  save(items);
  return item;
}

function remove(id, items = null, persist = true) {
  const all = items || list();
  const idx = all.findIndex((i) => i.id === id);
  if (idx >= 0) {
    const it = all[idx];
    for (const p of [it.thumb, it.file]) {
      if (p) { try { fs.unlinkSync(p); } catch {} }
    }
    all.splice(idx, 1);
  }
  if (persist) save(all);
  return all;
}

function clear() {
  for (const it of list()) {
    for (const p of [it.thumb, it.file]) {
      if (p) { try { fs.unlinkSync(p); } catch {} }
    }
  }
  save([]);
}

module.exports = { list, add, remove, clear, dir };
