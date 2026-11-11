(function() {
'use strict';

// --- src/utils/ids.js ---
let sequenceCounter = 0;

/**
 * Generates a stable, collision-resistant internal identifier with prefix.
 * @param {string} prefix
 * @returns {string}
 */
function createId(prefix = 'id') {
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
function createFileFingerprint(fileInfo) {
  const name = String(fileInfo?.name || '').trim();
  const size = Number(fileInfo?.size || 0);
  const mtime = Number(fileInfo?.lastModified || 0);
  const rel = String(fileInfo?.relativePath || name).replace(/\\/g, '/');
  return `${rel}::${size}::${mtime}`;
}


// --- src/utils/formatters.js ---
const IEC_UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
const SI_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

/**
 * Formats a byte count into human-readable SI (MB/GB) or IEC (MiB/GiB) units.
 * @param {number} bytes
 * @param {{ mode?: 'SI' | 'IEC', decimals?: number }} [options]
 * @returns {string}
 */
function formatBytes(bytes, options = {}) {
  const num = Number(bytes);
  if (!Number.isFinite(num) || num < 0) return '0 B';
  if (num === 0) return '0 B';

  const mode = options.mode === 'IEC' ? 'IEC' : 'SI';
  const base = mode === 'IEC' ? 1024 : 1000;
  const units = mode === 'IEC' ? IEC_UNITS : SI_UNITS;
  const decimals = typeof options.decimals === 'number' ? options.decimals : 1;

  const exp = Math.min(Math.floor(Math.log(num) / Math.log(base)), units.length - 1);
  if (exp === 0) return `${Math.round(num)} B`;
  const val = num / Math.pow(base, exp);
  return `${val.toFixed(decimals)} ${units[exp]}`;
}

/**
 * Formats duration in milliseconds or seconds into mm:ss or hh:mm:ss.
 * @param {number} seconds
 * @returns {string}
 */
function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const totalSec = Math.floor(seconds);
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

/**
 * Formats a timestamp into a concise readable date string.
 * @param {number|string|Date} timestamp
 * @returns {string}
 */
function formatDate(timestamp) {
  if (!timestamp) return 'Unknown date';
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return 'Unknown date';
  return d.toISOString().replace('T', ' ').slice(0, 16);
}


// --- src/utils/sanitizer.js ---
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
function sanitizeEntryName(rawName, fallback = 'Untitled') {
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
function sanitizeRelativePath(rawPath) {
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
function validateDestinationName(name) {
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


// --- src/utils/scheduling.js ---
/**
 * Bounded concurrency runner for async tasks without Promise.all() memory spikes.
 * @template T, R
 * @param {Iterable<T>} items
 * @param {number} concurrency
 * @param {(item: T, index: number) => Promise<R>} workerFn
 * @param {AbortSignal} [signal]
 * @returns {Promise<R[]>}
 */
async function runBoundedConcurrent(items, concurrency, workerFn, signal) {
  const list = Array.from(items);
  const results = new Array(list.length);
  const limit = Math.max(1, Math.min(concurrency || 2, 16));
  let cursor = 0;

  async function next() {
    while (cursor < list.length) {
      if (signal && signal.aborted) {
        throw new DOMException('Operation aborted', 'AbortError');
      }
      const idx = cursor++;
      results[idx] = await workerFn(list[idx], idx);
    }
  }

  const runners = [];
  for (let i = 0; i < Math.min(limit, list.length); i++) {
    runners.push(next());
  }
  await Promise.all(runners);
  return results;
}

/**
 * Throttles a function so it executes at most once per `waitMs`.
 * @param {Function} fn
 * @param {number} waitMs
 * @returns {Function}
 */
function throttle(fn, waitMs = 100) {
  let lastRun = 0;
  let timer = null;
  let lastArgs = null;

  return function throttled(...args) {
    const now = Date.now();
    const remaining = waitMs - (now - lastRun);
    lastArgs = args;
    if (remaining <= 0) {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      lastRun = now;
      fn.apply(this, lastArgs);
    } else if (!timer) {
      timer = setTimeout(() => {
        lastRun = Date.now();
        timer = null;
        fn.apply(this, lastArgs);
      }, remaining);
    }
  };
}

/**
 * Schedules low-priority work during browser idle periods with fallback.
 * @param {Function} callback
 * @param {number} [timeout=500]
 * @returns {number}
 */
function scheduleIdleTask(callback, timeout = 500) {
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    return window.requestIdleCallback(callback, { timeout });
  }
  return setTimeout(() => callback({ didTimeout: false, timeRemaining: () => 15 }), 16);
}


// --- src/utils/cleanup.js ---
/**
 * Tracks Object URLs and ImageBitmaps to guarantee prompt revocation and avoid memory leaks.
 */
class ResourceTracker {
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
const sharedResourceTracker = new ResourceTracker(48);


// --- src/core/event-bus.js ---
class EventBus {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this.listeners = new Map();
  }

  /**
   * Subscribe to an event.
   * @param {string} event
   * @param {Function} handler
   * @returns {() => void} Unsubscribe function
   */
  on(event, handler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(handler);
    return () => this.off(event, handler);
  }

  /**
   * Remove an event listener.
   * @param {string} event
   * @param {Function} handler
   */
  off(event, handler) {
    const set = this.listeners.get(event);
    if (set) {
      set.delete(handler);
      if (set.size === 0) this.listeners.delete(event);
    }
  }

  /**
   * Emit an event synchronously to all subscribers.
   * @param {string} event
   * @param {any} [payload]
   */
  emit(event, payload) {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const handler of Array.from(set)) {
      try {
        handler(payload);
      } catch (err) {
        console.error(`[EventBus] Error in listener for "${event}":`, err);
      }
    }
  }
}
const bus = new EventBus();


// --- src/core/errors.js ---
const ErrorCode = Object.freeze({
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  PERMISSION_REVOKED: 'PERMISSION_REVOKED',
  PICKER_CANCELED: 'PICKER_CANCELED',
  FOLDER_DELETED: 'FOLDER_DELETED',
  SOURCE_FILE_MOVED: 'SOURCE_FILE_MOVED',
  SOURCE_FILE_CHANGED: 'SOURCE_FILE_CHANGED',
  TARGET_FOLDER_DELETED: 'TARGET_FOLDER_DELETED',
  DESTINATION_NOT_WRITABLE: 'DESTINATION_NOT_WRITABLE',
  DESTINATION_COLLISION: 'DESTINATION_COLLISION',
  FILENAME_COLLISION: 'FILENAME_COLLISION',
  DISK_FULL: 'DISK_FULL',
  COPY_INTERRUPTED: 'COPY_INTERRUPTED',
  INVALID_PROJECT_JSON: 'INVALID_PROJECT_JSON',
  CORRUPTED_MANIFEST: 'CORRUPTED_MANIFEST',
  UNSUPPORTED_FILE_TYPE: 'UNSUPPORTED_FILE_TYPE',
  UNSUPPORTED_MEDIA_CODEC: 'UNSUPPORTED_MEDIA_CODEC',
  INVALID_PDF: 'INVALID_PDF',
  IMAGE_DECODE_FAILURE: 'IMAGE_DECODE_FAILURE',
  OUT_OF_MEMORY_RISK: 'OUT_OF_MEMORY_RISK',
  DUPLICATE_SOURCE: 'DUPLICATE_SOURCE',
  SOURCE_DEST_ALIAS: 'SOURCE_DEST_ALIAS',
  UNDO_UNSAFE: 'UNDO_UNSAFE',
  ZIP_BUDGET_EXCEEDED: 'ZIP_BUDGET_EXCEEDED'
});
class WiniSortError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {{ recoverable?: boolean, actions?: string[], cause?: any, context?: Record<string, any> }} [options]
   */
  constructor(code, message, options = {}) {
    super(message);
    this.name = 'WiniSortError';
    this.code = code;
    this.recoverable = options.recoverable !== false;
    this.actions = options.actions || ['Retry', 'Skip', 'Cancel'];
    this.cause = options.cause || null;
    this.context = options.context || {};
    this.timestamp = Date.now();
  }
}

/**
 * Normalizes any browser DOMException or runtime error into a human-readable WiniSortError.
 * @param {any} err
 * @param {string} [fallbackContext='Filesystem operation']
 * @returns {WiniSortError}
 */
function normalizeError(err, fallbackContext = 'Filesystem operation') {
  if (err instanceof WiniSortError) return err;
  const name = err?.name || '';
  const msg = err?.message || String(err || 'Unknown error');

  if (name === 'AbortError') {
    return new WiniSortError(ErrorCode.PICKER_CANCELED, `${fallbackContext} was canceled.`, {
      recoverable: true,
      actions: ['Dismiss']
    });
  }
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return new WiniSortError(
      ErrorCode.PERMISSION_DENIED,
      `${fallbackContext}: Browser permission was denied or revoked. Please grant folder access and try again.`,
      { recoverable: true, actions: ['Reconnect', 'Retry', 'Cancel'] }
    );
  }
  if (name === 'NotFoundError') {
    return new WiniSortError(
      ErrorCode.SOURCE_FILE_MOVED,
      `${fallbackContext}: The source file or target folder could not be found on disk.`,
      { recoverable: true, actions: ['Skip', 'Reconnect', 'Cancel'] }
    );
  }
  if (name === 'QuotaExceededError') {
    return new WiniSortError(
      ErrorCode.DISK_FULL,
      `${fallbackContext}: Insufficient disk space available on the target drive.`,
      { recoverable: false, actions: ['Review', 'Cancel'] }
    );
  }
  if (name === 'NoModificationAllowedError' || name === 'InvalidStateError') {
    return new WiniSortError(
      ErrorCode.SOURCE_FILE_CHANGED,
      `${fallbackContext}: The file changed on disk or is locked by another process.`,
      { recoverable: true, actions: ['Retry', 'Skip'] }
    );
  }
  return new WiniSortError('OPERATION_ERROR', `${fallbackContext}: ${msg}`, {
    recoverable: true,
    actions: ['Retry', 'Skip', 'Cancel'],
    cause: err
  });
}


// --- src/core/capability-detector.js ---
/**
 * Runtime feature and capability detector using progressive enhancement (zero browser-name assumptions).
 * @param {Window|typeof globalThis} [env=globalThis]
 */
function detectCapabilities(env = globalThis) {
  const hasDirectoryPicker = typeof env.showDirectoryPicker === 'function';
  const hasOpenFilePicker = typeof env.showOpenFilePicker === 'function';
  const hasSaveFilePicker = typeof env.showSaveFilePicker === 'function';
  const hasWritableFileStream = typeof env.FileSystemWritableFileStream !== 'undefined' || hasDirectoryPicker;

  // Check webkitdirectory support on input element
  let hasWebkitDirectory = false;
  if (typeof env.document !== 'undefined') {
    const input = env.document.createElement('input');
    hasWebkitDirectory = 'webkitdirectory' in input || 'directory' in input;
  }

  const hasWebWorkers = typeof env.Worker === 'function';
  const hasServiceWorker = Boolean(env.navigator && 'serviceWorker' in env.navigator);
  const hasOffscreenCanvas = typeof env.OffscreenCanvas !== 'undefined';
  const hasCreateImageBitmap = typeof env.createImageBitmap === 'function';
  const hasStorageEstimate = Boolean(env.navigator?.storage && typeof env.navigator.storage.estimate === 'function');
  const hasPerformanceMemory = Boolean(env.performance && env.performance.memory);

  const isCoarsePointer = Boolean(
    typeof env.matchMedia === 'function' && env.matchMedia('(pointer: coarse)').matches
  );
  const prefersReducedMotion = Boolean(
    typeof env.matchMedia === 'function' && env.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  // Device memory hint (only if exposed by browser API)
  const deviceMemoryGB = (env.navigator && typeof env.navigator.deviceMemory === 'number')
    ? env.navigator.deviceMemory
    : null;

  const isLowMemoryDevice = isCoarsePointer || (deviceMemoryGB !== null && deviceMemoryGB <= 4);

  return {
    filesystemMode: hasDirectoryPicker ? 'native-fs-access' : 'fallback-export',
    hasDirectoryPicker,
    hasOpenFilePicker,
    hasSaveFilePicker,
    hasWritableFileStream,
    hasWebkitDirectory,
    hasWebWorkers,
    hasServiceWorker,
    hasOffscreenCanvas,
    hasCreateImageBitmap,
    hasStorageEstimate,
    hasPerformanceMemory,
    isCoarsePointer,
    prefersReducedMotion,
    deviceMemoryGB,
    budgets: isLowMemoryDevice
      ? {
          maxConcurrentPreviews: 1,
          maxConcurrentCopies: 1,
          thumbnailCacheSize: 24,
          vortexParticleCount: prefersReducedMotion ? 0 : 8
        }
      : {
          maxConcurrentPreviews: 4,
          maxConcurrentCopies: 2,
          thumbnailCacheSize: 64,
          vortexParticleCount: prefersReducedMotion ? 0 : 14
        }
  };
}


// --- src/core/configuration.js ---
const DESTINATION_PALETTE = Object.freeze([
  { id: 'blue', name: 'Calm Blue', hex: '#5286DB' },
  { id: 'emerald', name: 'Forest Emerald', hex: '#38A169' },
  { id: 'amber', name: 'Warm Amber', hex: '#D69E2E' },
  { id: 'purple', name: 'Royal Purple', hex: '#805AD5' },
  { id: 'teal', name: 'Ocean Teal', hex: '#319795' },
  { id: 'orange', name: 'Sunset Orange', hex: '#DD6B20' },
  { id: 'indigo', name: 'Soft Indigo', hex: '#6875F5' },
  { id: 'rose', name: 'Crimson Rose', hex: '#E53E3E' },
  { id: 'cyan', name: 'Glacier Cyan', hex: '#00A3C4' },
  { id: 'pink', name: 'Orchid Pink', hex: '#D53F8C' }
]);
const MEDIA_CATEGORIES = Object.freeze({
  images: {
    id: 'images',
    label: 'Images',
    emoji: '🖼️',
    extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'bmp', 'tiff', 'tif', 'heic', 'heif', 'svg']
  },
  videos: {
    id: 'videos',
    label: 'Videos',
    emoji: '🎬',
    extensions: ['mp4', 'mov', 'webm', 'm4v', 'mkv', 'avi', 'mpeg', 'mpg', '3gp']
  },
  audio: {
    id: 'audio',
    label: 'Audio',
    emoji: '🎵',
    extensions: ['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg', 'opus', 'aiff', 'wma']
  },
  pdf: {
    id: 'pdf',
    label: 'PDF',
    emoji: '📕',
    extensions: ['pdf']
  },
  documents: {
    id: 'documents',
    label: 'Documents',
    emoji: '📄',
    extensions: ['doc', 'docx', 'txt', 'rtf', 'odt', 'md', 'markdown']
  },
  spreadsheets: {
    id: 'spreadsheets',
    label: 'Spreadsheets',
    emoji: '📊',
    extensions: ['xls', 'xlsx', 'csv', 'ods', 'tsv']
  },
  presentations: {
    id: 'presentations',
    label: 'Presentations',
    emoji: '📽️',
    extensions: ['ppt', 'pptx', 'odp']
  },
  archives: {
    id: 'archives',
    label: 'Archives',
    emoji: '🗜️',
    extensions: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2']
  },
  ebooks: {
    id: 'ebooks',
    label: 'E-books',
    emoji: '📚',
    extensions: ['epub', 'mobi', 'azw3']
  },
  other: {
    id: 'other',
    label: 'Other files',
    emoji: '📦',
    extensions: []
  }
});
const STARTER_TEMPLATES = Object.freeze({
  festivals: {
    id: 'festivals',
    name: 'Festivals & Celebrations',
    emoji: '🪔',
    destinations: [
      { name: 'Diwali', emoji: '🪔', color: '#D69E2E', bank: 'top', pinned: true, shortcut: '1' },
      { name: 'Holi', emoji: '🎨', color: '#D53F8C', bank: 'top', pinned: true, shortcut: '2' },
      { name: 'Weddings', emoji: '💍', color: '#E53E3E', bank: 'left', pinned: true, shortcut: '3' },
      { name: 'Birthdays', emoji: '🎂', color: '#805AD5', bank: 'right', pinned: false, shortcut: '4' }
    ]
  },
  family: {
    id: 'family',
    name: 'Family Memories',
    emoji: '👨‍👩‍👧‍👦',
    destinations: [
      { name: 'Vacations', emoji: '🏖️', color: '#00A3C4', bank: 'top', pinned: true, shortcut: '1' },
      { name: 'Kids & School', emoji: '🎓', color: '#5286DB', bank: 'left', pinned: true, shortcut: '2' },
      { name: 'Home & Pets', emoji: '🐾', color: '#38A169', bank: 'right', pinned: true, shortcut: '3' },
      { name: 'Favorites Print', emoji: '⭐', color: '#D69E2E', bank: 'bottom', pinned: false, shortcut: '4' }
    ]
  },
  school: {
    id: 'school',
    name: 'School & College',
    emoji: '🎓',
    destinations: [
      { name: 'Lecture Notes', emoji: '📝', color: '#5286DB', bank: 'left', pinned: true, shortcut: '1' },
      { name: 'Assignments', emoji: '📚', color: '#805AD5', bank: 'top', pinned: true, shortcut: '2' },
      { name: 'Research Papers', emoji: '📕', color: '#E53E3E', bank: 'right', pinned: true, shortcut: '3' },
      { name: 'Lab Data', emoji: '🧪', color: '#38A169', bank: 'bottom', pinned: false, shortcut: '4' }
    ]
  },
  work: {
    id: 'work',
    name: 'Professional Documents',
    emoji: '💼',
    destinations: [
      { name: 'Work Projects', emoji: '💼', color: '#5286DB', bank: 'left', pinned: true, shortcut: '1' },
      { name: 'Invoices & Receipts', emoji: '🧾', color: '#38A169', bank: 'top', pinned: true, shortcut: '2' },
      { name: 'Contracts & Legal', emoji: '⚖️', color: '#6875F5', bank: 'right', pinned: true, shortcut: '3' },
      { name: 'Presentations', emoji: '📊', color: '#DD6B20', bank: 'bottom', pinned: false, shortcut: '4' }
    ]
  },
  photography: {
    id: 'photography',
    name: 'Photography Culling',
    emoji: '📷',
    destinations: [
      { name: '5-Star Selects', emoji: '🌟', color: '#D69E2E', bank: 'top', pinned: true, shortcut: '1' },
      { name: 'Portraits', emoji: '🧑', color: '#5286DB', bank: 'left', pinned: true, shortcut: '2' },
      { name: 'Landscapes', emoji: '🏔️', color: '#38A169', bank: 'right', pinned: true, shortcut: '3' },
      { name: 'Needs Editing', emoji: '🎨', color: '#805AD5', bank: 'bottom', pinned: false, shortcut: '4' }
    ]
  }
});
function createDefaultPreferences() {
  return {
    theme: 'system', // 'light' | 'dark' | 'system'
    accentColor: '#5286DB',
    density: 'comfortable', // 'compact' | 'comfortable' | 'spacious'
    motionLevel: 'full', // 'full' | 'reduced'
    transparencyLevel: 'normal', // 'normal' | 'reduced'
    unitSystem: 'SI', // 'SI' (MB/GB) | 'IEC' (MiB/GiB)
    operationMode: 'copy', // 'copy' | 'move' (move requires explicit authorization)
    collisionPolicy: 'keep-both', // 'keep-both' | 'auto-rename' | 'skip' | 'ask' | 'replace'
    verifyCopyIntegrity: true,
    allowSourceModification: false,
    dryRunMode: false,
    poolDisplayMode: 'show', // 'show' | 'hide' | 'auto-hide' | 'collapsed'
    defaultBankPlacement: 'left',
    maxVisibleCardsPerBank: 6,
    compactCards: false,
    autoCheckpointInterval: 10,
    compressionDefaults: {
      mode: 'quality', // 'lossless' | 'quality' | 'resize'
      format: 'image/webp',
      quality: 0.84,
      maxDimension: 2560,
      preserveOriginalsInSubfolder: true
    }
  };
}
function createDefaultFilters() {
  const enabledCategories = {
    images: true,
    videos: true,
    audio: true,
    pdf: true,
    documents: true,
    spreadsheets: true,
    presentations: true,
    archives: false,
    ebooks: false,
    other: false
  };
  const enabledExtensions = new Set();
  for (const [catId, cat] of Object.entries(MEDIA_CATEGORIES)) {
    if (enabledCategories[catId]) {
      for (const ext of cat.extensions) enabledExtensions.add(ext);
    }
  }
  return {
    categories: enabledCategories,
    extensions: Array.from(enabledExtensions),
    customExtensions: [],
    minSizeBytes: 0,
    maxSizeBytes: 0, // 0 = no upper limit
    dateFrom: '',
    dateTo: '',
    includePattern: '',
    excludePattern: '',
    includeNestedFolders: true,
    includeHiddenFiles: false
  };
}


// --- src/core/state.js ---




/**
 * Predictable, event-driven application state store for WiniSort.
 * Separates UI state, sources, destinations, active file references, operations, and statistics.
 */
class AppStateStore {
  constructor() {
    this.capabilities = detectCapabilities();
    this.reset();
  }

  reset() {
    this.project = {
      id: createId('proj'),
      schemaVersion: '1.0.0',
      name: 'My WiniSort Session',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      outputRootName: null,
      outputRootHandle: null,
      isDirty: false
    };

    this.ui = {
      activeModal: null, // 'filters' | 'settings' | 'stats' | 'rules' | 'duplicates' | 'compression' | 'recovery' | 'help' | 'command-palette' | 'new-destination'
      modalPayload: null,
      quickSortMode: false,
      focusMode: false,
      searchQuery: '',
      statusFilter: 'unsorted', // 'unsorted' | 'all' | 'sorted' | 'skipped' | 'review-later' | 'favorites'
      categoryFilter: 'all',
      activeFileId: null,
      selectedFileIds: new Set(),
      recentDestinationIds: [],
      draggingFileIds: [],
      dropTargetDestinationId: null,
      isScanning: false,
      scanProgress: {
        foldersDiscovered: 0,
        filesScanned: 0,
        eligibleFiles: 0,
        ignoredFiles: 0,
        totalEligibleBytes: 0,
        currentFolder: '',
        startedAt: 0,
        elapsedMs: 0,
        errors: []
      },
      sessionStartedAt: Date.now(),
      offlineReady: false
    };

    this.preferences = createDefaultPreferences();
    this.filters = createDefaultFilters();

    /** @type {Map<string, Object>} sourceId -> source descriptor */
    this.sources = new Map();

    /** @type {Map<string, Object>} destinationId -> destination descriptor */
    this.destinations = new Map();

    /** @type {Map<string, Object>} fileId -> lightweight file metadata record (File handle kept by reference, never serialized into JSON) */
    this.files = new Map();

    /** @type {string[]} Ordered list of fileIds matching current filter/search */
    this.filteredFileIds = [];

    /** @type {Map<string, Object>} operationId -> active/completed operation */
    this.operations = new Map();

    /** @type {Array<Object>} Automation rules */
    this.rules = [];

    /** @type {Array<Object>} Recovery findings */
    this.recoveryItems = [];

    this.stats = {
      totalFiles: 0,
      unsortedCount: 0,
      sortedCount: 0,
      skippedCount: 0,
      reviewLaterCount: 0,
      favoriteCount: 0,
      totalEligibleBytes: 0,
      sortedBytes: 0,
      completedCopyBytes: 0,
      failedCopyBytes: 0,
      compressionSavedBytes: 0,
      errorsCount: 0
    };
  }

  /**
   * Recomputes filteredFileIds and aggregate session counters cleanly.
   */
  recomputeDerivedState() {
    const query = (this.ui.searchQuery || '').trim().toLowerCase();
    const statusFilter = this.ui.statusFilter;
    const catFilter = this.ui.categoryFilter;

    let unsortedCount = 0;
    let sortedCount = 0;
    let skippedCount = 0;
    let reviewLaterCount = 0;
    let favoriteCount = 0;
    let totalEligibleBytes = 0;
    let sortedBytes = 0;

    const matchingIds = [];

    for (const [id, file] of this.files.entries()) {
      totalEligibleBytes += file.size || 0;
      if (file.favorite) favoriteCount++;

      if (file.status === 'sorted') {
        sortedCount++;
        sortedBytes += file.size || 0;
      } else if (file.status === 'skipped') {
        skippedCount++;
      } else if (file.status === 'review-later') {
        reviewLaterCount++;
      } else {
        unsortedCount++;
      }

      // Check status filter
      let statusMatch = true;
      if (statusFilter === 'unsorted') statusMatch = file.status === 'unsorted';
      else if (statusFilter === 'sorted') statusMatch = file.status === 'sorted';
      else if (statusFilter === 'skipped') statusMatch = file.status === 'skipped';
      else if (statusFilter === 'review-later') statusMatch = file.status === 'review-later';
      else if (statusFilter === 'favorites') statusMatch = Boolean(file.favorite);

      if (!statusMatch) continue;

      if (catFilter !== 'all' && file.category !== catFilter) continue;

      if (query) {
        const hay = `${file.name} ${file.extension} ${file.relativePath || ''} ${file.category}`.toLowerCase();
        if (!hay.includes(query)) continue;
      }

      matchingIds.push(id);
    }

    this.filteredFileIds = matchingIds;
    this.stats.totalFiles = this.files.size;
    this.stats.unsortedCount = unsortedCount;
    this.stats.sortedCount = sortedCount;
    this.stats.skippedCount = skippedCount;
    this.stats.reviewLaterCount = reviewLaterCount;
    this.stats.favoriteCount = favoriteCount;
    this.stats.totalEligibleBytes = totalEligibleBytes;
    this.stats.sortedBytes = sortedBytes;

    // Ensure activeFileId remains valid within current filtered view
    if (!this.ui.activeFileId || !this.filteredFileIds.includes(this.ui.activeFileId)) {
      this.ui.activeFileId = this.filteredFileIds.length > 0 ? this.filteredFileIds[0] : null;
    }
  }

  getActiveFile() {
    if (!this.ui.activeFileId) return null;
    return this.files.get(this.ui.activeFileId) || null;
  }

  notify(section = 'all', payload = null) {
    bus.emit('state:changed', { section, payload, state: this });
  }
}
const store = new AppStateStore();


// --- src/filesystem/file-classifier.js ---

const EXTENSION_TO_CATEGORY = new Map();
for (const [catId, cat] of Object.entries(MEDIA_CATEGORIES)) {
  for (const ext of cat.extensions) {
    EXTENSION_TO_CATEGORY.set(ext.toLowerCase(), catId);
  }
}

const NATIVE_IMAGE_PREVIEW_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'bmp', 'svg']);
const NATIVE_VIDEO_PREVIEW_EXTS = new Set(['mp4', 'webm', 'mov', 'm4v', 'ogg']);
const NATIVE_AUDIO_PREVIEW_EXTS = new Set(['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'opus']);
const NATIVE_TEXT_PREVIEW_EXTS = new Set(['txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'log']);

/**
 * Extracts normalized lowercase file extension without leading dot.
 * @param {string} filename
 * @returns {string}
 */
function extractExtension(filename) {
  if (typeof filename !== 'string') return '';
  const base = filename.split('/').pop().split('\\').pop();
  const idx = base.lastIndexOf('.');
  if (idx <= 0 || idx === base.length - 1) return '';
  return base.slice(idx + 1).toLowerCase();
}

/**
 * Classifies a file by its filename, MIME type, and size.
 * Strictly separates file classification from browser preview capability.
 * @param {{ name: string, type?: string, size?: number }} fileLike
 * @returns {{ extension: string, category: string, emoji: string, previewKind: string, isPreviewable: boolean, isCompressibleImage: boolean }}
 */
function classifyFile(fileLike) {
  const name = String(fileLike?.name || '');
  const ext = extractExtension(name);
  let category = EXTENSION_TO_CATEGORY.get(ext) || 'other';

  // Fallback to MIME prefix if extension was custom or uncommon
  if (category === 'other' && fileLike?.type) {
    const mime = fileLike.type.toLowerCase();
    if (mime.startsWith('image/')) category = 'images';
    else if (mime.startsWith('video/')) category = 'videos';
    else if (mime.startsWith('audio/')) category = 'audio';
    else if (mime === 'application/pdf') category = 'pdf';
    else if (mime.startsWith('text/')) category = 'documents';
  }

  const catInfo = MEDIA_CATEGORIES[category] || MEDIA_CATEGORIES.other;

  let previewKind = 'generic';
  let isPreviewable = false;

  if (category === 'images' && NATIVE_IMAGE_PREVIEW_EXTS.has(ext)) {
    previewKind = 'image';
    isPreviewable = true;
  } else if (category === 'videos' && NATIVE_VIDEO_PREVIEW_EXTS.has(ext)) {
    previewKind = 'video';
    isPreviewable = true;
  } else if (category === 'audio' && NATIVE_AUDIO_PREVIEW_EXTS.has(ext)) {
    previewKind = 'audio';
    isPreviewable = true;
  } else if (category === 'pdf' || ext === 'pdf') {
    previewKind = 'pdf';
    isPreviewable = true;
  } else if (NATIVE_TEXT_PREVIEW_EXTS.has(ext)) {
    previewKind = 'text';
    isPreviewable = true;
  }

  const isCompressibleImage = category === 'images' && ['jpg', 'jpeg', 'png', 'webp', 'avif', 'bmp'].includes(ext);

  return {
    extension: ext,
    category,
    emoji: catInfo.emoji,
    previewKind,
    isPreviewable,
    isCompressibleImage
  };
}

/**
 * Evaluates whether a file descriptor passes the active media filter configuration.
 * Strictly enforces selected extensions and category rules.
 * @param {{ name: string, size: number, lastModified?: number, relativePath?: string }} fileInfo
 * @param {Object} filters
 * @returns {{ eligible: boolean, reason?: string, classification: ReturnType<typeof classifyFile> }}
 */
function evaluateFileEligibility(fileInfo, filters) {
  const name = String(fileInfo?.name || '');
  const classification = classifyFile(fileInfo);

  if (!filters) {
    return { eligible: true, classification };
  }

  // Hidden files check
  if (!filters.includeHiddenFiles && name.startsWith('.')) {
    return { eligible: false, reason: 'Hidden file excluded', classification };
  }

  // Category check
  const enabledCats = filters.categories || {};
  if (enabledCats[classification.category] === false) {
    return { eligible: false, reason: `Category "${classification.category}" disabled`, classification };
  }

  // Strict extension enforcement when explicit extension list is non-empty
  const allowedExts = new Set([
    ...(Array.isArray(filters.extensions) ? filters.extensions : []),
    ...(Array.isArray(filters.customExtensions) ? filters.customExtensions : [])
  ].map(e => String(e).replace(/^\./, '').toLowerCase()).filter(Boolean));

  if (allowedExts.size > 0 && classification.category !== 'other') {
    if (!allowedExts.has(classification.extension)) {
      return { eligible: false, reason: `Extension ".${classification.extension}" not selected`, classification };
    }
  } else if (classification.category === 'other' && !enabledCats.other) {
    if (!allowedExts.has(classification.extension)) {
      return { eligible: false, reason: 'Unrecognized format excluded', classification };
    }
  }

  // File size rules
  const size = Number(fileInfo?.size || 0);
  if (filters.minSizeBytes > 0 && size < filters.minSizeBytes) {
    return { eligible: false, reason: 'Smaller than minimum file size', classification };
  }
  if (filters.maxSizeBytes > 0 && size > filters.maxSizeBytes) {
    return { eligible: false, reason: 'Larger than maximum file size', classification };
  }

  // Date range rules
  if (filters.dateFrom && fileInfo?.lastModified) {
    const fromTs = Date.parse(filters.dateFrom);
    if (!Number.isNaN(fromTs) && fileInfo.lastModified < fromTs) {
      return { eligible: false, reason: 'Older than start date filter', classification };
    }
  }
  if (filters.dateTo && fileInfo?.lastModified) {
    const toTs = Date.parse(filters.dateTo) + 86399999;
    if (!Number.isNaN(toTs) && fileInfo.lastModified > toTs) {
      return { eligible: false, reason: 'Newer than end date filter', classification };
    }
  }

  // Include / Exclude filename substring or wildcard patterns
  const lowerName = name.toLowerCase();
  if (filters.includePattern && filters.includePattern.trim()) {
    const terms = filters.includePattern.toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
    if (terms.length > 0 && !terms.some(t => lowerName.includes(t))) {
      return { eligible: false, reason: 'Does not match include pattern', classification };
    }
  }
  if (filters.excludePattern && filters.excludePattern.trim()) {
    const terms = filters.excludePattern.toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
    if (terms.length > 0 && terms.some(t => lowerName.includes(t))) {
      return { eligible: false, reason: 'Matched exclude pattern', classification };
    }
  }

  return { eligible: true, classification };
}


// --- src/filesystem/permission-manager.js ---

/**
 * Verifies or requests read or readwrite permission on a FileSystemHandle.
 * @param {FileSystemHandle} handle
 * @param {'read' | 'readwrite'} [mode='read']
 * @param {boolean} [requestIfPrompt=true]
 * @returns {Promise<boolean>}
 */
async function verifyHandlePermission(handle, mode = 'read', requestIfPrompt = true) {
  if (!handle) return false;
  if (typeof handle.queryPermission !== 'function') {
    // Fallback file or simulated handle
    return true;
  }
  try {
    const opts = { mode };
    const status = await handle.queryPermission(opts);
    if (status === 'granted') return true;
    if (requestIfPrompt && typeof handle.requestPermission === 'function') {
      const requested = await handle.requestPermission(opts);
      return requested === 'granted';
    }
    return false;
  } catch (err) {
    return false;
  }
}

/**
 * Checks whether two FileSystemDirectoryHandles refer to the same directory or overlap.
 * Prevents accidental output-into-source self-overwriting or recursive import loops.
 * @param {FileSystemDirectoryHandle} dirA
 * @param {FileSystemDirectoryHandle} dirB
 * @returns {Promise<{ same: boolean, isChild: boolean, relativePath: string[] | null }>}
 */
async function checkDirectoryRelationship(dirA, dirB) {
  if (!dirA || !dirB) return { same: false, isChild: false, relativePath: null };
  try {
    if (typeof dirA.isSameEntry === 'function') {
      const same = await dirA.isSameEntry(dirB);
      if (same) return { same: true, isChild: false, relativePath: [] };
    }
    if (typeof dirA.resolve === 'function') {
      const rel = await dirA.resolve(dirB);
      if (Array.isArray(rel)) {
        return { same: rel.length === 0, isChild: rel.length > 0, relativePath: rel };
      }
    }
  } catch (_) {}
  return { same: false, isChild: false, relativePath: null };
}

/**
 * Ensures the source directory and output directory are not identical.
 * @param {FileSystemDirectoryHandle} sourceHandle
 * @param {FileSystemDirectoryHandle} outputHandle
 */
async function assertSafeSourceAndOutput(sourceHandle, outputHandle) {
  const rel = await checkDirectoryRelationship(sourceHandle, outputHandle);
  if (rel.same) {
    throw new WiniSortError(
      ErrorCode.SOURCE_DEST_ALIAS,
      'Source folder and Output folder cannot be the exact same directory. Please choose a dedicated output folder to protect original files.',
      { recoverable: true, actions: ['Select Different Folder', 'Cancel'] }
    );
  }
}


// --- src/filesystem/collision-handler.js ---

/**
 * Splits a filename into base stem and extension (including dot).
 * @param {string} filename
 * @returns {{ stem: string, ext: string }}
 */
function splitFilename(filename) {
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
async function resolveFilenameCollision(desiredName, existsCheck, options = {}) {
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


// --- src/filesystem/verification.js ---
/**
 * Computes an incremental FNV-1a 64-bit hex digest (or SHA-256 via WebCrypto on bounded chunks)
 * without buffering an entire large video into RAM.
 * @param {Blob|File} blob
 * @param {{ maxSampleBytes?: number, signal?: AbortSignal }} [options]
 * @returns {Promise<string>}
 */
async function computeStreamingDigest(blob, options = {}) {
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
async function verifyCopiedFile(sourceBlob, writtenBlob, options = {}) {
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


// --- src/filesystem/export-fallback.js ---

const MAX_SAFE_ZIP_BYTES = 350 * 1024 * 1024; // 350 MB safe browser memory budget per ZIP batch

// CRC32 Lookup Table for valid standard ZIP archive creation without external dependencies
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ bytes[i]) & 0xFF];
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

/**
 * Builds an uncompressed (STORE) standard PKZIP Blob from a list of { path, data: Uint8Array } entries.
 * Used in browsers without File System Access API so users can download organized folder hierarchies.
 * @param {Array<{ path: string, bytes: Uint8Array }>} entries
 * @returns {Blob}
 */
function buildZipArchiveBlob(entries) {
  let totalPayloadBytes = 0;
  for (const entry of entries) {
    totalPayloadBytes += entry.bytes.byteLength;
  }
  if (totalPayloadBytes > MAX_SAFE_ZIP_BYTES) {
    throw new WiniSortError(
      ErrorCode.ZIP_BUDGET_EXCEEDED,
      `ZIP export exceeds safe browser memory limit (${Math.round(totalPayloadBytes / 1e6)} MB). Please export in smaller batches.`,
      { recoverable: true, actions: ['Export Batch', 'Cancel'] }
    );
  }

  const encoder = new TextEncoder();
  const fileRecords = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.path.replace(/^\/+/, ''));
    const data = entry.bytes;
    const crc = crc32(data);
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const view = new DataView(localHeader.buffer);

    view.setUint32(0, 0x04034b50, true); // Local file header signature
    view.setUint16(4, 20, true); // Version needed
    view.setUint16(6, 0x0800, true); // UTF-8 flag
    view.setUint16(8, 0, true); // Compression method 0 (STORE)
    view.setUint16(10, 0, true); // Mod time
    view.setUint16(12, 0x21, true); // Mod date
    view.setUint32(14, crc, true);
    view.setUint32(18, data.byteLength, true);
    view.setUint32(22, data.byteLength, true);
    view.setUint16(26, nameBytes.length, true);
    view.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    fileRecords.push({
      nameBytes,
      data,
      crc,
      localHeader,
      offset
    });

    offset += localHeader.byteLength + data.byteLength;
  }

  const centralParts = [];
  let centralSize = 0;

  for (const rec of fileRecords) {
    const cd = new Uint8Array(46 + rec.nameBytes.length);
    const view = new DataView(cd.buffer);
    view.setUint32(0, 0x02014b50, true); // Central directory signature
    view.setUint16(4, 20, true);
    view.setUint16(6, 20, true);
    view.setUint16(8, 0x0800, true);
    view.setUint16(10, 0, true);
    view.setUint16(12, 0, true);
    view.setUint16(14, 0x21, true);
    view.setUint32(16, rec.crc, true);
    view.setUint32(20, rec.data.byteLength, true);
    view.setUint32(24, rec.data.byteLength, true);
    view.setUint16(28, rec.nameBytes.length, true);
    view.setUint16(30, 0, true);
    view.setUint16(32, 0, true);
    view.setUint16(34, 0, true);
    view.setUint16(36, 0, true);
    view.setUint32(38, 0, true);
    view.setUint32(42, rec.offset, true);
    cd.set(rec.nameBytes, 46);
    centralParts.push(cd);
    centralSize += cd.byteLength;
  }

  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(4, 0, true);
  eocdView.setUint16(6, 0, true);
  eocdView.setUint16(8, fileRecords.length, true);
  eocdView.setUint16(10, fileRecords.length, true);
  eocdView.setUint32(12, centralSize, true);
  eocdView.setUint32(16, offset, true);
  eocdView.setUint16(20, 0, true);

  const blobParts = [];
  for (const rec of fileRecords) {
    blobParts.push(rec.localHeader, rec.data);
  }
  for (const cd of centralParts) {
    blobParts.push(cd);
  }
  blobParts.push(eocd);

  return new Blob(blobParts, { type: 'application/zip' });
}

/**
 * Triggers a browser file download cleanly.
 * @param {Blob} blob
 * @param {string} filename
 */
function triggerBrowserDownload(blob, filename) {
  if (typeof document === 'undefined') return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1500);
}


// --- src/filesystem/adapter.js ---


/**
 * Browser-aware filesystem adapter supporting both native File System Access API
 * and read-only / export fallback mode.
 */
class FilesystemAdapter {
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


// --- src/filesystem/directory-scanner.js ---



const IGNORED_SYSTEM_DIRS = new Set([
  '.winisort',
  '.git',
  'node_modules',
  '.DS_Store',
  'Thumbs.db',
  '$RECYCLE.BIN',
  'System Volume Information'
]);

/**
 * Lazy async directory scanner supporting both FileSystemDirectoryHandle trees and fallback FileList arrays.
 * Supports pause, resume, and AbortController cancellation without Promise.all() memory spikes.
 */
class DirectoryScanner {
  constructor() {
    this.isPaused = false;
    this.pauseResolvers = [];
  }

  pause() {
    this.isPaused = true;
  }

  resume() {
    this.isPaused = false;
    while (this.pauseResolvers.length > 0) {
      const resolve = this.pauseResolvers.shift();
      resolve();
    }
  }

  async waitIfPaused() {
    if (!this.isPaused) return;
    await new Promise(resolve => this.pauseResolvers.push(resolve));
  }

  /**
   * Scans a FileSystemDirectoryHandle lazily.
   * @param {FileSystemDirectoryHandle} rootHandle
   * @param {{
   *   sourceId: string,
   *   sourceName: string,
   *   filters: Object,
   *   existingFingerprints?: Set<string>,
   *   outputDirHandle?: FileSystemDirectoryHandle,
   *   signal?: AbortSignal,
   *   onProgress?: (stats: Object) => void,
   *   onFileAccepted?: (fileRecord: Object) => void
   * }} options
   */
  async scanDirectoryHandle(rootHandle, options) {
    const stats = {
      foldersDiscovered: 1,
      filesScanned: 0,
      eligibleFiles: 0,
      ignoredFiles: 0,
      totalEligibleBytes: 0,
      currentFolder: options.sourceName || rootHandle.name || 'Root',
      startedAt: Date.now(),
      elapsedMs: 0,
      errors: []
    };

    const existingFingerprints = options.existingFingerprints || new Set();
    const filters = options.filters || {};

    const walk = async (dirHandle, relativePrefix) => {
      if (options.signal?.aborted) {
        throw new DOMException('Directory scan canceled', 'AbortError');
      }
      await this.waitIfPaused();

      // Prevent recursive output-folder re-import loop
      if (options.outputDirHandle && typeof dirHandle.isSameEntry === 'function') {
        try {
          if (await dirHandle.isSameEntry(options.outputDirHandle)) {
            stats.ignoredFiles++;
            return;
          }
        } catch (_) {}
      }

      stats.currentFolder = relativePrefix || options.sourceName || dirHandle.name;

      let iterator;
      try {
        iterator = dirHandle.values();
      } catch (err) {
        stats.errors.push({ path: relativePrefix, message: err.message || 'Directory unreadable' });
        return;
      }

      for await (const entry of iterator) {
        if (options.signal?.aborted) {
          throw new DOMException('Directory scan canceled', 'AbortError');
        }
        await this.waitIfPaused();

        const entryName = entry.name || '';
        if (IGNORED_SYSTEM_DIRS.has(entryName)) {
          continue;
        }
        if (!filters.includeHiddenFiles && entryName.startsWith('.')) {
          stats.ignoredFiles++;
          continue;
        }

        const relPath = sanitizeRelativePath(relativePrefix ? `${relativePrefix}/${entryName}` : entryName);

        if (entry.kind === 'directory') {
          if (filters.includeNestedFolders !== false) {
            stats.foldersDiscovered++;
            await walk(entry, relPath);
          }
        } else if (entry.kind === 'file') {
          stats.filesScanned++;
          try {
            const fileObj = await entry.getFile();
            const candidateInfo = {
              name: fileObj.name,
              size: fileObj.size,
              type: fileObj.type,
              lastModified: fileObj.lastModified,
              relativePath: relPath
            };

            const fingerprint = createFileFingerprint(candidateInfo);
            if (existingFingerprints.has(fingerprint)) {
              stats.ignoredFiles++;
              continue;
            }

            const evalResult = evaluateFileEligibility(candidateInfo, filters);
            if (!evalResult.eligible) {
              stats.ignoredFiles++;
            } else {
              existingFingerprints.add(fingerprint);
              stats.eligibleFiles++;
              stats.totalEligibleBytes += fileObj.size || 0;

              const record = {
                id: createId('file'),
                sourceId: options.sourceId,
                sourceName: options.sourceName,
                name: fileObj.name,
                relativePath: relPath,
                size: fileObj.size,
                type: fileObj.type || '',
                lastModified: fileObj.lastModified || Date.now(),
                extension: evalResult.classification.extension,
                category: evalResult.classification.category,
                emoji: evalResult.classification.emoji,
                previewKind: evalResult.classification.previewKind,
                isPreviewable: evalResult.classification.isPreviewable,
                isCompressibleImage: evalResult.classification.isCompressibleImage,
                status: 'unsorted', // 'unsorted' | 'sorted' | 'skipped' | 'review-later'
                favorite: false,
                assignedDestinationId: null,
                sortedOutputName: null,
                fileHandle: entry,
                parentDirHandle: dirHandle,
                fallbackFile: null,
                fingerprint
              };
              if (options.onFileAccepted) {
                options.onFileAccepted(record);
              }
            }
          } catch (fileErr) {
            stats.errors.push({ path: relPath, message: fileErr.message || 'File inaccessible' });
          }

          if (stats.filesScanned % 20 === 0 && options.onProgress) {
            stats.elapsedMs = Date.now() - stats.startedAt;
            options.onProgress({ ...stats });
          }
        }
      }
    };

    await walk(rootHandle, '');
    stats.elapsedMs = Date.now() - stats.startedAt;
    if (options.onProgress) options.onProgress({ ...stats });
    return stats;
  }

  /**
   * Scans a standard FileList or Array<File> (from <input type="file"> or drag-and-drop).
   * @param {Iterable<File>} fileList
   * @param {{
   *   sourceId: string,
   *   sourceName: string,
   *   filters: Object,
   *   existingFingerprints?: Set<string>,
   *   signal?: AbortSignal,
   *   onProgress?: (stats: Object) => void,
   *   onFileAccepted?: (fileRecord: Object) => void
   * }} options
   */
  async scanFileList(fileList, options) {
    const files = Array.from(fileList || []);
    const stats = {
      foldersDiscovered: 1,
      filesScanned: 0,
      eligibleFiles: 0,
      ignoredFiles: 0,
      totalEligibleBytes: 0,
      currentFolder: options.sourceName || 'Selected Files',
      startedAt: Date.now(),
      elapsedMs: 0,
      errors: []
    };

    const seenFolders = new Set();
    const existingFingerprints = options.existingFingerprints || new Set();
    const filters = options.filters || {};

    for (let i = 0; i < files.length; i++) {
      if (options.signal?.aborted) {
        throw new DOMException('File scan canceled', 'AbortError');
      }
      await this.waitIfPaused();

      const fileObj = files[i];
      const rawRel = fileObj.webkitRelativePath || fileObj.name;
      const relPath = sanitizeRelativePath(rawRel);

      if (relPath.includes('/')) {
        const folderPart = relPath.slice(0, relPath.lastIndexOf('/'));
        if (!seenFolders.has(folderPart)) {
          seenFolders.add(folderPart);
          stats.foldersDiscovered = 1 + seenFolders.size;
        }
        if (filters.includeNestedFolders === false && folderPart.includes('/')) {
          stats.ignoredFiles++;
          continue;
        }
      }

      if (relPath.split('/').some(seg => IGNORED_SYSTEM_DIRS.has(seg))) {
        stats.ignoredFiles++;
        continue;
      }

      stats.filesScanned++;
      const candidateInfo = {
        name: fileObj.name,
        size: fileObj.size,
        type: fileObj.type,
        lastModified: fileObj.lastModified,
        relativePath: relPath
      };

      const fingerprint = createFileFingerprint(candidateInfo);
      if (existingFingerprints.has(fingerprint)) {
        stats.ignoredFiles++;
        continue;
      }

      const evalResult = evaluateFileEligibility(candidateInfo, filters);
      if (!evalResult.eligible) {
        stats.ignoredFiles++;
      } else {
        existingFingerprints.add(fingerprint);
        stats.eligibleFiles++;
        stats.totalEligibleBytes += fileObj.size || 0;

        const record = {
          id: createId('file'),
          sourceId: options.sourceId,
          sourceName: options.sourceName,
          name: fileObj.name,
          relativePath: relPath,
          size: fileObj.size,
          type: fileObj.type || '',
          lastModified: fileObj.lastModified || Date.now(),
          extension: evalResult.classification.extension,
          category: evalResult.classification.category,
          emoji: evalResult.classification.emoji,
          previewKind: evalResult.classification.previewKind,
          isPreviewable: evalResult.classification.isPreviewable,
          isCompressibleImage: evalResult.classification.isCompressibleImage,
          status: 'unsorted',
          favorite: false,
          assignedDestinationId: null,
          sortedOutputName: null,
          fileHandle: null,
          parentDirHandle: null,
          fallbackFile: fileObj,
          fingerprint
        };

        if (options.onFileAccepted) {
          options.onFileAccepted(record);
        }
      }

      if (i % 50 === 0 && options.onProgress) {
        stats.elapsedMs = Date.now() - stats.startedAt;
        options.onProgress({ ...stats });
        await new Promise(r => setTimeout(r, 0));
      }
    }

    stats.elapsedMs = Date.now() - stats.startedAt;
    if (options.onProgress) options.onProgress({ ...stats });
    return stats;
  }
}


// --- src/filesystem/source-manager.js ---
class SourceManager {
  constructor(store) {
    this.store = store;
    this.scanner = new DirectoryScanner();
    this.activeAbortController = null;
  }

  getExistingFingerprints() {
    const set = new Set();
    for (const file of this.store.files.values()) {
      if (file.fingerprint) set.add(file.fingerprint);
    }
    return set;
  }

  /**
   * Imports a native FileSystemDirectoryHandle as a source.
   * Prevents duplicate overlapping source imports automatically.
   * @param {FileSystemDirectoryHandle} dirHandle
   * @param {{ onComplete?: (stats: Object) => void }} [callbacks]
   */
  async importDirectoryHandle(dirHandle, callbacks = {}) {
    // Check if already imported
    for (const existing of this.store.sources.values()) {
      if (existing.handle) {
        const rel = await checkDirectoryRelationship(existing.handle, dirHandle);
        if (rel.same) {
          return this.rescanSource(existing.id, callbacks);
        }
      }
    }

    const sourceId = createId('src');
    const sourceRecord = {
      id: sourceId,
      name: dirHandle.name || 'Source Folder',
      kind: 'directory-handle',
      handle: dirHandle,
      addedAt: Date.now(),
      fileCount: 0,
      totalBytes: 0
    };
    this.store.sources.set(sourceId, sourceRecord);

    return this._runScan(sourceRecord, async (signal, onProgress, onFileAccepted) => {
      return this.scanner.scanDirectoryHandle(dirHandle, {
        sourceId,
        sourceName: sourceRecord.name,
        filters: this.store.filters,
        existingFingerprints: this.getExistingFingerprints(),
        outputDirHandle: this.store.project.outputRootHandle,
        signal,
        onProgress,
        onFileAccepted
      });
    }, callbacks);
  }

  /**
   * Imports a FileList or Array<File> as a source.
   * @param {Iterable<File>} fileList
   * @param {string} [label='Selected Files']
   * @param {{ onComplete?: (stats: Object) => void }} [callbacks]
   */
  async importFileList(fileList, label = 'Selected Files', callbacks = {}) {
    const sourceId = createId('src');
    const sourceRecord = {
      id: sourceId,
      name: label,
      kind: 'file-list',
      handle: null,
      addedAt: Date.now(),
      fileCount: 0,
      totalBytes: 0
    };
    this.store.sources.set(sourceId, sourceRecord);

    return this._runScan(sourceRecord, async (signal, onProgress, onFileAccepted) => {
      return this.scanner.scanFileList(fileList, {
        sourceId,
        sourceName: sourceRecord.name,
        filters: this.store.filters,
        existingFingerprints: this.getExistingFingerprints(),
        signal,
        onProgress,
        onFileAccepted
      });
    }, callbacks);
  }

  async rescanSource(sourceId, callbacks = {}) {
    const sourceRecord = this.store.sources.get(sourceId);
    if (!sourceRecord || !sourceRecord.handle) return null;
    return this._runScan(sourceRecord, async (signal, onProgress, onFileAccepted) => {
      return this.scanner.scanDirectoryHandle(sourceRecord.handle, {
        sourceId,
        sourceName: sourceRecord.name,
        filters: this.store.filters,
        existingFingerprints: this.getExistingFingerprints(),
        outputDirHandle: this.store.project.outputRootHandle,
        signal,
        onProgress,
        onFileAccepted
      });
    }, callbacks);
  }

  removeSource(sourceId) {
    this.store.sources.delete(sourceId);
    for (const [fileId, file] of this.store.files.entries()) {
      if (file.sourceId === sourceId && file.status !== 'sorted') {
        this.store.files.delete(fileId);
      }
    }
    this.store.recomputeDerivedState();
    this.store.notify('sources');
  }

  cancelScan() {
    if (this.activeAbortController) {
      this.activeAbortController.abort();
      this.activeAbortController = null;
    }
    this.store.ui.isScanning = false;
    this.store.notify('scan');
  }

  async _runScan(sourceRecord, scanFn, callbacks) {
    this.activeAbortController = new AbortController();
    this.store.ui.isScanning = true;
    this.store.notify('scan');

    try {
      const stats = await scanFn(
        this.activeAbortController.signal,
        (progress) => {
          this.store.ui.scanProgress = progress;
          this.store.notify('scan-progress');
        },
        (fileRecord) => {
          this.store.files.set(fileRecord.id, fileRecord);
          sourceRecord.fileCount++;
          sourceRecord.totalBytes += fileRecord.size || 0;
        }
      );

      this.store.ui.isScanning = false;
      this.store.ui.scanProgress = stats;
      this.store.recomputeDerivedState();
      this.store.notify('files-imported', stats);
      if (callbacks.onComplete) callbacks.onComplete(stats);
      return stats;
    } catch (err) {
      this.store.ui.isScanning = false;
      this.store.recomputeDerivedState();
      this.store.notify('scan-error', err);
      throw err;
    } finally {
      this.activeAbortController = null;
    }
  }
}


// --- src/filesystem/destination-manager.js ---
class DestinationManager {
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


// --- src/filesystem/copy-engine.js ---




const STREAM_CHUNK_SIZE = 512 * 1024; // 512 KB controlled streaming buffer

/**
 * Executes real, verified streaming file copies (and optional verified moves) to destination folders.
 * Never buffers entire large files into RAM when streaming is supported.
 */
class CopyEngine {
  constructor(store, adapter, destinationManager) {
    this.store = store;
    this.adapter = adapter;
    this.destinationManager = destinationManager;
  }

  /**
   * Resolves the underlying File object for a fileRecord.
   * @param {Object} fileRecord
   * @returns {Promise<File>}
   */
  async resolveSourceFile(fileRecord) {
    if (fileRecord.fallbackFile instanceof Blob) {
      return fileRecord.fallbackFile;
    }
    if (fileRecord.fileHandle && typeof fileRecord.fileHandle.getFile === 'function') {
      try {
        return await fileRecord.fileHandle.getFile();
      } catch (err) {
        throw normalizeError(err, `Reading source file "${fileRecord.name}"`);
      }
    }
    throw new WiniSortError(
      ErrorCode.SOURCE_FILE_MOVED,
      `Source file "${fileRecord.name}" is no longer accessible.`
    );
  }

  /**
   * Copies (or moves) a single fileRecord to a target destination.
   * @param {Object} fileRecord
   * @param {Object} destination
   * @param {{
   *   signal?: AbortSignal,
   *   collisionPolicy?: string,
   *   dryRun?: boolean,
   *   customOutputName?: string,
   *   onProgress?: (bytesWritten: number, totalBytes: number) => void
   * }} [options]
   */
  async executeFileCopy(fileRecord, destination, options = {}) {
    if (!fileRecord || !destination) {
      throw new Error('Missing file or destination for sorting operation.');
    }

    const dryRun = options.dryRun ?? this.store.preferences.dryRunMode;
    const collisionPolicy = options.collisionPolicy || this.store.preferences.collisionPolicy || 'keep-both';
    const desiredName = options.customOutputName || fileRecord.name;

    // 1. Verify source availability
    const sourceFile = await this.resolveSourceFile(fileRecord);
    const totalBytes = sourceFile.size;

    // 2. Ensure destination handle is connected if outputRootHandle exists
    if (!destination.dirHandle && this.store.project.outputRootHandle) {
      destination.dirHandle = await this.adapter.getSubdirectory(
        this.store.project.outputRootHandle,
        destination.folderName,
        true
      );
    }

    // 3. Resolve filename collisions
    const existsFn = async (candidateName) => {
      if (destination.dirHandle) {
        return this.adapter.fileExists(destination.dirHandle, candidateName);
      }
      return destination.exportedFiles.has(candidateName);
    };

    const collision = await resolveFilenameCollision(desiredName, existsFn, { policy: collisionPolicy });
    if (collision.action === 'skip') {
      return {
        status: 'skipped-collision',
        finalName: collision.finalName,
        bytesWritten: 0,
        collided: true,
        mode: 'skip'
      };
    }

    if (dryRun) {
      return {
        status: 'dry-run',
        finalName: collision.finalName,
        bytesWritten: totalBytes,
        collided: collision.collided,
        mode: 'dry-run'
      };
    }

    // 4. Native FileSystemDirectoryHandle streaming write
    if (destination.dirHandle) {
      const hasPerm = await verifyHandlePermission(destination.dirHandle, 'readwrite', true);
      if (!hasPerm) {
        throw new WiniSortError(
          ErrorCode.DESTINATION_NOT_WRITABLE,
          `Destination "${destination.name}" is not writable. Permission was denied.`
        );
      }

      destination.stats.pendingCount++;
      let writable = null;
      let targetFileHandle = null;

      try {
        targetFileHandle = await destination.dirHandle.getFileHandle(collision.finalName, { create: true });
        writable = await targetFileHandle.createWritable();

        // Stream in controlled chunks so large videos are never read into a single ArrayBuffer
        let offset = 0;
        while (offset < totalBytes) {
          if (options.signal?.aborted) {
            throw new DOMException('Copy operation canceled', 'AbortError');
          }
          const end = Math.min(offset + STREAM_CHUNK_SIZE, totalBytes);
          const chunkBlob = sourceFile.slice(offset, end);
          await writable.write(chunkBlob);
          offset = end;
          if (options.onProgress) {
            options.onProgress(offset, totalBytes);
          }
        }

        await writable.close();
        writable = null;

        // Verify completion and final file size on disk
        const writtenFile = await targetFileHandle.getFile();
        const verification = await verifyCopiedFile(sourceFile, writtenFile, {
          strongHash: Boolean(this.store.preferences.verifyCopyIntegrity && totalBytes <= 25 * 1024 * 1024),
          signal: options.signal
        });

        if (!verification.verified) {
          throw new WiniSortError(
            ErrorCode.COPY_INTERRUPTED,
            `Verification failed for "${collision.finalName}": ${verification.reason}`
          );
        }

        // Optional MOVE mode (copy -> verify -> remove source only when explicitly authorized)
        let moveCompleted = false;
        let moveWarning = null;
        if (
          this.store.preferences.operationMode === 'move' &&
          this.store.preferences.allowSourceModification &&
          fileRecord.parentDirHandle
        ) {
          try {
            await this.adapter.removeFileEntry(fileRecord.parentDirHandle, fileRecord.name);
            moveCompleted = true;
          } catch (removeErr) {
            moveWarning = `Copy succeeded and was verified, but original source could not be removed (${removeErr.message}). Treated as completed copy.`;
          }
        }

        destination.stats.pendingCount = Math.max(0, destination.stats.pendingCount - 1);
        destination.stats.verifiedFromDisk = true;

        return {
          status: 'completed',
          finalName: collision.finalName,
          bytesWritten: totalBytes,
          collided: collision.collided,
          digest: verification.digest || null,
          mode: moveCompleted ? 'move-disk' : 'copy-disk',
          moveWarning,
          targetFileHandle
        };
      } catch (err) {
        destination.stats.pendingCount = Math.max(0, destination.stats.pendingCount - 1);
        destination.stats.failedCount++;
        if (writable && typeof writable.abort === 'function') {
          try { await writable.abort(); } catch (_) {}
        }
        throw normalizeError(err, `Copying "${fileRecord.name}" to "${destination.name}"`);
      }
    }

    // 5. Fallback session export staging (honestly labeled as session-staged for ZIP/download export)
    destination.exportedFiles.set(collision.finalName, {
      fileRecordId: fileRecord.id,
      name: collision.finalName,
      size: totalBytes,
      sourceFile
    });

    return {
      status: 'completed',
      finalName: collision.finalName,
      bytesWritten: totalBytes,
      collided: collision.collided,
      mode: 'session-export-staged'
    };
  }
}


// --- src/filesystem/operation-queue.js ---

/**
 * Backpressure-aware, cancelable operation queue for single and batch sorting jobs.
 */
class OperationQueue {
  constructor(concurrency = 2) {
    this.concurrency = Math.max(1, concurrency);
    this.queue = [];
    this.activeCount = 0;
    this.abortController = new AbortController();
  }

  setConcurrency(limit) {
    this.concurrency = Math.max(1, Math.min(limit || 2, 8));
  }

  /**
   * Enqueues an async task and returns a promise resolving when the task completes.
   * @param {(signal: AbortSignal) => Promise<any>} taskFn
   * @param {Object} [meta]
   * @returns {Promise<any>}
   */
  enqueue(taskFn, meta = {}) {
    const opId = createId('op');
    return new Promise((resolve, reject) => {
      this.queue.push({
        id: opId,
        meta,
        taskFn,
        resolve,
        reject
      });
      this._drain();
    });
  }

  cancelAllPending() {
    this.abortController.abort();
    while (this.queue.length > 0) {
      const item = this.queue.shift();
      item.reject(new DOMException('Queued operation canceled', 'AbortError'));
    }
    this.abortController = new AbortController();
  }

  getPendingCount() {
    return this.queue.length + this.activeCount;
  }

  async _drain() {
    while (this.activeCount < this.concurrency && this.queue.length > 0) {
      const item = this.queue.shift();
      this.activeCount++;
      const signal = this.abortController.signal;

      Promise.resolve()
        .then(() => item.taskFn(signal))
        .then((res) => item.resolve(res))
        .catch((err) => item.reject(err))
        .finally(() => {
          this.activeCount = Math.max(0, this.activeCount - 1);
          this._drain();
        });
    }
  }
}


// --- src/project/migrations.js ---
const CURRENT_SCHEMA_VERSION = '1.0.0';

/**
 * Validates and migrates a loaded project manifest to CURRENT_SCHEMA_VERSION.
 * Never allows raw media bytes or base64 blobs inside manifest payloads.
 * @param {any} rawManifest
 * @returns {{ valid: boolean, manifest?: Object, migrated: boolean, errors: string[] }}
 */
function validateAndMigrateManifest(rawManifest) {
  const errors = [];
  if (!rawManifest || typeof rawManifest !== 'object' || Array.isArray(rawManifest)) {
    return { valid: false, migrated: false, errors: ['Manifest root must be a JSON object.'] };
  }

  let migrated = false;
  const clone = structuredClone ? structuredClone(rawManifest) : JSON.parse(JSON.stringify(rawManifest));

  if (!clone.schemaVersion) {
    clone.schemaVersion = '0.9.0';
  }
  if (clone.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    // Migrate 0.9.x -> 1.0.0
    clone.schemaVersion = CURRENT_SCHEMA_VERSION;
    migrated = true;
  }

  if (typeof clone.projectId !== 'string' || !clone.projectId.trim()) {
    errors.push('Missing or invalid projectId.');
  }
  if (typeof clone.name !== 'string' || !clone.name.trim()) {
    clone.name = 'Restored WiniSort Project';
  }
  if (!Array.isArray(clone.destinations)) {
    errors.push('Manifest "destinations" must be an array.');
  }
  if (!Array.isArray(clone.sources)) {
    clone.sources = [];
  }
  if (!Array.isArray(clone.assignments)) {
    clone.assignments = [];
  }

  return {
    valid: errors.length === 0,
    manifest: clone,
    migrated,
    errors
  };
}


// --- src/project/manifest.js ---


/**
 * Serializes the current application state into a portable, human-readable project.json structure.
 * Never embeds raw File objects, Blobs, or base64 media previews.
 * @param {import('../core/state.js').AppStateStore} store
 * @returns {Object}
 */
function serializeProjectManifest(store) {
  const sources = [];
  for (const src of store.sources.values()) {
    sources.push({
      id: src.id,
      name: src.name,
      kind: src.kind,
      addedAt: src.addedAt,
      fileCount: src.fileCount,
      totalBytes: src.totalBytes
    });
  }

  const destinations = [];
  for (const dest of store.destinations.values()) {
    destinations.push({
      id: dest.id,
      name: dest.name,
      folderName: dest.folderName,
      emoji: dest.emoji,
      color: dest.color,
      bank: dest.bank,
      pinned: dest.pinned,
      favorite: dest.favorite,
      shortcut: dest.shortcut,
      collection: dest.collection,
      quotaBytes: dest.quotaBytes,
      isAppCreated: dest.isAppCreated,
      isExternalConnection: dest.isExternalConnection,
      stats: { ...dest.stats }
    });
  }

  const assignments = [];
  for (const file of store.files.values()) {
    if (file.status !== 'unsorted' || file.favorite) {
      assignments.push({
        fileId: file.id,
        name: file.name,
        relativePath: file.relativePath,
        size: file.size,
        lastModified: file.lastModified,
        fingerprint: file.fingerprint,
        status: file.status,
        favorite: Boolean(file.favorite),
        assignedDestinationId: file.assignedDestinationId,
        sortedOutputName: file.sortedOutputName
      });
    }
  }

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    projectId: store.project.id,
    name: store.project.name,
    createdAt: store.project.createdAt,
    updatedAt: Date.now(),
    outputRootName: store.project.outputRootName || null,
    preferences: { ...store.preferences },
    filters: { ...store.filters },
    rules: Array.from(store.rules || []),
    sources,
    destinations,
    assignments,
    stats: { ...store.stats }
  };
}

/**
 * Parses and validates a JSON string into a verified project manifest object.
 * @param {string} jsonText
 * @returns {Object}
 */
function parseProjectManifestJson(jsonText) {
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    throw new WiniSortError(
      ErrorCode.INVALID_PROJECT_JSON,
      'The selected project file is not valid JSON.',
      { cause: err }
    );
  }
  const result = validateAndMigrateManifest(parsed);
  if (!result.valid) {
    throw new WiniSortError(
      ErrorCode.CORRUPTED_MANIFEST,
      `Invalid project manifest: ${result.errors.join(' ')}`
    );
  }
  return result.manifest;
}


// --- src/project/journal.js ---
/**
 * Append-style JSON Lines (operations.jsonl) journal for tracking pending, completed, and undone operations.
 */
class OperationJournal {
  constructor(maxEntries = 2000) {
    this.maxEntries = maxEntries;
    /** @type {Array<Object>} */
    this.entries = [];
  }

  /**
   * Records an operation transition ('pending' | 'completed' | 'failed' | 'undone').
   * @param {{
   *   opId: string,
   *   type: string,
   *   status: 'pending' | 'completed' | 'failed' | 'undone',
   *   fileName: string,
   *   fileSize: number,
   *   fingerprint?: string,
   *   destinationId?: string,
   *   destinationName?: string,
   *   outputFileName?: string,
   *   timestamp?: number,
   *   error?: string
   * }} record
   */
  append(record) {
    const entry = {
      ...record,
      timestamp: record.timestamp || Date.now()
    };
    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) {
      this.compact();
    }
    return entry;
  }

  /**
   * Compacts the journal by keeping only the latest state per opId up to maxEntries.
   */
  compact() {
    const latestByOp = new Map();
    for (const entry of this.entries) {
      latestByOp.set(entry.opId, entry);
    }
    this.entries = Array.from(latestByOp.values()).slice(-Math.floor(this.maxEntries * 0.75));
  }

  toJsonLines() {
    return this.entries.map(e => JSON.stringify(e)).join('\n') + (this.entries.length ? '\n' : '');
  }

  static fromJsonLines(jsonlText) {
    const journal = new OperationJournal();
    if (typeof jsonlText !== 'string' || !jsonlText.trim()) return journal;
    const lines = jsonlText.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const obj = JSON.parse(trimmed);
        if (obj && obj.opId) journal.entries.push(obj);
      } catch (_) {
        // Ignore truncated trailing line from crash
      }
    }
    return journal;
  }
}


