import sharp from "sharp";
import fs from "fs";
import path from "path";
import pngToIco from "png-to-ico";

const iconDir = path.join(process.cwd(), "src-tauri", "icons");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#f59e0b"/>
      <stop offset="100%" style="stop-color:#d97706"/>
    </linearGradient>
    <linearGradient id="shine" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:white;stop-opacity:0.3"/>
      <stop offset="100%" style="stop-color:white;stop-opacity:0"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="96" fill="url(#bg)"/>
  <rect x="216" y="136" width="80" height="240" rx="16" fill="white"/>
  <rect x="136" y="216" width="240" height="80" rx="16" fill="white"/>
  <rect width="512" height="256" rx="96" fill="url(#shine)"/>
</svg>`;

async function main() {
  const buf512 = await sharp(Buffer.from(svg)).png().toBuffer();
  fs.writeFileSync(path.join(iconDir, "icon.png"), buf512);
  console.log("icon.png generated: " + buf512.length + " bytes");

  const sizes = [
    { name: "128x128.png", size: 128 },
    { name: "128x128@2x.png", size: 256 },
    { name: "32x32.png", size: 32 },
    { name: "32x32@2x.png", size: 64 },
  ];
  for (const s of sizes) {
    const buf = await sharp(buf512).resize(s.size, s.size).png().toBuffer();
    fs.writeFileSync(path.join(iconDir, s.name), buf);
    console.log(s.name + " generated: " + buf.length + " bytes");
  }

  const png32 = await sharp(buf512).resize(32, 32).png().toBuffer();
  const icoBuf = await pngToIco(png32);
  fs.writeFileSync(path.join(iconDir, "icon.ico"), icoBuf);
  console.log("icon.ico generated: " + icoBuf.length + " bytes");

  console.log("All icons generated successfully!");
}

main().catch(console.error);
