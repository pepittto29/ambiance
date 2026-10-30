// Le « monde » de la souris : les surfaces sur lesquelles elle peut marcher.
//  - le bas de chaque écran (au-dessus de la barre des tâches) ;
//  - le bord supérieur des fenêtres ouvertes ;
//  - les lignes horizontales visibles à l'écran (séparateurs, cadres, zones de saisie…),
//    trouvées en analysant une capture d'écran réduite. Chaque ligne est rattachée à la fenêtre
//    qui l'affiche : elle bouge avec elle et disparaît quand la fenêtre se ferme.
// Les captures restent en mémoire et ne sont jamais enregistrées ni envoyées.
const { screen, desktopCapturer } = require('electron');

let win32 = null;
try { win32 = require('./pet-win32'); } catch { /* sans Win32 : seulement les bords d'écran */ }

const HEADROOM = 40;      // place minimale au-dessus d'une surface
const EDGE_THRESHOLD = 26; // contraste minimal entre deux rangées de pixels
const MIN_LINE = 80;      // longueur minimale d'une ligne (DIP)

let windows = [];         // du dessus vers le dessous
let byHandle = new Map();
let lines = [];           // { owner, ox1, ox2, oy, ow, oh } ou { owner: 0, x1, x2, y }
let scanning = false;
let lastScan = 0;
let useScreen = true;

function toDip(w) {
  const r = screen.screenToDipRect ? screen.screenToDipRect(null, { x: w.x, y: w.y, width: w.w, height: w.h2 }) : { x: w.x, y: w.y, width: w.w, height: w.h2 };
  return { h: w.h, cls: w.cls, x: r.x, y: r.y, w: r.width, hgt: r.height };
}

function refreshWindows(excludeHandles) {
  if (!win32) return;
  try {
    windows = win32.listWindows(excludeHandles).map(toDip);
  } catch {
    windows = [];
  }
  byHandle = new Map();
  windows.forEach((w, i) => { w.z = i; byHandle.set(w.h, w); });
  // Une fenêtre redimensionnée invalide les lignes qu'on y avait trouvées.
  lines = lines.filter(l => {
    if (l.owner === 0) return true;
    const w = byHandle.get(l.owner);
    return w && Math.abs(w.w - l.ow) < 2 && Math.abs(w.hgt - l.oh) < 2;
  });
}

function topWindowAt(x, y) {
  for (const w of windows) if (x >= w.x && x < w.x + w.w && y >= w.y && y < w.y + w.hgt) return w;
  return null;
}

function displayAt(x, y) {
  return screen.getDisplayNearestPoint({ x: Math.round(x), y: Math.round(y) });
}

// Toutes les surfaces, en coordonnées écran actuelles.
function platforms() {
  const out = [];
  for (const d of screen.getAllDisplays()) {
    const a = d.workArea;
    out.push({ id: 'f' + d.id, kind: 'floor', owner: -1, x1: a.x, x2: a.x + a.width, y: a.y + a.height });
  }
  for (const w of windows) {
    const top = displayAt(w.x + w.w / 2, w.y).workArea.y;
    if (w.y < top + HEADROOM) continue;
    out.push({ id: 'w' + w.h, kind: 'window', owner: w.h, x1: w.x + 4, x2: w.x + w.w - 4, y: w.y });
  }
  lines.forEach(l => {
    if (l.owner === 0) { out.push({ id: 'l' + l.key, kind: 'line', owner: 0, x1: l.x1, x2: l.x2, y: l.y }); return; }
    const w = byHandle.get(l.owner);
    if (!w) return;
    out.push({ id: 'l' + l.key, kind: 'line', owner: l.owner, x1: w.x + l.ox1, x2: w.x + l.ox2, y: w.y + l.oy });
  });
  return out;
}

// Une surface est utilisable à l'abscisse x si elle est réellement visible à cet endroit
// et si aucune fenêtre placée au-dessus ne recouvre l'espace où se tient la souris.
function solidAt(p, x) {
  if (x < p.x1 || x > p.x2) return false;
  if (p.kind === 'floor') return true;
  const below = topWindowAt(x, p.y + 2);
  if (p.owner === 0 ? below : (!below || below.h !== p.owner)) return false;
  const ownerZ = p.owner === 0 ? Infinity : (byHandle.get(p.owner)?.z ?? Infinity);
  const above = topWindowAt(x, p.y - 14);
  return !(above && above.h !== p.owner && above.z < ownerZ);
}

