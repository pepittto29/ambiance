// Musique de n'importe quelle application, via les contrôles média de Windows. Un petit script
// PowerShell (music-helper.ps1) tourne en arrière-plan tant qu'une fenêtre l'écoute : il annonce ce qui
// joue et reçoit les commandes lecture / pause / suivant / précédent.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

const events = new EventEmitter();
let child = null;
let buffer = '';
let last = { sessions: [] };
let users = 0;
let stopTimer = null;

// Noms lisibles des applications les plus courantes (identifiant Windows → nom affiché).
const APPS = [
  [/spotify/i, 'Spotify'],
  [/deezer/i, 'Deezer'],
  [/youtube ?music|ytmusic/i, 'YouTube Music'],
  [/applemusic|apple music/i, 'Apple Music'],
  [/tidal/i, 'Tidal'],
  [/amazon ?music/i, 'Amazon Music'],
  [/qobuz/i, 'Qobuz'],
  [/zunemusic|mediaplayer/i, 'Lecteur multimédia'],
  [/vlc/i, 'VLC'],
  [/msedge|edge/i, 'Microsoft Edge'],
  [/chrome/i, 'Google Chrome'],
  [/firefox/i, 'Firefox'],
  [/opera/i, 'Opera'],
  [/brave/i, 'Brave'],
];
function appName(id) {
  const hit = APPS.find(([re]) => re.test(id));
  if (hit) return hit[1];
  return String(id).replace(/\.exe$/i, '').replace(/^.*!/, '').replace(/_[a-z0-9]{13}$/i, '') || 'Application';
}

function handle(line) {
  let data;
  try { data = JSON.parse(line); } catch { return; }
  const sessions = (data.sessions || [])
    .filter(s => !/ambiance|electron/i.test(s.app))
    .map(s => ({ ...s, name: appName(s.app), at: Date.now() }));
  // La session mise en avant : celle que Windows considère comme actuelle, sinon celle qui joue.
  sessions.sort((a, b) => (b.current - a.current) || ((b.status === 'Playing') - (a.status === 'Playing')));
  last = { sessions };
  events.emit('state', last);
}

function start() {
  if (child || process.platform !== 'win32') return;
  // Le script est envoyé encodé : il reste lisible même depuis l'archive de l'application installée.
  const script = fs.readFileSync(path.join(__dirname, 'music-helper.ps1'), 'utf8');
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], { windowsHide: true });
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', chunk => {
    buffer += chunk;
    let i;
    while ((i = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, i).trim();
      buffer = buffer.slice(i + 1);
      if (line) handle(line);
    }
  });
  child.stderr.on('data', () => { /* erreurs WinRT passagères : ignorées */ });
  child.on('exit', () => {
    child = null;
    buffer = '';
    // Redémarre si quelqu'un écoute encore (ex. le script a planté).
    if (users > 0) setTimeout(start, 3000);
  });
  child.stdin.on('error', () => { /* processus déjà terminé */ });
}

function stop() {
  if (!child) return;
  try { child.stdin.end(); } catch { /* ignoré */ }
  const c = child;
  setTimeout(() => { try { c.kill(); } catch { /* ignoré */ } }, 1000);
  child = null;
}

// Les écrans qui affichent la musique s'abonnent ; le script s'arrête 20 s après le dernier départ.
function watch(on) {
  users = Math.max(0, users + (on ? 1 : -1));
  clearTimeout(stopTimer);
  if (users > 0) start();
  else stopTimer = setTimeout(stop, 20000);
  return last;
}

const COMMANDS = new Set(['play', 'pause', 'toggle', 'next', 'prev']);
function command(cmd, app) {
  if (!COMMANDS.has(cmd)) return;
  if (!child) start();
  const target = app && /^[\w.!\-\s]+$/.test(app) ? ` ${app}` : '';
  try { child.stdin.write(`${cmd}${target}\n`); } catch { /* ignoré */ }
}

module.exports = { events, watch, command, state: () => last, stop: () => { users = 0; stop(); }, appName };
