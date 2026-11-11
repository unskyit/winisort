import { formatBytes } from '../utils/formatters.js';

/**
 * Creates a single polished Folder Destination Card element:
 * e.g. Diwali 🪔 — 42 files — 186 MB
 */
export function createDestinationCardElement(dest, store, actions) {
  const card = document.createElement('div');
  card.className = `ws-dest-card ${store.preferences.compactCards ? 'is-compact' : ''}`.trim();
  card.setAttribute('data-destination-id', dest.id);
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');
  card.style.setProperty('--dest-color', dest.color || '#5286DB');

  const sizeText = formatBytes(dest.stats.totalBytes, { mode: store.preferences.unitSystem });
  const fileWord = dest.stats.fileCount === 1 ? 'file' : 'files';
  card.title = `${dest.name} (${dest.bank.toUpperCase()} bank) — ${dest.stats.fileCount} ${fileWord} — ${sizeText}${dest.stats.lastAddedName ? ` • Last added: ${dest.stats.lastAddedName}` : ''}`;

  const left = document.createElement('div');
  left.className = 'ws-dest-left';

  const emojiBox = document.createElement('div');
  emojiBox.className = 'ws-dest-emoji';
  emojiBox.textContent = dest.emoji || '📁';

  const info = document.createElement('div');
  info.className = 'ws-dest-info';

  const nameRow = document.createElement('div');
  nameRow.className = 'ws-dest-name-row';

  const nameEl = document.createElement('span');
  nameEl.className = 'ws-dest-name';
  nameEl.textContent = dest.name;
  nameRow.appendChild(nameEl);

  if (dest.pinned) {
    const pinIcon = document.createElement('span');
    pinIcon.style.fontSize = '10px';
    pinIcon.textContent = '📌';
    pinIcon.title = 'Pinned destination';
    nameRow.appendChild(pinIcon);
  }

  const metaEl = document.createElement('div');
  metaEl.className = 'ws-dest-meta';
  metaEl.textContent = `${dest.stats.fileCount} ${fileWord} — ${sizeText}`;

  info.append(nameRow, metaEl);
  left.append(emojiBox, info);

  const right = document.createElement('div');
  right.className = 'ws-dest-right';

  if (dest.shortcut) {
    const kbd = document.createElement('span');
    kbd.className = 'ws-dest-shortcut';
    kbd.textContent = dest.shortcut;
    kbd.title = `Press ${dest.shortcut} to quick-sort active file here`;
    right.appendChild(kbd);
  }

  const optBtn = document.createElement('button');
  optBtn.className = 'ws-dest-action-btn';
  optBtn.textContent = '⚙️';
  optBtn.title = `Destination settings & Image Optimization for "${dest.name}"`;
  optBtn.setAttribute('aria-label', `Settings for ${dest.name}`);
  optBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    actions.onOpenDestinationSettings?.(dest.id, e);
  });

  right.appendChild(optBtn);
  card.append(left, right);

  // Clicking or pressing Enter on a destination card sorts the currently active/selected file(s) into it
  card.addEventListener('click', () => {
    actions.onSortActiveIntoDestination?.(dest.id);
  });

  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      actions.onSortActiveIntoDestination?.(dest.id);
    }
  });

  card.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    actions.onDestinationContextMenu?.(dest.id, e.clientX, e.clientY);
  });

  return card;
}
