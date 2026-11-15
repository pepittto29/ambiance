// Objets du monde du compagnon : nourriture (fromage, carotte, poisson), trou ou terrier.
const kind = new URLSearchParams(location.search).get('kind');
const cv = document.getElementById('c');
const ctx = cv.getContext('2d');
const PAL = {
  k: '#5a3d0a', Y: '#ffe082', y: '#f6c945', o: '#d99a1e', w: '#ffffff',
  O: '#f08a24', R: '#c8611a', G: '#5cb85c', D: '#2f7d32', K: '#3a2a1a',
  B: '#7fb8e6', b: '#4a86c5', S: '#cfe3f5', e: '#0d0b14',
};

// Nourriture : 10 x 9 pixels, posée sur la rangée du bas.
const FOOD = {
  cheese: [
    'kkkkkkkkkk',
    'kYYYYYYYYk',
    'kyyoyyyyyk',
    'kyyyyyoyyk',
    'kyoyyyyyyk',
    'kyyyyoyyyk',
    'kyyyyyyyok',
    'kyyoyyyyyk',
    'kkkkkkkkkk',
  ],
  carrot: [
    '.......GD.',
    '......GDG.',
    '.....KKD..',
    '....KOOK..',
    '...KOORK..',
    '..KOROK...',
    '.KOOOK....',
    'KORK......',
    'KK........',
  ],
  fish: [
    '..........',
    '...KKKK...',
    '.KKSSSBK.K',
    'KSeSSBBBKK',
    'KSSBBbbbKb',
    '.KKbbbbK.K',
    '...KKKK...',
    '..........',
    '..........',
  ],
};

let state = { bites: 0, open: 0, door: 0 };
const isFood = kind in FOOD;
const isGarage = kind === 'garage';
cv.width = isFood ? 32 : isGarage ? 132 : 56;
cv.height = isFood ? 32 : isGarage ? 72 : 24;

function drawFood(t) {
  const grid = FOOD[kind];
  const s = 2, ox = 6, oy = 28 - grid.length * s;
  const keep = 10 - state.bites * 3; // chaque bouchée en retire un tiers
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < Math.min(10, keep); x++) {
      const c = grid[y][x];
      if (c === '.') continue;
      ctx.fillStyle = PAL[c];
      ctx.fillRect(ox + x * s, oy + y * s, s, s);
    }
  }
  // Petite étincelle pour attirer l'œil.
  if (state.bites === 0 && Math.floor(t / 400) % 3 === 0) {
    ctx.fillStyle = PAL.w;
    ctx.fillRect(ox + 16, oy - 4, 2, 2);
    ctx.fillRect(ox + 14, oy - 2, 2, 2);
    ctx.fillRect(ox + 18, oy - 2, 2, 2);
  }
}

// Trou (et terrier, entouré d'un petit monticule de terre) centré sur la rangée 6 (y = 12 px).
function drawHole() {
  const s = 2, cx = 14, cy = 6;
  const rx = 12 * state.open, ry = 3.4 * state.open;
  if (rx < 0.5) return;
  if (kind === 'burrow') {
    for (let y = 0; y < 12; y++) {
      for (let x = 0; x < 28; x++) {
        const d = ((x + 0.5 - cx) / (rx + 2.5)) ** 2 + ((y + 0.5 - cy + 1) / (ry + 2.2)) ** 2;
        if (d > 1 || y > cy + 2) continue;
        ctx.fillStyle = (x + y) % 5 === 0 ? '#6e4b2f' : '#8a603c';
        ctx.fillRect(x * s, y * s, s, s);
      }
    }
  }
  for (let y = 0; y < 12; y++) {
    for (let x = 0; x < 28; x++) {
      const d = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2;
      if (d > 1.25) continue;
      ctx.fillStyle = d > 0.75 ? '#5b4030' : d > 0.45 ? '#24180f' : '#0b0705';
      ctx.fillRect(x * s, y * s, s, s);
    }
  }
}

// Garage du mode Course (2 px par pixel) : murs en briques, enseigne, rideau métallique qui se lève.
function drawGarage() {
  const s = 2;
  const px = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x * s, y * s, w * s, h * s); };
  px(2, 8, 62, 27, '#2a2238');
  px(3, 9, 60, 26, '#b8bec8');
  for (let y = 10; y < 35; y += 3) for (let x = 3 + (y % 2) * 3; x < 63; x += 6) px(x, y, 5, 1, '#a3aab6');
  px(0, 4, 66, 5, '#2a2238');
  px(1, 5, 64, 3, '#e53935');
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 9px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('GARAGE', 66, 13);
  // Ouverture : intérieur sombre, rideau à lamelles qui remonte quand la porte s'ouvre.
  const dx = 10, dw = 46, dy = 13, dh = 22;
  px(dx - 1, dy - 1, dw + 2, dh + 1, '#2a2238');
  px(dx, dy, dw, dh, '#15121c');
  px(dx, dy + dh - 2, dw, 2, '#2b2833');
  const shut = Math.round(dh * (1 - state.door));
  for (let y = 0; y < shut; y++) px(dx, dy + y, dw, 1, y % 2 ? '#8d95a3' : '#a8b0bd');
  px(dx, dy + shut - 1, dw, 1, '#5f6873');
  px(dx + dw / 2 - 2, dy + shut - 2, 4, 1, '#2a2238');
}

function frame(t) {
  ctx.clearRect(0, 0, cv.width, cv.height);
  if (isFood) drawFood(t); else if (isGarage) drawGarage(); else drawHole();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.pet.onState(s => { state = { ...state, ...s }; });
