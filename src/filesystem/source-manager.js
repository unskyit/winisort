import { createId } from '../utils/ids.js';
import { DirectoryScanner } from './directory-scanner.js';
import { checkDirectoryRelationship } from './permission-manager.js';

export class SourceManager {
  constructor(store) {
    this.store = store;
    this.scanner = new DirectoryScanner();
    this.activeAbortController = null;
  }

  getExistingFingerprints() {
    const set = new Set();
    for (const file of this.store.files.values()) {
      if (file.fingerprint) set.add(file.fingerprint);
    }
    return set;
  }

  /**
   * Imports a native FileSystemDirectoryHandle as a source.
   * Prevents duplicate overlapping source imports automatically.
   * @param {FileSystemDirectoryHandle} dirHandle
   * @param {{ onComplete?: (stats: Object) => void }} [callbacks]
   */
  async importDirectoryHandle(dirHandle, callbacks = {}) {
    // Check if already imported
    for (const existing of this.store.sources.values()) {
      if (existing.handle) {
        const rel = await checkDirectoryRelationship(existing.handle, dirHandle);
        if (rel.same) {
          return this.rescanSource(existing.id, callbacks);
        }
      }
    }

    const sourceId = createId('src');
    const sourceRecord = {
      id: sourceId,
      name: dirHandle.name || 'Source Folder',
      kind: 'directory-handle',
      handle: dirHandle,
      addedAt: Date.now(),
      fileCount: 0,
      totalBytes: 0
    };
    this.store.sources.set(sourceId, sourceRecord);

    return this._runScan(sourceRecord, async (signal, onProgress, onFileAccepted) => {
      return this.scanner.scanDirectoryHandle(dirHandle, {
        sourceId,
        sourceName: sourceRecord.name,
        filters: this.store.filters,
        existingFingerprints: this.getExistingFingerprints(),
        outputDirHandle: this.store.project.outputRootHandle,
        signal,
        onProgress,
        onFileAccepted
      });
    }, callbacks);
  }

  /**
   * Imports a FileList or Array<File> as a source.
   * @param {Iterable<File>} fileList
   * @param {string} [label='Selected Files']
   * @param {{ onComplete?: (stats: Object) => void }} [callbacks]
   */
  async importFileList(fileList, label = 'Selected Files', callbacks = {}) {
    const sourceId = createId('src');
    const sourceRecord = {
      id: sourceId,
      name: label,
      kind: 'file-list',
      handle: null,
      addedAt: Date.now(),
      fileCount: 0,
      totalBytes: 0
    };
    this.store.sources.set(sourceId, sourceRecord);

    return this._runScan(sourceRecord, async (signal, onProgress, onFileAccepted) => {
      return this.scanner.scanFileList(fileList, {
        sourceId,
        sourceName: sourceRecord.name,
        filters: this.store.filters,
        existingFingerprints: this.getExistingFingerprints(),
        signal,
        onProgress,
        onFileAccepted
      });
    }, callbacks);
  }

  async rescanSource(sourceId, callbacks = {}) {
    const sourceRecord = this.store.sources.get(sourceId);
    if (!sourceRecord || !sourceRecord.handle) return null;
    return this._runScan(sourceRecord, async (signal, onProgress, onFileAccepted) => {
      return this.scanner.scanDirectoryHandle(sourceRecord.handle, {
        sourceId,
        sourceName: sourceRecord.name,
        filters: this.store.filters,
        existingFingerprints: this.getExistingFingerprints(),
        outputDirHandle: this.store.project.outputRootHandle,
        signal,
        onProgress,
        onFileAccepted
      });
    }, callbacks);
  }

  removeSource(sourceId) {
    this.store.sources.delete(sourceId);
    for (const [fileId, file] of this.store.files.entries()) {
      if (file.sourceId === sourceId && file.status !== 'sorted') {
        this.store.files.delete(fileId);
      }
    }
    this.store.recomputeDerivedState();
    this.store.notify('sources');
  }

  cancelScan() {
    if (this.activeAbortController) {
      this.activeAbortController.abort();
      this.activeAbortController = null;
    }
    this.store.ui.isScanning = false;
    this.store.notify('scan');
  }

  async _runScan(sourceRecord, scanFn, callbacks) {
    this.activeAbortController = new AbortController();
    this.store.ui.isScanning = true;
    this.store.notify('scan');

    try {
      const stats = await scanFn(
        this.activeAbortController.signal,
        (progress) => {
          this.store.ui.scanProgress = progress;
          this.store.notify('scan-progress');
        },
        (fileRecord) => {
          this.store.files.set(fileRecord.id, fileRecord);
          sourceRecord.fileCount++;
          sourceRecord.totalBytes += fileRecord.size || 0;
        }
      );

      this.store.ui.isScanning = false;
      this.store.ui.scanProgress = stats;
      this.store.recomputeDerivedState();
      this.store.notify('files-imported', stats);
      if (callbacks.onComplete) callbacks.onComplete(stats);
      return stats;
    } catch (err) {
      this.store.ui.isScanning = false;
      this.store.recomputeDerivedState();
      this.store.notify('scan-error', err);
      throw err;
    } finally {
      this.activeAbortController = null;
    }
  }
}
