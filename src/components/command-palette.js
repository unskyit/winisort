import { createModalShell } from './modal.js';
import { filterDestinationsByQuery } from '../sorting/search.js';
import { formatBytes } from '../utils/formatters.js';

/**
 * Global Command Palette & Searchable Destination Picker (Ctrl/Cmd + K).
 * Makes it effortless to sort into any destination (including overflow/hidden destinations) or trigger app commands.
 */
export function renderCommandPaletteModal(store, actions) {
  const body = document.createElement('div');
  body.style.cssText = 'display:flex;flex-direction:column;gap:12px;';

  const input = document.createElement('input');
  input.type = 'search';
  input.placeholder = 'Type a destination folder name to sort active file, or search commands...';
  input.style.cssText = 'width:100%;height:38px;padding:0 12px;border-radius:8px;border:2px solid var(--accent-main);background:var(--surface-secondary);font-size:13.5px;';

  const listWrap = document.createElement('div');
  listWrap.style.cssText = 'display:flex;flex-direction:column;gap:6px;max-height:340px;overflow-y:auto;';

  function renderList(query = '') {
    listWrap.innerHTML = '';
    const matchingDests = filterDestinationsByQuery(store.destinations.values(), query);

    for (const dest of matchingDests) {
      const row = document.createElement('button');
      row.className = 'ws-btn';
      row.style.cssText = 'justify-content:space-between;height:38px;padding:0 12px;width:100%;';
      row.innerHTML = `
        <span style="display:flex;align-items:center;gap:8px;">
          <span>${dest.emoji}</span>
          <strong></strong>
          <span class="ws-badge">${dest.bank.toUpperCase()}</span>
        </span>
        <span style="font-size:11.5px;color:var(--text-secondary);">Sort here (${dest.stats.fileCount} files • ${formatBytes(dest.stats.totalBytes)})</span>
      `;
      row.querySelector('strong').textContent = dest.name;
      row.addEventListener('click', () => {
        actions.onCloseModal?.();
        actions.onSortActiveIntoDestination?.(dest.id);
      });
      listWrap.appendChild(row);
    }

    const commands = [
      { label: '➕ Create New Destination Folder', run: () => actions.onOpenNewDestination?.('left') },
      { label: '🎯 Open Media Category & Extension Filters', run: () => actions.onOpenFilters?.() },
      { label: '⚡ Open Smart Sorting Rules & Suggestions', run: () => actions.onOpenRules?.() },
      { label: '📊 Open Storage & Duplicate Statistics', run: () => actions.onOpenStats?.() },
      { label: '💾 Save Project Manifest (.winisort)', run: () => actions.onSaveProject?.() },
      { label: '🗜️ Export Sorted Files as ZIP Archive', run: () => actions.onExportSortedZip?.() }
    ];

    for (const cmd of commands) {
      if (query && !cmd.label.toLowerCase().includes(query.toLowerCase())) continue;
      const btn = document.createElement('button');
      btn.className = 'ws-btn';
      btn.style.cssText = 'justify-content:flex-start;height:34px;padding:0 12px;width:100%;';
      btn.textContent = cmd.label;
      btn.addEventListener('click', () => {
        actions.onCloseModal?.();
        cmd.run();
      });
      listWrap.appendChild(btn);
    }
  }

  input.addEventListener('input', () => renderList(input.value));
  renderList('');

  body.append(input, listWrap);
  setTimeout(() => input.focus(), 30);

  return createModalShell({
    title: '⌘ Command Palette & Destination Picker',
    maxWidth: '580px',
    onClose: () => actions.onCloseModal?.(),
    bodyEl: body,
    footerButtons: [{ label: 'Close (Esc)', onClick: () => actions.onCloseModal?.() }]
  });
}
