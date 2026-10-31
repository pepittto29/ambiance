// Réglages de Windows pilotés par les modes. Règle d'or : avant de changer un réglage, on note sa
// valeur d'origine dans %APPDATA%\Ambiance\restore.json ; tout est remis en place en quittant le
// mode ou l'application, et au démarrage suivant si l'application a été fermée brutalement.
// Les filtres de couleur (noir et blanc, écran chaud, atténuation) passent par l'API Loupe de
// Windows : ils disparaissent d'eux-mêmes si l'application s'arrête.
const { app, powerSaveBlocker } = require('electron');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const koffi = require('koffi');

const user32 = koffi.load('user32.dll');
const shell32 = koffi.load('shell32.dll');
const kernel32 = koffi.load('kernel32.dll');

const RECT = koffi.struct('WS_RECT', { left: 'long', top: 'long', right: 'long', bottom: 'long' });
const APPBARDATA = koffi.struct('APPBARDATA', {
  cbSize: 'uint32', hWnd: 'void *', uCallbackMessage: 'uint32', uEdge: 'uint32', rc: RECT, lParam: 'intptr_t',
});
const EnumProc = koffi.proto('bool __stdcall WsEnumProc(void *hwnd, intptr_t lparam)');

const FindWindowW = user32.func('void * __stdcall FindWindowW(str16 cls, str16 name)');
const FindWindowExW = user32.func('void * __stdcall FindWindowExW(void *parent, void *after, str16 cls, str16 name)');
const SendMessageW = user32.func('intptr_t __stdcall SendMessageW(void *hwnd, uint32_t msg, uintptr_t wp, intptr_t lp)');
const SendMessageTimeoutW = user32.func('intptr_t __stdcall SendMessageTimeoutW(intptr_t hwnd, uint32_t msg, uintptr_t wp, str16 lp, uint32_t flags, uint32_t timeout, _Out_ uintptr_t *res)');
const IsWindowVisible = user32.func('bool __stdcall IsWindowVisible(void *hwnd)');
const ShowWindow = user32.func('bool __stdcall ShowWindow(void *hwnd, int cmd)');
const EnumWindows = user32.func('bool __stdcall EnumWindows(WsEnumProc *cb, intptr_t lparam)');
const GetWindowThreadProcessId = user32.func('uint32_t __stdcall GetWindowThreadProcessId(void *hwnd, _Out_ uint32_t *pid)');
const GetWindowTextLengthW = user32.func('int __stdcall GetWindowTextLengthW(void *hwnd)');
const SystemParametersInfoGet = user32.func('bool __stdcall SystemParametersInfoW(uint32_t action, uint32_t param, void *pv, uint32_t ini)');
const SystemParametersInfoSet = user32.func('bool __stdcall SystemParametersInfoW(uint32_t action, uint32_t param, str16 pv, uint32_t ini)');
const SHAppBarMessage = shell32.func('uintptr_t __stdcall SHAppBarMessage(uint32_t msg, _Inout_ APPBARDATA *data)');
const OpenProcess = kernel32.func('void * __stdcall OpenProcess(uint32_t access, bool inherit, uint32_t pid)');
const CloseHandle = kernel32.func('bool __stdcall CloseHandle(void *h)');
const QueryFullProcessImageNameW = kernel32.func('bool __stdcall QueryFullProcessImageNameW(void *h, uint32_t flags, void *buf, _Inout_ uint32_t *size)');

let mag = null;
try {
  const lib = koffi.load('Magnification.dll');
  const MAGCOLOREFFECT = koffi.struct('MAGCOLOREFFECT', { transform: koffi.array('float', 25) });
  mag = {
    init: lib.func('bool __stdcall MagInitialize()'),
    setEffect: lib.func('bool __stdcall MagSetFullscreenColorEffect(MAGCOLOREFFECT *effect)'),
    ready: false,
  };
} catch { /* filtres de couleur indisponibles */ }

const journalPath = () => path.join(app.getPath('userData'), 'restore.json');
let journal = {};
let blocker = null;

function loadJournal() {
  try { journal = JSON.parse(fs.readFileSync(journalPath(), 'utf8')); } catch { journal = {}; }
}
function saveJournal() {
  try {
    if (Object.keys(journal).length) fs.writeFileSync(journalPath(), JSON.stringify(journal, null, 2));
    else fs.rmSync(journalPath(), { force: true });
  } catch { /* ignoré */ }
}

// ---------- Registre (via reg.exe) ----------
const PERSONALIZE = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize';
const PUSH = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\PushNotifications';

