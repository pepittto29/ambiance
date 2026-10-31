window.addEventListener('mousedown', e => { if (e.button === 0) window.pet.pickerDone(true); });
window.addEventListener('keydown', e => { if (e.key === 'Escape') window.pet.pickerDone(false); });
// Ce qu'on place (« le terrier », « la jardinière »), passé dans l'adresse de la page.
const what = new URLSearchParams(location.search).get('what');
if (what) document.getElementById('what').textContent = what;
