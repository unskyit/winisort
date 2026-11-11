import { createId } from '../utils/ids.js';
import { validateDestinationName } from '../utils/sanitizer.js';
import { DESTINATION_PALETTE } from '../core/configuration.js';
import { classifyFile } from './file-classifier.js';
import { WiniSortError, ErrorCode } from '../core/errors.js';

export class DestinationManager {
  constructor(store, adapter) {
    this.store = store;
    this.adapter = adapter;
  }

  _createEmptyStats() {
    return {
      fileCount: 0,
      totalBytes: 0,
      imagesCount: 0,
      videosCount: 0,
      audioCount: 0,
      pdfCount: 0,
      documentsCount: 0,
      otherCount: 0,
      lastAddedAt: null,
      lastAddedName: null,
      pendingCount: 0,
      failedCount: 0,
      verifiedFromDisk: false
    };
  }

  /**
   * Selects or updates the root output directory where all destination folders are created.
   * @param {FileSystemDirectoryHandle} dirHandle
   */
  async setOutputRootDirectory(dirHandle) {
    this.store.project.outputRootHandle = dirHandle;
    this.store.project.outputRootName = dirHandle.name || 'Output Folder';
    this.store.project.isDirty = true;

    // Bind any existing unbound destinations as subdirectories of this output root
    for (const dest of this.store.destinations.values()) {
      if (!dest.dirHandle && !dest.isExternalConnection) {
        try {
          dest.dirHandle = await this.adapter.getSubdirectory(dirHandle, dest.folderName, true);
          dest.stats.verifiedFromDisk = true;
        } catch (_) {}
      }
    }
    this.store.notify('destinations');
  }

  /**
   * Creates a new sorting destination folder.
   * Never reports success before disk directory creation is confirmed when outputRootHandle is connected.
   * @param {{
   *   name: string,
   *   emoji?: string,
   *   color?: string,
   *   bank?: 'top' | 'left' | 'right' | 'bottom',
   *   pinned?: boolean,
   *   shortcut?: string,
   *   collection?: string,
   *   quotaBytes?: number
   * }} config
   */
  async createDestination(config) {
    const validation = validateDestinationName(config?.name || '');
    if (!validation.valid) {
      throw new WiniSortError(ErrorCode.DESTINATION_COLLISION, validation.reason);
    }

    const cleanName = validation.sanitized;

    // Check duplicate name among active destinations
    for (const existing of this.store.destinations.values()) {
      if (existing.name.toLowerCase() === cleanName.toLowerCase()) {
        throw new WiniSortError(
          ErrorCode.DESTINATION_COLLISION,
          `A destination named "${cleanName}" already exists.`
        );
      }
    }

    const paletteIdx = this.store.destinations.size % DESTINATION_PALETTE.length;
    const defaultColor = DESTINATION_PALETTE[paletteIdx].hex;

    let dirHandle = null;
    let verifiedFromDisk = false;

    if (this.store.project.outputRootHandle) {
      dirHandle = await this.adapter.getSubdirectory(this.store.project.outputRootHandle, cleanName, true);
      verifiedFromDisk = true;
    }

    const id = createId('dest');
    const shortcutNumber = config.shortcut || (this.store.destinations.size < 9 ? String(this.store.destinations.size + 1) : '');

    const dest = {
      id,
      name: cleanName,
      folderName: cleanName,
      emoji: config.emoji || '📁',
      color: config.color || defaultColor,
      bank: config.bank || this.store.preferences.defaultBankPlacement || 'left',
      pinned: Boolean(config.pinned),
      favorite: Boolean(config.favorite),
      shortcut: shortcutNumber,
      collection: config.collection || 'General',
      quotaBytes: Number(config.quotaBytes || 0),
      createdAt: Date.now(),
      isAppCreated: true,
      isExternalConnection: false,
      dirHandle,
      exportedFiles: new Map(), // used in fallback mode for ZIP export
      stats: {
        ...this._createEmptyStats(),
        verifiedFromDisk
      }
    };

    this.store.destinations.set(id, dest);
    this.store.project.isDirty = true;
    this.store.notify('destinations', dest);
    return dest;
  }