function regGet(key, name) {
  try {
    const out = execFileSync('reg', ['query', key, '/v', name], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    const m = out.match(/REG_DWORD\s+0x([0-9a-f]+)/i);
    return m ? parseInt(m[1], 16) : null;
  } catch { return null; }
}
function regSet(key, name, value) {
  execFileSync('reg', ['add', key, '/v', name, '/t', 'REG_DWORD', '/d', String(value), '/f'], { windowsHide: true });
}
function broadcast(area) {
  SendMessageTimeoutW(0xffff, 0x001a, 0, area, 0x0002, 1000, [0]);
}

// ---------- Chaque réglage : lire / écrire ----------
function desktopView() {
  let view = FindWindowExW(FindWindowW('Progman', null), null, 'SHELLDLL_DefView', null);
  if (view) return view;
  // Sur certains systèmes, l'affichage du bureau est rangé sous une fenêtre « WorkerW ».
  const cb = koffi.register((h) => {
    const v = FindWindowExW(h, null, 'SHELLDLL_DefView', null);
    if (v) { view = v; return false; }
    return true;
  }, koffi.pointer(EnumProc));
  EnumWindows(cb, 0);
  koffi.unregister(cb);
  return view;
}

const SETTINGS = {
  theme: {
    get: () => ({ apps: regGet(PERSONALIZE, 'AppsUseLightTheme') ?? 1, system: regGet(PERSONALIZE, 'SystemUsesLightTheme') ?? 0 }),
    set: (v) => {
      const val = typeof v === 'string' ? (v === 'light' ? { apps: 1, system: 1 } : { apps: 0, system: 0 }) : v;
      regSet(PERSONALIZE, 'AppsUseLightTheme', val.apps);
      regSet(PERSONALIZE, 'SystemUsesLightTheme', val.system);
      broadcast('ImmersiveColorSet');
    },
  },
  notifications: {
    get: () => regGet(PUSH, 'ToastEnabled') ?? 1,
    set: (v) => { regSet(PUSH, 'ToastEnabled', v === false || v === 0 ? 0 : 1); broadcast('Policy'); },
  },
  hideIcons: {
    get: () => {
      const view = desktopView();
      const list = view && FindWindowExW(view, null, 'SysListView32', null);
      return list ? !IsWindowVisible(list) : false;
    },
    set: (hide) => {
      const view = desktopView();
      const list = view && FindWindowExW(view, null, 'SysListView32', null);
      // La commande 0x7402 bascule « Afficher les icônes du bureau » (comme le menu du bureau).
      if (list && !IsWindowVisible(list) !== !!hide) SendMessageW(view, 0x0111, 0x7402, 0);
    },
  },
  autoHideTaskbar: {
    get: () => {
      const data = { cbSize: koffi.sizeof(APPBARDATA), hWnd: FindWindowW('Shell_TrayWnd', null), uCallbackMessage: 0, uEdge: 0, rc: { left: 0, top: 0, right: 0, bottom: 0 }, lParam: 0 };
      return (Number(SHAppBarMessage(4, data)) & 1) === 1;
    },
    set: (on) => {
      const data = { cbSize: koffi.sizeof(APPBARDATA), hWnd: FindWindowW('Shell_TrayWnd', null), uCallbackMessage: 0, uEdge: 0, rc: { left: 0, top: 0, right: 0, bottom: 0 }, lParam: on ? 1 : 2 };
      SHAppBarMessage(10, data);
    },
  },
  power: {
    get: () => {
      const out = execFileSync('powercfg', ['/getactivescheme'], { encoding: 'utf8', windowsHide: true });
      return (out.match(/[0-9a-f]{8}-[0-9a-f-]{27}/i) || [null])[0];
    },
    set: (v) => {
      const alias = { saver: 'SCHEME_MAX', balanced: 'SCHEME_BALANCED', perf: 'SCHEME_MIN' }[v] || v;
      // Sur les portables récents, seul le mode « Équilibré » existe : on ignore alors l'erreur.
      try { execFileSync('powercfg', ['/setactive', alias], { windowsHide: true }); } catch { /* indisponible */ }
    },
  },
  wallpaper: {
    get: () => {
      const buf = Buffer.alloc(1040);
      SystemParametersInfoGet(0x0073, 520, buf, 0);
      return buf.toString('utf16le').replace(/\0.*$/s, '');
    },
    set: (file) => { SystemParametersInfoSet(0x0014, 0, file || '', 0x01 | 0x02); },
  },
};

// Applique les réglages Windows d'un mode. Une valeur null ou absente remet le réglage d'origine.
function applyWindows(win = {}) {
  for (const key of Object.keys(SETTINGS)) {
    const want = win[key];
    try {
      if (want === null || want === undefined) {
        if (key in journal) { SETTINGS[key].set(journal[key]); delete journal[key]; }
      } else {
        if (!(key in journal)) journal[key] = SETTINGS[key].get();
        SETTINGS[key].set(want);
      }
    } catch (e) {
      console.error('Réglage impossible :', key, e.message);
    }
    saveJournal();
  }
  setKeepAwake(!!win.keepAwake);
}

function restoreAll() {
  applyWindows({});
  setScreen({});
}

function setKeepAwake(on) {
  if (on && blocker === null) blocker = powerSaveBlocker.start('prevent-display-sleep');
  if (!on && blocker !== null) { powerSaveBlocker.stop(blocker); blocker = null; }
}

// ---------- Filtres de couleur de l'écran ----------
const IDENTITY = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1];

