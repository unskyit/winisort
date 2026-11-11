import { formatBytes } from '../utils/formatters.js';

/**
 * Renders an honest scanning / operation progress bar.
 * Never fabricates an exact percentage during initial directory discovery.
 */
export function renderScanProgressBanner(container, store, actions) {
  if (!container) return;
  container.innerHTML = '';

  const prog = store.ui.scanProgress;
  if (!store.ui.isScanning) return;

  const bar = document.createElement('div');
  bar.className = 'ws-compat-banner';
  bar.style.background = 'var(--surface-secondary)';

  const text = document.createElement('div');
  text.innerHTML = `
    <strong>Scanning source:</strong> <span class="scan-folder"></span> •
    <strong>${prog.foldersDiscovered}</strong> folders •
    <strong>${prog.filesScanned}</strong> scanned •
    <strong>${prog.eligibleFiles}</strong> eligible (${formatBytes(prog.totalEligibleBytes, { mode: store.preferences.unitSystem })}) •
    <strong>${prog.ignoredFiles}</strong> filtered
  `;
  text.querySelector('.scan-folder').textContent = prog.currentFolder || 'Root';

  const btnGroup = document.createElement('div');
  btnGroup.style.cssText = 'display:flex;gap:6px;';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'ws-btn ws-btn-danger';
  cancelBtn.textContent = 'Cancel Scan';
  cancelBtn.addEventListener('click', () => actions.onCancelScan?.());

  btnGroup.appendChild(cancelBtn);
  bar.append(text, btnGroup);
  container.appendChild(bar);
}
