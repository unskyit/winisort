import { computeStreamingDigest } from '../filesystem/verification.js';

/**
 * Two-stage duplicate detector:
 * Stage 1: Fast candidate grouping by exact byte size (and optional normalized stem).
 * Stage 2: Incremental streaming content-hash verification on bounded chunks.
 * Never claims two files are identical by filename alone, and never automatically deletes duplicates.
 */
export class DuplicateDetector {
  constructor(store, copyEngine) {
    this.store = store;
    this.copyEngine = copyEngine;
  }

  /**
   * Finds fast duplicate candidate groups (files sharing identical non-zero byte size).
   * @returns {Array<{ size: number, files: Array<Object>, verifiedHash?: string }>}
   */
  findCandidateGroups() {
    const bySize = new Map();
    for (const file of this.store.files.values()) {
      if (!file.size || file.size <= 0) continue;
      if (!bySize.has(file.size)) {
        bySize.set(file.size, []);
      }
      bySize.get(file.size).push(file);
    }

    const groups = [];
    for (const [size, files] of bySize.entries()) {
      if (files.length > 1) {
        groups.push({ size, files, verified: false });
      }
    }
    groups.sort((a, b) => b.size - a.size);
    return groups;
  }

  /**
   * Performs strong incremental content-hash verification across candidate groups.
   * @param {{ signal?: AbortSignal }} [options]
   * @returns {Promise<Array<{ hash: string, size: number, files: Array<Object> }>>}
   */
  async verifyExactDuplicates(options = {}) {
    const candidateGroups = this.findCandidateGroups();
    const exactGroups = [];

    for (const group of candidateGroups) {
      const byHash = new Map();
      for (const fileRecord of group.files) {
        if (options.signal?.aborted) {
          throw new DOMException('Duplicate verification aborted', 'AbortError');
        }
        try {
          const blob = await this.copyEngine.resolveSourceFile(fileRecord);
          const digest = await computeStreamingDigest(blob, { signal: options.signal });
          if (!byHash.has(digest)) byHash.set(digest, []);
          byHash.get(digest).push(fileRecord);
        } catch (_) {}
      }

      for (const [hash, matchedFiles] of byHash.entries()) {
        if (matchedFiles.length > 1) {
          exactGroups.push({
            hash,
            size: group.size,
            files: matchedFiles,
            verified: true
          });
        }
      }
    }

    return exactGroups;
  }
}
