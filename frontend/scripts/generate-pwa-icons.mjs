// Generates PWA icons in all the sizes the Angular service worker + Capacitor expect.
// Run: npm run generate-icons
import sharp from 'sharp';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(here, '..', 'public');
const iconsDir = resolve(publicDir, 'icons');
const svgPath = resolve(publicDir, 'favicon.svg');

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

await mkdir(iconsDir, { recursive: true });
const svg = await readFile(svgPath);

for (const size of sizes) {
  const buf = await sharp(svg, { density: 384 }).resize(size, size).png().toBuffer();
  await writeFile(resolve(iconsDir, `icon-${size}x${size}.png`), buf);
  console.log(`✓ icon-${size}x${size}.png`);
}
console.log('Done.');
