(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  // Pont vers Electron ; des substituts permettent d'ouvrir la page dans un navigateur pour tester.
  const api = window.ambiance || {
    info: async () => ({ mica: false, accent: null, version: 'web', openAtLogin: false }),
    setCompact: async () => {},
    setFullscreen: async (on) => { on ? document.documentElement.requestFullscreen?.() : document.exitFullscreen?.().catch(() => {}); },
    setOpenAtLogin: async () => false,
    setConfig: async (c) => c,
    pickBurrow: async () => ({}),
    setPlaying: () => {},
    onTogglePlay: () => {},
    onPause: () => {},
    onConfig: () => {},
    importSounds: async () => [],
    readSound: async () => { throw new Error('indisponible'); },
    readBuiltin: async (name) => (await fetch('sounds/' + name)).arrayBuffer(),
    deleteSound: async () => {},
  };

  Engine.setFileLoader(name => api.readBuiltin(name));

  const store = {
    load(k, d) {
      try { const v = localStorage.getItem('ambiance.' + k); return v ? JSON.parse(v) : d; } catch { return d; }
    },
    save(k, v) {
      try { localStorage.setItem('ambiance.' + k, JSON.stringify(v)); } catch { /* stockage indisponible */ }
    },
  };

  const state = {
    active: store.load('active', {}),
    master: store.load('master', 0.8),
    installed: store.load('installed', []),
    custom: store.load('custom', []),
    mixes: store.load('mixes', []),
    settings: Object.assign({ autoSaver: true, saverDelay: 5, autoplay: false }, store.load('settings', {})),
    playing: false,
  };

  const SUGGESTIONS = [
    { name: 'Chalet sous la pluie', sounds: { rain: 0.6, fireplace: 0.7 } },
    { name: 'Bord de mer', sounds: { beach: 0.8, wind: 0.3 } },
    { name: 'Balade en forêt', sounds: { birds: 0.6, creek: 0.5, wind: 0.2 } },
    { name: 'Café studieux', sounds: { cafe: 0.7, rain: 0.35 } },
    { name: 'Sommeil profond', sounds: { brown: 0.6, fan: 0.4 } },
  ];

  function save() {
    for (const k of ['active', 'master', 'installed', 'custom', 'mixes', 'settings']) store.save(k, state[k]);
  }

  state.custom.forEach(c => Engine.registerCustom(c.id, () => api.readSound(c.file)));

  function customMeta(c) {
    return { id: c.id, name: c.name, emoji: '🎵', colors: ['#6b7bd6', '#2c2f6b'], custom: true, file: c.file };
  }
  function library() {
    return [
      ...SOUNDS.filter(s => s.builtin || state.installed.includes(s.id)),
      ...state.custom.map(customMeta),
    ];
  }
  function soundById(id) { return library().find(s => s.id === id); }

  for (const id of Object.keys(state.active)) if (!soundById(id)) delete state.active[id];

  // ---------- Utilitaires d'interface ----------
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast.h);
    toast.h = setTimeout(() => t.classList.remove('show'), 2500);
  }

  function dialog({ title, text = '', input = null, ok = 'OK' }) {
    return new Promise(resolve => {
      const m = $('#modal'), inp = $('#modal-input');
      $('#modal-title').textContent = title;
      $('#modal-text').textContent = text;
      $('#modal-text').hidden = !text;
      $('#modal-ok').textContent = ok;
      inp.hidden = input === null;
      inp.value = input ?? '';
      m.classList.remove('hidden');
      (input === null ? $('#modal-ok') : inp).focus();
      inp.select();
      const done = val => {
        m.classList.add('hidden');
        $('#modal-ok').onclick = $('#modal-cancel').onclick = inp.onkeydown = null;
        resolve(val);
      };
      $('#modal-ok').onclick = () => done(input === null ? true : inp.value.trim() || null);
      $('#modal-cancel').onclick = () => done(input === null ? false : null);
      inp.onkeydown = e => {
        if (e.key === 'Enter') $('#modal-ok').click();
        if (e.key === 'Escape') $('#modal-cancel').click();
      };
    });
  }

  function paintRange(r) { r.style.setProperty('--p', r.value + '%'); }

  function volSlider(id) {
    const r = document.createElement('input');
    r.type = 'range';
    r.min = 0; r.max = 100;
    r.dataset.vol = id;
    r.value = Math.round((state.active[id] ?? 0.6) * 100);
    paintRange(r);
    r.addEventListener('input', () => setVolume(id, r.value / 100, r));
    r.addEventListener('click', e => e.stopPropagation());
    return r;
  }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function iconBtn(glyph, title, onClick) {
    const b = el('button', 'icon-btn ico', glyph);
    b.title = title;
    b.addEventListener('click', e => { e.stopPropagation(); onClick(); });
    return b;
  }

  // ---------- Lecture ----------
  function play() {
    if (!Object.keys(state.active).length) {
      toast('Choisissez au moins un son');
      return;
    }
    state.playing = true;
    Engine.setMaster(state.master);
    for (const [id, vol] of Object.entries(state.active)) Engine.start(id, vol);
    renderPlayState();
  }

  function pause() {
    state.playing = false;
    Engine.stopAll();
    renderPlayState();
  }

  function togglePlay() { state.playing ? pause() : play(); }

  function toggleSound(id) {
    if (id in state.active) {
      delete state.active[id];
      Engine.stop(id);
      if (!Object.keys(state.active).length && state.playing) pause();
    } else {
      state.active[id] = 0.6;
      if (state.playing) Engine.start(id, 0.6);
      else play();
    }
    save();
    renderActive();
  }

  function setVolume(id, vol, source) {
    state.active[id] = vol;
    Engine.setVolume(id, vol);
    $$(`input[data-vol="${CSS.escape(id)}"]`).forEach(r => {
      if (r !== source) r.value = Math.round(vol * 100);
      paintRange(r);
    });
    save();
  }

  function renderPlayState() {
    api.setPlaying(state.playing);
    const glyph = state.playing ? '' : '';
    $('#btn-play').textContent = glyph;
    $('#c-play').textContent = glyph;
    $('#btn-play').title = state.playing ? 'Pause (Espace)' : 'Lecture (Espace)';
  }

  // ---------- Pages ----------
  function soundTile(s) {
    const t = el('div', 'tile');
    t.dataset.id = s.id;
    t.style.setProperty('--c1', s.colors[0]);
    t.style.setProperty('--c2', s.colors[1]);
    const art = el('div', 'art', s.emoji);
    art.addEventListener('click', () => toggleSound(s.id));
    const meta = el('div', 'meta');
    meta.append(el('span', null, s.name));
    if (s.custom) meta.append(iconBtn('', 'Supprimer', () => removeCustom(s.id)));
    const slider = volSlider(s.id);
    slider.className = 'slider';
    t.append(art, meta, slider);
    return t;
  }

  function renderSounds() {
    $('#sound-grid').replaceChildren(...library().map(soundTile));
    renderActive();
  }

  function renderActive() {
    $$('#sound-grid .tile').forEach(t => {
      const id = t.dataset.id, on = id in state.active;
      t.classList.toggle('active', on);
      if (on) { const r = $('.slider', t); r.value = Math.round(state.active[id] * 100); paintRange(r); }
    });
    $$('#catalog-grid .tile').forEach(t => t.classList.toggle('active', t.dataset.id in state.active));

    const chips = Object.keys(state.active).map(id => {
      const s = soundById(id);
      const c = el('div', 'chip');
      c.title = s.name;
      c.append(el('span', 'e', s.emoji), el('span', 'n', s.name), volSlider(id), iconBtn('', 'Retirer', () => toggleSound(id)));
      return c;
    });
    $('#active-list').replaceChildren(...chips);

    const rows = Object.keys(state.active).map(id => {
      const s = soundById(id);
      const r = el('div', 'c-item');
      r.append(el('span', null, s.emoji), el('span', 'n', s.name), volSlider(id));
      return r;
    });
    $('#c-list').replaceChildren(...rows);
  }

  function renderCatalog() {
    const cards = SOUNDS.filter(s => s.catalog).map(s => {
      const t = el('div', 'tile');
      t.style.setProperty('--c1', s.colors[0]);
      t.style.setProperty('--c2', s.colors[1]);
      const art = el('div', 'art', s.emoji);
      const meta = el('div', 'meta');
      meta.append(el('span', null, s.name));
      const desc = el('p', 'desc', s.desc);
      const actions = el('div', 'actions');
      const installed = state.installed.includes(s.id);
      const btn = el('button', 'btn' + (installed ? '' : ' accent'));
      btn.innerHTML = installed
        ? '<span class="ico">&#xE74D;</span> Retirer'
        : '<span class="ico">&#xE896;</span> Télécharger';
      btn.addEventListener('click', () => installed ? uninstall(s.id) : install(s, actions));
      actions.append(btn);
      // Un clic sur l'image écoute le son (en le téléchargeant d'abord si besoin), sans jamais le retirer.
      t.dataset.id = s.id;
      art.title = installed ? 'Écouter' : 'Télécharger et écouter';
      art.addEventListener('click', () => {
        if (state.installed.includes(s.id)) toggleSound(s.id);
        else install(s, actions, true);
      });
      t.append(art, meta, desc, actions);
      return t;
    });
    $('#catalog-grid').replaceChildren(...cards);
    renderActive();
  }

  function install(s, actions, thenPlay = false) {
    const bar = el('div', 'progress');
    const fill = el('div');
    bar.append(fill);
    actions.replaceChildren(bar);
    let p = 0;
    const h = setInterval(() => {
      p = Math.min(100, p + 8 + Math.random() * 14);
      fill.style.width = p + '%';
      if (p >= 100) {
        clearInterval(h);
        state.installed.push(s.id);
        save();
        renderCatalog();
        renderSounds();
        toast(`« ${s.name} » ajouté à vos sons`);
        if (thenPlay && !(s.id in state.active)) toggleSound(s.id);
      }
    }, 90);
  }

  function uninstall(id) {
    if (id in state.active) toggleSound(id);
    state.installed = state.installed.filter(x => x !== id);
    save();
    renderCatalog();
    renderSounds();
  }

  function mixCard(m, { removable }) {
    const card = el('div', 'mix');
    const playBtn = el('button', 'round ico', '');
    playBtn.title = 'Lire ce mixage';
    playBtn.addEventListener('click', () => playMix(m));
    const info = el('div', 'info');
    const emojis = Object.keys(m.sounds).map(id => soundById(id)?.emoji || '').join(' ');
    info.append(el('div', 'name', m.name), el('div', 'emojis', emojis));
    card.append(playBtn, info);
    if (removable) {
      card.append(iconBtn('', 'Renommer', () => renameMix(m)));
      card.append(iconBtn('', 'Supprimer', () => deleteMix(m)));
    }
    return card;
  }

  function renderMixes() {
    $('#mix-list').replaceChildren(...state.mixes.map(m => mixCard(m, { removable: true })));
    $('#mix-suggestions').replaceChildren(...SUGGESTIONS.map(m => mixCard(m, { removable: false })));
  }

  function playMix(m) {
    const sounds = Object.fromEntries(Object.entries(m.sounds).filter(([id]) => soundById(id)));
    if (!Object.keys(sounds).length) { toast("Les sons de ce mixage ne sont plus disponibles"); return; }
    pause();
    state.active = sounds;
    save();
    renderActive();
    play();
    toast(`Lecture : ${m.name}`);
  }

  async function saveMix() {
    if (!Object.keys(state.active).length) { toast('Ajoutez des sons avant d\'enregistrer'); return; }
    const name = await dialog({ title: 'Enregistrer le mixage', input: `Mixage ${state.mixes.length + 1}`, ok: 'Enregistrer' });
    if (!name) return;
    state.mixes.push({ id: Date.now(), name, sounds: { ...state.active } });
    save();
    renderMixes();
    toast('Mixage enregistré');
  }

  async function renameMix(m) {
    const name = await dialog({ title: 'Renommer le mixage', input: m.name, ok: 'Renommer' });
    if (!name) return;
    m.name = name;
    save();
    renderMixes();
  }

  async function deleteMix(m) {
    if (!await dialog({ title: 'Supprimer le mixage ?', text: `« ${m.name} » sera supprimé.`, ok: 'Supprimer' })) return;
    state.mixes = state.mixes.filter(x => x !== m);
    save();
    renderMixes();
  }

  async function importSounds() {
    let added;
    try { added = await api.importSounds(); } catch (e) { toast('Import impossible'); return; }
    if (!added.length) return;
    for (const c of added) {
      state.custom.push(c);
      Engine.registerCustom(c.id, () => api.readSound(c.file));
    }
    save();
    renderSounds();
    toast(added.length > 1 ? `${added.length} sons importés` : `« ${added[0].name} » importé`);
  }

  async function removeCustom(id) {
    const c = state.custom.find(x => x.id === id);
    if (!await dialog({ title: 'Supprimer ce son ?', text: `« ${c.name} » sera retiré de votre bibliothèque.`, ok: 'Supprimer' })) return;
    if (id in state.active) toggleSound(id);
    state.custom = state.custom.filter(x => x.id !== id);
    Engine.forgetCustom(id);
    api.deleteSound(c.file).catch(() => {});
    save();
    renderSounds();
  }

  // ---------- Minuteur ----------
  const timer = { end: 0, handle: null };
  const FADE_MS = 15000;

  function fmt(ms) {
    const s = Math.ceil(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
    const pad = n => String(n).padStart(2, '0');
    return h ? `${h}:${pad(m)}:${pad(ss)}` : `${pad(m)}:${pad(ss)}`;
  }

  function setTimer(min) {
    clearTimer();
    timer.end = Date.now() + min * 60000;
    timer.handle = setInterval(tickTimer, 500);
    if (!state.playing) play();
    tickTimer();
    toast(`La lecture s'arrêtera dans ${min} min`);
  }

  function clearTimer() {
    clearInterval(timer.handle);
    timer.handle = null;
    Engine.setMaster(state.master);
    $('#timer-label').textContent = '';
    $('#c-timer').textContent = '';
    $('#btn-timer').classList.remove('on');
    $('#timer-cancel').classList.add('hidden');
  }

  function tickTimer() {
    const left = timer.end - Date.now();
    if (left <= 0) {
      pause();
      clearTimer();
      toast('Minuteur terminé');
      return;
    }
    if (left < FADE_MS && state.playing) Engine.setMaster(state.master * left / FADE_MS);
    $('#timer-label').textContent = fmt(left);
    $('#c-timer').textContent = '⏱ ' + fmt(left);
    $('#btn-timer').classList.add('on');
    $('#timer-cancel').classList.remove('hidden');
  }

  // ---------- Écran de veille ----------
  // Scène choisie selon les sons actifs, par ordre de priorité.
  const SCENE_PRIORITY = ['storm', 'rain', 'fire', 'snow', 'underwater', 'waves', 'night'];

  function startSaver(forcedScene) {
    if (Saver.running) return;
    const scenes = Object.keys(state.active).map(id => soundById(id)?.scene);
    const scene = forcedScene || SCENE_PRIORITY.find(s => scenes.includes(s)) || 'aurora';
    const labels = Object.keys(state.active).map(id => soundById(id).name);
    api.setFullscreen(true);
    Saver.start(scene, labels, () => api.setFullscreen(false));
  }

  let lastInput = Date.now();
  for (const ev of ['mousemove', 'mousedown', 'keydown', 'wheel']) {
    addEventListener(ev, () => { lastInput = Date.now(); }, { passive: true });
  }
  setInterval(() => {
    const s = state.settings;
    if (s.autoSaver && state.playing && !Saver.running && document.hasFocus()
      && !document.body.classList.contains('compact')
      && Date.now() - lastInput > s.saverDelay * 60000) startSaver();
  }, 5000);

  // ---------- Mode compact ----------
  function setCompact(on) {
    document.body.classList.toggle('compact', on);
    $('#timer-menu').classList.add('hidden');
    api.setCompact(on);
  }

  // ---------- Paramètres ----------
  async function initSettings(info) {
    const s = state.settings;
    $('#set-saver').checked = s.autoSaver;
    $('#set-saver-delay').value = String(s.saverDelay);
    $('#set-autoplay').checked = s.autoplay;
    $('#set-login').checked = info.openAtLogin;
    $('#version').textContent = info.version;

    const cfg = info.config || { pet: false, petSound: true, closeToTray: false };
    const SWITCHES = {
      '#set-pet': 'pet', '#set-pet-sound': 'petSound', '#set-tray': 'closeToTray',
      '#set-pet-screen': 'petScreen', '#set-pet-cheese': 'petCheese', '#set-pet-holes': 'petHoles',
      '#set-pet-reminders': 'petReminders',
    };
    const CLOCK = { '#set-clock': 'show', '#set-clock-seconds': 'seconds', '#set-clock-date': 'date' };
    const showCfg = c => {
      for (const [sel, key] of Object.entries(SWITCHES)) $(sel).checked = c[key] !== false;
      $('#set-pet-animal').value = c.petAnimal || 'souris';
      const clock = c.clock || {};
      for (const [sel, key] of Object.entries(CLOCK)) $(sel).checked = key === 'date' ? clock.date !== false : !!clock[key];
      $('#btn-burrow').textContent = c.burrow ? 'Déplacer le terrier' : 'Placer le terrier';
      $('#btn-burrow-clear').classList.toggle('hidden', !c.burrow);
      $('#burrow-status').textContent = c.burrow
        ? 'Le terrier est placé. Votre compagnon y rentre pour dormir ou quand vous êtes concentré.'
        : 'Choisissez où votre compagnon a sa maison. Il y rentre pour dormir ou quand vous êtes concentré.';
    };
    for (const [sel, key] of Object.entries(CLOCK)) {
      $(sel).addEventListener('change', async e => showCfg(await api.setConfig({ clock: { [key]: e.target.checked } })));
    }
    $('#set-pet-animal').addEventListener('change', async e => showCfg(await api.setConfig({ petAnimal: e.target.value })));
    $('#btn-burrow').addEventListener('click', async () => {
      toast('Cliquez à l\'endroit où placer le terrier');
      showCfg(await api.pickBurrow());
    });
    $('#btn-burrow-clear').addEventListener('click', async () => showCfg(await api.setConfig({ burrow: null })));
    showCfg(cfg);
    api.onConfig(showCfg);
    for (const [sel, key] of Object.entries(SWITCHES)) {
      $(sel).addEventListener('change', async e => showCfg(await api.setConfig({ [key]: e.target.checked })));
    }

    $('#credits').replaceChildren(...SOUNDS.filter(s => s.credit).map(s => el('li', null, `${s.name} : ${s.credit}`)));

    $('#set-saver').addEventListener('change', e => { s.autoSaver = e.target.checked; save(); });
    $('#set-saver-delay').addEventListener('change', e => { s.saverDelay = +e.target.value; save(); });
    $('#set-autoplay').addEventListener('change', e => { s.autoplay = e.target.checked; save(); });
    $('#set-login').addEventListener('change', async e => { e.target.checked = await api.setOpenAtLogin(e.target.checked); });
    $('#btn-reset').addEventListener('click', async () => {
      if (!await dialog({ title: 'Tout réinitialiser ?', text: 'Vos mixages, sons importés et préférences seront supprimés.', ok: 'Réinitialiser' })) return;
      pause();
      for (const c of state.custom) await api.deleteSound(c.file).catch(() => {});
      try { Object.keys(localStorage).filter(k => k.startsWith('ambiance.')).forEach(k => localStorage.removeItem(k)); } catch { /* ignoré */ }
      location.reload();
    });
  }

  // ---------- Événements ----------
  $$('.nav-item').forEach(b => b.addEventListener('click', () => {
    $$('.nav-item').forEach(x => x.classList.toggle('active', x === b));
    $$('.page').forEach(p => p.classList.toggle('active', p.id === 'page-' + b.dataset.page));
  }));

  $('#btn-play').addEventListener('click', togglePlay);
  // La molette fait défiler horizontalement la liste des sons actifs.
  $('#active-list').addEventListener('wheel', e => {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { e.currentTarget.scrollLeft += e.deltaY; e.preventDefault(); }
  }, { passive: false });
  $('#c-play').addEventListener('click', togglePlay);
  $('#btn-import').addEventListener('click', importSounds);
  $('#btn-save').addEventListener('click', saveMix);
  $('#btn-saver').addEventListener('click', () => {
    if (!state.playing) play();
    if (state.playing) startSaver();
  });
  $('#btn-compact').addEventListener('click', () => setCompact(true));
  $('#c-expand').addEventListener('click', () => setCompact(false));

  const master = $('#master');
  master.value = Math.round(state.master * 100);
  paintRange(master);
  master.addEventListener('input', () => {
    state.master = master.value / 100;
    paintRange(master);
    if (!timer.handle || timer.end - Date.now() > FADE_MS) Engine.setMaster(state.master);
    save();
  });

  $('#btn-timer').addEventListener('click', e => {
    e.stopPropagation();
    $('#timer-menu').classList.toggle('hidden');
  });
  $$('#timer-menu [data-min]').forEach(b => b.addEventListener('click', () => {
    setTimer(+b.dataset.min);
    $('#timer-menu').classList.add('hidden');
  }));
  $('#timer-cancel').addEventListener('click', () => {
    clearTimer();
    $('#timer-menu').classList.add('hidden');
    toast('Minuteur annulé');
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('#timer-menu')) $('#timer-menu').classList.add('hidden');
  });

  document.addEventListener('keydown', e => {
    if (Saver.running) return;
    if (e.key === 'Escape') $('#timer-menu').classList.add('hidden');
    const typing = e.target.matches('input[type=text], select') || !$('#modal').classList.contains('hidden');
    if (e.code === 'Space' && !typing) {
      e.preventDefault();
      togglePlay();
    }
  });

  // ---------- Démarrage ----------
  api.info().then(info => {
    if (!info.mica) document.body.classList.add('no-mica');
    if (info.accent && !matchMedia('(prefers-color-scheme: dark)').matches) {
      document.documentElement.style.setProperty('--accent', info.accent);
    }
    initSettings(info);
  });

  api.onTogglePlay(togglePlay);
  // La bulle du compagnon peut demander d'ouvrir une page (« Ouvrir la liste »).
  if (api.onNavigate) api.onNavigate(page => { const b = document.querySelector(`.nav-item[data-page="${page}"]`); if (b) b.click(); });
  api.onPause(() => { if (state.playing) pause(); });

  renderSounds();
  renderCatalog();
  renderMixes();
  renderPlayState();
  Object.keys(state.active).forEach(id => Engine.preload(id));
  if (state.settings.autoplay && Object.keys(state.active).length) play();

  // Interface utilisée par premium.js (Focus, Chaînes, Respiration).
  window.App = {
    state,
    store,
    toast,
    dialog,
    soundById,
    play,
    pause,
    playMix,
    toggleSound,
    startSaver,
    isPlaying: () => state.playing,
    hasSounds: () => Object.keys(state.active).length > 0,
    install(id) {
      if (!state.installed.includes(id) && SOUNDS.find(s => s.id === id && s.catalog)) {
        state.installed.push(id);
        save();
        renderSounds();
        renderCatalog();
      }
    },
  };
})();