function byId(id) {
  return id ? platforms().find(p => p.id === id) || null : null;
}

// Première surface franchie en tombant de y0 à y1 à l'abscisse x.
function landing(x, y0, y1) {
  let best = null;
  for (const p of platforms()) {
    if (p.y < y0 - 0.5 || p.y > y1) continue;
    if (!solidAt(p, x)) continue;
    if (!best || p.y < best.y) best = p;
  }
  return best;
}

// Surface la plus proche sous un point (pour viser le curseur, poser le fromage…).
function surfaceBelow(x, y) {
  return landing(x, y, Infinity);
}

// Surfaces accessibles d'un saut depuis (x, y).
function jumpTargets(x, y, reachX = 360, up = 240, down = 520) {
  const out = [];
  for (const p of platforms()) {
    if (p.y < y - up || p.y > y + down) continue;
    if (p.x2 < x - reachX || p.x1 > x + reachX) continue;
    out.push(p);
  }
  return out;
}

function randomSurface(preferFloor = 0.4) {
  const all = platforms().filter(p => p.x2 - p.x1 > 60);
  if (!all.length) return null;
  const floors = all.filter(p => p.kind === 'floor');
  const pool = Math.random() < preferFloor ? floors : all;
  for (let i = 0; i < 12; i++) {
    const p = pool[Math.floor(Math.random() * pool.length)];
    const x = p.x1 + 20 + Math.random() * Math.max(1, p.x2 - p.x1 - 40);
    if (solidAt(p, x)) return { p, x };
  }
  return null;
}

// ---------- Analyse de l'écran ----------
// keepIds : surfaces en cours d'utilisation (sous la souris, le fromage, un trou), conservées telles
// quelles tant que leur fenêtre existe, même si la souris elle-même les masque sur la capture.
async function scan(excludeRects, keepIds = new Set()) {
  if (!useScreen || scanning) return;
  scanning = true;
  lastScan = Date.now();
  try {
    const displays = screen.getAllDisplays();
    const maxW = Math.max(...displays.map(d => d.size.width));
    const maxH = Math.max(...displays.map(d => d.size.height));
    // Résolution logique de l'écran : les séparateurs d'un pixel restent nets.
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: maxW, height: maxH } });
    const found = [];
    for (const src of sources) {
      const d = displays.find(x => String(x.id) === String(src.display_id)) || (sources.length === 1 ? displays[0] : null);
      if (!d) continue;
      found.push(...detectLines(src.thumbnail, d, excludeRects));
    }
    const kept = lines.filter(l => keepIds.has('l' + l.key));
    const next = [];
    for (const l of found) {
      const mid = (l.x1 + l.x2) / 2;
      const w = topWindowAt(mid, l.y + 2);
      let line;
      if (!w) line = { owner: 0, x1: l.x1, x2: l.x2, y: l.y };
      else {
        if (Math.abs(l.y - w.y) < 5) continue; // déjà couvert par le bord de la fenêtre
        const x1 = Math.max(l.x1, w.x + 2), x2 = Math.min(l.x2, w.x + w.w - 2);
        if (x2 - x1 < MIN_LINE) continue;
        line = { owner: w.h, ox1: x1 - w.x, ox2: x2 - w.x, oy: l.y - w.y, ow: w.w, oh: w.hgt };
      }
      if (kept.some(k => sameLine(k, line))) continue;
      // Une ligne déjà connue garde son identifiant d'une analyse à l'autre.
      const old = lines.find(o => sameLine(o, line));
      line.key = old ? old.key : ++lineSeq;
      next.push(line);
    }
    lines = kept.concat(next);
  } catch {
    /* capture indisponible : on garde les surfaces précédentes */
  } finally {
    scanning = false;
  }
}

let lineSeq = 0;

