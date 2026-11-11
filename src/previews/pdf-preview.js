import { sharedResourceTracker } from '../utils/cleanup.js';

/**
 * Lazy page-by-page PDF viewer powered by locally bundled `public/vendor/pdf.js` & `pdf.worker.js`.
 * Never renders all 500 pages at once; renders only the active visible page on demand.
 */
export async function renderPdfPreview(container, fileRecord, blob) {
  container.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:8px;width:100%;max-width:680px;';

  const toolbar = document.createElement('div');
  toolbar.style.cssText = 'display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:center;';

  const prevPageBtn = document.createElement('button');
  prevPageBtn.className = 'ws-btn';
  prevPageBtn.textContent = '◀ Page';

  const pageIndicator = document.createElement('span');
  pageIndicator.className = 'ws-badge';
  pageIndicator.textContent = 'Loading PDF...';

  const nextPageBtn = document.createElement('button');
  nextPageBtn.className = 'ws-btn';
  nextPageBtn.textContent = 'Page ▶';

  const zoomOutBtn = document.createElement('button');
  zoomOutBtn.className = 'ws-btn';
  zoomOutBtn.textContent = '−';

  const zoomInBtn = document.createElement('button');
  zoomInBtn.className = 'ws-btn';
  zoomInBtn.textContent = '+';

  const nativeFrameBtn = document.createElement('button');
  nativeFrameBtn.className = 'ws-btn';
  nativeFrameBtn.textContent = 'Open Native PDF Frame';

  const stage = document.createElement('div');
  stage.style.cssText = 'background:var(--surface-secondary);padding:10px;border-radius:10px;border:1px solid var(--border-hairline);max-height:calc(100vh - 380px);overflow:auto;display:flex;justify-content:center;width:100%;';

  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'max-width:100%;height:auto;border-radius:6px;box-shadow:var(--shadow-sm);';
  stage.appendChild(canvas);

  toolbar.append(prevPageBtn, pageIndicator, nextPageBtn, zoomOutBtn, zoomInBtn, nativeFrameBtn);
  wrapper.append(stage, toolbar);
  container.appendChild(wrapper);

  let currentPage = 1;
  let numPages = 1;
  let scale = 0.85;
  let pdfDoc = null;

  async function renderCurrentPage() {
    if (!pdfDoc) return;
    try {
      const page = await pdfDoc.getPage(currentPage);
      const viewport = page.getViewport({ scale });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport }).promise;
      pageIndicator.textContent = `Page ${currentPage} / ${numPages}`;
      prevPageBtn.disabled = currentPage <= 1;
      nextPageBtn.disabled = currentPage >= numPages;
    } catch (err) {
      pageIndicator.textContent = 'PDF render error';
    }
  }

  prevPageBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (currentPage > 1) {
      currentPage--;
      renderCurrentPage();
    }
  });

  nextPageBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (currentPage < numPages) {
      currentPage++;
      renderCurrentPage();
    }
  });

  zoomOutBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    scale = Math.max(0.5, +(scale - 0.15).toFixed(2));
    renderCurrentPage();
  });

  zoomInBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    scale = Math.min(2.2, +(scale + 0.15).toFixed(2));
    renderCurrentPage();
  });

  nativeFrameBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const objUrl = sharedResourceTracker.acquireObjectUrl(`pdf_native_${fileRecord.id}`, blob);
    stage.innerHTML = '';
    const iframe = document.createElement('iframe');
    iframe.src = objUrl;
    iframe.title = fileRecord.name;
    iframe.style.cssText = 'width:100%;height:360px;border:none;border-radius:6px;';
    stage.appendChild(iframe);
  });

  try {
    if (window.pdfjsLib && typeof window.pdfjsLib.getDocument === 'function') {
      const task = window.pdfjsLib.getDocument({ file: blob, title: fileRecord.name });
      pdfDoc = await task.promise;
      numPages = pdfDoc.numPages || 1;
      await renderCurrentPage();
    } else {
      pageIndicator.textContent = 'PDF Ready';
    }
  } catch (err) {
    stage.innerHTML = `<div style="padding:24px;text-align:center;color:var(--status-danger);">📕 Invalid or damaged PDF file (${err.message}).</div>`;
  }
}
