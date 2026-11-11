import { sanitizeEntryName } from '../utils/sanitizer.js';

/**
 * Splits a filename into base stem and extension (including dot).
 * @param {string} filename
 * @returns {{ stem: string, ext: string }}
 */
export function splitFilename(filename) {
  const safe = sanitizeEntryName(filename, 'file');
  const idx = safe.lastIndexOf('.');
  if (idx <= 0 || idx === safe.length - 1) {
    return { stem: safe, ext: '' };
  }
  return {
    stem: safe.slice(0, idx),
    ext: safe.slice(idx)
  };
}

/**
 * Resolves a filename collision against a set or async checker of existing filenames.
 * Policies: 'keep-both' | 'auto-rename' | 'skip' | 'replace' | 'ask'
 * Default: 'keep-both' (generates `Name (1).ext`, `Name (2).ext`).
 *
 * @param {string} desiredName
 * @param {(candidateName: string) => Promise<boolean> | boolean} existsCheck
 * @param {{ policy?: string, maxAttempts?: number }} [options]
 * @returns {Promise<{ action: 'write' | 'skip' | 'replace' | 'ask', finalName: string, collided: boolean }>}
 */
export async function resolveFilenameCollision(desiredName, existsCheck, options = {}) {
  const policy = options.policy || 'keep-both';
  const maxAttempts = options.maxAttempts || 1000;
  const safeName = sanitizeEntryName(desiredName, 'file');

  const alreadyExists = await existsCheck(safeName);
  if (!alreadyExists) {
    return { action: 'write', finalName: safeName, collided: false };
  }

  if (policy === 'skip') {
    return { action: 'skip', finalName: safeName, collided: true };
  }

  if (policy === 'ask') {
    return { action: 'ask', finalName: safeName, collided: true };
  }

  if (policy === 'replace') {
    return { action: 'replace', finalName: safeName, collided: true };
  }

  // 'keep-both' or 'auto-rename' -> numbered suffix
  const { stem, ext } = splitFilename(safeName);
  for (let i = 1; i <= maxAttempts; i++) {
    const candidate = policy === 'auto-rename'
      ? `${stem}_${i}${ext}`
      : `${stem} (${i})${ext}`;
    const taken = await existsCheck(candidate);
    if (!taken) {
      return { action: 'write', finalName: candidate, collided: true };
    }
  }

  const tsCandidate = `${stem}_${Date.now()}${ext}`;
  return { action: 'write', finalName: tsCandidate, collided: true };
}
