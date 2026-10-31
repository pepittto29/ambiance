// Liste de tâches partagée par toute l'application (page Tâches, Focus, compagnon, horloge).
// Conservée dans %APPDATA%\Ambiance\tasks.json.
//   tâche : { id, text, done, priority: 'haute' | 'normale' | 'basse', due: 'AAAA-MM-JJ' | null, created, doneAt }
const { app } = require('electron');
const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const file = () => path.join(app.getPath('userData'), 'tasks.json');
const events = new EventEmitter();
const PRIORITY = { haute: 0, normale: 1, basse: 2 };
let tasks = null;

function load() {
  if (tasks) return;
  try { tasks = JSON.parse(fs.readFileSync(file(), 'utf8')); } catch { tasks = []; }
}

function save() {
  try { fs.writeFileSync(file(), JSON.stringify(tasks, null, 2)); } catch { /* ignoré */ }
  events.emit('change', list());
}

const today = () => new Date().toLocaleDateString('sv-SE');

// Ordre d'affichage : à faire d'abord (priorité, puis échéance, puis ordre de création).
function list() {
  load();
  return [...tasks].sort((a, b) =>
    (a.done - b.done)
    || (PRIORITY[a.priority] - PRIORITY[b.priority])
    || ((a.due || '9999') < (b.due || '9999') ? -1 : (a.due || '9999') > (b.due || '9999') ? 1 : 0)
    || a.created - b.created);
}

function add({ text, priority = 'normale', due = null }) {
  load();
  const t = String(text || '').trim().slice(0, 200);
  if (!t) return list();
  tasks.push({ id: crypto.randomUUID(), text: t, done: false, priority: PRIORITY[priority] !== undefined ? priority : 'normale', due, created: Date.now(), doneAt: null });
  save();
  return list();
}

function update(id, patch) {
  load();
  const task = tasks.find(x => x.id === id);
  if (!task) return list();
  const wasDone = task.done;
  for (const k of ['text', 'priority', 'due', 'done']) if (k in patch) task[k] = patch[k];
  if (!wasDone && task.done) {
    task.doneAt = Date.now();
    save();
    const s = summary();
    events.emit('done', task, s.left === 0);
  } else {
    if (wasDone && !task.done) task.doneAt = null;
    save();
  }
  return list();
}

function remove(id) {
  load();
  tasks = tasks.filter(x => x.id !== id);
  save();
  return list();
}

function clearDone() {
  load();
  tasks = tasks.filter(x => !x.done);
  save();
  return list();
}

// Importe les tâches de l'ancienne version (stockées dans la page).
function importLegacy(items = []) {
  load();
  if (tasks.length || !items.length) return list();
  for (const it of items) tasks.push({ id: crypto.randomUUID(), text: String(it.text || '').slice(0, 200), done: !!it.done, priority: 'normale', due: null, created: it.id || Date.now(), doneAt: it.done ? Date.now() : null });
  save();
  return list();
}

// Résumé pour le compagnon : tâches du jour (sans échéance, en retard ou pour aujourd'hui).
function summary() {
  const all = list();
  const relevant = all.filter(t => !t.due || t.due <= today() || (t.done && t.doneAt && new Date(t.doneAt).toLocaleDateString('sv-SE') === today()));
  const doneToday = relevant.filter(t => t.done).length;
  const left = relevant.filter(t => !t.done).length;
  const next = all.find(t => !t.done && (!t.due || t.due <= today())) || all.find(t => !t.done) || null;
  return { total: relevant.length, done: doneToday, left, next, late: all.filter(t => !t.done && t.due && t.due < today()).length };
}

module.exports = { list, add, update, remove, clearDone, importLegacy, summary, events, today };