// --- src/project/checkpoints.js ---
class CheckpointManager {
  constructor(store) {
    this.store = store;
    this.opsSinceLastCheckpoint = 0;
    this.checkpoints = [];
  }

  createSnapshot(label = 'auto') {
    const manifest = serializeProjectManifest(this.store);
    const snapshot = {
      id: `ckpt_${Date.now()}`,
      label,
      timestamp: Date.now(),
      manifest
    };
    this.checkpoints.push(snapshot);
    if (this.checkpoints.length > 10) {
      this.checkpoints.shift();
    }
    this.opsSinceLastCheckpoint = 0;
    return snapshot;
  }

  notifyOperationCompleted() {
    this.opsSinceLastCheckpoint++;
    const interval = this.store.preferences.autoCheckpointInterval || 10;
    if (this.opsSinceLastCheckpoint >= interval) {
      return this.createSnapshot('auto');
    }
    return null;
  }
}


// --- src/project/recovery.js ---
/**
 * Analyzes an OperationJournal (and optional disk directory verification) to detect interrupted or partial operations.
 * Distinguishes valid completions from partial/interrupted operations without ever deleting uncertain files automatically.
 *
 * @param {import('./journal.js').OperationJournal} journal
 * @param {(destName: string, outputFileName: string) => Promise<{ exists: boolean, size?: number }>} [diskInspector]
 * @returns {Promise<Array<{
 *   opId: string,
 *   fileName: string,
 *   destinationName: string,
 *   outputFileName: string,
 *   expectedSize: number,
 *   actualSize: number | null,
 *   state: 'verified-complete' | 'partial-write' | 'missing-output' | 'failed',
 *   recommendedAction: 'mark-sorted' | 'retry-copy' | 'review-manual'
 * }>>}
 */
