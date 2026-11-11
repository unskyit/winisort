import { createModalShell } from './modal.js';
import { MEDIA_CATEGORIES, DESTINATION_PALETTE } from '../core/configuration.js';
import { formatBytes } from '../utils/formatters.js';
import { generateCompressionSamplePreview } from '../optimization/compression-preview.js';

/**
 * 1. Media Selection & Filtering Panel ("What would you like to organize?")
 */
export function renderMediaFilterModal(store, actions) {
  const f = store.filters;
  const body = document.createElement('div');
  body.style.cssText = 'display:flex;flex-direction:column;gap:14px;';

  const topActions = document.createElement('div');
  topActions.style.cssText = 'display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;';
  topActions.innerHTML = `
    <div style="font-size:13px;color:var(--text-secondary);">Strictly enforce eligible categories and file extensions during scanning.</div>
    <div style="display:flex;gap:6px;">
      <button id="btn-filter-select-all" class="ws-btn">Select All</button>
      <button id="btn-filter-clear-all" class="ws-btn">Clear All</button>
    </div>
  `;

  const catGrid = document.createElement('div');
  catGrid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:8px;';

  const selectedExts = new Set((f.extensions || []).map(e => e.toLowerCase()));

  function renderCategoryCards() {
    catGrid.innerHTML = '';
    for (const [catId, cat] of Object.entries(MEDIA_CATEGORIES)) {
      const card = document.createElement('div');
      card.style.cssText = 'padding:10px;border-radius:10px;background:var(--surface-secondary);border:1px solid var(--border-hairline);display:flex;flex-direction:column;gap:6px;';

      const label = document.createElement('label');
      label.style.cssText = 'display:flex;align-items:center;gap:8px;font-weight:700;font-size:13px;cursor:pointer;';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = Boolean(f.categories[catId]);
      cb.addEventListener('change', () => {
        f.categories[catId] = cb.checked;
        for (const ext of cat.extensions) {
          if (cb.checked) selectedExts.add(ext);
          else selectedExts.delete(ext);
        }
        renderCategoryCards();
      });
      label.append(cb, document.createTextNode(`${cat.emoji} ${cat.label}`));
      card.appendChild(label);

      if (cat.extensions.length > 0) {
        const extWrap = document.createElement('div');
        extWrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;';
        for (const ext of cat.extensions) {
          const pill = document.createElement('button');
          const active = selectedExts.has(ext) && f.categories[catId];
          pill.className = `ws-badge ${active ? 'ws-badge-accent' : ''}`;
          pill.style.cursor = 'pointer';
          pill.textContent = `.${ext}`;
          pill.addEventListener('click', () => {
            if (selectedExts.has(ext)) selectedExts.delete(ext);
            else {
              selectedExts.add(ext);
              f.categories[catId] = true;
            }
            renderCategoryCards();
          });
          extWrap.appendChild(pill);
        }
        card.appendChild(extWrap);
      }
      catGrid.appendChild(card);
    }
  }

  topActions.querySelector('#btn-filter-select-all').addEventListener('click', () => {
    for (const [catId, cat] of Object.entries(MEDIA_CATEGORIES)) {
      f.categories[catId] = true;
      for (const ext of cat.extensions) selectedExts.add(ext);
    }
    renderCategoryCards();
  });

  topActions.querySelector('#btn-filter-clear-all').addEventListener('click', () => {
    for (const catId of Object.keys(MEDIA_CATEGORIES)) {
      f.categories[catId] = false;
    }
    selectedExts.clear();
    renderCategoryCards();
  });

  renderCategoryCards();

  // Advanced size, pattern, nested & hidden options
  const advGrid = document.createElement('div');
  advGrid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;padding:12px;border-radius:10px;background:var(--surface-secondary);border:1px solid var(--border-hairline);';
  advGrid.innerHTML = `
    <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;">
      <span>Custom Extensions (comma-separated)</span>
      <input type="text" id="flt-custom-ext" class="ws-btn" placeholder="raw, cr2, dng" value="${(f.customExtensions || []).join(', ')}" />
    </label>
    <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;">
      <span>Min File Size (KB)</span>
      <input type="number" id="flt-min-kb" class="ws-btn" min="0" value="${Math.round((f.minSizeBytes || 0) / 1000)}" />
    </label>
    <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;">
      <span>Include Filename Pattern</span>
      <input type="text" id="flt-include" class="ws-btn" placeholder="e.g. IMG_, Diwali" value="${f.includePattern || ''}" />
    </label>
    <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;">
      <span>Exclude Filename Pattern</span>
      <input type="text" id="flt-exclude" class="ws-btn" placeholder="e.g. thumb, temp" value="${f.excludePattern || ''}" />
    </label>
    <label style="display:flex;align-items:center;gap:8px;font-size:12px;">
      <input type="checkbox" id="flt-nested" ${f.includeNestedFolders !== false ? 'checked' : ''} />
      <span>Scan Nested Subfolders</span>
    </label>
    <label style="display:flex;align-items:center;gap:8px;font-size:12px;">
      <input type="checkbox" id="flt-hidden" ${f.includeHiddenFiles ? 'checked' : ''} />
      <span>Include Hidden Dotfiles</span>
    </label>
  `;

  body.append(topActions, catGrid, advGrid);

  return createModalShell({
    title: 'What would you like to organize?',
    onClose: () => actions.onCloseModal?.(),
    bodyEl: body,
    footerButtons: [
      { label: 'Cancel', onClick: () => actions.onCloseModal?.() },
      {
        label: 'Apply Media Filters',
        primary: true,
        onClick: () => {
          f.extensions = Array.from(selectedExts);
          const rawCustom = body.querySelector('#flt-custom-ext')?.value || '';
          f.customExtensions = rawCustom.split(',').map(s => s.replace(/^\./, '').trim().toLowerCase()).filter(Boolean);
          f.minSizeBytes = Math.max(0, (parseFloat(body.querySelector('#flt-min-kb')?.value) || 0) * 1000);
          f.includePattern = body.querySelector('#flt-include')?.value || '';
          f.excludePattern = body.querySelector('#flt-exclude')?.value || '';
          f.includeNestedFolders = Boolean(body.querySelector('#flt-nested')?.checked);
          f.includeHiddenFiles = Boolean(body.querySelector('#flt-hidden')?.checked);
          actions.onCloseModal?.();
        }
      }
    ]
  });
}

