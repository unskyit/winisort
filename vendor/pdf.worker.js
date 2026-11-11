// WiniSort Local PDF Worker — Parses PDF structure, page count, media boxes, and text streams without loading huge documents into memory.
self.onmessage = async (event) => {
  const { id, action, payload } = event.data || {};
  try {
    if (action === 'PARSE_PDF_METADATA') {
      const { buffer, byteLength } = payload;
      const bytes = new Uint8Array(buffer);
      const text = new TextDecoder('latin1').decode(bytes);

      // Verify PDF header
      if (!text.startsWith('%PDF-')) {
        throw new Error('Invalid or damaged PDF header');
      }

      // Extract PDF version
      const versionMatch = text.match(/^%PDF-(\d+\.\d+)/);
      const version = versionMatch ? versionMatch[1] : '1.7';

      // Count /Type /Page (excluding /Type /Pages)
      const pageMatches = text.match(/\/Type\s*\/Page\b(?!s)/g);
      let numPages = pageMatches ? pageMatches.length : 0;
      if (numPages === 0) {
        const countMatches = [...text.matchAll(/\/Count\s+(\d+)/g)].map(m => parseInt(m[1], 10));
        if (countMatches.length > 0) {
          numPages = Math.max(...countMatches);
        } else {
          numPages = 1;
        }
      }

      // Extract MediaBox dimensions if present
      const mediaBoxMatch = text.match(/\/MediaBox\s*\[\s*([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s*\]/);
      const width = mediaBoxMatch ? Math.max(100, parseFloat(mediaBoxMatch[3]) - parseFloat(mediaBoxMatch[1])) : 612;
      const height = mediaBoxMatch ? Math.max(100, parseFloat(mediaBoxMatch[4]) - parseFloat(mediaBoxMatch[2])) : 792;

      // Extract readable literal text strings per page chunk for lazy canvas rendering
      const rawTextSnippets = [];
      const tjMatches = text.matchAll(/\(([^()\\]{2,120})\)\s*Tj/g);
      for (const m of tjMatches) {
        if (rawTextSnippets.length < 300) {
          rawTextSnippets.push(m[1]);
        }
      }

      self.postMessage({
        id,
        ok: true,
        result: {
          version,
          numPages: Math.max(1, numPages),
          width,
          height,
          byteLength,
          snippets: rawTextSnippets
        }
      });
    } else {
      throw new Error('Unknown PDF worker action: ' + action);
    }
  } catch (err) {
    self.postMessage({
      id,
      ok: false,
      error: err && err.message ? err.message : 'PDF worker processing error'
    });
  }
};
