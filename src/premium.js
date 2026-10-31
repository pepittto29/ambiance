// Fonctions « premium » : mode Focus, chaînes immersives et respiration guidée.
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const { store, toast } = App;

  const pad = n => String(n).padStart(2, '0');
  const fmt = ms => {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
  };
  const dayKey = (d = new Date()) => d.toLocaleDateString('sv-SE');

  function notify(body) {
    try { new Notification('Ambiance', { body, silent: true }); } catch { /* notifications indisponibles */ }
  }

  // ======================= Focus =======================
  const cfg = Object.assign({ work: 25, brk: 5, rounds: 4, sound: true }, store.load('focus', {}));
  let tasks = store.load('tasks', []);
  const history = store.load('focusHistory', {});
  let sessions = store.load('focusSessions', 0);
  const RING = 2 * Math.PI * 52;
  const f = { phase: 'idle', round: 1, end: 0, remaining: cfg.work * 60000, total: cfg.work * 60000, running: false, h: null };

  function saveFocus() {
    store.save('focus', cfg);
    store.save('tasks', tasks);
    store.save('focusHistory', history);
    store.save('focusSessions', sessions);
  }

  function setPhase(phase) {
    f.phase = phase;
    f.total = f.remaining = (phase === 'break' ? cfg.brk : cfg.work) * 60000;
    f.end = Date.now() + f.remaining;
  }

  function focusStart() {
    if (f.running) {
      f.running = false;
      f.remaining = f.end - Date.now();
      clearInterval(f.h);
    } else {
      if (f.phase === 'idle') { f.round = 1; setPhase('work'); }
      f.end = Date.now() + f.remaining;
      f.running = true;
      f.h = setInterval(focusTick, 250);
      if (cfg.sound && f.phase === 'work' && App.hasSounds() && !App.isPlaying()) App.play();
    }
    renderFocus();
  }

  function focusTick() {
    f.remaining = f.end - Date.now();
    if (f.remaining <= 0) completePhase(true);
    renderFocus();
  }

  function completePhase(finished) {
    Engine.oneShot(f.phase === 'work' ? 'bell.ogg' : 'chime.ogg').catch(() => {});
    if (f.phase === 'work') {
      if (finished) {
        history[dayKey()] = (history[dayKey()] || 0) + cfg.work;
        sessions++;
        saveFocus();
        renderStats();
      }
      if (f.round >= cfg.rounds) {
        focusReset();
        toast('Bravo, toutes les sessions sont terminées !');
        notify('Toutes les sessions sont terminées. Bravo !');
        if (cfg.sound && App.isPlaying()) App.pause();
        return;
      }
      setPhase('break');
      notify(`Pause de ${cfg.brk} min. Levez-vous et étirez-vous !`);
      if (cfg.sound && App.isPlaying()) App.pause();
    } else {
      f.round++;
      setPhase('work');
      notify(`Session ${f.round} / ${cfg.rounds} : on s'y remet !`);
      if (cfg.sound && App.hasSounds() && !App.isPlaying()) App.play();
    }
  }

  function focusReset() {
    clearInterval(f.h);
    f.running = false;
    f.phase = 'idle';
    f.round = 1;
    f.total = f.remaining = cfg.work * 60000;
    renderFocus();
  }

  function renderFocus() {
    $('#f-time').textContent = fmt(f.remaining);
    $('#f-phase').textContent = { idle: 'Prêt', work: 'Concentration', break: 'Pause' }[f.phase];
    $('#f-round').textContent = f.phase === 'idle' ? `${cfg.rounds} sessions` : `Session ${f.round} / ${cfg.rounds}`;
    $('#f-ring').style.strokeDashoffset = RING * (1 - f.remaining / f.total);
    $('.ring').classList.toggle('break', f.phase === 'break');
    $('#f-start').innerHTML = f.running
      ? '<span class="ico">&#xE769;</span> Pause'
      : `<span class="ico">&#xE768;</span> ${f.phase === 'idle' ? 'Démarrer' : 'Reprendre'}`;
  }

  function renderTasks() {
    const list = $('#task-list');
    list.replaceChildren(...tasks.map(t => {
      const li = document.createElement('li');
      li.classList.toggle('done', t.done);
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = t.done;
      cb.addEventListener('change', () => { t.done = cb.checked; saveFocus(); renderTasks(); });
      const span = document.createElement('span');
      span.textContent = t.text;
      const del = document.createElement('button');
      del.className = 'icon-btn ico';
      del.title = 'Supprimer';
      del.textContent = '';
      del.addEventListener('click', () => { tasks = tasks.filter(x => x !== t); saveFocus(); renderTasks(); });
      li.append(cb, span, del);
      return li;
    }));
  }

  function renderStats() {
    $('#st-today').textContent = history[dayKey()] || 0;
    $('#st-sessions').textContent = sessions;
    let streak = 0;
    const d = new Date();
    if (!history[dayKey(d)]) d.setDate(d.getDate() - 1);
    while (history[dayKey(d)]) { streak++; d.setDate(d.getDate() - 1); }
    $('#st-streak').textContent = streak;

    const days = [];
    for (let i = 6; i >= 0; i--) {
      const x = new Date();
      x.setDate(x.getDate() - i);
      days.push(x);
    }
    const max = Math.max(30, ...days.map(x => history[dayKey(x)] || 0));
    $('#st-week').replaceChildren(...days.map((x, i) => {
      const min = history[dayKey(x)] || 0;
      const bar = document.createElement('div');
      bar.className = 'bar' + (i === 6 ? ' today' : '');
      bar.title = `${min} min`;
      const fill = document.createElement('i');
      fill.style.height = `${(min / max) * 80}%`;
      bar.append(fill, x.toLocaleDateString('fr-FR', { weekday: 'narrow' }).toUpperCase());
      return bar;
    }));
  }

  for (const [id, key] of [['#f-work', 'work'], ['#f-break', 'brk'], ['#f-rounds', 'rounds']]) {
    const inp = $(id);
    inp.value = cfg[key];
    inp.addEventListener('change', () => {
      cfg[key] = Math.max(+inp.min, Math.min(+inp.max, Math.round(+inp.value) || cfg[key]));
      inp.value = cfg[key];
      saveFocus();
      if (f.phase === 'idle') focusReset();
    });
  }
  $('#f-sound').checked = cfg.sound;
  $('#f-sound').addEventListener('change', e => { cfg.sound = e.target.checked; saveFocus(); });
  $('#f-start').addEventListener('click', focusStart);
  $('#f-reset').addEventListener('click', focusReset);
  $('#f-skip').addEventListener('click', () => {
    if (f.phase === 'idle') return;
    completePhase(false);
    renderFocus();
  });
  $('#task-form').addEventListener('submit', e => {
    e.preventDefault();
    const text = $('#task-input').value.trim();
    if (!text) return;
    tasks.push({ id: Date.now(), text, done: false });
    $('#task-input').value = '';
    saveFocus();
    renderTasks();
  });

  renderFocus();
  renderTasks();
  renderStats();

  // Utilisé par les modes : démarre une session Focus si aucune n'est en cours.
  window.Premium = { startFocus() { if (!f.running) focusStart(); } };

  // ======================= Chaînes =======================
  const CHANNELS = [
    { name: "Nuit d'orage", emoji: '⛈️', colors: ['#3c3f78', '#0d0f24'], scene: 'storm', sounds: { thunder: 0.8, rain: 0.55 } },
    { name: 'Feu de camp', emoji: '🏕️', colors: ['#e0752d', '#2a0d06'], scene: 'fire', sounds: { campfire: 0.8, crickets: 0.35 } },
    { name: "Chalet d'hiver", emoji: '🏔️', colors: ['#a9c6e8', '#33465e'], scene: 'snow', sounds: { blizzard: 0.5, fireplace: 0.6 } },
    { name: 'Océan au clair de lune', emoji: '🌙', colors: ['#2c5364', '#0f2027'], scene: 'waves', sounds: { ocean: 0.8, wind: 0.2 } },
    { name: 'Forêt tropicale', emoji: '🌴', colors: ['#3f9b5a', '#0f3320'], scene: 'rain', sounds: { rainforest: 0.8, birds: 0.25 } },
    { name: 'Abysses', emoji: '🐋', colors: ['#1565c0', '#021027'], scene: 'underwater', sounds: { underwater: 0.85 } },
    { name: 'Nuit à la campagne', emoji: '🌌', colors: ['#311b92', '#05020f'], scene: 'night', sounds: { crickets: 0.6, 'night-forest': 0.5 } },
    { name: 'Aurore boréale', emoji: '✨', colors: ['#00bfa5', '#1a1446'], scene: 'aurora', sounds: { wind: 0.35, 'wind-chimes': 0.3 } },
  ].map(c => ({ ...c, sounds: Object.fromEntries(Object.entries(c.sounds).filter(([id]) => SOUNDS.some(s => s.id === id))) }))
    .filter(c => Object.keys(c.sounds).length);

  $('#channel-grid').replaceChildren(...CHANNELS.map(c => {
    const t = document.createElement('div');
    t.className = 'tile channel';
    t.style.setProperty('--c1', c.colors[0]);
    t.style.setProperty('--c2', c.colors[1]);
    const art = document.createElement('div');
    art.className = 'art';
    art.textContent = c.emoji;
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = c.name;
    const desc = document.createElement('p');
    desc.className = 'desc';
    desc.textContent = Object.keys(c.sounds).map(id => SOUNDS.find(s => s.id === id).name).join(' · ');
    t.append(art, meta, desc);
    art.addEventListener('click', () => {
      Object.keys(c.sounds).forEach(App.install);
      App.playMix(c);
      App.startSaver(c.scene);
    });
    return t;
  }));

  // ======================= Respiration =======================
  const PATTERNS = {
    coherence: [['Inspirez', 5], ['Expirez', 5]],
    square: [['Inspirez', 4], ['Retenez', 4], ['Expirez', 4], ['Retenez', 4]],
    478: [['Inspirez', 4], ['Retenez', 7], ['Expirez', 8]],
    calm: [['Inspirez', 4], ['Expirez', 6]],
  };
  const b = { running: false, end: 0, step: 0, stepEnd: 0, h: null };
  const circle = $('#b-circle');

  function breathStep() {
    const pat = PATTERNS[$('#b-pattern').value];
    const [label, secs] = pat[b.step % pat.length];
    b.stepEnd = Date.now() + secs * 1000;
    $('#b-label').textContent = label;
    circle.style.transitionDuration = secs + 's';
    if (label === 'Inspirez') circle.style.transform = 'scale(1)';
    if (label === 'Expirez') circle.style.transform = 'scale(0.45)';
    b.step++;
  }

  function breathTick() {
    const t = Date.now();
    if (t >= b.end) { breathStop(true); return; }
    if (t >= b.stepEnd) breathStep();
    $('#b-count').textContent = Math.ceil((b.stepEnd - Date.now()) / 1000);
    $('#b-remaining').textContent = `Temps restant : ${fmt(b.end - t)}`;
  }

  function breathStart() {
    b.running = true;
    b.step = 0;
    b.end = Date.now() + +$('#b-duration').value * 60000;
    breathStep();
    b.h = setInterval(breathTick, 200);
    breathTick();
    $('#b-start').innerHTML = '<span class="ico">&#xE71A;</span> Arrêter';
  }

  function breathStop(finished) {
    clearInterval(b.h);
    b.running = false;
    circle.style.transitionDuration = '1.5s';
    circle.style.transform = 'scale(0.45)';
    $('#b-label').textContent = finished ? 'Terminé' : 'Prêt';
    $('#b-count').textContent = '';
    $('#b-remaining').textContent = finished ? 'Belle séance. Prenez un instant avant de reprendre.' : '';
    $('#b-start').innerHTML = '<span class="ico">&#xE768;</span> Commencer';
    if (finished) Engine.oneShot('chime.ogg').catch(() => {});
  }

  $('#b-start').addEventListener('click', () => (b.running ? breathStop(false) : breathStart()));
})();
