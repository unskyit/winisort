import fs from 'node:fs';
import path from 'node:path';

const iconsDir = path.resolve('public/icons');
const required = [
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-512.png',
  'apple-touch-icon.png',
  'favicon-32.png'
];

for (const file of required) {
  const full = path.join(iconsDir, file);
  if (!fs.existsSync(full) || fs.statSync(full).size < 100) {
    console.error(`Missing or invalid icon: ${full}`);
    process.exit(1);
  }
}
console.log('Verified all programmatic WiniSort PWA icons in public/icons/');
