// Compagnon de bureau façon jeu de plateforme (souris, hamster, lapin ou chat). Il marche sur les
// bords des fenêtres, les lignes d'interface visibles à l'écran et le bas de l'écran (pet-world.js),
// saute de l'une à l'autre, grimpe le long des bords de l'écran, tombe quand sa surface disparaît,
// va chercher à manger tous les quarts d'heure, rentre dans son terrier et apprend les habitudes de
// l'utilisateur (pet-memory.js). Tout le comportement est calculé ici ; src/pet/ ne fait que dessiner.
const { BrowserWindow, screen, ipcMain } = require('electron');
const path = require('path');
const world = require('./pet-world');
const memory = require('./pet-memory');
const tasks = require('./tasks');

let hook = null;
try { hook = require('uiohook-napi').uIOhook; } catch { /* clics globaux indisponibles */ }

const SIZE = 88;
// Point de la fenêtre où se trouvent les pattes, selon la surface sur laquelle il se tient.
const ANCHOR = { floor: [44, 81], air: [44, 81], 'wall-l': [7, 44], 'wall-r': [81, 44], ceil: [44, 7] };
const ROTATION = { floor: 0, air: 0, 'wall-l': 90, 'wall-r': -90, ceil: 180 };
const G = 1800;
const WALK = 55, RUN = 190, CLIMB = 85;
const FOOD_EVERY = 15 * 60000;
const FOOD = { souris: 'cheese', hamster: 'cheese', lapin: 'carrot', chat: 'fish' };

let petWin = null;
let loop = null;
let soundOn = true;
let opts = { screenLines: true, cheese: true, holes: true, animal: 'souris', burrow: null, energy: 'normal', reminders: true };
const ANIMAL_NAME = { souris: 'ta souris', hamster: 'ton hamster', lapin: 'ton lapin', chat: 'ton chat' };
const REMIND_EVERY = 35 * 60000;
let handlers = { openTasks: () => {} };

// Le mode actif règle l'énergie : « calme » se comporte comme quand l'utilisateur est concentré.
const calm = () => opts.energy === 'calme' || memory.busy();

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sign = v => (v < 0 ? -1 : 1);
const now = () => Date.now();
const pick = list => list[Math.floor(Math.random() * list.length)];

const pet = {
  x: 0, y: 0, vx: 0, vy: 0, speed: 0,
  mode: 'air', support: null, supportX: null,
  act: 'fall', until: 0, actStart: 0, tx: 0, maxSpeed: WALK, facing: 1,
  goal: null, climb: null, climbDir: -1, ceilUntil: 0, pending: null,
  emo: null, emoUntil: 0, face: null, faceUntil: 0,
  spin: 0, bounces: 0,
  hover: false, held: false, dragging: false, grab: { x: 0, y: 0 }, downAt: { x: 0, y: 0 }, trail: [],
  clicks: [], sound: 0,
  hidden: false, hole: null, napping: false,
  lastActive: now(), lastFood: now(), lastPetted: 0,
};
let cursor = { x: 0, y: 0, moved: 0 };
let lastTick = now();
let lastWindows = 0;
let lastSave = now();
let lastSent = '';

let food = null;
let nextFood = 0;
let holes = [];
let nextHole = 0;
let holeSeq = 0;
let burrow = null;

// ---------- Utilitaires ----------
function area(x = pet.x, y = pet.y) { return world.displayAt(x, y).workArea; }

function emote(sym, ms = 1500, face = null) {
  pet.emo = sym;
  pet.emoUntil = now() + ms;
  if (face) { pet.face = face; pet.faceUntil = now() + ms; }
}

function setAct(act, ms = 0) {
  pet.act = act;
  pet.actStart = now();
  pet.until = now() + ms;
}

// La vitesse varie un peu d'un trajet à l'autre et monte progressivement (voir updateFloor).
function walkTo(x, run = false) {
  if (sign(x - pet.x) !== pet.facing && Math.abs(x - pet.x) > 4 && pet.speed > 20) pet.speed = 0;
  pet.tx = x;
  pet.maxSpeed = (run ? RUN : WALK) * rand(0.85, 1.15);
  setAct(run ? 'run' : 'walk');
}

function startFall(vx = 0, vy = 0, act = 'fall') {
  pet.mode = 'air';
  pet.support = null;
  pet.vx = vx;
  pet.vy = vy;
  pet.speed = 0;
  setAct(act);
}

// Un saut commence par une petite préparation (accroupi), puis l'élan est calculé pour
// atterrir au point visé.
function jumpTo(tx, ty) {
  pet.facing = sign(tx - pet.x);
  pet.pending = { tx, ty };
  setAct('crouch', 170);
}

function launch() {
  const { tx, ty } = pet.pending;
  pet.pending = null;
  const dy = ty - pet.y;
  const h = Math.max(45, -dy + 45);
  const vy0 = -Math.sqrt(2 * G * h);
  const t = (-vy0 + Math.sqrt(Math.max(0, vy0 * vy0 + 2 * G * dy))) / G;
  startFall(clamp((tx - pet.x) / Math.max(t, 0.2), -650, 650), vy0, 'jump');
}

function pathClear(p, x0, x1) {
  const step = 18 * sign(x1 - x0);
  for (let x = x0; Math.abs(x - x0) < Math.abs(x1 - x0); x += step) if (!world.solidAt(p, x)) return false;
  return world.solidAt(p, x1);
}

function ownWindows() {
  return [petWin, food?.win, burrow?.win, ...holes.map(h => h.win)].filter(w => w && !w.isDestroyed());
}

function ownHandles() {
  return new Set(ownWindows().map(w => w.getNativeWindowHandle().readBigUInt64LE(0)));
}

