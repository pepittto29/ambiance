// Cadran de l'horloge : chiffres pixel art 3 x 5 sur un petit panneau rétro.
const FONT = {
  0: ['111', '101', '101', '101', '111'], 1: ['010', '110', '010', '010', '111'],
  2: ['111', '001', '111', '100', '111'], 3: ['111', '001', '111', '001', '111'],
  4: ['101', '101', '111', '001', '001'], 5: ['111', '100', '111', '001', '111'],
  6: ['111', '100', '111', '101', '111'], 7: ['111', '001', '010', '010', '010'],
  8: ['111', '101', '111', '101', '111'], 9: ['111', '101', '111', '001', '111'],
  ':': ['0', '1', '0', '1', '0'],
};
const cv = document.getElementById('c');
const ctx = cv.getContext('2d');
let st = { seconds: false, date: true, focus: null };

function text(str, x, y, s, color, blink) {
  ctx.fillStyle = color;
  for (const ch of str) {
    const g = FONT[ch];
    if (!g) { x += 2 * s; continue; }
    if (!(ch === ':' && blink)) {
      g.forEach((row, ry) => [...row].forEach((b, rx) => { if (b === '1') ctx.fillRect(x + rx * s, y + ry * s, s, s); }));
    }
    x += (g[0].length + 1) * s;
  }
  return x;
}

function width(str, s) {
  return [...str].reduce((w, ch) => w + ((FONT[ch] ? FONT[ch][0].length : 1) + 1) * s, -s);
}

function panel(h) {
  // Panneau aux coins « pixel » avec une bordure claire.
  ctx.fillStyle = 'rgba(16, 20, 32, 0.88)';
  ctx.fillRect(4, 0, cv.width - 8, h);
  ctx.fillRect(0, 4, cv.width, h - 8);
  ctx.fillStyle = 'rgba(125, 249, 255, 0.35)';
  ctx.fillRect(4, 0, cv.width - 8, 2);
  ctx.fillRect(4, h - 2, cv.width - 8, 2);
  ctx.fillRect(0, 4, 2, h - 8);
  ctx.fillRect(cv.width - 2, 4, 2, h - 8);
}

function draw() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const hm = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const blink = now.getMilliseconds() > 500;
  const extra = st.focus || st.date;
  const h = extra ? 86 : 58;
  ctx.clearRect(0, 0, cv.width, cv.height);
  panel(h);
  const s = 6;
  const sec = st.seconds ? pad(now.getSeconds()) : '';
  const total = width(hm, s) + (sec ? 8 + width(sec, 3) : 0);
  let x = Math.round((cv.width - total) / 2);
  // Léger halo derrière les chiffres.
  text(hm, x + 1, 13, s, 'rgba(125, 249, 255, 0.25)', blink);
  x = text(hm, x, 12, s, '#7df9ff', blink);
  if (sec) text(sec, x + 8 - s, 12 + 5 * s - 15, 3, '#4fb3bf', false);
  if (extra) {
    ctx.font = '600 12px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    if (st.focus) {
      const left = Math.max(0, Math.ceil((st.focus.end - Date.now()) / 1000));
      ctx.fillStyle = st.focus.phase === 'break' ? '#9be37a' : '#ffcf6b';
      ctx.fillText(`${st.focus.phase === 'break' ? '☕ Pause' : '🎯 Focus'}  ${pad(Math.floor(left / 60))}:${pad(left % 60)}`, cv.width / 2, 68);
    } else {
      ctx.fillStyle = '#9fb3c8';
      const d = now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
      ctx.fillText(d.charAt(0).toUpperCase() + d.slice(1), cv.width / 2, 68);
    }
  }
  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);

window.pet.onState(s => { st = { ...st, ...s }; });
