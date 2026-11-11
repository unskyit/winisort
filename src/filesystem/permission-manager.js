import { WiniSortError, ErrorCode } from '../core/errors.js';

/**
 * Verifies or requests read or readwrite permission on a FileSystemHandle.
 * @param {FileSystemHandle} handle
 * @param {'read' | 'readwrite'} [mode='read']
 * @param {boolean} [requestIfPrompt=true]
 * @returns {Promise<boolean>}
 */
export async function verifyHandlePermission(handle, mode = 'read', requestIfPrompt = true) {
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
export async function checkDirectoryRelationship(dirA, dirB) {
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
export async function assertSafeSourceAndOutput(sourceHandle, outputHandle) {
  const rel = await checkDirectoryRelationship(sourceHandle, outputHandle);
  if (rel.same) {
    throw new WiniSortError(
      ErrorCode.SOURCE_DEST_ALIAS,
      'Source folder and Output folder cannot be the exact same directory. Please choose a dedicated output folder to protect original files.',
      { recoverable: true, actions: ['Select Different Folder', 'Cancel'] }
    );
  }
}
