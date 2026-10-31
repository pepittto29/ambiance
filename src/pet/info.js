// Bulle d'information du compagnon (double-clic, rappels, félicitations).
const $ = id => document.getElementById(id);

window.pet.onState(s => {
  const { summary: sm, reason, name, below } = s;
  document.body.classList.toggle('below', !!below);
  document.body.classList.toggle('talk', reason === 'parole');
  if (reason === 'parole') {
    $('title').textContent = s.petName || 'Ton compagnon';
    $('msg').textContent = s.say || '';
    return;
  }
  const titles = { rappel: 'Petit rappel !', bravo: 'Bravo !', info: 'Tes tâches' };
  $('title').textContent = titles[reason] || 'Tes tâches';
  let msg;
  if (!sm.total && !sm.next) msg = `Aucune tâche pour l'instant. Ajoute-en dans Ambiance, ${name} te les rappellera !`;
  else if (sm.left === 0) msg = 'Tout est fait pour aujourd\'hui. Quelle efficacité !';
  else if (reason === 'rappel') msg = `Il te reste ${sm.left} tâche${sm.left > 1 ? 's' : ''}. On s'y remet ?`;
  else msg = `${sm.done} sur ${sm.total} faite${sm.done > 1 ? 's' : ''} aujourd'hui${sm.late ? ` · ${sm.late} en retard` : ''}.`;
  $('msg').textContent = msg;
  $('barbox').classList.toggle('hidden', !sm.total);
  $('bar').style.width = sm.total ? `${Math.round(sm.done / sm.total * 100)}%` : '0';
  $('next').classList.toggle('hidden', !sm.next);
  if (sm.next) {
    $('next').replaceChildren();
    const b = document.createElement('b');
    b.textContent = 'Ensuite : ';
    $('next').append(b, sm.next.text);
    $('next').title = sm.next.text;
  }
  $('done').classList.toggle('hidden', !sm.next);
});

$('done').addEventListener('click', () => window.pet.info('done'));
$('open').addEventListener('click', () => window.pet.info('open'));
$('x').addEventListener('click', () => window.pet.info('close'));
document.addEventListener('mouseenter', () => window.pet.info('hover'));
document.addEventListener('mouseleave', () => window.pet.info('leave'));
