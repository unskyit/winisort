/**
 * Runtime feature and capability detector using progressive enhancement (zero browser-name assumptions).
 * @param {Window|typeof globalThis} [env=globalThis]
 */
export function detectCapabilities(env = globalThis) {
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
