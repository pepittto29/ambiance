// Convertit les sons de src/sounds en Opus (.ogg, 96 kb/s) pour alléger l'application,
// puis met à jour les noms de fichiers dans le code. Les originaux sont supprimés.
// Usage : node scripts/compress-sounds.js
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const ffmpeg = require('ffmpeg-static');

const dir = path.join(__dirname, '..', 'src', 'sounds');
const code = ['src/audio.js', 'src/premium.js'].map(f => path.join(__dirname, '..', f));
let before = 0, after = 0;
const renamed = {};

for (const name of fs.readdirSync(dir)) {
  if (!/\.(wav|mp3|flac|m4a)$/i.test(name)) continue;
  const src = path.join(dir, name);
  const outName = name.replace(/\.[^.]+$/, '.ogg');
  const out = path.join(dir, outName);
  execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', src, '-ac', '2', '-ar', '48000', '-c:a', 'libopus', '-b:a', '96k', '-vbr', 'on', out]);
  before += fs.statSync(src).size;
  after += fs.statSync(out).size;
  fs.rmSync(src);
  renamed[name] = outName;
  console.log(`${name.padEnd(24)} → ${outName}`);
}

for (const f of code) {
  let s = fs.readFileSync(f, 'utf8');
  for (const [a, b] of Object.entries(renamed)) s = s.split(`'${a}'`).join(`'${b}'`);
  fs.writeFileSync(f, s);
}
console.log(`\n${(before / 1e6).toFixed(1)} Mo → ${(after / 1e6).toFixed(1)} Mo`);
