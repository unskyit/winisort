import { createId } from '../utils/ids.js';
import { OperationQueue } from '../filesystem/operation-queue.js';

/**
 * Coordinates single-file and batch sorting operations, journal recording, history tracking,
 * quota warnings, and advancing the active media item only after confirmed completion.
 */
export class SortingEngine {
  constructor(store, copyEngine, destinationManager, historyManager, projectManager) {
    this.store = store;
    this.copyEngine = copyEngine;
    this.destinationManager = destinationManager;
    this.historyManager = historyManager;
    this.projectManager = projectManager;
    this.queue = new OperationQueue(store.capabilities.budgets.maxConcurrentCopies || 2);
  }

  /**
   * Formats a custom bulk naming pattern if configured (without renaming original source files).
   * Supported tokens: {name}, {index}, {date}, {dest}
   */
  formatOutputFilename(fileRecord, destination, pattern = '', index = 1) {
    if (!pattern || !pattern.trim()) return fileRecord.name;
    const dotIdx = fileRecord.name.lastIndexOf('.');
    const stem = dotIdx > 0 ? fileRecord.name.slice(0, dotIdx) : fileRecord.name;
    const ext = dotIdx > 0 ? fileRecord.name.slice(dotIdx) : '';
    const dateStr = new Date(fileRecord.lastModified || Date.now()).toISOString().slice(0, 10);

    const rendered = pattern
      .replace(/\{name\}/gi, stem)
      .replace(/\{index\}/gi, String(index).padStart(3, '0'))
      .replace(/\{date\}/gi, dateStr)
      .replace(/\{dest\}/gi, destination.name);

    return `${rendered}${ext}`;
  }

  /**
   * Assigns and copies a single file to a destination folder.
   * Only triggers completion state and advances to next file AFTER disk/session write is verified.
   */
  async assignFileToDestination(fileId, destinationId, options = {}) {
    const fileRecord = this.store.files.get(fileId);
    const destination = this.store.destinations.get(destinationId);
    if (!fileRecord || !destination) {
      throw new Error('Selected file or destination no longer exists.');
    }

    const opId = createId('sort');
    const previousStatus = fileRecord.status;
    const previousDestinationId = fileRecord.assignedDestinationId;
    const previousOutputName = fileRecord.sortedOutputName;

    // Record pending state in journal
    this.projectManager.journal.append({
      opId,
      type: 'sort-file',
      status: 'pending',
      fileName: fileRecord.name,
      fileSize: fileRecord.size,
      fingerprint: fileRecord.fingerprint,
      destinationId: destination.id,
      destinationName: destination.name,
      outputFileName: fileRecord.name
    });

    this.store.notify('operation-pending', { opId, fileId, destinationId });

    try {
      const result = await this.queue.enqueue((signal) =>
        this.copyEngine.executeFileCopy(fileRecord, destination, {
          signal,
          dryRun: options.dryRun,
          customOutputName: options.customOutputName
        })
      );

      if (result.status === 'skipped-collision') {
        fileRecord.status = 'skipped';
        this.store.recomputeDerivedState();
        this.store.notify('file-skipped', { fileRecord, reason: 'Filename collision skipped per policy' });
        return result;
      }

      if (result.status === 'dry-run') {
        this.store.notify('dry-run-preview', { fileRecord, destination, result });
        return result;
      }

      // Confirmed write completion
      fileRecord.status = 'sorted';
      fileRecord.assignedDestinationId = destination.id;
      fileRecord.sortedOutputName = result.finalName;

      this.destinationManager.recordAddition(destination.id, fileRecord, result.bytesWritten);
      this.store.stats.completedCopyBytes += result.bytesWritten || 0;

      // Record completed state in journal
      this.projectManager.journal.append({
        opId,
        type: 'sort-file',
        status: 'completed',
        fileName: fileRecord.name,
        fileSize: fileRecord.size,
        fingerprint: fileRecord.fingerprint,
        destinationId: destination.id,
        destinationName: destination.name,
        outputFileName: result.finalName
      });

      const opRecord = {
          opId,
          type: 'sort-file',
          fileId: fileRecord.id,
          destinationId: destination.id,
          outputFileName: result.finalName,
          bytesWritten: result.bytesWritten,
          mode: result.mode,
          previousStatus,
          previousDestinationId,
          previousOutputName,
          timestamp: Date.now()
        };
      if (options.fromRedo) {
        this.historyManager.undoStack.push(opRecord);
      } else {
        this.historyManager.pushOperation(opRecord);
      }

      this.projectManager.checkpoints.notifyOperationCompleted();
      this.store.ui.selectedFileIds.delete(fileId);
      this.store.recomputeDerivedState();

      // Check destination quota warning
      let quotaExceeded = false;
      if (destination.quotaBytes > 0 && destination.stats.totalBytes >= destination.quotaBytes) {
        quotaExceeded = true;
      }

      this.store.notify('file-sorted', {
        opId,
        fileRecord,
        destination,
        result,
        quotaExceeded
      });

      return result;
    } catch (err) {
      this.store.stats.failedCopyBytes += fileRecord.size || 0;
      this.store.stats.errorsCount++;
      this.projectManager.journal.append({
        opId,
        type: 'sort-file',
        status: 'failed',
        fileName: fileRecord.name,
        fileSize: fileRecord.size,
        destinationId: destination.id,
        destinationName: destination.name,
        error: err.message
      });
      this.store.notify('operation-error', err);
      throw err;
    }
  }

