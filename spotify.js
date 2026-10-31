// Connexion à un compte Spotify (API Web officielle, autorisation PKCE : aucun secret dans l'application).
// Depuis 2026, Spotify n'autorise que 5 comptes par identifiant d'application tant qu'elle n'est pas
// validée : chaque utilisateur crée donc son propre identifiant (gratuit, 5 minutes) et le colle dans
// Ambiance. Les jetons sont chiffrés avec le coffre de Windows (safeStorage) et ne quittent pas le PC.
const { app, safeStorage, shell } = require('electron');
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = 43821;
const REDIRECT = `http://127.0.0.1:${PORT}/callback`;
const SCOPES = [
  'user-read-playback-state', 'user-modify-playback-state', 'user-read-currently-playing',
  'playlist-read-private', 'playlist-read-collaborative', 'user-library-read',
].join(' ');

const file = () => path.join(app.getPath('userData'), 'spotify.json');
let store = { clientId: '', tokens: null, user: null };
let server = null;

function load() {
  try {
    const raw = JSON.parse(fs.readFileSync(file(), 'utf8'));
    store.clientId = raw.clientId || '';
    store.user = raw.user || null;
    if (raw.tokens && safeStorage.isEncryptionAvailable()) {
      store.tokens = JSON.parse(safeStorage.decryptString(Buffer.from(raw.tokens, 'base64')));
    }
  } catch { /* pas encore connecté */ }
}

function save() {
  const out = { clientId: store.clientId, user: store.user, tokens: null };
  if (store.tokens && safeStorage.isEncryptionAvailable()) {
    out.tokens = safeStorage.encryptString(JSON.stringify(store.tokens)).toString('base64');
  }
  try { fs.writeFileSync(file(), JSON.stringify(out, null, 2)); } catch { /* ignoré */ }
}

const state = () => ({ clientId: store.clientId, connected: !!store.tokens, user: store.user, redirect: REDIRECT });

function setClientId(id) {
  const clean = String(id || '').trim();
  if (clean && !/^[0-9a-f]{32}$/i.test(clean)) throw new Error('Cet identifiant ne ressemble pas à un Client ID Spotify (32 caractères).');
  if (clean !== store.clientId) { store.tokens = null; store.user = null; }
  store.clientId = clean;
  save();
  return state();
}

async function token(params) {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: store.clientId, ...params }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error_description || data.error || `Spotify a refusé la connexion (${res.status}).`);
  store.tokens = {
    access: data.access_token,
    refresh: data.refresh_token || (store.tokens && store.tokens.refresh),
    expires: Date.now() + (data.expires_in - 60) * 1000,
  };
  save();
}

const PAGE = (title, text) => `<!doctype html><meta charset="utf-8"><title>Ambiance</title>
<body style="font-family:Segoe UI,sans-serif;background:#121212;color:#fff;display:grid;place-items:center;height:90vh;margin:0">
<div style="text-align:center"><h1 style="font-size:28px">${title}</h1><p style="color:#b3b3b3">${text}</p></div>`;

// Ouvre la page d'autorisation de Spotify dans le navigateur et attend le retour sur 127.0.0.1.
function connect() {
  if (!store.clientId) return Promise.reject(new Error('Collez d\'abord votre Client ID Spotify.'));
  if (server) { server.close(); server = null; }
  const verifier = crypto.randomBytes(48).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const expected = crypto.randomBytes(16).toString('hex');

  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (err) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      own.close();
      if (server === own) server = null;
      if (err) reject(err); else resolve(state());
    };
    const timer = setTimeout(() => finish(new Error('Connexion abandonnée (aucune réponse de Spotify après 5 minutes).')), 5 * 60 * 1000);
    const own = http.createServer(async (req, res) => {
      const url = new URL(req.url, REDIRECT);
      if (url.pathname !== '/callback') { res.writeHead(404); res.end(); return; }
      const code = url.searchParams.get('code');
      // Connection: close : le navigateur ne garde pas de connexion ouverte vers une ancienne tentative.
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', Connection: 'close' });
      if (url.searchParams.get('state') !== expected || !code) {
        const denied = url.searchParams.get('error') === 'access_denied';
        res.end(PAGE('Connexion annulée', denied ? 'Vous avez refusé l\'accès. Vous pouvez fermer cet onglet.' : 'Réponse inattendue de Spotify. Réessayez depuis Ambiance.'));
        finish(new Error(denied ? 'Connexion refusée sur Spotify.' : 'Réponse inattendue de Spotify.'));
        return;
      }
      try {
        await token({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT, code_verifier: verifier });
        const me = await api('GET', '/me');
        store.user = { name: me.display_name || me.id, image: me.images && me.images[0] ? me.images[0].url : null };
        save();
        res.end(PAGE('✓ Spotify est connecté', 'Vous pouvez fermer cet onglet et revenir dans Ambiance.'));
        finish();
      } catch (e) {
        res.end(PAGE('Connexion impossible', e.message));
        finish(e);
      }
    });
    server = own;
    own.on('error', e => finish(new Error(e.code === 'EADDRINUSE' ? `Le port ${PORT} est déjà utilisé sur ce PC.` : e.message)));
    own.listen(PORT, '127.0.0.1', () => {
      const q = new URLSearchParams({
        client_id: store.clientId, response_type: 'code', redirect_uri: REDIRECT, scope: SCOPES,
        code_challenge_method: 'S256', code_challenge: challenge, state: expected,
      });
      shell.openExternal(`https://accounts.spotify.com/authorize?${q}`);
    });
  });
}

