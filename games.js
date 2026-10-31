// Mini-jeux du compagnon, conservés dans %APPDATA%\Ambiance\jeux.json :
//  - le tricot : chaque touche tapée ajoute une maille (on compte les frappes, jamais les touches) ;
//    quand le patron est fini, le compagnon a tricoté un chapeau d'une rareté tirée au sort ;
//  - la jardinière : trois emplacements où poussent des plantes pendant que l'utilisateur est actif
//    (deux fois plus vite sous la pluie d'Ambiance) ; la récolte rapporte des étoiles, qui achètent
//    des graines et les chapeaux qui manquent.
const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const { RARITY, HATS, PLANTS } = require('./src/pet/games-data');

const events = new EventEmitter();
const file = () => path.join(app.getPath('userData'), 'jeux.json');
const RAIN = new Set(['rain', 'thunder', 'rainforest']);
const WATER_EVERY = 30 * 60000; // le compagnon arrose au plus toutes les demi-heures
const WATER_BONUS = 5; // minutes de pousse offertes par un arrosage

let st = null;
let sounds = [];
let dirty = false;
let saveTimer = null;

const fresh = () => ({
  stitches: 0, knitted: 0, hats: {}, wearing: null, stars: 0,
  seeds: { radis: 0 }, seed: 'radis',
  garden: null, // { x, y } : emplacement choisi par l'utilisateur
  pots: [null, null, null], // { plant, grown } : minutes de pousse accumulées
  lastWater: 0, harvested: 0,
});

function load() {
  if (st) return st;
  st = fresh();
  try { Object.assign(st, JSON.parse(fs.readFileSync(file(), 'utf8'))); } catch { /* première partie */ }
  if (!Array.isArray(st.pots) || st.pots.length !== 3) st.pots = [null, null, null];
  return st;
}

function save() {
  dirty = true;
  if (saveTimer) return;
  saveTimer = setTimeout(flush, 3000);
}
function flush() {
  clearTimeout(saveTimer);
  saveTimer = null;
  if (!dirty || !st) return;
  try { fs.writeFileSync(file(), JSON.stringify(st)); } catch { /* ignoré */ }
  dirty = false;
}

const plantById = id => PLANTS.find(p => p.id === id);
const hatById = id => HATS.find(h => h.id === id);
// Le patron s'allonge à chaque chapeau, pour que la collection se complète en quelques semaines.
const goal = () => Math.min(3000, 400 + 200 * load().knitted);
const raining = () => sounds.some(id => RAIN.has(id));

function state() {
  const s = load();
  return {
    stitches: s.stitches, goal: goal(), knitted: s.knitted, hats: s.hats, wearing: s.wearing, stars: s.stars,
    seeds: s.seeds, seed: s.seed, garden: s.garden, harvested: s.harvested, raining: raining(),
    pots: s.pots.map(p => p && { plant: p.plant, grown: Math.floor(p.grown), ripe: p.grown >= plantById(p.plant).minutes }),
  };
}

function changed() { save(); events.emit('change', state()); }

// Tire une rareté puis un chapeau de cette rareté. Un doublon se défait en étoiles.
function rollHat(minRarity = null) {
  const order = Object.keys(RARITY);
  let pool = order;
  if (minRarity) pool = order.slice(order.indexOf(minRarity));
  const total = pool.reduce((a, r) => a + RARITY[r].chance, 0);
  let n = Math.random() * total;
  let rarity = pool[pool.length - 1];
  for (const r of pool) { if ((n -= RARITY[r].chance) < 0) { rarity = r; break; } }
  const hat = pick(HATS.filter(h => h.rarity === rarity));
  return giveHat(hat);
}
const pick = list => list[Math.floor(Math.random() * list.length)];

function giveHat(hat) {
  const s = load();
  const dup = !!s.hats[hat.id];
  s.hats[hat.id] = (s.hats[hat.id] || 0) + 1;
  const refund = dup ? RARITY[hat.rarity].refund : 0;
  s.stars += refund;
  if (!dup) s.wearing = hat.id; // un nouveau chapeau se porte tout de suite
  const result = { hat: { id: hat.id, name: hat.name, rarity: hat.rarity }, dup, refund };
  events.emit('hat', result);
  return result;
}

