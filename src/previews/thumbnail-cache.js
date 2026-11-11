import { ResourceTracker } from '../utils/cleanup.js';

/**
 * Memory-bounded on-demand thumbnail cache.
 * Never decodes the entire library simultaneously and never persists full-resolution media in IndexedDB.
 */
export class ThumbnailCache {
  constructor(maxEntries = 48) {
    this.maxEntries = maxEntries;
    this.tracker = new ResourceTracker(maxEntries);
    /** @type {Map<string, string>} fileId -> dataUrl or objectUrl */
    this.cache = new Map();
  }

  has(fileId) {
    return this.cache.has(fileId);
  }

  get(fileId) {
    if (!this.cache.has(fileId)) return null;
    const val = this.cache.get(fileId);
    // Refresh LRU order
    this.cache.delete(fileId);
    this.cache.set(fileId, val);
    return val;
  }

  /**
   * Generates a compact 96x96 downscaled thumbnail data URL for an image file on demand.
   * @param {Object} fileRecord
   * @param {Blob|File} blob
   * @returns {Promise<string|null>}
   */
  async getOrCreateThumbnail(fileRecord, blob) {
    if (!fileRecord || fileRecord.previewKind !== 'image' || !blob) return null;
    if (this.cache.has(fileRecord.id)) {
      return this.get(fileRecord.id);
    }

    // Evict oldest if over budget
    if (this.cache.size >= this.maxEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.tracker.revokeKey(oldestKey);
        this.cache.delete(oldestKey);
      }
    }

    if (typeof createImageBitmap === 'function' && typeof document !== 'undefined' && fileRecord.extension !== 'svg') {
      try {
        const bmp = await createImageBitmap(blob, {
          resizeWidth: 96,
          resizeHeight: 96,
          resizeQuality: 'low'
        });
        const canvas = document.createElement('canvas');
        canvas.width = bmp.width;
        canvas.height = bmp.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bmp, 0, 0);
        bmp.close();
        const thumbUrl = canvas.toDataURL('image/webp', 0.72);
        this.cache.set(fileRecord.id, thumbUrl);
        return thumbUrl;
      } catch (_) {}
    }

    // Fallback to tracked ObjectURL if small image
    if (blob.size <= 4 * 1024 * 1024) {
      const objUrl = this.tracker.acquireObjectUrl(fileRecord.id, blob);
      this.cache.set(fileRecord.id, objUrl);
      return objUrl;
    }

    return null;
  }

  clear() {
    this.tracker.disposeAll();
    this.cache.clear();
  }
}
