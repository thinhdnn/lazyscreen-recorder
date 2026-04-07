const overlay = document.getElementById('overlay');
const selection = document.getElementById('selection');
const hint = document.getElementById('hint');

let isDrawing = false;
let startX = 0;
let startY = 0;

overlay.addEventListener('mousedown', (e) => {
  isDrawing = true;
  startX = e.clientX;
  startY = e.clientY;
  hint.style.opacity = '0';
  selection.style.display = 'block';
  selection.style.left = `${startX}px`;
  selection.style.top = `${startY}px`;
  selection.style.width = '0';
  selection.style.height = '0';
});

document.addEventListener('mousemove', (e) => {
  if (!isDrawing) return;

  const x = Math.min(e.clientX, startX);
  const y = Math.min(e.clientY, startY);
  const w = Math.abs(e.clientX - startX);
  const h = Math.abs(e.clientY - startY);

  selection.style.left = `${x}px`;
  selection.style.top = `${y}px`;
  selection.style.width = `${w}px`;
  selection.style.height = `${h}px`;
  selection.dataset.size = `${w} × ${h}`;
});

document.addEventListener('mouseup', (e) => {
  if (!isDrawing) return;
  isDrawing = false;

  const x = Math.min(e.clientX, startX);
  const y = Math.min(e.clientY, startY);
  const w = Math.abs(e.clientX - startX);
  const h = Math.abs(e.clientY - startY);

  if (w < 10 || h < 10) {
    selection.style.display = 'none';
    hint.style.opacity = '1';
    return;
  }

  window.electronAPI.areaSelected({ x, y, width: w, height: h });
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    window.electronAPI.areaCancelled();
  }
});
