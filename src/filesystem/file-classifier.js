import { MEDIA_CATEGORIES } from '../core/configuration.js';

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
export function extractExtension(filename) {
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
export function classifyFile(fileLike) {
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
export function evaluateFileEligibility(fileInfo, filters) {
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
