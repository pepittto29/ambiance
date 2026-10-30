// Ce que le compagnon apprend des habitudes de l'utilisateur, conservé dans
// %APPDATA%\Ambiance\pet-memory.json (jamais envoyé) :
//  - où l'utilisateur travaille (carte de chaleur du curseur et des clics) : il évite d'y rester ;
//  - à quelles heures il est actif : il dort plus volontiers aux heures calmes ;
//  - quand il tape beaucoup : il se fait discret ;
//  - où on l'a caressé : il aime y retourner.
const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const CELL = 64;
const file = () => path.join(app.getPath('userData'), 'pet-memory.json');

let mem = { heat: {}, hours: Array(24).fill(0), favorites: [] };
let keys = [];
let clicks = [];
let dirty = false;

function load() {
  try {
    const m = JSON.parse(fs.readFileSync(file(), 'utf8'));
    mem = { heat: m.heat || {}, hours: m.hours && m.hours.length === 24 ? m.hours : Array(24).fill(0), favorites: m.favorites || [] };
  } catch { /* première fois */ }
}

// Les vieilles habitudes s'estompent doucement pour suivre les changements de rythme.
function save() {
  if (!dirty) return;
  for (const k of Object.keys(mem.heat)) {
    mem.heat[k] *= 0.97;
    if (mem.heat[k] < 0.5) delete mem.heat[k];
  }
  mem.hours = mem.hours.map(v => v * 0.995);
  try { fs.writeFileSync(file(), JSON.stringify(mem)); } catch { /* ignoré */ }
  dirty = false;
}

const cellKey = (x, y) => `${Math.floor(x / CELL)}:${Math.floor(y / CELL)}`;

function addHeat(x, y, w) {
  const k = cellKey(x, y);
  mem.heat[k] = Math.min(500, (mem.heat[k] || 0) + w);
  mem.hours[new Date().getHours()] += w * 0.1;
  dirty = true;
}

module.exports = {
  load,
  save,
  cursorMoved(x, y) { addHeat(x, y, 0.2); },
  clicked(x, y) { addHeat(x, y, 3); clicks.push(Date.now()); },
  keyPressed() { keys.push(Date.now()); mem.hours[new Date().getHours()] += 0.02; dirty = true; },
  petted(x, y) {
    mem.favorites.push({ x: Math.round(x), y: Math.round(y) });
    if (mem.favorites.length > 20) mem.favorites.shift();
    dirty = true;
  },
  // Activité de l'utilisateur près d'un point (0 = jamais, 1 = zone de travail principale).
  heatAt(x, y) {
    let sum = 0;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) sum += mem.heat[cellKey(x + dx * CELL, y + dy * CELL)] || 0;
    return Math.min(1, sum / 300);
  },
  // L'utilisateur est concentré : il tape ou clique beaucoup en ce moment.
  busy() {
    const t = Date.now();
    keys = keys.filter(k => t - k < 60000);
    clicks = clicks.filter(c => t - c < 60000);
    return keys.length > 40 || clicks.length > 25;
  },
  // Heure habituellement calme (comparée à la moyenne de la journée).
  quietHour() {
    const avg = mem.hours.reduce((a, b) => a + b, 0) / 24;
    return avg > 5 && mem.hours[new Date().getHours()] < avg * 0.35;
  },
  favorite() { return mem.favorites.length ? mem.favorites[Math.floor(Math.random() * mem.favorites.length)] : null; },
};