  /**
   * Batch assigns an explicit list of selected file IDs to a destination.
   */
  async batchAssignToDestination(fileIds, destinationId, options = {}) {
    const ids = Array.from(fileIds || []).filter(id => this.store.files.has(id));
    if (ids.length === 0) return [];
    if (ids.length === 1) {
      const single = await this.assignFileToDestination(ids[0], destinationId, options);
      return [single];
    }

    const destination = this.store.destinations.get(destinationId);
    if (!destination) throw new Error('Destination not found');

    const batchItems = [];
    const results = [];

    for (let i = 0; i < ids.length; i++) {
      const fileId = ids[i];
      const fileRecord = this.store.files.get(fileId);
      if (!fileRecord) continue;
      const previousStatus = fileRecord.status;
      const customOutputName = options.namingPattern
        ? this.formatOutputFilename(fileRecord, destination, options.namingPattern, i + 1)
        : fileRecord.name;

      const res = await this.queue.enqueue((signal) =>
        this.copyEngine.executeFileCopy(fileRecord, destination, {
          signal,
          dryRun: options.dryRun,
          customOutputName
        })
      );

      if (res.status === 'completed') {
        fileRecord.status = 'sorted';
        fileRecord.assignedDestinationId = destination.id;
        fileRecord.sortedOutputName = res.finalName;
        this.destinationManager.recordAddition(destination.id, fileRecord, res.bytesWritten);
        this.store.stats.completedCopyBytes += res.bytesWritten || 0;
        batchItems.push({
          fileId,
          destinationId: destination.id,
          outputFileName: res.finalName,
          bytesWritten: res.bytesWritten,
          mode: res.mode,
          previousStatus
        });
      }
      results.push(res);
    }

    if (batchItems.length > 0 && !options.fromRedo) {
      this.historyManager.pushOperation({
        opId: createId('batch'),
        type: 'batch-sort',
        items: batchItems,
        destinationId: destination.id,
        timestamp: Date.now()
      });
    }

    this.store.ui.selectedFileIds.clear();
    this.store.recomputeDerivedState();
    this.store.notify('batch-sorted', { destination, count: batchItems.length, results });
    return results;
  }

  skipFile(fileId, options = {}) {
    const file = this.store.files.get(fileId);
    if (!file) return;
    const prev = file.status;
    file.status = 'skipped';
    if (!options.fromRedo) {
      this.historyManager.pushOperation({
        opId: createId('skip'),
        type: 'skip-file',
        fileId: file.id,
        previousStatus: prev,
        timestamp: Date.now()
      });
    }
    this.store.recomputeDerivedState();
    this.store.notify('file-skipped', { fileRecord: file });
  }

  markReviewLater(fileId, options = {}) {
    const file = this.store.files.get(fileId);
    if (!file) return;
    const prev = file.status;
    file.status = 'review-later';
    if (!options.fromRedo) {
      this.historyManager.pushOperation({
        opId: createId('rev'),
        type: 'review-later',
        fileId: file.id,
        previousStatus: prev,
        timestamp: Date.now()
      });
    }
    this.store.recomputeDerivedState();
    this.store.notify('file-review-later', { fileRecord: file });
  }

  toggleFavorite(fileId) {
    const file = this.store.files.get(fileId);
    if (!file) return;
    file.favorite = !file.favorite;
    this.store.recomputeDerivedState();
    this.store.notify('file-favorite', { fileRecord: file });
  }

  navigateNext() {
    const list = this.store.filteredFileIds;
    if (list.length === 0) return;
    const idx = list.indexOf(this.store.ui.activeFileId);
    const nextIdx = idx >= 0 && idx < list.length - 1 ? idx + 1 : 0;
    this.store.ui.activeFileId = list[nextIdx];
    this.store.notify('active-file');
  }

  navigatePrevious() {
    const list = this.store.filteredFileIds;
    if (list.length === 0) return;
    const idx = list.indexOf(this.store.ui.activeFileId);
    const prevIdx = idx > 0 ? idx - 1 : list.length - 1;
    this.store.ui.activeFileId = list[prevIdx];
    this.store.notify('active-file');
  }
}
