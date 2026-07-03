import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#f59e0b"/>
      <stop offset="100%" style="stop-color:#d97706"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" rx="192" fill="url(#bg)"/>
  <rect x="416" y="256" width="192" height="512" rx="40" fill="white"/>
  <rect x="256" y="416" width="512" height="192" rx="40" fill="white"/>
  <circle cx="512" cy="512" r="60" fill="rgba(255,255,255,0.15)"/>
</svg>`;

const buf = await sharp(Buffer.from(svg)).resize(1024, 1024).png().toBuffer();
await sharp(buf).resize(1024, 1024).png().toFile(path.join(__dirname, '..', 'src-tauri', 'icons', 'app-icon.png'));
console.log('Source icon created: ' + buf.length + ' bytes');
