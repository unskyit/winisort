import { ThumbnailCache } from './thumbnail-cache.js';
import { renderImagePreview } from './image-preview.js';
import { renderVideoPreview } from './video-preview.js';
import { renderAudioPreview } from './audio-preview.js';
import { renderPdfPreview } from './pdf-preview.js';
import { renderGenericOrTextPreview } from './generic-preview.js';

export class PreviewManager {
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