// Une vraie ligne d'interface (séparateur, cadre, bord de zone) a des couleurs uniformes de part et
// d'autre et un espace dégagé au-dessus. Le bas d'une ligne de texte, lui, est irrégulier et a des
// lettres juste au-dessus : on l'écarte pour que la souris ne marche pas sur le texte.
function cleanLine(L, W, y, x0, x1) {
  const rowStd = row => {
    let s = 0, s2 = 0, n = 0;
    for (let x = x0; x <= x1; x += 2) { const v = L[row * W + x]; s += v; s2 += v * v; n++; }
    const m = s / n;
    return Math.sqrt(Math.max(0, s2 / n - m * m));
  };
  if (y < 20 || rowStd(y) > 9 || rowStd(y + 1) > 9) return false;
  let busy = 0, total = 0;
  for (let r = y - 18; r < y - 2; r++) {
    for (let x = x0; x < x1 - 2; x += 2) {
      const i = r * W + x;
      total++;
      if (Math.abs(L[i] - L[i + W]) > EDGE_THRESHOLD || Math.abs(L[i] - L[i + 2]) > EDGE_THRESHOLD) busy++;
    }
  }
  return busy / total < 0.06;
}

function sameLine(a, b) {
  if (a.owner !== b.owner) return false;
  const ay = a.owner === 0 ? a.y : a.oy, by = b.owner === 0 ? b.y : b.oy;
  const [a1, a2] = a.owner === 0 ? [a.x1, a.x2] : [a.ox1, a.ox2];
  const [b1, b2] = b.owner === 0 ? [b.x1, b.x2] : [b.ox1, b.ox2];
  return Math.abs(ay - by) <= 4 && a1 < b2 && b1 < a2;
}

function detectLines(img, d, excludeRects) {
  const { width: W, height: H } = img.getSize();
  if (!W || !H) return [];
  const bmp = img.toBitmap(); // BGRA
  const sx = d.bounds.width / W, sy = d.bounds.height / H;
  const L = new Uint8Array(W * H);
  for (let i = 0, j = 0; i < L.length; i++, j += 4) L[i] = (bmp[j] * 29 + bmp[j + 1] * 150 + bmp[j + 2] * 77) >> 8;

  const minRun = MIN_LINE / sx;
  const top = Math.ceil((d.workArea.y - d.bounds.y + HEADROOM) / sy);
  const bottom = Math.floor((d.workArea.y - d.bounds.y + d.workArea.height - 4) / sy);
  const out = [];
  for (let y = Math.max(1, top); y < Math.min(H - 1, bottom); y++) {
    let start = -1, gap = 0;
    const row = y * W, next = (y + 1) * W;
    for (let x = 0; x <= W; x++) {
      const edge = x < W && Math.abs(L[row + x] - L[next + x]) > EDGE_THRESHOLD;
      if (edge) {
        if (start < 0) start = x;
        gap = 0;
      } else if (start >= 0 && ++gap > 2) {
        const end = x - gap;
        if (end - start >= minRun && cleanLine(L, W, y, start, end)) {
          out.push({ x1: d.bounds.x + start * sx, x2: d.bounds.x + end * sx, y: d.bounds.y + (y + 1) * sy });
        }
        start = -1;
      }
    }
  }
  // Fusionne les lignes quasi identiques et écarte celles dessinées par nos propres fenêtres.
  out.sort((a, b) => a.y - b.y || a.x1 - b.x1);
  const merged = [];
  for (const l of out) {
    if (excludeRects.some(r => l.y >= r.y - 4 && l.y <= r.y + r.height + 4 && l.x2 > r.x && l.x1 < r.x + r.width)) continue;
    const m = merged.find(o => Math.abs(o.y - l.y) <= 3 * sy && l.x1 < o.x2 && l.x2 > o.x1);
    if (m) { m.x1 = Math.min(m.x1, l.x1); m.x2 = Math.max(m.x2, l.x2); } else merged.push({ ...l });
  }
  return merged.sort((a, b) => (b.x2 - b.x1) - (a.x2 - a.x1)).slice(0, 250);
}

module.exports = {
  refreshWindows,
  platforms,
  solidAt,
  byId,
  landing,
  surfaceBelow,
  jumpTargets,
  randomSurface,
  displayAt,
  topWindowAt,
  scan,
  get lastScan() { return lastScan; },
  get windowCount() { return windows.length; },
  get lineCount() { return lines.length; },
  setUseScreen(on) { useScreen = !!on; if (!on) lines = []; },
  hasWin32: () => !!win32,
};
