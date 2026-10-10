// Post-capture editor.
// Tools: pen, highlighter, arrow, rectangle outline, solid box, text, numbered step, blur, crop.
// Every edit is an "op" in a list; the canvas is re-rendered from the original
// image + ops, so undo/redo, recolouring, cropping and window resizing are all lossless.
// Ops are stored in full-image coordinates; crop only changes the visible/exported view.

const $ = (id) => document.getElementById(id);
const base = $('base'), draw = $('draw');
const bctx = base.getContext('2d'), dctx = draw.getContext('2d');
const wrap = $('wrap'), stage = $('stage');
const statusEl = $('status');
const colorEl = $('color'), sliderEl = $('slider'), sliderLabel = $('sliderLabel'), sliderVal = $('sliderVal');
const formatEl = $('format'), qualityEl = $('quality');
const textInput = $('textInput');

const SWATCHES = ['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#0a84ff', '#af52de', '#000000', '#ffffff'];
const ALL_TOOLS = ['pen', 'highlight', 'arrow', 'rect', 'box', 'text', 'step', 'blur', 'crop'];

let img = null;
let W = 0, H = 0;        // full image size
let K = 1;               // size multiplier so strokes look the same on 1080p and 4K captures
let view = { x: 0, y: 0, w: 0, h: 0 };   // region currently shown on the canvas
let ops = [];
let redoStack = [];
let busy = false;
let drag = null;         // in-progress shape / crop handle drag
let textAt = null;       // { x, y } image coords of pending text
let hostLabel = '';
let enabled = ALL_TOOLS.slice();
let selected = null;     // the annotation just drawn; colour/size changes apply to it until you switch tools

// Remembered settings (persisted through main process). Crop is never remembered as the active tool.
let prefs = { tool: 'pen', color: '#ff3b30', size: 3, blur: 5 };
let lastDrawTool = 'pen';

// ---------- init ----------
window.editor.onInit((data) => {
  W = data.width; H = data.height;
  K = Math.max(1, Math.round(Math.max(W, H) / 1400));
  formatEl.value = data.format;
  qualityEl.value = data.jpegQuality;
  qualityEl.disabled = data.format !== 'jpg';
  hostLabel = data.activeHost === 'dropbox' ? 'Dropbox' : 'custom host';
  if (data.prefs) prefs = { ...prefs, ...data.prefs };
  if (Array.isArray(data.enabledTools) && data.enabledTools.length) {
    enabled = ALL_TOOLS.filter((t) => data.enabledTools.includes(t));
  }
  document.querySelectorAll('.tool').forEach((b) => { b.style.display = enabled.includes(b.dataset.tool) ? '' : 'none'; });
  if (!enabled.includes(prefs.tool) || prefs.tool === 'crop') prefs.tool = enabled.find((t) => t !== 'crop') || enabled[0];
  lastDrawTool = prefs.tool;
  applyPrefsToUi();
  img = new Image();
  img.onload = () => { updateView(); };
  img.src = data.dataUrl;
});

let saveTimer = null;
function savePrefs() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushPrefs, 300);
}
function flushPrefs() {
  clearTimeout(saveTimer);
  saveTimer = null;
  window.editor.savePrefs({ ...prefs, tool: prefs.tool === 'crop' ? lastDrawTool : prefs.tool });
}
window.addEventListener('beforeunload', () => { if (saveTimer) flushPrefs(); });

// ---------- sizes ----------
const strokeW = (lvl) => lvl * 1.5 * K;                    // 1.5 … 15 px
const highlightW = (lvl) => (6 + lvl * 3) * K;              // 9 … 36 px
const textPx = (lvl) => Math.round((12 + lvl * 3) * K);     // 15 … 42 px
const stepR = (lvl) => (9 + lvl * 2) * K;                   // radius 11 … 29 px
// Blur: 1 = light softening, 10 = normal-size text just unreadable. Draw a second blur over it for more.
const blurPx = (lvl) => (0.8 + (lvl - 1) * 0.3) * K;        // 0.8 … 3.5 px std-dev

