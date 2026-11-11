import { createId, createFileFingerprint } from '../../src/utils/ids.js';
import { classifyFile } from '../../src/filesystem/file-classifier.js';

/**
 * Generates lightweight synthetic metadata fixtures for 100, 1,000, 10,000, or 50,000 files
 * and 100 destination folders without allocating gigabytes of disk space.
 */
export function generateSyntheticMetadataFixtures(fileCount = 1000) {
  const exts = ['jpg', 'png', 'webp', 'mp4', 'mp3', 'pdf', 'docx', 'csv', 'zip'];
  const records = [];
  for (let i = 0; i < fileCount; i++) {
    const ext = exts[i % exts.length];
    const name = `Media_Item_${String(i + 1).padStart(6, '0')}.${ext}`;
    const size = 1024 * ((i % 500) + 1);
    const lastModified = 1700000000000 + i * 1000;
    const relativePath = `Folder_${Math.floor(i / 100)}/${name}`;
    const cls = classifyFile({ name, size });
    records.push({
      id: `syn_${i}`,
      sourceId: 'src_synthetic',
      sourceName: 'Synthetic Benchmark Source',
      name,
      relativePath,
      size,
      type: '',
      lastModified,
      extension: cls.extension,
      category: cls.category,
      emoji: cls.emoji,
      previewKind: cls.previewKind,
      isPreviewable: cls.isPreviewable,
      isCompressibleImage: cls.isCompressibleImage,
      status: 'unsorted',
      favorite: i % 25 === 0,
      assignedDestinationId: null,
      sortedOutputName: null,
      fingerprint: createFileFingerprint({ name, size, lastModified, relativePath })
    });
  }
  return records;
}

/**
 * Controlled in-memory FileSystemDirectoryHandle & FileSystemFileHandle test double
 * for deterministic integration testing of copy, collision, permission failure, partial write, and undo.
 */
export class MockFileSystemFileHandle {
  constructor(name, contentBytes = new Uint8Array([1, 2, 3, 4]), options = {}) {
    this.kind = 'file';
    this.name = name;
    this.bytes = contentBytes instanceof Uint8Array
      ? contentBytes
      : new TextEncoder().encode(String(contentBytes));
    this.lastModified = options.lastModified || Date.now();
    this.failWriteMidway = Boolean(options.failWriteMidway);
    this.truncateOnWrite = Boolean(options.truncateOnWrite);
  }

  async getFile() {
    const blob = new Blob([this.bytes]);
    blob.name = this.name;
    blob.lastModified = this.lastModified;
    return blob;
  }

  async createWritable() {
    const chunks = [];
    const self = this;
    return {
      async write(chunk) {
        if (self.failWriteMidway) {
          const err = new Error('Simulated mid-stream IO interruption');
          err.name = 'InvalidStateError';
          throw err;
        }
        if (chunk instanceof Blob) {
          const ab = await chunk.arrayBuffer();
          chunks.push(new Uint8Array(ab));
        } else if (typeof chunk === 'string') {
          chunks.push(new TextEncoder().encode(chunk));
        } else if (chunk instanceof Uint8Array) {
          chunks.push(chunk);
        }
      },
      async close() {
        let total = chunks.reduce((acc, c) => acc + c.byteLength, 0);
        if (self.truncateOnWrite && total > 1) {
          total = Math.floor(total / 2); // Simulate partial/truncated write
        }
        const merged = new Uint8Array(total);
        let offset = 0;
        for (const c of chunks) {
          const slice = c.subarray(0, Math.min(c.byteLength, total - offset));
          merged.set(slice, offset);
          offset += slice.byteLength;
          if (offset >= total) break;
        }
        self.bytes = merged;
        self.lastModified = Date.now();
      },
      async abort() {}
    };
  }
}

export class MockFileSystemDirectoryHandle {
  constructor(name, options = {}) {
    this.kind = 'directory';
    this.name = name;
    this.entriesMap = new Map();
    this.permissionState = options.permissionState || 'granted';
    this.truncateWrites = Boolean(options.truncateWrites);
    this.failWrites = Boolean(options.failWrites);
  }

  async queryPermission() {
    return this.permissionState;
  }

  async requestPermission() {
    return this.permissionState;
  }

  async isSameEntry(other) {
    return this === other;
  }

  async getDirectoryHandle(name, options = {}) {
    if (this.permissionState !== 'granted') {
      const err = new Error('Permission denied');
      err.name = 'NotAllowedError';
      throw err;
    }
    if (this.entriesMap.has(name)) {
      const existing = this.entriesMap.get(name);
      if (existing.kind !== 'directory') throw new Error('Not a directory');
      return existing;
    }
    if (!options.create) {
      const err = new Error(`Directory "${name}" not found`);
      err.name = 'NotFoundError';
      throw err;
    }
    const sub = new MockFileSystemDirectoryHandle(name);
    this.entriesMap.set(name, sub);
    return sub;
  }

  async getFileHandle(name, options = {}) {
    if (this.permissionState !== 'granted') {
      const err = new Error('Permission denied');
      err.name = 'NotAllowedError';
      throw err;
    }
    if (this.entriesMap.has(name)) {
      return this.entriesMap.get(name);
    }
    if (!options.create) {
      const err = new Error(`File "${name}" not found`);
      err.name = 'NotFoundError';
      throw err;
    }
    const fh = new MockFileSystemFileHandle(name, new Uint8Array(0), {
      failWriteMidway: this.failWrites,
      truncateOnWrite: this.truncateWrites
    });
    this.entriesMap.set(name, fh);
    return fh;
  }

  async removeEntry(name) {
    if (!this.entriesMap.has(name)) {
      const err = new Error(`Entry "${name}" not found`);
      err.name = 'NotFoundError';
      throw err;
    }
    this.entriesMap.delete(name);
  }

  async *values() {
    for (const val of this.entriesMap.values()) {
      yield val;
    }
  }
}
