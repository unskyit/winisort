export const ErrorCode = Object.freeze({
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

export class WiniSortError extends Error {
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
export function normalizeError(err, fallbackContext = 'Filesystem operation') {
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
