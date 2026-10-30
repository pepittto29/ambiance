// Rendu pixel art du compagnon de bureau. Les animaux sont décrits dans sprites.js ;
// toutes les poses (marche, saut, sommeil, repas…) et les expressions sont dérivées du dessin de base.
// Fenêtre de 88 x 88 : les pattes sont en (44, 81) avant rotation.
const SCALE = 3;
const FEET_Y = 81;
const LEFT = 8;
const EXTRA = { b: '#5bb6ff', r: '#e8455d', y: '#f6c945', o: '#d99a1e', w: '#ffffff', k: '#2a2238' };

let animal = null;
let FR = null;

function buildFrames(a) {
  const base = a.rows.map(r => r.split(''));
  const blank = () => Array(24).fill('.');
  const clone = () => base.map(r => r.slice());
  // Repère les deux pattes sur la rangée 15 pour pouvoir les déplacer.
  const feet = [];
  base[15].forEach((c, x) => {
    if (c === '.') return;
    const last = feet[feet.length - 1];
    if (last && last.e === x - 1) last.e = x; else feet.push({ s: x, e: x });
  });
  const placeFeet = (rows, shifts, row = 15) => {
    const line = blank();
    feet.forEach((f, i) => {
      for (let x = f.s; x <= f.e; x++) {
        const nx = x + (shifts[i] || 0);
        if (nx >= 0 && nx < 24) line[nx] = base[15][x];
      }
    });
    rows[row] = line;
  };
  const lowered = by => {
    const rows = base.map(() => blank());
    for (let y = 0; y <= 14; y++) if (y + by <= 16) rows[y + by] = base[y].slice();
    return rows;
  };
  const [nx, ny] = a.nose;

  const F = {
    idle: clone(),
    walkA: clone(), walkB: clone(), jump: clone(),
    sit: lowered(1),
    sleep: lowered(1),
    eat: clone(),
    sniff: clone(),
  };
  placeFeet(F.walkA, [-1, 1]);
  placeFeet(F.walkB, [1, -1]);
  placeFeet(F.jump, [-2, 2]);
  placeFeet(F.jump, [-3, 3], 16);
  // Tête baissée pour grignoter.
  for (let y = 11; y >= 1; y--) for (let x = a.head; x < 24; x++) F.eat[y + 1][x] = F.eat[y][x];
  for (let x = a.head; x < 24; x++) F.eat[1][x] = '.';
  F.eat[0] = blank();
  // Le nez qui remue.
  F.sniff[ny][nx] = F.sniff[ny][nx - 1];
  if (ny > 0) F.sniff[ny - 1][nx] = 'n';
  F.fall = F.jump;
  return F;
}

function applyFace(rows, face, a, dy = 0) {
  const [ex, ey0] = a.eye;
  const ey = ey0 + dy;
  const bg = rows[ey][ex - 1];
  const set = (x, y, c) => { if (rows[y] && x >= 0 && x < 24) rows[y][x] = c; };
  switch (face) {
    case 'closed':
      set(ex, ey, bg); set(ex + 1, ey, bg); set(ex, ey + 1, 'k'); set(ex + 1, ey + 1, 'k');
      break;
    case 'happy':
      set(ex, ey, bg); set(ex + 1, ey, 'k'); set(ex, ey + 1, 'k'); set(ex + 1, ey + 1, bg);
      set(ex - 1, ey + 2, 'p');
      break;
    case 'wide':
      set(ex - 1, ey, 'e'); set(ex - 1, ey + 1, 'e');
      break;
    case 'tear':
      set(ex + 1, ey + 2, 'b'); set(ex + 1, ey + 3, 'b');
      break;
    case 'angry':
      set(ex - 1, ey - 1, 'k'); set(ex, ey - 1, 'k'); set(ex + 1, ey, 'e');
      break;
    case 'dizzy':
      set(ex, ey, 'w'); set(ex + 1, ey, 'e'); set(ex, ey + 1, 'e'); set(ex + 1, ey + 1, 'w');
      break;
    default:
  }
}