function itemWindow(kind, w, h) {
  const win = new BrowserWindow({
    width: w, height: h, transparent: true, frame: false, resizable: false, movable: false,
    skipTaskbar: true, focusable: false, hasShadow: false, show: false, alwaysOnTop: true,
    webPreferences: { preload: path.join(__dirname, 'pet-preload.js'), backgroundThrottling: false },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setIgnoreMouseEvents(true);
  win.loadFile(path.join(__dirname, 'src', 'pet', 'item.html'), { query: { kind } });
  win.once('ready-to-show', () => {
    win.showInactive();
    if (petWin && !petWin.isDestroyed()) petWin.moveTop();
  });
  return win;
}

function closeWin(w) { if (w && !w.isDestroyed()) w.destroy(); }

// Choisit, parmi quelques points d'une surface, celui où l'utilisateur travaille le moins.
function quietSpot(p, around, span) {
  let best = null;
  for (let i = 0; i < 4; i++) {
    const x = clamp(around + rand(-span, span), p.x1 + 10, p.x2 - 10);
    const score = memory.heatAt(x, p.y) + Math.abs(x - around) / 4000;
    if (!best || score < best.score) best = { x, score };
  }
  return best.x;
}

// ---------- Objectifs et déplacements ----------
function goalTarget(g) {
  if (g.type === 'food') return food && food.landed ? { x: food.x, y: food.y } : null;
  if (g.type === 'hole') return g.hole === burrow || holes.includes(g.hole) ? (g.hole.open > 0.8 ? { x: g.hole.x, y: g.hole.y } : null) : null;
  if (g.type === 'cursor') {
    const s = world.surfaceBelow(cursor.x, cursor.y - 4);
    return s ? { x: cursor.x, y: s.y } : null;
  }
  return { x: g.x, y: g.y };
}

function setGoal(type, ms, extra = {}) {
  pet.goal = { type, until: now() + ms, reach: 16, ...extra };
}

function pickGoal() {
  const t = now();
  const busy = calm();
  if (opts.cheese && food && food.landed) {
    setGoal('food', 120000, { reach: 24, run: true });
    emote(food.kind, 2000);
    return;
  }
  // Fatigué, ou l'utilisateur est concentré : il rentre se reposer au terrier.
  const sleepy = t - pet.lastActive > 120000 || memory.quietHour();
  if (burrow && burrow.open > 0.8 && ((sleepy && Math.random() < 0.3) || (busy && Math.random() < 0.12))) {
    setGoal('hole', 60000, { hole: burrow, reach: 10, nap: true });
    emote('home', 1600, sleepy ? 'closed' : null);
    return;
  }
  const open = holes.filter(h => h.open > 0.8 && !h.exit);
  if (open.length && Math.random() < 0.2) {
    setGoal('hole', 45000, { hole: pick(open), reach: 10 });
    emote(Math.random() < 0.5 ? '?' : '✦', 1400);
    return;
  }
  if (!busy && t - cursor.moved < 2500 && Math.random() < 0.18) {
    setGoal('cursor', rand(5000, 9000), { run: Math.random() < 0.3 });
    emote(Math.random() < 0.5 ? '?' : '♥', 1200);
    return;
  }
  const fav = memory.favorite();
  if (fav && Math.random() < 0.06) {
    const s = world.surfaceBelow(fav.x, fav.y - 6);
    if (s && Math.abs(s.y - fav.y) < 40) { setGoal('explore', 25000, { x: fav.x, y: s.y }); emote('♥', 1000); return; }
  }
  if (!busy && Math.random() < 0.07) {
    const s = world.randomSurface(0.3);
    if (s) setGoal('explore', 25000, { x: s.x, y: s.p.y });
  }
}

function bestJump(p, tgt, curDist) {
  let best = null;
  for (const q of world.jumpTargets(pet.x, p.y, 340, 240, 260)) {
    if (q.id === p.id) continue;
    const qx = clamp(tgt.x, Math.max(q.x1 + 10, pet.x - 340), Math.min(q.x2 - 10, pet.x + 340));
    if (qx < q.x1 || qx > q.x2 || !world.solidAt(q, qx)) continue;
    const d = Math.hypot(tgt.x - qx, tgt.y - q.y);
    if (d < curDist - 40 && (!best || d < best.d)) best = { p: q, x: qx, d };
  }
  return best;
}

function navigate() {
  const g = pet.goal;
  const tgt = goalTarget(g);
  if (!tgt) { pet.goal = null; idleActivity(); return; }
  const p = world.byId(pet.support);
  if (!p) return;
  const dist = Math.hypot(tgt.x - pet.x, tgt.y - pet.y);
  if (dist < g.reach) { reachGoal(); return; }
  if (g.type === 'cursor' && dist < 70) {
    pet.facing = sign(tgt.x - pet.x);
    pet.goal = null;
    setAct('love', 1600);
    emote('♥', 1600, 'happy');
    return;
  }
  if (Math.abs(tgt.y - p.y) < 6 && tgt.x >= p.x1 && tgt.x <= p.x2 && pathClear(p, pet.x, tgt.x)) {
    walkTo(tgt.x, g.run);
    return;
  }
  const jump = bestJump(p, tgt, dist);
  if (jump) { jumpTo(jump.x, jump.p.y); return; }
  if (tgt.y > p.y + 15) {
    const right = tgt.x > p.x2 || (tgt.x >= p.x1 && p.x2 - pet.x < pet.x - p.x1);
    walkTo(right ? p.x2 + 14 : p.x1 - 14, g.run);
    return;
  }
  const a = area();
  if (p.kind === 'floor') {
    const left = pet.x - a.x < a.x + a.width - pet.x;
    pet.climb = { side: left ? 'l' : 'r', toY: tgt.y - 30 };
    walkTo(left ? a.x + 14 : a.x + a.width - 14, g.run);
    return;
  }
  walkTo(pet.x - p.x1 < p.x2 - pet.x ? p.x1 - 14 : p.x2 + 14, g.run);
}

function reachGoal() {
  const g = pet.goal;
  pet.goal = null;
  if (g.type === 'food' && food) {
    pet.facing = sign(food.x - pet.x);
    setAct('eat', 3600);
    emote('♥', 1200, 'happy');
  } else if (g.type === 'hole') {
    enterHole(g.hole, g.nap);
  } else {
    setAct('idle', rand(600, 1600));
    if (Math.random() < 0.4) emote(pick(['♪', '✦', '?']), 1000);
  }
}

function idleActivity() {
  const t = now();
  const p = world.byId(pet.support);
  if (!p) return;
  const busy = calm();
  const idleFor = t - pet.lastActive;
  // Il ne reste pas planté sous le curseur là où l'utilisateur travaille : il se pousse.
  if (memory.heatAt(pet.x, pet.y) > 0.6 && Math.hypot(cursor.x - pet.x, cursor.y - pet.y) < 220 && t - cursor.moved < 3000) {
    const tx = quietSpot(p, pet.x + sign(pet.x - cursor.x) * 250, 120);
    if (pathClear(p, pet.x, tx)) { walkTo(tx); if (Math.random() < 0.3) emote('…', 1000); return; }
  }
  const r = Math.random();
  if (busy) {
    // Utilisateur concentré : activités calmes, peu de déplacements.
    if (r < 0.45) setAct('sit', rand(5000, 12000));
    else if (r < 0.6) setAct('sniff', rand(2000, 4000));
    else if (r < 0.75 && idleFor > 30000) { setAct('sleep', rand(20000, 40000)); emote('Z', 1e9, 'closed'); }
    else { const tx = quietSpot(p, pet.x, 120); if (pathClear(p, pet.x, tx)) walkTo(tx); else setAct('idle', 3000); }
    return;
  }
  // Mode joueur : il bouge, saute et danse bien plus souvent.
  if (opts.energy === 'joueur' && r < 0.5) {
    const q = Math.random();
    if (q < 0.35) { setAct('dance', 2400); emote(pick(['♪', '✦', '♥']), 2400, 'happy'); return; }
    if (q < 0.7) {
      const options = world.jumpTargets(pet.x, p.y, 300, 220, 240).filter(o => o.id !== p.id);
      const o = options.length ? pick(options) : null;
      const ox = o ? clamp(pet.x + rand(-280, 280), o.x1 + 10, o.x2 - 10) : 0;
      if (o && world.solidAt(o, ox)) { jumpTo(ox, o.y); return; }
    }
    const tx = clamp(pet.x + rand(-300, 300), p.x1 + 10, p.x2 - 10);
    if (pathClear(p, pet.x, tx)) { walkTo(tx, true); return; }
  }
  if (r < 0.3) {
    const tx = quietSpot(p, pet.x, 220);
    if (pathClear(p, pet.x, tx)) { walkTo(tx, Math.random() < 0.12); return; }
  } else if (r < 0.4) {
    const options = world.jumpTargets(pet.x, p.y, 280, 200, 240).filter(q => q.id !== p.id);
    for (let i = 0; i < 6 && options.length; i++) {
      const q = pick(options);
      const qx = clamp(pet.x + rand(-260, 260), q.x1 + 10, q.x2 - 10);
      if (world.solidAt(q, qx)) { jumpTo(qx, q.y); return; }
    }
  } else if (r < 0.5) {
    setAct('sit', rand(2500, 6000));
    return;
  } else if (r < 0.58) {
    setAct('sniff', rand(1500, 3000));
    return;
  } else if (r < 0.63) {
    setAct('dance', 2400);
    emote('♪', 2400, 'happy');
    return;
  } else if (r < 0.67 && p.kind === 'floor') {
    const a = area();
    const left = pet.x - a.x < a.x + a.width - pet.x;
    pet.climb = { side: left ? 'l' : 'r', toY: rand(a.y + 60, a.y + a.height - 140) };
    walkTo(left ? a.x + 14 : a.x + a.width - 14);
    return;
  } else if (r < 0.72) {
    pet.facing = sign(cursor.x - pet.x);
    setAct('look', 1800);
    if (Math.random() < 0.5) emote('?', 1200);
    return;
  } else if (r < 0.78 && (idleFor > 90000 || memory.quietHour())) {
    setAct('sleep', rand(20000, 50000));
    emote('Z', 1e9, 'closed');
    return;
  } else if (r < 0.83) {
    setAct('bored', 2500);
    const hungry = t - pet.lastFood > FOOD_EVERY;
    emote(hungry ? FOOD[opts.animal] : '…', 2500, Math.random() < 0.3 ? 'tear' : null);
    return;
  }
  setAct('idle', rand(1000, 3500));
}

function think() {
  if (pet.goal && now() > pet.goal.until) {
    if (pet.goal.type === 'food') emote('…', 1800, 'tear');
    pet.goal = null;
  }
  if (!pet.goal) pickGoal();
  if (pet.goal) navigate(); else idleActivity();
}

// ---------- Physique ----------
function land(p, x) {
  const impact = pet.vy;
  pet.x = x;
  pet.y = p.y;
  if (impact > 950 && pet.bounces < 2) {
    pet.bounces++;
    pet.vy = -impact * 0.38;
    pet.vx *= 0.6;
    pet.y = p.y - 1;
    setAct('tumble');
    pet.sound++;
    return;
  }
  const hard = impact > 1500 || pet.bounces > 1;
  const wasFalling = pet.act === 'fall' || pet.act === 'thrown' || pet.act === 'tumble';
  pet.mode = 'floor';
  pet.support = p.id;
  pet.supportX = p.x1;
  pet.vx = pet.vy = 0;
  pet.spin = 0;
  pet.bounces = 0;
  pet.speed = 0;
  if (hard) {
    setAct('dizzy', 2600);
    emote('★', 2600, 'dizzy');
  } else if (wasFalling) {
    setAct('shake', 1200);
    emote('drop', 1200, 'wide');
  } else {
    setAct('land', 160); // petit amorti à l'atterrissage
  }
}

function updateAir(dt) {
  const a = area();
  pet.vy += G * dt;
  let nx = pet.x + pet.vx * dt;
  let ny = pet.y + pet.vy * dt;
  if (nx < a.x + 14) { nx = a.x + 14; pet.vx = Math.abs(pet.vx) * 0.5; }
  if (nx > a.x + a.width - 14) { nx = a.x + a.width - 14; pet.vx = -Math.abs(pet.vx) * 0.5; }
  if (ny < a.y + 80 && pet.vy < 0) { ny = a.y + 80; pet.vy = 0; }
  if (pet.act === 'tumble' || pet.act === 'thrown') pet.spin += (pet.vx * 0.6 + sign(pet.vx) * 400) * dt;
  if (pet.vy > 0) {
    const p = world.landing(nx, pet.y, ny);
    if (p) { land(p, nx); return; }
  }
  pet.x = nx;
  pet.y = ny;
  if (pet.y > a.y + a.height + 300) { pet.y = a.y; pet.vy = 0; }
}

function lostFooting() {
  startFall(pet.facing * 30, 0, 'fall');
  emote('!', 900, 'wide');
}

function updateFloor(dt) {
  const p = world.byId(pet.support);
  if (!p) { lostFooting(); return; }
  // La fenêtre qui le porte a bougé : il suit le mouvement.
  if (pet.supportX !== null && p.x1 !== pet.supportX && Math.abs(p.x1 - pet.supportX) < 500) pet.x += p.x1 - pet.supportX;
  pet.supportX = p.x1;
  pet.y = p.y;
  if (!world.solidAt(p, pet.x)) {
    if (pet.x < p.x1 || pet.x > p.x2) startFall(pet.facing * Math.max(70, pet.speed * 0.9), -90, 'jump');
    else lostFooting();
    return;
  }
  if (pet.act === 'walk' || pet.act === 'run') {
    const dx = pet.tx - pet.x;
    // Accélère au départ, ralentit à l'arrivée.
    const target = Math.min(pet.maxSpeed, Math.abs(dx) * 3 + 15);
    pet.speed += (target - pet.speed) * Math.min(1, dt * 6);
    const step = pet.speed * dt;
    // Au bord d'une surface, il hésite un instant avant de sauter dans le vide.
    const nextX = pet.x + sign(dx) * Math.max(step, 6);
    if (!world.solidAt(p, nextX) && !pet.edgeChecked && Math.random() < 0.6) {
      pet.edgeChecked = true;
      pet.facing = sign(dx);
      setAct('look', rand(300, 700));
      if (Math.random() < 0.4) emote('?', 600);
      return;
    }
    if (Math.abs(dx) <= Math.max(step, 0.5)) {
      pet.x = pet.tx;
      pet.speed = 0;
      pet.edgeChecked = false;
      arrive();
    } else {
      pet.facing = sign(dx);
      pet.x += sign(dx) * step;
    }
    return;
  }
  if (pet.act === 'crouch') { if (now() > pet.until) launch(); return; }
  if (pet.act === 'eat') { updateEating(); return; }
  if (pet.act === 'look' && pet.edgeChecked && now() > pet.until) {
    setAct(pet.maxSpeed > WALK * 1.3 ? 'run' : 'walk');
    return;
  }
  if (now() > pet.until) {
    if (pet.act === 'sleep') pet.emo = null;
    pet.edgeChecked = false;
    think();
  }
}

function arrive() {
  if (pet.climb) {
    const a = area();
    const left = pet.climb.side === 'l';
    pet.mode = left ? 'wall-l' : 'wall-r';
    pet.support = null;
    pet.x = left ? a.x : a.x + a.width;
    pet.y -= 37;
    pet.climbDir = -1;
    setAct('climb');
    return;
  }
  if (pet.goal) { setAct('idle', 150); return; }
  setAct('idle', rand(500, 1800));
}

function updateWall(dt) {
  const a = area();
  const left = pet.mode === 'wall-l';
  const floorY = a.y + a.height;
  pet.facing = left ? pet.climbDir : -pet.climbDir;
  if (pet.act === 'climb') {
    pet.y += pet.climbDir * CLIMB * dt;
    if (pet.climbDir > 0 && pet.y + 37 >= floorY) {
      pet.mode = 'floor';
      pet.x = left ? a.x + 37 : a.x + a.width - 37;
      pet.y = floorY;
      const p = world.landing(pet.x, floorY - 4, floorY + 4);
      pet.support = p ? p.id : null;
      pet.supportX = p ? p.x1 : null;
      pet.climb = null;
      setAct('idle', 600);
      return;
    }
    if (pet.climbDir < 0 && pet.y <= a.y + 44) {
      pet.y = a.y + 44;
      if (Math.random() < 0.6) enterCeiling(left);
      else setAct('hang', 1400);
      return;
    }
    if (pet.climb && pet.climbDir < 0 && pet.y <= pet.climb.toY) {
      pet.climb.leap = true;
      setAct('hang', 500);
    }
    return;
  }
  if (now() < pet.until) return;
  if (pet.climb && pet.climb.leap) {
    const tgt = pet.goal ? goalTarget(pet.goal) : null;
    pet.climb = null;
    leapFromWall(left, tgt);
    return;
  }
  const r = Math.random();
  if (r < 0.35) { pet.climbDir = -1; setAct('climb'); }
  else if (r < 0.7) { pet.climbDir = 1; setAct('climb'); }
  else leapFromWall(left, null);
}

function leapFromWall(left, tgt) {
  pet.mode = 'air';
  pet.x += left ? 37 : -37;
  pet.y += 37;
  if (tgt) {
    pet.pending = { tx: tgt.x, ty: tgt.y };
    launch();
    return;
  }
  pet.facing = left ? 1 : -1;
  startFall((left ? 1 : -1) * rand(200, 360), -rand(250, 520), 'jump');
  emote(pick(['♪', '!', '✦']), 900);
}

function enterCeiling(fromLeft) {
  const a = area();
  pet.mode = 'ceil';
  pet.y = a.y;
  pet.x = fromLeft ? a.x + 30 : a.x + a.width - 30;
  pet.ceilUntil = now() + rand(4000, 10000);
  pet.tx = clamp(pet.x + (fromLeft ? 1 : -1) * rand(150, 500), a.x + 40, a.x + a.width - 40);
  setAct('walk');
}

function updateCeiling(dt) {
  const a = area();
  pet.y = a.y;
  if (now() > pet.ceilUntil) {
    pet.mode = 'air';
    pet.y = a.y + 85;
    startFall(0, 0, 'fall');
    emote(pick(['!', '♪']), 900, 'wide');
    return;
  }
  const dx = pet.tx - pet.x;
  if (Math.abs(dx) <= WALK * dt) pet.tx = clamp(pet.x + rand(-400, 400), a.x + 40, a.x + a.width - 40);
  else pet.x += sign(dx) * WALK * dt;
  pet.facing = -sign(dx);
}

function updateHeld() {
  const cur = screen.getCursorScreenPoint();
  if (!pet.dragging && Math.hypot(cur.x - pet.downAt.x, cur.y - pet.downAt.y) > 5) {
    pet.dragging = true;
    pet.mode = 'air';
    pet.support = null;
    setAct('held');
    emote('!', 900, 'wide');
  }
  if (!pet.dragging) return;
  pet.x = cur.x - pet.grab.x;
  pet.y = cur.y - pet.grab.y;
  pet.trail.push({ x: cur.x, y: cur.y, t: now() });
  pet.trail = pet.trail.filter(p => now() - p.t < 120);
}

// ---------- Nourriture ----------
function spawnFood() {
  if (food || !petWin) return;
  const s = world.randomSurface(0.5);
  const a = area(s ? s.x : pet.x, s ? s.p.y : pet.y);
  const x = s ? s.x : a.x + a.width / 2;
  const kind = FOOD[opts.animal] || 'cheese';
  food = { kind, x, y: a.y + 10, vy: 0, landed: false, bites: 0, support: null, supportX: null, win: itemWindow(kind, 32, 32) };
  nextFood = now() + FOOD_EVERY;
}

function updateFood(dt) {
  if (!food) return;
  if (!food.landed) {
    food.vy += G * dt;
    const ny = food.y + food.vy * dt;
    const p = world.landing(food.x, food.y, ny);
    if (p) {
      Object.assign(food, { y: p.y, vy: 0, landed: true, support: p.id, supportX: p.x1 });
      if (pet.act !== 'sleep' && !pet.hidden) emote(food.kind, 1600, 'wide');
    } else {
      food.y = ny;
    }
  } else {
    const p = world.byId(food.support);
    if (!p || !world.solidAt(p, food.x)) { food.landed = false; food.vy = 0; }
    else {
      if (p.x1 !== food.supportX) food.x += p.x1 - food.supportX;
      food.supportX = p.x1;
      food.y = p.y;
    }
  }
  if (food.win && !food.win.isDestroyed()) {
    food.win.setBounds({ x: Math.round(food.x - 16), y: Math.round(food.y - 28), width: 32, height: 32 });
  }
}

function updateEating() {
  if (!food) { setAct('idle', 500); return; }
  const bites = Math.floor((now() - pet.actStart) / 1200);
  if (bites !== food.bites) {
    food.bites = bites;
    if (food.win && !food.win.isDestroyed()) food.win.webContents.send('pet-state', { bites });
  }
  if (bites >= 3) {
    closeWin(food.win);
    food = null;
    pet.lastFood = now();
    setAct('dance', 2400);
    emote('♥', 2600, 'happy');
  }
}

// ---------- Trous et terrier ----------
// Les trous aléatoires n'apparaissent que sur le bas de l'écran (au-dessus de la barre des tâches).
function floorSpot() {
  const floors = world.platforms().filter(p => p.kind === 'floor');
  if (!floors.length) return null;
  const p = pick(floors);
  return { p, x: rand(p.x1 + 80, p.x2 - 80) };
}

function makeHole(s, kind, extra = {}) {
  return {
    id: ++holeSeq, kind, x: s.x, y: s.p.y, support: s.p.id, supportX: s.p.x1,
    born: now(), life: Infinity, open: 0, win: itemWindow(kind, 56, 24), ...extra,
  };
}

function spawnHole(exit = false) {
  const s = floorSpot();
  if (!s || !petWin) return null;
  const h = makeHole(s, 'hole', { exit, life: exit ? 7000 : rand(60000, 140000) });
  holes.push(h);
  return h;
}

function placeHoleWindow(h) {
  if (!h.win || h.win.isDestroyed()) return;
  h.win.setBounds({ x: Math.round(h.x - 28), y: Math.round(h.y - 12), width: 56, height: 24 });
  const o = Math.round(h.open * 20) / 20;
  if (o !== h.sent) { h.sent = o; h.win.webContents.send('pet-state', { open: o }); }
}

function updateHoles(dt) {
  const t = now();
  for (const h of holes) {
    const p = world.byId(h.support);
    if (!p || !world.solidAt(p, h.x)) h.life = Math.min(h.life, t - h.born);
    else {
      if (p.x1 !== h.supportX) h.x += p.x1 - h.supportX;
      h.supportX = p.x1;
      h.y = p.y;
    }
    const closing = t - h.born > h.life;
    const occupied = pet.hidden && pet.hole === h;
    h.open = clamp(h.open + (closing && !occupied ? -1.5 : 1.6) * dt, 0, 1);
    placeHoleWindow(h);
  }
  holes = holes.filter(h => {
    const gone = now() - h.born > h.life && h.open <= 0;
    if (gone) closeWin(h.win);
    return !gone;
  });
  updateBurrow(dt);
}

// Le terrier reste à l'endroit choisi par l'utilisateur, posé sur la surface la plus proche en
// dessous (ou sur le bas de l'écran si elle disparaît).
function updateBurrow(dt) {
  if (!opts.burrow) {
    if (burrow) { closeWin(burrow.win); burrow = null; }
    return;
  }
  const b = opts.burrow;
  let s = world.surfaceBelow(b.x, b.y - 8);
  if (!s || s.y - b.y > 60) s = world.platforms().find(p => p.kind === 'floor' && b.x >= p.x1 && b.x <= p.x2) || s;
  if (!s) return;
  if (!burrow) burrow = makeHole({ x: b.x, p: s }, 'burrow');
  burrow.x = b.x;
  burrow.y = s.y;
  burrow.support = s.id;
  burrow.open = clamp(burrow.open + 1.6 * dt, 0, 1);
  placeHoleWindow(burrow);
}

function enterHole(h, nap = false) {
  pet.mode = 'floor';
  pet.x = h.x;
  pet.y = h.y;
  pet.support = h.support;
  pet.vx = pet.vy = 0;
  pet.hole = h;
  pet.napping = nap;
  setAct('hole-in', 900);
  emote(nap ? 'Z' : pick(['✦', '♪', '!']), 900, nap ? 'closed' : null);
}

function exitHole() {
  // Il ressort le plus souvent par son terrier, parfois par un autre trou.
  const others = holes.filter(h => h !== pet.hole && h.open > 0.5);
  let h;
  if (burrow && burrow !== pet.hole && Math.random() < 0.6) h = burrow;
  else if (others.length) h = pick(others);
  else if (pet.hole === burrow && Math.random() < 0.8) h = burrow;
  else h = spawnHole(true) || pet.hole || burrow;
  pet.hidden = false;
  pet.hole = null;
  pet.mode = 'floor';
  pet.x = h.x;
  pet.y = h.y;
  pet.support = h.support;
  pet.supportX = null;
  setAct('hole-out', 900);
  emote(pet.napping ? '✦' : pick(['♪', '!', '✦', '?']), 1400, 'happy');
  pet.napping = false;
}

// ---------- Bulle d'information (tâches) ----------
const INFO_W = 280, INFO_H = 190;
let infoWin = null;
let infoUntil = 0;
let infoHover = false;
let nextReminder = now() + REMIND_EVERY;

function placeInfo() {
  if (!infoWin || infoWin.isDestroyed() || !petWin) return false;
  const b = petWin.getBounds();
  const a = area();
  const below = b.y - INFO_H < a.y;
  const x = clamp(Math.round(b.x + b.width / 2 - INFO_W / 2), a.x, a.x + a.width - INFO_W);
  const y = below ? b.y + b.height - 6 : b.y - INFO_H + 18;
  infoWin.setBounds({ x, y, width: INFO_W, height: INFO_H });
  return below;
}

function sendInfo(reason) {
  if (!infoWin || infoWin.isDestroyed()) return;
  infoWin.webContents.send('pet-state', { summary: tasks.summary(), reason, name: ANIMAL_NAME[opts.animal] || 'ton compagnon', below: placeInfo() });
}

function showInfo(reason = 'info', ms = 8000) {
  if (!petWin || pet.hidden) return;
  infoUntil = now() + ms;
  if (infoWin && !infoWin.isDestroyed()) { sendInfo(reason); return; }
  infoWin = new BrowserWindow({
    width: INFO_W, height: INFO_H, transparent: true, frame: false, resizable: false, movable: false,
    skipTaskbar: true, focusable: false, hasShadow: false, show: false, alwaysOnTop: true,
    webPreferences: { preload: path.join(__dirname, 'pet-preload.js') },
  });
  infoWin.setAlwaysOnTop(true, 'screen-saver');
  infoWin.loadFile(path.join(__dirname, 'src', 'pet', 'info.html'));
  infoWin.once('ready-to-show', () => { sendInfo(reason); infoWin.showInactive(); });
  infoWin.on('closed', () => { infoWin = null; infoHover = false; });
  // Le compagnon se tourne vers vous en montrant sa liste.
  if (pet.mode === 'floor' && !['eat', 'sleep'].includes(pet.act)) {
    pet.facing = sign(cursor.x - pet.x);
    setAct('look', ms);
  }
}

function closeInfo() {
  if (infoWin && !infoWin.isDestroyed()) infoWin.destroy();
  infoWin = null;
}

function updateInfo() {
  if (infoWin && !infoWin.isDestroyed()) {
    placeInfo();
    if (!infoHover && now() > infoUntil) closeInfo();
  }
  const t = now();
  if (opts.reminders && t > nextReminder) {
    nextReminder = t + REMIND_EVERY;
    if (tasks.summary().left > 0 && !calm() && !pet.hidden && pet.act !== 'sleep') {
      emote('!', 1500, 'wide');
      showInfo('rappel', 7000);
    }
  }
}

ipcMain.on('pet-info', (_e, action) => {
  if (action === 'hover') { infoHover = true; return; }
  if (action === 'leave') { infoHover = false; infoUntil = Math.max(infoUntil, now() + 2500); return; }
  if (action === 'close') { closeInfo(); return; }
  if (action === 'open') { closeInfo(); handlers.openTasks(); return; }
  if (action === 'done') {
    const next = tasks.summary().next;
    if (next) tasks.update(next.id, { done: true });
    infoUntil = now() + 5000;
    sendInfo(tasks.summary().left === 0 ? 'bravo' : 'info');
  }
});

// Une tâche cochée (n'importe où dans l'application) : le compagnon fête ça.
tasks.events.on('done', (_task, allDone) => {
  if (!petWin || pet.hidden) return;
  pet.sound++;
  if (pet.mode === 'floor' && !pet.held) setAct('dance', allDone ? 3600 : 2000);
  emote(allDone ? '★' : pick(['♥', '✦', '♪']), allDone ? 3600 : 1800, 'happy');
  if (allDone) showInfo('bravo', 6000);
});

// ---------- Boucle principale ----------
function tick() {
  const t = now();
  const dt = Math.min(0.05, (t - lastTick) / 1000);
  lastTick = t;

  if (t - lastWindows > 250) { world.refreshWindows(ownHandles()); lastWindows = t; }
  if (opts.screenLines && t - world.lastScan > 4000) {
    const inUse = new Set([pet.support, food?.support, burrow?.support, ...holes.map(h => h.support)].filter(Boolean));
    world.scan(ownWindows().map(w => w.getBounds()), inUse);
  }
  if (t - lastSave > 120000) { memory.save(); lastSave = t; }

  const cur = screen.getCursorScreenPoint();
  if (Math.hypot(cur.x - cursor.x, cur.y - cursor.y) > 3) {
    cursor.moved = t;
    pet.lastActive = t;
    memory.cursorMoved(cur.x, cur.y);
  }
  cursor.x = cur.x; cursor.y = cur.y;

  if (opts.cheese && !food && t > nextFood) spawnFood();
  if (opts.holes && t > nextHole) {
    if (holes.filter(h => !h.exit).length < 1) spawnHole();
    nextHole = t + rand(4, 9) * 60000;
  }
  updateFood(dt);
  updateHoles(dt);
  updateInfo();

  if (pet.hidden) {
    if (t > pet.until) exitHole();
  } else if (pet.act === 'hole-in') {
    if (t > pet.until) { pet.hidden = true; setAct('hidden', pet.napping ? rand(30000, 90000) : rand(4000, 15000)); }
  } else if (pet.act === 'hole-out' && t < pet.until) {
    // il sort du trou
  } else if (pet.held) {
    updateHeld();
  } else if (pet.mode === 'air') updateAir(dt);
  else if (pet.mode === 'floor') updateFloor(dt);
  else if (pet.mode === 'ceil') updateCeiling(dt);
  else updateWall(dt);

  // Caresse : il s'arrête quand le curseur le survole, et retient l'endroit.
  if (pet.hover && !pet.held && pet.mode === 'floor' && ['idle', 'walk', 'sit', 'sniff', 'look', 'bored', 'land'].includes(pet.act)) {
    setAct('love', 600);
    emote('♥', 900, 'happy');
    if (t - pet.lastPetted > 20000) { memory.petted(pet.x, pet.y); pet.lastPetted = t; }
  }
  if (pet.act === 'love' && pet.hover) pet.until = now() + 400;
  if (pet.emo && t > pet.emoUntil) pet.emo = null;
  if (pet.face && t > pet.faceUntil) pet.face = null;

  render(t);
}

const POSE = {
  walk: 'walk', run: 'run', climb: 'walk', jump: 'jump', fall: 'fall', thrown: 'fall', tumble: 'fall',
  held: 'held', sleep: 'sleep', eat: 'eat', sit: 'sit', sniff: 'sniff', dance: 'dance', love: 'love',
  dizzy: 'dizzy', shake: 'shake', look: 'idle', bored: 'sit', hang: 'idle', crouch: 'crouch', land: 'land',
};
const FACE = { sleep: 'closed', love: 'happy', dizzy: 'dizzy', dance: 'happy', shake: 'wide', eat: 'happy' };

function render(t) {
  if (!petWin || petWin.isDestroyed()) return;
  const [ax, ay] = ANCHOR[pet.mode];
  petWin.setBounds({ x: Math.round(pet.x - ax), y: Math.round(pet.y - ay), width: SIZE, height: SIZE });
  let sink = 0;
  if (pet.hidden) sink = 1;
  else if (pet.act === 'hole-in') sink = clamp((t - pet.actStart) / 900, 0, 1);
  else if (pet.act === 'hole-out') sink = clamp(1 - (t - pet.actStart) / 900, 0, 1);
  const state = {
    animal: opts.animal,
    pose: pet.act === 'hole-in' || pet.act === 'hole-out' ? 'walk' : POSE[pet.act] || 'idle',
    face: pet.face || FACE[pet.act] || 'normal',
    emo: pet.hidden ? null : pet.emo,
    facing: pet.facing,
    rot: ROTATION[pet.mode] + (pet.mode === 'air' ? Math.round(pet.spin / 15) * 15 : 0),
    flipBubble: pet.mode === 'ceil',
    sink: Math.round(sink * 20) / 20,
    sound: soundOn ? pet.sound : 0,
  };
  const msg = JSON.stringify(state);
  if (msg !== lastSent) {
    lastSent = msg;
    petWin.webContents.send('pet-state', state);
  }
}

// ---------- Interactions ----------
function insidePet(p) {
  if (!petWin || petWin.isDestroyed()) return false;
  const b = petWin.getBounds();
  return p.x >= b.x && p.x < b.x + b.width && p.y >= b.y && p.y < b.y + b.height;
}

function onGlobalClick(e) {
  let p = { x: e.x, y: e.y };
  if (screen.screenToDipPoint) p = screen.screenToDipPoint(p);
  memory.clicked(p.x, p.y);
  if (!petWin || pet.held || pet.hidden || picking) return;
  pet.lastActive = now();
  if (insidePet(p)) return;
  const d = Math.hypot(p.x - pet.x, p.y - pet.y);
  if (pet.act === 'sleep') {
    if (d < 400) { setAct('idle', 700); emote('!', 900, 'wide'); }
    return;
  }
  if (pet.mode !== 'floor' || pet.act === 'eat' || calm()) return;
  // Il ne réagit pas à chaque clic : parfois il va voir, parfois il regarde seulement.
  if (d < 1200 && Math.random() < 0.3) {
    const s = world.surfaceBelow(p.x, p.y - 4);
    if (s) {
      setGoal('explore', 9000, { x: p.x, y: s.y, run: Math.random() < 0.5 });
      emote('?', 900);
      setAct('look', 350);
    }
  } else if (d < 400) {
    pet.facing = sign(p.x - pet.x);
    emote(pick(['?', '!']), 700);
  }
}

function onKey() { memory.keyPressed(); pet.lastActive = now(); }

let clickTimer = null;

function onClickPet() {
  if (clickTimer) {
    clearTimeout(clickTimer);
    clickTimer = null;
    pet.sound++;
    emote('✦', 1200, 'happy');
    showInfo('info');
    return;
  }
  clickTimer = setTimeout(() => { clickTimer = null; singleClick(); }, 280);
}

function singleClick() {
  const t = now();
  pet.lastActive = t;
  pet.sound++;
  pet.clicks = pet.clicks.filter(c => t - c < 2500).concat(t);
  if (pet.act === 'sleep') { pet.emo = null; emote('💢', 1500, 'angry'); setAct('idle', 1500); return; }
  if (pet.clicks.length >= 3) {
    pet.clicks = [];
    emote('💢', 2200, 'angry');
    pet.goal = null;
    const p = world.byId(pet.support);
    if (p && pet.mode === 'floor') walkTo(clamp(pet.x - pet.facing * rand(250, 450), p.x1 - 14, p.x2 + 14), true);
    return;
  }
  if (pet.mode === 'floor') {
    startFall(0, -430, 'jump');
    emote(pick(['!', '♪', '♥', '✦']), 1000, Math.random() < 0.5 ? 'happy' : 'wide');
  } else {
    emote('!', 800, 'wide');
  }
}

ipcMain.on('pet-hover', (_e, on) => { pet.hover = !!on; });
ipcMain.on('pet-ignore', (_e, ignore) => {
  if (petWin && !petWin.isDestroyed()) petWin.setIgnoreMouseEvents(!!ignore, { forward: true });
});
ipcMain.on('pet-down', () => {
  if (pet.hidden) return;
  const cur = screen.getCursorScreenPoint();
  pet.held = true;
  pet.dragging = false;
  pet.downAt = cur;
  pet.grab = { x: cur.x - pet.x, y: cur.y - pet.y };
  pet.trail = [];
});
ipcMain.on('pet-up', () => {
  if (!pet.held) return;
  pet.held = false;
  if (pet.dragging) {
    // On peut le lancer : il garde l'élan du geste.
    const tr = pet.trail;
    let vx = 0, vy = 0;
    if (tr.length > 1) {
      const a = tr[0], b = tr[tr.length - 1];
      const dt = Math.max(0.016, (b.t - a.t) / 1000);
      vx = clamp((b.x - a.x) / dt, -1400, 1400);
      vy = clamp((b.y - a.y) / dt, -1400, 1400);
    }
    const thrown = Math.hypot(vx, vy) > 500;
    startFall(vx, vy, thrown ? 'thrown' : 'fall');
    emote(thrown ? '!' : '?', 900, 'wide');
  } else {
    onClickPet();
  }
  pet.dragging = false;
});

// ---------- Choix de l'emplacement du terrier ----------
let picking = null;

function pickBurrow() {
  if (picking) return picking.promise;
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  const wins = screen.getAllDisplays().map(d => {
    const w = new BrowserWindow({
      ...d.bounds, transparent: true, frame: false, resizable: false, movable: false, skipTaskbar: true,
      alwaysOnTop: true, hasShadow: false, show: false,
      webPreferences: { preload: path.join(__dirname, 'pet-preload.js') },
    });
    w.setAlwaysOnTop(true, 'screen-saver');
    w.loadFile(path.join(__dirname, 'src', 'pet', 'picker.html'));
    w.once('ready-to-show', () => { w.show(); w.focus(); });
    return w;
  });
  const finish = point => {
    ipcMain.removeListener('picker-done', onDone);
    wins.forEach(closeWin);
    picking = null;
    resolve(point);
  };
  const onDone = (_e, p) => {
    if (!p) { finish(null); return; }
    const pt = screen.getCursorScreenPoint();
    const s = world.surfaceBelow(pt.x, pt.y - 8);
    finish({ x: Math.round(pt.x), y: Math.round(s ? s.y : pt.y) });
  };
  ipcMain.on('picker-done', onDone);
  picking = { promise };
  return promise;
}

// ---------- Démarrage / arrêt ----------
function start() {
  if (petWin) return;
  memory.load();
  const a = screen.getPrimaryDisplay().workArea;
  Object.assign(pet, { x: a.x + a.width * 0.7, y: a.y + 90, vx: 0, vy: 0, mode: 'air', support: null, hidden: false, held: false, goal: null, climb: null, pending: null });
  setAct('fall');
  emote('♪', 1500, 'happy');
  nextFood = now() + 5 * 60000;
  nextHole = now() + rand(3, 6) * 60000;

  petWin = new BrowserWindow({
    width: SIZE, height: SIZE, x: Math.round(pet.x - 44), y: Math.round(pet.y - 81),
    transparent: true, frame: false, resizable: false, movable: false,
    skipTaskbar: true, focusable: false, hasShadow: false, show: false,
    alwaysOnTop: true, minimizable: false, maximizable: false,
    webPreferences: { preload: path.join(__dirname, 'pet-preload.js'), backgroundThrottling: false },
  });
  petWin.setAlwaysOnTop(true, 'screen-saver');
  petWin.setIgnoreMouseEvents(true, { forward: true });
  petWin.loadFile(path.join(__dirname, 'src', 'pet', 'pet.html'));
  petWin.once('ready-to-show', () => petWin && petWin.showInactive());
  petWin.on('closed', () => { petWin = null; });

  world.setUseScreen(opts.screenLines);
  lastTick = now();
  loop = setInterval(tick, 33);
  if (hook) {
    hook.on('mousedown', onGlobalClick);
    hook.on('keydown', onKey);
    try { hook.start(); } catch { hook = null; }
  }
}

function stop() {
  clearInterval(loop);
  loop = null;
  if (hook) {
    hook.off('mousedown', onGlobalClick);
    hook.off('keydown', onKey);
    try { hook.stop(); } catch { /* déjà arrêté */ }
  }
  memory.save();
  if (food) closeWin(food.win);
  food = null;
  holes.forEach(h => closeWin(h.win));
  holes = [];
  if (burrow) closeWin(burrow.win);
  burrow = null;
  closeInfo();
  closeWin(petWin);
  petWin = null;
}

module.exports = {
  start,
  stop,
  pickBurrow,
  showInfo: () => showInfo('info'),
  setHandlers(h) { handlers = { ...handlers, ...h }; },
  get running() { return !!petWin; },
  setSound(on) { soundOn = !!on; },
  setOptions(o) {
    const animalChanged = o.animal && o.animal !== opts.animal;
    opts = { ...opts, ...o };
    world.setUseScreen(opts.screenLines);
    if ((!opts.cheese || animalChanged) && food) { closeWin(food.win); food = null; }
    if (!opts.holes) { holes.forEach(h => closeWin(h.win)); holes = []; }
    if (animalChanged && petWin) emote('♥', 1500, 'happy');
  },
  giveFood() { if (petWin) { if (food) { closeWin(food.win); food = null; } spawnFood(); } },
  // Pour les tests : état interne et surfaces connues.
  debug: () => ({ pet: { x: pet.x, y: pet.y, mode: pet.mode, act: pet.act, support: pet.support, goal: pet.goal && pet.goal.type }, windows: world.windowCount, lines: world.lineCount, food: food && food.kind, holes: holes.length, burrow: !!burrow }),
  _test: {
    spawnHole, spawnFood,
    enterHole: () => (burrow || holes[0]) && enterHole(burrow || holes[0]),
    place: (x, y) => { pet.x = x; pet.y = y; pet.held = false; pet.hidden = false; startFall(0, 0); },
    platforms: () => world.platforms(),
  },
};
