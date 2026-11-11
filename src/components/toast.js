export class ToastManager {
  constructor(regionEl) {
    this.regionEl = regionEl;
  }

  /**
   * Displays an unobtrusive accessible toast notification with optional action button (e.g. Undo).
   * @param {string} message
   * @param {{ type?: 'info' | 'success' | 'warning' | 'danger', actionLabel?: string, onAction?: () => void, durationMs?: number }} [options]
   */
  show(message, options = {}) {
    if (!this.regionEl) return;
    const toast = document.createElement('div');
    toast.className = 'ws-toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');

    const type = options.type || 'info';
    const iconMap = {
      info: 'ℹ️',
      success: '✅',
      warning: '⚠️',
      danger: '🛑'
    };

    const iconSpan = document.createElement('span');
    iconSpan.textContent = iconMap[type] || 'ℹ️';

    const textSpan = document.createElement('span');
    textSpan.style.flex = '1';
    textSpan.textContent = message;

    toast.append(iconSpan, textSpan);

    if (options.actionLabel && typeof options.onAction === 'function') {
      const btn = document.createElement('button');
      btn.className = 'ws-btn ws-btn-primary';
      btn.style.height = '26px';
      btn.style.padding = '0 9px';
      btn.style.fontSize = '11.5px';
      btn.textContent = options.actionLabel;
      btn.addEventListener('click', () => {
        options.onAction();
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      });
      toast.appendChild(btn);
    }

    const closeBtn = document.createElement('button');
    closeBtn.className = 'ws-dest-action-btn';
    closeBtn.textContent = '✕';
    closeBtn.setAttribute('aria-label', 'Dismiss notification');
    closeBtn.addEventListener('click', () => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    });
    toast.appendChild(closeBtn);

    this.regionEl.appendChild(toast);

    const ttl = options.durationMs ?? 3800;
    if (ttl > 0) {
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, ttl);
    }
  }
}