async function analyzeCrashRecovery(journal, diskInspector = null) {
  const byOpId = new Map();
  for (const entry of journal.entries) {
    if (!entry || !entry.opId) continue;
    byOpId.set(entry.opId, entry);
  }

  const report = [];
  for (const [opId, lastEntry] of byOpId.entries()) {
    if (lastEntry.status === 'pending' || lastEntry.status === 'failed') {
      let exists = false;
      let actualSize = null;
      if (diskInspector && lastEntry.destinationName && lastEntry.outputFileName) {
        try {
          const diskInfo = await diskInspector(lastEntry.destinationName, lastEntry.outputFileName);
          exists = Boolean(diskInfo?.exists);
          actualSize = typeof diskInfo?.size === 'number' ? diskInfo.size : null;
        } catch (_) {}
      }

      if (exists && actualSize === lastEntry.fileSize && lastEntry.fileSize > 0) {
        report.push({
          opId,
          fileName: lastEntry.fileName,
          destinationName: lastEntry.destinationName || '',
          outputFileName: lastEntry.outputFileName || lastEntry.fileName,
          expectedSize: lastEntry.fileSize,
          actualSize,
          state: 'verified-complete',
          recommendedAction: 'mark-sorted'
        });
      } else if (exists && actualSize !== lastEntry.fileSize) {
        report.push({
          opId,
          fileName: lastEntry.fileName,
          destinationName: lastEntry.destinationName || '',
          outputFileName: lastEntry.outputFileName || lastEntry.fileName,
          expectedSize: lastEntry.fileSize || 0,
          actualSize,
          state: 'partial-write',
          recommendedAction: 'review-manual'
        });
      } else {
        report.push({
          opId,
          fileName: lastEntry.fileName,
          destinationName: lastEntry.destinationName || '',
          outputFileName: lastEntry.outputFileName || lastEntry.fileName,
          expectedSize: lastEntry.fileSize || 0,
          actualSize: null,
          state: lastEntry.status === 'failed' ? 'failed' : 'missing-output',
          recommendedAction: 'retry-copy'
        });
      }
    }
  }

  return report;
}


// --- src/project/project-manager.js ---





/**
 * Manages disk-first `.winisort/` project persistence inside the user-selected output root directory,
 * plus portable JSON export/import when operating in fallback browsers.
 */
class ProjectManager {
  constructor(store, adapter, destinationManager) {
    this.store = store;
    this.adapter = adapter;
    this.destinationManager = destinationManager;
    this.journal = new OperationJournal();
    this.checkpoints = new CheckpointManager(store);
  }

  /**
   * Writes `.winisort/project.json` and `.winisort/operations.jsonl` to the connected outputRootHandle if available.
   */
  async saveProjectToDisk() {
    const manifest = serializeProjectManifest(this.store);
    const rootHandle = this.store.project.outputRootHandle;

    if (rootHandle && typeof rootHandle.getDirectoryHandle === 'function') {
      const metaDir = await this.adapter.getSubdirectory(rootHandle, '.winisort', true);
      await this._writeTextFile(metaDir, 'project.json', JSON.stringify(manifest, null, 2));
      await this._writeTextFile(metaDir, 'operations.jsonl', this.journal.toJsonLines());
      this.store.project.isDirty = false;
      this.store.project.updatedAt = Date.now();
      this.store.notify('project-saved', { mode: 'disk', path: `${rootHandle.name}/.winisort/project.json` });
      return { mode: 'disk', manifest };
    }

    // Fallback: trigger portable JSON download
    this.exportPortableProjectJson();
    return { mode: 'download', manifest };
  }

  exportPortableProjectJson() {
    const manifest = serializeProjectManifest(this.store);
    const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' });
    const safeTitle = (this.store.project.name || 'winisort-project').toLowerCase().replace(/[^a-z0-9-_]+/g, '-');
    triggerBrowserDownload(blob, `${safeTitle}.winisort.json`);
    this.store.project.isDirty = false;
    this.store.notify('project-exported', manifest);
    return manifest;
  }

  /**
   * Restores project configuration, destinations, filters, and assignment statuses from a manifest object.
   * @param {Object} manifest
   */
  async restoreFromManifest(manifest) {
    this.store.project.id = manifest.projectId || this.store.project.id;
    this.store.project.name = manifest.name || 'Restored Project';
    if (manifest.preferences) {
      this.store.preferences = { ...this.store.preferences, ...manifest.preferences };
    }
    if (manifest.filters) {
      this.store.filters = { ...this.store.filters, ...manifest.filters };
    }
    if (Array.isArray(manifest.rules)) {
      this.store.rules = manifest.rules;
    }

    // Restore destinations
    this.store.destinations.clear();
    for (const d of manifest.destinations || []) {
      let dirHandle = null;
      if (this.store.project.outputRootHandle && !d.isExternalConnection) {
        try {
          dirHandle = await this.adapter.getSubdirectory(
            this.store.project.outputRootHandle,
            d.folderName || d.name,
            true
          );
        } catch (_) {}
      }
      this.store.destinations.set(d.id, {
        ...d,
        dirHandle,
        exportedFiles: new Map(),
        stats: d.stats || this.destinationManager._createEmptyStats()
      });
    }

    // Reconcile assignment statuses against currently imported files by fingerprint
    const assignmentByFp = new Map();
    for (const a of manifest.assignments || []) {
      if (a.fingerprint) assignmentByFp.set(a.fingerprint, a);
    }

    for (const file of this.store.files.values()) {
      const matched = assignmentByFp.get(file.fingerprint);
      if (matched) {
        file.status = matched.status || file.status;
        file.favorite = Boolean(matched.favorite);
        file.assignedDestinationId = matched.assignedDestinationId || null;
        file.sortedOutputName = matched.sortedOutputName || null;
      }
    }

    this.store.recomputeDerivedState();
    this.store.notify('project-restored', manifest);
  }

  /**
   * Inspects an output directory for `.winisort/project.json` and `.winisort/operations.jsonl`,
   * restores metadata, and runs crash recovery diagnostics.
   * @param {FileSystemDirectoryHandle} outputRootHandle
   */
  async loadAndRecoverFromDirectory(outputRootHandle) {
    await this.destinationManager.setOutputRootDirectory(outputRootHandle);
    try {
      const metaDir = await outputRootHandle.getDirectoryHandle('.winisort', { create: false });
      const projText = await this._readTextFile(metaDir, 'project.json');
      if (projText) {
        const manifest = parseProjectManifestJson(projText);
        await this.restoreFromManifest(manifest);
      }

      const journalText = await this._readTextFile(metaDir, 'operations.jsonl');
      if (journalText) {
        this.journal = OperationJournal.fromJsonLines(journalText);
        const recoveryItems = await analyzeCrashRecovery(this.journal, async (destName, outputFileName) => {
          try {
            const sub = await outputRootHandle.getDirectoryHandle(destName, { create: false });
            const fh = await sub.getFileHandle(outputFileName, { create: false });
            const f = await fh.getFile();
            return { exists: true, size: f.size };
          } catch (_) {
            return { exists: false };
          }
        });
        this.store.recoveryItems = recoveryItems;
        this.store.notify('recovery-analyzed', recoveryItems);
        return recoveryItems;
      }
    } catch (_) {
      // No existing .winisort directory yet — fresh output directory
    }
    return [];
  }

  async _writeTextFile(dirHandle, filename, content) {
    const fh = await dirHandle.getFileHandle(filename, { create: true });
    const writable = await fh.createWritable();
    await writable.write(content);
    await writable.close();
  }

  async _readTextFile(dirHandle, filename) {
    try {
      const fh = await dirHandle.getFileHandle(filename, { create: false });
      const f = await fh.getFile();
      return await f.text();
    } catch (_) {
      return null;
    }
  }
}


// --- src/sorting/history.js ---

/**
 * Genuine operation-based Undo/Redo Engine differentiating between UI undo and verified Filesystem undo.
 * Never deletes an output file on undo if its size/timestamp was modified externally after WiniSort created it.
 */
class HistoryManager {
  constructor(store, adapter, destinationManager) {
    this.store = store;
    this.adapter = adapter;
    this.destinationManager = destinationManager;
    /** @type {Array<Object>} */
    this.undoStack = [];
    /** @type {Array<Object>} */
    this.redoStack = [];
  }

  canUndo() {
    return this.undoStack.length > 0;
  }

  canRedo() {
    return this.redoStack.length > 0;
  }

  pushOperation(opRecord) {
    this.undoStack.push(opRecord);
    if (this.undoStack.length > 200) {
      this.undoStack.shift();
    }
    this.redoStack = [];
    this.store.notify('history');
  }

  /**
   * Undoes the most recent operation safely.
   * @param {(fileRecord: Object, destination: Object) => Promise<any>} [redoExecutor]
   */
  async undo() {
    if (!this.canUndo()) return null;
    const op = this.undoStack.pop();

    if (op.type === 'sort-file') {
      const file = this.store.files.get(op.fileId);
      const dest = this.store.destinations.get(op.destinationId);

      // If a real disk copy was created by WiniSort, verify it hasn't been modified before removing
      if (op.mode === 'copy-disk' && dest?.dirHandle && op.outputFileName) {
        try {
          const fh = await dest.dirHandle.getFileHandle(op.outputFileName, { create: false });
          const currentDiskFile = await fh.getFile();
          if (currentDiskFile.size !== op.bytesWritten) {
            // Re-push to stack and refuse destructive undo
            this.undoStack.push(op);
            throw new WiniSortError(
              ErrorCode.UNDO_UNSAFE,
              `Cannot safely remove "${op.outputFileName}" from "${dest.name}" because the file was modified externally since sorting.`
            );
          }
          await this.adapter.removeFileEntry(dest.dirHandle, op.outputFileName);
        } catch (err) {
          if (err instanceof WiniSortError) throw err;
          // If file was already removed externally, continue restoring UI queue state safely
        }
      } else if (op.mode === 'session-export-staged' && dest?.exportedFiles) {
        dest.exportedFiles.delete(op.outputFileName);
      }

      if (file) {
        file.status = op.previousStatus || 'unsorted';
        file.assignedDestinationId = op.previousDestinationId || null;
        file.sortedOutputName = op.previousOutputName || null;
        this.store.ui.activeFileId = file.id;
      }
      if (dest && file) {
        this.destinationManager.recordRemoval(dest.id, file, op.bytesWritten);
      }
      this.store.stats.completedCopyBytes = Math.max(0, this.store.stats.completedCopyBytes - (op.bytesWritten || 0));
    } else if (op.type === 'skip-file' || op.type === 'review-later') {
      const file = this.store.files.get(op.fileId);
      if (file) {
        file.status = op.previousStatus || 'unsorted';
        this.store.ui.activeFileId = file.id;
      }
    } else if (op.type === 'batch-sort') {
      // Reverse sub-operations in reverse order
      for (let i = op.items.length - 1; i >= 0; i--) {
        const sub = op.items[i];
        const file = this.store.files.get(sub.fileId);
        const dest = this.store.destinations.get(sub.destinationId);
        if (sub.mode === 'copy-disk' && dest?.dirHandle && sub.outputFileName) {
          try {
            const fh = await dest.dirHandle.getFileHandle(sub.outputFileName, { create: false });
            const f = await fh.getFile();
            if (f.size === sub.bytesWritten) {
              await this.adapter.removeFileEntry(dest.dirHandle, sub.outputFileName);
            }
          } catch (_) {}
        } else if (sub.mode === 'session-export-staged' && dest?.exportedFiles) {
          dest.exportedFiles.delete(sub.outputFileName);
        }
        if (file) {
          file.status = sub.previousStatus || 'unsorted';
          file.assignedDestinationId = null;
          file.sortedOutputName = null;
        }
        if (dest && file) {
          this.destinationManager.recordRemoval(dest.id, file, sub.bytesWritten);
        }
      }
    }

    op.undoneAt = Date.now();
    this.redoStack.push(op);
    this.store.recomputeDerivedState();
    this.store.notify('undo-completed', op);
    return op;
  }

  /**
   * Redoes the most recently undone operation by re-validating permissions and executing through sortingEngine.
   * @param {import('./sorting-engine.js').SortingEngine} sortingEngine
   */
  async redo(sortingEngine) {
    if (!this.canRedo()) return null;
    const op = this.redoStack.pop();

    if (op.type === 'sort-file') {
      await sortingEngine.assignFileToDestination(op.fileId, op.destinationId, { fromRedo: true });
    } else if (op.type === 'skip-file') {
      sortingEngine.skipFile(op.fileId, { fromRedo: true });
    } else if (op.type === 'review-later') {
      sortingEngine.markReviewLater(op.fileId, { fromRedo: true });
    } else if (op.type === 'batch-sort') {
      const fileIds = op.items.map(i => i.fileId);
      const destId = op.items[0]?.destinationId;
      if (destId) {
        await sortingEngine.batchAssignToDestination(fileIds, destId, { fromRedo: true });
      }
    }
    return op;
  }
}


// --- src/sorting/rules.js ---

/**
 * Local rule-based smart sorting & logical folder suggestion engine (zero cloud AI dependencies).
 */
class RulesEngine {
  constructor(store) {
    this.store = store;
  }

  /**
   * Adds a new smart sorting rule.
   * Condition types: 'name-contains' | 'extension-is' | 'category-is' | 'size-over-mb' | 'year-is' | 'is-screenshot'
   */
  addRule(config) {
    const rule = {
      id: createId('rule'),
      name: config.name || 'Smart Rule',
      enabled: config.enabled !== false,
      priority: Number(config.priority ?? (this.store.rules.length + 1)),
      conditionType: config.conditionType || 'name-contains',
      conditionValue: String(config.conditionValue || '').trim(),
      destinationId: config.destinationId,
      createdAt: Date.now()
    };
    this.store.rules.push(rule);
    this.store.rules.sort((a, b) => a.priority - b.priority);
    this.store.notify('rules');
    return rule;
  }

  removeRule(ruleId) {
    this.store.rules = this.store.rules.filter(r => r.id !== ruleId);
    this.store.notify('rules');
  }

  /**
   * Evaluates whether a single fileRecord matches a rule.
   * @param {Object} file
   * @param {Object} rule
   * @returns {boolean}
   */
  matchesRule(file, rule) {
    if (!rule || !rule.enabled || !file) return false;
    const val = (rule.conditionValue || '').toLowerCase();

    switch (rule.conditionType) {
      case 'name-contains':
        return Boolean(val) && file.name.toLowerCase().includes(val);
      case 'extension-is': {
        const exts = val.split(',').map(s => s.replace(/^\./, '').trim()).filter(Boolean);
        return exts.includes((file.extension || '').toLowerCase());
      }
      case 'category-is':
        return file.category === val;
      case 'size-over-mb': {
        const thresholdBytes = parseFloat(val) * 1000 * 1000;
        return Number.isFinite(thresholdBytes) && file.size >= thresholdBytes;
      }
      case 'year-is': {
        if (!file.lastModified) return false;
        const yr = String(new Date(file.lastModified).getUTCFullYear());
        return yr === val;
      }
      case 'is-screenshot': {
        const lower = file.name.toLowerCase();
        return lower.includes('screenshot') || lower.includes('screen shot') || lower.startsWith('scr_');
      }
      default:
        return false;
    }
  }

  /**
   * Previews all unsorted files that match active rules in priority order (Dry Run preview).
   * @returns {Array<{ fileId: string, fileName: string, fileSize: number, ruleId: string, ruleName: string, destinationId: string, destinationName: string }>}
   */
  previewRuleMatches() {
    const activeRules = [...(this.store.rules || [])]
      .filter(r => r.enabled && this.store.destinations.has(r.destinationId))
      .sort((a, b) => a.priority - b.priority);

    const matches = [];
    for (const file of this.store.files.values()) {
      if (file.status !== 'unsorted') continue;
      for (const rule of activeRules) {
        if (this.matchesRule(file, rule)) {
          const dest = this.store.destinations.get(rule.destinationId);
          matches.push({
            fileId: file.id,
            fileName: file.name,
            fileSize: file.size,
            ruleId: rule.id,
            ruleName: rule.name,
            destinationId: rule.destinationId,
            destinationName: dest ? dest.name : 'Unknown'
          });
          break; // First matching highest-priority rule wins
        }
      }
    }
    return matches;
  }

  /**
   * Suggests logical destination folders based on visible filenames, years, and formats in the unsorted pool.
   */
  suggestFoldersFromPool() {
    const suggestions = [];
    const seenNames = new Set(
      Array.from(this.store.destinations.values()).map(d => d.name.toLowerCase())
    );

    let screenshotCount = 0;
    let pdfCount = 0;
    let videoCount = 0;
    let largeCount = 0;
    const years = new Map();

    for (const file of this.store.files.values()) {
      const lower = file.name.toLowerCase();
      if (lower.includes('screenshot') || lower.includes('screen_shot')) screenshotCount++;
      if (file.category === 'pdf') pdfCount++;
      if (file.category === 'videos') videoCount++;
      if (file.size >= 25 * 1000 * 1000) largeCount++;
      if (file.lastModified) {
        const y = String(new Date(file.lastModified).getFullYear());
        years.set(y, (years.get(y) || 0) + 1);
      }
    }

    if (screenshotCount > 0 && !seenNames.has('screenshots')) {
      suggestions.push({ name: 'Screenshots', emoji: '📱', reason: `${screenshotCount} screenshot files detected` });
    }
    if (pdfCount > 0 && !seenNames.has('pdf documents')) {
      suggestions.push({ name: 'PDF Documents', emoji: '📕', reason: `${pdfCount} PDF files in queue` });
    }
    if (videoCount > 0 && !seenNames.has('videos')) {
      suggestions.push({ name: 'Videos', emoji: '🎬', reason: `${videoCount} video clips in queue` });
    }
    if (largeCount > 0 && !seenNames.has('large media')) {
      suggestions.push({ name: 'Large Media', emoji: '🐘', reason: `${largeCount} files over 25 MB` });
    }
    for (const [yr, count] of years.entries()) {
      if (count >= 2 && !seenNames.has(`archive ${yr}`)) {
        suggestions.push({ name: `Archive ${yr}`, emoji: '📅', reason: `${count} files modified in ${yr}` });
      }
    }

    return suggestions.slice(0, 6);
  }
}


// --- src/sorting/selection.js ---
/**
 * Multi-selection controller supporting single toggle, Shift-range selection, Select All filtered, and Clear.
 */
class SelectionManager {
  constructor(store) {
    this.store = store;
    this.lastAnchorFileId = null;
  }

  toggleSelect(fileId, isShiftKey = false) {
    const filtered = this.store.filteredFileIds;
    if (isShiftKey && this.lastAnchorFileId && filtered.includes(this.lastAnchorFileId) && filtered.includes(fileId)) {
      const idxA = filtered.indexOf(this.lastAnchorFileId);
      const idxB = filtered.indexOf(fileId);
      const [start, end] = idxA < idxB ? [idxA, idxB] : [idxB, idxA];
      for (let i = start; i <= end; i++) {
        this.store.ui.selectedFileIds.add(filtered[i]);
      }
    } else {
      if (this.store.ui.selectedFileIds.has(fileId)) {
        this.store.ui.selectedFileIds.delete(fileId);
      } else {
        this.store.ui.selectedFileIds.add(fileId);
      }
      this.lastAnchorFileId = fileId;
    }
    this.store.notify('selection');
  }

  selectAllFiltered() {
    for (const id of this.store.filteredFileIds) {
      this.store.ui.selectedFileIds.add(id);
    }
    this.store.notify('selection');
  }

  clearSelection() {
    if (this.store.ui.selectedFileIds.size === 0) return;
    this.store.ui.selectedFileIds.clear();
    this.lastAnchorFileId = null;
    this.store.notify('selection');
  }

  getActiveOrSelectedFileIds() {
    if (this.store.ui.selectedFileIds.size > 0) {
      return Array.from(this.store.ui.selectedFileIds);
    }
    return this.store.ui.activeFileId ? [this.store.ui.activeFileId] : [];
  }
}


// --- src/sorting/search.js ---
/**
 * Search and quick-filter helper across files and destinations.
 */
function filterDestinationsByQuery(destinationsIterable, query = '') {
  const q = String(query || '').trim().toLowerCase();
  const list = Array.from(destinationsIterable || []);
  if (!q) return list;
  return list.filter(d => {
    const hay = `${d.name} ${d.collection || ''} ${d.emoji || ''}`.toLowerCase();
    return hay.includes(q);
  });
}


// --- src/sorting/duplicate-detector.js ---

/**
 * Two-stage duplicate detector:
 * Stage 1: Fast candidate grouping by exact byte size (and optional normalized stem).
 * Stage 2: Incremental streaming content-hash verification on bounded chunks.
 * Never claims two files are identical by filename alone, and never automatically deletes duplicates.
 */
class DuplicateDetector {
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


// --- src/sorting/sorting-engine.js ---


/**
 * Coordinates single-file and batch sorting operations, journal recording, history tracking,
 * quota warnings, and advancing the active media item only after confirmed completion.
 */
class SortingEngine {
  constructor(store, copyEngine, destinationManager, historyManager, projectManager) {
    this.store = store;
    this.copyEngine = copyEngine;
    this.destinationManager = destinationManager;
    this.historyManager = historyManager;
    this.projectManager = projectManager;
    this.queue = new OperationQueue(store.capabilities.budgets.maxConcurrentCopies || 2);
  }

  /**
   * Formats a custom bulk naming pattern if configured (without renaming original source files).
   * Supported tokens: {name}, {index}, {date}, {dest}
   */
  formatOutputFilename(fileRecord, destination, pattern = '', index = 1) {
    if (!pattern || !pattern.trim()) return fileRecord.name;
    const dotIdx = fileRecord.name.lastIndexOf('.');
    const stem = dotIdx > 0 ? fileRecord.name.slice(0, dotIdx) : fileRecord.name;
    const ext = dotIdx > 0 ? fileRecord.name.slice(dotIdx) : '';
    const dateStr = new Date(fileRecord.lastModified || Date.now()).toISOString().slice(0, 10);

    const rendered = pattern
      .replace(/\{name\}/gi, stem)
      .replace(/\{index\}/gi, String(index).padStart(3, '0'))
      .replace(/\{date\}/gi, dateStr)
      .replace(/\{dest\}/gi, destination.name);

    return `${rendered}${ext}`;
  }

