/**
 * Unified Pointer Events (mouse + touch + pen) drag-and-drop controller for sorting media cards into destination banks,
 * plus desktop window file/folder drop ingestion.
 */
export class DragController {
  constructor(store, selectionManager, onDropToDestination, onExternalFilesDropped) {
    this.store = store;
    this.selectionManager = selectionManager;
    this.onDropToDestination = onDropToDestination;
    this.onExternalFilesDropped = onExternalFilesDropped;
    this.ghostEl = null;
    this.activeDragIds = [];
    this.currentHoverDestId = null;
  }

  /**
   * Attaches pointer-based drag sorting to the central media card element.
   * @param {HTMLElement} draggableEl
   * @param {Object} fileRecord
   */
  bindMediaCardDrag(draggableEl, fileRecord) {
    if (!draggableEl || !fileRecord) return;

    let startX = 0;
    let startY = 0;
    let dragging = false;

    const onPointerDown = (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      if (e.target.closest('button, input, select, a, video, audio')) return;

      startX = e.clientX;
      startY = e.clientY;
      dragging = false;

      const onPointerMove = (moveEvent) => {
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;
        if (!dragging && Math.hypot(dx, dy) > 8) {
          dragging = true;
          const selected = this.selectionManager.getActiveOrSelectedFileIds();
          this.activeDragIds = selected.includes(fileRecord.id) ? selected : [fileRecord.id];
          this._createGhost(fileRecord, this.activeDragIds.length, moveEvent.clientX, moveEvent.clientY);
          this._setOtherDestinationsDimmed(true);
        }

        if (dragging) {
          this._moveGhost(moveEvent.clientX, moveEvent.clientY);
          const targetEl = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY);
          const destCard = targetEl ? targetEl.closest('[data-destination-id]') : null;
          const destId = destCard ? destCard.getAttribute('data-destination-id') : null;
          this._updateDropTargetHighlight(destId);
        }
      };

      const onPointerUp = async () => {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('pointercancel', onPointerUp);

        if (dragging) {
          const targetDestId = this.currentHoverDestId;
          const idsToSort = [...this.activeDragIds];
          this._cleanupDrag();
          if (targetDestId && idsToSort.length > 0 && this.onDropToDestination) {
            await this.onDropToDestination(idsToSort, targetDestId);
          }
        }
      };

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerUp);
    };

    draggableEl.addEventListener('pointerdown', onPointerDown);
  }

  /**
   * Binds external OS file/folder drag-and-drop onto the application workspace.
   * @param {HTMLElement} rootEl
   */
  bindExternalFileDrop(rootEl) {
    if (!rootEl) return;

    rootEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      const tray = rootEl.querySelector('.ws-collection-tray');
      if (tray) tray.classList.add('is-dragover');
    });

    rootEl.addEventListener('dragleave', (e) => {
      if (e.target === rootEl) {
        const tray = rootEl.querySelector('.ws-collection-tray');
        if (tray) tray.classList.remove('is-dragover');
      }
    });

    rootEl.addEventListener('drop', async (e) => {
      e.preventDefault();
      const tray = rootEl.querySelector('.ws-collection-tray');
      if (tray) tray.classList.remove('is-dragover');

      if (!e.dataTransfer) return;

      // Check for FileSystemAccessAPI getAsFileSystemHandle on dropped items first
      const items = Array.from(e.dataTransfer.items || []);
      const handles = [];
      for (const item of items) {
        if (typeof item.getAsFileSystemHandle === 'function') {
          try {
            const h = await item.getAsFileSystemHandle();
            if (h) handles.push(h);
          } catch (_) {}
        }
      }

      if (handles.length > 0 && this.onExternalFilesDropped) {
        await this.onExternalFilesDropped({ handles, files: e.dataTransfer.files });
      } else if (e.dataTransfer.files?.length > 0 && this.onExternalFilesDropped) {
        await this.onExternalFilesDropped({ handles: [], files: e.dataTransfer.files });
      }
    });
  }

  _createGhost(fileRecord, count, x, y) {
    this._removeGhost();
    const el = document.createElement('div');
    el.className = 'ws-drag-ghost';
    el.innerHTML = `
      <span>${fileRecord.emoji || '📄'}</span>
      <span style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"></span>
      ${count > 1 ? `<span class="ws-badge ws-badge-accent">${count} files</span>` : ''}
    `;
    el.querySelectorAll('span')[1].textContent = fileRecord.name;
    document.body.appendChild(el);
    this.ghostEl = el;
    this._moveGhost(x, y);
  }

  _moveGhost(x, y) {
    if (!this.ghostEl) return;
    this.ghostEl.style.transform = `translate3d(${x + 14}px, ${y + 14}px, 0)`;
  }

  _removeGhost() {
    if (this.ghostEl && this.ghostEl.parentNode) {
      this.ghostEl.parentNode.removeChild(this.ghostEl);
    }
    this.ghostEl = null;
  }

  _updateDropTargetHighlight(destId) {
    if (this.currentHoverDestId === destId) return;
    this.currentHoverDestId = destId;
    const allCards = document.querySelectorAll('[data-destination-id]');
    allCards.forEach((card) => {
      const id = card.getAttribute('data-destination-id');
      if (destId && id === destId) {
        card.classList.add('is-drop-target');
        card.classList.remove('is-dimmed');
      } else {
        card.classList.remove('is-drop-target');
        if (destId) card.classList.add('is-dimmed');
      }
    });
  }

  _setOtherDestinationsDimmed(dimmed) {
    const allCards = document.querySelectorAll('[data-destination-id]');
    allCards.forEach((card) => {
      if (!dimmed) {
        card.classList.remove('is-dimmed', 'is-drop-target');
      }
    });
  }

  _cleanupDrag() {
    this._removeGhost();
    this._setOtherDestinationsDimmed(false);
    this.currentHoverDestId = null;
    this.activeDragIds = [];
  }
}