function mul(a, b) {
  const out = Array(25).fill(0);
  for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) for (let k = 0; k < 5; k++) out[i * 5 + j] += a[i * 5 + k] * b[k * 5 + j];
  return out;
}

// screen : { grayscale: bool, warmth: 0..1, dim: 0..1 }
function setScreen(screen = {}) {
  if (!mag) return false;
  if (!mag.ready) mag.ready = mag.init();
  if (!mag.ready) return false;
  let m = IDENTITY;
  if (screen.grayscale) {
    // Chaque ligne = canal d'entrée (R, V, B) ; chaque colonne = canal de sortie.
    m = mul(m, [0.3, 0.3, 0.3, 0, 0, 0.59, 0.59, 0.59, 0, 0, 0.11, 0.11, 0.11, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1]);
  }
  const w = Math.max(0, Math.min(1, screen.warmth || 0));
  if (w > 0) m = mul(m, [1, 0, 0, 0, 0, 0, 1 - 0.18 * w, 0, 0, 0, 0, 0, 1 - 0.6 * w, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1]);
  const d = 1 - Math.max(0, Math.min(0.7, screen.dim || 0));
  if (d < 1) m = mul(m, [d, 0, 0, 0, 0, 0, d, 0, 0, 0, 0, 0, d, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1]);
  return mag.setEffect({ transform: m });
}

// ---------- Applications ----------
function exeOfWindow(hwnd) {
  const pid = [0];
  GetWindowThreadProcessId(hwnd, pid);
  const h = OpenProcess(0x1000, false, pid[0]);
  if (!h) return null;
  const buf = Buffer.alloc(1040);
  const size = [520];
  const ok = QueryFullProcessImageNameW(h, 0, buf, size);
  CloseHandle(h);
  return ok ? path.basename(buf.toString('utf16le', 0, size[0] * 2)).toLowerCase() : null;
}

function eachAppWindow(fn) {
  const cb = koffi.register((hwnd) => {
    if (IsWindowVisible(hwnd) && GetWindowTextLengthW(hwnd) > 0) {
      const exe = exeOfWindow(hwnd);
      if (exe) fn(hwnd, exe);
    }
    return true;
  }, koffi.pointer(EnumProc));
  EnumWindows(cb, 0);
  koffi.unregister(cb);
}

const SYSTEM_APPS = ['explorer.exe', 'ambiance.exe', 'electron.exe', 'textinputhost.exe', 'applicationframehost.exe',
  'systemsettings.exe', 'searchhost.exe', 'shellexperiencehost.exe', 'startmenuexperiencehost.exe', 'lockapp.exe'];

// Applications ouvertes (pour choisir celles à réduire pendant un mode).
function runningApps() {
  const set = new Set();
  eachAppWindow((_h, exe) => { if (!SYSTEM_APPS.includes(exe)) set.add(exe); });
  return [...set].sort();
}

// Réduit (sans les fermer) les fenêtres des applications listées.
function minimizeApps(names = []) {
  const wanted = new Set(names.map(n => n.toLowerCase().replace(/(\.exe)?$/, '.exe')));
  if (!wanted.size) return 0;
  let n = 0;
  eachAppWindow((hwnd, exe) => { if (wanted.has(exe)) { ShowWindow(hwnd, 6); n++; } });
  return n;
}

function init() {
  loadJournal();
  // Une fermeture brutale a pu laisser des réglages modifiés : on remet tout d'origine.
  if (Object.keys(journal).length) applyWindows({});
}

module.exports = { init, applyWindows, restoreAll, setScreen, runningApps, minimizeApps, SETTINGS };