// ---------- crop / view ----------
function currentCrop() {
  for (let i = ops.length - 1; i >= 0; i--) if (ops[i].type === 'crop') return ops[i];
  return { x: 0, y: 0, w: W, h: H };
}
const cropping = () => prefs.tool === 'crop';

function updateView() {
  const c = cropping() ? { x: 0, y: 0, w: W, h: H } : currentCrop();
  view = { x: Math.round(c.x), y: Math.round(c.y), w: Math.max(1, Math.round(c.w)), h: Math.max(1, Math.round(c.h)) };
  fit();
  render();
  const c2 = currentCrop();
  setStatus(`${Math.round(c2.w)} × ${Math.round(c2.h)} · to ${hostLabel}`);
}

// ---------- layout ----------
function fit() {
  if (base.width !== view.w || base.height !== view.h) {
    base.width = view.w; base.height = view.h;
    draw.width = view.w; draw.height = view.h;
  }
  const maxW = stage.clientWidth - 32, maxH = stage.clientHeight - 32;
  const scale = Math.min(1, maxW / view.w, maxH / view.h);
  const cw = Math.max(1, Math.round(view.w * scale)), ch = Math.max(1, Math.round(view.h * scale));
  for (const c of [base, draw]) { c.style.width = cw + 'px'; c.style.height = ch + 'px'; }
}
window.addEventListener('resize', () => { if (!img) return; fit(); render(); });

function cssScale() { return base.getBoundingClientRect().width / view.w; }

// ---------- rendering ----------
function render() {
  bctx.setTransform(1, 0, 0, 1, 0, 0);
  bctx.clearRect(0, 0, base.width, base.height);
  bctx.setTransform(1, 0, 0, 1, -view.x, -view.y);
  bctx.drawImage(img, 0, 0);
  for (const op of ops) drawOp(bctx, op);
  bctx.setTransform(1, 0, 0, 1, 0, 0);
  clearOverlay();
  if (cropping()) drawCropOverlay(drag && drag.crop ? drag.crop : currentCrop());
}

function clearOverlay() {
  dctx.setTransform(1, 0, 0, 1, 0, 0);
  dctx.clearRect(0, 0, draw.width, draw.height);
  dctx.setTransform(1, 0, 0, 1, -view.x, -view.y);
}

