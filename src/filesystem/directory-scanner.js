import { evaluateFileEligibility } from './file-classifier.js';
import { createId, createFileFingerprint } from '../utils/ids.js';
import { sanitizeRelativePath } from '../utils/sanitizer.js';

const IGNORED_SYSTEM_DIRS = new Set([
  '.winisort',
  '.git',
  'node_modules',
  '.DS_Store',
  'Thumbs.db',
  '$RECYCLE.BIN',
  'System Volume Information'
]);

/**
 * Lazy async directory scanner supporting both FileSystemDirectoryHandle trees and fallback FileList arrays.
 * Supports pause, resume, and AbortController cancellation without Promise.all() memory spikes.
 */
export class DirectoryScanner {
  constructor() {
    this.isPaused = false;
    this.pauseResolvers = [];
  }

  pause() {
    this.isPaused = true;
  }

  resume() {
    this.isPaused = false;
    while (this.pauseResolvers.length > 0) {
      const resolve = this.pauseResolvers.shift();
      resolve();
    }
  }

  async waitIfPaused() {
    if (!this.isPaused) return;
    await new Promise(resolve => this.pauseResolvers.push(resolve));
  }

  /**
   * Scans a FileSystemDirectoryHandle lazily.
   * @param {FileSystemDirectoryHandle} rootHandle
   * @param {{
   *   sourceId: string,
   *   sourceName: string,
   *   filters: Object,
   *   existingFingerprints?: Set<string>,
   *   outputDirHandle?: FileSystemDirectoryHandle,
   *   signal?: AbortSignal,
   *   onProgress?: (stats: Object) => void,
   *   onFileAccepted?: (fileRecord: Object) => void
   * }} options
   */
  async scanDirectoryHandle(rootHandle, options) {
    const stats = {
      foldersDiscovered: 1,
      filesScanned: 0,
      eligibleFiles: 0,
      ignoredFiles: 0,
      totalEligibleBytes: 0,
      currentFolder: options.sourceName || rootHandle.name || 'Root',
      startedAt: Date.now(),
      elapsedMs: 0,
      errors: []
    };

    const existingFingerprints = options.existingFingerprints || new Set();
    const filters = options.filters || {};

    const walk = async (dirHandle, relativePrefix) => {
      if (options.signal?.aborted) {
        throw new DOMException('Directory scan canceled', 'AbortError');
      }
      await this.waitIfPaused();

      // Prevent recursive output-folder re-import loop
      if (options.outputDirHandle && typeof dirHandle.isSameEntry === 'function') {
        try {
          if (await dirHandle.isSameEntry(options.outputDirHandle)) {
            stats.ignoredFiles++;
            return;
          }
        } catch (_) {}
      }

      stats.currentFolder = relativePrefix || options.sourceName || dirHandle.name;

      let iterator;
      try {
        iterator = dirHandle.values();
      } catch (err) {
        stats.errors.push({ path: relativePrefix, message: err.message || 'Directory unreadable' });
        return;
      }

      for await (const entry of iterator) {
        if (options.signal?.aborted) {
          throw new DOMException('Directory scan canceled', 'AbortError');
        }
        await this.waitIfPaused();

        const entryName = entry.name || '';
        if (IGNORED_SYSTEM_DIRS.has(entryName)) {
          continue;
        }
        if (!filters.includeHiddenFiles && entryName.startsWith('.')) {
          stats.ignoredFiles++;
          continue;
        }

        const relPath = sanitizeRelativePath(relativePrefix ? `${relativePrefix}/${entryName}` : entryName);

        if (entry.kind === 'directory') {
          if (filters.includeNestedFolders !== false) {
            stats.foldersDiscovered++;
            await walk(entry, relPath);
          }
        } else if (entry.kind === 'file') {
          stats.filesScanned++;
          try {
            const fileObj = await entry.getFile();
            const candidateInfo = {
              name: fileObj.name,
              size: fileObj.size,
              type: fileObj.type,
              lastModified: fileObj.lastModified,
              relativePath: relPath
            };

            const fingerprint = createFileFingerprint(candidateInfo);
            if (existingFingerprints.has(fingerprint)) {
              stats.ignoredFiles++;
              continue;
            }

            const evalResult = evaluateFileEligibility(candidateInfo, filters);
            if (!evalResult.eligible) {
              stats.ignoredFiles++;
            } else {
              existingFingerprints.add(fingerprint);
              stats.eligibleFiles++;
              stats.totalEligibleBytes += fileObj.size || 0;

              const record = {
                id: createId('file'),
                sourceId: options.sourceId,
                sourceName: options.sourceName,
                name: fileObj.name,
                relativePath: relPath,
                size: fileObj.size,
                type: fileObj.type || '',
                lastModified: fileObj.lastModified || Date.now(),
                extension: evalResult.classification.extension,
                category: evalResult.classification.category,
                emoji: evalResult.classification.emoji,
                previewKind: evalResult.classification.previewKind,
                isPreviewable: evalResult.classification.isPreviewable,
                isCompressibleImage: evalResult.classification.isCompressibleImage,
                status: 'unsorted', // 'unsorted' | 'sorted' | 'skipped' | 'review-later'
                favorite: false,
                assignedDestinationId: null,
                sortedOutputName: null,
                fileHandle: entry,
                parentDirHandle: dirHandle,
                fallbackFile: null,
                fingerprint
              };
              if (options.onFileAccepted) {
                options.onFileAccepted(record);
              }
            }
          } catch (fileErr) {
            stats.errors.push({ path: relPath, message: fileErr.message || 'File inaccessible' });
          }

          if (stats.filesScanned % 20 === 0 && options.onProgress) {
            stats.elapsedMs = Date.now() - stats.startedAt;
            options.onProgress({ ...stats });
          }
        }
      }
    };

    await walk(rootHandle, '');
    stats.elapsedMs = Date.now() - stats.startedAt;
    if (options.onProgress) options.onProgress({ ...stats });
    return stats;
  }

