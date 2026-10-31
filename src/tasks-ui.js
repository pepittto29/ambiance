// Tâches : magasin partagé (TaskStore) et page « Tâches ». La liste est conservée par le processus
// principal (tasks.js) pour que le compagnon et la page Focus voient les mêmes tâches.
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const api = window.ambiance && window.ambiance.tasks;
  let items = [];
  const subs = [];
  const notify = () => subs.forEach(fn => fn(items));
  const set = list => { items = list; notify(); };

  // Sans l'application (aperçu navigateur), on garde les tâches dans la page.
  const local = {
    load: () => { try { return JSON.parse(localStorage.getItem('ambiance.tasks2') || '[]'); } catch { return []; } },
    save: list => { try { localStorage.setItem('ambiance.tasks2', JSON.stringify(list)); } catch { /* ignoré */ } return list; },
  };

  window.TaskStore = {
    list: () => items,
    subscribe(fn) { subs.push(fn); fn(items); },
    async add(t) { set(api ? await api.add(t) : local.save([...items, { id: String(Date.now()), done: false, priority: 'normale', due: null, created: Date.now(), ...t }])); },
    async update(id, patch) { set(api ? await api.update(id, patch) : local.save(items.map(x => x.id === id ? { ...x, ...patch } : x))); },
    async remove(id) { set(api ? await api.remove(id) : local.save(items.filter(x => x.id !== id))); },
    async clearDone() { set(api ? await api.clearDone() : local.save(items.filter(x => !x.done))); },
  };

  async function init() {
    if (!api) { set(local.load()); return; }
    api.onChange(set);
    let list = await api.get();
    // Reprend les tâches de l'ancienne version, gardées dans la page Focus.
    try {
      const legacy = JSON.parse(localStorage.getItem('ambiance.tasks') || '[]');
      if (!list.length && legacy.length) list = await api.importLegacy(legacy);
      localStorage.removeItem('ambiance.tasks');
    } catch { /* rien à reprendre */ }
    set(list);
  }

  // ---------- Page Tâches ----------
  const today = () => new Date().toLocaleDateString('sv-SE');
  const tomorrow = () => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toLocaleDateString('sv-SE'); };
  let filter = 'todo';

  function dueLabel(due) {
    if (!due) return null;
    if (due === today()) return { text: 'Aujourd\'hui', cls: 'today' };
    if (due === tomorrow()) return { text: 'Demain', cls: '' };
    const d = new Date(due + 'T12:00');
    return { text: d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }), cls: due < today() ? 'late' : '' };
  }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function editInline(span, t) {
    const input = el('input', 'tk-edit');
    input.type = 'text';
    input.value = t.text;
    input.maxLength = 200;
    span.replaceWith(input);
    input.focus();
    input.select();
    const done = ok => {
      const v = input.value.trim();
      if (ok && v && v !== t.text) TaskStore.update(t.id, { text: v });
      else render(items);
    };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); });
    input.addEventListener('blur', () => done(true));
  }

  function render(list) {
    const all = list || items;
    const relevant = all.filter(t => !t.due || t.due <= today() || t.done);
    const doneCount = relevant.filter(t => t.done).length;
    $('#tk-count').textContent = relevant.length ? `${doneCount} / ${relevant.length} faites` : 'Aucune tâche';
    $('#tk-bar').style.width = relevant.length ? `${Math.round(doneCount / relevant.length * 100)}%` : '0';
    for (const b of document.querySelectorAll('.tk-filter')) b.classList.toggle('on', b.dataset.filter === filter);
    $('#tk-clear').classList.toggle('hidden', !all.some(t => t.done));

    const shown = all.filter(t => filter === 'all' || (filter === 'done' ? t.done : !t.done));
    const ul = $('#tk-list');
    if (!shown.length) {
      ul.replaceChildren(el('li', 'tk-empty', filter === 'done' ? 'Aucune tâche terminée.' : 'Rien à faire pour l\'instant. Ajoutez une tâche ci-dessus !'));
      return;
    }
    ul.replaceChildren(...shown.map(t => {
      const li = el('li', 'tk-item' + (t.done ? ' done' : ''));
      const cb = el('input');
      cb.type = 'checkbox';
      cb.checked = t.done;
      cb.addEventListener('change', () => TaskStore.update(t.id, { done: cb.checked }));
      const dot = el('span', 'tk-dot ' + t.priority);
      dot.title = `Priorité ${t.priority} (cliquer pour changer)`;
      dot.addEventListener('click', () => {
        const next = { haute: 'normale', normale: 'basse', basse: 'haute' }[t.priority];
        TaskStore.update(t.id, { priority: next });
      });
      const text = el('span', 'tk-text', t.text);
      text.title = 'Double-cliquez pour modifier';
      text.addEventListener('dblclick', () => editInline(text, t));
      li.append(cb, dot, text);
      const due = dueLabel(t.due);
      if (due) li.append(el('span', 'tk-due ' + due.cls, due.text));
      const del = el('button', 'icon-btn ico', '');
      del.title = 'Supprimer';
      del.addEventListener('click', () => TaskStore.remove(t.id));
      li.append(del);
      return li;
    }));
  }

  $('#tk-due').addEventListener('change', e => $('#tk-date').classList.toggle('hidden', e.target.value !== 'date'));
  $('#tk-form').addEventListener('submit', e => {
    e.preventDefault();
    const text = $('#tk-text').value.trim();
    if (!text) return;
    const choice = $('#tk-due').value;
    const due = choice === 'today' ? today() : choice === 'tomorrow' ? tomorrow() : choice === 'date' ? ($('#tk-date').value || null) : null;
    TaskStore.add({ text, priority: $('#tk-priority').value, due });
    $('#tk-text').value = '';
    $('#tk-text').focus();
  });
  for (const b of document.querySelectorAll('.tk-filter')) b.addEventListener('click', () => { filter = b.dataset.filter; render(); });
  $('#tk-clear').addEventListener('click', () => TaskStore.clearDone());

  TaskStore.subscribe(render);
  init();
})();