function drawOp(ctx, op) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  switch (op.type) {
    case 'box':
      ctx.fillStyle = op.color;
      ctx.fillRect(op.x, op.y, op.w, op.h);
      break;
    case 'rect':
      ctx.strokeStyle = op.color;
      ctx.lineWidth = strokeW(op.size);
      ctx.lineJoin = 'miter';
      ctx.strokeRect(op.x, op.y, op.w, op.h);
      break;
    case 'pen':
    case 'highlight':
      if (op.type === 'highlight') {
        ctx.globalAlpha = 0.4;
        ctx.globalCompositeOperation = 'multiply';
        ctx.lineCap = 'butt';
      }
      ctx.strokeStyle = op.color;
      ctx.lineWidth = op.type === 'pen' ? strokeW(op.size) : highlightW(op.size);
      strokePath(ctx, op.points);
      break;
    case 'arrow':
      drawArrow(ctx, op);
      break;
    case 'text': {
      const px = textPx(op.size);
      ctx.font = `700 ${px}px "Segoe UI", system-ui, sans-serif`;
      ctx.textBaseline = 'top';
      ctx.lineWidth = Math.max(2, px / 7);
      ctx.strokeStyle = contrast(op.color);
      ctx.strokeText(op.text, op.x, op.y);   // outline keeps text readable on any background
      ctx.fillStyle = op.color;
      ctx.fillText(op.text, op.x, op.y);
      break;
    }
    case 'step': {
      const r = stepR(op.size);
      ctx.beginPath();
      ctx.arc(op.x, op.y, r, 0, Math.PI * 2);
      ctx.fillStyle = op.color;
      ctx.fill();
      ctx.lineWidth = Math.max(2, r / 6);
      ctx.strokeStyle = '#fff';
      ctx.stroke();
      ctx.fillStyle = contrast(op.color);
      ctx.font = `700 ${Math.round(r * 1.15)}px "Segoe UI", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(op.n), op.x, op.y + r * 0.06);
      break;
    }
    case 'blur': {
      if (op.w < 1 || op.h < 1) break;
      // Blur a padded copy of the region so edges sample real neighbours, then clip to the rect.
      // The canvas bitmap is offset by the view, so read pixels in canvas space.
      const pad = Math.ceil(blurPx(op.amount) * 3);
      const x0 = Math.max(view.x, op.x - pad), y0 = Math.max(view.y, op.y - pad);
      const x1 = Math.min(view.x + view.w, op.x + op.w + pad), y1 = Math.min(view.y + view.h, op.y + op.h + pad);
      const sw = Math.round(x1 - x0), sh = Math.round(y1 - y0);
      if (sw < 1 || sh < 1) break;
      const tmp = document.createElement('canvas');
      tmp.width = sw; tmp.height = sh;
      tmp.getContext('2d').drawImage(ctx.canvas, Math.round(x0 - view.x), Math.round(y0 - view.y), sw, sh, 0, 0, sw, sh);
      ctx.beginPath();
      ctx.rect(op.x, op.y, op.w, op.h);
      ctx.clip();
      ctx.filter = `blur(${blurPx(op.amount)}px)`;
      ctx.drawImage(tmp, Math.round(x0), Math.round(y0));
      break;
    }
    // 'crop' ops draw nothing; they set the view.
  }
  ctx.restore();
}

function strokePath(ctx, pts) {
  if (!pts.length) return;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  if (pts.length === 1) {
    ctx.lineTo(pts[0][0] + 0.01, pts[0][1]);   // a dot
  } else {
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
      ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
    }
    const last = pts[pts.length - 1];
    ctx.lineTo(last[0], last[1]);
  }
  ctx.stroke();
}

function drawArrow(ctx, op) {
  const lw = strokeW(op.size);
  const dx = op.x2 - op.x1, dy = op.y2 - op.y1;
  const len = Math.hypot(dx, dy);
  if (len < 2) return;
  const ang = Math.atan2(dy, dx);
  const head = Math.min(len * 0.6, Math.max(12 * K, lw * 4));
  const bx = op.x2 - Math.cos(ang) * head * 0.8, by = op.y2 - Math.sin(ang) * head * 0.8;
  ctx.strokeStyle = op.color;
  ctx.fillStyle = op.color;
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.moveTo(op.x1, op.y1);
  ctx.lineTo(bx, by);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(op.x2, op.y2);
  ctx.lineTo(op.x2 - head * Math.cos(ang - 0.45), op.y2 - head * Math.sin(ang - 0.45));
  ctx.lineTo(op.x2 - head * Math.cos(ang + 0.45), op.y2 - head * Math.sin(ang + 0.45));
  ctx.closePath();
  ctx.fill();
}

function contrast(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#000000' : '#ffffff';
}

// ---------- crop overlay ----------
function drawCropOverlay(c) {
  const s = cssScale();
  dctx.save();
  dctx.fillStyle = 'rgba(0,0,0,0.55)';
  dctx.beginPath();
  dctx.rect(0, 0, W, H);
  dctx.rect(c.x, c.y, c.w, c.h);
  dctx.fill('evenodd');
  dctx.strokeStyle = '#4da3ff';
  dctx.lineWidth = 2 / s;
  dctx.strokeRect(c.x, c.y, c.w, c.h);
  // rule-of-thirds guides
  dctx.strokeStyle = 'rgba(255,255,255,0.25)';
  dctx.lineWidth = 1 / s;
  for (let i = 1; i < 3; i++) {
    dctx.beginPath();
    dctx.moveTo(c.x + (c.w * i) / 3, c.y); dctx.lineTo(c.x + (c.w * i) / 3, c.y + c.h);
    dctx.moveTo(c.x, c.y + (c.h * i) / 3); dctx.lineTo(c.x + c.w, c.y + (c.h * i) / 3);
    dctx.stroke();
  }
  // handles: corners + edge midpoints
  const hs = 10 / s;
  dctx.fillStyle = '#fff';
  dctx.strokeStyle = '#4da3ff';
  dctx.lineWidth = 1.5 / s;
  for (const [hx, hy] of handlePoints(c)) {
    dctx.fillRect(hx - hs / 2, hy - hs / 2, hs, hs);
    dctx.strokeRect(hx - hs / 2, hy - hs / 2, hs, hs);
  }
  dctx.restore();
}

function handlePoints(c) {
  const mx = c.x + c.w / 2, my = c.y + c.h / 2, r = c.x + c.w, b = c.y + c.h;
  return [[c.x, c.y], [mx, c.y], [r, c.y], [r, my], [r, b], [mx, b], [c.x, b], [c.x, my]];
}

// Which edges does a point grab? Returns e.g. { l: true, t: true } or 'move' or null.
function hitCrop(p, c) {
  const tol = 10 / cssScale();
  const nearL = Math.abs(p.x - c.x) <= tol, nearR = Math.abs(p.x - (c.x + c.w)) <= tol;
  const nearT = Math.abs(p.y - c.y) <= tol, nearB = Math.abs(p.y - (c.y + c.h)) <= tol;
  const inX = p.x >= c.x - tol && p.x <= c.x + c.w + tol, inY = p.y >= c.y - tol && p.y <= c.y + c.h + tol;
  const e = { l: nearL && inY, r: nearR && inY, t: nearT && inX, b: nearB && inX };
  if (e.l || e.r || e.t || e.b) return e;
  if (p.x > c.x && p.x < c.x + c.w && p.y > c.y && p.y < c.y + c.h) return 'move';
  return null;
}

function cursorFor(h) {
  if (!h) return 'crosshair';
  if (h === 'move') return 'move';
  if ((h.l && h.t) || (h.r && h.b)) return 'nwse-resize';
  if ((h.r && h.t) || (h.l && h.b)) return 'nesw-resize';
  if (h.l || h.r) return 'ew-resize';
  return 'ns-resize';
}

function clampCrop(c) {
  const min = 8;
  let { x, y, w, h } = c;
  x = Math.max(0, Math.min(W - min, x)); y = Math.max(0, Math.min(H - min, y));
  w = Math.max(min, Math.min(W - x, w)); h = Math.max(min, Math.min(H - y, h));
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}

// ---------- input ----------
function pt(e) {
  const r = draw.getBoundingClientRect();
  return {
    x: Math.max(view.x, Math.min(view.x + view.w, view.x + (e.clientX - r.left) * (view.w / r.width))),
    y: Math.max(view.y, Math.min(view.y + view.h, view.y + (e.clientY - r.top) * (view.h / r.height)))
  };
}
function normRect(a, b) {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}

function commit(op) {
  ops.push(op);
  redoStack = [];
  if (op.type !== 'crop') selected = op;
  if (op.type === 'crop') updateView(); else render();
}

draw.addEventListener('mousedown', (e) => {
  if (e.button !== 0 || !img || busy) return;
  if (textInput.style.display === 'block') { finishText(); return; }
  const p = pt(e);
  const t = prefs.tool;
  e.preventDefault();
  if (t === 'crop') {
    const c = currentCrop();
    const h = hitCrop(p, c);
    drag = { start: p, crop: { ...c }, orig: { ...c }, handle: h || 'new' };
    return;
  }
  if (t === 'text') { startText(p); return; }
  if (t === 'step') {
    const n = ops.filter((o) => o.type === 'step').length + 1;
    commit({ type: 'step', x: p.x, y: p.y, n, color: prefs.color, size: prefs.size });
    return;
  }
  drag = { start: p, points: [[p.x, p.y]], cur: p };
});

draw.addEventListener('mousemove', (e) => {
  if (drag || !cropping() || !img) return;
  draw.style.cursor = cursorFor(hitCrop(pt(e), currentCrop()));
});

window.addEventListener('mousemove', (e) => {
  if (!drag) return;
  const p = pt(e);
  if (cropping()) { dragCrop(p); return; }
  drag.cur = p;
  if (prefs.tool === 'pen' || prefs.tool === 'highlight') {
    const last = drag.points[drag.points.length - 1];
    if (Math.hypot(p.x - last[0], p.y - last[1]) >= 1.5 * K) drag.points.push([p.x, p.y]);
  }
  preview();
});

function dragCrop(p) {
  const o = drag.orig, dx = p.x - drag.start.x, dy = p.y - drag.start.y;
  let c;
  if (drag.handle === 'new') {
    c = normRect(drag.start, p);
  } else if (drag.handle === 'move') {
    c = { ...o, x: Math.max(0, Math.min(W - o.w, o.x + dx)), y: Math.max(0, Math.min(H - o.h, o.y + dy)) };
  } else {
    let l = o.x, t = o.y, r = o.x + o.w, b = o.y + o.h;
    if (drag.handle.l) l = Math.min(r - 8, l + dx);
    if (drag.handle.r) r = Math.max(l + 8, r + dx);
    if (drag.handle.t) t = Math.min(b - 8, t + dy);
    if (drag.handle.b) b = Math.max(t + 8, b + dy);
    c = { x: l, y: t, w: r - l, h: b - t };
  }
  drag.crop = clampCrop(c);
  clearOverlay();
  drawCropOverlay(drag.crop);
  setStatus(`${drag.crop.w} × ${drag.crop.h} · to ${hostLabel}`);
}

window.addEventListener('mouseup', () => {
  if (!drag) return;
  if (cropping()) {
    const c = drag.crop, o = drag.orig;
    drag = null;
    if (c.w >= 8 && c.h >= 8 && (c.x !== o.x || c.y !== o.y || c.w !== o.w || c.h !== o.h)) {
      ops.push({ type: 'crop', ...c });
      redoStack = [];
    }
    render();
    return;
  }
  const op = pendingOp();
  drag = null;
  clearOverlay();
  if (op) commit(op);
});

draw.addEventListener('dblclick', () => { if (cropping()) setTool(lastDrawTool); });

function pendingOp() {
  const t = prefs.tool, { start, cur, points } = drag;
  const r = normRect(start, cur);
  switch (t) {
    case 'pen':
    case 'highlight':
      return { type: t, points: points.slice(), color: prefs.color, size: prefs.size };
    case 'arrow':
      return Math.hypot(cur.x - start.x, cur.y - start.y) > 4
        ? { type: 'arrow', x1: start.x, y1: start.y, x2: cur.x, y2: cur.y, color: prefs.color, size: prefs.size } : null;
    case 'rect':
      return r.w > 2 && r.h > 2 ? { type: 'rect', ...r, color: prefs.color, size: prefs.size } : null;
    case 'box':
      return r.w > 2 && r.h > 2 ? { type: 'box', ...r, color: prefs.color } : null;
    case 'blur':
      return r.w > 2 && r.h > 2 ? { type: 'blur', ...r, amount: prefs.blur } : null;
  }
  return null;
}

function preview() {
  clearOverlay();
  const op = pendingOp();
  if (!op) return;
  if (op.type === 'blur') {
    const s = cssScale();
    dctx.fillStyle = 'rgba(77,163,255,0.2)';
    dctx.fillRect(op.x, op.y, op.w, op.h);
    dctx.strokeStyle = '#4da3ff';
    dctx.lineWidth = 1 / s;
    dctx.setLineDash([6 / s, 4 / s]);
    dctx.strokeRect(op.x, op.y, op.w, op.h);
    dctx.setLineDash([]);
  } else {
    drawOp(dctx, op);
  }
}

// ---------- text ----------
function startText(p) {
  textAt = p;
  const s = cssScale();
  const px = textPx(prefs.size) * s;
  const cr = base.getBoundingClientRect(), wr = wrap.getBoundingClientRect();
  textInput.style.left = (cr.left - wr.left + (p.x - view.x) * s) + 'px';
  textInput.style.top = (cr.top - wr.top + (p.y - view.y) * s) + 'px';
  textInput.style.fontSize = px + 'px';
  textInput.style.height = Math.round(px * 1.3) + 'px';
  textInput.style.color = prefs.color;
  if (!textInput.value) textInput.style.width = '60px';
  textInput.style.display = 'block';
  textInput.focus();   // synchronous, so fast typing can't leak into the tool shortcuts
}
function finishText(cancel = false) {
  if (textInput.style.display !== 'block') return;
  const v = textInput.value.trim();
  textInput.style.display = 'none';
  textInput.value = '';
  if (!cancel && v && textAt) commit({ type: 'text', x: textAt.x, y: textAt.y, text: v, color: prefs.color, size: prefs.size });
  textAt = null;
}
textInput.addEventListener('input', () => {
  textInput.style.width = Math.max(60, (textInput.value.length + 2) * parseFloat(textInput.style.fontSize) * 0.6) + 'px';
});
textInput.addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.key === 'Enter') { e.preventDefault(); finishText(); }
  if (e.key === 'Escape') { e.preventDefault(); finishText(true); }
});
textInput.addEventListener('blur', () => finishText());

// ---------- toolbar ----------
const swatchesEl = $('swatches');
for (const c of SWATCHES) {
  const b = document.createElement('button');
  b.className = 'sw';
  b.style.background = c;
  b.dataset.color = c;
  b.title = c;
  b.addEventListener('click', () => setColor(c));
  swatchesEl.appendChild(b);
}

function applyPrefsToUi() {
  document.querySelectorAll('.tool').forEach((b) => b.classList.toggle('active', b.dataset.tool === prefs.tool));
  colorEl.value = prefs.color;
  document.querySelectorAll('.sw').forEach((b) => b.classList.toggle('active', b.dataset.color.toLowerCase() === prefs.color.toLowerCase()));
  const isBlur = prefs.tool === 'blur';
  sliderLabel.textContent = isBlur ? 'Strength' : 'Size';
  sliderEl.value = isBlur ? prefs.blur : prefs.size;
  sliderVal.textContent = sliderEl.value;
  const usesColor = !['blur', 'crop'].includes(prefs.tool);
  swatchesEl.style.opacity = colorEl.style.opacity = usesColor ? '1' : '.35';
  $('sliderWrap').style.opacity = ['box', 'crop'].includes(prefs.tool) ? '.35' : '1';
  draw.style.cursor = prefs.tool === 'text' ? 'text' : 'crosshair';
}

function setTool(t) {
  if (!enabled.includes(t)) return;
  finishText();
  const wasCropping = cropping();
  if (t !== prefs.tool) selected = null;
  if (t !== 'crop') lastDrawTool = t;
  prefs.tool = t;
  applyPrefsToUi();
  if (wasCropping !== cropping()) updateView();
  savePrefs();
}

// Changing colour / size also updates the annotation you just drew (until you switch tools),
// so you can tweak it after drawing without repainting older ones.
function lastAnnotation() {
  return selected && ops.includes(selected) ? selected : null;
}
function setColor(c) {
  prefs.color = c;
  const last = lastAnnotation();
  if (last && 'color' in last) { last.color = c; render(); }
  if (textInput.style.display === 'block') textInput.style.color = c;
  applyPrefsToUi();
  savePrefs();
}

document.querySelectorAll('.tool').forEach((b) => b.addEventListener('click', () => setTool(b.dataset.tool)));
colorEl.addEventListener('input', () => setColor(colorEl.value));
sliderEl.addEventListener('input', () => {
  const v = Number(sliderEl.value);
  sliderVal.textContent = v;
  const last = lastAnnotation();
  if (prefs.tool === 'blur') {
    prefs.blur = v;
    if (last && last.type === 'blur') { last.amount = v; render(); }
  } else {
    prefs.size = v;
    if (last && 'size' in last) { last.size = v; render(); }
    if (textInput.style.display === 'block' && textAt) startText(textAt);
  }
  savePrefs();
});

formatEl.addEventListener('change', () => {
  qualityEl.disabled = formatEl.value !== 'jpg';
  window.editor.saveOutput({ format: formatEl.value });
});
qualityEl.addEventListener('change', () => {
  const q = Math.min(100, Math.max(30, Number(qualityEl.value) || 90));
  qualityEl.value = q;
  window.editor.saveOutput({ jpegQuality: q });
});

function afterHistoryChange(op) { if (op && op.type === 'crop') updateView(); else render(); }
function undo() { finishText(true); selected = null; if (ops.length) { const op = ops.pop(); redoStack.push(op); afterHistoryChange(op); } }
function redo() { selected = null; if (redoStack.length) { const op = redoStack.pop(); ops.push(op); afterHistoryChange(op); } }
$('undo').addEventListener('click', undo);
$('redo').addEventListener('click', redo);
$('clear').addEventListener('click', () => { if (ops.length) { redoStack = ops.reverse(); ops = []; updateView(); } });
$('upload').addEventListener('click', doUpload);
$('copy').addEventListener('click', doCopy);
$('save').addEventListener('click', doSave);
$('cancel').addEventListener('click', () => window.editor.cancel());

function setStatus(msg, err = false) {
  statusEl.textContent = msg;
  statusEl.classList.toggle('err', err);
}

// ---------- output ----------
function readyForExport() {
  finishText();
  if (cropping()) setTool(lastDrawTool);   // apply the crop
}

function exportData() {
  readyForExport();
  const format = formatEl.value;
  const mime = format === 'png' ? 'image/png' : 'image/jpeg';
  const q = Math.min(1, Math.max(0.3, Number(qualityEl.value) / 100));
  let src = base;
  if (format === 'jpg') {
    const c = document.createElement('canvas');
    c.width = base.width; c.height = base.height;
    const x = c.getContext('2d');
    x.fillStyle = '#fff';
    x.fillRect(0, 0, c.width, c.height);
    x.drawImage(base, 0, 0);
    src = c;
  }
  return { dataUrl: src.toDataURL(mime, q), format, width: base.width, height: base.height };
}

function setBusy(b) {
  busy = b;
  document.querySelectorAll('#toolbar button, #toolbar select, #toolbar input').forEach((el) => { el.disabled = b; });
}

async function doUpload() {
  if (busy || !img) return;
  const data = exportData();
  setBusy(true);
  setStatus('Uploading…');
  const r = await window.editor.upload(data);
  if (!r.ok) { setBusy(false); setStatus(r.error, true); }
}
async function doCopy() {
  if (busy || !img) return;
  readyForExport();
  await window.editor.copyImage({ dataUrl: base.toDataURL('image/png') });
}
async function doSave() {
  if (busy || !img) return;
  const r = await window.editor.saveAs(exportData());
  if (r.ok) setStatus(`Saved: ${r.path}`);
}

// ---------- keyboard ----------
const KEYS = { p: 'pen', h: 'highlight', a: 'arrow', r: 'rect', b: 'box', t: 'text', n: 'step', u: 'blur', c: 'crop' };
window.addEventListener('keydown', (e) => {
  if (document.activeElement === textInput) return;
  if (document.activeElement && document.activeElement.tagName === 'INPUT' && document.activeElement.type === 'number') return;
  if (busy) return;
  const k = e.key.toLowerCase();
  if (e.key === 'Escape') {
    if (cropping()) { setTool(lastDrawTool); return; }
    window.editor.cancel(); return;
  }
  if (e.key === 'Enter' && !e.ctrlKey) {
    e.preventDefault();
    if (cropping()) { setTool(lastDrawTool); return; }   // Enter applies the crop
    doUpload(); return;
  }
  if (e.ctrlKey && k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
  if (e.ctrlKey && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); redo(); return; }
  if (e.ctrlKey && k === 'c') { e.preventDefault(); doCopy(); return; }
  if (e.ctrlKey && k === 's') { e.preventDefault(); doSave(); return; }
  if (!e.ctrlKey && !e.altKey && KEYS[k]) { setTool(KEYS[k]); return; }
  if (!e.ctrlKey && /^[1-8]$/.test(e.key)) setColor(SWATCHES[Number(e.key) - 1]);
  if (e.key === '[' || e.key === ']') {
    sliderEl.value = Number(sliderEl.value) + (e.key === ']' ? 1 : -1);
    sliderEl.dispatchEvent(new Event('input'));
  }
});

applyPrefsToUi();
