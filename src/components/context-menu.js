export class ContextMenuManager {
  constructor() {
    this.activeMenu = null;
    if (typeof window !== 'undefined') {
      window.addEventListener('click', () => this.close());
    }
  }

  open(x, y, items = []) {
    this.close();
    if (typeof document === 'undefined' || items.length === 0) return;

    const menu = document.createElement('div');
    menu.className = 'ws-context-menu';
    menu.setAttribute('role', 'menu');

    for (const item of items) {
      if (item.divider) {
        const hr = document.createElement('div');
        hr.style.cssText = 'height:1px;background:var(--border-hairline);margin:4px 0;';
        menu.appendChild(hr);
        continue;
      }
      const btn = document.createElement('button');
      btn.className = 'ws-context-item';
      btn.setAttribute('role', 'menuitem');

      const labelSpan = document.createElement('span');
      labelSpan.textContent = item.label;

      const kbdSpan = document.createElement('span');
      kbdSpan.style.cssText = 'font-size:11px;color:var(--text-secondary);';
      kbdSpan.textContent = item.shortcut || '';

      btn.append(labelSpan, kbdSpan);
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.close();
        item.onClick?.();
      });
      menu.appendChild(btn);
    }

    document.body.appendChild(menu);
    const rect = menu.getBoundingClientRect();
    const safeX = Math.min(x, window.innerWidth - rect.width - 12);
    const safeY = Math.min(y, window.innerHeight - rect.height - 12);
    menu.style.left = `${Math.max(8, safeX)}px`;
    menu.style.top = `${Math.max(8, safeY)}px`;
    this.activeMenu = menu;
  }

  close() {
    if (this.activeMenu && this.activeMenu.parentNode) {
      this.activeMenu.parentNode.removeChild(this.activeMenu);
    }
    this.activeMenu = null;
  }
}
