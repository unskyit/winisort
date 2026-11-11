self.onmessage = async (event) => {
  const { id, blob, quality = 0.84, format = 'image/webp' } = event.data || {};
  try {
    if (typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap === 'function') {
      const bmp = await createImageBitmap(blob);
      const canvas = new OffscreenCanvas(bmp.width, bmp.height);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bmp, 0, 0);
      bmp.close();
      const outBlob = await canvas.convertToBlob({ type: format, quality });
      self.postMessage({ id, ok: true, blob: outBlob });
    } else {
      self.postMessage({ id, ok: true, blob });
    }
  } catch (err) {
    self.postMessage({ id, ok: false, error: err.message });
  }
};
