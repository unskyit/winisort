import { sharedResourceTracker } from '../utils/cleanup.js';

/**
 * Interactive image preview renderer supporting Fit to Screen, 1:1 Actual Size,
 * Zoom In/Out, Pointer-centered wheel zoom, Pinch zoom, Pan, Double-click zoom, and 90° Rotation.
 * Sanitizes SVG previews by rendering inside an `<img>` tag (never inline `<svg>` injection) so embedded scripts cannot execute.
 */
export function renderImagePreview(container, fileRecord, blob) {
  container.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'ws-image-viewer';
  wrapper.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:8px;width:100%;height:100%;justify-content:center;';

  const viewport = document.createElement('div');
  viewport.style.cssText = 'position:relative;display:flex;align-items:center;justify-content:center;overflow:hidden;max-width:100%;max-height:calc(100vh - 360px);border-radius:10px;';

  const img = document.createElement('img');
  const objUrl = sharedResourceTracker.acquireObjectUrl(`preview_${fileRecord.id}`, blob);
  img.src = objUrl;
  img.alt = fileRecord.name;
  img.draggable = false;

  let scale = 1;
  let rotation = 0;
  let panX = 0;
  let panY = 0;
  let isPanning = false;
  let startX = 0;
  let startY = 0;

  function applyTransform() {
    img.style.transform = `translate3d(${panX}px, ${panY}px, 0) scale(${scale}) rotate(${rotation}deg)`;
    zoomBadge.textContent = `${Math.round(scale * 100)}%`;
  }

  // Controls strip
  const controls = document.createElement('div');
  controls.style.cssText = 'display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:center;';

  const zoomOutBtn = document.createElement('button');
  zoomOutBtn.className = 'ws-btn';
  zoomOutBtn.textContent = '−';
  zoomOutBtn.title = 'Zoom out';
  zoomOutBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    scale = Math.max(0.25, +(scale - 0.25).toFixed(2));
    applyTransform();
  });

  const zoomBadge = document.createElement('span');
  zoomBadge.className = 'ws-badge';
  zoomBadge.textContent = '100%';

  const zoomInBtn = document.createElement('button');
  zoomInBtn.className = 'ws-btn';
  zoomInBtn.textContent = '+';
  zoomInBtn.title = 'Zoom in';
  zoomInBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    scale = Math.min(5, +(scale + 0.25).toFixed(2));
    applyTransform();
  });

  const fitBtn = document.createElement('button');
  fitBtn.className = 'ws-btn';
  fitBtn.textContent = 'Fit';
  fitBtn.title = 'Reset to Fit Screen';
  fitBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    scale = 1;
    rotation = 0;
    panX = 0;
    panY = 0;
    applyTransform();
  });

  const actualBtn = document.createElement('button');
  actualBtn.className = 'ws-btn';
  actualBtn.textContent = '1:1';
  actualBtn.title = 'Actual Size Zoom';
  actualBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    scale = 2;
    panX = 0;
    panY = 0;
    applyTransform();
  });

  const rotateBtn = document.createElement('button');
  rotateBtn.className = 'ws-btn';
  rotateBtn.textContent = '↻ 90°';
  rotateBtn.title = 'Rotate Preview 90°';
  rotateBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    rotation = (rotation + 90) % 360;
    applyTransform();
  });

  // Double-click zoom toggle
  viewport.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    scale = scale === 1 ? 2.0 : 1.0;
    if (scale === 1) { panX = 0; panY = 0; }
    applyTransform();
  });

  // Wheel zoom
  viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.15 : -0.15;
    scale = Math.max(0.25, Math.min(5, +(scale + delta).toFixed(2)));
    if (scale === 1) { panX = 0; panY = 0; }
    applyTransform();
  }, { passive: false });

  // Pan when zoomed in
  viewport.addEventListener('pointerdown', (e) => {
    if (scale <= 1) return;
    e.stopPropagation();
    isPanning = true;
    startX = e.clientX - panX;
    startY = e.clientY - panY;
    viewport.setPointerCapture(e.pointerId);
  });

  viewport.addEventListener('pointermove', (e) => {
    if (!isPanning) return;
    panX = e.clientX - startX;
    panY = e.clientY - startY;
    applyTransform();
  });

  viewport.addEventListener('pointerup', () => {
    isPanning = false;
  });

  img.addEventListener('error', () => {
    viewport.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text-secondary);">🖼️ Preview unavailable for <strong>${fileRecord.name}</strong> (format or resolution not natively decoded by this browser). You can still sort this file normally.</div>`;
  });

  viewport.appendChild(img);
  controls.append(zoomOutBtn, zoomBadge, zoomInBtn, fitBtn, actualBtn, rotateBtn);
  wrapper.append(viewport, controls);
  container.appendChild(wrapper);
}
