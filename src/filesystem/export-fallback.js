import { WiniSortError, ErrorCode } from '../core/errors.js';

const MAX_SAFE_ZIP_BYTES = 350 * 1024 * 1024; // 350 MB safe browser memory budget per ZIP batch

// CRC32 Lookup Table for valid standard ZIP archive creation without external dependencies
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ bytes[i]) & 0xFF];
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

/**
 * Builds an uncompressed (STORE) standard PKZIP Blob from a list of { path, data: Uint8Array } entries.
 * Used in browsers without File System Access API so users can download organized folder hierarchies.
 * @param {Array<{ path: string, bytes: Uint8Array }>} entries
 * @returns {Blob}
 */
export function buildZipArchiveBlob(entries) {
  let totalPayloadBytes = 0;
  for (const entry of entries) {
    totalPayloadBytes += entry.bytes.byteLength;
  }
  if (totalPayloadBytes > MAX_SAFE_ZIP_BYTES) {
    throw new WiniSortError(
      ErrorCode.ZIP_BUDGET_EXCEEDED,
      `ZIP export exceeds safe browser memory limit (${Math.round(totalPayloadBytes / 1e6)} MB). Please export in smaller batches.`,
      { recoverable: true, actions: ['Export Batch', 'Cancel'] }
    );
  }

  const encoder = new TextEncoder();
  const fileRecords = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.path.replace(/^\/+/, ''));
    const data = entry.bytes;
    const crc = crc32(data);
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const view = new DataView(localHeader.buffer);

    view.setUint32(0, 0x04034b50, true); // Local file header signature
    view.setUint16(4, 20, true); // Version needed
    view.setUint16(6, 0x0800, true); // UTF-8 flag
    view.setUint16(8, 0, true); // Compression method 0 (STORE)
    view.setUint16(10, 0, true); // Mod time
    view.setUint16(12, 0x21, true); // Mod date
    view.setUint32(14, crc, true);
    view.setUint32(18, data.byteLength, true);
    view.setUint32(22, data.byteLength, true);
    view.setUint16(26, nameBytes.length, true);
    view.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    fileRecords.push({
      nameBytes,
      data,
      crc,
      localHeader,
      offset
    });

    offset += localHeader.byteLength + data.byteLength;
  }

  const centralParts = [];
  let centralSize = 0;

  for (const rec of fileRecords) {
    const cd = new Uint8Array(46 + rec.nameBytes.length);
    const view = new DataView(cd.buffer);
    view.setUint32(0, 0x02014b50, true); // Central directory signature
    view.setUint16(4, 20, true);
    view.setUint16(6, 20, true);
    view.setUint16(8, 0x0800, true);
    view.setUint16(10, 0, true);
    view.setUint16(12, 0, true);
    view.setUint16(14, 0x21, true);
    view.setUint32(16, rec.crc, true);
    view.setUint32(20, rec.data.byteLength, true);
    view.setUint32(24, rec.data.byteLength, true);
    view.setUint16(28, rec.nameBytes.length, true);
    view.setUint16(30, 0, true);
    view.setUint16(32, 0, true);
    view.setUint16(34, 0, true);
    view.setUint16(36, 0, true);
    view.setUint32(38, 0, true);
    view.setUint32(42, rec.offset, true);
    cd.set(rec.nameBytes, 46);
    centralParts.push(cd);
    centralSize += cd.byteLength;
  }

  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(4, 0, true);
  eocdView.setUint16(6, 0, true);
  eocdView.setUint16(8, fileRecords.length, true);
  eocdView.setUint16(10, fileRecords.length, true);
  eocdView.setUint32(12, centralSize, true);
  eocdView.setUint32(16, offset, true);
  eocdView.setUint16(20, 0, true);

  const blobParts = [];
  for (const rec of fileRecords) {
    blobParts.push(rec.localHeader, rec.data);
  }
  for (const cd of centralParts) {
    blobParts.push(cd);
  }
  blobParts.push(eocd);

  return new Blob(blobParts, { type: 'application/zip' });
}

/**
 * Triggers a browser file download cleanly.
 * @param {Blob} blob
 * @param {string} filename
 */
export function triggerBrowserDownload(blob, filename) {
  if (typeof document === 'undefined') return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1500);
}
