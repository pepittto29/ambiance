// Écran de veille : animations plein écran assorties à l'ambiance en cours.
const Saver = (() => {
  let canvas, ctx, raf = 0, running = false, armed = false;
  let scene = 'aurora', labels = [], onExit = null;
  let W = 0, H = 0, dpr = 1, last = 0, flash = 0;
  let parts = [], extra = [];
  let startPos = null;
  const rand = (a, b) => a + Math.random() * (b - a);

  function resize() {
    dpr = window.devicePixelRatio || 1;
    W = canvas.width = Math.floor(innerWidth * dpr);
    H = canvas.height = Math.floor(innerHeight * dpr);
  }

  function init() {
    parts = []; extra = [];
    if (scene === 'rain' || scene === 'storm') {
      for (let i = 0; i < 350; i++) parts.push(newDrop(true));
    } else if (scene === 'night') {
      for (let i = 0; i < 220; i++) parts.push({ x: Math.random() * W, y: Math.random() * H * 0.85, r: rand(0.4, 1.6) * dpr, p: Math.random() * 6 });
      for (let i = 0; i < 26; i++) extra.push({ x: Math.random() * W, y: rand(0.5, 1) * H, a: Math.random() * 6, s: rand(0.2, 0.6) });
    } else if (scene === 'snow') {
      for (let i = 0; i < 260; i++) parts.push({ x: Math.random() * W, y: Math.random() * H, r: rand(1, 4) * dpr, v: rand(30, 110) * dpr, p: Math.random() * 6 });
    } else if (scene === 'underwater') {
      for (let i = 0; i < 70; i++) parts.push({ x: Math.random() * W, y: Math.random() * H, r: rand(2, 7) * dpr, v: rand(30, 90) * dpr, p: Math.random() * 6 });
    } else if (scene === 'aurora') {
      for (let i = 0; i < 5; i++) parts.push({ h: rand(150, 300), fx: rand(0.03, 0.08), fy: rand(0.02, 0.06), p: Math.random() * 6 });
    }
  }

  function newDrop(anywhere) {
    return { x: rand(-0.2, 1) * W, y: anywhere ? Math.random() * H : rand(-0.2, 0) * H, l: rand(10, 28) * dpr, v: rand(900, 1500) * dpr, a: rand(0.15, 0.45) };
  }

  function bg(stops) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  function drawRain(dt) {
    bg(['#0a1322', '#16263d', '#1f3550']);
    ctx.lineWidth = 1.2 * dpr;
    ctx.lineCap = 'round';
    for (const d of parts) {
      d.y += d.v * dt;
      d.x += d.v * 0.12 * dt;
      if (d.y > H) {
        extra.push({ x: d.x, y: H - rand(0, 0.12) * H, r: 0, a: 0.5 });
        Object.assign(d, newDrop(false));
      }
      ctx.strokeStyle = `rgba(170,200,255,${d.a})`;
      ctx.beginPath();
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x - d.l * 0.12, d.y - d.l);
      ctx.stroke();
    }
    extra = extra.filter(s => s.a > 0.02);
    for (const s of extra) {
      s.r += 40 * dpr * dt;
      s.a *= 0.92;
      ctx.strokeStyle = `rgba(170,200,255,${s.a})`;
      ctx.beginPath();
      ctx.ellipse(s.x, s.y, s.r, s.r * 0.3, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (scene === 'storm') {
      if (flash < 0.05 && Math.random() < 0.003) flash = 1;
      if (flash > 0.01) {
        ctx.fillStyle = `rgba(220,230,255,${flash * 0.55})`;
        ctx.fillRect(0, 0, W, H);
        flash *= 0.9;
      }
    }
  }

  function drawWaves(t) {
    bg(['#0f2027', '#203a43', '#2c5364']);
    const mx = W * 0.75, my = H * 0.22, mr = Math.min(W, H) * 0.06;
    const glow = ctx.createRadialGradient(mx, my, 0, mx, my, mr * 5);
    glow.addColorStop(0, 'rgba(255,250,230,0.35)');
    glow.addColorStop(1, 'rgba(255,250,230,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#f6f1de';
    ctx.beginPath(); ctx.arc(mx, my, mr, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 7; i++) {
      const base = H * (0.52 + i * 0.075);
      const amp = (8 + i * 6) * dpr;
      const k = (0.004 - i * 0.0003) / dpr;
      const sp = 0.4 + i * 0.15;
      ctx.fillStyle = `rgba(${20 + i * 6},${80 + i * 12},${120 + i * 10},${0.25 + i * 0.08})`;
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (let x = 0; x <= W; x += 8 * dpr) {
        const y = base + Math.sin(x * k + t * sp + i) * amp + Math.sin(x * k * 2.3 - t * sp * 0.7) * amp * 0.4;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(W, H);
      ctx.fill();
    }
  }

  function drawFire(t, dt) {
    ctx.fillStyle = '#0c0503';
    ctx.fillRect(0, 0, W, H);
    const flick = 0.85 + Math.sin(t * 7) * 0.05 + Math.sin(t * 13.7) * 0.05 + Math.sin(t * 3.1) * 0.05;
    const g = ctx.createRadialGradient(W / 2, H * 1.05, 0, W / 2, H * 1.05, H * 0.9 * flick);
    g.addColorStop(0, 'rgba(255,170,60,0.95)');
    g.addColorStop(0.25, 'rgba(230,90,20,0.6)');
    g.addColorStop(0.6, 'rgba(120,30,10,0.25)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 4; i++) {
      parts.push({ x: W / 2 + rand(-0.25, 0.25) * W, y: H + 10, vx: rand(-30, 30) * dpr, vy: -rand(80, 260) * dpr, life: 1, s: rand(1, 3.5) * dpr });
    }
    ctx.globalCompositeOperation = 'lighter';
    parts = parts.filter(p => p.life > 0);
    for (const p of parts) {
      p.x += (p.vx + Math.sin(t * 2 + p.y * 0.01) * 20 * dpr) * dt;
      p.y += p.vy * dt;
      p.life -= dt * 0.35;
      ctx.fillStyle = `rgba(255,${140 + p.life * 80 | 0},60,${Math.max(0, p.life)})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawNight(t) {
    bg(['#02010f', '#0d0b24', '#1a1530']);
    for (const s of parts) {
      ctx.fillStyle = `rgba(255,255,255,${0.35 + Math.sin(t * 1.5 + s.p) * 0.3})`;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#05040c';
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 20 * dpr) ctx.lineTo(x, H * 0.86 + Math.sin(x * 0.003 / dpr) * 30 * dpr + Math.sin(x * 0.011 / dpr) * 10 * dpr);
    ctx.lineTo(W, H);
    ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    for (const f of extra) {
      f.a += (Math.random() - 0.5) * 0.3;
      f.x = (f.x + Math.cos(f.a) * f.s * dpr + W) % W;
      f.y = Math.min(H * 0.98, Math.max(H * 0.45, f.y + Math.sin(f.a) * f.s * dpr));
      const alpha = 0.4 + Math.sin(t * 2 + f.a * 3) * 0.4;
      const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, 14 * dpr);
      g.addColorStop(0, `rgba(210,255,120,${alpha})`);
      g.addColorStop(1, 'rgba(210,255,120,0)');
      ctx.fillStyle = g;
      ctx.fillRect(f.x - 14 * dpr, f.y - 14 * dpr, 28 * dpr, 28 * dpr);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawAurora(t) {
    ctx.fillStyle = '#050816';
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    const R = Math.max(W, H) * 0.55;
    for (const b of parts) {
      const x = W * (0.5 + Math.sin(t * b.fx + b.p) * 0.4);
      const y = H * (0.5 + Math.cos(t * b.fy + b.p * 1.3) * 0.35);
      const hue = (b.h + t * 6) % 360;
      const g = ctx.createRadialGradient(x, y, 0, x, y, R);
      g.addColorStop(0, `hsla(${hue},80%,55%,0.35)`);
      g.addColorStop(1, `hsla(${hue},80%,55%,0)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawSnow(t, dt) {
    bg(['#1b2735', '#2c3e55', '#5a7391']);
    ctx.fillStyle = '#e8eef5';
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 20 * dpr) ctx.lineTo(x, H * 0.9 + Math.sin(x * 0.002 / dpr) * 25 * dpr);
    ctx.lineTo(W, H);
    ctx.fill();
    for (const s of parts) {
      s.y += s.v * dt;
      s.x += Math.sin(t * 0.8 + s.p) * 25 * dpr * dt + 15 * dpr * dt;
      if (s.y > H) { s.y = -10; s.x = Math.random() * W; }
      if (s.x > W) s.x = 0;
      ctx.fillStyle = `rgba(255,255,255,${0.4 + s.r / (8 * dpr)})`;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawUnderwater(t, dt) {
    bg(['#0a4a7a', '#06294d', '#021027']);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 6; i++) {
      const x = W * (0.15 + i * 0.15) + Math.sin(t * 0.3 + i) * 60 * dpr;
      const g = ctx.createLinearGradient(x, 0, x + 120 * dpr, H);
      g.addColorStop(0, 'rgba(120,200,255,0.12)');
      g.addColorStop(1, 'rgba(120,200,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x - 30 * dpr, 0); ctx.lineTo(x + 50 * dpr, 0);
      ctx.lineTo(x + 250 * dpr, H); ctx.lineTo(x + 60 * dpr, H);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = 'rgba(200,235,255,0.5)';
    ctx.lineWidth = 1.2 * dpr;
    for (const bub of parts) {
      bub.y -= bub.v * dt;
      bub.x += Math.sin(t * 2 + bub.p) * 12 * dpr * dt;
      if (bub.y < -10) { bub.y = H + 10; bub.x = Math.random() * W; }
      ctx.beginPath(); ctx.arc(bub.x, bub.y, bub.r, 0, Math.PI * 2); ctx.stroke();
    }
  }

  function drawOverlay() {
    const now = new Date();
    const time = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = `200 ${Math.round(Math.min(W, H) * 0.16)}px "Segoe UI Variable Display", "Segoe UI", sans-serif`;
    ctx.fillText(time, W / 2, H * 0.4);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = `400 ${Math.round(18 * dpr)}px "Segoe UI", sans-serif`;
    ctx.fillText(labels.join('  ·  '), W / 2, H * 0.4 + 44 * dpr);
  }

  function frame(ts) {
    if (!running) return;
    const dt = Math.min(0.05, (ts - last) / 1000 || 0.016);
    last = ts;
    const t = ts / 1000;
    if (scene === 'rain' || scene === 'storm') drawRain(dt);
    else if (scene === 'waves') drawWaves(t);
    else if (scene === 'fire') drawFire(t, dt);
    else if (scene === 'night') drawNight(t);
    else if (scene === 'snow') drawSnow(t, dt);
    else if (scene === 'underwater') drawUnderwater(t, dt);
    else drawAurora(t);
    drawOverlay();
    raf = requestAnimationFrame(frame);
  }

  function start(sc, lbls, exitCb) {
    canvas = document.getElementById('screensaver');
    ctx = canvas.getContext('2d');
    scene = sc; labels = lbls; onExit = exitCb;
    canvas.hidden = false;
    running = true;
    armed = false;
    startPos = null;
    flash = 0;
    resize();
    init();
    setTimeout(() => { armed = true; }, 800);
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    if (!running) return;
    running = false;
    cancelAnimationFrame(raf);
    canvas.hidden = true;
    if (onExit) onExit();
  }

  addEventListener('resize', () => { if (running) { resize(); init(); } });
  addEventListener('keydown', e => { if (running) { e.preventDefault(); e.stopPropagation(); if (armed) stop(); } }, true);
  addEventListener('mousedown', () => { if (running && armed) stop(); }, true);
  addEventListener('mousemove', e => {
    if (!running || !armed) return;
    if (!startPos) { startPos = [e.clientX, e.clientY]; return; }
    if (Math.hypot(e.clientX - startPos[0], e.clientY - startPos[1]) > 30) stop();
  }, true);

  return {
    start,
    stop,
    get running() { return running; },
  };
})();
