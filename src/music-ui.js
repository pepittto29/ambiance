// Page « Musique » : ce que joue n'importe quelle application (contrôles média de Windows) et,
// en option, le compte Spotify de l'utilisateur (bibliothèque, recherche, lecture).
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const api = window.ambiance;
  if (!api || !api.music) return;
  const { toast } = App;

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  const fmt = s => (s > 0 ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '');

  // ---------- En cours de lecture (toutes applications) ----------
  let sessions = [];
  let chosen = null; // application choisie par l'utilisateur quand plusieurs jouent
  const current = () => sessions.find(s => s.app === chosen) || sessions[0] || null;

  function renderNow() {
    const s = current();
    const playing = s && s.status === 'Playing';
    $('#mu-art').classList.toggle('hidden', !(s && s.thumb));
    if (s && s.thumb) $('#mu-art').src = s.thumb;
    $('#mu-app').textContent = s ? s.name : '';
    $('#mu-title').textContent = s ? (s.title || 'Titre inconnu') : 'Rien ne joue pour l\'instant';
    $('#mu-artist').textContent = s ? [s.artist, s.album].filter(Boolean).join(' · ')
      : 'Lancez de la musique dans n\'importe quelle application : elle apparaîtra ici.';
    $('#mu-toggle').innerHTML = playing ? '&#xE769;' : '&#xE768;';
    for (const id of ['#mu-prev', '#mu-toggle', '#mu-next']) $(id).disabled = !s;
    if (s) { $('#mu-prev').disabled = !s.canPrev; $('#mu-next').disabled = !s.canNext; }
    tick();

    const box = $('#mu-sessions');
    box.replaceChildren(...(sessions.length > 1 ? sessions.map(x => {
      const b = el('button', 'mu-chip' + (x === s ? ' on' : ''), `${x.status === 'Playing' ? '▶ ' : ''}${x.name}`);
      b.title = x.title || '';
      b.addEventListener('click', () => { chosen = x.app; renderNow(); });
      return b;
    }) : []));
  }

  // La position avance entre deux annonces de Windows : on l'interpole.
  function tick() {
    const s = current();
    const show = s && s.duration > 0;
    $('.mu-time').classList.toggle('hidden', !show);
    if (!show) return;
    const pos = Math.min(s.duration, s.position + (s.status === 'Playing' ? (Date.now() - s.at) / 1000 : 0));
    $('#mu-pos').textContent = fmt(pos);
    $('#mu-dur').textContent = fmt(s.duration);
    $('#mu-bar').style.width = `${(pos / s.duration) * 100}%`;
  }
  setInterval(() => { if ($('#page-music').classList.contains('active')) tick(); }, 1000);

  api.music.onState(st => { sessions = st.sessions || []; renderNow(); });
  const cmd = c => { const s = current(); api.music.command(c, s && s.app); };
  $('#mu-toggle').addEventListener('click', () => cmd('toggle'));
  $('#mu-next').addEventListener('click', () => cmd('next'));
  $('#mu-prev').addEventListener('click', () => cmd('prev'));

  // Le script de Windows ne tourne que pendant que la page Musique est ouverte (ou l'éditeur de mode).
  let watching = false;
  async function watch(on) {
    if (on === watching) return;
    watching = on;
    const st = await api.music.watch(on);
    if (on && st) { sessions = st.sessions || []; renderNow(); }
  }
  new MutationObserver(() => {
    const open = $('#page-music').classList.contains('active');
    watch(open && !document.hidden);
    if (open) refreshSpotify();
  }).observe($('#page-music'), { attributes: true, attributeFilter: ['class'] });
  document.addEventListener('visibilitychange', () => watch($('#page-music').classList.contains('active') && !document.hidden));

  // ---------- Spotify ----------
  let sp = { connected: false };
  let library = null;

  function message(text, isError) {
    $('#sp-msg').textContent = text || '';
    $('#sp-msg').classList.toggle('hidden', !text);
    $('#sp-msg').classList.toggle('error', !!isError);
  }

  async function play(link) {
    const r = await api.spotify.play(link);
    if (r.ok) { toast('▶ Lecture sur Spotify'); return; }
    // Sans Premium, Spotify n'autorise pas le pilotage : on ouvre la musique dans l'application.
    if (r.code === 'premium') { api.music.play(link); toast('Ouverture dans Spotify (le pilotage demande Premium)'); return; }
    toast(r.error);
    if (r.code === 'not-connected') refreshSpotify();
  }

  function tile(item) {
    const t = el('button', 'sp-tile');
    const art = el('div', 'sp-art');
    if (item.image) { const img = el('img'); img.src = item.image; img.alt = ''; img.loading = 'lazy'; art.append(img); }
    else art.append(el('span', 'ico', item.uri === 'liked' ? '' : ''));
    if (item.uri === 'liked') art.classList.add('liked');
    t.append(art, el('div', 'sp-name', item.name), el('div', 'sp-meta', item.sub || ''));
    t.title = `Lire « ${item.name} »`;
    t.addEventListener('click', () => play(item.uri));
    return t;
  }

  function renderLibrary() {
    if (!library) return;
    const items = [
      { uri: 'liked', name: 'Titres likés', sub: `${library.liked} titres` },
      ...library.playlists.map(p => ({ ...p, sub: p.count != null ? `${p.count} titres` : (p.owner || '') })),
    ];
    $('#sp-grid').replaceChildren(...items.map(tile));
  }

  async function refreshSpotify() {
    sp = await api.spotify.state();
    $('#sp-setup').classList.toggle('hidden', sp.connected);
    $('#sp-lib').classList.toggle('hidden', !sp.connected);
    $('#sp-disconnect').classList.toggle('hidden', !sp.connected);
    $('#sp-user').textContent = sp.connected && sp.user ? `Connecté : ${sp.user.name}` : '';
    $('#sp-redirect').value = sp.redirect;
    if (!$('#sp-client').value) $('#sp-client').value = sp.clientId || '';
    if (sp.connected && !library) {
      const r = await api.spotify.library();
      if (r.ok) { library = r.data; renderLibrary(); message(''); } else message(r.error, true);
    }
  }

  $('#sp-dashboard').addEventListener('click', e => { e.preventDefault(); api.spotify.openDashboard(); });
  $('#sp-copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('#sp-redirect').value); toast('Adresse copiée'); } catch { $('#sp-redirect').select(); }
  });
  $('#sp-connect').addEventListener('click', async () => {
    const set = await api.spotify.setClientId($('#sp-client').value);
    if (!set.ok) { message(set.error, true); return; }
    message('Autorisez Ambiance dans la page Spotify qui vient de s\'ouvrir dans votre navigateur…');
    $('#sp-connect').disabled = true;
    const r = await api.spotify.connect();
    $('#sp-connect').disabled = false;
    if (!r.ok) {
      message(/client|redirect/i.test(r.error)
        ? 'Spotify refuse cet identifiant ou l\'adresse de redirection. Vérifiez le Client ID et que l\'adresse de l\'étape 3 est bien ajoutée.'
        : r.error, true);
      return;
    }
    message('');
    library = null;
    toast('✓ Spotify connecté');
    refreshSpotify();
  });
  $('#sp-disconnect').addEventListener('click', async () => {
    await api.spotify.disconnect();
    library = null;
    $('#sp-results').classList.add('hidden');
    refreshSpotify();
  });
  $('#sp-search-form').addEventListener('submit', async e => {
    e.preventDefault();
    const q = $('#sp-search').value.trim();
    const box = $('#sp-results');
    if (!q) { box.classList.add('hidden'); return; }
    const r = await api.spotify.search(q);
    if (!r.ok) { toast(r.error); return; }
    box.replaceChildren(...(r.data.length ? r.data.map(x => tile({ ...x, sub: `${x.kind} · ${x.sub || ''}` })) : [el('p', 'sp-msg', 'Aucun résultat.')]));
    box.classList.remove('hidden');
  });
  $('#sp-search').addEventListener('input', e => { if (!e.target.value) $('#sp-results').classList.add('hidden'); });

  // Propose les playlists Spotify dans le champ « Musique du mode » de l'éditeur.
  window.Music = {
    async fillDatalist(list) {
      if (!sp.connected) sp = await api.spotify.state();
      if (sp.connected && !library) {
        const r = await api.spotify.library();
        if (r.ok) library = r.data;
      }
      const opts = [];
      if (library) {
        const o = el('option'); o.value = 'liked'; o.label = 'Spotify : Titres likés'; opts.push(o);
        for (const p of library.playlists) { const x = el('option'); x.value = p.uri; x.label = `Spotify : ${p.name}`; opts.push(x); }
      }
      list.replaceChildren(...opts);
    },
  };

  renderNow();
  refreshSpotify();
})();
