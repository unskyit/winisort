import fs from 'node:fs';
import path from 'node:path';

const distDir = path.resolve('dist');
const requiredFiles = [
  'index.html',
  'manifest.webmanifest',
  'sw.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'fonts/WiniSans-Regular.woff2',
  'fonts/WiniSans-Bold.woff2',
  'vendor/pdf.js',
  'vendor/pdf.worker.js'
];

let failed = false;
for (const rel of requiredFiles) {
  const full = path.join(distDir, rel);
  if (!fs.existsSync(full)) {
    console.error(`[verify-build] Missing required production file: dist/${rel}`);
    failed = true;
  }
}

// Ensure zero remote CDN links in dist/index.html
const indexHtmlPath = path.join(distDir, 'index.html');
if (fs.existsSync(indexHtmlPath)) {
  const html = fs.readFileSync(indexHtmlPath, 'utf8');
  if (/https?:\/\/(cdn|unpkg|cdnjs|fonts\.googleapis|fonts\.gstatic)/i.test(html)) {
    console.error('[verify-build] Forbidden external CDN dependency detected in dist/index.html');
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}
console.log('[verify-build] All production assets, local fonts, icons, and zero-CDN policies verified.');
