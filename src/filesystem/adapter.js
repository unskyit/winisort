import { normalizeError } from '../core/errors.js';
import { verifyHandlePermission } from './permission-manager.js';

/**
 * Browser-aware filesystem adapter supporting both native File System Access API
 * and read-only / export fallback mode.
 */
export class FilesystemAdapter {
  constructor(capabilities) {
    this.capabilities = capabilities;
  }

  isNativeWritableSupported() {
    return Boolean(this.capabilities?.hasDirectoryPicker);
  }

  /**
   * Opens a native directory picker (must originate from user gesture).
   * @param {{ id?: string, mode?: 'read' | 'readwrite', startIn?: string }} [options]
   * @returns {Promise<FileSystemDirectoryHandle>}
   */
  async pickDirectory(options = {}) {
    if (!this.isNativeWritableSupported()) {
      throw new Error('Native directory picker is not available in this browser.');
    }
    try {
      const handle = await window.showDirectoryPicker({
        mode: options.mode || 'read',
        startIn: options.startIn || 'pictures'
      });
      return handle;
    } catch (err) {
      throw normalizeError(err, 'Directory selection');
    }
  }

  /**
   * Ensures a subdirectory exists inside a parent FileSystemDirectoryHandle.
   * @param {FileSystemDirectoryHandle} parentHandle
   * @param {string} dirName
   * @param {boolean} [create=true]
   * @returns {Promise<FileSystemDirectoryHandle>}
   */
  async getSubdirectory(parentHandle, dirName, create = true) {
    try {
      const ok = await verifyHandlePermission(parentHandle, create ? 'readwrite' : 'read', true);
      if (!ok) {
        const err = new Error('Permission not granted for target directory.');
        err.name = 'NotAllowedError';
        throw err;
      }
      return await parentHandle.getDirectoryHandle(dirName, { create });
    } catch (err) {
      throw normalizeError(err, `Accessing folder "${dirName}"`);
    }
  }

  /**
   * Checks whether a file exists inside a directory handle without modifying it.
   * @param {FileSystemDirectoryHandle} dirHandle
   * @param {string} filename
   * @returns {Promise<boolean>}
   */
  async fileExists(dirHandle, filename) {
    if (!dirHandle || typeof dirHandle.getFileHandle !== 'function') return false;
    try {
      await dirHandle.getFileHandle(filename, { create: false });
      return true;
    } catch (err) {
      if (err && err.name === 'NotFoundError') return false;
      return false;
    }
  }

  /**
   * Removes a specific file entry from a directory handle (used only for verified app-managed undo or explicit move).
   * @param {FileSystemDirectoryHandle} dirHandle
   * @param {string} filename
   */
  async removeFileEntry(dirHandle, filename) {
    try {
      await dirHandle.removeEntry(filename, { recursive: false });
    } catch (err) {
      throw normalizeError(err, `Removing "${filename}"`);
    }
  }
}