  /**
   * Connects an existing disk folder as a sorting destination, indexing its current files without modifying them.
   * @param {FileSystemDirectoryHandle} dirHandle
   * @param {{ bank?: string, emoji?: string, color?: string }} [options]
   */
  async connectExistingDestination(dirHandle, options = {}) {
    const cleanName = validateDestinationName(dirHandle.name || 'Connected Folder').sanitized;
    const stats = this._createEmptyStats();

    try {
      for await (const entry of dirHandle.values()) {
        if (entry.kind === 'file' && !entry.name.startsWith('.')) {
          const f = await entry.getFile();
          const cls = classifyFile(f);
          stats.fileCount++;
          stats.totalBytes += f.size || 0;
          this._incrementCategoryCounter(stats, cls.category, 1);
        }
      }
      stats.verifiedFromDisk = true;
    } catch (_) {}

    const paletteIdx = this.store.destinations.size % DESTINATION_PALETTE.length;
    const id = createId('dest');
    const dest = {
      id,
      name: cleanName,
      folderName: dirHandle.name,
      emoji: options.emoji || '📂',
      color: options.color || DESTINATION_PALETTE[paletteIdx].hex,
      bank: options.bank || 'right',
      pinned: true,
      favorite: false,
      shortcut: this.store.destinations.size < 9 ? String(this.store.destinations.size + 1) : '',
      collection: 'Connected Folders',
      quotaBytes: 0,
      createdAt: Date.now(),
      isAppCreated: false,
      isExternalConnection: true,
      dirHandle,
      exportedFiles: new Map(),
      stats
    };

    this.store.destinations.set(id, dest);
    this.store.project.isDirty = true;
    this.store.notify('destinations', dest);
    return dest;
  }

  updateDestination(destId, updates) {
    const dest = this.store.destinations.get(destId);
    if (!dest) return null;
    if (updates.name && updates.name !== dest.name) {
      const v = validateDestinationName(updates.name);
      if (v.valid) dest.name = v.sanitized;
    }
    if (updates.emoji) dest.emoji = updates.emoji;
    if (updates.color) dest.color = updates.color;
    if (updates.bank) dest.bank = updates.bank;
    if (typeof updates.pinned === 'boolean') dest.pinned = updates.pinned;
    if (typeof updates.favorite === 'boolean') dest.favorite = updates.favorite;
    if (typeof updates.shortcut === 'string') dest.shortcut = updates.shortcut;
    if (typeof updates.collection === 'string') dest.collection = updates.collection;
    if (typeof updates.quotaBytes === 'number') dest.quotaBytes = updates.quotaBytes;

    this.store.project.isDirty = true;
    this.store.notify('destinations', dest);
    return dest;
  }

  duplicateDestinationConfig(destId) {
    const src = this.store.destinations.get(destId);
    if (!src) return null;
    return this.createDestination({
      name: `${src.name} Copy`,
      emoji: src.emoji,
      color: src.color,
      bank: src.bank,
      pinned: src.pinned,
      collection: src.collection,
      quotaBytes: src.quotaBytes
    });
  }

  removeDestinationFromWorkspace(destId) {
    const dest = this.store.destinations.get(destId);
    if (!dest) return false;
    this.store.destinations.delete(destId);
    this.store.notify('destinations');
    return true;
  }

  recordAddition(destId, fileRecord, writtenBytes) {
    const dest = this.store.destinations.get(destId);
    if (!dest) return;
    dest.stats.fileCount++;
    dest.stats.totalBytes += writtenBytes ?? fileRecord.size ?? 0;
    this._incrementCategoryCounter(dest.stats, fileRecord.category, 1);
    dest.stats.lastAddedAt = Date.now();
    dest.stats.lastAddedName = fileRecord.sortedOutputName || fileRecord.name;

    // Update recent destinations list
    const recent = this.store.ui.recentDestinationIds.filter(id => id !== destId);
    recent.unshift(destId);
    this.store.ui.recentDestinationIds = recent.slice(0, 8);
  }

  recordRemoval(destId, fileRecord, removedBytes) {
    const dest = this.store.destinations.get(destId);
    if (!dest) return;
    dest.stats.fileCount = Math.max(0, dest.stats.fileCount - 1);
    dest.stats.totalBytes = Math.max(0, dest.stats.totalBytes - (removedBytes ?? fileRecord.size ?? 0));
    this._incrementCategoryCounter(dest.stats, fileRecord.category, -1);
  }

  _incrementCategoryCounter(stats, category, delta) {
    if (category === 'images') stats.imagesCount = Math.max(0, stats.imagesCount + delta);
    else if (category === 'videos') stats.videosCount = Math.max(0, stats.videosCount + delta);
    else if (category === 'audio') stats.audioCount = Math.max(0, stats.audioCount + delta);
    else if (category === 'pdf') stats.pdfCount = Math.max(0, stats.pdfCount + delta);
    else if (['documents', 'spreadsheets', 'presentations', 'ebooks'].includes(category)) {
      stats.documentsCount = Math.max(0, stats.documentsCount + delta);
    } else {
      stats.otherCount = Math.max(0, stats.otherCount + delta);
    }
  }
}
