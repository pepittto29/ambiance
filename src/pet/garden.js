// Jardinière du compagnon : un bac en bois à trois emplacements, dessiné en pixels (2 px par pixel).
// Un clic sur un emplacement vide plante la graine choisie, un clic sur une plante mûre la récolte.
const { PAL, PLANTS, SPROUT } = GAMES;
const S = 2;
const cv = document.getElementById('c');
const ctx = cv.getContext('2d', { willReadFrequently: true });
const CENTERS = [9, 24, 39];
const SOIL = 21; // rangée de la terre ; les plantes poussent au-dessus
const COL = { k: '#3b2414', n: '#4a3020', m: '#5e3d26', N: '#9a6a3c', S: '#7d532c', h: '#b98552', d: '#7fc8ff', bar: '#2a1a10', ok: '#8ee06a', f: '#f6c945' };

let st = { pots: [null, null, null], raining: false };
let hover = -1;
let popups = []; // petits messages qui s'envolent au-dessus d'un emplacement

const px = (x, y, c) => { ctx.fillStyle = c; ctx.fillRect(x * S, y * S, S, S); };
const plantById = id => PLANTS.find(p => p.id === id);

function grid(rows, cx, bottom, pal = PAL) {
  const w = rows[0].length;
  const x0 = cx - Math.floor(w / 2), y0 = bottom - rows.length + 1;
  rows.forEach((r, y) => [...r].forEach((c, x) => { if (c !== '.') px(x0 + x, y0 + y, pal[c] || COL[c]); }));
}

function drawBox() {
  for (let x = 1; x <= 46; x++) { px(x, SOIL - 1, COL.k); px(x, 27, COL.k); }
  for (let y = SOIL - 1; y <= 27; y++) { px(1, y, COL.k); px(46, y, COL.k); }
  for (let x = 2; x <= 45; x++) {
    px(x, SOIL, (x * 7) % 5 === 0 ? COL.m : COL.n);
    for (let y = SOIL + 1; y <= 26; y++) px(x, y, y === SOIL + 1 ? COL.h : (y === 24 || x % 15 === 1) ? COL.S : COL.N);
  }
}

function drawPot(i, p, t) {
  const cx = CENTERS[i];
  if (hover === i) {
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect((cx - 7) * S, 4 * S, 15 * S, (SOIL - 4) * S);
  }
  if (!p) {
    // Emplacement libre : un petit monticule, et un « + » au survol.
    grid(['.mmm.', 'mmmmm'], cx, SOIL - 1, COL);
    if (hover === i) grid(['.f.', 'fff', '.f.'], cx, SOIL - 4, COL);
    return;
  }
  const plant = plantById(p.plant);
  const frac = Math.min(1, p.grown / plant.minutes);
  if (p.ripe) {
    grid(plant.rows, cx, SOIL - 1);
    // Une étincelle qui clignote : c'est prêt à récolter.
    if (Math.floor(t / 350) % 3 !== 0) grid(['.f.', 'f.f', '.f.'], cx + 4, SOIL - 9, COL);
  } else {
    grid(frac < 0.4 ? SPROUT[0] : SPROUT[1], cx, SOIL - 1);
  }
  // Barre de pousse sur le devant du bac.
  for (let x = 0; x < 9; x++) px(cx - 4 + x, 25, x < Math.round(frac * 9) ? COL.ok : COL.bar);
}

function drawRain(t) {
  for (let i = 0; i < 9; i++) {
    const x = (i * 5 + 3) % 44 + 2;
    const y = Math.floor((t / 60 + i * 7) % 18);
    px(x, y, COL.d);
    px(x, y + 1, COL.d);
  }
}

function frame(t) {
  ctx.clearRect(0, 0, cv.width, cv.height);
  if (st.raining && st.pots.some(Boolean)) drawRain(t);
  drawBox();
  st.pots.forEach((p, i) => drawPot(i, p, t));
  popups = popups.filter(m => t - m.t0 < 1800);
  ctx.font = 'bold 10px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  for (const m of popups) {
    const k = (t - m.t0) / 1800;
    const y = 30 - k * 22;
    ctx.globalAlpha = 1 - k * k;
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#2a1a10';
    ctx.strokeText(m.text, m.x, y);
    ctx.fillStyle = m.color;
    ctx.fillText(m.text, m.x, y);
    ctx.globalAlpha = 1;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.pet.onState(s => { st = s; });

// La fenêtre laisse passer les clics sauf sur le bac et les plantes.
function potAt(x, y) {
  if (x < 0 || y < 0 || x >= cv.width || y >= cv.height) return -1;
  const solid = ctx.getImageData(x, y, 1, 1).data[3] > 0;
  const gx = x / S, gy = y / S;
  if (!solid && !(gy > 4 && gy < SOIL && gx > 1 && gx < 47)) return -1;
  return gx < 17 ? 0 : gx < 32 ? 1 : 2;
}
let over = false;
cv.addEventListener('mousemove', e => {
  hover = potAt(e.offsetX, e.offsetY);
  const now = hover >= 0;
  if (now !== over) { over = now; window.pet.gardenIgnore(!now); cv.classList.toggle('over', now); }
});
cv.addEventListener('mouseleave', () => { hover = -1; if (over) { over = false; window.pet.gardenIgnore(true); cv.classList.remove('over'); } });
cv.addEventListener('click', async e => {
  const i = potAt(e.offsetX, e.offsetY);
  if (i < 0) return;
  const r = await window.pet.gardenClick(i);
  const x = CENTERS[i] * S;
  const say = (text, color = '#ffffff') => popups.push({ text, x, color, t0: performance.now() });
  if (r.harvested) { say(`+${r.gain} ★`, '#f6c945'); if (r.hat) setTimeout(() => say('Un chapeau !', '#c9a6ff'), 500); }
  else if (r.planted) say(plantById(r.planted).name);
  else if (r.left) say(`${r.left} min`);
});