function disconnect() {
  store.tokens = null;
  store.user = null;
  save();
  return state();
}

class SpotifyError extends Error {
  constructor(message, code) { super(message); this.code = code; }
}

async function api(method, route, body, retry = true) {
  if (!store.tokens) throw new SpotifyError('Spotify n\'est pas connecté.', 'not-connected');
  if (Date.now() > store.tokens.expires) await token({ grant_type: 'refresh_token', refresh_token: store.tokens.refresh });
  const res = await fetch(`https://api.spotify.com/v1${route}`, {
    method,
    headers: { Authorization: `Bearer ${store.tokens.access}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && retry) {
    try { await token({ grant_type: 'refresh_token', refresh_token: store.tokens.refresh }); } catch {
      disconnect();
      throw new SpotifyError('La connexion à Spotify a expiré. Reconnectez-vous.', 'not-connected');
    }
    return api(method, route, body, false);
  }
  if (res.status === 204 || res.status === 202) return null;
  const data = await res.json().catch(() => null);
  if (res.ok) return data;
  const reason = data && data.error && data.error.reason;
  if (res.status === 404 && (reason === 'NO_ACTIVE_DEVICE' || /player/.test(route))) throw new SpotifyError('Aucun appareil Spotify actif.', 'no-device');
  if (res.status === 403) throw new SpotifyError('Spotify Premium est nécessaire pour piloter la lecture.', 'premium');
  if (res.status === 429) throw new SpotifyError('Spotify demande de patienter quelques secondes.', 'rate');
  throw new SpotifyError((data && data.error && data.error.message) || `Erreur Spotify (${res.status}).`, 'api');
}

const image = (imgs) => (imgs && imgs.length ? (imgs.find(i => i.width && i.width <= 320) || imgs[0]).url : null);

async function library() {
  const [pl, liked] = await Promise.all([api('GET', '/me/playlists?limit=50'), api('GET', '/me/tracks?limit=1')]);
  const playlists = (pl.items || []).filter(Boolean).map(p => ({
    uri: p.uri, name: p.name, image: image(p.images), owner: p.owner && p.owner.display_name,
    count: (p.items || p.tracks || {}).total,
  }));
  return { liked: liked.total || 0, playlists };
}

async function search(q) {
  const data = await api('GET', `/search?type=playlist,album,track&limit=10&q=${encodeURIComponent(q)}`);
  const out = [];
  for (const t of (data.tracks && data.tracks.items) || []) {
    if (t) out.push({ uri: t.uri, kind: 'Titre', name: t.name, sub: t.artists.map(a => a.name).join(', '), image: image(t.album && t.album.images) });
  }
  for (const a of (data.albums && data.albums.items) || []) {
    if (a) out.push({ uri: a.uri, kind: 'Album', name: a.name, sub: a.artists.map(x => x.name).join(', '), image: image(a.images) });
  }
  for (const p of (data.playlists && data.playlists.items) || []) {
    if (p) out.push({ uri: p.uri, kind: 'Playlist', name: p.name, sub: p.owner && p.owner.display_name, image: image(p.images) });
  }
  return out;
}

// Convertit un lien open.spotify.com en URI spotify:… (les autres valeurs sont renvoyées telles quelles).
function toUri(link) {
  const m = String(link || '').match(/open\.spotify\.com\/(?:intl-[a-z]+\/)?(track|album|playlist|artist|episode|show)\/([A-Za-z0-9]+)/);
  return m ? `spotify:${m[1]}:${m[2]}` : String(link || '').trim();
}
const isSpotify = (link) => /^spotify:/.test(toUri(link)) || link === 'liked';

const wait = ms => new Promise(r => setTimeout(r, ms));

async function playOn(uri, device) {
  const q = device ? `?device_id=${device}` : '';
  if (uri === 'liked') {
    const t = await api('GET', '/me/tracks?limit=50');
    return api('PUT', `/me/player/play${q}`, { uris: t.items.map(i => i.track.uri) });
  }
  if (/^spotify:(track|episode):/.test(uri)) return api('PUT', `/me/player/play${q}`, { uris: [uri] });
  return api('PUT', `/me/player/play${q}`, { context_uri: uri });
}

// Lance un titre, un album ou une playlist. Si aucun appareil n'est actif, ouvre l'application Spotify
// du PC puis réessaie sur elle.
async function play(link) {
  const uri = link === 'liked' ? 'liked' : toUri(link);
  try { return await playOn(uri); } catch (e) {
    if (e.code !== 'no-device') throw e;
  }
  let devices = (await api('GET', '/me/player/devices')).devices || [];
  if (!devices.length) {
    shell.openExternal('spotify:');
    for (let i = 0; i < 10 && !devices.length; i++) {
      await wait(1500);
      devices = (await api('GET', '/me/player/devices')).devices || [];
    }
  }
  if (!devices.length) throw new SpotifyError('Ouvrez l\'application Spotify sur ce PC puis réessayez.', 'no-device');
  const own = devices.find(d => d.type === 'Computer') || devices[0];
  return playOn(uri, own.id);
}

module.exports = { init: load, state, setClientId, connect, disconnect, library, search, play, toUri, isSpotify, REDIRECT };
