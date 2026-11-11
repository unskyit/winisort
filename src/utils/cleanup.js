/**
 * Tracks Object URLs and ImageBitmaps to guarantee prompt revocation and avoid memory leaks.
 */
export class ResourceTracker {
  constructor(maxObjectUrls = 48) {
    this.maxObjectUrls = maxObjectUrls;
    /** @type {Map<string, { url: string, createdAt: number }>} */
    this.urlMap = new Map();
    /** @type {Set<ImageBitmap>} */
    this.bitmaps = new Set();
  }

  /**
   * Creates or returns an Object URL for a key, automatically evicting the oldest if over budget.
   * @param {string} key
   * @param {Blob|File} blob
   * @returns {string}
   */
  acquireObjectUrl(key, blob) {
    if (this.urlMap.has(key)) {
      const entry = this.urlMap.get(key);
      entry.createdAt = Date.now();
      return entry.url;
    }

    if (this.urlMap.size >= this.maxObjectUrls) {
      const oldestKey = this.urlMap.keys().next().value;
      if (oldestKey) {
        this.revokeKey(oldestKey);
      }
    }

    const url = URL.createObjectURL(blob);
    this.urlMap.set(key, { url, createdAt: Date.now() });
    return url;
  }

  /**
   * Revokes the Object URL associated with a key.
   * @param {string} key
   */
  revokeKey(key) {
    const entry = this.urlMap.get(key);
    if (entry) {
      try {
        URL.revokeObjectURL(entry.url);
      } catch (_) {}
      this.urlMap.delete(key);
    }
  }

  /**
   * Registers an ImageBitmap for managed disposal.
   * @param {ImageBitmap} bitmap
   */
  registerBitmap(bitmap) {
    if (bitmap && typeof bitmap.close === 'function') {
      this.bitmaps.add(bitmap);
    }
  }

  /**
   * Disposes all tracked Object URLs and ImageBitmaps.
   */
  disposeAll() {
    for (const [, entry] of this.urlMap) {
      try {
        URL.revokeObjectURL(entry.url);
      } catch (_) {}
    }
    this.urlMap.clear();

    for (const bmp of this.bitmaps) {
      try {
        bmp.close();
      } catch (_) {}
    }
    this.bitmaps.clear();
  }

  getActiveCount() {
    return {
      objectUrls: this.urlMap.size,
      bitmaps: this.bitmaps.size
    };
  }
}

export const sharedResourceTracker = new ResourceTracker(48);
