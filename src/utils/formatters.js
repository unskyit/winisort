const IEC_UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
const SI_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

/**
 * Formats a byte count into human-readable SI (MB/GB) or IEC (MiB/GiB) units.
 * @param {number} bytes
 * @param {{ mode?: 'SI' | 'IEC', decimals?: number }} [options]
 * @returns {string}
 */
export function formatBytes(bytes, options = {}) {
  const num = Number(bytes);
  if (!Number.isFinite(num) || num < 0) return '0 B';
  if (num === 0) return '0 B';

  const mode = options.mode === 'IEC' ? 'IEC' : 'SI';
  const base = mode === 'IEC' ? 1024 : 1000;
  const units = mode === 'IEC' ? IEC_UNITS : SI_UNITS;
  const decimals = typeof options.decimals === 'number' ? options.decimals : 1;

  const exp = Math.min(Math.floor(Math.log(num) / Math.log(base)), units.length - 1);
  if (exp === 0) return `${Math.round(num)} B`;
  const val = num / Math.pow(base, exp);
  return `${val.toFixed(decimals)} ${units[exp]}`;
}

/**
 * Formats duration in milliseconds or seconds into mm:ss or hh:mm:ss.
 * @param {number} seconds
 * @returns {string}
 */
export function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const totalSec = Math.floor(seconds);
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

/**
 * Formats a timestamp into a concise readable date string.
 * @param {number|string|Date} timestamp
 * @returns {string}
 */
export function formatDate(timestamp) {
  if (!timestamp) return 'Unknown date';
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return 'Unknown date';
  return d.toISOString().replace('T', ' ').slice(0, 16);
}
