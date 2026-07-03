import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const iconsDir = path.join(__dirname, '..', 'src-tauri', 'icons');

// SVG source - amber gradient with white medical cross
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#f59e0b"/>
      <stop offset="100%" style="stop-color:#d97706"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="96" fill="url(#bg)"/>
  <rect x="216" y="136" width="80" height="240" rx="16" fill="white"/>
  <rect x="136" y="216" width="240" height="80" rx="16" fill="white"/>
  <circle cx="256" cy="256" r="28" fill="rgba(255,255,255,0.15)"/>
</svg>`;

// Generate PNGs for each needed size
const sizes = [
  { name: '32x32.png', w: 32 },
  { name: '32x32@2x.png', w: 64 },
  { name: '128x128.png', w: 128 },
  { name: '128x128@2x.png', w: 256 },
  { name: '256x256.png', w: 256 },
  { name: 'icon.png', w: 512 },
];

const pngBuffers = {};
for (const { name, w } of sizes) {
  const buf = await sharp(Buffer.from(svg)).resize(w, w).png({ palette: false, compressionLevel: 6 }).toBuffer();
  writeFileSync(path.join(iconsDir, name), buf);
  pngBuffers[w] = buf;
  console.log(`${name}: ${buf.length} bytes`);
}

// Generate icon.icns (macOS) - just copy 512x512 PNG
writeFileSync(path.join(iconsDir, 'icon.icns'), pngBuffers[512]);

// Generate icon.ico using Windows ICO format manually
// We need properly sized BMP/DIB data inside the ICO, but PNG works too
// Windows Vista+ supports PNG in ICO files
// Include all sizes for high-DPI + older Windows compatibility
const icoSizes = [256, 128, 64, 48, 32, 24, 16];
const images = [];
for (const w of icoSizes) {
  const buf = await sharp(Buffer.from(svg)).resize(w, w).png({ palette: false, compressionLevel: 6 }).toBuffer();
  images.push({ w, buf });
}

// Build ICO file structure
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: ICO
header.writeUInt16LE(images.length, 4); // count

const entries = [];
const dataBuffers = [];
let offset = 6 + images.length * 16;

for (const img of images) {
  const entry = Buffer.alloc(16);
  entry.writeUInt8(img.w >= 256 ? 0 : img.w, 0); // width (0 = 256)
  entry.writeUInt8(img.w >= 256 ? 0 : img.w, 1); // height
  entry.writeUInt8(0, 2); // colors
  entry.writeUInt8(0, 3); // reserved
  entry.writeUInt16LE(1, 4); // planes
  entry.writeUInt16LE(32, 6); // bpp
  const size = img.buf.length;
  entry.writeUInt32LE(size, 8);
  entry.writeUInt32LE(offset, 12);
  entries.push(entry);
  dataBuffers.push(img.buf);
  offset += size;
}

const ico = Buffer.concat([header, ...entries, ...dataBuffers]);
writeFileSync(path.join(iconsDir, 'icon.ico'), ico);
console.log(`icon.ico: ${ico.length} bytes`);
console.log('All icons generated successfully!');
