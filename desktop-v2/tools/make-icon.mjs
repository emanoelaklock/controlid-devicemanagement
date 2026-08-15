// Generates desktop-v2/assets/icon.ico — a placeholder app icon drawn from
// scratch (no external image tooling): a dark rounded square with a brand
// indigo face-reader glyph, PNG-encoded and wrapped in an ICO container.
// Windows/electron-builder accept PNG-in-ICO. Run: node tools/make-icon.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const S = 256;
const buf = Buffer.alloc(S * S * 4); // RGBA

const px = (x, y, [r, g, b, a = 255]) => {
  if (x < 0 || y < 0 || x >= S || y >= S) return;
  const i = (y * S + x) * 4;
  const ia = a / 255, ib = 1 - ia;
  buf[i]   = Math.round(r * ia + buf[i] * ib);
  buf[i+1] = Math.round(g * ia + buf[i+1] * ib);
  buf[i+2] = Math.round(b * ia + buf[i+2] * ib);
  buf[i+3] = Math.max(buf[i+3], a);
};

const inRoundRect = (x, y, x0, y0, x1, y1, rad) => {
  if (x < x0 || y < y0 || x > x1 || y > y1) return false;
  const cx = x < x0 + rad ? x0 + rad : x > x1 - rad ? x1 - rad : x;
  const cy = y < y0 + rad ? y0 + rad : y > y1 - rad ? y1 - rad : y;
  return (x - cx) ** 2 + (y - cy) ** 2 <= rad * rad;
};

// Colors
const BG = [15, 23, 42];      // slate-900
const BRAND = [79, 70, 229];  // indigo-600
const BRAND_HI = [129, 140, 248]; // indigo-400
const WHITE = [226, 232, 240];

for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    // Rounded-square background
    if (inRoundRect(x, y, 8, 8, S - 8, S - 8, 48)) px(x, y, BG);
    // Device body (rounded rect, brand)
    if (inRoundRect(x, y, 64, 40, S - 64, S - 40, 26)) px(x, y, BRAND);
    // Inner face panel
    if (inRoundRect(x, y, 84, 64, S - 84, S - 64, 18)) px(x, y, [30, 41, 59]);
  }
}
// Face reader "eye": concentric rings, centered
const cx = S / 2, cy = S / 2 - 4;
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const d = Math.hypot(x - cx, y - cy);
    if (d >= 30 && d < 36) px(x, y, BRAND_HI);      // outer ring
    if (d < 20) px(x, y, WHITE);                     // pupil
  }
}
// Base "stand" line under the device
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    if (inRoundRect(x, y, 104, S - 52, S - 104, S - 44, 4)) px(x, y, BRAND_HI);
  }
}

// ---- PNG encode ----
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (b) => {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = crcTable[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8; ihdr[9] = 6; // 8-bit, RGBA
// Raw with filter byte 0 per row
const raw = Buffer.alloc((S * 4 + 1) * S);
for (let y = 0; y < S; y++) {
  raw[y * (S * 4 + 1)] = 0;
  buf.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4);
}
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

// ---- ICO wrap (single PNG entry) ----
const dir = Buffer.alloc(6);
dir.writeUInt16LE(0, 0); dir.writeUInt16LE(1, 2); dir.writeUInt16LE(1, 4);
const entry = Buffer.alloc(16);
entry[0] = 0; entry[1] = 0;          // 256 -> 0
entry[2] = 0; entry[3] = 0;          // colors, reserved
entry.writeUInt16LE(1, 4);           // planes
entry.writeUInt16LE(32, 6);          // bpp
entry.writeUInt32LE(png.length, 8);  // size
entry.writeUInt32LE(6 + 16, 12);     // offset
const ico = Buffer.concat([dir, entry, png]);

const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets');
mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'icon.ico');
writeFileSync(outPath, ico);
console.log(`Wrote ${outPath} (${ico.length} bytes, ${S}x${S})`);
