// Page « Modes » : cartes des modes, activation, éditeur. Les réglages de Windows sont appliqués par
// le processus principal (modes.js, win-settings.js) ; ici on s'occupe de l'ambiance sonore et de
// la session Focus du mode activé.
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const api = window.ambiance;
  const { toast, dialog, soundById } = App;
  if (!api || !api.getModes) {
    $('#mode-grid').textContent = 'Les modes sont disponibles dans l\'application installée.';
    return;
  }

  let state = { modes: [], active: 'normal' };
  let editing = null;
  let apps = [];

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  // Résumé lisible de ce que fait un mode.
  function chips(m) {
    const out = [];
    if (m.sound.mix) {
      const ids = Object.keys(m.sound.mix);
      out.push(ids.length ? ids.map(id => soundById(id)?.emoji || '♪').join(' ') : '🔇 silence');
    }
    if (m.focusTimer) out.push('⏱️ Focus');
    out.push({ calme: '🐾 calme', normal: '🐾 normal', joueur: '🐾 joueur' }[m.pet.energy]);
    if (m.screen.grayscale) out.push('⚫ noir et blanc');
    if (m.screen.warmth > 0) out.push('🌅 écran chaud');
    if (m.screen.dim > 0) out.push('🔅 atténué');
    if (m.win.notifications === false) out.push('🔕 notifications');
    if (m.win.hideIcons) out.push('🧹 bureau épuré');
    if (m.win.autoHideTaskbar) out.push('▁ barre masquée');
    if (m.win.theme) out.push(m.win.theme === 'dark' ? '🌙 sombre' : '☀️ clair');
    if (m.win.power) out.push({ saver: '🔋 économie', balanced: '⚖️ équilibré', perf: '⚡ performances' }[m.win.power]);
    if (m.win.keepAwake) out.push('☕ pas de veille');
    if (m.win.wallpaper) out.push('🖼️ fond d\'écran');
    if (m.minimize.length) out.push(`📵 ${m.minimize.length} applis réduites`);
    if (m.music) out.push('🎵 musique');
    if (m.launch.length) out.push(`🚀 ${m.launch.length} à ouvrir`);
    return out;
  }

  function render() {
    const grid = $('#mode-grid');
    const cards = state.modes.map(m => {
      const c = el('div', 'mode-card' + (m.id === state.active ? ' active' : ''));
      c.style.setProperty('--c1', m.colors[0]);
      c.style.setProperty('--c2', m.colors[1]);
      const top = el('div', 'mc-top');
      top.append(el('span', 'mc-emoji', m.emoji));
      if (m.id === state.active) top.append(el('span', 'mc-badge', 'Actif'));
      const chipBox = el('div', 'mc-chips');
      chips(m).forEach(t => chipBox.append(el('span', 'mc-chip', t)));
      const foot = el('div', 'mc-foot');
      const edit = el('button', 'icon-btn ico', '');
      edit.title = 'Modifier';
      edit.addEventListener('click', e => { e.stopPropagation(); openEditor(m); });
      foot.append(edit);
      c.append(top, el('div', 'mc-name', m.name), el('div', 'mc-desc', m.desc || ''), chipBox, foot);
      // Un clic active le mode ; un clic sur le mode actif revient au mode Normal.
      c.addEventListener('click', () => activate(m.id === state.active && m.id !== 'normal' ? 'normal' : m.id));
      return c;
    });
    const add = el('div', 'mode-card new');
    add.append(el('span', 'ico', ''), el('span', null, 'Créer un mode'));
    add.addEventListener('click', () => openEditor(null));
    grid.replaceChildren(...cards, add);
  }

  async function activate(id) {
    state = await api.activateMode(id);
    render();
  }

  // Le processus principal annonce le mode activé (page, icône près de l'horloge ou Ctrl+Alt+M).
  // Précharge les sons des modes : le changement de mode est alors immédiat.
  let preloaded = false;
  function preloadSounds() {
    if (preloaded || typeof Engine === 'undefined') return;
    preloaded = true;
    const ids = new Set(state.modes.flatMap(m => Object.keys((m.sound && m.sound.mix) || {})));
    const run = () => ids.forEach(id => Engine.preload(id));
    if (window.requestIdleCallback) requestIdleCallback(run, { timeout: 5000 }); else setTimeout(run, 2000);
  }

  api.onModeChanged(m => {
    api.getModes().then(s => { state = s; render(); });
    if (m.sound.mix) {
      if (Object.keys(m.sound.mix).length) App.playMix({ name: m.name, sounds: m.sound.mix });
      else App.pause();
    }
    if (m.focusTimer && window.Premium) window.Premium.startFocus();
    toast(`${m.emoji} Mode ${m.name}`);
  });

  // ---------- Éditeur ----------
  function hexToGradient(hex) {
    const n = parseInt(hex.slice(1), 16);
    const dark = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => Math.round(v * 0.35));
    return [hex, '#' + dark.map(v => v.toString(16).padStart(2, '0')).join('')];
  }

  function renderApps() {
    const chosen = new Set(editing.minimize);
    const all = [...new Set([...apps, ...editing.minimize])].sort();
    const box = $('#me-apps');
    if (!all.length) { box.textContent = 'Aucune application ouverte détectée.'; return; }
    box.replaceChildren(...all.map(a => {
      const b = el('span', 'me-app' + (chosen.has(a) ? ' on' : ''), a.replace(/\.exe$/, ''));
      b.title = a;
      b.addEventListener('click', () => {
        editing.minimize = chosen.has(a) ? editing.minimize.filter(x => x !== a) : [...editing.minimize, a];
        renderApps();
      });
      return b;
    }));
  }

  function soundSummary() {
    const mix = editing.sound.mix;
    $('#me-sound-list').textContent = mix && Object.keys(mix).length
      ? 'Sons enregistrés : ' + Object.keys(mix).map(id => `${soundById(id)?.emoji || ''} ${soundById(id)?.name || id}`).join(', ')
      : '';
    $('#me-sound').querySelector('[value=saved]').disabled = !(mix && Object.keys(mix).length);
  }

  async function openEditor(mode) {
    const isNew = !mode;
    editing = JSON.parse(JSON.stringify(mode || {
      id: null, name: 'Mon mode', emoji: '✨', colors: ['#00897b', '#00302b'], desc: '',
      sound: { mix: null }, focusTimer: false, pet: { energy: 'normal' },
      screen: { grayscale: false, warmth: 0, dim: 0 },
      win: { theme: null, notifications: null, hideIcons: null, autoHideTaskbar: null, power: null, wallpaper: null, keepAwake: false },
      minimize: [], launch: [], music: '',
    }));
    $('#me-title').textContent = isNew ? 'Créer un mode' : `Modifier « ${editing.name} »`;
    $('#me-name').value = editing.name;
    $('#me-emoji').value = editing.emoji;
    $('#me-color').value = editing.colors[0];
    $('#me-desc').value = editing.desc || '';
    $('#me-sound').value = editing.sound.mix === null ? 'keep' : Object.keys(editing.sound.mix).length ? 'saved' : 'silence';
    soundSummary();
    $('#me-focus').checked = !!editing.focusTimer;
    $('#me-energy').value = editing.pet.energy;
    $('#me-gray').checked = !!editing.screen.grayscale;
    $('#me-warm').value = Math.round((editing.screen.warmth || 0) * 100);
    $('#me-dim').value = Math.round((editing.screen.dim || 0) * 100);
    $('#me-theme').value = editing.win.theme || '';
    $('#me-power').value = editing.win.power || '';
    $('#me-notif').checked = editing.win.notifications === false;
    $('#me-icons').checked = !!editing.win.hideIcons;
    $('#me-taskbar').checked = !!editing.win.autoHideTaskbar;
    $('#me-awake').checked = !!editing.win.keepAwake;
    $('#me-wall-name').textContent = editing.win.wallpaper ? editing.win.wallpaper.split(/[\\/]/).pop() : 'ne pas changer';
    $('#me-launch').value = editing.launch.join('\n');
    $('#me-music').value = editing.music || '';
    if (window.Music) Music.fillDatalist($('#me-music-list'));
    $('#me-delete').classList.toggle('hidden', isNew || mode.builtin);
    $('#me-reset').classList.toggle('hidden', isNew || !mode.builtin);
    for (const r of document.querySelectorAll('#mode-editor input[type=range]')) r.style.setProperty('--p', (r.value / r.max * 100) + '%');
    $('#mode-editor').classList.remove('hidden');
    apps = await api.runningApps();
    renderApps();
  }

  function closeEditor() {
    $('#mode-editor').classList.add('hidden');
    editing = null;
  }

  function collect() {
    const m = editing;
    m.name = $('#me-name').value.trim() || 'Mon mode';
    m.emoji = $('#me-emoji').value.trim() || '✨';
    m.colors = hexToGradient($('#me-color').value);
    m.desc = $('#me-desc').value.trim();
    const soundChoice = $('#me-sound').value;
    if (soundChoice === 'keep') m.sound.mix = null;
    else if (soundChoice === 'silence') m.sound.mix = {};
    else if (soundChoice === 'current') m.sound.mix = { ...App.state.active };
    m.focusTimer = $('#me-focus').checked;
    m.pet.energy = $('#me-energy').value;
    m.screen = { grayscale: $('#me-gray').checked, warmth: $('#me-warm').value / 100, dim: $('#me-dim').value / 100 };
    m.win.theme = $('#me-theme').value || null;
    m.win.power = $('#me-power').value || null;
    m.win.notifications = $('#me-notif').checked ? false : null;
    m.win.hideIcons = $('#me-icons').checked ? true : null;
    m.win.autoHideTaskbar = $('#me-taskbar').checked ? true : null;
    m.win.keepAwake = $('#me-awake').checked;
    m.music = $('#me-music').value.trim();
    m.launch = $('#me-launch').value.split('\n').map(x => x.trim()).filter(Boolean);
    return m;
  }

  $('#me-sound').addEventListener('change', e => {
    if (e.target.value === 'current' && !Object.keys(App.state.active).length) toast('Aucun son en cours d\'écoute');
  });
  for (const r of document.querySelectorAll('#mode-editor input[type=range]')) {
    r.addEventListener('input', () => r.style.setProperty('--p', (r.value / r.max * 100) + '%'));
  }
  $('#me-wall-pick').addEventListener('click', async () => {
    const file = await api.pickImage();
    if (!file) return;
    editing.win.wallpaper = file;
    $('#me-wall-name').textContent = file.split(/[\\/]/).pop();
  });
  $('#me-wall-clear').addEventListener('click', () => {
    editing.win.wallpaper = null;
    $('#me-wall-name').textContent = 'ne pas changer';
  });
  const addApp = () => {
    const v = $('#me-app-add').value.trim().toLowerCase();
    if (!v) return;
    const name = v.endsWith('.exe') ? v : v + '.exe';
    if (!editing.minimize.includes(name)) editing.minimize.push(name);
    $('#me-app-add').value = '';
    renderApps();
  };
  $('#me-app-add-btn').addEventListener('click', addApp);
  $('#me-app-add').addEventListener('keydown', e => { if (e.key === 'Enter') addApp(); });
  $('#me-cancel').addEventListener('click', closeEditor);
  $('#me-save').addEventListener('click', async () => {
    state = await api.saveMode(collect());
    closeEditor();
    render();
    toast('Mode enregistré');
  });
  $('#me-delete').addEventListener('click', async () => {
    if (!await dialog({ title: 'Supprimer ce mode ?', text: `« ${editing.name} » sera supprimé.`, ok: 'Supprimer' })) return;
    state = await api.deleteMode(editing.id);
    closeEditor();
    render();
  });
  $('#me-reset').addEventListener('click', async () => {
    if (!await dialog({ title: 'Réinitialiser ce mode ?', text: 'Il retrouvera ses réglages d\'origine.', ok: 'Réinitialiser' })) return;
    state = await api.deleteMode(editing.id); // supprimer la version modifiée rend le mode d'origine
    closeEditor();
    render();
  });
  $('#btn-new-mode').addEventListener('click', () => openEditor(null));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && editing) closeEditor(); });

  api.getModes().then(s => { state = s; render(); preloadSounds(); });
})();