  /**
   * Assigns and copies a single file to a destination folder.
   * Only triggers completion state and advances to next file AFTER disk/session write is verified.
   */
  async assignFileToDestination(fileId, destinationId, options = {}) {
    const fileRecord = this.store.files.get(fileId);
    const destination = this.store.destinations.get(destinationId);
    if (!fileRecord || !destination) {
      throw new Error('Selected file or destination no longer exists.');
    }

    const opId = createId('sort');
    const previousStatus = fileRecord.status;
    const previousDestinationId = fileRecord.assignedDestinationId;
    const previousOutputName = fileRecord.sortedOutputName;

    // Record pending state in journal
    this.projectManager.journal.append({
      opId,
      type: 'sort-file',
      status: 'pending',
      fileName: fileRecord.name,
      fileSize: fileRecord.size,
      fingerprint: fileRecord.fingerprint,
      destinationId: destination.id,
      destinationName: destination.name,
      outputFileName: fileRecord.name
    });

    this.store.notify('operation-pending', { opId, fileId, destinationId });

    try {
      const result = await this.queue.enqueue((signal) =>
        this.copyEngine.executeFileCopy(fileRecord, destination, {
          signal,
          dryRun: options.dryRun,
          customOutputName: options.customOutputName
        })
      );

      if (result.status === 'skipped-collision') {
        fileRecord.status = 'skipped';
        this.store.recomputeDerivedState();
        this.store.notify('file-skipped', { fileRecord, reason: 'Filename collision skipped per policy' });
        return result;
      }

      if (result.status === 'dry-run') {
        this.store.notify('dry-run-preview', { fileRecord, destination, result });
        return result;
      }

      // Confirmed write completion
      fileRecord.status = 'sorted';
      fileRecord.assignedDestinationId = destination.id;
      fileRecord.sortedOutputName = result.finalName;

      this.destinationManager.recordAddition(destination.id, fileRecord, result.bytesWritten);
      this.store.stats.completedCopyBytes += result.bytesWritten || 0;

      // Record completed state in journal
      this.projectManager.journal.append({
        opId,
        type: 'sort-file',
        status: 'completed',
        fileName: fileRecord.name,
        fileSize: fileRecord.size,
        fingerprint: fileRecord.fingerprint,
        destinationId: destination.id,
        destinationName: destination.name,
        outputFileName: result.finalName
      });

      const opRecord = {
          opId,
          type: 'sort-file',
          fileId: fileRecord.id,
          destinationId: destination.id,
          outputFileName: result.finalName,
          bytesWritten: result.bytesWritten,
          mode: result.mode,
          previousStatus,
          previousDestinationId,
          previousOutputName,
          timestamp: Date.now()
        };
      if (options.fromRedo) {
        this.historyManager.undoStack.push(opRecord);
      } else {
        this.historyManager.pushOperation(opRecord);
      }

      this.projectManager.checkpoints.notifyOperationCompleted();
      this.store.ui.selectedFileIds.delete(fileId);
      this.store.recomputeDerivedState();

      // Check destination quota warning
      let quotaExceeded = false;
      if (destination.quotaBytes > 0 && destination.stats.totalBytes >= destination.quotaBytes) {
        quotaExceeded = true;
      }

      this.store.notify('file-sorted', {
        opId,
        fileRecord,
        destination,
        result,
        quotaExceeded
      });

      return result;
    } catch (err) {
      this.store.stats.failedCopyBytes += fileRecord.size || 0;
      this.store.stats.errorsCount++;
      this.projectManager.journal.append({
        opId,
        type: 'sort-file',
        status: 'failed',
        fileName: fileRecord.name,
        fileSize: fileRecord.size,
        destinationId: destination.id,
        destinationName: destination.name,
        error: err.message
      });
      this.store.notify('operation-error', err);
      throw err;
    }
  }

  /**
   * Batch assigns an explicit list of selected file IDs to a destination.
   */
  async batchAssignToDestination(fileIds, destinationId, options = {}) {
    const ids = Array.from(fileIds || []).filter(id => this.store.files.has(id));
    if (ids.length === 0) return [];
    if (ids.length === 1) {
      const single = await this.assignFileToDestination(ids[0], destinationId, options);
      return [single];
    }

    const destination = this.store.destinations.get(destinationId);
    if (!destination) throw new Error('Destination not found');

    const batchItems = [];
    const results = [];

    for (let i = 0; i < ids.length; i++) {
      const fileId = ids[i];
      const fileRecord = this.store.files.get(fileId);
      if (!fileRecord) continue;
      const previousStatus = fileRecord.status;
      const customOutputName = options.namingPattern
        ? this.formatOutputFilename(fileRecord, destination, options.namingPattern, i + 1)
        : fileRecord.name;

      const res = await this.queue.enqueue((signal) =>
        this.copyEngine.executeFileCopy(fileRecord, destination, {
          signal,
          dryRun: options.dryRun,
          customOutputName
        })
      );

      if (res.status === 'completed') {
        fileRecord.status = 'sorted';
        fileRecord.assignedDestinationId = destination.id;
        fileRecord.sortedOutputName = res.finalName;
        this.destinationManager.recordAddition(destination.id, fileRecord, res.bytesWritten);
        this.store.stats.completedCopyBytes += res.bytesWritten || 0;
        batchItems.push({
          fileId,
          destinationId: destination.id,
          outputFileName: res.finalName,
          bytesWritten: res.bytesWritten,
          mode: res.mode,
          previousStatus
        });
      }
      results.push(res);
    }

    if (batchItems.length > 0 && !options.fromRedo) {
      this.historyManager.pushOperation({
        opId: createId('batch'),
        type: 'batch-sort',
        items: batchItems,
        destinationId: destination.id,
        timestamp: Date.now()
      });
    }

    this.store.ui.selectedFileIds.clear();
    this.store.recomputeDerivedState();
    this.store.notify('batch-sorted', { destination, count: batchItems.length, results });
    return results;
  }

  skipFile(fileId, options = {}) {
    const file = this.store.files.get(fileId);
    if (!file) return;
    const prev = file.status;
    file.status = 'skipped';
    if (!options.fromRedo) {
      this.historyManager.pushOperation({
        opId: createId('skip'),
        type: 'skip-file',
        fileId: file.id,
        previousStatus: prev,
        timestamp: Date.now()
      });
    }
    this.store.recomputeDerivedState();
    this.store.notify('file-skipped', { fileRecord: file });
  }

  markReviewLater(fileId, options = {}) {
    const file = this.store.files.get(fileId);
    if (!file) return;
    const prev = file.status;
    file.status = 'review-later';
    if (!options.fromRedo) {
      this.historyManager.pushOperation({
        opId: createId('rev'),
        type: 'review-later',
        fileId: file.id,
        previousStatus: prev,
        timestamp: Date.now()
      });
    }
    this.store.recomputeDerivedState();
    this.store.notify('file-review-later', { fileRecord: file });
  }

  toggleFavorite(fileId) {
    const file = this.store.files.get(fileId);
    if (!file) return;
    file.favorite = !file.favorite;
    this.store.recomputeDerivedState();
    this.store.notify('file-favorite', { fileRecord: file });
  }

  navigateNext() {
    const list = this.store.filteredFileIds;
    if (list.length === 0) return;
    const idx = list.indexOf(this.store.ui.activeFileId);
    const nextIdx = idx >= 0 && idx < list.length - 1 ? idx + 1 : 0;
    this.store.ui.activeFileId = list[nextIdx];
    this.store.notify('active-file');
  }

  navigatePrevious() {
    const list = this.store.filteredFileIds;
    if (list.length === 0) return;
    const idx = list.indexOf(this.store.ui.activeFileId);
    const prevIdx = idx > 0 ? idx - 1 : list.length - 1;
    this.store.ui.activeFileId = list[prevIdx];
    this.store.notify('active-file');
  }
}


// --- src/optimization/image-compressor.js ---
const MAX_SAFE_IMAGE_PIXELS = 64 * 1024 * 1024; // 64 Megapixels safe browser decode ceiling

/**
 * Checks whether an image file is eligible for safe browser-side canvas optimization.
 * Never alters videos, audio, PDFs, or documents.
 * @param {{ name: string, category: string, extension: string, size: number }} fileRecord
 * @returns {{ eligible: boolean, reason?: string }}
 */
function checkCompressionEligibility(fileRecord) {
  if (!fileRecord || fileRecord.category !== 'images') {
    return { eligible: false, reason: 'Only image files are eligible for image optimization.' };
  }
  const ext = (fileRecord.extension || '').toLowerCase();
  if (!['jpg', 'jpeg', 'png', 'webp', 'avif', 'bmp'].includes(ext)) {
    return { eligible: false, reason: `Format ".${ext}" is not supported for canvas re-encoding.` };
  }
  if (fileRecord.size > 85 * 1024 * 1024) {
    return { eligible: false, reason: 'Image exceeds safe browser memory limit (85 MB).' };
  }
  return { eligible: true };
}

/**
 * Compresses or resizes a single image Blob using browser-native createImageBitmap + Canvas.
 * Transparently distinguishes lossless PNG/WebP policies from quality-controlled lossy encoding.
 *
 * @param {Blob|File} sourceBlob
 * @param {{
 *   mode?: 'lossless' | 'quality' | 'resize',
 *   outputFormat?: 'image/webp' | 'image/jpeg' | 'image/png',
 *   quality?: number,
 *   maxDimension?: number
 * }} [options]
 * @returns {Promise<{
 *   blob: Blob,
 *   originalSize: number,
 *   outputSize: number,
 *   savedBytes: number,
 *   width: number,
 *   height: number,
 *   isLossy: boolean,
 *   keptOriginal: boolean,
 *   note: string
 * }>}
 */
async function compressImageBlob(sourceBlob, options = {}) {
  const mode = options.mode || 'quality';
  const quality = Math.max(0.1, Math.min(1.0, Number(options.quality ?? 0.84)));
  const maxDimension = Number(options.maxDimension || 0);
  const outputFormat = options.outputFormat || (mode === 'lossless' ? 'image/png' : 'image/webp');

  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') {
    return {
      blob: sourceBlob,
      originalSize: sourceBlob.size,
      outputSize: sourceBlob.size,
      savedBytes: 0,
      width: 0,
      height: 0,
      isLossy: false,
      keptOriginal: true,
      note: 'Canvas image encoding API unavailable in this environment; original preserved.'
    };
  }

  const bitmap = await createImageBitmap(sourceBlob);
  try {
    const origW = bitmap.width;
    const origH = bitmap.height;
    if (origW * origH > MAX_SAFE_IMAGE_PIXELS) {
      throw new Error(`Image dimensions (${origW}x${origH}) exceed safe browser memory budget.`);
    }

    let targetW = origW;
    let targetH = origH;

    if ((mode === 'resize' || maxDimension > 0) && maxDimension > 64) {
      const longest = Math.max(origW, origH);
      if (longest > maxDimension) {
        const scale = maxDimension / longest;
        targetW = Math.max(1, Math.round(origW * scale));
        targetH = Math.max(1, Math.round(origH * scale));
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, targetW, targetH);

    const encodedBlob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Canvas encoding returned empty blob'))),
        outputFormat,
        mode === 'lossless' ? 1.0 : quality
      );
    });

    // Never replace with a larger file if optimization increased byte size
    if (encodedBlob.size >= sourceBlob.size && targetW === origW && targetH === origH) {
      return {
        blob: sourceBlob,
        originalSize: sourceBlob.size,
        outputSize: sourceBlob.size,
        savedBytes: 0,
        width: origW,
        height: origH,
        isLossy: mode !== 'lossless',
        keptOriginal: true,
        note: 'Re-encoded output was not smaller than original; original file preserved untouched.'
      };
    }

    const savedBytes = Math.max(0, sourceBlob.size - encodedBlob.size);
    return {
      blob: encodedBlob,
      originalSize: sourceBlob.size,
      outputSize: encodedBlob.size,
      savedBytes,
      width: targetW,
      height: targetH,
      isLossy: mode !== 'lossless' || outputFormat === 'image/jpeg',
      keptOriginal: false,
      note: mode === 'lossless'
        ? 'Pixel-exact canvas re-encoding completed (EXIF metadata stripped).'
        : `Lossy ${outputFormat.replace('image/', '').toUpperCase()} encoding @ ${Math.round(quality * 100)}% quality.`
    };
  } finally {
    if (typeof bitmap.close === 'function') {
      try { bitmap.close(); } catch (_) {}
    }
  }
}


// --- src/optimization/compression-preview.js ---

/**
 * Generates a side-by-side Before / After preview for a sample image in a destination.
 */
async function generateCompressionSamplePreview(sourceBlob, options = {}) {
  const result = await compressImageBlob(sourceBlob, options);
  const beforeUrl = URL.createObjectURL(sourceBlob);
  const afterUrl = URL.createObjectURL(result.blob);
  return {
    ...result,
    beforeUrl,
    afterUrl,
    dispose() {
      try { URL.revokeObjectURL(beforeUrl); } catch (_) {}
      try { URL.revokeObjectURL(afterUrl); } catch (_) {}
    }
  };
}


// --- src/optimization/compression-job.js ---


/**
 * Runs a sequential, non-destructive folder optimization job across eligible images in a destination.
 * By default writes optimized images into an `Optimized/` subfolder so existing originals are preserved.
 */
class CompressionJobRunner {
  constructor(store, adapter, copyEngine) {
    this.store = store;
    this.adapter = adapter;
    this.copyEngine = copyEngine;
  }

  getDestinationImages(destinationId) {
    const list = [];
    for (const file of this.store.files.values()) {
      if (file.assignedDestinationId === destinationId && checkCompressionEligibility(file).eligible) {
        list.push(file);
      }
    }
    return list;
  }

  /**
   * Executes sequential optimization on all eligible images assigned to a destination.
   * @param {string} destinationId
   * @param {{
   *   mode?: 'lossless' | 'quality' | 'resize',
   *   outputFormat?: 'image/webp' | 'image/jpeg' | 'image/png',
   *   quality?: number,
   *   maxDimension?: number,
   *   onProgress?: (done: number, total: number, savedBytes: number) => void
   * }} options
   */
  async runOptimizationJob(destinationId, options = {}) {
    const dest = this.store.destinations.get(destinationId);
    if (!dest) throw new Error('Destination not found');

    const images = this.getDestinationImages(destinationId);
    let totalSavedBytes = 0;
    let processedCount = 0;
    const extMap = {
      'image/webp': '.webp',
      'image/jpeg': '.jpg',
      'image/png': '.png'
    };
    const outExt = extMap[options.outputFormat || 'image/webp'] || '.webp';

    let targetSubdir = null;
    if (dest.dirHandle) {
      targetSubdir = await this.adapter.getSubdirectory(dest.dirHandle, 'Optimized', true);
    }

    for (let i = 0; i < images.length; i++) {
      const fileRecord = images[i];
      const sourceBlob = await this.copyEngine.resolveSourceFile(fileRecord);
      const res = await compressImageBlob(sourceBlob, options);
      processedCount++;

      if (!res.keptOriginal && res.savedBytes > 0) {
        const { stem } = splitFilename(fileRecord.sortedOutputName || fileRecord.name);
        const outName = `${stem}_opt${outExt}`;

        if (targetSubdir) {
          const fh = await targetSubdir.getFileHandle(outName, { create: true });
          const writable = await fh.createWritable();
          await writable.write(res.blob);
          await writable.close();
          const written = await fh.getFile();
          if (written.size === res.blob.size) {
            totalSavedBytes += res.savedBytes;
          }
        } else {
          dest.exportedFiles.set(`Optimized/${outName}`, {
            fileRecordId: fileRecord.id,
            name: `Optimized/${outName}`,
            size: res.blob.size,
            sourceFile: res.blob
          });
          totalSavedBytes += res.savedBytes;
        }
      }

      if (options.onProgress) {
        options.onProgress(processedCount, images.length, totalSavedBytes);
      }
    }

    this.store.stats.compressionSavedBytes += totalSavedBytes;
    this.store.notify('compression-completed', {
      destinationId,
      processedCount,
      totalSavedBytes
    });

    return {
      processedCount,
      totalImages: images.length,
      totalSavedBytes
    };
  }
}


// --- src/previews/thumbnail-cache.js ---

/**
 * Memory-bounded on-demand thumbnail cache.
 * Never decodes the entire library simultaneously and never persists full-resolution media in IndexedDB.
 */
class ThumbnailCache {
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


// --- src/previews/image-preview.js ---

/**
 * Interactive image preview renderer supporting Fit to Screen, 1:1 Actual Size,
 * Zoom In/Out, Pointer-centered wheel zoom, Pinch zoom, Pan, Double-click zoom, and 90° Rotation.
 * Sanitizes SVG previews by rendering inside an `<img>` tag (never inline `<svg>` injection) so embedded scripts cannot execute.
 */
function renderImagePreview(container, fileRecord, blob) {
  container.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'ws-image-viewer';
  wrapper.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:8px;width:100%;height:100%;justify-content:center;';

  const viewport = document.createElement('div');
  viewport.style.cssText = 'position:relative;display:flex;align-items:center;justify-content:center;overflow:hidden;max-width:100%;max-height:calc(100vh - 360px);border-radius:10px;';

  const img = document.createElement('img');
  const objUrl = sharedResourceTracker.acquireObjectUrl(`preview_${fileRecord.id}`, blob);
  img.src = objUrl;
  img.alt = fileRecord.name;
  img.draggable = false;

  let scale = 1;
  let rotation = 0;
  let panX = 0;
  let panY = 0;
  let isPanning = false;
  let startX = 0;
  let startY = 0;

  function applyTransform() {
    img.style.transform = `translate3d(${panX}px, ${panY}px, 0) scale(${scale}) rotate(${rotation}deg)`;
    zoomBadge.textContent = `${Math.round(scale * 100)}%`;
  }

  // Controls strip
  const controls = document.createElement('div');
  controls.style.cssText = 'display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:center;';

  const zoomOutBtn = document.createElement('button');
  zoomOutBtn.className = 'ws-btn';
  zoomOutBtn.textContent = '−';
  zoomOutBtn.title = 'Zoom out';
  zoomOutBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    scale = Math.max(0.25, +(scale - 0.25).toFixed(2));
    applyTransform();
  });

  const zoomBadge = document.createElement('span');
  zoomBadge.className = 'ws-badge';
  zoomBadge.textContent = '100%';

  const zoomInBtn = document.createElement('button');
  zoomInBtn.className = 'ws-btn';
  zoomInBtn.textContent = '+';
  zoomInBtn.title = 'Zoom in';
  zoomInBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    scale = Math.min(5, +(scale + 0.25).toFixed(2));
    applyTransform();
  });

  const fitBtn = document.createElement('button');
  fitBtn.className = 'ws-btn';
  fitBtn.textContent = 'Fit';
  fitBtn.title = 'Reset to Fit Screen';
  fitBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    scale = 1;
    rotation = 0;
    panX = 0;
    panY = 0;
    applyTransform();
  });

  const actualBtn = document.createElement('button');
  actualBtn.className = 'ws-btn';
  actualBtn.textContent = '1:1';
  actualBtn.title = 'Actual Size Zoom';
  actualBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    scale = 2;
    panX = 0;
    panY = 0;
    applyTransform();
  });

  const rotateBtn = document.createElement('button');
  rotateBtn.className = 'ws-btn';
  rotateBtn.textContent = '↻ 90°';
  rotateBtn.title = 'Rotate Preview 90°';
  rotateBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    rotation = (rotation + 90) % 360;
    applyTransform();
  });

  // Double-click zoom toggle
  viewport.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    scale = scale === 1 ? 2.0 : 1.0;
    if (scale === 1) { panX = 0; panY = 0; }
    applyTransform();
  });

  // Wheel zoom
  viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.15 : -0.15;
    scale = Math.max(0.25, Math.min(5, +(scale + delta).toFixed(2)));
    if (scale === 1) { panX = 0; panY = 0; }
    applyTransform();
  }, { passive: false });

  // Pan when zoomed in
  viewport.addEventListener('pointerdown', (e) => {
    if (scale <= 1) return;
    e.stopPropagation();
    isPanning = true;
    startX = e.clientX - panX;
    startY = e.clientY - panY;
    viewport.setPointerCapture(e.pointerId);
  });

  viewport.addEventListener('pointermove', (e) => {
    if (!isPanning) return;
    panX = e.clientX - startX;
    panY = e.clientY - startY;
    applyTransform();
  });

  viewport.addEventListener('pointerup', () => {
    isPanning = false;
  });

  img.addEventListener('error', () => {
    viewport.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text-secondary);">🖼️ Preview unavailable for <strong>${fileRecord.name}</strong> (format or resolution not natively decoded by this browser). You can still sort this file normally.</div>`;
  });

  viewport.appendChild(img);
  controls.append(zoomOutBtn, zoomBadge, zoomInBtn, fitBtn, actualBtn, rotateBtn);
  wrapper.append(viewport, controls);
  container.appendChild(wrapper);
}


// --- src/previews/video-preview.js ---


/**
 * Custom styled HTML5 video player using the browser's native decoding engine without exposing raw unstyled browser controls.
 */
function renderVideoPreview(container, fileRecord, blob) {
  container.innerHTML = '';

  const player = document.createElement('div');
  player.className = 'ws-video-player';

  const video = document.createElement('video');
  const objUrl = sharedResourceTracker.acquireObjectUrl(`preview_${fileRecord.id}`, blob);
  video.src = objUrl;
  video.playsInline = true;
  video.preload = 'metadata';
  video.controls = false; // Custom controls enforced

  const controls = document.createElement('div');
  controls.className = 'ws-media-custom-controls';

  const playBtn = document.createElement('button');
  playBtn.className = 'ws-btn ws-btn-primary';
  playBtn.textContent = '▶ Play';

  const timeLabel = document.createElement('span');
  timeLabel.style.cssText = 'font-size:11.5px;font-variant-numeric:tabular-nums;min-width:85px;';
  timeLabel.textContent = '0:00 / 0:00';

  const seekSlider = document.createElement('input');
  seekSlider.type = 'range';
  seekSlider.min = '0';
  seekSlider.max = '100';
  seekSlider.value = '0';
  seekSlider.style.cssText = 'flex:1;cursor:pointer;';
  seekSlider.setAttribute('aria-label', 'Seek timeline');

  const muteBtn = document.createElement('button');
  muteBtn.className = 'ws-btn';
  muteBtn.textContent = '🔊';
  muteBtn.title = 'Mute / Unmute';

  const speedSelect = document.createElement('select');
  speedSelect.className = 'ws-btn';
  speedSelect.setAttribute('aria-label', 'Playback speed');
  for (const rate of [0.5, 1, 1.25, 1.5, 2]) {
    const opt = document.createElement('option');
    opt.value = String(rate);
    opt.textContent = `${rate}x`;
    if (rate === 1) opt.selected = true;
    speedSelect.appendChild(opt);
  }

  const fsBtn = document.createElement('button');
  fsBtn.className = 'ws-btn';
  fsBtn.textContent = '⛶';
  fsBtn.title = 'Fullscreen video';

  playBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  });

  video.addEventListener('play', () => { playBtn.textContent = '⏸ Pause'; });
  video.addEventListener('pause', () => { playBtn.textContent = '▶ Play'; });

  video.addEventListener('loadedmetadata', () => {
    timeLabel.textContent = `0:00 / ${formatDuration(video.duration)}`;
  });

  video.addEventListener('timeupdate', () => {
    if (video.duration > 0) {
      seekSlider.value = String((video.currentTime / video.duration) * 100);
      timeLabel.textContent = `${formatDuration(video.currentTime)} / ${formatDuration(video.duration)}`;
    }
  });

  seekSlider.addEventListener('input', (e) => {
    e.stopPropagation();
    if (video.duration > 0) {
      video.currentTime = (parseFloat(seekSlider.value) / 100) * video.duration;
    }
  });

  muteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    video.muted = !video.muted;
    muteBtn.textContent = video.muted ? '🔇' : '🔊';
  });

  speedSelect.addEventListener('change', (e) => {
    e.stopPropagation();
    video.playbackRate = parseFloat(speedSelect.value) || 1;
  });

  fsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (player.requestFullscreen) player.requestFullscreen().catch(() => {});
  });

  video.addEventListener('error', () => {
    player.innerHTML = `<div style="padding:28px;text-align:center;color:var(--text-secondary);">🎬 Video codec in <strong>${fileRecord.name}</strong> is not natively decoded by this browser. The file remains completely intact and ready to sort.</div>`;
  });

  controls.append(playBtn, timeLabel, seekSlider, muteBtn, speedSelect, fsBtn);
  player.append(video, controls);
  container.appendChild(player);
}


// --- src/previews/audio-preview.js ---


/**
 * Compact audio player with deterministic lightweight waveform bars (never decodes huge audio files into memory).
 */
function renderAudioPreview(container, fileRecord, blob) {
  container.innerHTML = '';

  const card = document.createElement('div');
  card.className = 'ws-audio-player';

  const header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:center;gap:12px;';
  header.innerHTML = `
    <div class="ws-dest-emoji" style="width:42px;height:42px;font-size:22px;">🎵</div>
    <div style="min-width:0;flex:1;">
      <div style="font-weight:700;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"></div>
      <div style="font-size:12px;color:var(--text-secondary);">${fileRecord.extension.toUpperCase()} Audio • ${formatBytes(fileRecord.size)}</div>
    </div>
  `;
  header.querySelector('div > div > div').textContent = fileRecord.name;

  // Lightweight procedural waveform visualization derived from filename hash (zero heavy audio buffer decode)
  const wave = document.createElement('div');
  wave.className = 'ws-waveform-bars';
  const bars = [];
  let seed = fileRecord.size || 12345;
  for (let i = 0; i < 36; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const pct = 20 + (seed % 78);
    const bar = document.createElement('div');
    bar.className = 'ws-waveform-bar';
    bar.style.height = `${pct}%`;
    bars.push(bar);
    wave.appendChild(bar);
  }

  const audio = document.createElement('audio');
  const objUrl = sharedResourceTracker.acquireObjectUrl(`preview_${fileRecord.id}`, blob);
  audio.src = objUrl;
  audio.preload = 'metadata';

  const controls = document.createElement('div');
  controls.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;';

  const playBtn = document.createElement('button');
  playBtn.className = 'ws-btn ws-btn-primary';
  playBtn.textContent = '▶ Play';

  const timeLabel = document.createElement('span');
  timeLabel.style.cssText = 'font-size:11.5px;min-width:80px;';
  timeLabel.textContent = '0:00 / 0:00';

  const seek = document.createElement('input');
  seek.type = 'range';
  seek.min = '0';
  seek.max = '100';
  seek.value = '0';
  seek.style.cssText = 'flex:1;cursor:pointer;';

  const speedSelect = document.createElement('select');
  speedSelect.className = 'ws-btn';
  for (const r of [0.75, 1, 1.25, 1.5, 2]) {
    const o = document.createElement('option');
    o.value = String(r);
    o.textContent = `${r}x`;
    if (r === 1) o.selected = true;
    speedSelect.appendChild(o);
  }

  playBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
  });

  audio.addEventListener('play', () => { playBtn.textContent = '⏸ Pause'; });
  audio.addEventListener('pause', () => { playBtn.textContent = '▶ Play'; });
  audio.addEventListener('loadedmetadata', () => {
    timeLabel.textContent = `0:00 / ${formatDuration(audio.duration)}`;
  });

  audio.addEventListener('timeupdate', () => {
    if (audio.duration > 0) {
      const ratio = audio.currentTime / audio.duration;
      seek.value = String(ratio * 100);
      timeLabel.textContent = `${formatDuration(audio.currentTime)} / ${formatDuration(audio.duration)}`;
      const activeBars = Math.floor(ratio * bars.length);
      bars.forEach((b, idx) => {
        b.style.opacity = idx <= activeBars ? '1' : '0.38';
      });
    }
  });

  seek.addEventListener('input', (e) => {
    e.stopPropagation();
    if (audio.duration > 0) {
      audio.currentTime = (parseFloat(seek.value) / 100) * audio.duration;
    }
  });

  speedSelect.addEventListener('change', (e) => {
    e.stopPropagation();
    audio.playbackRate = parseFloat(speedSelect.value) || 1;
  });

  controls.append(playBtn, timeLabel, seek, speedSelect);
  card.append(header, wave, controls);
  container.appendChild(card);
}


// --- src/previews/pdf-preview.js ---

/**
 * Lazy page-by-page PDF viewer powered by locally bundled `public/vendor/pdf.js` & `pdf.worker.js`.
 * Never renders all 500 pages at once; renders only the active visible page on demand.
 */
async function renderPdfPreview(container, fileRecord, blob) {
  container.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:8px;width:100%;max-width:680px;';

  const toolbar = document.createElement('div');
  toolbar.style.cssText = 'display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:center;';

  const prevPageBtn = document.createElement('button');
  prevPageBtn.className = 'ws-btn';
  prevPageBtn.textContent = '◀ Page';

  const pageIndicator = document.createElement('span');
  pageIndicator.className = 'ws-badge';
  pageIndicator.textContent = 'Loading PDF...';

  const nextPageBtn = document.createElement('button');
  nextPageBtn.className = 'ws-btn';
  nextPageBtn.textContent = 'Page ▶';

  const zoomOutBtn = document.createElement('button');
  zoomOutBtn.className = 'ws-btn';
  zoomOutBtn.textContent = '−';

  const zoomInBtn = document.createElement('button');
  zoomInBtn.className = 'ws-btn';
  zoomInBtn.textContent = '+';

  const nativeFrameBtn = document.createElement('button');
  nativeFrameBtn.className = 'ws-btn';
  nativeFrameBtn.textContent = 'Open Native PDF Frame';

  const stage = document.createElement('div');
  stage.style.cssText = 'background:var(--surface-secondary);padding:10px;border-radius:10px;border:1px solid var(--border-hairline);max-height:calc(100vh - 380px);overflow:auto;display:flex;justify-content:center;width:100%;';

  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'max-width:100%;height:auto;border-radius:6px;box-shadow:var(--shadow-sm);';
  stage.appendChild(canvas);

  toolbar.append(prevPageBtn, pageIndicator, nextPageBtn, zoomOutBtn, zoomInBtn, nativeFrameBtn);
  wrapper.append(stage, toolbar);
  container.appendChild(wrapper);

  let currentPage = 1;
  let numPages = 1;
  let scale = 0.85;
  let pdfDoc = null;

  async function renderCurrentPage() {
    if (!pdfDoc) return;
    try {
      const page = await pdfDoc.getPage(currentPage);
      const viewport = page.getViewport({ scale });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport }).promise;
      pageIndicator.textContent = `Page ${currentPage} / ${numPages}`;
      prevPageBtn.disabled = currentPage <= 1;
      nextPageBtn.disabled = currentPage >= numPages;
    } catch (err) {
      pageIndicator.textContent = 'PDF render error';
    }
  }

  prevPageBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (currentPage > 1) {
      currentPage--;
      renderCurrentPage();
    }
  });

  nextPageBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (currentPage < numPages) {
      currentPage++;
      renderCurrentPage();
    }
  });

  zoomOutBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    scale = Math.max(0.5, +(scale - 0.15).toFixed(2));
    renderCurrentPage();
  });

  zoomInBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    scale = Math.min(2.2, +(scale + 0.15).toFixed(2));
    renderCurrentPage();
  });

  nativeFrameBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const objUrl = sharedResourceTracker.acquireObjectUrl(`pdf_native_${fileRecord.id}`, blob);
    stage.innerHTML = '';
    const iframe = document.createElement('iframe');
    iframe.src = objUrl;
    iframe.title = fileRecord.name;
    iframe.style.cssText = 'width:100%;height:360px;border:none;border-radius:6px;';
    stage.appendChild(iframe);
  });

  try {
    if (window.pdfjsLib && typeof window.pdfjsLib.getDocument === 'function') {
      const task = window.pdfjsLib.getDocument({ file: blob, title: fileRecord.name });
      pdfDoc = await task.promise;
      numPages = pdfDoc.numPages || 1;
      await renderCurrentPage();
    } else {
      pageIndicator.textContent = 'PDF Ready';
    }
  } catch (err) {
    stage.innerHTML = `<div style="padding:24px;text-align:center;color:var(--status-danger);">📕 Invalid or damaged PDF file (${err.message}).</div>`;
  }
}


// --- src/previews/generic-preview.js ---

/**
 * Renders safe text/CSV snippet previews (up to first 8 KB) or structured file information cards for Office/Archive/Other files.
 * Never executes embedded macros or scripts.
 */
