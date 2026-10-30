window.addEventListener('mousedown', e => { if (e.button === 0) window.pet.pickerDone(true); });
window.addEventListener('keydown', e => { if (e.key === 'Escape') window.pet.pickerDone(false); });
