let displayId = null;
let W = 0, H = 0;
let start = null;
let dragging = false;

const shot = document.getElementById('shot');
const dim = document.getElementById('dim');
const sel = document.getElementById('sel');
const size = document.getElementById('size');
const hint = document.getElementById('hint');

function reset() {
  dragging = false;
  start = null;
  sel.style.display = 'none';
  size.style.display = 'none';
  dim.style.display = 'block';
  hint.style.display = 'block';
}

window.overlay.onInit(async (data) => {
  displayId = data.displayId;
  W = data.width;
  H = data.height;
  reset();
  shot.src = data.dataUrl;
  try { await shot.decode(); } catch {}
  window.overlay.ready(displayId);
});

window.overlay.onReset(() => {
  reset();
  shot.removeAttribute('src');
});

function rectFrom(a, b) {
  const x = Math.max(0, Math.min(a.x, b.x));
  const y = Math.max(0, Math.min(a.y, b.y));
  const x2 = Math.min(W, Math.max(a.x, b.x));
  const y2 = Math.min(H, Math.max(a.y, b.y));
  return { x, y, width: x2 - x, height: y2 - y };
}

function draw(r) {
  sel.style.display = 'block';
  sel.style.left = r.x + 'px';
  sel.style.top = r.y + 'px';
  sel.style.width = r.width + 'px';
  sel.style.height = r.height + 'px';
  dim.style.display = 'none';
  size.style.display = 'block';
  size.textContent = `${r.width} × ${r.height}`;
  const sx = r.x + r.width + 8 > W - 90 ? r.x : r.x + r.width + 8;
  const sy = r.y - 24 < 0 ? r.y + r.height + 6 : r.y - 24;
  size.style.left = sx + 'px';
  size.style.top = sy + 'px';
}

window.addEventListener('mousedown', (e) => {
  if (e.button !== 0) { window.overlay.cancel(); return; }
  start = { x: e.clientX, y: e.clientY };
  dragging = true;
  hint.style.display = 'none';
});

window.addEventListener('mousemove', (e) => {
  if (!dragging) return;
  draw(rectFrom(start, { x: e.clientX, y: e.clientY }));
});

window.addEventListener('mouseup', (e) => {
  if (!dragging || e.button !== 0) return;
  dragging = false;
  let r = rectFrom(start, { x: e.clientX, y: e.clientY });
  if (r.width < 4 || r.height < 4) r = { x: 0, y: 0, width: W, height: H }; // click = whole monitor
  window.overlay.select(displayId, r);
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') window.overlay.cancel();
});
window.addEventListener('contextmenu', (e) => e.preventDefault());
