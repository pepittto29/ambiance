// Mode Rétro : fonds d'écran et curseurs en pixel art, dessinés par l'application (aucune image à
// télécharger), et cadre décoratif posé sur l'écran. Les fichiers générés sont rangés dans
// %APPDATA%\Ambiance\retro et réutilisés tant que la résolution de l'écran ne change pas.
const { app, screen, BrowserWindow } = require('electron');
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const dir = () => path.join(app.getPath('userData'), 'retro');

// ---------- PNG ----------
const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
// rgb : pixels RVB d'une image w × h, agrandie « scale » fois sans lissage puis rognée à outW × outH.
function png(rgb, w, h, scale = 1, outW = w * scale, outH = h * scale) {
  const row = outW * 3 + 1;
  const raw = Buffer.alloc(row * outH);
  for (let oy = 0; oy < outH; oy++) {
    const y = Math.min(h - 1, Math.floor(oy / scale));
    const base = oy * row;
    if (oy > 0 && Math.floor((oy - 1) / scale) === y) { raw.copy(raw, base, base - row, base); continue; }
    for (let ox = 0; ox < outW; ox++) {
      const i = (y * w + Math.min(w - 1, Math.floor(ox / scale))) * 3;
      const o = base + 1 + ox * 3;
      raw[o] = rgb[i]; raw[o + 1] = rgb[i + 1]; raw[o + 2] = rgb[i + 2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(outW, 0); ihdr.writeUInt32BE(outH, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8 bits, RVB
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- Dessin ----------
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(W, H, seed) {
  const buf = new Uint8Array(W * H * 3);
  const rnd = rng(seed);
  const c = {
    W, H, buf, rnd,
    set(x, y, col) {
      x = Math.floor(x); y = Math.floor(y);
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      const i = (y * W + x) * 3;
      buf[i] = col[0]; buf[i + 1] = col[1]; buf[i + 2] = col[2];
    },
    // Dégradé vertical tramé (les bandes de couleur typiques des vieilles consoles).
    gradient(y0, y1, pal, xFrom = 0, xTo = W) {
      const cols = pal.map(hex);
      for (let y = Math.max(0, y0); y < Math.min(H, y1); y++) {
        const t = ((y - y0) / Math.max(1, y1 - y0 - 1)) * (cols.length - 1);
        const i = Math.floor(t);
        const f = t - i;
        for (let x = xFrom; x < xTo; x++) {
          const next = f > (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
          c.set(x, y, cols[Math.min(cols.length - 1, i + (next ? 1 : 0))]);
        }
      }
    },
    disc(cx, cy, r, colorAt) {
      for (let y = Math.floor(cy - r); y <= cy + r; y++) {
        for (let x = Math.floor(cx - r); x <= cx + r; x++) {
          if ((x - cx + 0.5) ** 2 + (y - cy + 0.5) ** 2 <= r * r) {
            const col = typeof colorAt === 'function' ? colorAt(x, y) : colorAt;
            if (col) c.set(x, y, col);
          }
        }
      }
    },
    // Bruit doux à une dimension (crêtes de montagnes, collines).
    noise(period) {
      const pts = Array.from({ length: Math.ceil(W / period) + 3 }, () => rnd());
      return x => {
        const p = x / period;
        const i = Math.floor(p);
        const f = (1 - Math.cos((p - i) * Math.PI)) / 2;
        return pts[i] * (1 - f) + pts[i + 1] * f;
      };
    },
    // Remplit sous une ligne d'horizon top(x) jusqu'au bas (ou jusqu'à yEnd).
    fillBelow(top, col, yEnd = H) {
      const k = hex(col);
      for (let x = 0; x < W; x++) for (let y = Math.max(0, Math.round(top(x))); y < yEnd; y++) c.set(x, y, k);
    },
    line(x0, y0, x1, y1, col) {
      const k = hex(col);
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1;
      for (let i = 0; i <= n; i++) c.set(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, k);
    },
    stars(count, yMax, cols = ['#ffffff', '#ffe9a8', '#bcd7ff']) {
      for (let i = 0; i < count; i++) {
        const x = Math.floor(rnd() * W);
        const y = Math.floor(rnd() * yMax * rnd());
        const k = hex(cols[i % cols.length]);
        c.set(x, y, k);
        if (rnd() < 0.08) { c.set(x - 1, y, k); c.set(x + 1, y, k); c.set(x, y - 1, k); c.set(x, y + 1, k); }
      }
    },
  };
  return c;
}

// Soleil rayé : dégradé du haut vers le bas, coupé de bandes de plus en plus larges.
function stripedSun(c, cx, cy, r, pal) {
  const cols = pal.map(hex);
  c.disc(cx, cy, r, (x, y) => {
    const t = (y - (cy - r)) / (2 * r);
    const rel = y - (cy - r * 0.4);
    if (rel > 0) {
      const period = Math.max(4, Math.round(r / 4));
      const gap = Math.min(period - 1, 1 + Math.floor(rel / period));
      if (rel % period >= period - gap) return null;
    }
    const f = t * (cols.length - 1);
    const i = Math.floor(f);
    const next = f - i > (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
    return cols[Math.min(cols.length - 1, i + (next ? 1 : 0))];
  });
}

function pine(c, x, base, h, col) {
  const k = hex(col);
  const w = Math.max(3, Math.round(h * 0.45));
  for (let yy = 0; yy < h; yy++) {
    // Branches en étages : la largeur repart un peu en arrière tous les quelques pixels.
    const tier = Math.max(3, Math.round(h / 4));
    const half = Math.round(((yy % tier) / tier) * (w / 2) * 0.6 + (yy / h) * (w / 2) * 0.6);
    for (let dx = -half; dx <= half; dx++) c.set(x + dx, base - h + yy, k);
  }
  c.set(x, base, k); c.set(x, base + 1, k);
}

const SCENES = {
  coucher: {
    name: 'Coucher de soleil',
    draw(c) {
      const { W, H } = c;
      const hor = Math.round(H * 0.64);
      c.gradient(0, hor, ['#1d0b3b', '#3b1260', '#6a1b74', '#a4286a', '#dd4b5c', '#f78a52', '#fbc46a']);
      c.stars(Math.round(W * H / 260), hor * 0.55);
      stripedSun(c, W * 0.5, hor - H * 0.14, H * 0.19, ['#fff3a6', '#ffd166', '#ff9f43', '#ff5e7e']);
      const far = c.noise(W / 6), farD = c.noise(W / 22);
      c.fillBelow(x => hor - H * 0.05 - far(x) * H * 0.16 - farD(x) * H * 0.04, '#4a1d6e', hor);
      const near = c.noise(W / 9), nearD = c.noise(W / 30);
      c.fillBelow(x => hor - near(x) * H * 0.1 - nearD(x) * H * 0.03, '#2a0f45', hor);
      c.gradient(hor, H, ['#2a0f45', '#1f0b38', '#140726']);
      // Reflet du soleil sur l'eau, en traits horizontaux qui s'estompent.
      const sun = ['#ffd166', '#ff9f43', '#ff5e7e'].map(hex);
      for (let y = hor + 1; y < H; y += 2) {
        const d = (y - hor) / (H - hor);
        const half = H * 0.2 * (1 - d * 0.7) * (0.5 + c.rnd() * 0.5);
        const off = (c.rnd() - 0.5) * 6;
        const col = sun[Math.min(2, Math.floor(d * 3))];
        for (let x = Math.round(W / 2 - half + off); x < W / 2 + half + off; x++) if (c.rnd() < 0.85 - d * 0.5) c.set(x, y, col);
      }
    },
  },
  nuit: {
    name: 'Nuit étoilée',
    draw(c) {
      const { W, H } = c;
      c.gradient(0, H, ['#070b1e', '#0d1533', '#16224a', '#22336a', '#2e4a80']);
      c.stars(Math.round(W * H / 90), H * 0.85);
      const mx = W * 0.76, my = H * 0.22, mr = H * 0.075;
      const glow = hex('#3a5592');
      c.disc(mx, my, mr * 1.7, (x, y) => ((x + y) % 2 === 0 ? glow : null));
      c.disc(mx, my, mr, hex('#f4efc8'));
      for (const [dx, dy, r] of [[-0.3, -0.2, 0.22], [0.35, 0.15, 0.16], [-0.05, 0.45, 0.13]]) c.disc(mx + dx * mr, my + dy * mr, r * mr, hex('#d6d0a2'));
      const hills = c.noise(W / 5);
      c.fillBelow(x => H * 0.7 - hills(x) * H * 0.1, '#14284a');
      const layers = [['#14284a', 0.74, 0.16], ['#0c1a33', 0.84, 0.2], ['#050c1a', 0.97, 0.26]];
      for (const [col, base, size] of layers) {
        for (let x = -4; x < W + 4; x += 2 + Math.floor(c.rnd() * size * H * 0.25)) {
          pine(c, x, Math.round(H * base + (c.rnd() - 0.5) * 4), Math.round(H * size * (0.6 + c.rnd() * 0.5)), col);
        }
        c.fillBelow(() => H * base + 1, col);
      }
      const fly = hex('#f6f08a');
      for (let i = 0; i < W / 18; i++) c.set(c.rnd() * W, H * (0.78 + c.rnd() * 0.18), fly);
    },
  },
  jour: {
    name: 'Grand jour',
    draw(c) {
      const { W, H } = c;
      c.gradient(0, H * 0.75, ['#3fa9f5', '#62bdf8', '#8fd3fb', '#bfe8ff']);
      c.disc(W * 0.86, H * 0.15, H * 0.06, hex('#fff6b0'));
      const white = hex('#ffffff'), shade = hex('#d4ecfb');
      for (let i = 0; i < 6; i++) {
        const cx = c.rnd() * W, cy = H * (0.1 + c.rnd() * 0.3), s = H * (0.03 + c.rnd() * 0.03);
        for (let k = 0; k < 5; k++) {
          const px = cx + (k - 2) * s * 1.1, py = cy - (k === 1 || k === 2 ? s * 0.6 : 0) * (k === 2 ? 1.5 : 1);
          c.disc(px, py, s * (k === 2 ? 1.3 : 1), (x, y) => (y > cy + s * 0.35 ? shade : white));
        }
      }
      const mt = c.noise(W / 5), mtD = c.noise(W / 18);
      c.fillBelow(x => H * 0.6 - mt(x) * H * 0.22 - mtD(x) * H * 0.05, '#7aa3cf', H);
      const snow = hex('#eef6ff');
      for (let x = 0; x < W; x++) {
        const top = Math.round(H * 0.6 - mt(x) * H * 0.22 - mtD(x) * H * 0.05);
        // Neige seulement sur les plus hauts sommets.
        const cap = Math.round((H * 0.44 - top) * 0.7);
        for (let y = top; y < top + cap; y++) if (y < top + cap - 1 || (x + y) % 2) c.set(x, y, snow);
      }
      const greens = [['#6cc46b', 0.66, 0.06], ['#4aa858', 0.76, 0.07], ['#2f8a47', 0.88, 0.06]];
      for (const [col, base, amp] of greens) {
        const n = c.noise(W / 4);
        c.fillBelow(x => H * base - n(x) * H * amp * 2, col);
      }
      const flowers = ['#ffffff', '#ffe066', '#ff8fb1'].map(hex);
      for (let i = 0; i < W / 3; i++) c.set(c.rnd() * W, H * (0.9 + c.rnd() * 0.1), flowers[i % 3]);
    },
  },
  arcade: {
    name: 'Arcade',
    draw(c) {
      const { W, H } = c;
      const hor = Math.round(H * 0.58);
      c.gradient(0, hor, ['#0a0420', '#1b0a3d', '#3a0f5e', '#6a1572', '#b02a7e']);
      c.stars(Math.round(W * H / 200), hor * 0.7);
      stripedSun(c, W * 0.5, hor - H * 0.13, H * 0.19, ['#fff17a', '#ffb347', '#ff5ea8', '#d63bd8']);
      const m = c.noise(W / 8);
      c.fillBelow(x => hor - m(x) * H * 0.07, '#1c0638', hor);
      c.gradient(hor, H, ['#16032e', '#0c021c']);
      // Grille en perspective vers le point de fuite.
      const cx = W / 2;
      for (let k = 1; hor + k * k * 0.9 < H; k++) c.line(0, Math.round(hor + k * k * 0.9), W, Math.round(hor + k * k * 0.9), '#e23bd0');
      for (let i = -24; i <= 24; i++) c.line(Math.round(cx + i * 3), hor, Math.round(cx + i * W / 9), H, '#e23bd0');
      c.line(0, hor, W, hor, '#ff9df0');
    },
  },
};

const SCENE_IDS = Object.keys(SCENES);

function render(id, W, H) {
  const c = canvas(W, H, 1234 + SCENE_IDS.indexOf(id) * 77);
  SCENES[id].draw(c);
  return c.buf;
}

// Fond d'écran à la taille exacte de l'écran principal (pixels réels), avec de gros pixels nets.
function wallpaper(id) {
  if (!SCENES[id]) return null;
  const d = screen.getPrimaryDisplay();
  const outW = Math.round(d.size.width * d.scaleFactor);
  const outH = Math.round(d.size.height * d.scaleFactor);
  const file = path.join(dir(), `fond-${id}-${outW}x${outH}.png`);
  if (fs.existsSync(file)) return file;
  const scale = Math.max(1, Math.round(outH / 180));
  const W = Math.ceil(outW / scale), H = Math.ceil(outH / scale);
  fs.mkdirSync(dir(), { recursive: true });
  fs.writeFileSync(file, png(render(id, W, H), W, H, scale, outW, outH));
  return file;
}

// Aperçus pour l'éditeur de mode (petites images en data URL).
function previews() {
  return SCENE_IDS.map(id => ({ id, name: SCENES[id].name, src: 'data:image/png;base64,' + png(render(id, 320, 180), 320, 180).toString('base64') }));
}

// Les modes enregistrent « retro:coucher » : on le remplace par le fichier généré.
function resolveWallpaper(value) {
  const m = /^retro:(\w+)$/.exec(value || '');
  if (!m) return value;
  try { return wallpaper(m[1]); } catch (e) { console.error('Fond rétro impossible', e); return null; }
}

// ---------- Curseurs ----------
// K contour, W blanc, A accent, D accent foncé ; un point = transparent.
const SPRITES = {
  Arrow: { hot: [0, 0], rows: [
    'K', 'KK', 'KWK', 'KWWK', 'KWWWK', 'KWWWWK', 'KWWWWWK', 'KWWWWAAK', 'KWWWAAAAK', 'KWWAAAAADK',
    'KWWAADKKKKK', 'KWAKDDK', 'KAK.KDDK', 'KK..KDDK', 'K....KDDK', '.....KKK'] },
  Hand: { hot: [5, 0], rows: [
    '.....KK', '....KWWK', '....KWWK', '....KWWK', '....KWWKKK', '....KWWKWWKK', '.KK.KWWKWWKWKK', 'KWWKKWWWWWKWWK',
    'KWWWKWWWWWWWWK', '.KWWWWWWWWWWWK', '..KWWWWWWWWWAK', '..KWWWWWWWWAK', '...KWWWWWWAAK', '...KWWWWWAAK', '....KAAAAADK', '....KKKKKKKK'] },
  IBeam: { hot: [3, 8], rows: [
    'KKK.KKK', 'KWWKWWK', 'KKKWKKK', '..KWK', '..KWK', '..KWK', '..KWK', '..KAK', '..KAK', '..KAK', '..KAK', '..KAK',
    '..KAK', 'KKKAKKK', 'KWWKWWK', 'KKK.KKK'] },
  Wait: { hot: [5, 7], rows: [
    'KKKKKKKKKK', 'KDDDDDDDDK', '.KWWWWWWK', '.KWAAAAWK', '..KWAAWK', '...KWWK', '....KK', '...KWWK', '..KW..WK',
    '.KW.AA.WK', '.KWAAAAWK', 'KDDDDDDDDK', 'KKKKKKKKKK'] },
};
// Curseur « application en cours de démarrage » : la flèche avec un petit sablier.
const GLASS = ['KKKKKKK', 'KDDDDDK', '.KAAAK', '..KAK', '..KWK', '.KWWWK', 'KDDDDDK', 'KKKKKKK'];
SPRITES.AppStarting = { hot: [0, 0], rows: SPRITES.Arrow.rows.map((r, y) => {
  const row = [...r.padEnd(16, '.')];
  [...(GLASS[y - 8] || '')].forEach((ch, x) => { if (ch !== '.') row[9 + x] = ch; });
  return row.join('');
}) };
const COLORS = { K: [20, 12, 28, 255], W: [255, 255, 255, 255], A: [255, 79, 163, 255], D: [194, 24, 91, 255], S: [0, 0, 0, 90] };

// Fichier .cur avec trois tailles (32, 48 et 64 px) : Windows prend celle qui suit la taille choisie.
function curFile(sprite) {
  const images = [2, 3, 4].map(scale => {
    const size = 16 * scale;
    const px = new Uint8Array(size * size * 4);
    const put = (x, y, col) => {
      if (x >= size || y >= size) return;
      const i = (y * size + x) * 4;
      px[i] = col[2]; px[i + 1] = col[1]; px[i + 2] = col[0]; px[i + 3] = col[3];
    };
    // Ombre portée d'un pixel, puis le dessin par-dessus.
    for (const [layer, dx] of [['S', 1], [null, 0]]) {
      sprite.rows.forEach((row, y) => [...row].forEach((ch, x) => {
        if (ch === '.') return;
        const col = COLORS[layer || ch];
        for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) {
          const X = (x + dx) * scale + sx, Y = (y + dx) * scale + sy;
          const i = (Y * size + X) * 4;
          if (layer && px[i + 3]) continue;
          put(X, Y, col);
        }
      }));
    }
    // Bitmap 32 bits de bas en haut, suivi du masque ET (1 = transparent).
    const maskRow = Math.ceil(size / 32) * 4;
    const header = Buffer.alloc(40);
    header.writeUInt32LE(40, 0); header.writeInt32LE(size, 4); header.writeInt32LE(size * 2, 8);
    header.writeUInt16LE(1, 12); header.writeUInt16LE(32, 14);
    const xor = Buffer.alloc(size * size * 4);
    const and = Buffer.alloc(maskRow * size);
    for (let y = 0; y < size; y++) {
      const src = (size - 1 - y) * size * 4;
      Buffer.from(px.buffer, src, size * 4).copy(xor, y * size * 4);
      for (let x = 0; x < size; x++) if (!px[src + x * 4 + 3]) and[y * maskRow + (x >> 3)] |= 0x80 >> (x & 7);
    }
    header.writeUInt32LE(xor.length + and.length, 20);
    return { size, hot: sprite.hot.map(v => v * scale), data: Buffer.concat([header, xor, and]) };
  });
  const head = Buffer.alloc(6 + images.length * 16);
  head.writeUInt16LE(2, 2); head.writeUInt16LE(images.length, 4);
  let offset = head.length;
  images.forEach((img, i) => {
    const e = 6 + i * 16;
    head[e] = img.size; head[e + 1] = img.size;
    head.writeUInt16LE(img.hot[0], e + 4); head.writeUInt16LE(img.hot[1], e + 6);
    head.writeUInt32LE(img.data.length, e + 8); head.writeUInt32LE(offset, e + 12);
    offset += img.data.length;
  });
  return Buffer.concat([head, ...images.map(i => i.data)]);
}

// Écrit les curseurs (une seule fois) et renvoie { Arrow: chemin, Hand: chemin, … }.
function cursorFiles() {
  const out = {};
  const folder = path.join(dir(), 'curseurs');
  fs.mkdirSync(folder, { recursive: true });
  for (const [name, sprite] of Object.entries(SPRITES)) {
    const file = path.join(folder, `${name}.cur`);
    const data = curFile(sprite);
    if (!fs.existsSync(file) || !fs.readFileSync(file).equals(data)) fs.writeFileSync(file, data);
    out[name] = file;
  }
  return out;
}

// ---------- Cadre décoratif ----------
let frameWin = null;
let frameStyle = '';
let shownStyle = '';
let dropTimer = null;
const alive = () => frameWin && !frameWin.isDestroyed();

function showFrame() {
  if (!alive()) return;
  frameWin.showInactive();
  // Le compagnon et ses bulles restent par-dessus le cadre.
  for (const w of BrowserWindow.getAllWindows()) if (w !== frameWin && w.isAlwaysOnTop() && w.isVisible()) w.moveTop();
}

// Créer la fenêtre prend une fraction de seconde : sans cadre, elle est seulement cachée, puis
// libérée au bout d'une minute.
function setFrame(style) {
  style = ['pixel', 'crt'].includes(style) ? style : '';
  if (style === frameStyle) return;
  frameStyle = style;
  clearTimeout(dropTimer);
  if (!style) {
    if (alive()) frameWin.hide();
    dropTimer = setTimeout(() => { if (alive() && !frameStyle) frameWin.destroy(); }, 60000);
    return;
  }
  const page = path.join(__dirname, 'src', 'frame.html');
  if (alive()) {
    if (shownStyle === style) showFrame();
    else { shownStyle = style; frameWin.loadFile(page, { query: { style } }).then(showFrame, () => {}); }
    return;
  }
  frameWin = new BrowserWindow({
    ...screen.getPrimaryDisplay().workArea, transparent: true, frame: false, resizable: false, movable: false,
    focusable: false, skipTaskbar: true, hasShadow: false, show: false, alwaysOnTop: true,
    webPreferences: { backgroundThrottling: true },
  });
  frameWin.setIgnoreMouseEvents(true);
  shownStyle = style;
  frameWin.loadFile(page, { query: { style } });
  frameWin.once('ready-to-show', () => { if (frameStyle) showFrame(); });
  frameWin.on('closed', () => { frameWin = null; shownStyle = ''; });
}

// Suit les changements d'écran (résolution, barre des tâches déplacée).
function fitFrame() {
  if (frameWin && !frameWin.isDestroyed()) frameWin.setBounds(screen.getPrimaryDisplay().workArea);
}

module.exports = { SCENES, wallpaper, previews, resolveWallpaper, cursorFiles, setFrame, fitFrame, png, curFile };