const GLYPHS = {
  '!': ['..k..', '..k..', '..k..', '.....', '..k..'],
  '?': ['.kkk.', '....k', '..kk.', '.....', '..k..'],
  '♥': ['.r.r.', 'rrrrr', 'rrrrr', '.rrr.', '..r..'],
  'Z': ['kkkk.', '..k..', '.k...', 'kkkk.', '.....'],
  '♪': ['..kk.', '..k.k', '..k..', 'kkk..', 'kk...'],
  '💢': ['.r.r.', 'rr.rr', '.....', 'rr.rr', '.r.r.'],
  drop: ['..b..', '.bb..', 'bbbb.', 'bbbb.', '.bb..'],
  '…': ['.....', '.....', 'k.k.k', '.....', '.....'],
  '★': ['..y..', '.yyy.', 'yyyyy', '.y.y.', 'y...y'],
  '✦': ['..y..', '..y..', 'yy.yy', '..y..', '..y..'],
  cheese: ['....y', '..yyy', 'yyoyy', 'yyyyy', 'yoyyo'],
  carrot: ['...kk', '..ok.', '.oo..', 'oo...', 'o....'],
  fish: ['.....', 'b.bb.', 'bbbbk', 'b.bb.', '.....'],
  home: ['..k..', '.kkk.', 'kkkkk', '.k.k.', '.kkk.'],
};

const cv = document.getElementById('c');
const ctx = cv.getContext('2d', { willReadFrequently: true });
let st = { animal: 'souris', pose: 'idle', face: 'normal', emo: null, facing: 1, rot: 0, sink: 0, sound: 0 };
let poseSince = performance.now();
let lastSound = null;
let audio = null;

function setAnimal(name) {
  const a = ANIMALS[name] || ANIMALS.souris;
  if (a === animal) return;
  animal = a;
  FR = buildFrames(a);
}
setAnimal('souris');

function drawGrid(rows, ox, oy, scale, flip, pal) {
  const w = rows[0].length;
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < w; x++) {
      const c = rows[y][flip ? w - 1 - x : x];
      if (c === '.' || !c) continue;
      ctx.fillStyle = pal[c] || EXTRA[c];
      ctx.fillRect(ox + x * scale, oy + y * scale, scale, scale);
    }
  }
}

function pose(t) {
  const age = t - poseSince;
  const alt = ms => Math.floor(t / ms) % 2 === 0;
  switch (st.pose) {
    case 'walk': return { rows: alt(160) ? FR.walkA : FR.walkB, dy: alt(160) ? 0 : -1 };
    case 'run': return { rows: alt(70) ? FR.walkA : FR.walkB, dy: alt(70) ? -2 : 0 };
    case 'jump': return { rows: FR.jump };
    case 'fall': return { rows: FR.fall, face: 'wide' };
    case 'held': return { rows: FR.jump, dx: Math.sin(t / 150) * 3 };
    case 'crouch': case 'land': return { rows: FR.sit, faceDy: 1 };
    case 'sleep': return { rows: FR.sleep, faceDy: 1, dy: Math.floor(t / 900) % 2 };
    case 'sit': return { rows: FR.sit, faceDy: 1 };
    case 'sniff': return { rows: alt(180) ? FR.sniff : FR.idle };
    case 'eat': return alt(220) ? { rows: FR.eat, faceDy: 1 } : { rows: FR.idle };
    case 'dance': return { rows: alt(250) ? FR.jump : FR.idle, dy: alt(250) ? -6 : 0, flip: Math.floor(t / 500) % 2 === 0 };
    case 'love': return { rows: FR.idle, dy: alt(300) ? -1 : 0 };
    case 'dizzy': return { rows: FR.idle, dx: Math.sin(t / 120) * 2 };
    case 'shake': return { rows: FR.idle, dx: age < 1000 ? (alt(40) ? -1 : 1) : 0 };
    default: return { rows: FR.idle };
  }
}

