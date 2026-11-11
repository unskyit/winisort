/**
 * Multi-selection controller supporting single toggle, Shift-range selection, Select All filtered, and Clear.
 */
export class SelectionManager {
  constructor(store) {
    this.store = store;
    this.lastAnchorFileId = null;
  }

  toggleSelect(fileId, isShiftKey = false) {
    const filtered = this.store.filteredFileIds;
    if (isShiftKey && this.lastAnchorFileId && filtered.includes(this.lastAnchorFileId) && filtered.includes(fileId)) {
      const idxA = filtered.indexOf(this.lastAnchorFileId);
      const idxB = filtered.indexOf(fileId);
      const [start, end] = idxA < idxB ? [idxA, idxB] : [idxB, idxA];
      for (let i = start; i <= end; i++) {
        this.store.ui.selectedFileIds.add(filtered[i]);
      }
    } else {
      if (this.store.ui.selectedFileIds.has(fileId)) {
        this.store.ui.selectedFileIds.delete(fileId);
      } else {
        this.store.ui.selectedFileIds.add(fileId);
      }
      this.lastAnchorFileId = fileId;
    }
    this.store.notify('selection');
  }

  selectAllFiltered() {
    for (const id of this.store.filteredFileIds) {
      this.store.ui.selectedFileIds.add(id);
    }
    this.store.notify('selection');
  }

  clearSelection() {
    if (this.store.ui.selectedFileIds.size === 0) return;
    this.store.ui.selectedFileIds.clear();
    this.lastAnchorFileId = null;
    this.store.notify('selection');
  }

  getActiveOrSelectedFileIds() {
    if (this.store.ui.selectedFileIds.size > 0) {
      return Array.from(this.store.ui.selectedFileIds);
    }
    return this.store.ui.activeFileId ? [this.store.ui.activeFileId] : [];
  }
}