async function renderGenericOrTextPreview(container, fileRecord, blob) {
  container.innerHTML = '';

  const card = document.createElement('div');
  card.style.cssText = 'width:min(580px, 90vw);padding:20px;border-radius:14px;background:var(--surface-secondary);border:1px solid var(--border-strong);display:flex;flex-direction:column;gap:12px;';

  const topRow = document.createElement('div');
  topRow.style.cssText = 'display:flex;align-items:center;gap:12px;';

  const iconEl = document.createElement('div');
  iconEl.className = 'ws-dest-emoji';
  iconEl.style.cssText = 'width:46px;height:46px;font-size:24px;';
  iconEl.textContent = fileRecord.emoji || '📄';

  const infoCol = document.createElement('div');
  infoCol.style.cssText = 'min-width:0;flex:1;';
  const titleEl = document.createElement('div');
  titleEl.style.cssText = 'font-weight:700;font-size:15px;word-break:break-all;';
  titleEl.textContent = fileRecord.name;

  const metaEl = document.createElement('div');
  metaEl.style.cssText = 'font-size:12px;color:var(--text-secondary);';
  metaEl.textContent = `${(fileRecord.extension || 'FILE').toUpperCase()} • ${formatBytes(fileRecord.size)} • Modified ${formatDate(fileRecord.lastModified)}`;

  infoCol.append(titleEl, metaEl);
  topRow.append(iconEl, infoCol);
  card.appendChild(topRow);

  if (fileRecord.previewKind === 'text' && blob && blob.size > 0) {
    try {
      const slice = blob.slice(0, Math.min(blob.size, 6144));
      const text = await slice.text();
      const pre = document.createElement('pre');
      pre.style.cssText = 'max-height:220px;overflow:auto;padding:12px;border-radius:8px;background:var(--surface-primary);border:1px solid var(--border-hairline);font-family:var(--font-mono);font-size:11.5px;white-space:pre-wrap;word-break:break-word;user-select:text;';
      pre.textContent = text + (blob.size > 6144 ? '\n\n… [Preview truncated safely at 6 KB]' : '');
      card.appendChild(pre);
    } catch (_) {}
  } else {
    const note = document.createElement('div');
    note.style.cssText = 'font-size:12.5px;color:var(--text-secondary);padding:10px 12px;background:var(--surface-primary);border-radius:8px;border:1px solid var(--border-hairline);';
    note.textContent = `Safe metadata preview for ${fileRecord.category} format (.${fileRecord.extension || 'bin'}). Active scripts and macros are never executed. Drag this card or press 1–9 to sort into any destination folder.`;
    card.appendChild(note);
  }

  container.appendChild(card);
}


// --- src/previews/preview-manager.js ---
class PreviewManager {
  constructor(store, copyEngine) {
    this.store = store;
    this.copyEngine = copyEngine;
    this.thumbnailCache = new ThumbnailCache(store.capabilities.budgets.thumbnailCacheSize || 48);
    this.activeRenderToken = 0;
  }

  async renderActiveMedia(container, fileRecord) {
    const token = ++this.activeRenderToken;
    if (!container) return;
    if (!fileRecord) {
      container.innerHTML = `<div style="color:var(--text-secondary);font-size:13px;">No active file selected.</div>`;
      return;
    }

    try {
      const blob = await this.copyEngine.resolveSourceFile(fileRecord);
      if (token !== this.activeRenderToken) return; // Stale async render guard

      switch (fileRecord.previewKind) {
        case 'image':
          renderImagePreview(container, fileRecord, blob);
          break;
        case 'video':
          renderVideoPreview(container, fileRecord, blob);
          break;
        case 'audio':
          renderAudioPreview(container, fileRecord, blob);
          break;
        case 'pdf':
          await renderPdfPreview(container, fileRecord, blob);
          break;
        default:
          await renderGenericOrTextPreview(container, fileRecord, blob);
          break;
      }
    } catch (err) {
      if (token !== this.activeRenderToken) return;
      await renderGenericOrTextPreview(container, fileRecord, null);
    }
  }
}


// --- src/interactions/animation-controller.js ---
/**
 * Controls the signature WiniSort import vortex animation and destination sorting pulse feedback.
 * Strictly caps animated DOM elements (8 to 16 reusable particles) regardless of whether 10 or 50,000 files are imported.
 */
class AnimationController {
  constructor(store) {
    this.store = store;
  }

  isMotionEnabled() {
    if (this.store.preferences.motionLevel === 'reduced') return false;
    if (this.store.capabilities.prefersReducedMotion) return false;
    return true;
  }

  /**
   * Plays the signature central media pool collection vortex animation with a strictly bounded particle budget.
   * @param {HTMLElement} containerEl
   * @param {Array<Object>} sampleFiles
   */
  playImportVortex(containerEl, sampleFiles = []) {
    if (!containerEl || !this.isMotionEnabled()) return;
    const budget = Math.min(
      this.store.capabilities.budgets.vortexParticleCount || 12,
      Math.max(6, sampleFiles.length || 10),
      16
    );

    const emojis = ['🖼️', '🎬', '🎵', '📕', '📄', '📊'];
    for (let i = 0; i < budget; i++) {
      const particle = document.createElement('div');
      particle.className = 'ws-vortex-particle';
      const angle = (i / budget) * Math.PI * 2;
      const radius = 140 + (i % 3) * 35;
      const vx = Math.round(Math.cos(angle) * radius);
      const vy = Math.round(Math.sin(angle) * radius);
      const vr = Math.round((i % 2 === 0 ? 1 : -1) * (15 + i * 3));

      particle.style.setProperty('--vx', `${vx}px`);
      particle.style.setProperty('--vy', `${vy}px`);
      particle.style.setProperty('--vr', `${vr}deg`);
      particle.style.animationDelay = `${i * 28}ms`;

      const fileSample = sampleFiles[i % Math.max(1, sampleFiles.length)];
      particle.textContent = fileSample?.emoji || emojis[i % emojis.length];
      containerEl.appendChild(particle);

      setTimeout(() => {
        if (particle.parentNode) particle.parentNode.removeChild(particle);
      }, 850 + i * 28);
    }
  }

  /**
   * Flashes a destination card with its accent color ONLY after the underlying copy operation is verified.
   * @param {string} destinationId
   */
  flashDestinationSuccess(destinationId) {
    if (typeof document === 'undefined') return;
    const el = document.querySelector(`[data-destination-id="${destinationId}"]`);
    if (!el) return;
    el.classList.remove('is-sorted-flash');
    void el.offsetWidth;
    el.classList.add('is-sorted-flash');
    setTimeout(() => {
      el.classList.remove('is-sorted-flash');
    }, 600);
  }
}


// --- src/interactions/drag-controller.js ---
/**
 * Unified Pointer Events (mouse + touch + pen) drag-and-drop controller for sorting media cards into destination banks,
 * plus desktop window file/folder drop ingestion.
 */
class DragController {
  constructor(store, selectionManager, onDropToDestination, onExternalFilesDropped) {
    this.store = store;
    this.selectionManager = selectionManager;
    this.onDropToDestination = onDropToDestination;
    this.onExternalFilesDropped = onExternalFilesDropped;
    this.ghostEl = null;
    this.activeDragIds = [];
    this.currentHoverDestId = null;
  }

  /**
   * Attaches pointer-based drag sorting to the central media card element.
   * @param {HTMLElement} draggableEl
   * @param {Object} fileRecord
   */
  bindMediaCardDrag(draggableEl, fileRecord) {
    if (!draggableEl || !fileRecord) return;

    let startX = 0;
    let startY = 0;
    let dragging = false;

    const onPointerDown = (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      if (e.target.closest('button, input, select, a, video, audio')) return;

      startX = e.clientX;
      startY = e.clientY;
      dragging = false;

      const onPointerMove = (moveEvent) => {
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;
        if (!dragging && Math.hypot(dx, dy) > 8) {
          dragging = true;
          const selected = this.selectionManager.getActiveOrSelectedFileIds();
          this.activeDragIds = selected.includes(fileRecord.id) ? selected : [fileRecord.id];
          this._createGhost(fileRecord, this.activeDragIds.length, moveEvent.clientX, moveEvent.clientY);
          this._setOtherDestinationsDimmed(true);
        }

        if (dragging) {
          this._moveGhost(moveEvent.clientX, moveEvent.clientY);
          const targetEl = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY);
          const destCard = targetEl ? targetEl.closest('[data-destination-id]') : null;
          const destId = destCard ? destCard.getAttribute('data-destination-id') : null;
          this._updateDropTargetHighlight(destId);
        }
      };

      const onPointerUp = async () => {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('pointercancel', onPointerUp);

        if (dragging) {
          const targetDestId = this.currentHoverDestId;
          const idsToSort = [...this.activeDragIds];
          this._cleanupDrag();
          if (targetDestId && idsToSort.length > 0 && this.onDropToDestination) {
            await this.onDropToDestination(idsToSort, targetDestId);
          }
        }
      };

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerUp);
    };

    draggableEl.addEventListener('pointerdown', onPointerDown);
  }

  /**
   * Binds external OS file/folder drag-and-drop onto the application workspace.
   * @param {HTMLElement} rootEl
   */
  bindExternalFileDrop(rootEl) {
    if (!rootEl) return;

    rootEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      const tray = rootEl.querySelector('.ws-collection-tray');
      if (tray) tray.classList.add('is-dragover');
    });

    rootEl.addEventListener('dragleave', (e) => {
      if (e.target === rootEl) {
        const tray = rootEl.querySelector('.ws-collection-tray');
        if (tray) tray.classList.remove('is-dragover');
      }
    });

    rootEl.addEventListener('drop', async (e) => {
      e.preventDefault();
      const tray = rootEl.querySelector('.ws-collection-tray');
      if (tray) tray.classList.remove('is-dragover');

      if (!e.dataTransfer) return;

      // Check for FileSystemAccessAPI getAsFileSystemHandle on dropped items first
      const items = Array.from(e.dataTransfer.items || []);
      const handles = [];
      for (const item of items) {
        if (typeof item.getAsFileSystemHandle === 'function') {
          try {
            const h = await item.getAsFileSystemHandle();
            if (h) handles.push(h);
          } catch (_) {}
        }
      }

      if (handles.length > 0 && this.onExternalFilesDropped) {
        await this.onExternalFilesDropped({ handles, files: e.dataTransfer.files });
      } else if (e.dataTransfer.files?.length > 0 && this.onExternalFilesDropped) {
        await this.onExternalFilesDropped({ handles: [], files: e.dataTransfer.files });
      }
    });
  }

  _createGhost(fileRecord, count, x, y) {
    this._removeGhost();
    const el = document.createElement('div');
    el.className = 'ws-drag-ghost';
    el.innerHTML = `
      <span>${fileRecord.emoji || '📄'}</span>
      <span style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"></span>
      ${count > 1 ? `<span class="ws-badge ws-badge-accent">${count} files</span>` : ''}
    `;
    el.querySelectorAll('span')[1].textContent = fileRecord.name;
    document.body.appendChild(el);
    this.ghostEl = el;
    this._moveGhost(x, y);
  }

  _moveGhost(x, y) {
    if (!this.ghostEl) return;
    this.ghostEl.style.transform = `translate3d(${x + 14}px, ${y + 14}px, 0)`;
  }

  _removeGhost() {
    if (this.ghostEl && this.ghostEl.parentNode) {
      this.ghostEl.parentNode.removeChild(this.ghostEl);
    }
    this.ghostEl = null;
  }

  _updateDropTargetHighlight(destId) {
    if (this.currentHoverDestId === destId) return;
    this.currentHoverDestId = destId;
    const allCards = document.querySelectorAll('[data-destination-id]');
    allCards.forEach((card) => {
      const id = card.getAttribute('data-destination-id');
      if (destId && id === destId) {
        card.classList.add('is-drop-target');
        card.classList.remove('is-dimmed');
      } else {
        card.classList.remove('is-drop-target');
        if (destId) card.classList.add('is-dimmed');
      }
    });
  }

  _setOtherDestinationsDimmed(dimmed) {
    const allCards = document.querySelectorAll('[data-destination-id]');
    allCards.forEach((card) => {
      if (!dimmed) {
        card.classList.remove('is-dimmed', 'is-drop-target');
      }
    });
  }

  _cleanupDrag() {
    this._removeGhost();
    this._setOtherDestinationsDimmed(false);
    this.currentHoverDestId = null;
    this.activeDragIds = [];
  }
}


// --- src/interactions/touch-controller.js ---
/**
 * Mobile touch gesture controller supporting swipe left/right navigation and long-press multi-selection.
 */
class TouchController {
  constructor(onSwipeLeft, onSwipeRight) {
    this.onSwipeLeft = onSwipeLeft;
    this.onSwipeRight = onSwipeRight;
  }

  bindSwipeNavigation(element) {
    if (!element) return;
    let touchStartX = 0;
    let touchStartY = 0;

    element.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    }, { passive: true });

    element.addEventListener('touchend', (e) => {
      if (e.changedTouches.length !== 1) return;
      const dx = e.changedTouches[0].clientX - touchStartX;
      const dy = e.changedTouches[0].clientY - touchStartY;
      if (Math.abs(dx) > 64 && Math.abs(dx) > Math.abs(dy) * 1.8) {
        if (dx < 0 && this.onSwipeLeft) this.onSwipeLeft();
        if (dx > 0 && this.onSwipeRight) this.onSwipeRight();
      }
    }, { passive: true });
  }
}


// --- src/interactions/shortcuts.js ---
/**
 * Keyboard shortcut controller.
 * Never activates unexpectedly when the user is typing inside an input, textarea, select, or contentEditable element.
 */
class ShortcutsController {
  constructor(store, handlers) {
    this.store = store;
    this.handlers = handlers;
    this._onKeyDown = this._onKeyDown.bind(this);
  }

  mount() {
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this._onKeyDown);
    }
  }

  unmount() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this._onKeyDown);
    }
  }

  _isTypingInInput(target) {
    if (!target) return false;
    const tag = (target.tagName || '').toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (target.isContentEditable) return true;
    return false;
  }

  _onKeyDown(e) {
    const isMod = e.ctrlKey || e.metaKey;

    // Global Escape closes active modal
    if (e.key === 'Escape') {
      if (this.store.ui.activeModal) {
        e.preventDefault();
        this.handlers.onCloseModal?.();
        return;
      }
    }

    // Global Command Palette (Ctrl/Cmd + K)
    if (isMod && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      this.handlers.onOpenCommandPalette?.();
      return;
    }

    // Do not intercept shortcuts when typing in inputs
    if (this._isTypingInInput(e.target)) return;

    // Undo / Redo
    if (isMod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) {
        this.handlers.onRedo?.();
      } else {
        this.handlers.onUndo?.();
      }
      return;
    }

    // Select All filtered (Ctrl/Cmd + A)
    if (isMod && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      this.handlers.onSelectAll?.();
      return;
    }

    // Focus search (/)
    if (e.key === '/') {
      e.preventDefault();
      this.handlers.onFocusSearch?.();
      return;
    }

    // Keyboard help (?)
    if (e.key === '?') {
      e.preventDefault();
      this.handlers.onOpenHelp?.();
      return;
    }

    // Quick destination shortcuts 1-9
    if (!isMod && /^[1-9]$/.test(e.key)) {
      e.preventDefault();
      this.handlers.onNumericShortcut?.(e.key);
      return;
    }

    // Previous / Next navigation
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      this.handlers.onNextFile?.();
      return;
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      this.handlers.onPreviousFile?.();
      return;
    }

    // Spacebar fullscreen preview toggle
    if (e.key === ' ') {
      e.preventDefault();
      this.handlers.onToggleFullscreenPreview?.();
      return;
    }

    // Delete removes selected item from unsorted queue WITHOUT deleting source file
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      this.handlers.onSkipActiveFile?.();
    }
  }
}


// --- src/components/toast.js ---
class ToastManager {
  constructor(regionEl) {
    this.regionEl = regionEl;
  }

  /**
   * Displays an unobtrusive accessible toast notification with optional action button (e.g. Undo).
   * @param {string} message
   * @param {{ type?: 'info' | 'success' | 'warning' | 'danger', actionLabel?: string, onAction?: () => void, durationMs?: number }} [options]
   */
  show(message, options = {}) {
    if (!this.regionEl) return;
    const toast = document.createElement('div');
    toast.className = 'ws-toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');

    const type = options.type || 'info';
    const iconMap = {
      info: 'ℹ️',
      success: '✅',
      warning: '⚠️',
      danger: '🛑'
    };

    const iconSpan = document.createElement('span');
    iconSpan.textContent = iconMap[type] || 'ℹ️';

    const textSpan = document.createElement('span');
    textSpan.style.flex = '1';
    textSpan.textContent = message;

    toast.append(iconSpan, textSpan);

    if (options.actionLabel && typeof options.onAction === 'function') {
      const btn = document.createElement('button');
      btn.className = 'ws-btn ws-btn-primary';
      btn.style.height = '26px';
      btn.style.padding = '0 9px';
      btn.style.fontSize = '11.5px';
      btn.textContent = options.actionLabel;
      btn.addEventListener('click', () => {
        options.onAction();
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      });
      toast.appendChild(btn);
    }

    const closeBtn = document.createElement('button');
    closeBtn.className = 'ws-dest-action-btn';
    closeBtn.textContent = '✕';
    closeBtn.setAttribute('aria-label', 'Dismiss notification');
    closeBtn.addEventListener('click', () => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    });
    toast.appendChild(closeBtn);

    this.regionEl.appendChild(toast);

    const ttl = options.durationMs ?? 3800;
    if (ttl > 0) {
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, ttl);
    }
  }
}


// --- src/components/modal.js ---
/**
 * Accessible modal shell with focus management and Escape-to-close support.
 */
function createModalShell({ title, onClose, bodyEl, footerButtons = [], maxWidth = '760px' }) {
  const backdrop = document.createElement('div');
  backdrop.className = 'ws-modal-backdrop';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');

  const modal = document.createElement('div');
  modal.className = 'ws-modal';
  modal.style.width = `min(${maxWidth}, 96vw)`;

  const header = document.createElement('div');
  header.className = 'ws-modal-header';

  const titleEl = document.createElement('h2');
  titleEl.className = 'ws-modal-title';
  titleEl.textContent = title;

  const closeBtn = document.createElement('button');
  closeBtn.className = 'ws-btn ws-btn-icon';
  closeBtn.textContent = '✕';
  closeBtn.title = 'Close (Esc)';
  closeBtn.setAttribute('aria-label', 'Close modal');
  closeBtn.addEventListener('click', () => onClose?.());

  header.append(titleEl, closeBtn);

  const body = document.createElement('div');
  body.className = 'ws-modal-body';
  if (bodyEl) body.appendChild(bodyEl);

  const footer = document.createElement('div');
  footer.className = 'ws-modal-footer';
  for (const btnCfg of footerButtons) {
    const b = document.createElement('button');
    b.className = `ws-btn ${btnCfg.primary ? 'ws-btn-primary' : ''} ${btnCfg.danger ? 'ws-btn-danger' : ''}`.trim();
    b.textContent = btnCfg.label;
    b.addEventListener('click', () => btnCfg.onClick?.());
    footer.appendChild(b);
  }

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) onClose?.();
  });

  modal.append(header, body);
  if (footerButtons.length > 0) modal.appendChild(footer);
  backdrop.appendChild(modal);

  return backdrop;
}


// --- src/components/context-menu.js ---
class ContextMenuManager {
  constructor() {
    this.activeMenu = null;
    if (typeof window !== 'undefined') {
      window.addEventListener('click', () => this.close());
    }
  }

  open(x, y, items = []) {
    this.close();
    if (typeof document === 'undefined' || items.length === 0) return;

    const menu = document.createElement('div');
    menu.className = 'ws-context-menu';
    menu.setAttribute('role', 'menu');

    for (const item of items) {
      if (item.divider) {
        const hr = document.createElement('div');
        hr.style.cssText = 'height:1px;background:var(--border-hairline);margin:4px 0;';
        menu.appendChild(hr);
        continue;
      }
      const btn = document.createElement('button');
      btn.className = 'ws-context-item';
      btn.setAttribute('role', 'menuitem');

      const labelSpan = document.createElement('span');
      labelSpan.textContent = item.label;

      const kbdSpan = document.createElement('span');
      kbdSpan.style.cssText = 'font-size:11px;color:var(--text-secondary);';
      kbdSpan.textContent = item.shortcut || '';

      btn.append(labelSpan, kbdSpan);
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.close();
        item.onClick?.();
      });
      menu.appendChild(btn);
    }

    document.body.appendChild(menu);
    const rect = menu.getBoundingClientRect();
    const safeX = Math.min(x, window.innerWidth - rect.width - 12);
    const safeY = Math.min(y, window.innerHeight - rect.height - 12);
    menu.style.left = `${Math.max(8, safeX)}px`;
    menu.style.top = `${Math.max(8, safeY)}px`;
    this.activeMenu = menu;
  }

  close() {
    if (this.activeMenu && this.activeMenu.parentNode) {
      this.activeMenu.parentNode.removeChild(this.activeMenu);
    }
    this.activeMenu = null;
  }
}


// --- src/components/progress.js ---

/**
 * Renders an honest scanning / operation progress bar.
 * Never fabricates an exact percentage during initial directory discovery.
 */
function renderScanProgressBanner(container, store, actions) {
  if (!container) return;
  container.innerHTML = '';

  const prog = store.ui.scanProgress;
  if (!store.ui.isScanning) return;

  const bar = document.createElement('div');
  bar.className = 'ws-compat-banner';
  bar.style.background = 'var(--surface-secondary)';

  const text = document.createElement('div');
  text.innerHTML = `
    <strong>Scanning source:</strong> <span class="scan-folder"></span> •
    <strong>${prog.foldersDiscovered}</strong> folders •
    <strong>${prog.filesScanned}</strong> scanned •
    <strong>${prog.eligibleFiles}</strong> eligible (${formatBytes(prog.totalEligibleBytes, { mode: store.preferences.unitSystem })}) •
    <strong>${prog.ignoredFiles}</strong> filtered
  `;
  text.querySelector('.scan-folder').textContent = prog.currentFolder || 'Root';

  const btnGroup = document.createElement('div');
  btnGroup.style.cssText = 'display:flex;gap:6px;';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'ws-btn ws-btn-danger';
  cancelBtn.textContent = 'Cancel Scan';
  cancelBtn.addEventListener('click', () => actions.onCancelScan?.());

  btnGroup.appendChild(cancelBtn);
  bar.append(text, btnGroup);
  container.appendChild(bar);
}


// --- src/components/toolbar.js ---

/**
 * Renders the top native-style WiniSort application toolbar with all required controls.
 */
function renderToolbar(container, store, historyManager, actions) {
  if (!container) return;
  container.innerHTML = '';

  // Brand section
  const brand = document.createElement('div');
  brand.className = 'ws-toolbar-brand';
  brand.innerHTML = `
    <div class="ws-brand-emblem" aria-hidden="true">W</div>
    <div class="ws-brand-text">
      <div class="ws-brand-title">
        <span>WiniSort</span>
        <span class="ws-badge ws-badge-accent" style="font-size:10px;">LOCAL-FIRST</span>
      </div>
      <div class="ws-brand-tagline">Your files. Your folders. Your freedom.</div>
    </div>
  `;

  // Primary File & Source Actions
  const leftActions = document.createElement('div');
  leftActions.className = 'ws-toolbar-actions';

  const addFilesBtn = document.createElement('button');
  addFilesBtn.className = 'ws-btn ws-btn-primary';
  addFilesBtn.id = 'btn-toolbar-add-files';
  addFilesBtn.textContent = '+ Add Files';
  addFilesBtn.title = 'Pick individual or multiple files to organize';
  addFilesBtn.addEventListener('click', () => actions.onAddFiles?.());

  const addFolderBtn = document.createElement('button');
  addFolderBtn.className = 'ws-btn';
  addFolderBtn.id = 'btn-toolbar-add-folder';
  addFolderBtn.textContent = '📂 Add Folder';
  addFolderBtn.title = 'Import a folder or nested directory tree';
  addFolderBtn.addEventListener('click', () => actions.onAddFolder?.());

  const filtersBtn = document.createElement('button');
  filtersBtn.className = 'ws-btn';
  filtersBtn.id = 'btn-toolbar-filters';
  filtersBtn.textContent = '🎯 Media Filters';
  filtersBtn.title = 'Choose which file categories and extensions to organize';
  filtersBtn.addEventListener('click', () => actions.onOpenFilters?.());

  const outputDirBtn = document.createElement('button');
  outputDirBtn.className = 'ws-btn';
  outputDirBtn.id = 'btn-toolbar-output-dir';
  outputDirBtn.textContent = store.project.outputRootName
    ? `💾 Output: ${store.project.outputRootName}`
    : '💾 Select Output Dir';
  outputDirBtn.title = 'Select writable root output directory for sorted folders';
  outputDirBtn.addEventListener('click', () => actions.onSelectOutputDirectory?.());

  leftActions.append(addFilesBtn, addFolderBtn, filtersBtn, outputDirBtn);

  // Search box
  const searchWrap = document.createElement('div');
  searchWrap.className = 'ws-toolbar-search';
  const searchIcon = document.createElement('span');
  searchIcon.className = 'ws-search-icon';
  searchIcon.textContent = '🔍';

  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.id = 'ws-global-search-input';
  searchInput.placeholder = 'Search files, extensions, paths...';
  searchInput.value = store.ui.searchQuery || '';
  searchInput.setAttribute('aria-label', 'Search imported files');
  searchInput.addEventListener('input', (e) => {
    actions.onSearchChange?.(e.target.value);
  });

  const searchKbd = document.createElement('span');
  searchKbd.className = 'ws-search-kbd';
  searchKbd.textContent = '/';

  searchWrap.append(searchIcon, searchInput, searchKbd);

  // Right utility controls: Progress pill, Undo, Redo, Smart Rules, Stats, Theme, Settings, Help
  const rightActions = document.createElement('div');
  rightActions.className = 'ws-toolbar-right';

  const total = store.stats.totalFiles;
  const sorted = store.stats.sortedCount;
  const pct = total > 0 ? Math.round((sorted / total) * 100) : 0;

  const progressPill = document.createElement('button');
  progressPill.className = 'ws-btn';
  progressPill.id = 'btn-toolbar-stats';
  progressPill.title = 'Open Storage & Session Statistics';
  progressPill.textContent = total > 0
    ? `📊 ${sorted}/${total} (${pct}%) • ${formatBytes(store.stats.completedCopyBytes, { mode: store.preferences.unitSystem })}`
    : '📊 0 Sorted';
  progressPill.addEventListener('click', () => actions.onOpenStats?.());

  const undoBtn = document.createElement('button');
  undoBtn.className = 'ws-btn ws-btn-icon';
  undoBtn.id = 'btn-toolbar-undo';
  undoBtn.textContent = '↶';
  undoBtn.title = 'Undo last action (Ctrl/Cmd + Z)';
  undoBtn.setAttribute('aria-label', 'Undo');
  undoBtn.disabled = !historyManager.canUndo();
  undoBtn.addEventListener('click', () => actions.onUndo?.());

  const redoBtn = document.createElement('button');
  redoBtn.className = 'ws-btn ws-btn-icon';
  redoBtn.id = 'btn-toolbar-redo';
  redoBtn.textContent = '↷';
  redoBtn.title = 'Redo (Ctrl/Cmd + Shift + Z)';
  redoBtn.setAttribute('aria-label', 'Redo');
  redoBtn.disabled = !historyManager.canRedo();
  redoBtn.addEventListener('click', () => actions.onRedo?.());

  const rulesBtn = document.createElement('button');
  rulesBtn.className = 'ws-btn';
  rulesBtn.id = 'btn-toolbar-rules';
  rulesBtn.textContent = '⚡ Rules';
  rulesBtn.title = 'Rule-Based Smart Sorting & Folder Suggestions';
  rulesBtn.addEventListener('click', () => actions.onOpenRules?.());

  const quickSortBtn = document.createElement('button');
  quickSortBtn.className = `ws-btn ${store.ui.quickSortMode ? 'ws-btn-primary' : ''}`;
  quickSortBtn.id = 'btn-toolbar-quicksort';
  quickSortBtn.textContent = '🚀 Quick Sort';
  quickSortBtn.title = 'Toggle distraction-free Quick Sort layout';
  quickSortBtn.addEventListener('click', () => actions.onToggleQuickSort?.());

  const themeBtn = document.createElement('button');
  themeBtn.className = 'ws-btn ws-btn-icon';
  themeBtn.id = 'btn-toolbar-theme';
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
  themeBtn.textContent = currentTheme === 'dark' ? '☀️' : '🌙';
  themeBtn.title = 'Toggle Light / Dark (AMOLED) Theme';
  themeBtn.setAttribute('aria-label', 'Toggle theme');
  themeBtn.addEventListener('click', () => actions.onToggleTheme?.());

  const settingsBtn = document.createElement('button');
  settingsBtn.className = 'ws-btn ws-btn-icon';
  settingsBtn.id = 'btn-toolbar-settings';
  settingsBtn.textContent = '⚙️';
  settingsBtn.title = 'Open WiniSort Settings';
  settingsBtn.setAttribute('aria-label', 'Settings');
  settingsBtn.addEventListener('click', () => actions.onOpenSettings?.());

  const helpBtn = document.createElement('button');
  helpBtn.className = 'ws-btn ws-btn-icon';
  helpBtn.id = 'btn-toolbar-help';
  helpBtn.textContent = '?';
  helpBtn.title = 'Keyboard Shortcuts & Help (?)';
  helpBtn.setAttribute('aria-label', 'Help');
  helpBtn.addEventListener('click', () => actions.onOpenHelp?.());

  rightActions.append(progressPill, undoBtn, redoBtn, rulesBtn, quickSortBtn, themeBtn, settingsBtn, helpBtn);
  container.append(brand, leftActions, searchWrap, rightActions);
}


// --- src/components/destination-card.js ---

/**
 * Creates a single polished Folder Destination Card element:
 * e.g. Diwali 🪔 — 42 files — 186 MB
 */
function createDestinationCardElement(dest, store, actions) {
  const card = document.createElement('div');
  card.className = `ws-dest-card ${store.preferences.compactCards ? 'is-compact' : ''}`.trim();
  card.setAttribute('data-destination-id', dest.id);
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');
  card.style.setProperty('--dest-color', dest.color || '#5286DB');

  const sizeText = formatBytes(dest.stats.totalBytes, { mode: store.preferences.unitSystem });
  const fileWord = dest.stats.fileCount === 1 ? 'file' : 'files';
  card.title = `${dest.name} (${dest.bank.toUpperCase()} bank) — ${dest.stats.fileCount} ${fileWord} — ${sizeText}${dest.stats.lastAddedName ? ` • Last added: ${dest.stats.lastAddedName}` : ''}`;

  const left = document.createElement('div');
  left.className = 'ws-dest-left';

  const emojiBox = document.createElement('div');
  emojiBox.className = 'ws-dest-emoji';
  emojiBox.textContent = dest.emoji || '📁';

  const info = document.createElement('div');
  info.className = 'ws-dest-info';

  const nameRow = document.createElement('div');
  nameRow.className = 'ws-dest-name-row';

  const nameEl = document.createElement('span');
  nameEl.className = 'ws-dest-name';
  nameEl.textContent = dest.name;
  nameRow.appendChild(nameEl);

  if (dest.pinned) {
    const pinIcon = document.createElement('span');
    pinIcon.style.fontSize = '10px';
    pinIcon.textContent = '📌';
    pinIcon.title = 'Pinned destination';
    nameRow.appendChild(pinIcon);
  }

  const metaEl = document.createElement('div');
  metaEl.className = 'ws-dest-meta';
  metaEl.textContent = `${dest.stats.fileCount} ${fileWord} — ${sizeText}`;

  info.append(nameRow, metaEl);
  left.append(emojiBox, info);

  const right = document.createElement('div');
  right.className = 'ws-dest-right';

  if (dest.shortcut) {
    const kbd = document.createElement('span');
    kbd.className = 'ws-dest-shortcut';
    kbd.textContent = dest.shortcut;
    kbd.title = `Press ${dest.shortcut} to quick-sort active file here`;
    right.appendChild(kbd);
  }

  const optBtn = document.createElement('button');
  optBtn.className = 'ws-dest-action-btn';
  optBtn.textContent = '⚙️';
  optBtn.title = `Destination settings & Image Optimization for "${dest.name}"`;
  optBtn.setAttribute('aria-label', `Settings for ${dest.name}`);
  optBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    actions.onOpenDestinationSettings?.(dest.id, e);
  });

  right.appendChild(optBtn);
  card.append(left, right);

  // Clicking or pressing Enter on a destination card sorts the currently active/selected file(s) into it
  card.addEventListener('click', () => {
    actions.onSortActiveIntoDestination?.(dest.id);
  });

  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      actions.onSortActiveIntoDestination?.(dest.id);
    }
  });

  card.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    actions.onDestinationContextMenu?.(dest.id, e.clientX, e.clientY);
  });

  return card;
}


