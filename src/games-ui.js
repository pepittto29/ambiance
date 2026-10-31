// Page Jeux : avancement du tricot, collection de chapeaux, jardinière et graines.
(() => {
  const api = window.ambiance && window.ambiance.games;
  if (!api) return;
  const { PAL, RARITY, HATS, PLANTS } = window.GAMES;
  const $ = s => document.querySelector(s);
  let st = null;

  function draw(cv, rows, scale) {
    const w = rows[0].length, h = rows.length;
    cv.width = cv.width || w * scale;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, cv.width, cv.height);
    const ox = Math.floor((cv.width - w * scale) / 2), oy = cv.height - h * scale;
    rows.forEach((r, y) => [...r].forEach((c, x) => {
      if (c === '.') return;
      ctx.fillStyle = PAL[c];
      ctx.fillRect(ox + x * scale, oy + y * scale, scale, scale);
    }));
  }

  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  const button = (label, onClick, cls = 'btn') => {
    const b = el('button', cls, label);
    b.addEventListener('click', e => { e.stopPropagation(); onClick(); });
    return b;
  };
  const toast = msg => window.App && window.App.toast(msg);

  function renderHats() {
    const box = $('#gm-hats');
    box.textContent = '';
    const owned = HATS.filter(h => st.hats[h.id]).length;
    $('#gm-hat-count').textContent = `${owned} / ${HATS.length}`;

    const none = el('button', 'gm-hat' + (!st.wearing ? ' on' : ''));
    const blank = el('canvas'); blank.width = 36; blank.height = 24;
    none.append(blank, el('span', 'n', 'Sans chapeau'), el('span', 'r', ' '));
    none.addEventListener('click', async () => { st = await api.wear(null); render(); });
    box.append(none);

    for (const h of HATS) {
      const have = st.hats[h.id] || 0;
      const r = RARITY[h.rarity];
      const t = el('button', 'gm-hat' + (have ? '' : ' locked') + (st.wearing === h.id ? ' on' : ''));
      t.style.setProperty('--r', r.color);
      const cv = el('canvas'); cv.width = 36; cv.height = 24;
      draw(cv, h.rows, 3);
      t.append(cv, el('span', 'n', have ? h.name : '???'), el('span', 'r', r.name + (have > 1 ? ` · ×${have}` : '')));
      if (have) {
        t.title = 'Le porter';
        t.addEventListener('click', async () => { st = await api.wear(h.id); render(); });
      } else {
        const buy = button(`${r.price} ★`, async () => {
          const res = await api.buyHat(h.id);
          if (!res.ok) toast(res.error || 'Achat impossible');
        });
        buy.disabled = st.stars < r.price;
        buy.title = `Acheter ce chapeau ${r.name.toLowerCase()}`;
        t.append(buy);
      }
      box.append(t);
    }
  }

  function renderSeeds() {
    const box = $('#gm-seeds');
    box.textContent = '';
    for (const p of PLANTS) {
      const have = p.cost === 0 ? Infinity : (st.seeds[p.id] || 0);
      const card = el('div', 'gm-seed' + (st.seed === p.id ? ' on' : ''));
      const cv = el('canvas'); cv.width = 21; cv.height = 27;
      draw(cv, p.rows, 3);
      const time = p.minutes >= 60 ? `${p.minutes / 60} h` : `${p.minutes} min`;
      card.append(cv, el('span', 'n', p.name), el('span', 'd', `${time} · +${p.gain} ★${p.hatChance ? ' · chapeau possible' : ''}`));
      card.append(el('span', 'd', p.cost === 0 ? 'Graines illimitées' : `${have} graine${have > 1 ? 's' : ''}`));
      const b = el('div', 'b');
      if (p.cost) {
        const buy = button(`Acheter · ${p.cost} ★`, async () => {
          const res = await api.buySeed(p.id);
          if (!res.ok) toast(res.error || 'Achat impossible');
        });
        buy.disabled = st.stars < p.cost;
        b.append(buy);
      }
      if (st.seed !== p.id) {
        const choose = button('Planter celle-ci', async () => { st = await api.chooseSeed(p.id); render(); });
        choose.disabled = have <= 0;
        b.append(choose);
      } else b.append(el('span', 'd', '✓ Prochaine plantation'));
      card.append(b);
      box.append(card);
    }
  }

  function render() {
    if (!st) return;
    $('#gm-stars').textContent = st.stars;
    $('#gm-knit-bar').style.width = `${Math.min(100, st.stitches / st.goal * 100)}%`;
    $('#gm-knit-text').textContent = `${st.stitches} / ${st.goal} mailles · ${st.knitted} chapeau${st.knitted > 1 ? 'x' : ''} tricoté${st.knitted > 1 ? 's' : ''}`;
    renderHats();
    $('#gm-place-label').textContent = st.garden ? 'Déplacer la jardinière' : 'Poser la jardinière';
    $('#gm-remove').classList.toggle('hidden', !st.garden);
    const names = st.pots.map(p => {
      if (!p) return 'libre';
      const plant = PLANTS.find(x => x.id === p.plant);
      return p.ripe ? `${plant.name} : à récolter !` : `${plant.name} : ${Math.max(0, plant.minutes - p.grown)} min`;
    });
    $('#gm-pots').textContent = st.garden ? names.join(' · ') + (st.raining ? ' · 🌧️ pousse ×2' : '') : '';
    renderSeeds();
  }

  $('#gm-place').addEventListener('click', async () => {
    toast('Cliquez à l\'endroit où poser la jardinière (Échap pour annuler)');
    st = await api.placeGarden();
    render();
  });
  $('#gm-remove').addEventListener('click', async () => { st = await api.removeGarden(); render(); });

  // Les mailles arrivent souvent : on ne redessine que la barre si rien d'autre n'a changé.
  api.onState(s => {
    const light = st && JSON.stringify({ ...s, stitches: 0 }) === JSON.stringify({ ...st, stitches: 0 });
    st = s;
    if (light) {
      $('#gm-knit-bar').style.width = `${Math.min(100, st.stitches / st.goal * 100)}%`;
      $('#gm-knit-text').textContent = $('#gm-knit-text').textContent.replace(/^\d+/, st.stitches);
    } else render();
  });
  api.state().then(s => { st = s; render(); });
})();
