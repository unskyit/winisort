import { createModalShell } from './modal.js';
import { formatBytes } from '../utils/formatters.js';

/**
 * Storage Management, Live Folder Statistics, Duplicate Detection & Session Speed Modal.
 */
export function renderStatisticsModal(store, duplicateDetector, actions) {
  const body = document.createElement('div');
  body.style.cssText = 'display:flex;flex-direction:column;gap:16px;';

  const unitMode = store.preferences.unitSystem;
  const elapsedMin = Math.max(0.1, (Date.now() - store.ui.sessionStartedAt) / 60000);
  const speedPerMin = (store.stats.sortedCount / elapsedMin).toFixed(1);
  const pct = store.stats.totalFiles > 0
    ? Math.round((store.stats.sortedCount / store.stats.totalFiles) * 100)
    : 0;

  // KPI Grid
  const kpiGrid = document.createElement('div');
  kpiGrid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;';
  const kpis = [
    { label: 'Total Eligible Files', value: `${store.stats.totalFiles} (${formatBytes(store.stats.totalEligibleBytes, { mode: unitMode })})` },
    { label: 'Sorted Completion', value: `${store.stats.sortedCount} (${pct}%)` },
    { label: 'Remaining Unsorted', value: `${store.stats.unsortedCount}` },
    { label: 'Verified Bytes Copied', value: formatBytes(store.stats.completedCopyBytes, { mode: unitMode }) },
    { label: 'Sorting Speed', value: `${speedPerMin} files/min` },
    { label: 'Compression Saved', value: formatBytes(store.stats.compressionSavedBytes, { mode: unitMode }) }
  ];

  for (const k of kpis) {
    const card = document.createElement('div');
    card.style.cssText = 'padding:10px 12px;border-radius:10px;background:var(--surface-secondary);border:1px solid var(--border-hairline);';
    card.innerHTML = `
      <div style="font-size:11px;color:var(--text-secondary);">${k.label}</div>
      <div style="font-size:15px;font-weight:700;margin-top:3px;">${k.value}</div>
    `;
    kpiGrid.appendChild(card);
  }

  // Destination Breakdown Table
  const destSection = document.createElement('div');
  destSection.innerHTML = `<h3 style="font-size:13.5px;font-weight:700;margin-bottom:8px;">Folder Destinations Breakdown</h3>`;

  const table = document.createElement('table');
  table.style.cssText = 'width:100%;border-collapse:collapse;font-size:12px;';
  table.innerHTML = `
    <thead>
      <tr style="border-bottom:1px solid var(--border-strong);text-align:left;color:var(--text-secondary);">
        <th style="padding:6px;">Destination</th>
        <th style="padding:6px;">Bank</th>
        <th style="padding:6px;">Files</th>
        <th style="padding:6px;">Total Size</th>
        <th style="padding:6px;">Type Breakdown</th>
        <th style="padding:6px;">Status</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  const tbody = table.querySelector('tbody');

  for (const d of store.destinations.values()) {
    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid var(--border-hairline)';
    const s = d.stats;
    tr.innerHTML = `
      <td style="padding:7px 6px;font-weight:600;">${d.emoji} <span class="d-name"></span></td>
      <td style="padding:7px 6px;text-transform:uppercase;">${d.bank}</td>
      <td style="padding:7px 6px;">${s.fileCount}</td>
      <td style="padding:7px 6px;">${formatBytes(s.totalBytes, { mode: unitMode })}</td>
      <td style="padding:7px 6px;color:var(--text-secondary);">🖼️${s.imagesCount} 🎬${s.videosCount} 🎵${s.audioCount} 📕${s.pdfCount} 📄${s.documentsCount}</td>
      <td style="padding:7px 6px;">${s.verifiedFromDisk ? '✅ Disk Verified' : '📦 Session Staged'}</td>
    `;
    tr.querySelector('.d-name').textContent = d.name;
    tbody.appendChild(tr);
  }
  destSection.appendChild(table);

  // Duplicate Candidate Review Section
  const dupSection = document.createElement('div');
  dupSection.style.cssText = 'padding:12px;border-radius:10px;background:var(--surface-secondary);border:1px solid var(--border-hairline);display:flex;flex-direction:column;gap:8px;';
  const candidateGroups = duplicateDetector.findCandidateGroups();

  dupSection.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;">
      <div>
        <strong style="font-size:13px;">🔍 Duplicate Candidate Detector</strong>
        <div style="font-size:11.5px;color:var(--text-secondary);">${candidateGroups.length} size-matched candidate group(s) detected. Originals are never automatically deleted.</div>
      </div>
      <button id="btn-verify-hashes" class="ws-btn ws-btn-primary">Verify Exact Content Hashes</button>
    </div>
    <div id="dup-results-list" style="font-size:12px;display:flex;flex-direction:column;gap:6px;max-height:160px;overflow:auto;"></div>
  `;

  const dupListEl = dupSection.querySelector('#dup-results-list');
  const renderDupGroups = (groups, isVerified = false) => {
    dupListEl.innerHTML = '';
    if (groups.length === 0) {
      dupListEl.textContent = 'No duplicate candidates found in active pool.';
      return;
    }
    for (const g of groups.slice(0, 15)) {
      const item = document.createElement('div');
      item.style.cssText = 'padding:6px 8px;border-radius:6px;background:var(--surface-primary);border:1px solid var(--border-hairline);';
      const names = g.files.map(f => f.name).join('  •  ');
      item.textContent = `${isVerified ? `[Verified Hash ${g.hash}]` : '[Same Size]'}: ${formatBytes(g.size)} — ${names}`;
      dupListEl.appendChild(item);
    }
  };
  renderDupGroups(candidateGroups, false);

  dupSection.querySelector('#btn-verify-hashes').addEventListener('click', async (e) => {
    e.target.disabled = true;
    e.target.textContent = 'Hashing chunks...';
    const exact = await duplicateDetector.verifyExactDuplicates();
    renderDupGroups(exact, true);
    e.target.textContent = `Verified (${exact.length} exact match groups)`;
  });

  body.append(kpiGrid, destSection, dupSection);

  return createModalShell({
    title: '📊 Storage Analytics, Folder Counters & Duplicate Review',
    onClose: () => actions.onCloseModal?.(),
    bodyEl: body,
    footerButtons: [
      { label: 'Export Sorted ZIP', onClick: () => actions.onExportSortedZip?.() },
      { label: 'Done', primary: true, onClick: () => actions.onCloseModal?.() }
    ]
  });
}