module.exports = {
  events,
  load,
  flush,
  state,
  hatById,
  wearing: () => load().wearing,
  setSounds(ids) { sounds = Array.isArray(ids) ? ids : []; },

  // Une frappe au clavier : une maille.
  stitch() {
    const s = load();
    s.stitches++;
    if (s.stitches >= goal()) {
      s.stitches = 0;
      s.knitted++;
      rollHat();
      changed();
    } else {
      save();
      if (s.stitches % 50 === 0) events.emit('change', state());
    }
  },

  // Une minute pendant laquelle l'utilisateur était actif : les plantes poussent.
  minute() {
    const s = load();
    if (!s.garden) return;
    const speed = raining() ? 2 : 1;
    let any = false;
    for (const p of s.pots) if (p) { p.grown += speed; any = true; }
    if (any) changed();
  },

  // Le compagnon passe arroser : un coup de pouce aux plantes qui ne sont pas encore mûres.
  needsWater() {
    const s = load();
    return !!s.garden && Date.now() - s.lastWater > WATER_EVERY && s.pots.some(p => p && p.grown < plantById(p.plant).minutes);
  },
  water() {
    const s = load();
    s.lastWater = Date.now();
    for (const p of s.pots) if (p) p.grown = Math.min(plantById(p.plant).minutes, p.grown + WATER_BONUS);
    changed();
  },
  ripeCount: () => load().pots.filter(p => p && p.grown >= plantById(p.plant).minutes).length,

  // Clic sur un emplacement : planter la graine choisie, ou récolter.
  pot(i) {
    const s = load();
    const p = s.pots[i];
    if (p === undefined) return { ok: false };
    if (!p) {
      const plant = plantById(s.seed) || PLANTS[0];
      const free = plant.cost === 0;
      if (!free && !(s.seeds[plant.id] > 0)) {
        // Plus de graines de ce type : on replante des radis.
        s.seed = 'radis';
        return module.exports.pot(i);
      }
      if (!free) s.seeds[plant.id]--;
      s.pots[i] = { plant: plant.id, grown: 0 };
      changed();
      return { ok: true, planted: plant.id };
    }
    const plant = plantById(p.plant);
    if (p.grown < plant.minutes) return { ok: false, left: Math.ceil(plant.minutes - p.grown), plant: plant.id };
    s.pots[i] = null;
    s.stars += plant.gain;
    s.harvested++;
    let hat = null;
    if (plant.hatChance && Math.random() < plant.hatChance) hat = rollHat('rare');
    changed();
    return { ok: true, harvested: plant.id, gain: plant.gain, hat };
  },

  setGarden(point) {
    const s = load();
    s.garden = point ? { x: Math.round(point.x), y: Math.round(point.y) } : null;
    changed();
  },
  garden: () => load().garden,

  wear(id) {
    const s = load();
    s.wearing = id && s.hats[id] ? id : null;
    changed();
    return state();
  },
  chooseSeed(id) {
    const s = load();
    if (plantById(id)) s.seed = id;
    changed();
    return state();
  },
  buySeed(id) {
    const s = load();
    const plant = plantById(id);
    if (!plant || !plant.cost) return { ok: false };
    if (s.stars < plant.cost) return { ok: false, error: 'Pas assez d\'étoiles.' };
    s.stars -= plant.cost;
    s.seeds[id] = (s.seeds[id] || 0) + 1;
    s.seed = id;
    changed();
    return { ok: true };
  },
  // Les chapeaux qui manquent s'achètent ; ceux qu'on a déjà ne sont pas en vente.
  buyHat(id) {
    const s = load();
    const hat = hatById(id);
    if (!hat || s.hats[id]) return { ok: false };
    const price = RARITY[hat.rarity].price;
    if (s.stars < price) return { ok: false, error: 'Pas assez d\'étoiles.' };
    s.stars -= price;
    giveHat(hat);
    changed();
    return { ok: true };
  },
};
