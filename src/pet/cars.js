// Voitures du mode Course : chaque modèle est décrit par quelques cotes (silhouette de profil, couleur,
// détails) et dessiné en pixels à partir de ces cotes, en 40 x 16 pixels (plus fin que les animaux :
// 2 px écran par pixel). Le dessin regarde vers la droite, roues posées sur la rangée 15.
// Partagé entre le processus principal (liste, noms) et les pages qui dessinent (compagnon, garage).
(() => {
  const W = 40, H = 16;

  // Gabarits de silhouette. Hauteurs en rangées (0 = haut), positions en fraction de la longueur :
  //   tail/deck/roof/hood/nose : hauteur du haut de caisse à l'arrière, sur le coffre, au toit, sur le
  //   capot et au nez ; d/a/b/c : début de la lunette, du toit, fin du toit, base du pare-brise ;
  //   rw/fw : centres des roues ; r : rayon des roues ; sill : bas de caisse ; open : cabriolet.
  const TYPES = {
    vintage: { L: 34, tail: 8, deck: 8, hood: 7, nose: 8, d: 0.2, c: 0.5, rw: 0.2, fw: 0.82, r: 3.5, sill: 10, open: true, fenders: true, head: 0.36 },
    roadster: { L: 36, tail: 8, deck: 7, hood: 7, nose: 9, d: 0.24, c: 0.56, rw: 0.19, fw: 0.8, r: 3, sill: 12, open: true, head: 0.42 },
    gt: { L: 38, tail: 8, deck: 7, roof: 3, a: 0.36, b: 0.52, hood: 7, nose: 9, d: 0.2, c: 0.64, rw: 0.18, fw: 0.8, r: 3, sill: 12 },
    fastback: { L: 38, tail: 8, deck: 7, roof: 3, a: 0.34, b: 0.5, hood: 7, nose: 9, d: 0.06, c: 0.64, rw: 0.18, fw: 0.8, r: 3, sill: 12 },
    wedge: { L: 38, tail: 7, deck: 6, roof: 4, a: 0.36, b: 0.5, hood: 8, nose: 10, d: 0.22, c: 0.64, rw: 0.2, fw: 0.8, r: 3, sill: 12 },
    mid: { L: 38, tail: 7, deck: 6, roof: 4, a: 0.4, b: 0.56, hood: 8, nose: 10, d: 0.18, c: 0.7, rw: 0.2, fw: 0.8, r: 3, sill: 12 },
    box: { L: 38, tail: 7, deck: 7, roof: 3, a: 0.3, b: 0.56, hood: 7, nose: 8, d: 0.16, c: 0.66, rw: 0.18, fw: 0.8, r: 3, sill: 12 },
  };

  // [identifiant, nom, année, couleur, gabarit, retouches]. Retouches : stripe (bande), num (numéro de
  // course), wing ('duck' | 'wing' | 'tall'), cone (nez allongé), et toute cote du gabarit.
  const LIST = [
    ['porsche-911', 'Porsche 911', 1964, '#e8e2d0', 'fastback', { roof: 4, nose: 9, d: 0.04, a: 0.3, b: 0.46, c: 0.62, deck: 6 }],
    ['jaguar-etype', 'Jaguar E-Type', 1961, '#1f5a3a', 'fastback', { L: 40, roof: 4, a: 0.3, b: 0.42, c: 0.55, hood: 8, nose: 10, rw: 0.16 }],
    ['ac-cobra', 'AC Cobra', 1962, '#2a5bd7', 'roadster', { stripe: '#ffffff', L: 34, nose: 9, hood: 7 }],
    ['lotus-elise', 'Lotus Elise', 1996, '#f6c945', 'roadster', { L: 34, tail: 7, deck: 6, hood: 8, nose: 10, c: 0.62, head: 0.45 }],
    ['mgb', 'MGB', 1962, '#b3261e', 'roadster', { nose: 8 }],
    ['lotus-elan', 'Lotus Elan', 1962, '#f2f2ec', 'roadster', { L: 33, nose: 9 }],
    ['alfa-8c-2300', 'Alfa Romeo 8C 2300', 1931, '#a3121c', 'vintage', { L: 36 }],
    ['mazda-mx5', 'Mazda MX-5', 1989, '#c8102e', 'roadster', { L: 34, hood: 8, nose: 9 }],
    ['ferrari-dino', 'Ferrari Dino 246 GT', 1969, '#d4141f', 'mid', { roof: 4, hood: 8, nose: 9, tail: 7, deck: 7 }],
    ['porsche-cayman', 'Porsche Cayman', 2005, '#a7adb4', 'mid', { deck: 6, nose: 9 }],
    ['alfa-spider', 'Alfa Romeo Spider', 1966, '#c1121f', 'roadster', { L: 38, tail: 8, nose: 9 }],
    ['healey-100', 'Austin-Healey 100', 1953, '#3d6fa8', 'roadster', { stripe: '#e8e2d0', L: 36 }],
    ['frazer-nash', 'Frazer Nash Le Mans Replica', 1948, '#3a5f8a', 'vintage', { num: 7 }],
    ['lotus-seven', 'Lotus Seven', 1957, '#2f7d32', 'vintage', { L: 30, hood: 8, nose: 8 }],
    ['honda-s2000', 'Honda S2000', 1999, '#f2f2f2', 'roadster', { L: 36, hood: 8, nose: 10, tail: 7, deck: 7 }],
    ['alpine-a110-2017', 'Alpine A110', 2017, '#1e5bc6', 'mid', { L: 36, roof: 4, nose: 9 }],
    ['jaguar-xkss', 'Jaguar XKSS', 1957, '#1f4d34', 'roadster', { hood: 7, nose: 9, L: 36, rw: 0.17 }],
    ['toyota-mr2', 'Toyota MR2', 1984, '#e23b2e', 'wedge', { L: 36, roof: 4, a: 0.38, b: 0.56, c: 0.66 }],
    ['alpine-berlinette', 'Alpine A110 Berlinette', 1961, '#1f5fd1', 'fastback', { L: 34, roof: 4, d: 0.05, a: 0.36, b: 0.5, c: 0.64, nose: 9 }],
    ['healey-sprite', 'Austin-Healey Sprite', 1958, '#9cc9a0', 'roadster', { L: 31, nose: 8 }],
    ['ferrari-250-gto', 'Ferrari 250 GTO', 1962, '#c8102e', 'fastback', { L: 38, roof: 4, a: 0.36, b: 0.48, c: 0.6, nose: 10, num: 3 }],
    ['alfa-8c-2900', 'Alfa Romeo 8C 2900', 1936, '#8c1018', 'vintage', { L: 38, deck: 7, tail: 7 }],
    ['skyline-gtr', 'Nissan Skyline GT-R', 1969, '#e9e6dd', 'box', { wing: 'duck' }],
    ['mercedes-300sl', 'Mercedes-Benz 300 SL', 1954, '#c9ccd1', 'gt', { roof: 4, a: 0.38, b: 0.52, c: 0.62, nose: 9 }],
    ['datsun-240z', 'Datsun 240Z', 1969, '#d97a1e', 'fastback', { roof: 4, d: 0.08, a: 0.38, b: 0.5, c: 0.62 }],
    ['lamborghini-miura', 'Lamborghini Miura', 1966, '#f2a900', 'mid', { roof: 5, a: 0.36, b: 0.52, deck: 6, hood: 8, nose: 10 }],
    ['ford-gt40', 'Ford GT40', 1964, '#7ab0d9', 'mid', { roof: 5, a: 0.38, b: 0.54, stripe: '#f08a24', num: 6 }],
    ['corvette-stingray', 'Chevrolet Corvette Sting Ray', 1963, '#b3121f', 'fastback', { L: 38, roof: 4, d: 0.04, nose: 9 }],
    ['porsche-356', 'Porsche 356', 1948, '#cfc4a5', 'fastback', { L: 34, roof: 3, d: 0.06, a: 0.32, b: 0.5, c: 0.64, hood: 7, nose: 9 }],
    ['porsche-550', 'Porsche 550 Spyder', 1953, '#d8d8d8', 'roadster', { L: 33, num: 130, stripe: '#d4141f', hood: 8 }],
    ['jaguar-xk120', 'Jaguar XK120', 1948, '#e8dfc8', 'roadster', { L: 37, hood: 7, nose: 9, rw: 0.17 }],
    ['aston-db5', 'Aston Martin DB5', 1963, '#b9bec4', 'gt', { roof: 3, nose: 9 }],
    ['ferrari-f40', 'Ferrari F40', 1987, '#d4141f', 'wedge', { wing: 'wing', roof: 4 }],
    ['mclaren-f1', 'McLaren F1', 1992, '#c58a2c', 'mid', { roof: 4, a: 0.42, b: 0.56 }],
    ['lamborghini-countach', 'Lamborghini Countach', 1974, '#f6d32d', 'wedge', { roof: 4, a: 0.34, b: 0.48, c: 0.58, nose: 10, wing: 'wing' }],
    ['lancia-stratos', 'Lancia Stratos', 1973, '#2a6bd1', 'wedge', { L: 32, roof: 3, a: 0.32, b: 0.52, c: 0.6, stripe: '#f6c945', wing: 'duck' }],
    ['toyota-2000gt', 'Toyota 2000GT', 1967, '#f2f2ec', 'fastback', { L: 38, roof: 4, nose: 10, hood: 8, c: 0.62 }],
    ['honda-nsx', 'Honda NSX', 1990, '#c8102e', 'mid', { roof: 4, a: 0.38, b: 0.58, c: 0.68 }],
    ['mazda-rx7', 'Mazda RX-7', 1992, '#8d1b2a', 'fastback', { roof: 4, d: 0.08, nose: 10, hood: 8, wing: 'duck' }],
    ['bmw-m1', 'BMW M1', 1978, '#f0efe9', 'wedge', { stripe: '#2a6bd1' }],
    ['ferrari-daytona', 'Ferrari 365 GTB/4 Daytona', 1968, '#c8102e', 'fastback', { L: 40, roof: 4, a: 0.32, b: 0.44, c: 0.56, nose: 10 }],
    ['lotus-esprit', 'Lotus Esprit', 1976, '#f2f2f2', 'wedge', { L: 37, roof: 4, nose: 10 }],
    ['dodge-viper', 'Dodge Viper', 1992, '#c8102e', 'roadster', { L: 40, stripe: '#ffffff', hood: 7, nose: 9, c: 0.52, head: 0.38 }],
    ['triumph-tr6', 'Triumph TR6', 1968, '#2d5c9e', 'roadster', { tail: 7, deck: 7, nose: 8 }],
    ['bmw-507', 'BMW 507', 1956, '#e9e6dd', 'roadster', { L: 37, nose: 9 }],
    ['bugatti-35', 'Bugatti Type 35', 1924, '#1f4fa0', 'vintage', { L: 32, num: 4 }],
    ['porsche-959', 'Porsche 959', 1986, '#f2f2f2', 'fastback', { roof: 4, d: 0.04, a: 0.32, b: 0.46, nose: 9, wing: 'duck' }],
    ['fiat-x19', 'Fiat X1/9', 1972, '#e86f1c', 'wedge', { L: 33, roof: 4, a: 0.38, b: 0.56 }],
    ['plymouth-superbird', 'Plymouth Superbird', 1970, '#3d8fd6', 'gt', { L: 40, roof: 3, a: 0.34, b: 0.5, cone: true, wing: 'tall' }],
    ['porsche-carrera-gt', 'Porsche Carrera GT', 2003, '#9fa6ad', 'mid', { roof: 4, a: 0.4, b: 0.56, wing: 'duck' }],
  ];

  const CARS = LIST.map(([id, name, year, color, type, o]) => ({ id, name, year, color, type, ...TYPES[type], ...o }));

  // Teintes dérivées de la couleur de carrosserie.
  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    const c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k)));
    return '#' + c.map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
  }

  // Silhouette : hauteur du haut de caisse pour chaque colonne, par interpolation entre les points clés.
  function profile(c) {
    const pts = c.open
      ? [[0, c.tail], [c.d, c.deck], [c.c, c.hood], [1, c.nose]]
      : [[0, c.tail], [c.d, c.deck], [c.a, c.roof], [c.b, c.roof], [c.c, c.hood], [1, c.nose]];
    return x => {
      for (let i = 1; i < pts.length; i++) {
        if (x <= pts[i][0]) {
          const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
          return Math.round(y0 + (y1 - y0) * ((x - x0) / Math.max(1e-6, x1 - x0)));
        }
      }
      return pts[pts.length - 1][1];
    };
  }

  // Grille de la carrosserie (sans les roues, dessinées à part pour pouvoir tourner).
  //   o contour, L reflet, C couleur, D ombre, G vitre, g reflet de vitre, Y phare, R feu arrière,
  //   S bande ou détail, w blanc, k noir, h tête du pilote.
  function build(c) {
    const grid = Array.from({ length: H }, () => Array(W).fill('.'));
    const x0 = Math.floor((W - c.L) / 2);
    const top = profile(c);
    const nx = i => i / (c.L - 1);
    const wheels = [c.rw, c.fw].map(f => ({ x: x0 + f * (c.L - 1), y: H - 0.5 - c.r }));
    for (let i = 0; i < c.L; i++) {
      const x = x0 + i;
      const t = top(nx(i));
      let bottom = c.sill;
      if (i === 0 || i === c.L - 1) bottom = c.sill - 1;
      if (c.cone && nx(i) > 0.9) bottom = c.sill - 1; // nez profilé
      for (let y = t; y <= bottom; y++) grid[y][x] = 'C';
    }
    // Ailes séparées des voitures d'avant-guerre, au-dessus des roues.
    if (c.fenders) {
      for (const wh of wheels) {
        for (let x = Math.floor(wh.x - c.r - 1); x <= Math.ceil(wh.x + c.r + 1); x++) {
          const dy = Math.sqrt(Math.max(0, (c.r + 1.2) ** 2 - (x - wh.x) ** 2));
          const y = Math.round(wh.y - dy);
          if (grid[y] && x >= 0 && x < W) { grid[y][x] = 'C'; if (grid[y + 1]) grid[y + 1][x] = grid[y + 1][x] === '.' ? 'D' : grid[y + 1][x]; }
        }
      }
    }
    // Passages de roue.
    for (const wh of wheels) {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (grid[y][x] !== '.' && Math.hypot(x + 0.5 - wh.x - 0.5, y + 0.5 - wh.y) < c.r + 1.1 && y > wh.y - c.r - 0.5) grid[y][x] = '.';
      }
    }
    // Vitres : sous le toit, au-dessus de la ligne de caisse.
    if (!c.open) {
      const belt = Math.min(c.hood, c.deck) + 1;
      const xs = [];
      for (let i = 0; i < c.L; i++) if (top(nx(i)) < belt - 1) xs.push(i);
      const mid = xs.length ? xs[Math.floor(xs.length * 0.55)] : -1;
      for (const i of xs) {
        const x = x0 + i, t = top(nx(i));
        if (i === xs[0] || i === xs[xs.length - 1]) continue;
        for (let y = t + 1; y < belt; y++) grid[y][x] = i === mid ? 'D' : (x + y) % 6 === 0 ? 'g' : 'G';
      }
    } else {
      // Pare-brise incliné et pilote.
      const wx = x0 + Math.round(nx(0) + c.c * (c.L - 1)) - 1;
      const by = top(c.c);
      for (let k = 1; k <= (c.fenders ? 2 : 3); k++) if (grid[by - k]) grid[by - k][wx - Math.floor(k / 2)] = 'G';
      const hx = x0 + Math.round(c.head * (c.L - 1));
      const hy = top(c.head);
      for (const [dx, dy] of [[0, -1], [1, -1], [0, -2], [1, -2]]) if (grid[hy + dy]) grid[hy + dy][hx + dx] = dy === -2 ? 'h' : 'k';
    }
    // Bande, numéro de course, porte, feux.
    const doorX = Math.round((wheels[0].x + wheels[1].x) / 2) + (c.open ? -3 : 0);
    if (c.stripe) {
      const sy = Math.min(c.sill - 2, Math.max(c.hood, c.deck) + 1);
      for (let x = 0; x < W; x++) if (grid[sy][x] === 'C') grid[sy][x] = 'S';
    }
    for (let y = Math.min(c.hood, c.deck) + 1; y < c.sill; y++) if (grid[y][doorX] === 'C') grid[y][doorX] = 'D';
    if (c.num) {
      const cy = Math.round((Math.max(c.hood, c.deck) + c.sill) / 2), cx = doorX + 3;
      for (const [dx, dy] of [[0, -1], [-1, 0], [0, 0], [1, 0], [0, 1], [1, -1], [1, 1], [2, 0]]) if (grid[cy + dy] && grid[cy + dy][cx + dx] !== '.') grid[cy + dy][cx + dx] = dx === 0 && dy === 0 ? 'k' : 'w';
    }
    const nose = x0 + c.L - 1, tail = x0;
    const hy = top(1) + 1, ty = top(0) + 1;
    if (grid[hy]) grid[hy][nose] = 'Y';
    if (grid[ty]) grid[ty][tail] = 'R';
    // Ailerons.
    if (c.wing === 'duck') { const y = top(0) - 1; if (grid[y]) { grid[y][tail] = 'C'; grid[y][tail + 1] = 'C'; } }
    if (c.wing === 'wing' || c.wing === 'tall') {
      const hgt = c.wing === 'tall' ? 5 : 2;
      const y = top(0.06) - hgt;
      for (let k = 1; k < hgt; k++) { grid[y + k][tail + 2] = 'D'; }
      for (let x = tail; x <= tail + 6; x++) grid[y][x] = 'C';
    }
    // Contour : tout pixel de carrosserie au bord de la silhouette.
    const solid = (x, y) => grid[y] && grid[y][x] && grid[y][x] !== '.';
    const out = grid.map(r => r.slice());
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!solid(x, y) || !'CSD'.includes(grid[y][x])) continue;
      if (!solid(x - 1, y) || !solid(x + 1, y) || !solid(x, y - 1) || !solid(x, y + 1)) out[y][x] = 'o';
      else if (!solid(x, y - 2) && grid[y][x] === 'C') out[y][x] = 'L';
      else if ((!solid(x, y + 2) || y >= c.sill - 1) && grid[y][x] === 'C') out[y][x] = 'D';
    }
    const pal = {
      o: shade(c.color, -0.62), L: shade(c.color, 0.35), C: c.color, D: shade(c.color, -0.28),
      S: c.stripe || '#ffffff', G: '#9fc6e6', g: '#e6f4ff', Y: '#fff3b0', R: '#e8455d', w: '#ffffff', k: '#1b1b1f', h: '#f2c9a0',
    };
    return { rows: out.map(r => r.join('')), pal, wheels, r: c.r };
  }

  const cache = new Map();
  const sprite = id => {
    if (!cache.has(id)) cache.set(id, build(CARS.find(c => c.id === id) || CARS[0]));
    return cache.get(id);
  };

  // Dessine une voiture : ox, oy = coin haut-gauche de la grille 40 x 16 ; spin = angle des roues.
  function draw(ctx, id, ox, oy, s, { flip = false, spin = 0 } = {}) {
    const sp = sprite(id);
    const X = x => flip ? W - 1 - x : x;
    sp.rows.forEach((r, y) => { for (let x = 0; x < W; x++) { const ch = r[x]; if (ch === '.') continue; ctx.fillStyle = sp.pal[ch]; ctx.fillRect(ox + X(x) * s, oy + y * s, s, s); } });
    for (const wh of sp.wheels) {
      const cx = flip ? W - (wh.x + 0.5) : wh.x + 0.5, cy = wh.y;
      for (let y = Math.floor(cy - sp.r - 1); y <= cy + sp.r + 1; y++) for (let x = Math.floor(cx - sp.r - 1); x <= cx + sp.r + 1; x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy);
        if (d > sp.r + 0.35) continue;
        let col = '#1b1b1f';
        if (d < sp.r - 1.3) {
          // Jante avec deux rayons qui tournent.
          const a = Math.atan2(dy, dx) - spin;
          const spoke = Math.abs(Math.sin(a * 2)) < 0.4;
          col = d < 0.8 ? '#3d444c' : spoke ? '#dfe4ea' : '#7d8690';
        }
        ctx.fillStyle = col;
        ctx.fillRect(ox + x * s, oy + y * s, s, s);
      }
    }
  }

  const DATA = { CARS: CARS.map(({ id, name, year, color }) => ({ id, name, year, color })), W, H, draw, sprite };
  if (typeof module !== 'undefined') module.exports = DATA;
  else window.RACE_CARS = DATA;
})();
