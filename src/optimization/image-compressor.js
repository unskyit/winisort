const MAX_SAFE_IMAGE_PIXELS = 64 * 1024 * 1024; // 64 Megapixels safe browser decode ceiling

/**
 * Checks whether an image file is eligible for safe browser-side canvas optimization.
 * Never alters videos, audio, PDFs, or documents.
 * @param {{ name: string, category: string, extension: string, size: number }} fileRecord
 * @returns {{ eligible: boolean, reason?: string }}
 */
export function checkCompressionEligibility(fileRecord) {
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
export async function compressImageBlob(sourceBlob, options = {}) {
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