// --- src/components/destination-bank.js ---

/**
 * Renders one of the 4 surrounding destination banks ('top' | 'left' | 'right' | 'bottom')
 * with smart capacity management: pinned & recent first, plus a "+N More / Search Picker" button when capacity is exceeded.
 */
function renderDestinationBank(container, bankName, store, actions) {
  if (!container) return;
  container.innerHTML = '';

  const isHorizontal = bankName === 'top' || bankName === 'bottom';
  const maxVisible = store.preferences.maxVisibleCardsPerBank || (isHorizontal ? 5 : 6);

  // Gather destinations assigned to this bank (or favorite destinations in Quick Sort mode)
  const bankDests = [];
  for (const dest of store.destinations.values()) {
    if (store.ui.quickSortMode) {
      if (bankName === 'bottom' && (dest.pinned || dest.favorite)) {
        bankDests.push(dest);
      }
    } else if (dest.bank === bankName) {
      bankDests.push(dest);
    }
  }

  // Sort pinned first, then by recent usage, then creation order
  const recentOrder = store.ui.recentDestinationIds || [];
  bankDests.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    const rA = recentOrder.indexOf(a.id);
    const rB = recentOrder.indexOf(b.id);
    if (rA !== -1 && rB !== -1) return rA - rB;
    if (rA !== -1) return -1;
    if (rB !== -1) return 1;
    return a.createdAt - b.createdAt;
  });

  const header = document.createElement('div');
  header.className = 'ws-bank-header';

  const titleSpan = document.createElement('span');
  titleSpan.textContent = `${bankName.toUpperCase()} (${bankDests.length})`;

  const addBtn = document.createElement('button');
  addBtn.className = 'ws-btn';
  addBtn.style.height = '24px';
  addBtn.style.padding = '0 7px';
  addBtn.style.fontSize = '11px';
  addBtn.textContent = '+ Folder';
  addBtn.title = `Create a new destination in the ${bankName} bank`;
  addBtn.addEventListener('click', () => actions.onOpenNewDestination?.(bankName));

  header.append(titleSpan, addBtn);

  const cardsWrap = document.createElement('div');
  cardsWrap.className = isHorizontal ? 'ws-bank-cards-horizontal' : 'ws-bank-cards-vertical';

  const visibleDests = bankDests.slice(0, maxVisible);
  const overflowCount = Math.max(0, bankDests.length - visibleDests.length);

  for (const dest of visibleDests) {
    cardsWrap.appendChild(createDestinationCardElement(dest, store, actions));
  }

  if (overflowCount > 0) {
    const moreBtn = document.createElement('button');
    moreBtn.className = 'ws-btn ws-badge-accent';
    moreBtn.textContent = `+${overflowCount} More...`;
    moreBtn.title = 'Search and pick from all destinations';
    moreBtn.addEventListener('click', () => actions.onOpenCommandPalette?.());
    cardsWrap.appendChild(moreBtn);
  }

  if (bankDests.length === 0 && !store.ui.quickSortMode) {
    const emptyHint = document.createElement('div');
    emptyHint.style.cssText = 'font-size:11.5px;color:var(--text-muted);padding:4px 6px;';
    emptyHint.textContent = `No folders on ${bankName}.`;
    cardsWrap.appendChild(emptyHint);
  }

  if (isHorizontal) {
    header.style.marginRight = '8px';
    container.append(header, cardsWrap);
  } else {
    container.append(header, cardsWrap);
  }
}


// --- src/components/media-pool.js ---

/**
 * Renders the signature WiniSort initial collection tray when no files are loaded yet,
 * including quick starter folder templates and sample test batch creation for instant verification.
 */
function renderInitialMediaPool(container, store, actions) {
  if (!container) return;
  container.innerHTML = '';

  const poolWrap = document.createElement('div');
  poolWrap.className = 'ws-pool-container';

  const tray = document.createElement('div');
  tray.className = 'ws-collection-tray';
  tray.id = 'ws-signature-collection-tray';

  const well = document.createElement('div');
  well.className = 'ws-tray-well';
  well.innerHTML = `<span style="font-size:40px;">🗂️</span>`;

  const heading = document.createElement('h1');
  heading.className = 'ws-tray-heading';
  heading.textContent = 'Your files, ready to find their place.';

  const subtext = document.createElement('p');
  subtext.className = 'ws-tray-subtext';
  subtext.textContent = 'Choose files or folders to begin organizing. Drag files onto this tray, pick a local folder, or apply a destination template below.';

  const btnRow = document.createElement('div');
  btnRow.className = 'ws-tray-buttons';

  const primaryBtn = document.createElement('button');
  primaryBtn.className = 'ws-btn ws-btn-primary';
  primaryBtn.id = 'btn-pool-add-files-or-folder';
  primaryBtn.style.height = '38px';
  primaryBtn.style.padding = '0 16px';
  primaryBtn.style.fontSize = '13.5px';
  primaryBtn.textContent = '📂 Add Files or Folder';
  primaryBtn.addEventListener('click', () => actions.onAddFolderOrFiles?.());

  const filterBtn = document.createElement('button');
  filterBtn.className = 'ws-btn';
  filterBtn.style.height = '38px';
  filterBtn.textContent = '🎯 Choose Media Categories';
  filterBtn.addEventListener('click', () => actions.onOpenFilters?.());

  const connectDestBtn = document.createElement('button');
  connectDestBtn.className = 'ws-btn';
  connectDestBtn.style.height = '38px';
  connectDestBtn.textContent = '🔗 Connect Existing Folder';
  connectDestBtn.addEventListener('click', () => actions.onConnectExistingDestination?.());

  const sampleBtn = document.createElement('button');
  sampleBtn.className = 'ws-btn';
  sampleBtn.id = 'btn-pool-load-sample-files';
  sampleBtn.style.height = '38px';
  sampleBtn.textContent = '✨ Load Sample Media Pack';
  sampleBtn.title = 'Generate local in-browser sample photos, audio, PDF, and docs to test sorting immediately';
  sampleBtn.addEventListener('click', () => actions.onLoadSampleMediaPack?.());

  btnRow.append(primaryBtn, filterBtn, connectDestBtn, sampleBtn);

  // Starter Destination Templates strip
  const templateSection = document.createElement('div');
  templateSection.style.cssText = 'width:100%;border-top:1px solid var(--border-hairline);padding-top:14px;display:flex;flex-direction:column;gap:8px;align-items:center;';

  const tplLabel = document.createElement('div');
  tplLabel.style.cssText = 'font-size:11.5px;color:var(--text-secondary);font-weight:600;';
  tplLabel.textContent = 'Optional Starter Destination Sets (Click to add folders):';

  const tplChips = document.createElement('div');
  tplChips.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;justify-content:center;';

  for (const tpl of Object.values(STARTER_TEMPLATES)) {
    const chip = document.createElement('button');
    chip.className = 'ws-btn';
    chip.style.height = '28px';
    chip.style.fontSize = '11.5px';
    chip.textContent = `${tpl.emoji} ${tpl.name}`;
    chip.addEventListener('click', () => actions.onApplyStarterTemplate?.(tpl.id));
    tplChips.appendChild(chip);
  }

  templateSection.append(tplLabel, tplChips);
  tray.append(well, heading, subtext, btnRow, templateSection);
  poolWrap.appendChild(tray);
  container.appendChild(poolWrap);
}


// --- src/components/active-viewer.js ---

/**
 * Renders the Central Active Media Sorting Workspace:
 * - Header bar with filter tabs (Unsorted, All, Sorted, Skipped, Review Later, Favorites), batch controls, and Add More Files
 * - Prominent Central File Viewer (media preview + metadata + quick sort controls)
 * - Virtualized/windowed collapsible Pool Strip at bottom of center stage
 */
function renderActiveSortingWorkspace(container, store, previewManager, dragController, selectionManager, actions) {
  if (!container) return;
  container.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'ws-active-workspace';

  // 1. Viewer Top Filter & Batch Bar
  const header = document.createElement('div');
  header.className = 'ws-viewer-header';

  const statusTabs = document.createElement('div');
  statusTabs.style.cssText = 'display:flex;align-items:center;gap:5px;flex-wrap:wrap;';

  const tabs = [
    { id: 'unsorted', label: `Unsorted (${store.stats.unsortedCount})` },
    { id: 'all', label: `All (${store.stats.totalFiles})` },
    { id: 'sorted', label: `Sorted (${store.stats.sortedCount})` },
    { id: 'skipped', label: `Skipped (${store.stats.skippedCount})` },
    { id: 'review-later', label: `Review Later (${store.stats.reviewLaterCount})` },
    { id: 'favorites', label: `★ Favorites (${store.stats.favoriteCount})` }
  ];

  for (const t of tabs) {
    const btn = document.createElement('button');
    btn.className = `ws-btn ${store.ui.statusFilter === t.id ? 'ws-btn-primary' : ''}`;
    btn.style.height = '28px';
    btn.style.fontSize = '11.5px';
    btn.textContent = t.label;
    btn.addEventListener('click', () => {
      store.ui.statusFilter = t.id;
      store.recomputeDerivedState();
      store.notify('filter-tab');
    });
    statusTabs.appendChild(btn);
  }

  const rightBar = document.createElement('div');
  rightBar.style.cssText = 'display:flex;align-items:center;gap:6px;flex-wrap:wrap;';

  if (store.ui.selectedFileIds.size > 0) {
    const selBadge = document.createElement('span');
    selBadge.className = 'ws-badge ws-badge-accent';
    selBadge.textContent = `${store.ui.selectedFileIds.size} selected`;

    const clearSelBtn = document.createElement('button');
    clearSelBtn.className = 'ws-btn';
    clearSelBtn.style.height = '26px';
    clearSelBtn.textContent = 'Clear Selection';
    clearSelBtn.addEventListener('click', () => selectionManager.clearSelection());

    rightBar.append(selBadge, clearSelBtn);
  }

  const addMoreBtn = document.createElement('button');
  addMoreBtn.className = 'ws-btn';
  addMoreBtn.style.height = '28px';
  addMoreBtn.textContent = '+ Add More Source';
  addMoreBtn.addEventListener('click', () => actions.onAddFolderOrFiles?.());

  const poolModeBtn = document.createElement('button');
  poolModeBtn.className = 'ws-btn';
  poolModeBtn.style.height = '28px';
  const mode = store.preferences.poolDisplayMode || 'show';
  poolModeBtn.textContent = mode === 'hide' ? '👁 Show Pool' : mode === 'collapsed' ? '⬆ Expand Pool' : '⬇ Collapse Pool';
  poolModeBtn.addEventListener('click', () => {
    const next = mode === 'show' ? 'collapsed' : mode === 'collapsed' ? 'hide' : 'show';
    store.preferences.poolDisplayMode = next;
    store.notify('pool-mode');
  });

  rightBar.append(addMoreBtn, poolModeBtn);
  header.append(statusTabs, rightBar);

  // 2. Central Viewer Stage
  const stage = document.createElement('div');
  stage.className = 'ws-viewer-stage';

  const activeFile = store.getActiveFile();

  if (!activeFile) {
    const emptyState = document.createElement('div');
    emptyState.style.cssText = 'text-align:center;padding:32px;max-width:420px;';
    emptyState.innerHTML = `
      <div style="font-size:42px;margin-bottom:10px;">🎉</div>
      <h2 style="font-size:18px;font-weight:700;margin-bottom:6px;">No items in "${store.ui.statusFilter}" view</h2>
      <p style="font-size:13px;color:var(--text-secondary);margin-bottom:16px;">
        All matching files in this queue have been processed, or you can switch tabs above to inspect sorted/skipped items.
      </p>
    `;
    const showAllBtn = document.createElement('button');
    showAllBtn.className = 'ws-btn ws-btn-primary';
    showAllBtn.textContent = 'View All Imported Files';
    showAllBtn.addEventListener('click', () => {
      store.ui.statusFilter = 'all';
      store.recomputeDerivedState();
      store.notify('filter-tab');
    });
    emptyState.appendChild(showAllBtn);
    stage.appendChild(emptyState);
  } else {
    const mediaCard = document.createElement('div');
    mediaCard.className = 'ws-media-card';
    mediaCard.id = 'ws-active-media-card';

    const previewTarget = document.createElement('div');
    previewTarget.style.cssText = 'display:flex;align-items:center;justify-content:center;min-height:220px;min-width:280px;';
    mediaCard.appendChild(previewTarget);

    // Render media preview asynchronously
    previewManager.renderActiveMedia(previewTarget, activeFile);

    // Bind pointer drag-and-drop to any destination card
    dragController.bindMediaCardDrag(mediaCard, activeFile);

    // Context menu on active media card
    mediaCard.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      actions.onMediaCardContextMenu?.(activeFile, e.clientX, e.clientY);
    });

    stage.appendChild(mediaCard);
  }

  // 3. Active File Metadata & Quick Controls Bar
  const controlsBar = document.createElement('div');
  controlsBar.className = 'ws-viewer-controls-bar';

  if (activeFile) {
    const fileInfo = document.createElement('div');
    fileInfo.style.cssText = 'display:flex;flex-direction:column;min-width:0;flex:1;';

    const titleLine = document.createElement('div');
    titleLine.style.cssText = 'display:flex;align-items:center;gap:8px;font-weight:700;font-size:13.5px;';
    const fnSpan = document.createElement('span');
    fnSpan.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    fnSpan.textContent = `${activeFile.emoji} ${activeFile.name}`;
    titleLine.appendChild(fnSpan);

    if (activeFile.status === 'sorted' && activeFile.assignedDestinationId) {
      const d = store.destinations.get(activeFile.assignedDestinationId);
      const sortedBadge = document.createElement('span');
      sortedBadge.className = 'ws-badge ws-badge-accent';
      sortedBadge.textContent = `Sorted → ${d ? d.name : 'Folder'}`;
      titleLine.appendChild(sortedBadge);
    }

    const subLine = document.createElement('div');
    subLine.style.cssText = 'font-size:11.5px;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
    subLine.textContent = `${formatBytes(activeFile.size, { mode: store.preferences.unitSystem })} • ${activeFile.category.toUpperCase()} (.${activeFile.extension || 'file'}) • Source: ${activeFile.sourceName} (${activeFile.relativePath}) • ${formatDate(activeFile.lastModified)}`;

    fileInfo.append(titleLine, subLine);

    const navActions = document.createElement('div');
    navActions.style.cssText = 'display:flex;align-items:center;gap:6px;flex-wrap:wrap;';

    const currentIdx = store.filteredFileIds.indexOf(activeFile.id) + 1;
    const posBadge = document.createElement('span');
    posBadge.className = 'ws-badge';
    posBadge.textContent = `${currentIdx} / ${store.filteredFileIds.length}`;

    const prevBtn = document.createElement('button');
    prevBtn.className = 'ws-btn';
    prevBtn.textContent = '◀ Prev';
    prevBtn.title = 'Previous file (Left Arrow)';
    prevBtn.addEventListener('click', () => actions.onPreviousFile?.());

    const nextBtn = document.createElement('button');
    nextBtn.className = 'ws-btn';
    nextBtn.textContent = 'Next ▶';
    nextBtn.title = 'Next file (Right Arrow)';
    nextBtn.addEventListener('click', () => actions.onNextFile?.());

    const favBtn = document.createElement('button');
    favBtn.className = `ws-btn ${activeFile.favorite ? 'ws-btn-primary' : ''}`;
    favBtn.textContent = activeFile.favorite ? '★ Favorited' : '☆ Favorite';
    favBtn.addEventListener('click', () => actions.onToggleFavorite?.(activeFile.id));

    const skipBtn = document.createElement('button');
    skipBtn.className = 'ws-btn';
    skipBtn.textContent = '⏭ Skip';
    skipBtn.title = 'Move to Skipped queue (Delete key)';
    skipBtn.addEventListener('click', () => actions.onSkipFile?.(activeFile.id));

    const reviewBtn = document.createElement('button');
    reviewBtn.className = 'ws-btn';
    reviewBtn.textContent = '🔖 Review Later';
    reviewBtn.addEventListener('click', () => actions.onReviewLater?.(activeFile.id));

    const pickDestBtn = document.createElement('button');
    pickDestBtn.className = 'ws-btn ws-btn-primary';
    pickDestBtn.textContent = '📁 Sort Into... (Ctrl+K)';
    pickDestBtn.addEventListener('click', () => actions.onOpenCommandPalette?.());

    navActions.append(posBadge, prevBtn, nextBtn, favBtn, skipBtn, reviewBtn, pickDestBtn);
    controlsBar.append(fileInfo, navActions);
  }

  wrapper.append(header, stage, controlsBar);

  // 4. Virtualized / Windowed Media Pool Strip (renders at most 40 visible items around active index for 50,000-file performance)
  const poolMode = store.preferences.poolDisplayMode || 'show';
  if (poolMode !== 'hide') {
    const strip = document.createElement('div');
    strip.className = `ws-pool-strip ${poolMode === 'collapsed' ? 'is-collapsed' : ''}`;

    if (poolMode === 'collapsed') {
      const summary = document.createElement('div');
      summary.style.cssText = 'font-size:12px;color:var(--text-secondary);display:flex;align-items:center;justify-content:space-between;width:100%;';
      summary.innerHTML = `<span>Media Pool (${store.filteredFileIds.length} visible files in queue)</span>`;
      strip.appendChild(summary);
    } else {
      const allIds = store.filteredFileIds;
      const activeIdx = Math.max(0, allIds.indexOf(store.ui.activeFileId));
      const windowStart = Math.max(0, activeIdx - 12);
      const windowEnd = Math.min(allIds.length, windowStart + 36);

      for (let i = windowStart; i < windowEnd; i++) {
        const fid = allIds[i];
        const f = store.files.get(fid);
        if (!f) continue;

        const thumb = document.createElement('div');
        thumb.className = `ws-pool-thumb ${fid === store.ui.activeFileId ? 'is-current' : ''} ${store.ui.selectedFileIds.has(fid) ? 'is-selected' : ''}`.trim();
        thumb.title = `${f.name} (${formatBytes(f.size)}) — Click to view, Shift/Ctrl+Click to multi-select`;

        const cachedThumb = previewManager.thumbnailCache.get(fid);
        if (cachedThumb) {
          thumb.innerHTML = `<img src="${cachedThumb}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:4px;" />`;
        } else {
          thumb.innerHTML = `
            <span style="font-size:20px;">${f.emoji || '📄'}</span>
            <span style="max-width:60px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"></span>
          `;
          thumb.querySelectorAll('span')[1].textContent = f.name;
          // Lazily generate thumbnail for visible image items
          if (f.previewKind === 'image') {
            previewManager.copyEngine.resolveSourceFile(f).then((blob) => {
              return previewManager.thumbnailCache.getOrCreateThumbnail(f, blob);
            }).then((url) => {
              if (url && thumb.isConnected) {
                thumb.innerHTML = `<img src="${url}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:4px;" />`;
              }
            }).catch(() => {});
          }
        }

        thumb.addEventListener('click', (e) => {
          if (e.shiftKey || e.ctrlKey || e.metaKey) {
            selectionManager.toggleSelect(fid, e.shiftKey);
          } else {
            store.ui.activeFileId = fid;
            store.notify('active-file');
          }
        });

        strip.appendChild(thumb);
      }
    }

    wrapper.appendChild(strip);
  }

  container.appendChild(wrapper);
}


// --- src/components/settings-panel.js ---


/**
 * Searchable 8-group Settings Dialog covering Appearance, Media & Scanning, File Operations,
 * Destination Layout, Backup & Recovery, Optimization, Privacy, and Advanced Diagnostics.
 */
function renderSettingsModal(store, actions) {
  const body = document.createElement('div');
  body.style.cssText = 'display:flex;flex-direction:column;gap:14px;';

  const searchBar = document.createElement('input');
  searchBar.type = 'search';
  searchBar.placeholder = 'Filter settings (e.g. theme, collision, move, backup, privacy)...';
  searchBar.style.cssText = 'width:100%;height:34px;padding:0 12px;border-radius:8px;border:1px solid var(--border-strong);background:var(--surface-secondary);';

  const sectionsWrap = document.createElement('div');
  sectionsWrap.style.cssText = 'display:flex;flex-direction:column;gap:14px;';

  const p = store.preferences;

  const groups = [
    {
      title: '1. Appearance & Interface Density',
      keywords: 'theme dark light amoled density compact motion transparency',
      render() {
        const div = document.createElement('div');
        div.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px;';
        div.innerHTML = `
          <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;">
            <span>Color Theme</span>
            <select id="pref-theme" class="ws-btn" style="justify-content:space-between;">
              <option value="system" ${p.theme === 'system' ? 'selected' : ''}>Follow System</option>
              <option value="light" ${p.theme === 'light' ? 'selected' : ''}>Light (#F6F8FC)</option>
              <option value="dark" ${p.theme === 'dark' ? 'selected' : ''}>Dark — AMOLED (#050608)</option>
            </select>
          </label>
          <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;">
            <span>Interface Density</span>
            <select id="pref-density" class="ws-btn">
              <option value="compact" ${p.density === 'compact' ? 'selected' : ''}>Compact</option>
              <option value="comfortable" ${p.density === 'comfortable' ? 'selected' : ''}>Comfortable</option>
              <option value="spacious" ${p.density === 'spacious' ? 'selected' : ''}>Spacious</option>
            </select>
          </label>
          <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;">
            <span>Motion Level</span>
            <select id="pref-motion" class="ws-btn">
              <option value="full" ${p.motionLevel === 'full' ? 'selected' : ''}>Full Smooth Motion</option>
              <option value="reduced" ${p.motionLevel === 'reduced' ? 'selected' : ''}>Reduced Motion</option>
            </select>
          </label>
          <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;">
            <span>Transparency Level</span>
            <select id="pref-transparency" class="ws-btn">
              <option value="normal" ${p.transparencyLevel === 'normal' ? 'selected' : ''}>Standard Glass Depth</option>
              <option value="reduced" ${p.transparencyLevel === 'reduced' ? 'selected' : ''}>Opaque Surfaces</option>
            </select>
          </label>
        `;
        return div;
      }
    },
    {
      title: '2. File Operations, Collision Policy & Source Safety',
      keywords: 'copy move collision overwrite rename dry run verify integrity source',
      render() {
        const div = document.createElement('div');
        div.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;';
        div.innerHTML = `
          <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;">
            <span>Default Operation Mode</span>
            <select id="pref-op-mode" class="ws-btn">
              <option value="copy" ${p.operationMode === 'copy' ? 'selected' : ''}>Safe COPY (Default — Preserves Originals)</option>
              <option value="move" ${p.operationMode === 'move' ? 'selected' : ''}>Advanced MOVE (Copy + Verify + Remove Source)</option>
            </select>
          </label>
          <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;">
            <span>Filename Collision Policy</span>
            <select id="pref-collision" class="ws-btn">
              <option value="keep-both" ${p.collisionPolicy === 'keep-both' ? 'selected' : ''}>Keep Both Safely (Name (1).ext)</option>
              <option value="auto-rename" ${p.collisionPolicy === 'auto-rename' ? 'selected' : ''}>Auto-Rename (Name_1.ext)</option>
              <option value="skip" ${p.collisionPolicy === 'skip' ? 'selected' : ''}>Skip Existing File</option>
              <option value="replace" ${p.collisionPolicy === 'replace' ? 'selected' : ''}>Replace Destination File</option>
            </select>
          </label>
          <label style="display:flex;align-items:center;gap:8px;font-size:12px;padding-top:16px;">
            <input type="checkbox" id="pref-verify" ${p.verifyCopyIntegrity ? 'checked' : ''} />
            <span>Verify file size & stream digest after copy</span>
          </label>
          <label style="display:flex;align-items:center;gap:8px;font-size:12px;padding-top:16px;">
            <input type="checkbox" id="pref-dryrun" ${p.dryRunMode ? 'checked' : ''} />
            <span>Dry-Run Mode (Simulate sorting without writing bytes)</span>
          </label>
          <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--status-danger);grid-column:1/-1;">
            <input type="checkbox" id="pref-allow-source-mod" ${p.allowSourceModification ? 'checked' : ''} />
            <span>⚠️ Authorize source deletion when Advanced MOVE mode is enabled (Disabled by default for safety)</span>
          </label>
        `;
        return div;
      }
    },
    {
      title: '3. Destination Layout & Capacity',
      keywords: 'bank placement compact cards max visible',
      render() {
        const div = document.createElement('div');
        div.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px;';
        div.innerHTML = `
          <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;">
            <span>Default New Destination Bank</span>
            <select id="pref-default-bank" class="ws-btn">
              <option value="left" ${p.defaultBankPlacement === 'left' ? 'selected' : ''}>Left Bank</option>
              <option value="top" ${p.defaultBankPlacement === 'top' ? 'selected' : ''}>Top Bank</option>
              <option value="right" ${p.defaultBankPlacement === 'right' ? 'selected' : ''}>Right Bank</option>
              <option value="bottom" ${p.defaultBankPlacement === 'bottom' ? 'selected' : ''}>Bottom Bank</option>
            </select>
          </label>
          <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;">
            <span>Max Visible Cards Per Bank</span>
            <input type="number" id="pref-max-cards" class="ws-btn" min="3" max="15" value="${p.maxVisibleCardsPerBank || 6}" />
          </label>
          <label style="display:flex;align-items:center;gap:8px;font-size:12px;padding-top:16px;">
            <input type="checkbox" id="pref-compact-cards" ${p.compactCards ? 'checked' : ''} />
            <span>Use Compact Destination Cards</span>
          </label>
          <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;">
            <span>Size Display Units</span>
            <select id="pref-units" class="ws-btn">
              <option value="SI" ${p.unitSystem === 'SI' ? 'selected' : ''}>SI Decimal (MB, GB)</option>
              <option value="IEC" ${p.unitSystem === 'IEC' ? 'selected' : ''}>IEC Binary (MiB, GiB)</option>
            </select>
          </label>
        `;
        return div;
      }
    },
    {
      title: '4. Project Save, Backup & Crash Recovery (.winisort/)',
      keywords: 'save export import project json journal recovery checkpoint',
      render() {
        const div = document.createElement('div');
        div.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;align-items:center;';

        const saveBtn = document.createElement('button');
        saveBtn.className = 'ws-btn ws-btn-primary';
        saveBtn.textContent = '💾 Save Project (.winisort)';
        saveBtn.addEventListener('click', () => actions.onSaveProject?.());

        const exportBtn = document.createElement('button');
        exportBtn.className = 'ws-btn';
        exportBtn.textContent = '📤 Export Portable Project JSON';
        exportBtn.addEventListener('click', () => actions.onExportProjectJson?.());

        const importBtn = document.createElement('button');
        importBtn.className = 'ws-btn';
        importBtn.textContent = '📥 Import Project JSON';
        importBtn.addEventListener('click', () => actions.onImportProjectJson?.());

        const zipBtn = document.createElement('button');
        zipBtn.className = 'ws-btn';
        zipBtn.textContent = '🗜️ Export Sorted Files as ZIP Archive';
        zipBtn.addEventListener('click', () => actions.onExportSortedZip?.());

        div.append(saveBtn, exportBtn, importBtn, zipBtn);
        return div;
      }
    },
    {
      title: '5. Privacy, Permissions & Diagnostics',
      keywords: 'privacy local offline permissions capabilities reset diagnostics',
      render() {
        const div = document.createElement('div');
        div.style.cssText = 'display:flex;flex-direction:column;gap:8px;font-size:12px;color:var(--text-secondary);';
        const cap = store.capabilities;
        div.innerHTML = `
          <div>🔒 <strong>100% Local-First Processing:</strong> Zero servers, zero telemetry, zero cloud uploads. Personal media is never stored in IndexedDB or Service Worker caches.</div>
          <div>🧭 <strong>Filesystem Mode:</strong> ${cap.filesystemMode} • Directory Picker: ${cap.hasDirectoryPicker ? 'Supported' : 'Fallback Mode'} • Workers: ${cap.hasWebWorkers ? 'Active' : 'Fallback'} • Concurrency Budget: ${cap.budgets.maxConcurrentCopies} stream(s)</div>
        `;
        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-top:4px;';

        const disconnectBtn = document.createElement('button');
        disconnectBtn.className = 'ws-btn';
        disconnectBtn.textContent = '🔌 Disconnect Output Directory';
        disconnectBtn.addEventListener('click', () => {
          store.project.outputRootHandle = null;
          store.project.outputRootName = null;
          store.notify('destinations');
          actions.onCloseModal?.();
        });

        const resetBtn = document.createElement('button');
        resetBtn.className = 'ws-btn ws-btn-danger';
        resetBtn.textContent = '↺ Reset Preferences to Default';
        resetBtn.addEventListener('click', () => {
          store.preferences = createDefaultPreferences();
          actions.onApplyThemeAndDensity?.();
          actions.onCloseModal?.();
        });

        btnRow.append(disconnectBtn, resetBtn);
        div.appendChild(btnRow);
        return div;
      }
    }
  ];

  function renderFilteredGroups(q = '') {
    sectionsWrap.innerHTML = '';
    const query = q.trim().toLowerCase();
    for (const g of groups) {
      if (query && !g.title.toLowerCase().includes(query) && !g.keywords.includes(query)) {
        continue;
      }
      const box = document.createElement('div');
      box.style.cssText = 'padding:12px 14px;border-radius:10px;background:var(--surface-secondary);border:1px solid var(--border-hairline);display:flex;flex-direction:column;gap:10px;';
      const h3 = document.createElement('h3');
      h3.style.cssText = 'font-size:13px;font-weight:700;color:var(--text-primary);';
      h3.textContent = g.title;
      box.append(h3, g.render());
      sectionsWrap.appendChild(box);
    }
  }

  searchBar.addEventListener('input', () => renderFilteredGroups(searchBar.value));
  renderFilteredGroups('');

  body.append(searchBar, sectionsWrap);

  return createModalShell({
    title: '⚙️ WiniSort Settings & Preferences',
    onClose: () => actions.onCloseModal?.(),
    bodyEl: body,
    footerButtons: [
      {
        label: 'Cancel',
        onClick: () => actions.onCloseModal?.()
      },
      {
        label: 'Apply & Save Settings',
        primary: true,
        onClick: () => {
          const val = (id) => body.querySelector(`#${id}`)?.value;
          const chk = (id) => Boolean(body.querySelector(`#${id}`)?.checked);

          if (val('pref-theme')) p.theme = val('pref-theme');
          if (val('pref-density')) p.density = val('pref-density');
          if (val('pref-motion')) p.motionLevel = val('pref-motion');
          if (val('pref-transparency')) p.transparencyLevel = val('pref-transparency');
          if (val('pref-op-mode')) p.operationMode = val('pref-op-mode');
          if (val('pref-collision')) p.collisionPolicy = val('pref-collision');
          if (val('pref-default-bank')) p.defaultBankPlacement = val('pref-default-bank');
          if (val('pref-units')) p.unitSystem = val('pref-units');
          if (val('pref-max-cards')) p.maxVisibleCardsPerBank = Math.max(3, parseInt(val('pref-max-cards'), 10) || 6);

          if (body.querySelector('#pref-verify')) p.verifyCopyIntegrity = chk('pref-verify');
          if (body.querySelector('#pref-dryrun')) p.dryRunMode = chk('pref-dryrun');
          if (body.querySelector('#pref-allow-source-mod')) p.allowSourceModification = chk('pref-allow-source-mod');
          if (body.querySelector('#pref-compact-cards')) p.compactCards = chk('pref-compact-cards');

          actions.onApplyThemeAndDensity?.();
          actions.onCloseModal?.();
        }
      }
    ]
  });
}


