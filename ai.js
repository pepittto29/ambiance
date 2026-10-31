// IA locale du compagnon : un petit modèle de langage qui tourne entièrement sur le PC, téléchargé
// seulement si l'utilisateur le demande (rien n'est inclus dans l'installateur).
//   - le moteur est llama.cpp (llama-server, version processeur, sans carte graphique requise) ;
//   - les modèles sont les versions officielles de Qwen2.5 Instruct (licence Apache 2.0) ;
//   - chaque fichier est vérifié par son empreinte SHA-256 avant d'être utilisé ;
//   - le serveur n'écoute que sur 127.0.0.1, protégé par une clé tirée au hasard, et s'arrête
//     tout seul après quelques minutes sans question pour rendre la mémoire.
// Aucune conversation ne quitte le PC : seul le téléchargement passe par Internet.
const { app } = require('electron');
const { spawn, execFile } = require('child_process');
const { EventEmitter } = require('events');
const { Readable } = require('stream');
const crypto = require('crypto');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');

const SERVER = {
  name: 'moteur llama.cpp',
  url: 'https://github.com/ggml-org/llama.cpp/releases/download/b11557/llama-b11557-bin-win-cpu-x64.zip',
  file: 'llama-b11557-bin-win-cpu-x64.zip',
  size: 19501541,
  sha256: 'bcfca9c8198899d4268e4e6b586113905280dec372a82c7106ebe78bc0eacb5b',
};

const MODELS = [
  {
    id: 'leger', name: 'Léger', ram: 4,
    desc: 'Rapide et discret, pour tous les PC. Bon pour les commandes, plus limité pour discuter.',
    file: 'qwen2.5-0.5b-instruct-q4_k_m.gguf',
    url: 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf',
    size: 491400032,
    sha256: '74a4da8c9fdbcd15bd1f6d01d621410d31c6fc00986f5eb687824e7b93d7a9db',
  },
  {
    id: 'malin', name: 'Malin', ram: 8,
    desc: 'Plus fin pour discuter et comprendre les phrases, demande un PC avec 8 Go de mémoire.',
    file: 'qwen2.5-1.5b-instruct-q4_k_m.gguf',
    url: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf',
    size: 1117320736,
    sha256: '6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e',
  },
];

const IDLE_STOP = 8 * 60000;
const events = new EventEmitter();
const dir = () => path.join(app.getPath('userData'), 'ia');
const settingsFile = () => path.join(dir(), 'ia.json');

let settings = { model: null };
let download = null; // { model, done, total, step, abort }
let server = null;   // { proc, port, key, ready }
let idleTimer = null;

const pidFile = () => path.join(dir(), 'moteur.pid');

function loadSettings() {
  try { settings = { ...settings, ...JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) }; } catch { /* rien d'installé */ }
  killOrphan();
}

// Si Ambiance a été fermée brutalement, le moteur a pu rester ouvert : on l'arrête, après avoir
// vérifié que ce numéro de processus est bien encore le sien.
function killOrphan() {
  let pid;
  try { pid = Number(fs.readFileSync(pidFile(), 'utf8')); } catch { return; }
  fs.rmSync(pidFile(), { force: true });
  if (!pid) return;
  execFile('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], { windowsHide: true }, (err, out) => {
    if (!err && /"llama-server\.exe"/i.test(out)) { try { process.kill(pid); } catch { /* déjà arrêté */ } }
  });
}
function saveSettings() {
  fs.mkdirSync(dir(), { recursive: true });
  fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2));
}

const serverExe = () => path.join(dir(), 'moteur', 'llama-server.exe');
const modelPath = (m) => path.join(dir(), m.file);
const installed = (m) => fs.existsSync(modelPath(m));

// Modèle conseillé selon la mémoire du PC.
function recommended() {
  const gb = os.totalmem() / 2 ** 30;
  return gb >= 7.5 ? 'malin' : 'leger';
}

function state() {
  const active = MODELS.find(m => m.id === settings.model && installed(m)) || null;
  return {
    ready: !!(active && fs.existsSync(serverExe())),
    model: active && active.id,
    models: MODELS.map(m => ({ id: m.id, name: m.name, desc: m.desc, size: m.size, ram: m.ram, installed: installed(m) })),
    recommended: recommended(),
    ramGb: Math.round(os.totalmem() / 2 ** 30),
    download: download && { model: download.model, done: download.done, total: download.total, step: download.step },
    running: !!(server && server.ready),
  };
}
const changed = () => events.emit('state', state());

