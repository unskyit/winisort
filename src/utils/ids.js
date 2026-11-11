let sequenceCounter = 0;

/**
 * Generates a stable, collision-resistant internal identifier with prefix.
 * @param {string} prefix
 * @returns {string}
 */
export function createId(prefix = 'id') {
  sequenceCounter = (sequenceCounter + 1) % 1000000;
  const ts = Date.now().toString(36);
  const rand = Math.floor(Math.random() * 0xFFFFFF).toString(36).padStart(4, '0');
  return `${prefix}_${ts}_${sequenceCounter.toString(36)}_${rand}`;
}

/**
 * Computes a deterministic fingerprint string for a file descriptor.
 * Does NOT claim two files with identical metadata are byte-identical without hashing.
 * @param {{ name: string, size: number, lastModified?: number, relativePath?: string }} fileInfo
 * @returns {string}
 */
export function createFileFingerprint(fileInfo) {
  const name = String(fileInfo?.name || '').trim();
  const size = Number(fileInfo?.size || 0);
  const mtime = Number(fileInfo?.lastModified || 0);
  const rel = String(fileInfo?.relativePath || name).replace(/\\/g, '/');
  return `${rel}::${size}::${mtime}`;
}