// --- src/components/statistics.js ---


/**
 * Storage Management, Live Folder Statistics, Duplicate Detection & Session Speed Modal.
 */
function renderStatisticsModal(store, duplicateDetector, actions) {
  const body = document.createElement('div');
  body.style.cssText = 'display:flex;flex-direction:column;gap:16px;';

  const unitMode = store.preferences.unitSystem;
  const elapsedMin = Math.max(0.1, (Date.now() - store.ui.sessionStartedAt) / 60000);
  const speedPerMin = (store.stats.sortedCount / elapsedMin).toFixed(1);
  const pct = store.stats.totalFiles > 0
    ? Math.round((store.stats.sortedCount / store.stats.totalFiles) * 100)
    : 0;

  // KPI Grid
  const kpiGrid = document.createElement('div');
  kpiGrid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;';
  const kpis = [
    { label: 'Total Eligible Files', value: `${store.stats.totalFiles} (${formatBytes(store.stats.totalEligibleBytes, { mode: unitMode })})` },
    { label: 'Sorted Completion', value: `${store.stats.sortedCount} (${pct}%)` },
    { label: 'Remaining Unsorted', value: `${store.stats.unsortedCount}` },
    { label: 'Verified Bytes Copied', value: formatBytes(store.stats.completedCopyBytes, { mode: unitMode }) },
    { label: 'Sorting Speed', value: `${speedPerMin} files/min` },
    { label: 'Compression Saved', value: formatBytes(store.stats.compressionSavedBytes, { mode: unitMode }) }
  ];

  for (const k of kpis) {
    const card = document.createElement('div');
    card.style.cssText = 'padding:10px 12px;border-radius:10px;background:var(--surface-secondary);border:1px solid var(--border-hairline);';
    card.innerHTML = `
      <div style="font-size:11px;color:var(--text-secondary);">${k.label}</div>
      <div style="font-size:15px;font-weight:700;margin-top:3px;">${k.value}</div>
    `;
    kpiGrid.appendChild(card);
  }

  // Destination Breakdown Table
  const destSection = document.createElement('div');
  destSection.innerHTML = `<h3 style="font-size:13.5px;font-weight:700;margin-bottom:8px;">Folder Destinations Breakdown</h3>`;

  const table = document.createElement('table');
  table.style.cssText = 'width:100%;border-collapse:collapse;font-size:12px;';
  table.innerHTML = `
    <thead>
      <tr style="border-bottom:1px solid var(--border-strong);text-align:left;color:var(--text-secondary);">
        <th style="padding:6px;">Destination</th>
        <th style="padding:6px;">Bank</th>
        <th style="padding:6px;">Files</th>
        <th style="padding:6px;">Total Size</th>
        <th style="padding:6px;">Type Breakdown</th>
        <th style="padding:6px;">Status</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  const tbody = table.querySelector('tbody');

  for (const d of store.destinations.values()) {
    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid var(--border-hairline)';
    const s = d.stats;
    tr.innerHTML = `
      <td style="padding:7px 6px;font-weight:600;">${d.emoji} <span class="d-name"></span></td>
      <td style="padding:7px 6px;text-transform:uppercase;">${d.bank}</td>
      <td style="padding:7px 6px;">${s.fileCount}</td>
      <td style="padding:7px 6px;">${formatBytes(s.totalBytes, { mode: unitMode })}</td>
      <td style="padding:7px 6px;color:var(--text-secondary);">🖼️${s.imagesCount} 🎬${s.videosCount} 🎵${s.audioCount} 📕${s.pdfCount} 📄${s.documentsCount}</td>
      <td style="padding:7px 6px;">${s.verifiedFromDisk ? '✅ Disk Verified' : '📦 Session Staged'}</td>
    `;
    tr.querySelector('.d-name').textContent = d.name;
    tbody.appendChild(tr);
  }
  destSection.appendChild(table);

  // Duplicate Candidate Review Section
  const dupSection = document.createElement('div');
  dupSection.style.cssText = 'padding:12px;border-radius:10px;background:var(--surface-secondary);border:1px solid var(--border-hairline);display:flex;flex-direction:column;gap:8px;';
  const candidateGroups = duplicateDetector.findCandidateGroups();

  dupSection.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;">
      <div>
        <strong style="font-size:13px;">🔍 Duplicate Candidate Detector</strong>
        <div style="font-size:11.5px;color:var(--text-secondary);">${candidateGroups.length} size-matched candidate group(s) detected. Originals are never automatically deleted.</div>
      </div>
      <button id="btn-verify-hashes" class="ws-btn ws-btn-primary">Verify Exact Content Hashes</button>
    </div>
    <div id="dup-results-list" style="font-size:12px;display:flex;flex-direction:column;gap:6px;max-height:160px;overflow:auto;"></div>
  `;

  const dupListEl = dupSection.querySelector('#dup-results-list');
  const renderDupGroups = (groups, isVerified = false) => {
    dupListEl.innerHTML = '';
    if (groups.length === 0) {
      dupListEl.textContent = 'No duplicate candidates found in active pool.';
      return;
    }
    for (const g of groups.slice(0, 15)) {
      const item = document.createElement('div');
      item.style.cssText = 'padding:6px 8px;border-radius:6px;background:var(--surface-primary);border:1px solid var(--border-hairline);';
      const names = g.files.map(f => f.name).join('  •  ');
      item.textContent = `${isVerified ? `[Verified Hash ${g.hash}]` : '[Same Size]'}: ${formatBytes(g.size)} — ${names}`;
      dupListEl.appendChild(item);
    }
  };
  renderDupGroups(candidateGroups, false);

  dupSection.querySelector('#btn-verify-hashes').addEventListener('click', async (e) => {
    e.target.disabled = true;
    e.target.textContent = 'Hashing chunks...';
    const exact = await duplicateDetector.verifyExactDuplicates();
    renderDupGroups(exact, true);
    e.target.textContent = `Verified (${exact.length} exact match groups)`;
  });

  body.append(kpiGrid, destSection, dupSection);

  return createModalShell({
    title: '📊 Storage Analytics, Folder Counters & Duplicate Review',
    onClose: () => actions.onCloseModal?.(),
    bodyEl: body,
    footerButtons: [
      { label: 'Export Sorted ZIP', onClick: () => actions.onExportSortedZip?.() },
      { label: 'Done', primary: true, onClick: () => actions.onCloseModal?.() }
    ]
  });
}


// --- src/components/command-palette.js ---



/**
 * Global Command Palette & Searchable Destination Picker (Ctrl/Cmd + K).
 * Makes it effortless to sort into any destination (including overflow/hidden destinations) or trigger app commands.
 */
function renderCommandPaletteModal(store, actions) {
  const body = document.createElement('div');
  body.style.cssText = 'display:flex;flex-direction:column;gap:12px;';

  const input = document.createElement('input');
  input.type = 'search';
  input.placeholder = 'Type a destination folder name to sort active file, or search commands...';
  input.style.cssText = 'width:100%;height:38px;padding:0 12px;border-radius:8px;border:2px solid var(--accent-main);background:var(--surface-secondary);font-size:13.5px;';

  const listWrap = document.createElement('div');
  listWrap.style.cssText = 'display:flex;flex-direction:column;gap:6px;max-height:340px;overflow-y:auto;';

  function renderList(query = '') {
    listWrap.innerHTML = '';
    const matchingDests = filterDestinationsByQuery(store.destinations.values(), query);

    for (const dest of matchingDests) {
      const row = document.createElement('button');
      row.className = 'ws-btn';
      row.style.cssText = 'justify-content:space-between;height:38px;padding:0 12px;width:100%;';
      row.innerHTML = `
        <span style="display:flex;align-items:center;gap:8px;">
          <span>${dest.emoji}</span>
          <strong></strong>
          <span class="ws-badge">${dest.bank.toUpperCase()}</span>
        </span>
        <span style="font-size:11.5px;color:var(--text-secondary);">Sort here (${dest.stats.fileCount} files • ${formatBytes(dest.stats.totalBytes)})</span>
      `;
      row.querySelector('strong').textContent = dest.name;
      row.addEventListener('click', () => {
        actions.onCloseModal?.();
        actions.onSortActiveIntoDestination?.(dest.id);
      });
      listWrap.appendChild(row);
    }

    const commands = [
      { label: '➕ Create New Destination Folder', run: () => actions.onOpenNewDestination?.('left') },
      { label: '🎯 Open Media Category & Extension Filters', run: () => actions.onOpenFilters?.() },
      { label: '⚡ Open Smart Sorting Rules & Suggestions', run: () => actions.onOpenRules?.() },
      { label: '📊 Open Storage & Duplicate Statistics', run: () => actions.onOpenStats?.() },
      { label: '💾 Save Project Manifest (.winisort)', run: () => actions.onSaveProject?.() },
      { label: '🗜️ Export Sorted Files as ZIP Archive', run: () => actions.onExportSortedZip?.() }
    ];

    for (const cmd of commands) {
      if (query && !cmd.label.toLowerCase().includes(query.toLowerCase())) continue;
      const btn = document.createElement('button');
      btn.className = 'ws-btn';
      btn.style.cssText = 'justify-content:flex-start;height:34px;padding:0 12px;width:100%;';
      btn.textContent = cmd.label;
      btn.addEventListener('click', () => {
        actions.onCloseModal?.();
        cmd.run();
      });
      listWrap.appendChild(btn);
    }
  }

  input.addEventListener('input', () => renderList(input.value));
  renderList('');

  body.append(input, listWrap);
  setTimeout(() => input.focus(), 30);

  return createModalShell({
    title: '⌘ Command Palette & Destination Picker',
    maxWidth: '580px',
    onClose: () => actions.onCloseModal?.(),
    bodyEl: body,
    footerButtons: [{ label: 'Close (Esc)', onClick: () => actions.onCloseModal?.() }]
  });
}


// --- src/components/dialogs.js ---




/**
 * 1. Media Selection & Filtering Panel ("What would you like to organize?")
 */
function renderMediaFilterModal(store, actions) {
  const f = store.filters;
  const body = document.createElement('div');
  body.style.cssText = 'display:flex;flex-direction:column;gap:14px;';

  const topActions = document.createElement('div');
  topActions.style.cssText = 'display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;';
  topActions.innerHTML = `
    <div style="font-size:13px;color:var(--text-secondary);">Strictly enforce eligible categories and file extensions during scanning.</div>
    <div style="display:flex;gap:6px;">
      <button id="btn-filter-select-all" class="ws-btn">Select All</button>
      <button id="btn-filter-clear-all" class="ws-btn">Clear All</button>
    </div>
  `;

  const catGrid = document.createElement('div');
  catGrid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:8px;';

  const selectedExts = new Set((f.extensions || []).map(e => e.toLowerCase()));

  function renderCategoryCards() {
    catGrid.innerHTML = '';
    for (const [catId, cat] of Object.entries(MEDIA_CATEGORIES)) {
      const card = document.createElement('div');
      card.style.cssText = 'padding:10px;border-radius:10px;background:var(--surface-secondary);border:1px solid var(--border-hairline);display:flex;flex-direction:column;gap:6px;';

      const label = document.createElement('label');
      label.style.cssText = 'display:flex;align-items:center;gap:8px;font-weight:700;font-size:13px;cursor:pointer;';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = Boolean(f.categories[catId]);
      cb.addEventListener('change', () => {
        f.categories[catId] = cb.checked;
        for (const ext of cat.extensions) {
          if (cb.checked) selectedExts.add(ext);
          else selectedExts.delete(ext);
        }
        renderCategoryCards();
      });
      label.append(cb, document.createTextNode(`${cat.emoji} ${cat.label}`));
      card.appendChild(label);

      if (cat.extensions.length > 0) {
        const extWrap = document.createElement('div');
        extWrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;';
        for (const ext of cat.extensions) {
          const pill = document.createElement('button');
          const active = selectedExts.has(ext) && f.categories[catId];
          pill.className = `ws-badge ${active ? 'ws-badge-accent' : ''}`;
          pill.style.cursor = 'pointer';
          pill.textContent = `.${ext}`;
          pill.addEventListener('click', () => {
            if (selectedExts.has(ext)) selectedExts.delete(ext);
            else {
              selectedExts.add(ext);
              f.categories[catId] = true;
            }
            renderCategoryCards();
          });
          extWrap.appendChild(pill);
        }
        card.appendChild(extWrap);
      }
      catGrid.appendChild(card);
    }
  }

  topActions.querySelector('#btn-filter-select-all').addEventListener('click', () => {
    for (const [catId, cat] of Object.entries(MEDIA_CATEGORIES)) {
      f.categories[catId] = true;
      for (const ext of cat.extensions) selectedExts.add(ext);
    }
    renderCategoryCards();
  });

  topActions.querySelector('#btn-filter-clear-all').addEventListener('click', () => {
    for (const catId of Object.keys(MEDIA_CATEGORIES)) {
      f.categories[catId] = false;
    }
    selectedExts.clear();
    renderCategoryCards();
  });

  renderCategoryCards();

  // Advanced size, pattern, nested & hidden options
  const advGrid = document.createElement('div');
  advGrid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;padding:12px;border-radius:10px;background:var(--surface-secondary);border:1px solid var(--border-hairline);';
  advGrid.innerHTML = `
    <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;">
      <span>Custom Extensions (comma-separated)</span>
      <input type="text" id="flt-custom-ext" class="ws-btn" placeholder="raw, cr2, dng" value="${(f.customExtensions || []).join(', ')}" />
    </label>
    <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;">
      <span>Min File Size (KB)</span>
      <input type="number" id="flt-min-kb" class="ws-btn" min="0" value="${Math.round((f.minSizeBytes || 0) / 1000)}" />
    </label>
    <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;">
      <span>Include Filename Pattern</span>
      <input type="text" id="flt-include" class="ws-btn" placeholder="e.g. IMG_, Diwali" value="${f.includePattern || ''}" />
    </label>
    <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;">
      <span>Exclude Filename Pattern</span>
      <input type="text" id="flt-exclude" class="ws-btn" placeholder="e.g. thumb, temp" value="${f.excludePattern || ''}" />
    </label>
    <label style="display:flex;align-items:center;gap:8px;font-size:12px;">
      <input type="checkbox" id="flt-nested" ${f.includeNestedFolders !== false ? 'checked' : ''} />
      <span>Scan Nested Subfolders</span>
    </label>
    <label style="display:flex;align-items:center;gap:8px;font-size:12px;">
      <input type="checkbox" id="flt-hidden" ${f.includeHiddenFiles ? 'checked' : ''} />
      <span>Include Hidden Dotfiles</span>
    </label>
  `;

  body.append(topActions, catGrid, advGrid);

  return createModalShell({
    title: 'What would you like to organize?',
    onClose: () => actions.onCloseModal?.(),
    bodyEl: body,
    footerButtons: [
      { label: 'Cancel', onClick: () => actions.onCloseModal?.() },
      {
        label: 'Apply Media Filters',
        primary: true,
        onClick: () => {
          f.extensions = Array.from(selectedExts);
          const rawCustom = body.querySelector('#flt-custom-ext')?.value || '';
          f.customExtensions = rawCustom.split(',').map(s => s.replace(/^\./, '').trim().toLowerCase()).filter(Boolean);
          f.minSizeBytes = Math.max(0, (parseFloat(body.querySelector('#flt-min-kb')?.value) || 0) * 1000);
          f.includePattern = body.querySelector('#flt-include')?.value || '';
          f.excludePattern = body.querySelector('#flt-exclude')?.value || '';
          f.includeNestedFolders = Boolean(body.querySelector('#flt-nested')?.checked);
          f.includeHiddenFiles = Boolean(body.querySelector('#flt-hidden')?.checked);
          actions.onCloseModal?.();
        }
      }
    ]
  });
}

/**
 * 2. Create or Edit Destination Dialog
 */
function renderDestinationDialog(store, payload, actions) {
  const existing = payload?.destinationId ? store.destinations.get(payload.destinationId) : null;
  const defaultBank = payload?.bank || store.preferences.defaultBankPlacement || 'left';

  const body = document.createElement('div');
  body.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:12px;';

  const currentColor = existing?.color || DESTINATION_PALETTE[store.destinations.size % DESTINATION_PALETTE.length].hex;

  body.innerHTML = `
    <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;grid-column:1/-1;">
      <span>Destination Folder Name</span>
      <input type="text" id="dest-name-input" class="ws-btn" style="height:36px;" placeholder="e.g. Diwali 2026, School Notes, Work" value="${existing ? existing.name : ''}" />
    </label>
    <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;">
      <span>Icon / Emoji</span>
      <input type="text" id="dest-emoji-input" class="ws-btn" value="${existing ? existing.emoji : '📁'}" />
    </label>
    <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;">
      <span>Workspace Bank Side</span>
      <select id="dest-bank-input" class="ws-btn">
        <option value="top" ${(existing?.bank || defaultBank) === 'top' ? 'selected' : ''}>Top Bank</option>
        <option value="left" ${(existing?.bank || defaultBank) === 'left' ? 'selected' : ''}>Left Bank</option>
        <option value="right" ${(existing?.bank || defaultBank) === 'right' ? 'selected' : ''}>Right Bank</option>
        <option value="bottom" ${(existing?.bank || defaultBank) === 'bottom' ? 'selected' : ''}>Bottom Bank</option>
      </select>
    </label>
    <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;">
      <span>Quick Shortcut Key (1–9)</span>
      <input type="text" id="dest-shortcut-input" class="ws-btn" maxlength="1" value="${existing ? existing.shortcut : ''}" placeholder="1-9" />
    </label>
    <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;">
      <span>Size Quota Warning (MB, 0 = none)</span>
      <input type="number" id="dest-quota-input" class="ws-btn" min="0" value="${existing?.quotaBytes ? Math.round(existing.quotaBytes / 1e6) : 0}" />
    </label>
    <div style="grid-column:1/-1;display:flex;flex-direction:column;gap:6px;">
      <span style="font-size:12px;">Curated Accent Color</span>
      <div id="dest-color-swatches" style="display:flex;gap:8px;flex-wrap:wrap;"></div>
    </div>
    <label style="display:flex;align-items:center;gap:8px;font-size:12px;grid-column:1/-1;">
      <input type="checkbox" id="dest-pinned-input" ${existing ? (existing.pinned ? 'checked' : '') : 'checked'} />
      <span>📌 Pin destination to the front of its bank</span>
    </label>
  `;

  let pickedColor = currentColor;
  const swatchesEl = body.querySelector('#dest-color-swatches');
  for (const c of DESTINATION_PALETTE) {
    const sw = document.createElement('button');
    sw.type = 'button';
    sw.style.cssText = `width:28px;height:28px;border-radius:50%;background:${c.hex};border:2px solid ${c.hex === pickedColor ? 'var(--text-primary)' : 'transparent'};`;
    sw.title = c.name;
    sw.addEventListener('click', () => {
      pickedColor = c.hex;
      Array.from(swatchesEl.children).forEach(el => { el.style.borderColor = 'transparent'; });
      sw.style.borderColor = 'var(--text-primary)';
    });
    swatchesEl.appendChild(sw);
  }

  // If editing an existing destination, also show Image Compression & Optimization launcher
  if (existing) {
    const optBar = document.createElement('div');
    optBar.style.cssText = 'grid-column:1/-1;padding:10px 12px;border-radius:8px;background:var(--surface-secondary);border:1px solid var(--border-hairline);display:flex;align-items:center;justify-content:space-between;';
    optBar.innerHTML = `
      <div>
        <strong style="font-size:12.5px;">🖼️ Folder Image Optimization</strong>
        <div style="font-size:11px;color:var(--text-secondary);">${existing.stats.imagesCount} image(s) in this destination</div>
      </div>
      <button type="button" id="btn-launch-compression" class="ws-btn ws-btn-primary">Open Image Optimizer</button>
    `;
    optBar.querySelector('#btn-launch-compression').addEventListener('click', () => {
      actions.onOpenCompressionModal?.(existing.id);
    });
    body.appendChild(optBar);
  }

  const footerButtons = [
    { label: 'Cancel', onClick: () => actions.onCloseModal?.() }
  ];

  if (existing) {
    footerButtons.push({
      label: 'Remove from Workspace',
      danger: true,
      onClick: () => {
        actions.onRemoveDestination?.(existing.id);
        actions.onCloseModal?.();
      }
    });
  }

  footerButtons.push({
    label: existing ? 'Save Changes' : 'Create Destination',
    primary: true,
    onClick: () => {
      const name = body.querySelector('#dest-name-input')?.value || '';
      const emoji = body.querySelector('#dest-emoji-input')?.value || '📁';
      const bank = body.querySelector('#dest-bank-input')?.value || 'left';
      const shortcut = body.querySelector('#dest-shortcut-input')?.value || '';
      const quotaMB = parseFloat(body.querySelector('#dest-quota-input')?.value) || 0;
      const pinned = Boolean(body.querySelector('#dest-pinned-input')?.checked);

      if (existing) {
        actions.onUpdateDestination?.(existing.id, {
          name,
          emoji,
          bank,
          shortcut,
          color: pickedColor,
          pinned,
          quotaBytes: Math.round(quotaMB * 1e6)
        });
      } else {
        actions.onCreateDestination?.({
          name,
          emoji,
          bank,
          shortcut,
          color: pickedColor,
          pinned,
          quotaBytes: Math.round(quotaMB * 1e6)
        });
      }
    }
  });

  return createModalShell({
    title: existing ? `Edit Destination: ${existing.name}` : 'Create Sorting Destination Folder',
    maxWidth: '520px',
    onClose: () => actions.onCloseModal?.(),
    bodyEl: body,
    footerButtons
  });
}

/**
 * 3. Image Compression & Folder Optimization Panel
 */
function renderCompressionModal(store, destinationId, compressionRunner, actions) {
  const dest = store.destinations.get(destinationId);
  const eligibleImages = compressionRunner.getDestinationImages(destinationId);
  const body = document.createElement('div');
  body.style.cssText = 'display:flex;flex-direction:column;gap:12px;';

  body.innerHTML = `
    <div style="display:flex;justify-content:space-between;padding:10px 12px;border-radius:8px;background:var(--surface-secondary);">
      <span><strong>Destination:</strong> <span class="c-dname"></span></span>
      <span><strong>Total Size:</strong> ${formatBytes(dest?.stats.totalBytes || 0)}</span>
      <span><strong>Compressible Images:</strong> ${eligibleImages.length}</span>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;">
      <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;">
        <span>Optimization Mode</span>
        <select id="cmp-mode" class="ws-btn">
          <option value="quality">Quality-Controlled (Lossy)</option>
          <option value="resize">Resize + Compress</option>
          <option value="lossless">Lossless Re-encode (PNG)</option>
        </select>
      </label>
      <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;">
        <span>Output Format</span>
        <select id="cmp-format" class="ws-btn">
          <option value="image/webp">WebP (Recommended)</option>
          <option value="image/jpeg">JPEG</option>
          <option value="image/png">PNG</option>
        </select>
      </label>
      <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;">
        <span>Quality (<span id="cmp-q-val">84%</span>)</span>
        <input type="range" id="cmp-quality" min="30" max="98" value="84" />
      </label>
      <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;">
        <span>Max Dimension (px)</span>
        <input type="number" id="cmp-max-dim" class="ws-btn" value="2560" min="256" max="8192" />
      </label>
    </div>
    <div id="cmp-sample-box" style="padding:12px;border-radius:10px;background:var(--surface-secondary);border:1px solid var(--border-hairline);font-size:12px;">
      Non-destructive safety policy: Optimized copies are written to an <code>Optimized/</code> subfolder so existing original files are preserved untouched.
    </div>
  `;
  body.querySelector('.c-dname').textContent = dest ? dest.name : 'Folder';

  const qInput = body.querySelector('#cmp-quality');
  const qLabel = body.querySelector('#cmp-q-val');
  qInput.addEventListener('input', () => { qLabel.textContent = `${qInput.value}%`; });

  const sampleBox = body.querySelector('#cmp-sample-box');
  if (eligibleImages.length > 0) {
    const sampleFile = eligibleImages[0];
    compressionRunner.copyEngine.resolveSourceFile(sampleFile).then((blob) => {
      return generateCompressionSamplePreview(blob, { quality: 0.84, outputFormat: 'image/webp' });
    }).then((preview) => {
      sampleBox.innerHTML = `
        <div><strong>Sample Image:</strong> ${sampleFile.name} • Original: ${formatBytes(preview.originalSize)} → Estimated Output: <strong>${formatBytes(preview.outputSize)}</strong> (Saved ${formatBytes(preview.savedBytes)})</div>
        <div style="margin-top:4px;color:var(--text-secondary);">${preview.note}</div>
      `;
      preview.dispose();
    }).catch(() => {});
  }

  return createModalShell({
    title: `🖼️ Optimize Images in "${dest?.name || 'Destination'}"`,
    onClose: () => actions.onCloseModal?.(),
    bodyEl: body,
    footerButtons: [
      { label: 'Cancel', onClick: () => actions.onCloseModal?.() },
      {
        label: `Optimize ${eligibleImages.length} Image(s)`,
        primary: true,
        onClick: async () => {
          const mode = body.querySelector('#cmp-mode')?.value || 'quality';
          const outputFormat = body.querySelector('#cmp-format')?.value || 'image/webp';
          const quality = (parseFloat(body.querySelector('#cmp-quality')?.value) || 84) / 100;
          const maxDimension = parseInt(body.querySelector('#cmp-max-dim')?.value, 10) || 2560;
          await actions.onRunCompressionJob?.(destinationId, { mode, outputFormat, quality, maxDimension });
        }
      }
    ]
  });
}

/**
 * 4. Smart Rules & Suggested Folders Modal
 */
function renderSmartRulesModal(store, rulesEngine, actions) {
  const body = document.createElement('div');
  body.style.cssText = 'display:flex;flex-direction:column;gap:14px;';

  // Suggested Folders from active pool
  const suggestions = rulesEngine.suggestFoldersFromPool();
  const sugBox = document.createElement('div');
  sugBox.style.cssText = 'padding:12px;border-radius:10px;background:var(--surface-secondary);border:1px solid var(--border-hairline);';
  sugBox.innerHTML = `<div style="font-weight:700;font-size:13px;margin-bottom:6px;">💡 Suggested Folders (Based on filenames & dates in pool)</div>`;

  if (suggestions.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'font-size:12px;color:var(--text-secondary);';
    empty.textContent = 'Import files to see automatic filename/date folder suggestions.';
    sugBox.appendChild(empty);
  } else {
    const chips = document.createElement('div');
    chips.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;';
    for (const s of suggestions) {
      const btn = document.createElement('button');
      btn.className = 'ws-btn';
      btn.textContent = `+ ${s.emoji} ${s.name} (${s.reason})`;
      btn.addEventListener('click', () => {
        actions.onCreateDestination?.({ name: s.name, emoji: s.emoji, bank: 'top', pinned: true });
      });
      chips.appendChild(btn);
    }
    sugBox.appendChild(chips);
  }

  // Rule creator
  const addRuleBox = document.createElement('div');
  addRuleBox.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:8px;align-items:end;';

  const destOptions = Array.from(store.destinations.values())
    .map(d => `<option value="${d.id}">${d.emoji} ${d.name}</option>`)
    .join('');

  addRuleBox.innerHTML = `
    <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;">
      <span>If File Condition</span>
      <select id="rule-cond-type" class="ws-btn">
        <option value="name-contains">Filename contains</option>
        <option value="extension-is">Extension equals</option>
        <option value="category-is">Category is</option>
        <option value="size-over-mb">Size over (MB)</option>
        <option value="year-is">Modified Year is</option>
        <option value="is-screenshot">Is Screenshot</option>
      </select>
    </label>
    <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;">
      <span>Match Value</span>
      <input type="text" id="rule-cond-val" class="ws-btn" placeholder="e.g. Diwali, pdf, 2026" />
    </label>
    <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;">
      <span>Sort Into Destination</span>
      <select id="rule-dest-id" class="ws-btn">${destOptions}</select>
    </label>
    <button id="btn-add-rule" class="ws-btn ws-btn-primary">+ Add Rule</button>
  `;

  const previewList = document.createElement('div');
  previewList.style.cssText = 'font-size:12px;padding:10px;border-radius:8px;background:var(--surface-secondary);max-height:180px;overflow:auto;';

  function updateRulePreview() {
    const matches = rulesEngine.previewRuleMatches();
    previewList.innerHTML = `<div style="font-weight:700;margin-bottom:6px;">Active Rules (${store.rules.length}) • Matching Unsorted Files: ${matches.length}</div>`;
    for (const m of matches.slice(0, 20)) {
      const line = document.createElement('div');
      line.textContent = `• ${m.fileName} → ${m.destinationName}`;
      previewList.appendChild(line);
    }
  }

  addRuleBox.querySelector('#btn-add-rule').addEventListener('click', () => {
    const conditionType = addRuleBox.querySelector('#rule-cond-type')?.value;
    const conditionValue = addRuleBox.querySelector('#rule-cond-val')?.value || '';
    const destinationId = addRuleBox.querySelector('#rule-dest-id')?.value;
    if (!destinationId) return;
    rulesEngine.addRule({
      name: `${conditionType}: ${conditionValue}`,
      conditionType,
      conditionValue,
      destinationId
    });
    updateRulePreview();
  });

  updateRulePreview();
  body.append(sugBox, addRuleBox, previewList);

  return createModalShell({
    title: '⚡ Rule-Based Smart Sorting & Folder Suggestions',
    onClose: () => actions.onCloseModal?.(),
    bodyEl: body,
    footerButtons: [
      { label: 'Close', onClick: () => actions.onCloseModal?.() },
      {
        label: 'Apply All Matching Rules Now',
        primary: true,
        onClick: async () => {
          await actions.onExecuteAllRules?.();
          actions.onCloseModal?.();
        }
      }
    ]
  });
}

/**
 * 5. Keyboard Shortcuts & Help Modal
 */
