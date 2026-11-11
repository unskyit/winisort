import { formatBytes, formatDate } from '../utils/formatters.js';

/**
 * Renders the Central Active Media Sorting Workspace:
 * - Header bar with filter tabs (Unsorted, All, Sorted, Skipped, Review Later, Favorites), batch controls, and Add More Files
 * - Prominent Central File Viewer (media preview + metadata + quick sort controls)
 * - Virtualized/windowed collapsible Pool Strip at bottom of center stage
 */
export function renderActiveSortingWorkspace(container, store, previewManager, dragController, selectionManager, actions) {
  if (!container) return;
  container.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'ws-active-workspace';

  // 1. Viewer Top Filter & Batch Bar
  const header = document.createElement('div');
  header.className = 'ws-viewer-header';

  const statusTabs = document.createElement('div');
  statusTabs.style.cssText = 'display:flex;align-items:center;gap:5px;flex-wrap:wrap;';

  const tabs = [
    { id: 'unsorted', label: `Unsorted (${store.stats.unsortedCount})` },
    { id: 'all', label: `All (${store.stats.totalFiles})` },
    { id: 'sorted', label: `Sorted (${store.stats.sortedCount})` },
    { id: 'skipped', label: `Skipped (${store.stats.skippedCount})` },
    { id: 'review-later', label: `Review Later (${store.stats.reviewLaterCount})` },
    { id: 'favorites', label: `★ Favorites (${store.stats.favoriteCount})` }
  ];

  for (const t of tabs) {
    const btn = document.createElement('button');
    btn.className = `ws-btn ${store.ui.statusFilter === t.id ? 'ws-btn-primary' : ''}`;
    btn.style.height = '28px';
    btn.style.fontSize = '11.5px';
    btn.textContent = t.label;
    btn.addEventListener('click', () => {
      store.ui.statusFilter = t.id;
      store.recomputeDerivedState();
      store.notify('filter-tab');
    });
    statusTabs.appendChild(btn);
  }

  const rightBar = document.createElement('div');
  rightBar.style.cssText = 'display:flex;align-items:center;gap:6px;flex-wrap:wrap;';

  if (store.ui.selectedFileIds.size > 0) {
    const selBadge = document.createElement('span');
    selBadge.className = 'ws-badge ws-badge-accent';
    selBadge.textContent = `${store.ui.selectedFileIds.size} selected`;

    const clearSelBtn = document.createElement('button');
    clearSelBtn.className = 'ws-btn';
    clearSelBtn.style.height = '26px';
    clearSelBtn.textContent = 'Clear Selection';
    clearSelBtn.addEventListener('click', () => selectionManager.clearSelection());

    rightBar.append(selBadge, clearSelBtn);
  }

  const addMoreBtn = document.createElement('button');
  addMoreBtn.className = 'ws-btn';
  addMoreBtn.style.height = '28px';
  addMoreBtn.textContent = '+ Add More Source';
  addMoreBtn.addEventListener('click', () => actions.onAddFolderOrFiles?.());

  const poolModeBtn = document.createElement('button');
  poolModeBtn.className = 'ws-btn';
  poolModeBtn.style.height = '28px';
  const mode = store.preferences.poolDisplayMode || 'show';
  poolModeBtn.textContent = mode === 'hide' ? '👁 Show Pool' : mode === 'collapsed' ? '⬆ Expand Pool' : '⬇ Collapse Pool';
  poolModeBtn.addEventListener('click', () => {
    const next = mode === 'show' ? 'collapsed' : mode === 'collapsed' ? 'hide' : 'show';
    store.preferences.poolDisplayMode = next;
    store.notify('pool-mode');
  });

  rightBar.append(addMoreBtn, poolModeBtn);
  header.append(statusTabs, rightBar);

  // 2. Central Viewer Stage
  const stage = document.createElement('div');
  stage.className = 'ws-viewer-stage';

  const activeFile = store.getActiveFile();

  if (!activeFile) {
    const emptyState = document.createElement('div');
    emptyState.style.cssText = 'text-align:center;padding:32px;max-width:420px;';
    emptyState.innerHTML = `
      <div style="font-size:42px;margin-bottom:10px;">🎉</div>
      <h2 style="font-size:18px;font-weight:700;margin-bottom:6px;">No items in "${store.ui.statusFilter}" view</h2>
      <p style="font-size:13px;color:var(--text-secondary);margin-bottom:16px;">
        All matching files in this queue have been processed, or you can switch tabs above to inspect sorted/skipped items.
      </p>
    `;
    const showAllBtn = document.createElement('button');
    showAllBtn.className = 'ws-btn ws-btn-primary';
    showAllBtn.textContent = 'View All Imported Files';
    showAllBtn.addEventListener('click', () => {
      store.ui.statusFilter = 'all';
      store.recomputeDerivedState();
      store.notify('filter-tab');
    });
    emptyState.appendChild(showAllBtn);
    stage.appendChild(emptyState);
  } else {
    const mediaCard = document.createElement('div');
    mediaCard.className = 'ws-media-card';
    mediaCard.id = 'ws-active-media-card';

    const previewTarget = document.createElement('div');
    previewTarget.style.cssText = 'display:flex;align-items:center;justify-content:center;min-height:220px;min-width:280px;';
    mediaCard.appendChild(previewTarget);

    // Render media preview asynchronously
    previewManager.renderActiveMedia(previewTarget, activeFile);

    // Bind pointer drag-and-drop to any destination card
    dragController.bindMediaCardDrag(mediaCard, activeFile);

    // Context menu on active media card
    mediaCard.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      actions.onMediaCardContextMenu?.(activeFile, e.clientX, e.clientY);
    });

    stage.appendChild(mediaCard);
  }

  // 3. Active File Metadata & Quick Controls Bar
  const controlsBar = document.createElement('div');
  controlsBar.className = 'ws-viewer-controls-bar';

  if (activeFile) {
    const fileInfo = document.createElement('div');
    fileInfo.style.cssText = 'display:flex;flex-direction:column;min-width:0;flex:1;';

    const titleLine = document.createElement('div');
    titleLine.style.cssText = 'display:flex;align-items:center;gap:8px;font-weight:700;font-size:13.5px;';
    const fnSpan = document.createElement('span');
    fnSpan.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    fnSpan.textContent = `${activeFile.emoji} ${activeFile.name}`;
    titleLine.appendChild(fnSpan);

    if (activeFile.status === 'sorted' && activeFile.assignedDestinationId) {
      const d = store.destinations.get(activeFile.assignedDestinationId);
      const sortedBadge = document.createElement('span');
      sortedBadge.className = 'ws-badge ws-badge-accent';
      sortedBadge.textContent = `Sorted → ${d ? d.name : 'Folder'}`;
      titleLine.appendChild(sortedBadge);
    }

    const subLine = document.createElement('div');
    subLine.style.cssText = 'font-size:11.5px;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
    subLine.textContent = `${formatBytes(activeFile.size, { mode: store.preferences.unitSystem })} • ${activeFile.category.toUpperCase()} (.${activeFile.extension || 'file'}) • Source: ${activeFile.sourceName} (${activeFile.relativePath}) • ${formatDate(activeFile.lastModified)}`;

    fileInfo.append(titleLine, subLine);

    const navActions = document.createElement('div');
    navActions.style.cssText = 'display:flex;align-items:center;gap:6px;flex-wrap:wrap;';

    const currentIdx = store.filteredFileIds.indexOf(activeFile.id) + 1;
    const posBadge = document.createElement('span');
    posBadge.className = 'ws-badge';
    posBadge.textContent = `${currentIdx} / ${store.filteredFileIds.length}`;

    const prevBtn = document.createElement('button');
    prevBtn.className = 'ws-btn';
    prevBtn.textContent = '◀ Prev';
    prevBtn.title = 'Previous file (Left Arrow)';
    prevBtn.addEventListener('click', () => actions.onPreviousFile?.());

    const nextBtn = document.createElement('button');
    nextBtn.className = 'ws-btn';
    nextBtn.textContent = 'Next ▶';
    nextBtn.title = 'Next file (Right Arrow)';
    nextBtn.addEventListener('click', () => actions.onNextFile?.());

    const favBtn = document.createElement('button');
    favBtn.className = `ws-btn ${activeFile.favorite ? 'ws-btn-primary' : ''}`;
    favBtn.textContent = activeFile.favorite ? '★ Favorited' : '☆ Favorite';
    favBtn.addEventListener('click', () => actions.onToggleFavorite?.(activeFile.id));

    const skipBtn = document.createElement('button');
    skipBtn.className = 'ws-btn';
    skipBtn.textContent = '⏭ Skip';
    skipBtn.title = 'Move to Skipped queue (Delete key)';
    skipBtn.addEventListener('click', () => actions.onSkipFile?.(activeFile.id));

    const reviewBtn = document.createElement('button');
    reviewBtn.className = 'ws-btn';
    reviewBtn.textContent = '🔖 Review Later';
    reviewBtn.addEventListener('click', () => actions.onReviewLater?.(activeFile.id));

    const pickDestBtn = document.createElement('button');
    pickDestBtn.className = 'ws-btn ws-btn-primary';
    pickDestBtn.textContent = '📁 Sort Into... (Ctrl+K)';
    pickDestBtn.addEventListener('click', () => actions.onOpenCommandPalette?.());

    navActions.append(posBadge, prevBtn, nextBtn, favBtn, skipBtn, reviewBtn, pickDestBtn);
    controlsBar.append(fileInfo, navActions);
  }

  wrapper.append(header, stage, controlsBar);

  // 4. Virtualized / Windowed Media Pool Strip (renders at most 40 visible items around active index for 50,000-file performance)
  const poolMode = store.preferences.poolDisplayMode || 'show';
  if (poolMode !== 'hide') {
    const strip = document.createElement('div');
    strip.className = `ws-pool-strip ${poolMode === 'collapsed' ? 'is-collapsed' : ''}`;

    if (poolMode === 'collapsed') {
      const summary = document.createElement('div');
      summary.style.cssText = 'font-size:12px;color:var(--text-secondary);display:flex;align-items:center;justify-content:space-between;width:100%;';
      summary.innerHTML = `<span>Media Pool (${store.filteredFileIds.length} visible files in queue)</span>`;
      strip.appendChild(summary);
    } else {
      const allIds = store.filteredFileIds;
      const activeIdx = Math.max(0, allIds.indexOf(store.ui.activeFileId));
      const windowStart = Math.max(0, activeIdx - 12);
      const windowEnd = Math.min(allIds.length, windowStart + 36);

      for (let i = windowStart; i < windowEnd; i++) {
        const fid = allIds[i];
        const f = store.files.get(fid);
        if (!f) continue;

        const thumb = document.createElement('div');
        thumb.className = `ws-pool-thumb ${fid === store.ui.activeFileId ? 'is-current' : ''} ${store.ui.selectedFileIds.has(fid) ? 'is-selected' : ''}`.trim();
        thumb.title = `${f.name} (${formatBytes(f.size)}) — Click to view, Shift/Ctrl+Click to multi-select`;

        const cachedThumb = previewManager.thumbnailCache.get(fid);
        if (cachedThumb) {
          thumb.innerHTML = `<img src="${cachedThumb}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:4px;" />`;
        } else {
          thumb.innerHTML = `
            <span style="font-size:20px;">${f.emoji || '📄'}</span>
            <span style="max-width:60px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"></span>
          `;
          thumb.querySelectorAll('span')[1].textContent = f.name;
          // Lazily generate thumbnail for visible image items
          if (f.previewKind === 'image') {
            previewManager.copyEngine.resolveSourceFile(f).then((blob) => {
              return previewManager.thumbnailCache.getOrCreateThumbnail(f, blob);
            }).then((url) => {
              if (url && thumb.isConnected) {
                thumb.innerHTML = `<img src="${url}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:4px;" />`;
              }
            }).catch(() => {});
          }
        }

        thumb.addEventListener('click', (e) => {
          if (e.shiftKey || e.ctrlKey || e.metaKey) {
            selectionManager.toggleSelect(fid, e.shiftKey);
          } else {
            store.ui.activeFileId = fid;
            store.notify('active-file');
          }
        });

        strip.appendChild(thumb);
      }
    }

    wrapper.appendChild(strip);
  }

  container.appendChild(wrapper);
}
