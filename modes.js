// Modes de l'application : chacun regroupe une ambiance sonore, le comportement du compagnon et des
// réglages de Windows. Les modes intégrés peuvent être modifiés (et remis à zéro) ; l'utilisateur
// peut aussi créer les siens.
//   sound.mix      : sons à jouer { id: volume } ; null = ne pas toucher à la lecture en cours
//   focusTimer     : lance une session Focus (Pomodoro)
//   pet.energy     : 'calme' | 'normal' | 'joueur'
//   screen         : filtres de couleur { grayscale, warmth 0..1, dim 0..1 }
//   win            : réglages Windows (null = laisser tel quel)
//   minimize       : applications à réduire en entrant dans le mode
//   launch         : sites ou applications à ouvrir en entrant dans le mode
//   music          : musique à lancer (lien ou URI Spotify, « liked » pour les titres likés, lien Deezer, YouTube Music…)
const BLANK_WIN = { theme: null, notifications: null, hideIcons: null, autoHideTaskbar: null, power: null, wallpaper: null, keepAwake: false };

const DEFAULT_MODES = [
  {
    id: 'normal', builtin: true, name: 'Normal', emoji: '🏠', colors: ['#5b8def', '#25407a'],
    desc: 'Votre configuration habituelle, sans rien changer à Windows.',
    sound: { mix: null }, focusTimer: false,
    pet: { energy: 'normal' },
    screen: { grayscale: false, warmth: 0, dim: 0 },
    win: { ...BLANK_WIN },
    minimize: [], launch: [],
  },
  {
    id: 'focus', builtin: true, name: 'Focus', emoji: '🎯', colors: ['#7e57c2', '#2a1a52'],
    desc: 'Concentration : notifications coupées, bureau épuré, applis distrayantes réduites.',
    sound: { mix: { rain: 0.35, brown: 0.45 } }, focusTimer: true,
    pet: { energy: 'calme' },
    screen: { grayscale: false, warmth: 0, dim: 0 },
    win: { ...BLANK_WIN, notifications: false, hideIcons: true, keepAwake: true },
    minimize: ['discord.exe', 'telegram.exe', 'whatsapp.exe', 'steam.exe', 'beeper.exe'], launch: [],
  },
  {
    id: 'detente', builtin: true, name: 'Détente', emoji: '🌿', colors: ['#43a047', '#16401c'],
    desc: 'Pause douce : sons de nature, écran plus chaud et thème sombre.',
    sound: { mix: { creek: 0.5, birds: 0.35, wind: 0.2 } }, focusTimer: false,
    pet: { energy: 'normal' },
    screen: { grayscale: false, warmth: 0.5, dim: 0.1 },
    win: { ...BLANK_WIN, theme: 'dark' },
    minimize: [], launch: [],
  },
  {
    id: 'fun', builtin: true, name: 'Fun', emoji: '🕹️', colors: ['#ff7043', '#6a1b4d'],
    desc: 'Le compagnon est en forme, le PC passe en mode performance.',
    sound: { mix: null }, focusTimer: false,
    pet: { energy: 'joueur' },
    screen: { grayscale: false, warmth: 0, dim: 0 },
    win: { ...BLANK_WIN, theme: 'dark', power: 'perf' },
    minimize: [], launch: [],
  },
];

// Complète un mode enregistré avec les champs manquants (anciennes versions, modes créés).
function normalize(m) {
  const base = DEFAULT_MODES.find(d => d.id === m.id) || DEFAULT_MODES[0];
  return {
    ...base,
    ...m,
    builtin: DEFAULT_MODES.some(d => d.id === m.id),
    sound: { ...base.sound, ...(m.sound || {}) },
    pet: { ...base.pet, ...(m.pet || {}) },
    screen: { ...base.screen, ...(m.screen || {}) },
    win: { ...BLANK_WIN, ...(m.win || {}) },
    minimize: m.minimize || base.minimize || [],
    launch: m.launch || base.launch || [],
    music: typeof m.music === 'string' ? m.music : (base.music || ''),
  };
}

// Liste complète : modes intégrés (éventuellement modifiés) puis modes de l'utilisateur.
function list(saved = []) {
  const byId = new Map(saved.map(m => [m.id, m]));
  const builtins = DEFAULT_MODES.map(d => normalize(byId.get(d.id) || d));
  const custom = saved.filter(m => !DEFAULT_MODES.some(d => d.id === m.id)).map(normalize);
  return [...builtins, ...custom];
}

function defaultOf(id) {
  const d = DEFAULT_MODES.find(m => m.id === id);
  return d ? normalize(d) : null;
}

module.exports = { list, normalize, defaultOf, DEFAULT_MODES };
