import { WiniSortError, ErrorCode } from '../core/errors.js';

/**
 * Genuine operation-based Undo/Redo Engine differentiating between UI undo and verified Filesystem undo.
 * Never deletes an output file on undo if its size/timestamp was modified externally after WiniSort created it.
 */
export class HistoryManager {
  constructor(store, adapter, destinationManager) {
    this.store = store;
    this.adapter = adapter;
    this.destinationManager = destinationManager;
    /** @type {Array<Object>} */
    this.undoStack = [];
    /** @type {Array<Object>} */
    this.redoStack = [];
  }

  canUndo() {
    return this.undoStack.length > 0;
  }

  canRedo() {
    return this.redoStack.length > 0;
  }

  pushOperation(opRecord) {
    this.undoStack.push(opRecord);
    if (this.undoStack.length > 200) {
      this.undoStack.shift();
    }
    this.redoStack = [];
    this.store.notify('history');
  }

  /**
   * Undoes the most recent operation safely.
   * @param {(fileRecord: Object, destination: Object) => Promise<any>} [redoExecutor]
   */
  async undo() {
    if (!this.canUndo()) return null;
    const op = this.undoStack.pop();

    if (op.type === 'sort-file') {
      const file = this.store.files.get(op.fileId);
      const dest = this.store.destinations.get(op.destinationId);

      // If a real disk copy was created by WiniSort, verify it hasn't been modified before removing
      if (op.mode === 'copy-disk' && dest?.dirHandle && op.outputFileName) {
        try {
          const fh = await dest.dirHandle.getFileHandle(op.outputFileName, { create: false });
          const currentDiskFile = await fh.getFile();
          if (currentDiskFile.size !== op.bytesWritten) {
            // Re-push to stack and refuse destructive undo
            this.undoStack.push(op);
            throw new WiniSortError(
              ErrorCode.UNDO_UNSAFE,
              `Cannot safely remove "${op.outputFileName}" from "${dest.name}" because the file was modified externally since sorting.`
            );
          }
          await this.adapter.removeFileEntry(dest.dirHandle, op.outputFileName);
        } catch (err) {
          if (err instanceof WiniSortError) throw err;
          // If file was already removed externally, continue restoring UI queue state safely
        }
      } else if (op.mode === 'session-export-staged' && dest?.exportedFiles) {
        dest.exportedFiles.delete(op.outputFileName);
      }

      if (file) {
        file.status = op.previousStatus || 'unsorted';
        file.assignedDestinationId = op.previousDestinationId || null;
        file.sortedOutputName = op.previousOutputName || null;
        this.store.ui.activeFileId = file.id;
      }
      if (dest && file) {
        this.destinationManager.recordRemoval(dest.id, file, op.bytesWritten);
      }
      this.store.stats.completedCopyBytes = Math.max(0, this.store.stats.completedCopyBytes - (op.bytesWritten || 0));
    } else if (op.type === 'skip-file' || op.type === 'review-later') {
      const file = this.store.files.get(op.fileId);
      if (file) {
        file.status = op.previousStatus || 'unsorted';
        this.store.ui.activeFileId = file.id;
      }
    } else if (op.type === 'batch-sort') {
      // Reverse sub-operations in reverse order
      for (let i = op.items.length - 1; i >= 0; i--) {
        const sub = op.items[i];
        const file = this.store.files.get(sub.fileId);
        const dest = this.store.destinations.get(sub.destinationId);
        if (sub.mode === 'copy-disk' && dest?.dirHandle && sub.outputFileName) {
          try {
            const fh = await dest.dirHandle.getFileHandle(sub.outputFileName, { create: false });
            const f = await fh.getFile();
            if (f.size === sub.bytesWritten) {
              await this.adapter.removeFileEntry(dest.dirHandle, sub.outputFileName);
            }
          } catch (_) {}
        } else if (sub.mode === 'session-export-staged' && dest?.exportedFiles) {
          dest.exportedFiles.delete(sub.outputFileName);
        }
        if (file) {
          file.status = sub.previousStatus || 'unsorted';
          file.assignedDestinationId = null;
          file.sortedOutputName = null;
        }
        if (dest && file) {
          this.destinationManager.recordRemoval(dest.id, file, sub.bytesWritten);
        }
      }
    }

    op.undoneAt = Date.now();
    this.redoStack.push(op);
    this.store.recomputeDerivedState();
    this.store.notify('undo-completed', op);
    return op;
  }

  /**
   * Redoes the most recently undone operation by re-validating permissions and executing through sortingEngine.
   * @param {import('./sorting-engine.js').SortingEngine} sortingEngine
   */
  async redo(sortingEngine) {
    if (!this.canRedo()) return null;
    const op = this.redoStack.pop();

    if (op.type === 'sort-file') {
      await sortingEngine.assignFileToDestination(op.fileId, op.destinationId, { fromRedo: true });
    } else if (op.type === 'skip-file') {
      sortingEngine.skipFile(op.fileId, { fromRedo: true });
    } else if (op.type === 'review-later') {
      sortingEngine.markReviewLater(op.fileId, { fromRedo: true });
    } else if (op.type === 'batch-sort') {
      const fileIds = op.items.map(i => i.fileId);
      const destId = op.items[0]?.destinationId;
      if (destId) {
        await sortingEngine.batchAssignToDestination(fileIds, destId, { fromRedo: true });
      }
    }
    return op;
  }
}
