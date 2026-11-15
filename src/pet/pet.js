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

// Chapeau tricoté : centré sur la colonne de l'œil, sa dernière rangée posée sur le haut de la tête
// (sur les oreilles pour le lapin et le chat).
function drawHat(id, top, left, flip) {
  const hat = GAMES.HATS.find(h => h.id === id);
  if (!hat) return;
  const c = animal.eye[0];
  let headTop = 0;
  while (headTop < 16 && animal.rows[headTop][c] === '.') headTop++;
  const w = hat.rows[0].length, h = hat.rows.length;
  const col = c - Math.floor(w / 2);
  const x = flip ? 24 - (col + w) : col;
  drawGrid(hat.rows, left + x * SCALE, top + (headTop - h + 1) * SCALE, SCALE, flip, GAMES.PAL);
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

// ---------- Mode Course : la voiture remplace l'animal ----------
const CAR_S = 2;
let wheelSpin = 0, lastFrame = performance.now();
let smoke = [];

function carPose(t) {
  const alt = ms => Math.floor(t / ms) % 2 === 0;
  switch (st.pose) {
    case 'run': return { dy: alt(90) ? -1 : 0 };
    case 'drift': return { dx: alt(50) ? -1 : 1 };
    case 'dance': case 'love': return { dy: alt(220) ? -4 : 0 };
    case 'held': return { dx: Math.sin(t / 150) * 3 };
    case 'dizzy': case 'shake': return { dx: alt(60) ? -1 : 1 };
    case 'land': case 'crouch': return { dy: 1 };
    default: return {};
  }
}

function renderCar(t) {
  const dt = Math.min(0.05, (t - lastFrame) / 1000);
  lastFrame = t;
  wheelSpin += Math.abs(st.spd || 0) * dt / (3 * CAR_S);
  const p = carPose(t);
  const race = st.pose === 'race';
  const flip = !race && st.facing < 0;
  const left = 4 + (p.dx || 0);
  const top = race ? 44 - 9 * CAR_S : FEET_Y - 16 * CAR_S + (p.dy || 0);
  // Fumée des pneus quand la voiture dérape.
  if ((st.pose === 'drift' || (race && st.slip > 6)) && Math.random() < 0.7) {
    const rx = flip ? left + 33 * CAR_S : left + 7 * CAR_S;
    smoke.push({ x: rx + (Math.random() - 0.5) * 6, y: top + 15 * CAR_S, vx: (flip ? 1 : -1) * (20 + Math.random() * 30), r: 3, a: 0.55 });
  }
  smoke = smoke.filter(s => (s.a -= dt * 0.9) > 0);
  ctx.save();
  ctx.translate(44, 44);
  ctx.rotate((st.rot || 0) * Math.PI / 180);
  ctx.translate(-44, -44);
  for (const s of smoke) {
    s.x += s.vx * dt; s.y -= 18 * dt; s.r += 10 * dt;
    ctx.fillStyle = `rgba(225,228,234,${s.a})`;
    ctx.fillRect(Math.round(s.x - s.r), Math.round(s.y - s.r), Math.round(s.r * 2), Math.round(s.r * 2));
  }
  ctx.globalAlpha = 1 - (st.sink || 0);
  RACE_CARS.draw(ctx, st.car, left, top, CAR_S, { flip, spin: wheelSpin });
  ctx.restore();
  if (st.emo) drawBubble(st.emo, t);
  carSounds();
}

// Sons de la voiture : enregistrements CC0 (src/sounds/cars). Le ralenti tourne en boucle et monte
// dans les tours avec la vitesse, une montée en régime part au démarrage, un passage à chaque tour de
// course, le crissement pendant les dérapages et le klaxon au clic.
const FAMILY = {
  flat6: { idle: 'flat6-idle', rev: 'flat6-rev', pass: 'flat6-pass' },
  v12: { idle: 'v12-idle', rev: 'v12-rev', pass: 'v12-pass' },
  v8: { idle: 'v8-idle', rev: 'v8-rev', pass: 'v8-pass' },
  sport: { idle: 'flat6-idle', rev: 'sport-rev', pass: 'v12-pass', pitch: 1.25 },
};
const buffers = {};
function sample(name) {
  if (!buffers[name]) {
    buffers[name] = window.pet.sound(name).then(u8 => (u8 ? audio.decodeAudioData(u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength)) : null)).catch(() => null);
  }
  return buffers[name];
}
const MOVING = ['run', 'walk', 'race', 'drift'];
let engine = null, skid = null, lastPose = 'idle', lastSpd = 0, movedAt = 0;

