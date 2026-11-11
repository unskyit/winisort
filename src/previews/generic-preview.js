import { formatBytes, formatDate } from '../utils/formatters.js';

/**
 * Renders safe text/CSV snippet previews (up to first 8 KB) or structured file information cards for Office/Archive/Other files.
 * Never executes embedded macros or scripts.
 */
export async function renderGenericOrTextPreview(container, fileRecord, blob) {
  container.innerHTML = '';

  const card = document.createElement('div');
  card.style.cssText = 'width:min(580px, 90vw);padding:20px;border-radius:14px;background:var(--surface-secondary);border:1px solid var(--border-strong);display:flex;flex-direction:column;gap:12px;';

  const topRow = document.createElement('div');
  topRow.style.cssText = 'display:flex;align-items:center;gap:12px;';

  const iconEl = document.createElement('div');
  iconEl.className = 'ws-dest-emoji';
  iconEl.style.cssText = 'width:46px;height:46px;font-size:24px;';
  iconEl.textContent = fileRecord.emoji || '📄';

  const infoCol = document.createElement('div');
  infoCol.style.cssText = 'min-width:0;flex:1;';
  const titleEl = document.createElement('div');
  titleEl.style.cssText = 'font-weight:700;font-size:15px;word-break:break-all;';
  titleEl.textContent = fileRecord.name;

  const metaEl = document.createElement('div');
  metaEl.style.cssText = 'font-size:12px;color:var(--text-secondary);';
  metaEl.textContent = `${(fileRecord.extension || 'FILE').toUpperCase()} • ${formatBytes(fileRecord.size)} • Modified ${formatDate(fileRecord.lastModified)}`;

  infoCol.append(titleEl, metaEl);
  topRow.append(iconEl, infoCol);
  card.appendChild(topRow);

  if (fileRecord.previewKind === 'text' && blob && blob.size > 0) {
    try {
      const slice = blob.slice(0, Math.min(blob.size, 6144));
      const text = await slice.text();
      const pre = document.createElement('pre');
      pre.style.cssText = 'max-height:220px;overflow:auto;padding:12px;border-radius:8px;background:var(--surface-primary);border:1px solid var(--border-hairline);font-family:var(--font-mono);font-size:11.5px;white-space:pre-wrap;word-break:break-word;user-select:text;';
      pre.textContent = text + (blob.size > 6144 ? '\n\n… [Preview truncated safely at 6 KB]' : '');
      card.appendChild(pre);
    } catch (_) {}
  } else {
    const note = document.createElement('div');
    note.style.cssText = 'font-size:12.5px;color:var(--text-secondary);padding:10px 12px;background:var(--surface-primary);border-radius:8px;border:1px solid var(--border-hairline);';
    note.textContent = `Safe metadata preview for ${fileRecord.category} format (.${fileRecord.extension || 'bin'}). Active scripts and macros are never executed. Drag this card or press 1–9 to sort into any destination folder.`;
    card.appendChild(note);
  }

  container.appendChild(card);
}
