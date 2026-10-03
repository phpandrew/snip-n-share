// Post-capture editor: box (solid fill) + blur (pixelate) tools, then upload / copy / save.
const base = document.getElementById('base');
const draw = document.getElementById('draw');
const bctx = base.getContext('2d');
const dctx = draw.getContext('2d');
const status = document.getElementById('status');
const colorEl = document.getElementById('color');
const blurEl = document.getElementById('blurAmt');
const formatEl = document.getElementById('format');
const qualityEl = document.getElementById('quality');

let img = null;        // HTMLImageElement with the original capture
let W = 0, H = 0;      // image pixels
let tool = 'box';
let ops = [];          // { type: 'box', x, y, w, h, color } | { type: 'blur', x, y, w, h, amount }
let drag = null;
let busy = false;

window.editor.onInit((data) => {
  W = data.width; H = data.height;
  formatEl.value = data.format;
  qualityEl.value = data.jpegQuality;
  img = new Image();
  img.onload = () => { fit(); render(); };
  img.src = data.dataUrl;
  setStatus(`${W} × ${H} · to ${data.activeHost === 'dropbox' ? 'Dropbox' : 'custom host'}`);
});

function fit() {
  base.width = W; base.height = H;
  draw.width = W; draw.height = H;
  const stage = document.getElementById('stage');
  const maxW = stage.clientWidth - 32, maxH = stage.clientHeight - 32;
  const scale = Math.min(1, maxW / W, maxH / H);
  const cw = Math.round(W * scale), ch = Math.round(H * scale);
  for (const c of [base, draw]) { c.style.width = cw + 'px'; c.style.height = ch + 'px'; }
}
window.addEventListener('resize', fit);

function render() {
  bctx.clearRect(0, 0, W, H);
  bctx.drawImage(img, 0, 0);
  for (const op of ops) applyOp(bctx, op);
  dctx.clearRect(0, 0, W, H);
}

function applyOp(ctx, op) {
  if (op.w < 1 || op.h < 1) return;
  if (op.type === 'box') {
    ctx.fillStyle = op.color;
    ctx.fillRect(op.x, op.y, op.w, op.h);
  } else if (op.type === 'blur') {
    // Pixelate: downscale the region, then upscale with smoothing off.
    const px = Math.max(2, op.amount);
    const sw = Math.max(1, Math.round(op.w / px)), sh = Math.max(1, Math.round(op.h / px));
    const tmp = document.createElement('canvas');
    tmp.width = sw; tmp.height = sh;
    const t = tmp.getContext('2d');
    t.imageSmoothingEnabled = true;
    t.drawImage(ctx.canvas, op.x, op.y, op.w, op.h, 0, 0, sw, sh);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tmp, 0, 0, sw, sh, op.x, op.y, op.w, op.h);
    ctx.restore();
  }
}

function toImageCoords(e) {
  const r = draw.getBoundingClientRect();
  return {
    x: Math.round((e.clientX - r.left) * (W / r.width)),
    y: Math.round((e.clientY - r.top) * (H / r.height))
  };
}

function normRect(a, b) {
  const x = Math.max(0, Math.min(a.x, b.x)), y = Math.max(0, Math.min(a.y, b.y));
  const x2 = Math.min(W, Math.max(a.x, b.x)), y2 = Math.min(H, Math.max(a.y, b.y));
  return { x, y, w: x2 - x, h: y2 - y };
}

function currentOp(r) {
  return tool === 'box'
    ? { type: 'box', ...r, color: colorEl.value }
    : { type: 'blur', ...r, amount: Number(blurEl.value) };
}

draw.addEventListener('mousedown', (e) => {
  if (e.button !== 0 || !img) return;
  drag = toImageCoords(e);
});
window.addEventListener('mousemove', (e) => {
  if (!drag) return;
  const r = normRect(drag, toImageCoords(e));
  dctx.clearRect(0, 0, W, H);
  // live preview
  dctx.save();
  if (tool === 'box') {
    dctx.fillStyle = colorEl.value;
    dctx.fillRect(r.x, r.y, r.w, r.h);
  } else {
    dctx.fillStyle = 'rgba(77,163,255,0.25)';
    dctx.fillRect(r.x, r.y, r.w, r.h);
  }
  dctx.strokeStyle = '#4da3ff';
  dctx.lineWidth = Math.max(1, W / draw.getBoundingClientRect().width);
  dctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w, r.h);
  dctx.restore();
});
window.addEventListener('mouseup', (e) => {
  if (!drag) return;
  const r = normRect(drag, toImageCoords(e));
  drag = null;
  if (r.w >= 2 && r.h >= 2) ops.push(currentOp(r));
  render();
});

document.querySelectorAll('.tool').forEach((b) => {
  b.addEventListener('click', () => {
    tool = b.dataset.tool;
    document.querySelectorAll('.tool').forEach((x) => x.classList.toggle('active', x === b));
  });
});
document.getElementById('undo').addEventListener('click', undo);
document.getElementById('clear').addEventListener('click', () => { ops = []; render(); });
document.getElementById('upload').addEventListener('click', doUpload);
document.getElementById('copy').addEventListener('click', doCopy);
document.getElementById('save').addEventListener('click', doSave);
document.getElementById('cancel').addEventListener('click', () => window.editor.cancel());
formatEl.addEventListener('change', () => { qualityEl.disabled = formatEl.value !== 'jpg'; });

function undo() { ops.pop(); render(); }

function setStatus(msg, err = false) {
  status.textContent = msg;
  status.classList.toggle('err', err);
}

function exportData() {
  const format = formatEl.value;
  const mime = format === 'png' ? 'image/png' : 'image/jpeg';
  const q = Math.min(1, Math.max(0.3, Number(qualityEl.value) / 100));
  // JPG has no alpha: flatten onto white first.
  let src = base;
  if (format === 'jpg') {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d');
    x.fillStyle = '#fff';
    x.fillRect(0, 0, W, H);
    x.drawImage(base, 0, 0);
    src = c;
  }
  return { dataUrl: src.toDataURL(mime, q), format, width: W, height: H };
}

function setBusy(b) {
  busy = b;
  document.querySelectorAll('button, select, input').forEach((el) => { el.disabled = b; });
}

async function doUpload() {
  if (busy || !img) return;
  setBusy(true);
  setStatus('Uploading…');
  const r = await window.editor.upload(exportData());
  if (!r.ok) {
    setBusy(false);
    setStatus(r.error, true);
  }
}

async function doCopy() {
  if (busy || !img) return;
  await window.editor.copyImage({ dataUrl: base.toDataURL('image/png') });
}

async function doSave() {
  if (busy || !img) return;
  const r = await window.editor.saveAs(exportData());
  if (r.ok) setStatus(`Saved: ${r.path}`);
}

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { window.editor.cancel(); return; }
  if (e.key === 'Enter' && !e.ctrlKey) { e.preventDefault(); doUpload(); return; }
  if (e.ctrlKey && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
  if (e.ctrlKey && e.key.toLowerCase() === 'c') { e.preventDefault(); doCopy(); return; }
  if (e.ctrlKey && e.key.toLowerCase() === 's') { e.preventDefault(); doSave(); return; }
  if (e.key === 'b' || e.key === 'B') document.querySelector('[data-tool=box]').click();
  if (e.key === 'u' || e.key === 'U') document.querySelector('[data-tool=blur]').click();
});
