import { resolveFilenameCollision } from './collision-handler.js';
import { verifyCopiedFile } from './verification.js';
import { verifyHandlePermission } from './permission-manager.js';
import { WiniSortError, ErrorCode, normalizeError } from '../core/errors.js';

const STREAM_CHUNK_SIZE = 512 * 1024; // 512 KB controlled streaming buffer

/**
 * Executes real, verified streaming file copies (and optional verified moves) to destination folders.
 * Never buffers entire large files into RAM when streaming is supported.
 */
export class CopyEngine {
  constructor(store, adapter, destinationManager) {
    this.store = store;
    this.adapter = adapter;
    this.destinationManager = destinationManager;
  }

  /**
   * Resolves the underlying File object for a fileRecord.
   * @param {Object} fileRecord
   * @returns {Promise<File>}
   */
  async resolveSourceFile(fileRecord) {
    if (fileRecord.fallbackFile instanceof Blob) {
      return fileRecord.fallbackFile;
    }
    if (fileRecord.fileHandle && typeof fileRecord.fileHandle.getFile === 'function') {
      try {
        return await fileRecord.fileHandle.getFile();
      } catch (err) {
        throw normalizeError(err, `Reading source file "${fileRecord.name}"`);
      }
    }
    throw new WiniSortError(
      ErrorCode.SOURCE_FILE_MOVED,
      `Source file "${fileRecord.name}" is no longer accessible.`
    );
  }

  /**
   * Copies (or moves) a single fileRecord to a target destination.
   * @param {Object} fileRecord
   * @param {Object} destination
   * @param {{
   *   signal?: AbortSignal,
   *   collisionPolicy?: string,
   *   dryRun?: boolean,
   *   customOutputName?: string,
   *   onProgress?: (bytesWritten: number, totalBytes: number) => void
   * }} [options]
   */
  async executeFileCopy(fileRecord, destination, options = {}) {
    if (!fileRecord || !destination) {
      throw new Error('Missing file or destination for sorting operation.');
    }

    const dryRun = options.dryRun ?? this.store.preferences.dryRunMode;
    const collisionPolicy = options.collisionPolicy || this.store.preferences.collisionPolicy || 'keep-both';
    const desiredName = options.customOutputName || fileRecord.name;

    // 1. Verify source availability
    const sourceFile = await this.resolveSourceFile(fileRecord);
    const totalBytes = sourceFile.size;

    // 2. Ensure destination handle is connected if outputRootHandle exists
    if (!destination.dirHandle && this.store.project.outputRootHandle) {
      destination.dirHandle = await this.adapter.getSubdirectory(
        this.store.project.outputRootHandle,
        destination.folderName,
        true
      );
    }

    // 3. Resolve filename collisions
    const existsFn = async (candidateName) => {
      if (destination.dirHandle) {
        return this.adapter.fileExists(destination.dirHandle, candidateName);
      }
      return destination.exportedFiles.has(candidateName);
    };

    const collision = await resolveFilenameCollision(desiredName, existsFn, { policy: collisionPolicy });
    if (collision.action === 'skip') {
      return {
        status: 'skipped-collision',
        finalName: collision.finalName,
        bytesWritten: 0,
        collided: true,
        mode: 'skip'
      };
    }

    if (dryRun) {
      return {
        status: 'dry-run',
        finalName: collision.finalName,
        bytesWritten: totalBytes,
        collided: collision.collided,
        mode: 'dry-run'
      };
    }

    // 4. Native FileSystemDirectoryHandle streaming write
    if (destination.dirHandle) {
      const hasPerm = await verifyHandlePermission(destination.dirHandle, 'readwrite', true);
      if (!hasPerm) {
        throw new WiniSortError(
          ErrorCode.DESTINATION_NOT_WRITABLE,
          `Destination "${destination.name}" is not writable. Permission was denied.`
        );
      }

      destination.stats.pendingCount++;
      let writable = null;
      let targetFileHandle = null;

      try {
        targetFileHandle = await destination.dirHandle.getFileHandle(collision.finalName, { create: true });
        writable = await targetFileHandle.createWritable();

        // Stream in controlled chunks so large videos are never read into a single ArrayBuffer
        let offset = 0;
        while (offset < totalBytes) {
          if (options.signal?.aborted) {
            throw new DOMException('Copy operation canceled', 'AbortError');
          }
          const end = Math.min(offset + STREAM_CHUNK_SIZE, totalBytes);
          const chunkBlob = sourceFile.slice(offset, end);
          await writable.write(chunkBlob);
          offset = end;
          if (options.onProgress) {
            options.onProgress(offset, totalBytes);
          }
        }

        await writable.close();
        writable = null;

        // Verify completion and final file size on disk
        const writtenFile = await targetFileHandle.getFile();
        const verification = await verifyCopiedFile(sourceFile, writtenFile, {
          strongHash: Boolean(this.store.preferences.verifyCopyIntegrity && totalBytes <= 25 * 1024 * 1024),
          signal: options.signal
        });

        if (!verification.verified) {
          throw new WiniSortError(
            ErrorCode.COPY_INTERRUPTED,
            `Verification failed for "${collision.finalName}": ${verification.reason}`
          );
        }

        // Optional MOVE mode (copy -> verify -> remove source only when explicitly authorized)
        let moveCompleted = false;
        let moveWarning = null;
        if (
          this.store.preferences.operationMode === 'move' &&
          this.store.preferences.allowSourceModification &&
          fileRecord.parentDirHandle
        ) {
          try {
            await this.adapter.removeFileEntry(fileRecord.parentDirHandle, fileRecord.name);
            moveCompleted = true;
          } catch (removeErr) {
            moveWarning = `Copy succeeded and was verified, but original source could not be removed (${removeErr.message}). Treated as completed copy.`;
          }
        }

        destination.stats.pendingCount = Math.max(0, destination.stats.pendingCount - 1);
        destination.stats.verifiedFromDisk = true;

        return {
          status: 'completed',
          finalName: collision.finalName,
          bytesWritten: totalBytes,
          collided: collision.collided,
          digest: verification.digest || null,
          mode: moveCompleted ? 'move-disk' : 'copy-disk',
          moveWarning,
          targetFileHandle
        };
      } catch (err) {
        destination.stats.pendingCount = Math.max(0, destination.stats.pendingCount - 1);
        destination.stats.failedCount++;
        if (writable && typeof writable.abort === 'function') {
          try { await writable.abort(); } catch (_) {}
        }
        throw normalizeError(err, `Copying "${fileRecord.name}" to "${destination.name}"`);
      }
    }

    // 5. Fallback session export staging (honestly labeled as session-staged for ZIP/download export)
    destination.exportedFiles.set(collision.finalName, {
      fileRecordId: fileRecord.id,
      name: collision.finalName,
      size: totalBytes,
      sourceFile
    });

    return {
      status: 'completed',
      finalName: collision.finalName,
      bytesWritten: totalBytes,
      collided: collision.collided,
      mode: 'session-export-staged'
    };
  }
}