/**
 * 2. Create or Edit Destination Dialog
 */
export function renderDestinationDialog(store, payload, actions) {
  const existing = payload?.destinationId ? store.destinations.get(payload.destinationId) : null;
  const defaultBank = payload?.bank || store.preferences.defaultBankPlacement || 'left';

  const body = document.createElement('div');
  body.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:12px;';

  const currentColor = existing?.color || DESTINATION_PALETTE[store.destinations.size % DESTINATION_PALETTE.length].hex;

  body.innerHTML = `
    <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;grid-column:1/-1;">
      <span>Destination Folder Name</span>
      <input type="text" id="dest-name-input" class="ws-btn" style="height:36px;" placeholder="e.g. Diwali 2026, School Notes, Work" value="${existing ? existing.name : ''}" />
    </label>
    <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;">
      <span>Icon / Emoji</span>
      <input type="text" id="dest-emoji-input" class="ws-btn" value="${existing ? existing.emoji : '📁'}" />
    </label>
    <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;">
      <span>Workspace Bank Side</span>
      <select id="dest-bank-input" class="ws-btn">
        <option value="top" ${(existing?.bank || defaultBank) === 'top' ? 'selected' : ''}>Top Bank</option>
        <option value="left" ${(existing?.bank || defaultBank) === 'left' ? 'selected' : ''}>Left Bank</option>
        <option value="right" ${(existing?.bank || defaultBank) === 'right' ? 'selected' : ''}>Right Bank</option>
        <option value="bottom" ${(existing?.bank || defaultBank) === 'bottom' ? 'selected' : ''}>Bottom Bank</option>
      </select>
    </label>
    <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;">
      <span>Quick Shortcut Key (1–9)</span>
      <input type="text" id="dest-shortcut-input" class="ws-btn" maxlength="1" value="${existing ? existing.shortcut : ''}" placeholder="1-9" />
    </label>
    <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;">
      <span>Size Quota Warning (MB, 0 = none)</span>
      <input type="number" id="dest-quota-input" class="ws-btn" min="0" value="${existing?.quotaBytes ? Math.round(existing.quotaBytes / 1e6) : 0}" />
    </label>
    <div style="grid-column:1/-1;display:flex;flex-direction:column;gap:6px;">
      <span style="font-size:12px;">Curated Accent Color</span>
      <div id="dest-color-swatches" style="display:flex;gap:8px;flex-wrap:wrap;"></div>
    </div>
    <label style="display:flex;align-items:center;gap:8px;font-size:12px;grid-column:1/-1;">
      <input type="checkbox" id="dest-pinned-input" ${existing ? (existing.pinned ? 'checked' : '') : 'checked'} />
      <span>📌 Pin destination to the front of its bank</span>
    </label>
  `;

  let pickedColor = currentColor;
  const swatchesEl = body.querySelector('#dest-color-swatches');
  for (const c of DESTINATION_PALETTE) {
    const sw = document.createElement('button');
    sw.type = 'button';
    sw.style.cssText = `width:28px;height:28px;border-radius:50%;background:${c.hex};border:2px solid ${c.hex === pickedColor ? 'var(--text-primary)' : 'transparent'};`;
    sw.title = c.name;
    sw.addEventListener('click', () => {
      pickedColor = c.hex;
      Array.from(swatchesEl.children).forEach(el => { el.style.borderColor = 'transparent'; });
      sw.style.borderColor = 'var(--text-primary)';
    });
    swatchesEl.appendChild(sw);
  }

  // If editing an existing destination, also show Image Compression & Optimization launcher
  if (existing) {
    const optBar = document.createElement('div');
    optBar.style.cssText = 'grid-column:1/-1;padding:10px 12px;border-radius:8px;background:var(--surface-secondary);border:1px solid var(--border-hairline);display:flex;align-items:center;justify-content:space-between;';
    optBar.innerHTML = `
      <div>
        <strong style="font-size:12.5px;">🖼️ Folder Image Optimization</strong>
        <div style="font-size:11px;color:var(--text-secondary);">${existing.stats.imagesCount} image(s) in this destination</div>
      </div>
      <button type="button" id="btn-launch-compression" class="ws-btn ws-btn-primary">Open Image Optimizer</button>
    `;
    optBar.querySelector('#btn-launch-compression').addEventListener('click', () => {
      actions.onOpenCompressionModal?.(existing.id);
    });
    body.appendChild(optBar);
  }

  const footerButtons = [
    { label: 'Cancel', onClick: () => actions.onCloseModal?.() }
  ];

  if (existing) {
    footerButtons.push({
      label: 'Remove from Workspace',
      danger: true,
      onClick: () => {
        actions.onRemoveDestination?.(existing.id);
        actions.onCloseModal?.();
      }
    });
  }

  footerButtons.push({
    label: existing ? 'Save Changes' : 'Create Destination',
    primary: true,
    onClick: () => {
      const name = body.querySelector('#dest-name-input')?.value || '';
      const emoji = body.querySelector('#dest-emoji-input')?.value || '📁';
      const bank = body.querySelector('#dest-bank-input')?.value || 'left';
      const shortcut = body.querySelector('#dest-shortcut-input')?.value || '';
      const quotaMB = parseFloat(body.querySelector('#dest-quota-input')?.value) || 0;
      const pinned = Boolean(body.querySelector('#dest-pinned-input')?.checked);

      if (existing) {
        actions.onUpdateDestination?.(existing.id, {
          name,
          emoji,
          bank,
          shortcut,
          color: pickedColor,
          pinned,
          quotaBytes: Math.round(quotaMB * 1e6)
        });
      } else {
        actions.onCreateDestination?.({
          name,
          emoji,
          bank,
          shortcut,
          color: pickedColor,
          pinned,
          quotaBytes: Math.round(quotaMB * 1e6)
        });
      }
    }
  });

  return createModalShell({
    title: existing ? `Edit Destination: ${existing.name}` : 'Create Sorting Destination Folder',
    maxWidth: '520px',
    onClose: () => actions.onCloseModal?.(),
    bodyEl: body,
    footerButtons
  });
}

