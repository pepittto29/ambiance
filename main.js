const { app, BrowserWindow, ipcMain, dialog, nativeTheme, systemPreferences, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const pet = require('./pet-main');

// Les erreurs du processus principal sont consignées dans %APPDATA%\Ambiance\main.log.
function logError(err) {
  try {
    fs.appendFileSync(path.join(app.getPath('userData'), 'main.log'), `[${new Date().toISOString()}] ${err && err.stack || err}\n`);
  } catch { /* journal indisponible */ }
}
process.on('uncaughtException', logError);
process.on('unhandledRejection', logError);

const NORMAL_MIN = { w: 720, h: 520 };
const COMPACT = { w: 360, h: 230 };

// Mica n'existe que sur Windows 11 22H2+ (build 22621).
const build = parseInt(os.release().split('.')[2] || '0', 10);
const hasMica = process.platform === 'win32' && build >= 22621;

let win = null;
let tray = null;
let quitting = false;
let playing = false;
let normalBounds = null;

const soundsDir = () => path.join(app.getPath('userData'), 'sounds');
const builtinDir = path.join(__dirname, 'src', 'sounds');

// Préférences lues par le processus principal (nécessaires avant l'ouverture de la fenêtre).
const configPath = () => path.join(app.getPath('userData'), 'config.json');
let config = { pet: true, petSound: true, closeToTray: true, petScreen: true, petCheese: true, petHoles: true, petAnimal: 'souris', burrow: null };
const petOptions = () => ({ screenLines: config.petScreen, cheese: config.petCheese, holes: config.petHoles, animal: config.petAnimal, burrow: config.burrow });
function loadConfig() {
  try { Object.assign(config, JSON.parse(fs.readFileSync(configPath(), 'utf8'))); } catch { /* première exécution */ }
}
function saveConfig() {
  try { fs.writeFileSync(configPath(), JSON.stringify(config, null, 2)); } catch { /* ignoré */ }
}

function showWindow() {
  if (!win) createWindow();
  else {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  }
}

function updateTray() {
  if (!tray) return;
  tray.setToolTip(playing ? 'Ambiance — lecture en cours' : 'Ambiance');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Ouvrir Ambiance', click: showWindow },
    { label: playing ? 'Pause' : 'Lecture', click: () => win && win.webContents.send('toggle-play') },
    { type: 'separator' },
    {
      label: 'Compagnon de bureau', type: 'checkbox', checked: config.pet,
      click: (item) => setPet(item.checked),
    },
    { label: 'Donner à manger', enabled: config.pet, click: () => pet.giveFood() },
    { type: 'separator' },
    { label: 'Quitter', click: () => { quitting = true; app.quit(); } },
  ]));
}

function createTray() {
  const img = nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.png')).resize({ width: 16, height: 16 });
  tray = new Tray(img);
  tray.on('click', showWindow);
  updateTray();
}

function setPet(on) {
  config.pet = !!on;
  saveConfig();
  if (on) pet.start(); else pet.stop();
  updateTray();
  if (win) win.webContents.send('config', config);
}

function overlay() {
  const dark = nativeTheme.shouldUseDarkColors;
  return { color: '#00000000', symbolColor: dark ? '#ffffff' : '#1a1a1a', height: 40 };
}

function solidBg() {
  return nativeTheme.shouldUseDarkColors ? '#202020' : '#f3f3f3';
}

function createWindow() {
  win = new BrowserWindow({
    width: 1120,
    height: 740,
    minWidth: NORMAL_MIN.w,
    minHeight: NORMAL_MIN.h,
    title: 'Ambiance',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    show: false,
    backgroundColor: hasMica ? '#00000000' : solidBg(),
    ...(hasMica ? { backgroundMaterial: 'mica' } : {}),
    titleBarStyle: 'hidden',
    titleBarOverlay: overlay(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Les minuteries audio doivent continuer quand la fenêtre est réduite.
      backgroundThrottling: false,
    },
  });

  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  // ready-to-show n'est pas toujours émis quand la fenêtre de la souris existe déjà :
  // la fin du chargement sert de second déclencheur.
  let revealed = false;
  const reveal = () => {
    if (revealed || !win) return;
    revealed = true;
    if (!startHidden) win.show();
    startHidden = false;
  };
  win.once('ready-to-show', reveal);
  win.webContents.once('did-finish-load', () => setTimeout(reveal, 100));
  // Fermer la fenêtre la range dans la zone de notification : le son et la souris continuent.
  win.on('close', (e) => {
    if (!quitting && config.closeToTray) {
      e.preventDefault();
      if (win.isFullScreen()) win.setFullScreen(false);
      // Fermer coupe le son ; seule la souris continue de vivre près de l'horloge.
      win.webContents.send('pause');
      win.hide();
    }
  });
  win.on('closed', () => { win = null; });
}