function drawBubble(sym, t) {
  const g = GLYPHS[sym];
  if (!g) return;
  const s = 2;
  const bx = st.facing > 0 ? 62 : 6;
  const wobble = sym === 'Z' || sym === '★' ? Math.sin(t / 300) * 2 : 0;
  const by = st.flipBubble ? 64 + wobble : 4 + wobble;
  ctx.fillStyle = EXTRA.k;
  ctx.fillRect(bx - s, by, 11 * s, 9 * s);
  ctx.fillRect(bx, by - s, 9 * s, 11 * s);
  ctx.fillStyle = EXTRA.w;
  ctx.fillRect(bx, by, 9 * s, 9 * s);
  drawGrid(g, bx + 2 * s, by + 2 * s, s, false, EXTRA);
}

function render(t) {
  ctx.clearRect(0, 0, cv.width, cv.height);
  const p = pose(t);
  const rows = p.rows.map(r => r.slice());
  const face = st.face === 'normal' && (t % 3400) < 130 ? 'closed' : (p.face && st.face === 'normal' ? p.face : st.face);
  applyFace(rows, face, animal, p.faceDy || 0);
  const flip = (st.facing < 0) !== !!p.flip;
  ctx.save();
  ctx.translate(44, 44);
  ctx.rotate((st.rot || 0) * Math.PI / 180);
  ctx.translate(-44, -44);
  if (st.sink > 0) {
    // Il s'enfonce dans un trou : on cache tout ce qui passe sous le sol.
    ctx.beginPath();
    ctx.rect(0, 0, cv.width, FEET_Y);
    ctx.clip();
  }
  const top = FEET_Y - 16 * SCALE + (p.dy || 0) + st.sink * 54;
  drawGrid(rows, LEFT + (p.dx || 0), top, SCALE, flip, animal.pal);
  ctx.restore();
  if (st.emo) drawBubble(st.emo, t);
  requestAnimationFrame(render);
}
requestAnimationFrame(render);

function squeak() {
  audio = audio || new AudioContext();
  const t = audio.currentTime;
  // Chaque animal a sa petite voix rétro.
  const voice = { souris: [1400, 2200], hamster: [1700, 2500], lapin: [900, 1400], chat: [600, 900] }[st.animal] || [1400, 2200];
  for (const o of [0, 0.11]) {
    const osc = audio.createOscillator();
    const g = audio.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(voice[0] * (1 + o), t + o);
    osc.frequency.exponentialRampToValueAtTime(voice[1] * (1 + o), t + o + 0.08);
    g.gain.setValueAtTime(0.0001, t + o);
    g.gain.exponentialRampToValueAtTime(0.07, t + o + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o + 0.09);
    osc.connect(g).connect(audio.destination);
    osc.start(t + o);
    osc.stop(t + o + 0.1);
  }
}

window.pet.onState(s => {
  if (s.pose !== st.pose) poseSince = performance.now();
  if (lastSound !== null && s.sound > lastSound) squeak();
  lastSound = s.sound;
  if (s.animal) setAnimal(s.animal);
  st = s;
});

// La fenêtre laisse passer les clics sauf sur les pixels de l'animal.
let overPet = false;
function hit(x, y) {
  if (x < 0 || y < 0 || x >= cv.width || y >= cv.height) return false;
  return ctx.getImageData(x, y, 1, 1).data[3] > 0;
}
window.addEventListener('mousemove', e => {
  const over = hit(e.offsetX, e.offsetY);
  if (over !== overPet) {
    overPet = over;
    window.pet.ignore(!over);
    window.pet.hover(over);
  }
});
window.addEventListener('mouseleave', () => {
  if (overPet) { overPet = false; window.pet.ignore(true); window.pet.hover(false); }
});
window.addEventListener('mousedown', e => { if (e.button === 0 && overPet) window.pet.down(); });
window.addEventListener('mouseup', e => { if (e.button === 0) window.pet.up(); });