/**
 * 3. Image Compression & Folder Optimization Panel
 */
export function renderCompressionModal(store, destinationId, compressionRunner, actions) {
  const dest = store.destinations.get(destinationId);
  const eligibleImages = compressionRunner.getDestinationImages(destinationId);
  const body = document.createElement('div');
  body.style.cssText = 'display:flex;flex-direction:column;gap:12px;';

  body.innerHTML = `
    <div style="display:flex;justify-content:space-between;padding:10px 12px;border-radius:8px;background:var(--surface-secondary);">
      <span><strong>Destination:</strong> <span class="c-dname"></span></span>
      <span><strong>Total Size:</strong> ${formatBytes(dest?.stats.totalBytes || 0)}</span>
      <span><strong>Compressible Images:</strong> ${eligibleImages.length}</span>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;">
      <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;">
        <span>Optimization Mode</span>
        <select id="cmp-mode" class="ws-btn">
          <option value="quality">Quality-Controlled (Lossy)</option>
          <option value="resize">Resize + Compress</option>
          <option value="lossless">Lossless Re-encode (PNG)</option>
        </select>
      </label>
      <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;">
        <span>Output Format</span>
        <select id="cmp-format" class="ws-btn">
          <option value="image/webp">WebP (Recommended)</option>
          <option value="image/jpeg">JPEG</option>
          <option value="image/png">PNG</option>
        </select>
      </label>
      <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;">
        <span>Quality (<span id="cmp-q-val">84%</span>)</span>
        <input type="range" id="cmp-quality" min="30" max="98" value="84" />
      </label>
      <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;">
        <span>Max Dimension (px)</span>
        <input type="number" id="cmp-max-dim" class="ws-btn" value="2560" min="256" max="8192" />
      </label>
    </div>
    <div id="cmp-sample-box" style="padding:12px;border-radius:10px;background:var(--surface-secondary);border:1px solid var(--border-hairline);font-size:12px;">
      Non-destructive safety policy: Optimized copies are written to an <code>Optimized/</code> subfolder so existing original files are preserved untouched.
    </div>
  `;
  body.querySelector('.c-dname').textContent = dest ? dest.name : 'Folder';

  const qInput = body.querySelector('#cmp-quality');
  const qLabel = body.querySelector('#cmp-q-val');
  qInput.addEventListener('input', () => { qLabel.textContent = `${qInput.value}%`; });

  const sampleBox = body.querySelector('#cmp-sample-box');
  if (eligibleImages.length > 0) {
    const sampleFile = eligibleImages[0];
    compressionRunner.copyEngine.resolveSourceFile(sampleFile).then((blob) => {
      return generateCompressionSamplePreview(blob, { quality: 0.84, outputFormat: 'image/webp' });
    }).then((preview) => {
      sampleBox.innerHTML = `
        <div><strong>Sample Image:</strong> ${sampleFile.name} • Original: ${formatBytes(preview.originalSize)} → Estimated Output: <strong>${formatBytes(preview.outputSize)}</strong> (Saved ${formatBytes(preview.savedBytes)})</div>
        <div style="margin-top:4px;color:var(--text-secondary);">${preview.note}</div>
      `;
      preview.dispose();
    }).catch(() => {});
  }

  return createModalShell({
    title: `🖼️ Optimize Images in "${dest?.name || 'Destination'}"`,
    onClose: () => actions.onCloseModal?.(),
    bodyEl: body,
    footerButtons: [
      { label: 'Cancel', onClick: () => actions.onCloseModal?.() },
      {
        label: `Optimize ${eligibleImages.length} Image(s)`,
        primary: true,
        onClick: async () => {
          const mode = body.querySelector('#cmp-mode')?.value || 'quality';
          const outputFormat = body.querySelector('#cmp-format')?.value || 'image/webp';
          const quality = (parseFloat(body.querySelector('#cmp-quality')?.value) || 84) / 100;
          const maxDimension = parseInt(body.querySelector('#cmp-max-dim')?.value, 10) || 2560;
          await actions.onRunCompressionJob?.(destinationId, { mode, outputFormat, quality, maxDimension });
        }
      }
    ]
  });
}

