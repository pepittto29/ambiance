// Télécharge des ambiances CC0 depuis Freesound (aperçus HQ 128 kb/s, aucun compte requis)
// et écrit les crédits dans src/sounds/credits-freesound.json.
// Usage : node scripts/fetch-freesound.js   (les fichiers déjà présents ne sont pas retéléchargés)
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'src', 'sounds');
const CREDITS = path.join(OUT, 'credits-freesound.json');

// [nom du fichier, recherche, mots qui doivent apparaître dans le titre]
const QUERIES = [
  ['crickets', 'crickets night', ['cricket']],
  ['frogs', 'frogs night', ['frog']],
  ['ocean', 'ocean waves', ['wave', 'ocean', 'sea']],
  ['rain-window', 'rain window', ['rain']],
  ['rain-tent', 'rain tent', ['rain']],
  ['train', 'train interior', ['train']],
  ['airplane', 'airplane cabin', ['plane', 'aircraft', 'cabin']],
  ['cat-purr', 'cat purring', ['purr']],
  ['clock', 'clock ticking', ['clock', 'tick']],
  ['keyboard', 'keyboard typing', ['keyboard', 'typing']],
  ['library', 'library ambience', ['library']],
  ['wind-chimes', 'wind chimes', ['chime']],
  ['campfire', 'campfire', ['fire']],
  ['night-forest', 'forest night', ['forest']],
  ['blizzard', 'blizzard', ['blizzard', 'snow', 'storm']],
  ['washing-machine', 'washing machine', ['washing']],
];

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' };

function parse(html) {
  const out = [];
  const re = /<h5[^>]*><a[^>]*href="\/people\/([^/]+)\/sounds\/(\d+)\/" title="([^"]+)"/g;
  let m;
  while ((m = re.exec(html))) {
    const [, user, id, title] = m;
    const mp3 = html.match(new RegExp(`data-mp3="(https://cdn\\.freesound\\.org/previews/\\d+/${id}_\\d+)-lq\\.mp3"`));
    const dur = html.match(new RegExp(`previews/\\d+/${id}_\\d+-lq\\.mp3"[\\s\\S]{0,400}?data-duration="([\\d.]+)"`));
    if (mp3) out.push({ user, id, title, url: mp3[1] + '-hq.mp3', duration: dur ? +dur[1] : 0 });
  }
  return out;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Freesound limite le débit : on patiente et on réessaie en cas d'erreur 429.
async function get(url, as) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(120000) });
    if (res.status === 429 && attempt < 5) { await sleep(20000 * (attempt + 1)); continue; }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return as === 'buf' ? Buffer.from(await res.arrayBuffer()) : res.text();
  }
}

async function one([name, q, words], credits) {
  const url = `https://freesound.org/search/?q=${encodeURIComponent(q)}&f=license%3A%22Creative+Commons+0%22&s=Downloads+%28most+first%29`;
  const pick = parse(await get(url)).find(r =>
    r.duration >= 45 && r.duration <= 900 && words.some(w => r.title.toLowerCase().includes(w)));
  if (!pick) return console.log('aucun résultat :', name);
  const file = path.join(OUT, name + '.mp3');
  if (!fs.existsSync(file)) fs.writeFileSync(file, await get(pick.url, 'buf'));
  credits[name] = `${pick.title} by ${pick.user} -- https://freesound.org/s/${pick.id}/`;
  console.log(`${name.padEnd(16)} ${(fs.statSync(file).size / 1e6).toFixed(1)} Mo  ${Math.round(pick.duration)} s  ${pick.title}`);
}

(async () => {
  let credits = {};
  try { credits = JSON.parse(fs.readFileSync(CREDITS, 'utf8')); } catch { /* premier lancement */ }
  const only = process.argv.slice(2);
  for (const q of QUERIES) {
    if (only.length && !only.includes(q[0])) continue;
    try { await one(q, credits); } catch (e) { console.log('échec :', q[0], e.message); }
    fs.writeFileSync(CREDITS, JSON.stringify(credits, null, 2));
    await sleep(5000);
  }
})();