function carInfo() {
  const c = RACE_CARS.CARS.find(x => x.id === st.car) || RACE_CARS.CARS[0];
  const f = FAMILY[c.engine.family] || FAMILY.sport;
  return { f, pitch: c.engine.pitch * (f.pitch || 1) };
}

function loop(name, gain) {
  const g = audio.createGain();
  g.gain.value = 0;
  g.connect(audio.destination);
  const h = { g, src: null, name };
  sample(name).then(b => {
    if (!b || h.stopped) return;
    h.src = audio.createBufferSource();
    h.src.buffer = b;
    h.src.loop = true;
    h.src.connect(g);
    h.src.start();
  });
  return h;
}
function stopLoop(h) { if (!h) return; h.stopped = true; try { h.src && h.src.stop(); } catch { /* déjà arrêté */ } h.g.disconnect(); }

function oneShot(name, gain, rate = 1) {
  if (st.mute) return;
  audio = audio || new AudioContext();
  sample(name).then(b => {
    if (!b) return;
    const src = audio.createBufferSource(), g = audio.createGain();
    src.buffer = b; src.playbackRate.value = rate; g.gain.value = gain;
    src.connect(g).connect(audio.destination);
    src.start();
  });
}

function carSounds() {
  audio = audio || new AudioContext();
  const now = audio.currentTime;
  const { f, pitch } = carInfo();
  const moving = MOVING.includes(st.pose);
  if (moving) movedAt = performance.now();
  if (!engine || engine.name !== f.idle) { stopLoop(engine); engine = loop(f.idle); }
  // Moteur : plus fort en roulant, ralenti quelques secondes après l'arrêt, puis coupé.
  const awake = performance.now() - movedAt < 6000 && !(st.sink > 0.5);
  const vol = st.mute || !awake ? 0 : st.pose === 'race' ? 0.45 : moving ? 0.28 : 0.12;
  engine.g.gain.setTargetAtTime(vol, now, 0.2);
  if (engine.src) engine.src.playbackRate.setTargetAtTime(Math.min(2.4, pitch * (0.9 + Math.abs(st.spd || 0) / 520)), now, 0.15);
  // Montée en régime au démarrage (et au départ de la course).
  const spd = Math.abs(st.spd || 0);
  if ((moving && !MOVING.includes(lastPose) && st.pose !== 'drift') || (st.pose === 'race' && lastSpd === 0 && spd > 0)) oneShot(f.rev, 0.4, pitch);
  lastPose = st.pose; lastSpd = spd;
  const skidding = (st.pose === 'drift' || (st.pose === 'race' && st.slip > 6)) && !st.mute;
  if (!skid) skid = loop('skid');
  skid.g.gain.setTargetAtTime(skidding ? 0.3 : 0, now, 0.05);
}

function honk() {
  if (st.pose === 'race') { const { f, pitch } = carInfo(); oneShot(f.pass, 0.5, pitch); return; }
  oneShot('horn', 0.45);
}

function render(t) {
  ctx.clearRect(0, 0, cv.width, cv.height);
  if (st.car) { renderCar(t); requestAnimationFrame(render); return; }
  if (engine) engine.g.gain.value = 0;
  if (skid) skid.g.gain.value = 0;
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
  if (st.hat) drawHat(st.hat, top + (p.faceDy || 0) * SCALE, LEFT + (p.dx || 0), flip);
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
  if (lastSound !== null && s.sound > lastSound) { if (s.car) honk(); else squeak(); }
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