  /**
   * Scans a standard FileList or Array<File> (from <input type="file"> or drag-and-drop).
   * @param {Iterable<File>} fileList
   * @param {{
   *   sourceId: string,
   *   sourceName: string,
   *   filters: Object,
   *   existingFingerprints?: Set<string>,
   *   signal?: AbortSignal,
   *   onProgress?: (stats: Object) => void,
   *   onFileAccepted?: (fileRecord: Object) => void
   * }} options
   */
  async scanFileList(fileList, options) {
    const files = Array.from(fileList || []);
    const stats = {
      foldersDiscovered: 1,
      filesScanned: 0,
      eligibleFiles: 0,
      ignoredFiles: 0,
      totalEligibleBytes: 0,
      currentFolder: options.sourceName || 'Selected Files',
      startedAt: Date.now(),
      elapsedMs: 0,
      errors: []
    };

    const seenFolders = new Set();
    const existingFingerprints = options.existingFingerprints || new Set();
    const filters = options.filters || {};

    for (let i = 0; i < files.length; i++) {
      if (options.signal?.aborted) {
        throw new DOMException('File scan canceled', 'AbortError');
      }
      await this.waitIfPaused();

      const fileObj = files[i];
      const rawRel = fileObj.webkitRelativePath || fileObj.name;
      const relPath = sanitizeRelativePath(rawRel);

      if (relPath.includes('/')) {
        const folderPart = relPath.slice(0, relPath.lastIndexOf('/'));
        if (!seenFolders.has(folderPart)) {
          seenFolders.add(folderPart);
          stats.foldersDiscovered = 1 + seenFolders.size;
        }
        if (filters.includeNestedFolders === false && folderPart.includes('/')) {
          stats.ignoredFiles++;
          continue;
        }
      }

      if (relPath.split('/').some(seg => IGNORED_SYSTEM_DIRS.has(seg))) {
        stats.ignoredFiles++;
        continue;
      }

      stats.filesScanned++;
      const candidateInfo = {
        name: fileObj.name,
        size: fileObj.size,
        type: fileObj.type,
        lastModified: fileObj.lastModified,
        relativePath: relPath
      };

      const fingerprint = createFileFingerprint(candidateInfo);
      if (existingFingerprints.has(fingerprint)) {
        stats.ignoredFiles++;
        continue;
      }

      const evalResult = evaluateFileEligibility(candidateInfo, filters);
      if (!evalResult.eligible) {
        stats.ignoredFiles++;
      } else {
        existingFingerprints.add(fingerprint);
        stats.eligibleFiles++;
        stats.totalEligibleBytes += fileObj.size || 0;

        const record = {
          id: createId('file'),
          sourceId: options.sourceId,
          sourceName: options.sourceName,
          name: fileObj.name,
          relativePath: relPath,
          size: fileObj.size,
          type: fileObj.type || '',
          lastModified: fileObj.lastModified || Date.now(),
          extension: evalResult.classification.extension,
          category: evalResult.classification.category,
          emoji: evalResult.classification.emoji,
          previewKind: evalResult.classification.previewKind,
          isPreviewable: evalResult.classification.isPreviewable,
          isCompressibleImage: evalResult.classification.isCompressibleImage,
          status: 'unsorted',
          favorite: false,
          assignedDestinationId: null,
          sortedOutputName: null,
          fileHandle: null,
          parentDirHandle: null,
          fallbackFile: fileObj,
          fingerprint
        };

        if (options.onFileAccepted) {
          options.onFileAccepted(record);
        }
      }

      if (i % 50 === 0 && options.onProgress) {
        stats.elapsedMs = Date.now() - stats.startedAt;
        options.onProgress({ ...stats });
        await new Promise(r => setTimeout(r, 0));
      }
    }

    stats.elapsedMs = Date.now() - stats.startedAt;
    if (options.onProgress) options.onProgress({ ...stats });
    return stats;
  }
}
