// Liste des fenêtres visibles de Windows (ordre d'empilement, du dessus vers le dessous)
// via l'API Win32, appelée avec koffi. Les coordonnées renvoyées sont en pixels physiques.
const koffi = require('koffi');

const user32 = koffi.load('user32.dll');
const dwmapi = koffi.load('dwmapi.dll');

const RECT = koffi.struct('RECT', { left: 'long', top: 'long', right: 'long', bottom: 'long' });
const EnumProc = koffi.proto('bool __stdcall EnumProc(void *hwnd, intptr_t lparam)');

const EnumWindows = user32.func('bool __stdcall EnumWindows(EnumProc *cb, intptr_t lparam)');
const IsWindowVisible = user32.func('bool __stdcall IsWindowVisible(void *hwnd)');
const IsIconic = user32.func('bool __stdcall IsIconic(void *hwnd)');
const GetWindowRect = user32.func('bool __stdcall GetWindowRect(void *hwnd, _Out_ RECT *rect)');
const GetWindowLongW = user32.func('long __stdcall GetWindowLongW(void *hwnd, int index)');
const GetClassNameW = user32.func('int __stdcall GetClassNameW(void *hwnd, void *buf, int max)');
const DwmGetRect = dwmapi.func('long __stdcall DwmGetWindowAttribute(void *hwnd, uint32_t attr, _Out_ RECT *out, uint32_t size)');
const DwmGetInt = dwmapi.func('long __stdcall DwmGetWindowAttribute(void *hwnd, uint32_t attr, _Out_ int *out, uint32_t size)');

const GWL_EXSTYLE = -20;
const WS_EX_TOOLWINDOW = 0x80;
const WS_EX_TRANSPARENT = 0x20;
const DWMWA_EXTENDED_FRAME_BOUNDS = 9;
const DWMWA_CLOAKED = 14;

// Fenêtres du système qui ne sont pas de vraies surfaces (bureau, barre des tâches, menus…).
const IGNORED_CLASSES = new Set([
  'Progman', 'WorkerW', 'Shell_TrayWnd', 'Shell_SecondaryTrayWnd', 'NotifyIconOverflowWindow',
  'Windows.UI.Core.CoreWindow', 'TopLevelWindowForOverflowXamlIsland', 'XamlExplorerHostIslandWindow',
  'ForegroundStaging', 'MultitaskingViewFrame', 'tooltips_class32', '#32768',
]);

const classBuf = Buffer.alloc(512);
let found = [];
let exclude = new Set();

const callback = koffi.register((hwnd) => { try { return visit(hwnd); } catch (e) { console.error('enum', e.message); return true; } }, koffi.pointer(EnumProc));

function visit(hwnd) {
  if (!IsWindowVisible(hwnd) || IsIconic(hwnd)) return true;
  const h = koffi.address(hwnd);
  if (exclude.has(h)) return true;
  const ex = GetWindowLongW(hwnd, GWL_EXSTYLE);
  if (ex & (WS_EX_TOOLWINDOW | WS_EX_TRANSPARENT)) return true;
  const cloaked = [0];
  if (DwmGetInt(hwnd, DWMWA_CLOAKED, cloaked, 4) === 0 && cloaked[0]) return true;
  const n = GetClassNameW(hwnd, classBuf, 256);
  const cls = classBuf.toString('utf16le', 0, n * 2);
  if (IGNORED_CLASSES.has(cls)) return true;
  const r = {};
  if (DwmGetRect(hwnd, DWMWA_EXTENDED_FRAME_BOUNDS, r, 16) !== 0 && !GetWindowRect(hwnd, r)) return true;
  const w = r.right - r.left, hh = r.bottom - r.top;
  if (w < 120 || hh < 60) return true;
  found.push({ h, cls, x: r.left, y: r.top, w, h2: hh });
  return true;
}

// excludeHandles : Set de BigInt (nos propres fenêtres : souris, fromage, trous).
function listWindows(excludeHandles) {
  found = [];
  exclude = excludeHandles;
  EnumWindows(callback, 0);
  return found;
}

module.exports = { listWindows };