/**
 * 4. Smart Rules & Suggested Folders Modal
 */
export function renderSmartRulesModal(store, rulesEngine, actions) {
  const body = document.createElement('div');
  body.style.cssText = 'display:flex;flex-direction:column;gap:14px;';

  // Suggested Folders from active pool
  const suggestions = rulesEngine.suggestFoldersFromPool();
  const sugBox = document.createElement('div');
  sugBox.style.cssText = 'padding:12px;border-radius:10px;background:var(--surface-secondary);border:1px solid var(--border-hairline);';
  sugBox.innerHTML = `<div style="font-weight:700;font-size:13px;margin-bottom:6px;">💡 Suggested Folders (Based on filenames & dates in pool)</div>`;

  if (suggestions.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'font-size:12px;color:var(--text-secondary);';
    empty.textContent = 'Import files to see automatic filename/date folder suggestions.';
    sugBox.appendChild(empty);
  } else {
    const chips = document.createElement('div');
    chips.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;';
    for (const s of suggestions) {
      const btn = document.createElement('button');
      btn.className = 'ws-btn';
      btn.textContent = `+ ${s.emoji} ${s.name} (${s.reason})`;
      btn.addEventListener('click', () => {
        actions.onCreateDestination?.({ name: s.name, emoji: s.emoji, bank: 'top', pinned: true });
      });
      chips.appendChild(btn);
    }
    sugBox.appendChild(chips);
  }

  // Rule creator
  const addRuleBox = document.createElement('div');
  addRuleBox.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:8px;align-items:end;';

  const destOptions = Array.from(store.destinations.values())
    .map(d => `<option value="${d.id}">${d.emoji} ${d.name}</option>`)
    .join('');

  addRuleBox.innerHTML = `
    <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;">
      <span>If File Condition</span>
      <select id="rule-cond-type" class="ws-btn">
        <option value="name-contains">Filename contains</option>
        <option value="extension-is">Extension equals</option>
        <option value="category-is">Category is</option>
        <option value="size-over-mb">Size over (MB)</option>
        <option value="year-is">Modified Year is</option>
        <option value="is-screenshot">Is Screenshot</option>
      </select>
    </label>
    <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;">
      <span>Match Value</span>
      <input type="text" id="rule-cond-val" class="ws-btn" placeholder="e.g. Diwali, pdf, 2026" />
    </label>
    <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;">
      <span>Sort Into Destination</span>
      <select id="rule-dest-id" class="ws-btn">${destOptions}</select>
    </label>
    <button id="btn-add-rule" class="ws-btn ws-btn-primary">+ Add Rule</button>
  `;

  const previewList = document.createElement('div');
  previewList.style.cssText = 'font-size:12px;padding:10px;border-radius:8px;background:var(--surface-secondary);max-height:180px;overflow:auto;';

  function updateRulePreview() {
    const matches = rulesEngine.previewRuleMatches();
    previewList.innerHTML = `<div style="font-weight:700;margin-bottom:6px;">Active Rules (${store.rules.length}) • Matching Unsorted Files: ${matches.length}</div>`;
    for (const m of matches.slice(0, 20)) {
      const line = document.createElement('div');
      line.textContent = `• ${m.fileName} → ${m.destinationName}`;
      previewList.appendChild(line);
    }
  }

  addRuleBox.querySelector('#btn-add-rule').addEventListener('click', () => {
    const conditionType = addRuleBox.querySelector('#rule-cond-type')?.value;
    const conditionValue = addRuleBox.querySelector('#rule-cond-val')?.value || '';
    const destinationId = addRuleBox.querySelector('#rule-dest-id')?.value;
    if (!destinationId) return;
    rulesEngine.addRule({
      name: `${conditionType}: ${conditionValue}`,
      conditionType,
      conditionValue,
      destinationId
    });
    updateRulePreview();
  });

  updateRulePreview();
  body.append(sugBox, addRuleBox, previewList);

  return createModalShell({
    title: '⚡ Rule-Based Smart Sorting & Folder Suggestions',
    onClose: () => actions.onCloseModal?.(),
    bodyEl: body,
    footerButtons: [
      { label: 'Close', onClick: () => actions.onCloseModal?.() },
      {
        label: 'Apply All Matching Rules Now',
        primary: true,
        onClick: async () => {
          await actions.onExecuteAllRules?.();
          actions.onCloseModal?.();
        }
      }
    ]
  });
}

