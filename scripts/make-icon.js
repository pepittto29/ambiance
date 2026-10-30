// Génère assets/icon.png (512x512) sans dépendance : carré arrondi en dégradé + barres d'onde.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const S = 512;
const px = Buffer.alloc(S * S * 4);

function roundedRectAlpha(x, y, x0, y0, x1, y1, r) {
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  const d = Math.hypot(x - cx, y - cy);
  return Math.max(0, Math.min(1, r - d + 0.5));
}

const bars = [0.28, 0.52, 0.78, 0.52, 0.28];
const barW = 44, gap = 26;
const totalW = bars.length * barW + (bars.length - 1) * gap;
const bx0 = (S - totalW) / 2;

for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4;
    const a = roundedRectAlpha(x, y, 16, 16, S - 16, S - 16, 112);
    if (a <= 0) continue;
    const t = (x + y) / (2 * S);
    // dégradé turquoise -> indigo
    let r = 32 + (88 - 32) * t, g = 196 + (86 - 196) * t, b = 214 + (220 - 214) * t;
    for (let k = 0; k < bars.length; k++) {
      const h = bars[k] * S;
      const x0 = bx0 + k * (barW + gap);
      const ba = roundedRectAlpha(x, y, x0, (S - h) / 2, x0 + barW, (S + h) / 2, barW / 2);
      if (ba > 0) { r += (255 - r) * ba; g += (255 - g) * ba; b += (255 - b) * ba; }
    }
    px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a * 255;
  }
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

const raw = Buffer.alloc(S * (S * 4 + 1));
for (let y = 0; y < S; y++) px.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4);

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8; ihdr[9] = 6; // 8 bits, RGBA

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const out = path.join(__dirname, '..', 'assets', 'icon.png');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, png);
console.log('Icône écrite :', out);
