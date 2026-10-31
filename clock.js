// Petite horloge pixel art, toujours visible et déplaçable. Elle affiche aussi le temps restant
// d'une session Focus en cours. Sa position est mémorisée dans la configuration.
const { BrowserWindow, screen } = require('electron');
const path = require('path');

const W = 210, H = 86;
let win = null;
let focus = null;
let opts = {};

function onScreen(x, y) {
  return screen.getAllDisplays().some(d => {
    const a = d.workArea;
    return x >= a.x - W / 2 && x <= a.x + a.width - W / 2 && y >= a.y - 10 && y <= a.y + a.height - H / 2;
  });
}

function send() {
  if (win && !win.isDestroyed()) win.webContents.send('pet-state', { seconds: !!opts.seconds, date: opts.date !== false, focus });
}

// cfg : { show, seconds, date, x, y } ; saveCb reçoit la nouvelle position quand on la déplace.
function apply(cfg, saveCb) {
  opts = cfg;
  if (!cfg.show) {
    if (win && !win.isDestroyed()) win.destroy();
    win = null;
    return;
  }
  if (!win) {
    const a = screen.getPrimaryDisplay().workArea;
    const pos = cfg.x !== null && cfg.x !== undefined && onScreen(cfg.x, cfg.y) ? { x: cfg.x, y: cfg.y } : { x: a.x + a.width - W - 24, y: a.y + 20 };
    win = new BrowserWindow({
      ...pos, width: W, height: H, transparent: true, frame: false, resizable: false, skipTaskbar: true,
      alwaysOnTop: true, hasShadow: false, show: false, maximizable: false, minimizable: false, fullscreenable: false,
      webPreferences: { preload: path.join(__dirname, 'pet-preload.js'), backgroundThrottling: false },
    });
    win.setAlwaysOnTop(true, 'floating');
    win.loadFile(path.join(__dirname, 'src', 'pet', 'clock.html'));
    win.once('ready-to-show', () => { win.showInactive(); send(); });
    win.on('moved', () => {
      const b = win.getBounds();
      if (saveCb) saveCb({ x: b.x, y: b.y });
    });
    win.on('closed', () => { win = null; });
  }
  send();
}

function setFocus(s) {
  focus = s && s.running ? s : null;
  send();
}

module.exports = { apply, setFocus };