/**
 * 5. Keyboard Shortcuts & Help Modal
 */
export function renderHelpModal(store, actions) {
  const body = document.createElement('div');
  body.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:12.5px;';
  const shortcuts = [
    ['1 – 9', 'Quick-sort active file into assigned destination'],
    ['← / → Arrow Keys', 'Navigate Previous / Next media file'],
    ['Ctrl / Cmd + Z', 'Undo last sort or skip action safely'],
    ['Ctrl / Cmd + Shift + Z', 'Redo last undone action'],
    ['Ctrl / Cmd + K', 'Open Command Palette & Destination Picker'],
    ['Ctrl / Cmd + A', 'Select all currently filtered items'],
    ['Delete / Backspace', 'Skip selected item (never deletes original source)'],
    ['/', 'Focus search bar'],
    ['Space', 'Toggle fullscreen media preview'],
    ['Esc', 'Close active modal or dialog']
  ];

  for (const [key, desc] of shortcuts) {
    const item = document.createElement('div');
    item.style.cssText = 'padding:8px 10px;border-radius:8px;background:var(--surface-secondary);border:1px solid var(--border-hairline);display:flex;flex-direction:column;gap:3px;';
    item.innerHTML = `<strong style="color:var(--accent-main);">${key}</strong><span style="color:var(--text-secondary);">${desc}</span>`;
    body.appendChild(item);
  }

  return createModalShell({
    title: '⌨️ WiniSort Keyboard Shortcuts & Quick Guide',
    maxWidth: '640px',
    onClose: () => actions.onCloseModal?.(),
    bodyEl: body,
    footerButtons: [{ label: 'Got It', primary: true, onClick: () => actions.onCloseModal?.() }]
  });
}
