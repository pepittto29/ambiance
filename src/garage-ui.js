// Page Garage : choix de la voiture du mode Course, emplacement du garage et départ d'une course.
(() => {
  const api = window.ambiance;
  if (!api || !api.raceStart) return;
  const { CARS, draw } = window.RACE_CARS;
  const $ = s => document.querySelector(s);
  let current = null;

  function render() {
    const box = $('#gr-cars');
    box.textContent = '';
    CARS.forEach((car, i) => {
      const b = document.createElement('button');
      b.className = 'gr-car' + (car.id === current ? ' on' : '');
      b.title = car.id === current ? 'Voiture actuelle' : 'Choisir cette voiture';
      const cv = document.createElement('canvas');
      cv.width = 120; cv.height = 48;
      draw(cv.getContext('2d'), car.id, 0, 0, 3, { spin: i });
      const n = document.createElement('span'); n.className = 'n'; n.textContent = car.name;
      const y = document.createElement('span'); y.className = 'y'; y.textContent = car.year;
      b.append(cv, n, y);
      b.addEventListener('click', async () => {
        current = car.id;
        await api.setConfig({ car: car.id });
        render();
      });
      box.append(b);
    });
  }

  $('#gr-race').addEventListener('click', async () => {
    const ok = await api.raceStart();
    if (!ok && window.App) window.App.toast('La course n\'a pas pu démarrer : le compagnon est-il affiché ?');
  });
  $('#gr-place').addEventListener('click', async () => {
    if (window.App) window.App.toast('Cliquez à l\'endroit où placer le garage (Échap pour annuler)');
    await api.pickBurrow();
  });

  api.onConfig(c => { if (c.car && c.car !== current) { current = c.car; render(); } });
  api.info().then(info => { current = info.config.car; render(); });
})();
