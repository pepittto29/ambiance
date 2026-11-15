// Mode Course : calque transparent sur chaque écran (traces de pneus qui s'estompent, piste) et
// conduite de la voiture pendant une course autour de l'écran. La piste suit le bord de la zone de
// travail : une ligne droite par côté et un virage relevé à chaque coin, où la voiture dérape.
const { BrowserWindow, screen } = require('electron');
const path = require('path');

const INSET = 28; // distance entre le bord de l'écran et le milieu de la piste
const LAPS = 3;
const LIGHTS_MS = 2800;

let enabled = false;
const overlays = new Map(); // écran -> { win, d, ready, queue }
let run = null;

function overlay(d) {
  let o = overlays.get(d.id);
  if (o && !o.win.isDestroyed()) return o;
  const win = new BrowserWindow({
    ...d.bounds, transparent: true, frame: false, resizable: false, movable: false, skipTaskbar: true,
    focusable: false, hasShadow: false, show: false, alwaysOnTop: true,
    webPreferences: { preload: path.join(__dirname, 'pet-preload.js'), backgroundThrottling: false },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setIgnoreMouseEvents(true);
  win.loadFile(path.join(__dirname, 'src', 'pet', 'track.html'));
  o = { win, d, ready: false, queue: [] };
  win.once('ready-to-show', () => { o.ready = true; win.showInactive(); events.onShown(); });
  overlays.set(d.id, o);
  return o;
}

const send = (o, msg) => { if (o.ready && !o.win.isDestroyed()) o.win.webContents.send('pet-state', msg); };

// Trace de pneu (coordonnées écran) ; rot en degrés, 0 = voiture à plat.
function mark(x, y, rot) {
  if (!enabled) return;
  const d = screen.getDisplayNearestPoint({ x: Math.round(x), y: Math.round(y) });
  const o = overlay(d);
  o.queue.push([Math.round(x - d.bounds.x), Math.round(y - d.bounds.y), Math.round(rot)]);
}

// ---------- Géométrie de la piste ----------
function geometry(d) {
  const a = d.workArea;
  const x1 = a.x + INSET, y1 = a.y + INSET, x2 = a.x + a.width - INSET, y2 = a.y + a.height - INSET;
  const R = Math.min(130, (x2 - x1) / 3, (y2 - y1) / 3);
  const sx = x2 - x1 - 2 * R, sy = y2 - y1 - 2 * R, arc = Math.PI * R / 2;
  // Sens inverse des aiguilles d'une montre à l'écran : en bas vers la droite, puis on remonte.
  const segs = [
    { len: sx, line: [x1 + R, y2, 1, 0] },
    { len: arc, arc: [x2 - R, y2 - R, 90] },
    { len: sy, line: [x2, y2 - R, 0, -1] },
    { len: arc, arc: [x2 - R, y1 + R, 0] },
    { len: sx, line: [x2 - R, y1, -1, 0] },
    { len: arc, arc: [x1 + R, y1 + R, -90] },
    { len: sy, line: [x1, y1 + R, 0, 1] },
    { len: arc, arc: [x1 + R, y2 - R, 180] },
  ];
  return { d, x1, y1, x2, y2, R, segs, L: segs.reduce((n, s) => n + s.len, 0), start: sx / 2 };
}

// Point de la ligne médiane à la distance s, cap en degrés, et avancement dans un virage (ou -1).
function at(g, s) {
  s = ((s % g.L) + g.L) % g.L;
  for (const seg of g.segs) {
    if (s > seg.len) { s -= seg.len; continue; }
    if (seg.line) {
      const [x, y, dx, dy] = seg.line;
      return { x: x + dx * s, y: y + dy * s, heading: Math.atan2(dy, dx) * 180 / Math.PI, turn: -1 };
    }
    const [cx, cy, a0] = seg.arc;
    const k = s / seg.len;
    const a = (a0 - 90 * k) * Math.PI / 180;
    return { x: cx + g.R * Math.cos(a), y: cy + g.R * Math.sin(a), heading: a0 - 90 * k - 90, turn: k };
  }
  return at(g, 0);
}

const local = g => ({ x1: g.x1 - g.d.bounds.x, y1: g.y1 - g.d.bounds.y, x2: g.x2 - g.d.bounds.x, y2: g.y2 - g.d.bounds.y, R: g.R });

// ---------- Course ----------
function start(d, { onLap = () => {} } = {}) {
  const g = geometry(d);
  run = { g, s: g.start, v: 0, lap: 1, phase: 'lights', t0: Date.now(), onLap, slip: 0, lights: 0 };
  overlay(d);
  sendTrack();
}

function sendTrack(extra = {}) {
  if (!run) return;
  const o = overlays.get(run.g.d.id);
  if (o) send(o, { track: { ...local(run.g), lap: Math.min(run.lap, LAPS), laps: LAPS, lights: run.lights, phase: run.phase, ...extra } });
}

function update(dt) {
  for (const o of overlays.values()) if (o.queue.length && o.ready) { send(o, { marks: o.queue }); o.queue = []; }
  if (!run) return;
  const t = Date.now() - run.t0;
  if (run.phase === 'lights') {
    const lights = Math.min(4, Math.floor(t / (LIGHTS_MS / 4)));
    if (lights !== run.lights) { run.lights = lights; sendTrack(); }
    if (t >= LIGHTS_MS) { run.phase = 'go'; sendTrack(); }
    return;
  }
  if (run.phase === 'end') return;
  const here = at(run.g, run.s);
  if (run.phase === 'go') {
    // Pleine vitesse dans les lignes droites, freinage avant chaque virage.
    const ahead = at(run.g, run.s + 140);
    const target = here.turn >= 0 ? 520 : ahead.turn >= 0 ? 600 : 900;
    run.v += Math.max(-1400 * dt, Math.min(800 * dt, target - run.v));
  } else {
    run.v = Math.max(0, run.v - 900 * dt);
    if (run.v === 0 && run.phase === 'done') { run.phase = 'end'; sendTrack({ hide: true }); setTimeout(() => { run = null; }, 1300); }
  }
  run.s += run.v * dt;
  // Dérapage dans les virages : le nez rentre dans le virage, la voiture fume et marque la piste.
  const slipTarget = here.turn >= 0 ? -24 * Math.sin(Math.PI * here.turn) * Math.min(1, run.v / 500) : 0;
  run.slip += (slipTarget - run.slip) * Math.min(1, dt * 7);
  if (Math.abs(run.slip) > 6) {
    const h = here.heading * Math.PI / 180;
    const fx = Math.cos(h), fy = Math.sin(h), dx = -Math.sin(h), dy = Math.cos(h);
    for (const k of [-27, 22]) mark(here.x + dx * 15 + fx * k, here.y + dy * 15 + fy * k, here.heading + run.slip);
  }
  const lap = Math.floor((run.s - run.g.start) / run.g.L) + 1;
  if (lap !== run.lap && run.phase === 'go') {
    run.lap = lap;
    if (lap > LAPS) { run.phase = 'done'; run.onLap('fin'); } else run.onLap(lap);
    sendTrack();
  }
}

// Position de la voiture pendant la course, ou null quand la course est finie.
function car() {
  if (!run || run.phase === 'end') return null;
  const p = at(run.g, run.s);
  return { x: p.x, y: p.y, rot: p.heading + run.slip, speed: run.v, slip: Math.abs(run.slip) };
}

const events = { onShown: () => {} };

module.exports = {
  mark,
  start,
  update,
  car,
  active: () => !!run,
  stop() { if (run) { sendTrack({ hide: true }); run = null; } },
  // Les fenêtres du calque, pour que le compagnon ne les prenne pas pour des surfaces.
  handles: () => [...overlays.values()].filter(o => !o.win.isDestroyed()).map(o => o.win),
  setEnabled(on) {
    enabled = !!on;
    if (!enabled) { for (const o of overlays.values()) if (!o.win.isDestroyed()) o.win.destroy(); overlays.clear(); run = null; }
  },
  onShown(fn) { events.onShown = fn; },
};