// ---------- Téléchargement vérifié ----------
// Reprend un téléchargement interrompu (fichier .part) et contrôle l'empreinte à la fin.
async function fetchFile(item, dest, onBytes, signal) {
  const part = dest + '.part';
  const hash = crypto.createHash('sha256');
  let have = 0;
  if (fs.existsSync(part)) {
    have = fs.statSync(part).size;
    if (have > item.size) { fs.rmSync(part); have = 0; }
    else await new Promise((res, rej) => fs.createReadStream(part).on('data', d => hash.update(d)).on('end', res).on('error', rej));
  }
  onBytes(have);
  if (have < item.size) {
    const res = await fetch(item.url, { headers: have ? { Range: `bytes=${have}-` } : {}, signal, redirect: 'follow' });
    if (!res.ok) throw new Error(`Téléchargement refusé (${res.status}).`);
    if (have && res.status !== 206) { hash.destroy(); fs.rmSync(part, { force: true }); return fetchFile(item, dest, onBytes, signal); }
    const out = fs.createWriteStream(part, { flags: have ? 'a' : 'w' });
    try {
      for await (const chunk of Readable.fromWeb(res.body)) {
        hash.update(chunk);
        have += chunk.length;
        if (!out.write(chunk)) await new Promise(r => out.once('drain', r));
        onBytes(have);
      }
    } finally {
      await new Promise(r => out.end(r));
    }
  }
  const sum = hash.digest('hex');
  if (have !== item.size || sum !== item.sha256) {
    fs.rmSync(part, { force: true });
    throw new Error('Le fichier téléchargé est abîmé ou a été modifié : il a été supprimé. Réessayez.');
  }
  fs.renameSync(part, dest);
}

// L'archive du moteur est ouverte avec tar.exe, fourni avec Windows 10 et 11.
function unzip(zip, to) {
  fs.rmSync(to, { recursive: true, force: true });
  fs.mkdirSync(to, { recursive: true });
  const tar = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
  return new Promise((resolve, reject) => execFile(tar, ['-xf', zip, '-C', to], { windowsHide: true }, (err) => {
    if (err) return reject(new Error('Impossible d\'ouvrir l\'archive du moteur.'));
    // Selon les versions, les fichiers sont à la racine ou dans un sous-dossier.
    if (!fs.existsSync(path.join(to, 'llama-server.exe'))) {
      const sub = fs.readdirSync(to).map(d => path.join(to, d)).find(d => fs.existsSync(path.join(d, 'llama-server.exe')));
      if (!sub) return reject(new Error('Le moteur est introuvable dans l\'archive.'));
      for (const f of fs.readdirSync(sub)) fs.renameSync(path.join(sub, f), path.join(to, f));
    }
    resolve();
  }));
}

async function install(id) {
  const model = MODELS.find(m => m.id === id);
  if (!model) throw new Error('Modèle inconnu.');
  if (download) throw new Error('Un téléchargement est déjà en cours.');
  const abort = new AbortController();
  const needServer = !fs.existsSync(serverExe());
  const total = (needServer ? SERVER.size : 0) + (installed(model) ? 0 : model.size);
  download = { model: id, done: 0, total, step: '', abort };
  let last = 0;
  const progress = (base) => (n) => {
    download.done = base + n;
    if (Date.now() - last > 250) { last = Date.now(); changed(); }
  };
  changed();
  try {
    fs.mkdirSync(dir(), { recursive: true });
    let base = 0;
    if (needServer) {
      download.step = SERVER.name;
      const zip = path.join(dir(), SERVER.file);
      await fetchFile(SERVER, zip, progress(0), abort.signal);
      await unzip(zip, path.join(dir(), 'moteur'));
      fs.rmSync(zip, { force: true });
      base = SERVER.size;
    }
    if (!installed(model)) {
      download.step = `modèle ${model.name}`;
      await fetchFile(model, modelPath(model), progress(base), abort.signal);
    }
    stopServer();
    settings.model = id;
    saveSettings();
  } catch (e) {
    if (abort.signal.aborted) throw new Error('Téléchargement annulé.');
    throw e;
  } finally {
    download = null;
    changed();
  }
  return state();
}

