import { checkCompressionEligibility, compressImageBlob } from './image-compressor.js';
import { splitFilename } from '../filesystem/collision-handler.js';

/**
 * Runs a sequential, non-destructive folder optimization job across eligible images in a destination.
 * By default writes optimized images into an `Optimized/` subfolder so existing originals are preserved.
 */
export class CompressionJobRunner {
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
