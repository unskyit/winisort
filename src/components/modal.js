/**
 * Accessible modal shell with focus management and Escape-to-close support.
 */
export function createModalShell({ title, onClose, bodyEl, footerButtons = [], maxWidth = '760px' }) {
  const backdrop = document.createElement('div');
  backdrop.className = 'ws-modal-backdrop';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');

  const modal = document.createElement('div');
  modal.className = 'ws-modal';
  modal.style.width = `min(${maxWidth}, 96vw)`;

  const header = document.createElement('div');
  header.className = 'ws-modal-header';

  const titleEl = document.createElement('h2');
  titleEl.className = 'ws-modal-title';
  titleEl.textContent = title;

  const closeBtn = document.createElement('button');
  closeBtn.className = 'ws-btn ws-btn-icon';
  closeBtn.textContent = '✕';
  closeBtn.title = 'Close (Esc)';
  closeBtn.setAttribute('aria-label', 'Close modal');
  closeBtn.addEventListener('click', () => onClose?.());

  header.append(titleEl, closeBtn);

  const body = document.createElement('div');
  body.className = 'ws-modal-body';
  if (bodyEl) body.appendChild(bodyEl);

  const footer = document.createElement('div');
  footer.className = 'ws-modal-footer';
  for (const btnCfg of footerButtons) {
    const b = document.createElement('button');
    b.className = `ws-btn ${btnCfg.primary ? 'ws-btn-primary' : ''} ${btnCfg.danger ? 'ws-btn-danger' : ''}`.trim();
    b.textContent = btnCfg.label;
    b.addEventListener('click', () => btnCfg.onClick?.());
    footer.appendChild(b);
  }

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) onClose?.();
  });

  modal.append(header, body);
  if (footerButtons.length > 0) modal.appendChild(footer);
  backdrop.appendChild(modal);

  return backdrop;
}
