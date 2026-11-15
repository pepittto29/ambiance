// Calque du mode Course : traces de pneus qui s'effacent doucement, et piste autour de l'écran
// (bitume, vibreurs rouges et blancs, ligne de départ en damier, feux de départ, compteur de tours).
const tc = document.getElementById('track'), mc = document.getElementById('marks');
const tx = tc.getContext('2d'), mx = mc.getContext('2d');
let track = null;
let audio = null;

function resize() {
  for (const c of [tc, mc]) { c.width = innerWidth; c.height = innerHeight; }
  drawTrack();
}
addEventListener('resize', resize);

// Les traces pâlissent un peu chaque demi-seconde : elles disparaissent en une minute environ.
setInterval(() => {
  mx.globalCompositeOperation = 'destination-out';
  mx.fillStyle = 'rgba(0,0,0,0.03)';
  mx.fillRect(0, 0, mc.width, mc.height);
  mx.globalCompositeOperation = 'source-over';
}, 500);

function addMarks(list) {
  mx.fillStyle = 'rgba(24, 22, 26, 0.32)';
  for (const [x, y, rot] of list) {
    mx.save();
    mx.translate(x, y);
    mx.rotate(rot * Math.PI / 180);
    mx.fillRect(-4, -3, 8, 3);
    mx.restore();
  }
}

function roundRect(ctx, x1, y1, x2, y2, r) {
  ctx.beginPath();
  ctx.roundRect(x1, y1, x2 - x1, y2 - y1, r);
}

function drawTrack() {
  tx.clearRect(0, 0, tc.width, tc.height);
  if (!track) return;
  const { x1, y1, x2, y2, R } = track;
  const W = 52;
  // Bitume, bordure blanche extérieure, vibreurs intérieurs.
  roundRect(tx, x1, y1, x2, y2, R);
  tx.lineWidth = W + 6; tx.strokeStyle = '#f4f4f4'; tx.stroke();
  tx.lineWidth = W; tx.strokeStyle = '#3b3e45'; tx.stroke();
  tx.lineWidth = 2; tx.strokeStyle = 'rgba(255,255,255,0.18)'; tx.setLineDash([18, 22]); tx.stroke(); tx.setLineDash([]);
  const k = W / 2 - 3;
  roundRect(tx, x1 + k, y1 + k, x2 - k, y2 - k, Math.max(4, R - k));
  tx.lineWidth = 6; tx.strokeStyle = '#e8332e'; tx.setLineDash([12, 12]); tx.stroke();
  tx.strokeStyle = '#ffffff'; tx.lineDashOffset = 12; tx.stroke(); tx.setLineDash([]); tx.lineDashOffset = 0;
  // Ligne de départ en damier au milieu du bas.
  const sx = (x1 + x2) / 2, top = y2 - W / 2, sq = W / 6;
  for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) {
    tx.fillStyle = (i + j) % 2 ? '#111' : '#fff';
    tx.fillRect(sx - sq + j * sq, top + i * sq, sq, sq);
  }
  // Panneau : feux de départ puis compteur de tours.
  const px = sx - 70, py = y2 - W / 2 - 64;
  tx.fillStyle = 'rgba(20,20,24,0.9)';
  tx.beginPath(); tx.roundRect(px, py, 140, 44, 8); tx.fill();
  if (track.phase === 'lights') {
    for (let i = 0; i < 4; i++) {
      tx.fillStyle = i < track.lights ? '#ff3b30' : '#3a2a2a';
      tx.beginPath(); tx.arc(px + 25 + i * 30, py + 22, 10, 0, Math.PI * 2); tx.fill();
    }
  } else {
    tx.fillStyle = '#ffffff';
    tx.font = 'bold 20px "Segoe UI", sans-serif';
    tx.textAlign = 'center';
    tx.textBaseline = 'middle';
    tx.fillText(track.phase === 'go' ? `TOUR ${track.lap} / ${track.laps}` : 'ARRIVÉE !', px + 70, py + 23);
  }
}

function beep(f, dur) {
  if (track && track.mute) return;
  try {
    audio = audio || new AudioContext();
    const t = audio.currentTime;
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = 'square'; o.frequency.value = f;
    g.gain.setValueAtTime(0.05, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(audio.destination); o.start(t); o.stop(t + dur + 0.02);
  } catch { /* son indisponible */ }
}

window.pet.onState(s => {
  if (s.marks) addMarks(s.marks);
  if (s.track) {
    const prev = track;
    if (s.track.hide) { tc.classList.remove('on'); setTimeout(() => { if (!tc.classList.contains('on')) { track = null; drawTrack(); } }, 1300); return; }
    track = s.track;
    if (track.phase === 'lights' && (!prev || prev.lights !== track.lights) && track.lights > 0) beep(440, 0.18);
    if (track.phase === 'go' && prev && prev.phase === 'lights') beep(880, 0.45);
    drawTrack();
    requestAnimationFrame(() => tc.classList.add('on'));
  }
});
resize();