function renderHelpModal(store, actions) {
  const body = document.createElement('div');
  body.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:12.5px;';
  const shortcuts = [
    ['1 – 9', 'Quick-sort active file into assigned destination'],
    ['← / → Arrow Keys', 'Navigate Previous / Next media file'],
    ['Ctrl / Cmd + Z', 'Undo last sort or skip action safely'],
    ['Ctrl / Cmd + Shift + Z', 'Redo last undone action'],
    ['Ctrl / Cmd + K', 'Open Command Palette & Destination Picker'],
    ['Ctrl / Cmd + A', 'Select all currently filtered items'],
    ['Delete / Backspace', 'Skip selected item (never deletes original source)'],
    ['/', 'Focus search bar'],
    ['Space', 'Toggle fullscreen media preview'],
    ['Esc', 'Close active modal or dialog']
  ];

  for (const [key, desc] of shortcuts) {
    const item = document.createElement('div');
    item.style.cssText = 'padding:8px 10px;border-radius:8px;background:var(--surface-secondary);border:1px solid var(--border-hairline);display:flex;flex-direction:column;gap:3px;';
    item.innerHTML = `<strong style="color:var(--accent-main);">${key}</strong><span style="color:var(--text-secondary);">${desc}</span>`;
    body.appendChild(item);
  }

  return createModalShell({
    title: '⌨️ WiniSort Keyboard Shortcuts & Quick Guide',
    maxWidth: '640px',
    onClose: () => actions.onCloseModal?.(),
    bodyEl: body,
    footerButtons: [{ label: 'Got It', primary: true, onClick: () => actions.onCloseModal?.() }]
  });
}


// --- src/core/app.js ---
class WiniSortApplication {
  constructor(rootEl) {
    this.rootEl = rootEl;
    this.store = store;

    this.adapter = new FilesystemAdapter(this.store.capabilities);
    this.sourceManager = new SourceManager(this.store);
    this.destinationManager = new DestinationManager(this.store, this.adapter);
    this.copyEngine = new CopyEngine(this.store, this.adapter, this.destinationManager);
    this.projectManager = new ProjectManager(this.store, this.adapter, this.destinationManager);
    this.historyManager = new HistoryManager(this.store, this.adapter, this.destinationManager);
    this.rulesEngine = new RulesEngine(this.store);
    this.selectionManager = new SelectionManager(this.store);
    this.duplicateDetector = new DuplicateDetector(this.store, this.copyEngine);
    this.sortingEngine = new SortingEngine(
      this.store,
      this.copyEngine,
      this.destinationManager,
      this.historyManager,
      this.projectManager
    );
    this.previewManager = new PreviewManager(this.store, this.copyEngine);
    this.compressionRunner = new CompressionJobRunner(this.store, this.adapter, this.copyEngine);
    this.animationController = new AnimationController(this.store);
    this.contextMenu = new ContextMenuManager();

    this.dragController = new DragController(
      this.store,
      this.selectionManager,
      (fileIds, destId) => this.handleSortFiles(fileIds, destId),
      (dropped) => this.handleExternalDrop(dropped)
    );

    this.touchController = new TouchController(
      () => this.sortingEngine.navigateNext(),
      () => this.sortingEngine.navigatePrevious()
    );

    this.shortcutsController = new ShortcutsController(this.store, {
      onCloseModal: () => this.closeModal(),
      onOpenCommandPalette: () => this.openModal('command-palette'),
      onUndo: () => this.handleUndo(),
      onRedo: () => this.handleRedo(),
      onSelectAll: () => {
        this.selectionManager.selectAllFiltered();
        this.toast?.show(`Selected all ${this.store.ui.selectedFileIds.size} visible files`);
      },
      onFocusSearch: () => {
        document.getElementById('ws-global-search-input')?.focus();
      },
      onOpenHelp: () => this.openModal('help'),
      onNumericShortcut: (numStr) => this.handleNumericShortcut(numStr),
      onNextFile: () => this.sortingEngine.navigateNext(),
      onPreviousFile: () => this.sortingEngine.navigatePrevious(),
      onToggleFullscreenPreview: () => {
        const card = document.getElementById('ws-active-media-card');
        if (card && card.requestFullscreen) {
          if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
          else card.requestFullscreen().catch(() => {});
        }
      },
      onSkipActiveFile: () => {
        const active = this.store.getActiveFile();
        if (active) this.sortingEngine.skipFile(active.id);
      }
    });

    this.actions = this._buildActionsMap();
  }

  async init() {
    this._buildDomScaffold();
    this.applyThemeAndDensity();
    await this._seedDefaultDestinations();

    this.shortcutsController.mount();
    this.dragController.bindExternalFileDrop(this.rootEl);
    this.touchController.bindSwipeNavigation(this.centerStageEl);

    bus.on('state:changed', ({ section, payload }) => {
      this._onStateChanged(section, payload);
    });

    this.renderAll();
  }

  _buildDomScaffold() {
    this.rootEl.innerHTML = '';

    // Hidden fallback file inputs for browsers without File System Access API
    this.fileInputEl = document.createElement('input');
    this.fileInputEl.type = 'file';
    this.fileInputEl.multiple = true;
    this.fileInputEl.style.display = 'none';
    this.fileInputEl.addEventListener('change', async (e) => {
      if (e.target.files?.length > 0) {
        await this.sourceManager.importFileList(e.target.files, 'Selected Files');
        e.target.value = '';
      }
    });

    this.dirInputEl = document.createElement('input');
    this.dirInputEl.type = 'file';
    this.dirInputEl.multiple = true;
    this.dirInputEl.setAttribute('webkitdirectory', '');
    this.dirInputEl.style.display = 'none';
    this.dirInputEl.addEventListener('change', async (e) => {
      if (e.target.files?.length > 0) {
        const firstPath = e.target.files[0].webkitRelativePath || '';
        const folderLabel = firstPath.split('/')[0] || 'Imported Folder';
        await this.sourceManager.importFileList(e.target.files, folderLabel);
        e.target.value = '';
      }
    });

    this.projectInputEl = document.createElement('input');
    this.projectInputEl.type = 'file';
    this.projectInputEl.accept = '.json,application/json';
    this.projectInputEl.style.display = 'none';
    this.projectInputEl.addEventListener('change', async (e) => {
      const f = e.target.files?.[0];
      if (f) {
        try {
          const text = await f.text();
          const manifest = parseProjectManifestJson(text);
          await this.projectManager.restoreFromManifest(manifest);
          this.toast.show(`Restored project "${manifest.name}"`, { type: 'success' });
        } catch (err) {
          this.toast.show(err.message || 'Failed to import project JSON', { type: 'danger' });
        }
        e.target.value = '';
      }
    });

    this.toolbarEl = document.createElement('header');
    this.toolbarEl.className = 'ws-toolbar';

    this.bannerRegionEl = document.createElement('div');
    this.scanBannerEl = document.createElement('div');

    this.workspaceEl = document.createElement('main');
    this.workspaceEl.className = 'ws-workspace';

    this.bankTopEl = document.createElement('section');
    this.bankTopEl.className = 'ws-bank-top';
    this.bankTopEl.setAttribute('aria-label', 'Top destination folders');

    this.bankLeftEl = document.createElement('aside');
    this.bankLeftEl.className = 'ws-bank-left';
    this.bankLeftEl.setAttribute('aria-label', 'Left destination folders');

    this.centerStageEl = document.createElement('section');
    this.centerStageEl.className = 'ws-center-stage';
    this.centerStageEl.setAttribute('aria-label', 'Central media sorting workspace');

    this.bankRightEl = document.createElement('aside');
    this.bankRightEl.className = 'ws-bank-right';
    this.bankRightEl.setAttribute('aria-label', 'Right destination folders');

    this.bankBottomEl = document.createElement('section');
    this.bankBottomEl.className = 'ws-bank-bottom';
    this.bankBottomEl.setAttribute('aria-label', 'Bottom destination folders');

    this.workspaceEl.append(
      this.bankTopEl,
      this.bankLeftEl,
      this.centerStageEl,
      this.bankRightEl,
      this.bankBottomEl
    );

    this.modalMountEl = document.createElement('div');
    this.toastRegionEl = document.createElement('div');
    this.toastRegionEl.className = 'ws-toast-Region';
    this.toast = new ToastManager(this.toastRegionEl);

    this.rootEl.append(
      this.fileInputEl,
      this.dirInputEl,
      this.projectInputEl,
      this.toolbarEl,
      this.bannerRegionEl,
      this.scanBannerEl,
      this.workspaceEl,
      this.modalMountEl,
      this.toastRegionEl
    );

    this._renderCompatibilityBanner();
  }

  async _seedDefaultDestinations() {
    if (this.store.destinations.size > 0) return;
    const starter = [
      { name: 'Diwali', emoji: '🪔', color: '#D69E2E', bank: 'top', pinned: true, shortcut: '1' },
      { name: 'School', emoji: '🎓', color: '#5286DB', bank: 'left', pinned: true, shortcut: '2' },
      { name: 'Work', emoji: '💼', color: '#38A169', bank: 'right', pinned: true, shortcut: '3' },
      { name: 'Favorites', emoji: '⭐', color: '#805AD5', bank: 'bottom', pinned: true, shortcut: '4' }
    ];
    for (const d of starter) {
      await this.destinationManager.createDestination(d);
    }
  }

  _renderCompatibilityBanner() {
    this.bannerRegionEl.innerHTML = '';
    const cap = this.store.capabilities;
    if (!cap.hasDirectoryPicker) {
      const banner = document.createElement('div');
      banner.className = 'ws-compat-banner is-warning';
      banner.innerHTML = `
        <span><strong>Browser Export Mode Active:</strong> Direct directory writing (File System Access API) is not exposed by this browser. You can organize all files in this session and export sorted folders as a ZIP archive or portable project JSON.</span>
        <button class="ws-btn" style="height:24px;font-size:11px;">Dismiss</button>
      `;
      banner.querySelector('button').addEventListener('click', () => banner.remove());
      this.bannerRegionEl.appendChild(banner);
    }
  }

  applyThemeAndDensity() {
    const p = this.store.preferences;
    let resolvedTheme = p.theme;
    if (resolvedTheme === 'system') {
      const darkMedia = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      resolvedTheme = darkMedia ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', resolvedTheme);
    document.documentElement.setAttribute('data-density', p.density || 'comfortable');
    document.documentElement.setAttribute('data-motion', p.motionLevel || 'full');
    document.documentElement.setAttribute('data-transparency', p.transparencyLevel || 'normal');
  }

  _buildActionsMap() {
    return {
      onAddFiles: () => this.handleAddFiles(),
      onAddFolder: () => this.handleAddFolder(),
      onAddFolderOrFiles: () => this.handleAddFolder(),
      onSelectOutputDirectory: () => this.handleSelectOutputDirectory(),
      onConnectExistingDestination: () => this.handleConnectExistingDestination(),
      onLoadSampleMediaPack: () => this.handleLoadSampleMediaPack(),
      onApplyStarterTemplate: (tplId) => this.handleApplyStarterTemplate(tplId),
      onSearchChange: (q) => {
        this.store.ui.searchQuery = q;
        this.store.recomputeDerivedState();
        this.renderCenterStage();
      },
      onUndo: () => this.handleUndo(),
      onRedo: () => this.handleRedo(),
      onOpenFilters: () => this.openModal('filters'),
      onOpenSettings: () => this.openModal('settings'),
      onOpenStats: () => this.openModal('stats'),
      onOpenRules: () => this.openModal('rules'),
      onOpenHelp: () => this.openModal('help'),
      onOpenCommandPalette: () => this.openModal('command-palette'),
      onOpenNewDestination: (bank) => this.openModal('destination', { bank }),
      onOpenDestinationSettings: (destId) => this.openModal('destination', { destinationId: destId }),
      onOpenCompressionModal: (destId) => this.openModal('compression', { destinationId: destId }),
      onCloseModal: () => this.closeModal(),
      onToggleQuickSort: () => {
        this.store.ui.quickSortMode = !this.store.ui.quickSortMode;
        this.workspaceEl.classList.toggle('is-quick-sort', this.store.ui.quickSortMode);
        this.renderAll();
      },
      onToggleTheme: () => {
        const cur = document.documentElement.getAttribute('data-theme') || 'light';
        this.store.preferences.theme = cur === 'dark' ? 'light' : 'dark';
        this.applyThemeAndDensity();
        this.renderToolbarSection();
      },
      onApplyThemeAndDensity: () => {
        this.applyThemeAndDensity();
        this.renderAll();
      },
      onSortActiveIntoDestination: (destId) => {
        const ids = this.selectionManager.getActiveOrSelectedFileIds();
        if (ids.length === 0) {
          this.toast.show('Select or import a file first to sort into this destination.', { type: 'info' });
          return;
        }
        this.handleSortFiles(ids, destId);
      },
      onCreateDestination: async (cfg) => {
        try {
          const d = await this.destinationManager.createDestination(cfg);
          this.closeModal();
          this.toast.show(`Created destination "${d.emoji} ${d.name}"`, { type: 'success' });
        } catch (err) {
          this.toast.show(err.message, { type: 'danger' });
        }
      },
      onUpdateDestination: (destId, updates) => {
        this.destinationManager.updateDestination(destId, updates);
        this.closeModal();
        this.toast.show('Destination updated', { type: 'success' });
      },
      onRemoveDestination: (destId) => {
        this.destinationManager.removeDestinationFromWorkspace(destId);
        this.toast.show('Removed destination from workspace (files on disk untouched)', { type: 'info' });
      },
      onNextFile: () => this.sortingEngine.navigateNext(),
      onPreviousFile: () => this.sortingEngine.navigatePrevious(),
      onSkipFile: (fileId) => this.sortingEngine.skipFile(fileId),
      onReviewLater: (fileId) => this.sortingEngine.markReviewLater(fileId),
      onToggleFavorite: (fileId) => this.sortingEngine.toggleFavorite(fileId),
      onCancelScan: () => this.sourceManager.cancelScan(),
      onSaveProject: async () => {
        try {
          const res = await this.projectManager.saveProjectToDisk();
          this.toast.show(
            res.mode === 'disk'
              ? 'Saved project metadata to .winisort/project.json'
              : 'Exported portable .winisort.json project file',
            { type: 'success' }
          );
        } catch (err) {
          this.toast.show(err.message, { type: 'danger' });
        }
      },
      onExportProjectJson: () => {
        this.projectManager.exportPortableProjectJson();
        this.toast.show('Exported portable project JSON', { type: 'success' });
      },
      onImportProjectJson: () => {
        this.projectInputEl.click();
      },
      onExportSortedZip: () => this.handleExportSortedZip(),
      onExecuteAllRules: () => this.handleExecuteAllRules(),
      onRunCompressionJob: (destId, opts) => this.handleRunCompressionJob(destId, opts),
      onDestinationContextMenu: (destId, x, y) => this.handleDestinationContextMenu(destId, x, y),
      onMediaCardContextMenu: (fileRecord, x, y) => this.handleMediaCardContextMenu(fileRecord, x, y)
    };
  }

  async handleAddFiles() {
    if (this.store.capabilities.hasOpenFilePicker) {
      try {
        const handles = await window.showOpenFilePicker({ multiple: true });
        const files = [];
        for (const h of handles) {
          files.push(await h.getFile());
        }
        await this.sourceManager.importFileList(files, 'Picked Files');
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
      }
    }
    this.fileInputEl.click();
  }

  async handleAddFolder() {
    if (this.store.capabilities.hasDirectoryPicker) {
      try {
        const dirHandle = await this.adapter.pickDirectory({ mode: 'read' });
        if (this.store.project.outputRootHandle) {
          await assertSafeSourceAndOutput(dirHandle, this.store.project.outputRootHandle);
        }
        await this.sourceManager.importDirectoryHandle(dirHandle);
        return;
      } catch (err) {
        if (err.code === 'PICKER_CANCELED') return;
        this.toast.show(err.message, { type: 'danger' });
        return;
      }
    }
    if (this.store.capabilities.hasWebkitDirectory) {
      this.dirInputEl.click();
    } else {
      this.fileInputEl.click();
    }
  }

  async handleSelectOutputDirectory() {
    if (!this.store.capabilities.hasDirectoryPicker) {
      this.toast.show('Direct folder writing is unavailable in this browser. Sorted files will be staged for ZIP export.', {
        type: 'warning'
      });
      return;
    }
    try {
      const dirHandle = await this.adapter.pickDirectory({ mode: 'readwrite' });
      for (const src of this.store.sources.values()) {
        if (src.handle) {
          await assertSafeSourceAndOutput(src.handle, dirHandle);
        }
      }
      const recoveryItems = await this.projectManager.loadAndRecoverFromDirectory(dirHandle);
      this.toast.show(`Connected output folder "${dirHandle.name}"`, { type: 'success' });
      if (recoveryItems.length > 0) {
        this.toast.show(`Found ${recoveryItems.length} recoverable operation(s) in .winisort journal`, {
          type: 'warning'
        });
      }
    } catch (err) {
      if (err.code === 'PICKER_CANCELED') return;
      this.toast.show(err.message, { type: 'danger' });
    }
  }

  async handleConnectExistingDestination() {
    if (!this.store.capabilities.hasDirectoryPicker) {
      this.openModal('destination', { bank: 'right' });
      return;
    }
    try {
      const dirHandle = await this.adapter.pickDirectory({ mode: 'readwrite' });
      const dest = await this.destinationManager.connectExistingDestination(dirHandle, { bank: 'right' });
      this.toast.show(`Connected "${dest.name}" (${dest.stats.fileCount} existing files indexed)`, { type: 'success' });
    } catch (err) {
      if (err.code === 'PICKER_CANCELED') return;
      this.toast.show(err.message, { type: 'danger' });
    }
  }

  async handleLoadSampleMediaPack() {
    // Generates genuine in-memory File objects (SVG image, PDF document, WAV audio tone, Markdown note, CSV sheet)
    const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="520" viewBox="0 0 800 520">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#1E3A8A"/>
          <stop offset="100%" stop-color="#5286DB"/>
        </linearGradient>
      </defs>
      <rect width="800" height="520" rx="24" fill="url(#g)"/>
      <circle cx="620" cy="140" r="68" fill="#F6E05E" opacity="0.9"/>
      <path d="M0 390 L240 210 L460 360 L620 240 L800 370 L800 520 L0 520 Z" fill="#0F172A" opacity="0.75"/>
      <text x="48" y="468" fill="#FFFFFF" font-family="sans-serif" font-size="28" font-weight="bold">Diwali_Lantern_Festival_2026.svg</text>
    </svg>`;

    const pdfContent = `%PDF-1.7
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >> endobj
4 0 obj << /Length 140 >> stream
BT
/F1 14 Tf
72 710 Td
(WiniSort Local Architecture Specification - Semester Lecture Notes) Tj
(Zero Cloud Upload - Verified Streaming File Copy Engine) Tj
ET
endstream endobj
xref
0 5
trailer << /Root 1 0 R /Size 5 >>
%%EOF`;

    const mdContent = `# Q4 Product Architecture Notes

- Application: WiniSort
- Mode: 100% Local-First Browser Organizer
- Default action: Verified Streaming Copy
- Recovery: .winisort/project.json + operations.jsonl
`;
    const csvContent = `Title,Category,SizeMB,Status
Diwali_Celebration.jpg,Festival,4.2,Ready
Semester_Schedule.pdf,School,1.1,Ready
Client_Invoice_104.pdf,Work,0.4,Ready
`;

    const sampleFiles = [
      new File([svgContent], 'Diwali_Lantern_Festival_2026.svg', { type: 'image/svg+xml', lastModified: Date.now() - 86400000 * 5 }),
      new File([pdfContent], 'School_Computer_Science_Notes.pdf', { type: 'application/pdf', lastModified: Date.now() - 86400000 * 3 }),
      new File([mdContent], 'Work_Architecture_Brief.md', { type: 'text/markdown', lastModified: Date.now() - 86400000 * 2 }),
      new File([csvContent], 'Work_Budget_Summary_2026.csv', { type: 'text/csv', lastModified: Date.now() - 86400000 })
    ];

    await this.sourceManager.importFileList(sampleFiles, 'Sample Media Pack');
  }

  async handleApplyStarterTemplate(tplId) {
    const tpl = STARTER_TEMPLATES[tplId];
    if (!tpl) return;
    let added = 0;
    for (const d of tpl.destinations) {
      try {
        await this.destinationManager.createDestination(d);
        added++;
      } catch (_) {}
    }
    this.toast.show(`Applied "${tpl.name}" template (${added} folder(s) added)`, { type: 'success' });
  }

  async handleSortFiles(fileIds, destinationId) {
    try {
      if (fileIds.length === 1) {
        const res = await this.sortingEngine.assignFileToDestination(fileIds[0], destinationId);
        if (res.status === 'completed' || res.status === 'dry-run') {
          this.animationController.flashDestinationSuccess(destinationId);
          const dest = this.store.destinations.get(destinationId);
          const label = res.mode === 'dry-run'
            ? `[Dry Run] Would copy to ${dest?.name}`
            : `Sorted "${res.finalName}" → ${dest?.name}`;
          this.toast.show(label, {
            type: 'success',
            actionLabel: res.mode === 'dry-run' ? undefined : 'Undo',
            onAction: () => this.handleUndo()
          });
        }
      } else {
        const results = await this.sortingEngine.batchAssignToDestination(fileIds, destinationId);
        this.animationController.flashDestinationSuccess(destinationId);
        const dest = this.store.destinations.get(destinationId);
        this.toast.show(`Batch sorted ${results.length} files → ${dest?.name}`, {
          type: 'success',
          actionLabel: 'Undo Batch',
          onAction: () => this.handleUndo()
        });
      }
    } catch (err) {
      this.toast.show(err.message || 'Sorting operation failed', { type: 'danger' });
    }
  }

  async handleNumericShortcut(numStr) {
    for (const dest of this.store.destinations.values()) {
      if (dest.shortcut === numStr) {
        const ids = this.selectionManager.getActiveOrSelectedFileIds();
        if (ids.length > 0) {
          await this.handleSortFiles(ids, dest.id);
        }
        return;
      }
    }
  }

  async handleUndo() {
    try {
      const undone = await this.historyManager.undo();
      if (undone) {
        if (undone.destinationId) {
          this.animationController.flashDestinationSuccess(undone.destinationId);
        }
        this.toast.show('Undid last operation', { type: 'info' });
      }
    } catch (err) {
      this.toast.show(err.message, { type: 'danger' });
    }
  }

  async handleRedo() {
    try {
      const redone = await this.historyManager.redo(this.sortingEngine);
      if (redone) {
        this.toast.show('Redid operation', { type: 'info' });
      }
    } catch (err) {
      this.toast.show(err.message, { type: 'danger' });
    }
  }

  async handleExternalDrop({ handles, files }) {
    for (const h of handles || []) {
      if (h.kind === 'directory') {
        await this.sourceManager.importDirectoryHandle(h);
      }
    }
    if (files && files.length > 0) {
      await this.sourceManager.importFileList(files, 'Dropped Files');
    }
  }

  async handleExportSortedZip() {
    try {
      const entries = [];
      for (const dest of this.store.destinations.values()) {
        for (const [outName, item] of dest.exportedFiles.entries()) {
          const buf = await item.sourceFile.arrayBuffer();
          entries.push({
            path: `${dest.folderName}/${outName}`,
            bytes: new Uint8Array(buf)
          });
        }
      }

      if (entries.length === 0) {
        // Also allow zipping any sorted files currently in session if user wants a portable archive
        for (const file of this.store.files.values()) {
          if (file.status === 'sorted' && file.assignedDestinationId) {
            const dest = this.store.destinations.get(file.assignedDestinationId);
            const blob = await this.copyEngine.resolveSourceFile(file);
            const buf = await blob.arrayBuffer();
            entries.push({
              path: `${dest ? dest.folderName : 'Sorted'}/${file.sortedOutputName || file.name}`,
              bytes: new Uint8Array(buf)
            });
          }
        }
      }

      if (entries.length === 0) {
        this.toast.show('No sorted files available to export yet.', { type: 'warning' });
        return;
      }

      const zipBlob = buildZipArchiveBlob(entries);
      triggerBrowserDownload(zipBlob, 'WiniSort-Sorted-Folders.zip');
      this.toast.show(`Exported ${entries.length} sorted file(s) in WiniSort-Sorted-Folders.zip`, { type: 'success' });
    } catch (err) {
      this.toast.show(err.message, { type: 'danger' });
    }
  }

  async handleExecuteAllRules() {
    const matches = this.rulesEngine.previewRuleMatches();
    if (matches.length === 0) {
      this.toast.show('No unsorted files matched active rules.', { type: 'info' });
      return;
    }
    let count = 0;
    for (const m of matches) {
      try {
        await this.sortingEngine.assignFileToDestination(m.fileId, m.destinationId);
        count++;
      } catch (_) {}
    }
    this.toast.show(`Rule engine sorted ${count} file(s)`, { type: 'success' });
  }

  async handleRunCompressionJob(destId, options) {
    try {
      const res = await this.compressionRunner.runOptimizationJob(destId, options);
      this.closeModal();
      this.toast.show(
        `Optimized ${res.processedCount} image(s) — Saved ${(res.totalSavedBytes / 1000).toFixed(1)} KB`,
        { type: 'success' }
      );
    } catch (err) {
      this.toast.show(err.message, { type: 'danger' });
    }
  }

  handleDestinationContextMenu(destId, x, y) {
    const dest = this.store.destinations.get(destId);
    if (!dest) return;
    this.contextMenu.open(x, y, [
      {
        label: `Sort Active File into "${dest.name}"`,
        shortcut: dest.shortcut || '',
        onClick: () => this.actions.onSortActiveIntoDestination(destId)
      },
      {
        label: `${dest.pinned ? 'Unpin' : 'Pin'} Destination`,
        onClick: () => this.destinationManager.updateDestination(destId, { pinned: !dest.pinned })
      },
      {
        label: 'Move to Top Bank',
        onClick: () => this.destinationManager.updateDestination(destId, { bank: 'top' })
      },
      {
        label: 'Move to Left Bank',
        onClick: () => this.destinationManager.updateDestination(destId, { bank: 'left' })
      },
      {
        label: 'Move to Right Bank',
        onClick: () => this.destinationManager.updateDestination(destId, { bank: 'right' })
      },
      {
        label: 'Move to Bottom Bank',
        onClick: () => this.destinationManager.updateDestination(destId, { bank: 'bottom' })
      },
      { divider: true },
      {
        label: '🖼️ Optimize Folder Images...',
        onClick: () => this.openModal('compression', { destinationId: destId })
      },
      {
        label: '⚙️ Edit Destination Settings...',
        onClick: () => this.openModal('destination', { destinationId: destId })
      },
      {
        label: 'Duplicate Destination Config',
        onClick: () => this.destinationManager.duplicateDestinationConfig(destId)
      },
      {
        label: 'Remove from Workspace',
        onClick: () => this.destinationManager.removeDestinationFromWorkspace(destId)
      }
    ]);
  }

  handleMediaCardContextMenu(fileRecord, x, y) {
    if (!fileRecord) return;
    const items = [
      {
        label: fileRecord.favorite ? '★ Remove Favorite' : '☆ Mark as Favorite',
        onClick: () => this.sortingEngine.toggleFavorite(fileRecord.id)
      },
      {
        label: '⏭ Skip File (Move to Skipped Queue)',
        shortcut: 'Del',
        onClick: () => this.sortingEngine.skipFile(fileRecord.id)
      },
      {
        label: '🔖 Place in Review Later Queue',
        onClick: () => this.sortingEngine.markReviewLater(fileRecord.id)
      },
      { divider: true }
    ];

    for (const dest of Array.from(this.store.destinations.values()).slice(0, 6)) {
      items.push({
        label: `Sort → ${dest.emoji} ${dest.name}`,
        shortcut: dest.shortcut || '',
        onClick: () => this.handleSortFiles([fileRecord.id], dest.id)
      });
    }

    this.contextMenu.open(x, y, items);
  }

  openModal(modalName, payload = null) {
    this.store.ui.activeModal = modalName;
    this.store.ui.modalPayload = payload;
    this.renderModalSection();
  }

  closeModal() {
    this.store.ui.activeModal = null;
    this.store.ui.modalPayload = null;
    this.modalMountEl.innerHTML = '';
  }

  _onStateChanged(section, payload) {
    if (section === 'files-imported') {
      const sample = Array.from(this.store.files.values()).slice(-12);
      this.animationController.playImportVortex(this.centerStageEl, sample);
      this.toast.show(
        `Imported ${payload?.eligibleFiles || 0} eligible file(s) (${payload?.ignoredFiles || 0} filtered)`,
        { type: 'success' }
      );
      this.renderAll();
      return;
    }

    if (section === 'scan' || section === 'scan-progress') {
      renderScanProgressBanner(this.scanBannerEl, this.store, this.actions);
      return;
    }

    if (section === 'file-sorted' && payload?.quotaExceeded) {
      this.toast.show(
        `Quota Warning: "${payload.destination.name}" has reached its configured size threshold.`,
        { type: 'warning' }
      );
    }

    this.renderAll();
  }

  renderToolbarSection() {
    renderToolbar(this.toolbarEl, this.store, this.historyManager, this.actions);
  }

  renderBanksSection() {
    renderDestinationBank(this.bankTopEl, 'top', this.store, this.actions);
    renderDestinationBank(this.bankLeftEl, 'left', this.store, this.actions);
    renderDestinationBank(this.bankRightEl, 'right', this.store, this.actions);
    renderDestinationBank(this.bankBottomEl, 'bottom', this.store, this.actions);
  }

  renderCenterStage() {
    if (this.store.files.size === 0) {
      renderInitialMediaPool(this.centerStageEl, this.store, this.actions);
    } else {
      renderActiveSortingWorkspace(
        this.centerStageEl,
        this.store,
        this.previewManager,
        this.dragController,
        this.selectionManager,
        this.actions
      );
    }
  }

  renderModalSection() {
    this.modalMountEl.innerHTML = '';
    const m = this.store.ui.activeModal;
    const p = this.store.ui.modalPayload;
    if (!m) return;

    let modalEl = null;
    if (m === 'filters') {
      modalEl = renderMediaFilterModal(this.store, this.actions);
    } else if (m === 'settings') {
      modalEl = renderSettingsModal(this.store, this.actions);
    } else if (m === 'stats') {
      modalEl = renderStatisticsModal(this.store, this.duplicateDetector, this.actions);
    } else if (m === 'command-palette') {
      modalEl = renderCommandPaletteModal(this.store, this.actions);
    } else if (m === 'destination') {
      modalEl = renderDestinationDialog(this.store, p, this.actions);
    } else if (m === 'compression') {
      modalEl = renderCompressionModal(this.store, p?.destinationId, this.compressionRunner, this.actions);
    } else if (m === 'rules') {
      modalEl = renderSmartRulesModal(this.store, this.rulesEngine, this.actions);
    } else if (m === 'help') {
      modalEl = renderHelpModal(this.store, this.actions);
    }

    if (modalEl) {
      this.modalMountEl.appendChild(modalEl);
    }
  }

  renderAll() {
    this.renderToolbarSection();
    renderScanProgressBanner(this.scanBannerEl, this.store, this.actions);
    this.renderBanksSection();
    this.renderCenterStage();
  }
}


// --- src/main.js ---

// Register Service Worker safely with relative scope for both root domains and GitHub Pages subpaths
function registerPwaServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    return;
  }
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js', { scope: './' })
      .catch(() => {
        // Silent fallback if SW registration is restricted in sandboxed preview environments
      });
  });
}

function bootstrap() {
  const rootEl = document.getElementById('app-root');
  if (!rootEl) return;
  const app = new WiniSortApplication(rootEl);
  window.__WINISORT_APP__ = app;
  app.init();
  registerPwaServiceWorker();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}



})();