let startHidden = process.argv.includes('--hidden');

nativeTheme.on('updated', () => {
  if (!win) return;
  win.setTitleBarOverlay(overlay());
  if (!hasMica) win.setBackgroundColor(solidBg());
});

ipcMain.handle('info', () => {
  let accent = null;
  try { accent = '#' + systemPreferences.getAccentColor().slice(0, 6); } catch { /* non disponible */ }
  return {
    mica: hasMica,
    accent,
    version: app.getVersion(),
    openAtLogin: app.getLoginItemSettings().openAtLogin,
    config,
  };
});

ipcMain.handle('set-config', (_e, patch) => {
  if ('pet' in patch && patch.pet !== config.pet) setPet(patch.pet);
  if ('petSound' in patch) { config.petSound = !!patch.petSound; pet.setSound(config.petSound); }
  for (const k of ['petScreen', 'petCheese', 'petHoles']) if (k in patch) config[k] = !!patch[k];
  if (typeof patch.petAnimal === 'string') config.petAnimal = patch.petAnimal;
  if ('burrow' in patch && patch.burrow === null) config.burrow = null;
  pet.setOptions(petOptions());
  if ('closeToTray' in patch) config.closeToTray = !!patch.closeToTray;
  saveConfig();
  updateTray();
  return config;
});

ipcMain.handle('pick-burrow', async () => {
  if (!config.pet) setPet(true);
  const point = await pet.pickBurrow();
  if (point) {
    config.burrow = point;
    saveConfig();
    pet.setOptions(petOptions());
  }
  return config;
});

ipcMain.on('playing', (_e, on) => {
  playing = !!on;
  updateTray();
});

ipcMain.handle('read-builtin', async (_e, name) => {
  const file = path.basename(String(name));
  return fs.promises.readFile(path.join(builtinDir, file)).then(b => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
});

ipcMain.handle('set-compact', (_e, on) => {
  if (!win) return;
  if (win.isFullScreen()) win.setFullScreen(false);
  if (on) {
    if (win.isMaximized()) win.unmaximize();
    normalBounds = win.getBounds();
    win.setMinimumSize(300, 160);
    win.setSize(COMPACT.w, COMPACT.h);
    win.setAlwaysOnTop(true, 'floating');
  } else {
    win.setAlwaysOnTop(false);
    win.setMinimumSize(NORMAL_MIN.w, NORMAL_MIN.h);
    if (normalBounds) win.setBounds(normalBounds);
  }
});

ipcMain.handle('set-fullscreen', (_e, on) => {
  if (win) win.setFullScreen(!!on);
});

ipcMain.handle('set-open-at-login', (_e, on) => {
  // Au démarrage de Windows, l'application s'ouvre discrètement dans la zone de notification.
  app.setLoginItemSettings({ openAtLogin: !!on, args: ['--hidden'] });
  return app.getLoginItemSettings().openAtLogin;
});

ipcMain.handle('import-sounds', async () => {
  const res = await dialog.showOpenDialog(win, {
    title: 'Importer des sons',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac', 'opus', 'webm'] }],
  });
  if (res.canceled) return [];
  await fs.promises.mkdir(soundsDir(), { recursive: true });
  const out = [];
  for (const src of res.filePaths) {
    const id = 'custom-' + crypto.randomUUID();
    const file = id + path.extname(src).toLowerCase();
    await fs.promises.copyFile(src, path.join(soundsDir(), file));
    out.push({ id, name: path.basename(src, path.extname(src)), file });
  }
  return out;
});

// Seuls les fichiers du dossier de sons de l'application sont accessibles.
function safeSoundPath(file) {
  const p = path.resolve(soundsDir(), String(file));
  if (path.dirname(p) !== path.resolve(soundsDir())) throw new Error('Chemin invalide');
  return p;
}

ipcMain.handle('read-sound', async (_e, file) => {
  const buf = await fs.promises.readFile(safeSoundPath(file));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
});

ipcMain.handle('delete-sound', async (_e, file) => {
  await fs.promises.rm(safeSoundPath(file), { force: true });
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showWindow);
  app.whenReady().then(() => {
    app.setAppUserModelId('com.pierre.ambiance');
    loadConfig();
    pet.setSound(config.petSound);
    pet.setOptions(petOptions());
    createTray();
    createWindow();
    if (config.pet) pet.start();
  });
  app.on('before-quit', () => { quitting = true; pet.stop(); });
  // La souris et la zone de notification gardent l'application en vie.
  app.on('window-all-closed', () => { if (!config.pet && !config.closeToTray) app.quit(); });
}
