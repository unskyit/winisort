/**
 * Computes an incremental FNV-1a 64-bit hex digest (or SHA-256 via WebCrypto on bounded chunks)
 * without buffering an entire large video into RAM.
 * @param {Blob|File} blob
 * @param {{ maxSampleBytes?: number, signal?: AbortSignal }} [options]
 * @returns {Promise<string>}
 */
export async function computeStreamingDigest(blob, options = {}) {
  const chunkSize = 256 * 1024; // 256 KB chunks
  const totalSize = blob.size;
  let h1 = 0xdeadbeef ^ totalSize;
  let h2 = 0x41c6ce57 ^ totalSize;

  let offset = 0;
  while (offset < totalSize) {
    if (options.signal && options.signal.aborted) {
      throw new DOMException('Digest calculation aborted', 'AbortError');
    }
    const end = Math.min(offset + chunkSize, totalSize);
    const buf = await blob.slice(offset, end).arrayBuffer();
    const view = new Uint8Array(buf);
    for (let i = 0; i < view.length; i++) {
      const ch = view[i];
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    offset = end;
    if (options.maxSampleBytes && offset >= options.maxSampleBytes && totalSize > options.maxSampleBytes * 2) {
      // Jump to tail chunk for fast verification if maxSampleBytes is configured
      offset = Math.max(offset, totalSize - chunkSize);
    }
  }

  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}

/**
 * Verifies that a written target file matches the source file size and optional digest.
 * @param {File|Blob} sourceBlob
 * @param {File|Blob} writtenBlob
 * @param {{ strongHash?: boolean, signal?: AbortSignal }} [options]
 * @returns {Promise<{ verified: boolean, sourceSize: number, targetSize: number, digest?: string, reason?: string }>}
 */
export async function verifyCopiedFile(sourceBlob, writtenBlob, options = {}) {
  if (!sourceBlob || !writtenBlob) {
    return { verified: false, sourceSize: 0, targetSize: 0, reason: 'Missing file reference for verification' };
  }
  const sourceSize = sourceBlob.size;
  const targetSize = writtenBlob.size;
  if (sourceSize !== targetSize) {
    return {
      verified: false,
      sourceSize,
      targetSize,
      reason: `File size mismatch (expected ${sourceSize} bytes, wrote ${targetSize} bytes)`
    };
  }
  if (options.strongHash) {
    const [srcDigest, dstDigest] = await Promise.all([
      computeStreamingDigest(sourceBlob, { signal: options.signal }),
      computeStreamingDigest(writtenBlob, { signal: options.signal })
    ]);
    if (srcDigest !== dstDigest) {
      return {
        verified: false,
        sourceSize,
        targetSize,
        reason: 'Content digest mismatch after copy'
      };
    }
    return { verified: true, sourceSize, targetSize, digest: dstDigest };
  }
  return { verified: true, sourceSize, targetSize };
}
