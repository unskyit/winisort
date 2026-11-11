const WINDOWS_RESERVED_NAMES = new Set([
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'
]);

/**
 * Sanitizes a single filename or folder name to prevent OS-illegal characters and path traversal.
 * @param {string} rawName
 * @param {string} [fallback='Untitled']
 * @returns {string}
 */
export function sanitizeEntryName(rawName, fallback = 'Untitled') {
  if (typeof rawName !== 'string') return fallback;
  // Strip control chars and illegal filesystem symbols
  let cleaned = rawName
    .replace(/[\x00-\x1F\x7F<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();

  // Remove leading/trailing dots or spaces that cause issues on Windows/macOS
  cleaned = cleaned.replace(/^[.\s]+|[.\s]+$/g, '');
  if (!cleaned || cleaned === '.' || cleaned === '..') {
    cleaned = fallback;
  }

  const baseUpper = cleaned.split('.')[0].toUpperCase();
  if (WINDOWS_RESERVED_NAMES.has(baseUpper)) {
    cleaned = `_${cleaned}`;
  }

  if (cleaned.length > 200) {
    const extIdx = cleaned.lastIndexOf('.');
    if (extIdx > 0 && cleaned.length - extIdx <= 12) {
      const ext = cleaned.slice(extIdx);
      cleaned = cleaned.slice(0, 200 - ext.length) + ext;
    } else {
      cleaned = cleaned.slice(0, 200);
    }
  }
  return cleaned;
}

/**
 * Sanitizes a relative path, stripping '..' traversal segments and normalizing slashes.
 * @param {string} rawPath
 * @returns {string}
 */
export function sanitizeRelativePath(rawPath) {
  if (typeof rawPath !== 'string' || !rawPath.trim()) return '';
  const normalized = rawPath.replace(/\\/g, '/');
  const parts = normalized.split('/');
  const safeParts = [];
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed || trimmed === '.' || trimmed === '..') continue;
    safeParts.push(sanitizeEntryName(trimmed, 'folder'));
  }
  return safeParts.join('/');
}

/**
 * Validates a destination folder name and returns { valid, sanitized, reason }.
 * @param {string} name
 * @returns {{ valid: boolean, sanitized: string, reason?: string }}
 */
export function validateDestinationName(name) {
  if (typeof name !== 'string' || !name.trim()) {
    return { valid: false, sanitized: '', reason: 'Destination name cannot be empty.' };
  }
  if (name.includes('/') || name.includes('\\') || name.includes('..')) {
    return {
      valid: false,
      sanitized: sanitizeEntryName(name),
      reason: 'Destination name cannot contain path separators or traversal sequences.'
    };
  }
  const sanitized = sanitizeEntryName(name);
  if (!sanitized) {
    return { valid: false, sanitized: '', reason: 'Destination name contains only invalid characters.' };
  }
  return { valid: true, sanitized };
}
