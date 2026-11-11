import { compressImageBlob } from './image-compressor.js';

/**
 * Generates a side-by-side Before / After preview for a sample image in a destination.
 */
export async function generateCompressionSamplePreview(sourceBlob, options = {}) {
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