function cancel() {
  if (download) download.abort.abort();
}

// Supprime un modèle (et le moteur s'il n'en reste aucun).
function remove(id) {
  const model = MODELS.find(m => m.id === id);
  if (!model) return state();
  if (settings.model === id) stopServer();
  fs.rmSync(modelPath(model), { force: true });
  fs.rmSync(modelPath(model) + '.part', { force: true });
  const left = MODELS.find(m => installed(m));
  if (settings.model === id) settings.model = left ? left.id : null;
  if (!left) fs.rmSync(path.join(dir(), 'moteur'), { recursive: true, force: true });
  saveSettings();
  changed();
  return state();
}

function use(id) {
  const model = MODELS.find(m => m.id === id);
  if (!model || !installed(model)) return state();
  if (settings.model !== id) { stopServer(); settings.model = id; saveSettings(); }
  changed();
  return state();
}

// ---------- Serveur local ----------
function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.unref();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}

async function startServer() {
  if (server) return server.starting;
  const st = state();
  if (!st.ready) throw new Error('L\'IA n\'est pas installée.');
  const model = MODELS.find(m => m.id === st.model);
  const port = await freePort();
  const key = crypto.randomBytes(24).toString('hex');
  const threads = Math.max(2, Math.min(8, Math.floor(os.cpus().length / 2)));
  const proc = spawn(serverExe(), [
    '-m', modelPath(model), '--host', '127.0.0.1', '--port', String(port), '--api-key', key,
    '-c', '4096', '-np', '2', '-t', String(threads), '--no-webui',
  ], { windowsHide: true, cwd: path.dirname(serverExe()) });
  let log = '';
  proc.stderr.on('data', d => { log = (log + d).slice(-4000); });
  proc.stdout.on('data', () => {});
  try { fs.writeFileSync(pidFile(), String(proc.pid)); } catch { /* ignoré */ }
  const me = { proc, port, key, ready: false };
  server = me;
  proc.on('exit', () => {
    fs.rmSync(pidFile(), { force: true });
    if (server === me) { server = null; changed(); }
  });
  me.starting = (async () => {
    // Le modèle met quelques secondes à se charger : on attend que le serveur réponde.
    for (let i = 0; i < 240; i++) {
      if (server !== me) throw new Error(`Le moteur s'est arrêté. ${log.split('\n').filter(Boolean).slice(-2).join(' ')}`);
      try {
        const r = await fetch(`http://127.0.0.1:${port}/health`);
        if (r.ok) { me.ready = true; changed(); return me; }
      } catch { /* pas encore prêt */ }
      await new Promise(r => setTimeout(r, 250));
    }
    stopServer();
    throw new Error('Le moteur met trop de temps à démarrer.');
  })();
  return me.starting;
}

function stopServer() {
  clearTimeout(idleTimer);
  if (!server) return;
  const { proc } = server;
  server = null;
  try { proc.kill(); } catch { /* déjà arrêté */ }
  changed();
}

// messages : [{ role: 'system' | 'user' | 'assistant', content }]
// schema   : schéma JSON imposé à la réponse (le modèle ne peut pas en sortir)
async function chat(messages, { schema = null, temperature = 0.7, maxTokens = 300 } = {}) {
  const s = await startServer();
  clearTimeout(idleTimer);
  try {
    const body = { messages, temperature, max_tokens: maxTokens, cache_prompt: true };
    if (schema) body.response_format = { type: 'json_schema', json_schema: { name: 'reponse', schema, strict: true } };
    const res = await fetch(`http://127.0.0.1:${s.port}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.key}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data) throw new Error((data && data.error && data.error.message) || `Le moteur a répondu ${res.status}.`);
    const text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content || '').trim();
    if (!schema) return text;
    try { return JSON.parse(text); } catch { throw new Error('Réponse illisible du modèle.'); }
  } finally {
    idleTimer = setTimeout(stopServer, IDLE_STOP);
  }
}

module.exports = { init: loadSettings, events, state, install, cancel, remove, use, chat, stop: stopServer, MODELS };
