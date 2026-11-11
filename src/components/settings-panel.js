import { createModalShell } from './modal.js';
import { createDefaultPreferences } from '../core/configuration.js';

/**
 * Searchable 8-group Settings Dialog covering Appearance, Media & Scanning, File Operations,
 * Destination Layout, Backup & Recovery, Optimization, Privacy, and Advanced Diagnostics.
 */
export function renderSettingsModal(store, actions) {
  const body = document.createElement('div');
  body.style.cssText = 'display:flex;flex-direction:column;gap:14px;';

  const searchBar = document.createElement('input');
  searchBar.type = 'search';
  searchBar.placeholder = 'Filter settings (e.g. theme, collision, move, backup, privacy)...';
  searchBar.style.cssText = 'width:100%;height:34px;padding:0 12px;border-radius:8px;border:1px solid var(--border-strong);background:var(--surface-secondary);';

  const sectionsWrap = document.createElement('div');
  sectionsWrap.style.cssText = 'display:flex;flex-direction:column;gap:14px;';

  const p = store.preferences;

  const groups = [
    {
      title: '1. Appearance & Interface Density',
      keywords: 'theme dark light amoled density compact motion transparency',
      render() {
        const div = document.createElement('div');
        div.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px;';
        div.innerHTML = `
          <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;">
            <span>Color Theme</span>
            <select id="pref-theme" class="ws-btn" style="justify-content:space-between;">
              <option value="system" ${p.theme === 'system' ? 'selected' : ''}>Follow System</option>
              <option value="light" ${p.theme === 'light' ? 'selected' : ''}>Light (#F6F8FC)</option>
              <option value="dark" ${p.theme === 'dark' ? 'selected' : ''}>Dark — AMOLED (#050608)</option>
            </select>
          </label>
          <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;">
            <span>Interface Density</span>
            <select id="pref-density" class="ws-btn">
              <option value="compact" ${p.density === 'compact' ? 'selected' : ''}>Compact</option>
              <option value="comfortable" ${p.density === 'comfortable' ? 'selected' : ''}>Comfortable</option>
              <option value="spacious" ${p.density === 'spacious' ? 'selected' : ''}>Spacious</option>
            </select>
          </label>
          <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;">
            <span>Motion Level</span>
            <select id="pref-motion" class="ws-btn">
              <option value="full" ${p.motionLevel === 'full' ? 'selected' : ''}>Full Smooth Motion</option>
              <option value="reduced" ${p.motionLevel === 'reduced' ? 'selected' : ''}>Reduced Motion</option>
            </select>
          </label>
          <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;">
            <span>Transparency Level</span>
            <select id="pref-transparency" class="ws-btn">
              <option value="normal" ${p.transparencyLevel === 'normal' ? 'selected' : ''}>Standard Glass Depth</option>
              <option value="reduced" ${p.transparencyLevel === 'reduced' ? 'selected' : ''}>Opaque Surfaces</option>
            </select>
          </label>
        `;
        return div;
      }
    },
    {
      title: '2. File Operations, Collision Policy & Source Safety',
      keywords: 'copy move collision overwrite rename dry run verify integrity source',
      render() {
        const div = document.createElement('div');
        div.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;';
        div.innerHTML = `
          <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;">
            <span>Default Operation Mode</span>
            <select id="pref-op-mode" class="ws-btn">
              <option value="copy" ${p.operationMode === 'copy' ? 'selected' : ''}>Safe COPY (Default — Preserves Originals)</option>
              <option value="move" ${p.operationMode === 'move' ? 'selected' : ''}>Advanced MOVE (Copy + Verify + Remove Source)</option>
            </select>
          </label>
          <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;">
            <span>Filename Collision Policy</span>
            <select id="pref-collision" class="ws-btn">
              <option value="keep-both" ${p.collisionPolicy === 'keep-both' ? 'selected' : ''}>Keep Both Safely (Name (1).ext)</option>
              <option value="auto-rename" ${p.collisionPolicy === 'auto-rename' ? 'selected' : ''}>Auto-Rename (Name_1.ext)</option>
              <option value="skip" ${p.collisionPolicy === 'skip' ? 'selected' : ''}>Skip Existing File</option>
              <option value="replace" ${p.collisionPolicy === 'replace' ? 'selected' : ''}>Replace Destination File</option>
            </select>
          </label>
          <label style="display:flex;align-items:center;gap:8px;font-size:12px;padding-top:16px;">
            <input type="checkbox" id="pref-verify" ${p.verifyCopyIntegrity ? 'checked' : ''} />
            <span>Verify file size & stream digest after copy</span>
          </label>
          <label style="display:flex;align-items:center;gap:8px;font-size:12px;padding-top:16px;">
            <input type="checkbox" id="pref-dryrun" ${p.dryRunMode ? 'checked' : ''} />
            <span>Dry-Run Mode (Simulate sorting without writing bytes)</span>
          </label>
          <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--status-danger);grid-column:1/-1;">
            <input type="checkbox" id="pref-allow-source-mod" ${p.allowSourceModification ? 'checked' : ''} />
            <span>⚠️ Authorize source deletion when Advanced MOVE mode is enabled (Disabled by default for safety)</span>
          </label>
        `;
        return div;
      }
    },
    {
      title: '3. Destination Layout & Capacity',
      keywords: 'bank placement compact cards max visible',
      render() {
        const div = document.createElement('div');
        div.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px;';
        div.innerHTML = `
          <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;">
            <span>Default New Destination Bank</span>
            <select id="pref-default-bank" class="ws-btn">
              <option value="left" ${p.defaultBankPlacement === 'left' ? 'selected' : ''}>Left Bank</option>
              <option value="top" ${p.defaultBankPlacement === 'top' ? 'selected' : ''}>Top Bank</option>
              <option value="right" ${p.defaultBankPlacement === 'right' ? 'selected' : ''}>Right Bank</option>
              <option value="bottom" ${p.defaultBankPlacement === 'bottom' ? 'selected' : ''}>Bottom Bank</option>
            </select>
          </label>
          <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;">
            <span>Max Visible Cards Per Bank</span>
            <input type="number" id="pref-max-cards" class="ws-btn" min="3" max="15" value="${p.maxVisibleCardsPerBank || 6}" />
          </label>
          <label style="display:flex;align-items:center;gap:8px;font-size:12px;padding-top:16px;">
            <input type="checkbox" id="pref-compact-cards" ${p.compactCards ? 'checked' : ''} />
            <span>Use Compact Destination Cards</span>
          </label>
          <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;">
            <span>Size Display Units</span>
            <select id="pref-units" class="ws-btn">
              <option value="SI" ${p.unitSystem === 'SI' ? 'selected' : ''}>SI Decimal (MB, GB)</option>
              <option value="IEC" ${p.unitSystem === 'IEC' ? 'selected' : ''}>IEC Binary (MiB, GiB)</option>
            </select>
          </label>
        `;
        return div;
      }
    },
    {
      title: '4. Project Save, Backup & Crash Recovery (.winisort/)',
      keywords: 'save export import project json journal recovery checkpoint',
      render() {
        const div = document.createElement('div');
        div.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;align-items:center;';

        const saveBtn = document.createElement('button');
        saveBtn.className = 'ws-btn ws-btn-primary';
        saveBtn.textContent = '💾 Save Project (.winisort)';
        saveBtn.addEventListener('click', () => actions.onSaveProject?.());

        const exportBtn = document.createElement('button');
        exportBtn.className = 'ws-btn';
        exportBtn.textContent = '📤 Export Portable Project JSON';
        exportBtn.addEventListener('click', () => actions.onExportProjectJson?.());

        const importBtn = document.createElement('button');
        importBtn.className = 'ws-btn';
        importBtn.textContent = '📥 Import Project JSON';
        importBtn.addEventListener('click', () => actions.onImportProjectJson?.());

        const zipBtn = document.createElement('button');
        zipBtn.className = 'ws-btn';
        zipBtn.textContent = '🗜️ Export Sorted Files as ZIP Archive';
        zipBtn.addEventListener('click', () => actions.onExportSortedZip?.());

        div.append(saveBtn, exportBtn, importBtn, zipBtn);
        return div;
      }
    },
    {
      title: '5. Privacy, Permissions & Diagnostics',
      keywords: 'privacy local offline permissions capabilities reset diagnostics',
      render() {
        const div = document.createElement('div');
        div.style.cssText = 'display:flex;flex-direction:column;gap:8px;font-size:12px;color:var(--text-secondary);';
        const cap = store.capabilities;
        div.innerHTML = `
          <div>🔒 <strong>100% Local-First Processing:</strong> Zero servers, zero telemetry, zero cloud uploads. Personal media is never stored in IndexedDB or Service Worker caches.</div>
          <div>🧭 <strong>Filesystem Mode:</strong> ${cap.filesystemMode} • Directory Picker: ${cap.hasDirectoryPicker ? 'Supported' : 'Fallback Mode'} • Workers: ${cap.hasWebWorkers ? 'Active' : 'Fallback'} • Concurrency Budget: ${cap.budgets.maxConcurrentCopies} stream(s)</div>
        `;
        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-top:4px;';

        const disconnectBtn = document.createElement('button');
        disconnectBtn.className = 'ws-btn';
        disconnectBtn.textContent = '🔌 Disconnect Output Directory';
        disconnectBtn.addEventListener('click', () => {
          store.project.outputRootHandle = null;
          store.project.outputRootName = null;
          store.notify('destinations');
          actions.onCloseModal?.();
        });

        const resetBtn = document.createElement('button');
        resetBtn.className = 'ws-btn ws-btn-danger';
        resetBtn.textContent = '↺ Reset Preferences to Default';
        resetBtn.addEventListener('click', () => {
          store.preferences = createDefaultPreferences();
          actions.onApplyThemeAndDensity?.();
          actions.onCloseModal?.();
        });

        btnRow.append(disconnectBtn, resetBtn);
        div.appendChild(btnRow);
        return div;
      }
    }
  ];

  function renderFilteredGroups(q = '') {
    sectionsWrap.innerHTML = '';
    const query = q.trim().toLowerCase();
    for (const g of groups) {
      if (query && !g.title.toLowerCase().includes(query) && !g.keywords.includes(query)) {
        continue;
      }
      const box = document.createElement('div');
      box.style.cssText = 'padding:12px 14px;border-radius:10px;background:var(--surface-secondary);border:1px solid var(--border-hairline);display:flex;flex-direction:column;gap:10px;';
      const h3 = document.createElement('h3');
      h3.style.cssText = 'font-size:13px;font-weight:700;color:var(--text-primary);';
      h3.textContent = g.title;
      box.append(h3, g.render());
      sectionsWrap.appendChild(box);
    }
  }

  searchBar.addEventListener('input', () => renderFilteredGroups(searchBar.value));
  renderFilteredGroups('');

  body.append(searchBar, sectionsWrap);

  return createModalShell({
    title: '⚙️ WiniSort Settings & Preferences',
    onClose: () => actions.onCloseModal?.(),
    bodyEl: body,
    footerButtons: [
      {
        label: 'Cancel',
        onClick: () => actions.onCloseModal?.()
      },
      {
        label: 'Apply & Save Settings',
        primary: true,
        onClick: () => {
          const val = (id) => body.querySelector(`#${id}`)?.value;
          const chk = (id) => Boolean(body.querySelector(`#${id}`)?.checked);

          if (val('pref-theme')) p.theme = val('pref-theme');
          if (val('pref-density')) p.density = val('pref-density');
          if (val('pref-motion')) p.motionLevel = val('pref-motion');
          if (val('pref-transparency')) p.transparencyLevel = val('pref-transparency');
          if (val('pref-op-mode')) p.operationMode = val('pref-op-mode');
          if (val('pref-collision')) p.collisionPolicy = val('pref-collision');
          if (val('pref-default-bank')) p.defaultBankPlacement = val('pref-default-bank');
          if (val('pref-units')) p.unitSystem = val('pref-units');
          if (val('pref-max-cards')) p.maxVisibleCardsPerBank = Math.max(3, parseInt(val('pref-max-cards'), 10) || 6);

          if (body.querySelector('#pref-verify')) p.verifyCopyIntegrity = chk('pref-verify');
          if (body.querySelector('#pref-dryrun')) p.dryRunMode = chk('pref-dryrun');
          if (body.querySelector('#pref-allow-source-mod')) p.allowSourceModification = chk('pref-allow-source-mod');
          if (body.querySelector('#pref-compact-cards')) p.compactCards = chk('pref-compact-cards');

          actions.onApplyThemeAndDensity?.();
          actions.onCloseModal?.();
        }
      }
    ]
  });
}
