// Moteur audio : toutes les ambiances sont synthétisées en temps réel avec la Web Audio API,
// aucun fichier son n'est nécessaire. Les sons importés par l'utilisateur sont lus en boucle.

// file : enregistrement dans src/sounds (CC0) ; sans file : son synthétisé par GEN.
// scene : animation de l'écran de veille associée.
const SOUNDS = [
  // Bibliothèque de base
  { id: 'rain', name: 'Pluie', emoji: '🌧️', colors: ['#4a7fbf', '#1b2a49'], builtin: true, scene: 'rain', file: 'rain.wav', credit: 'Rain heavy 1 (rural) by jmbphilmes -- https://freesound.org/s/200270/' },
  { id: 'thunder', name: 'Orage', emoji: '⛈️', colors: ['#6c6fa8', '#1d1f3b'], builtin: true, scene: 'storm', file: 'thunder.mp3', credit: 'thunder by hifijohn -- https://freesound.org/s/242735/' },
  { id: 'beach', name: 'Plage', emoji: '🏖️', colors: ['#1fa2c9', '#0b3d5c'], builtin: true, scene: 'waves', file: 'beach.wav', credit: 'Sea Barcelona Beach Traffic Voices.wav by jordir -- https://freesound.org/s/360578/' },
  { id: 'wind', name: 'Vent', emoji: '🍃', colors: ['#7fb77e', '#2f5d50'], builtin: true, file: 'wind.wav', credit: 'wind-noise.wav by jorge0000 -- https://freesound.org/s/361053/' },
  { id: 'fireplace', name: 'Feu de cheminée', emoji: '🔥', colors: ['#f08a24', '#7a1f0e'], builtin: true, scene: 'fire', file: 'fireplace.wav', credit: '13_Fire in fireplace.wav by 16FThumaF -- https://freesound.org/s/499032/' },
  { id: 'cafe', name: 'Café', emoji: '☕', colors: ['#b08463', '#3e2a1e'], builtin: true, file: 'coffeeshop.mp3', credit: 'coffee-shop-ambience_remastered by C_Rogers -- https://freesound.org/s/453074/' },
  { id: 'birds', name: 'Oiseaux', emoji: '🐦', colors: ['#9ccc65', '#33691e'], builtin: true, file: 'birds.wav', credit: 'Spring Birds Raw (New Jersey) by hargissssound -- https://freesound.org/s/345851/' },
  { id: 'creek', name: 'Ruisseau', emoji: '💧', colors: ['#4fc3c7', '#1d5c63'], builtin: true, scene: 'waves', file: 'creek.wav', credit: 'Burbling Brook by hargissssound -- https://freesound.org/s/324591/' },
  { id: 'fan', name: 'Ventilateur', emoji: '🌀', colors: ['#8e9eab', '#3b4a57'], builtin: true },
  { id: 'white', name: 'Bruit blanc', emoji: '⚪', colors: ['#b8c6cc', '#55707d'], builtin: true },
  { id: 'pink', name: 'Bruit rose', emoji: '🌸', colors: ['#f29bbd', '#8e3b5f'], builtin: true },
  { id: 'brown', name: 'Bruit brun', emoji: '🟤', colors: ['#a1887f', '#4e342e'], builtin: true, file: 'whitenoise.wav', credit: 'Brown Noise by theundecided -- https://freesound.org/s/165056/' },
  // Catalogue
  { id: 'rainforest', name: 'Forêt tropicale', emoji: '🌴', colors: ['#3f9b5a', '#0f3320'], catalog: true, scene: 'rain', file: 'Rainforest.mp3', desc: 'Pluie tiède sur la canopée.', credit: 'Rain Sound and Rainforest.mp3 by INNORECORDS -- https://freesound.org/s/457447/' },
  { id: 'waterfall', name: 'Rivière', emoji: '🏞️', colors: ['#5fa8d3', '#1b4965'], catalog: true, scene: 'waves', file: 'waterfall.wav', desc: 'Une rivière islandaise en pleine nature.', credit: 'River in Icelandic nature by askeseverin -- https://freesound.org/s/376202/' },
  { id: 'underwater', name: 'Sous l\'eau', emoji: '🐋', colors: ['#1565c0', '#021027'], catalog: true, scene: 'underwater', file: 'underwater.wav', desc: 'Le silence feutré des profondeurs.', credit: 'Underwater Ambience by Kinoton -- https://freesound.org/s/393819/' },
  { id: 'city', name: 'Parc en ville', emoji: '🏙️', colors: ['#78909c', '#263238'], catalog: true, file: 'citystreet.wav', desc: 'Passants, voitures au loin, vie urbaine.', credit: 'City park_1 by o_ciz -- https://freesound.org/s/475513/' },
  // Freesound (catalogue)
  { id: 'ocean', name: "Océan", emoji: '🌊', colors: ['#1e88e5', '#0d2b52'], catalog: true, scene: 'waves', file: 'ocean.mp3', desc: "De grosses vagues qui se brisent sur la côte.", credit: "Big waves hit land.wav by straget -- https://freesound.org/s/412308/" },
  { id: 'crickets', name: "Grillons", emoji: '🦗', colors: ['#5c6bc0', '#151a3d'], catalog: true, scene: 'night', file: 'crickets.mp3', desc: "Nuit d'été sous le porche.", credit: "Night Crickets Back Porch.aiff by hdfreema -- https://freesound.org/s/333221/" },
  { id: 'frogs', name: "Grenouilles", emoji: '🐸', colors: ['#66bb6a', '#163a1c'], catalog: true, scene: 'night', file: 'frogs.mp3', desc: "Grenouilles et grillons au bord de l'étang.", credit: "FrogsAndCrickets_ExcerptB_JMA_24Bit_48k.wav by greysound -- https://freesound.org/s/32655/" },
  { id: 'rain-window', name: "Pluie à la fenêtre", emoji: '🪟', colors: ['#607d8b', '#1c2a33'], catalog: true, scene: 'storm', file: 'rain-window.mp3', desc: "Pluie et tonnerre lointain derrière une fenêtre entrouverte.", credit: "Distant Thunder and Rain from Half Open Window 1.aif by RutgerMuller -- https://freesound.org/s/158692/" },
  { id: 'rain-tent', name: "Pluie sur la tente", emoji: '⛺', colors: ['#8d6e63', '#2e1f1a'], catalog: true, scene: 'rain', file: 'rain-tent.mp3', desc: "Gouttes sur la toile, bien au sec.", credit: "In the Tent - Rain by pulswelle -- https://freesound.org/s/251233/" },
  { id: 'train', name: "Train", emoji: '🚆', colors: ['#90a4ae', '#263238'], catalog: true, file: 'train.mp3', desc: "L'intérieur d'un train à vapeur en marche.", credit: "Steam Train Interior.MP3 by allh -- https://freesound.org/s/133099/" },
  { id: 'airplane', name: "Avion", emoji: '✈️', colors: ['#81d4fa', '#1f4e6b'], catalog: true, file: 'airplane.mp3', desc: "Le ronronnement d'une cabine en vol.", credit: "Plane Interior by Vurca -- https://freesound.org/s/341591/" },
  { id: 'cat-purr', name: "Chat qui ronronne", emoji: '🐈', colors: ['#ffb74d', '#6d3b0c'], catalog: true, file: 'cat-purr.mp3', desc: "Un chat paisible blotti contre vous.", credit: "Cat purr.wav by Trautwein -- https://freesound.org/s/260881/" },
  { id: 'clock', name: "Horloge", emoji: '🕰️', colors: ['#bcaaa4', '#4e342e'], catalog: true, file: 'clock.mp3', desc: "Le tic-tac régulier d'un réveil mécanique.", credit: "Mechanical alarm clock is ticking (SLAVA).wav by ST303 -- https://freesound.org/s/171043/" },
  { id: 'keyboard', name: "Clavier", emoji: '⌨️', colors: ['#9e9e9e', '#2b2b2b'], catalog: true, file: 'keyboard.mp3', desc: "Frappe sur un clavier mécanique.", credit: "Mechanical Keyboard Typing (Treble Version) by stu556 -- https://freesound.org/s/450282/" },
  { id: 'wind-chimes', name: "Carillon", emoji: '🎐', colors: ['#80cbc4', '#1d4e4a'], catalog: true, file: 'wind-chimes.mp3', desc: "Un carillon qui tinte au gré du vent.", credit: "Wind chimes 1 by giddster -- https://freesound.org/s/437337/" },
  { id: 'campfire', name: "Feu de camp", emoji: '🏕️', colors: ['#ff7043', '#3e1408'], catalog: true, scene: 'fire', file: 'campfire.mp3', desc: "Crépitements sous les étoiles.", credit: "1103campfire1.wav by moxobna -- https://freesound.org/s/62487/" },
  { id: 'night-forest', name: "Forêt la nuit", emoji: '🦉', colors: ['#3949ab', '#0b0f2b'], catalog: true, scene: 'night', file: 'night-forest.mp3', desc: "Les bruits mystérieux de la forêt nocturne.", credit: "Forest at night, crickets, cicadas and insects in the Sian Ka'an Biosphere Reserve by felix.blume -- https://freesound.org/s/328293/" },
  { id: 'blizzard', name: "Blizzard", emoji: '❄️', colors: ['#b3e5fc', '#37566b'], catalog: true, scene: 'snow', file: 'blizzard.mp3', desc: "Vent glacial et tempête de neige.", credit: "Howling winter storm ambient sounds by DBlover -- https://freesound.org/s/505999/" },
  { id: 'washing-machine', name: "Machine à laver", emoji: '🧺', colors: ['#cfd8dc', '#455a64'], catalog: true, file: 'washing-machine.mp3', desc: "Le doux ronron du tambour.", credit: "washing machine, centrifugue by ohrpilot -- https://freesound.org/s/182011/" },
];

const Engine = (() => {
  let ctx = null;
  let master = null;
  let masterVol = 0.8;
  const noise = {};
  const voices = new Map();
  const customLoaders = new Map();
  const customBuffers = new Map();
  const XFADE = 4096;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    ctx = new AudioContext();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.ratio.value = 4;
    master = ctx.createGain();
    master.gain.value = masterVol;
    master.connect(comp).connect(ctx.destination);
    buildNoise();
  }

  function buildNoise() {
    const sr = ctx.sampleRate;
    const n = sr * 10;
    const w = ctx.createBuffer(2, n, sr), p = ctx.createBuffer(2, n, sr), b = ctx.createBuffer(2, n, sr);
    for (let ch = 0; ch < 2; ch++) {
      const W = w.getChannelData(ch), P = p.getChannelData(ch), B = b.getChannelData(ch);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
      for (let i = 0; i < n; i++) {
        const x = Math.random() * 2 - 1;
        W[i] = x;
        b0 = 0.99886 * b0 + x * 0.0555179; b1 = 0.99332 * b1 + x * 0.0750759;
        b2 = 0.969 * b2 + x * 0.153852; b3 = 0.8665 * b3 + x * 0.3104856;
        b4 = 0.55 * b4 + x * 0.5329522; b5 = -0.7616 * b5 - x * 0.016898;
        P[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + x * 0.5362) * 0.11;
        b6 = x * 0.115926;
        last = (last + 0.02 * x) / 1.02;
        B[i] = last * 3.5;
      }
      // Fondu enchaîné pour une boucle sans clic : la boucle va de XFADE à n.
      for (const D of [W, P, B]) {
        for (let i = 0; i < XFADE; i++) {
          const t = i / XFADE;
          D[n - XFADE + i] = D[n - XFADE + i] * (1 - t) + D[i] * t;
        }
      }
    }
    noise.white = w; noise.pink = p; noise.brown = b;
  }

  function makeVoice() {
    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(master);
    const v = { out, nodes: [], timers: [], stopped: false };
    const rand = (a, b) => a + Math.random() * (b - a);
    const h = {
      ctx, out, rand,
      noise(type) {
        const s = ctx.createBufferSource();
        s.buffer = noise[type];
        s.loop = true;
        s.loopStart = XFADE / ctx.sampleRate;
        s.loopEnd = s.buffer.duration;
        s.start(0, s.loopStart + Math.random() * (s.buffer.duration - s.loopStart - 0.1));
        v.nodes.push(s);
        return s;
      },
      filter(type, freq, q = 0.7) {
        const f = ctx.createBiquadFilter();
        f.type = type; f.frequency.value = freq; f.Q.value = q;
        return f;
      },
      gain(g) {
        const n = ctx.createGain();
        n.gain.value = g;
        return n;
      },
      pan(p) {
        const n = ctx.createStereoPanner();
        n.pan.value = p;
        return n;
      },
      osc(type, freq) {
        const o = ctx.createOscillator();
        o.type = type; o.frequency.value = freq;
        o.start();
        v.nodes.push(o);
        return o;
      },
      lfo(freq, depth, param) {
        const o = h.osc('sine', freq);
        o.connect(h.gain(depth)).connect(param);
        return o;
      },
      chain(...nodes) {
        for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
        return nodes[nodes.length - 1];
      },
      // Appelle fn à intervalles aléatoires entre min et max millisecondes.
      every(min, max, fn) {
        const rec = { t: 0 };
        const loop = () => {
          if (v.stopped) return;
          fn(ctx.currentTime + 0.03);
          rec.t = setTimeout(loop, rand(min, max));
        };
        rec.t = setTimeout(loop, rand(0, max));
        v.timers.push(rec);
      },
      burst(t, dur, { type = 'white', filter = 'bandpass', freq = 2000, q = 1, peak = 0.2, attack = 0.002, dest = out } = {}) {
        const s = ctx.createBufferSource();
        s.buffer = noise[type];
        s.loop = true;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(peak, t + attack);
        g.gain.exponentialRampToValueAtTime(0.0001, t + attack + dur);
        s.connect(h.filter(filter, freq, q)).connect(g).connect(dest);
        s.start(t, Math.random() * 8);
        s.stop(t + attack + dur + 0.05);
      },
      tone(t, f0, f1, dur, peak, { type = 'sine', dest = out } = {}) {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.setValueAtTime(f0, t);
        o.frequency.exponentialRampToValueAtTime(f1, t + dur);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(peak, t + Math.min(0.01, dur / 3));
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g).connect(dest);
        o.start(t);
        o.stop(t + dur + 0.05);
      },
    };
    return { v, h };
  }

  const GEN = {
    white(h) { h.chain(h.noise('white'), h.filter('lowpass', 10000), h.gain(0.22), h.out); },
    pink(h) { h.chain(h.noise('pink'), h.gain(0.7), h.out); },
    brown(h) { h.chain(h.noise('brown'), h.gain(0.9), h.out); },

    fan(h) {
      const g = h.gain(0.9);
      h.chain(h.noise('brown'), h.filter('lowpass', 900), g, h.out);
      h.lfo(7.5, 0.06, g.gain);
      h.chain(h.noise('pink'), h.filter('bandpass', 250, 2), h.gain(0.25), h.out);
      h.chain(h.osc('sine', 100), h.gain(0.015), h.out);
    },
  };

  // Courbes à puissance constante pour des fondus enchaînés sans creux de volume.
  const CURVE_N = 64;
  const fadeIn = new Float32Array(CURVE_N).map((_, i) => Math.sin((i / (CURVE_N - 1)) * Math.PI / 2));
  const fadeOut = new Float32Array(CURVE_N).map((_, i) => Math.cos((i / (CURVE_N - 1)) * Math.PI / 2));

  // Lit un enregistrement en boucle en superposant la fin et le début pour masquer la jointure.
  function loopBuffer(v, h, buf) {
    const X = Math.min(4, buf.duration / 4);
    const step = buf.duration - X;
    let next = ctx.currentTime + 0.05;
    let first = true;
    const rec = { t: 0 };
    const schedule = () => {
      if (v.stopped) return;
      while (next < ctx.currentTime + 8) {
        const s = ctx.createBufferSource();
        s.buffer = buf;
        const g = ctx.createGain();
        if (first) g.gain.setValueAtTime(1, next);
        else g.gain.setValueCurveAtTime(fadeIn, next, X);
        g.gain.setValueCurveAtTime(fadeOut, next + step, X);
        s.connect(g).connect(h.out);
        s.start(next);
        s.stop(next + buf.duration + 0.05);
        v.nodes.push(s);
        if (v.nodes.length > 6) v.nodes.shift();
        next += step;
        first = false;
      }
      rec.t = setTimeout(schedule, 2000);
    };
    schedule();
    v.timers.push(rec);
  }

  async function loadBuffer(key, loader) {
    let buf = customBuffers.get(key);
    if (!buf) {
      buf = await ctx.decodeAudioData(await loader());
      customBuffers.set(key, buf);
    }
    return buf;
  }

  async function startFile(v, h, key, loader) {
    const buf = await loadBuffer(key, loader);
    if (!v.stopped) loopBuffer(v, h, buf);
  }

  // Joue un son court une seule fois (cloche de fin de session, etc.).
  async function oneShot(file, vol = 0.6) {
    ensure();
    const buf = await loadBuffer('fx:' + file, () => fileLoader(file));
    const s = ctx.createBufferSource();
    const g = ctx.createGain();
    g.gain.value = vol;
    s.buffer = buf;
    s.connect(g).connect(ctx.destination);
    s.start();
  }

  let fileLoader = async () => { throw new Error('Aucun chargeur de fichiers'); };

  const curve = vol => vol * vol;

  function setParam(param, value) {
    const now = ctx.currentTime;
    if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(now);
    else param.cancelScheduledValues(now);
    param.setTargetAtTime(value, now, 0.08);
  }

  function start(id, vol) {
    ensure();
    if (voices.has(id)) return;
    const { v, h } = makeVoice();
    voices.set(id, v);
    const def = SOUNDS.find(s => s.id === id);
    if (def && def.file) startFile(v, h, def.file, () => fileLoader(def.file)).catch(err => console.error('Son illisible', err));
    else if (GEN[id]) GEN[id](h);
    else if (customLoaders.has(id)) startFile(v, h, id, customLoaders.get(id)).catch(err => console.error('Son importé illisible', err));
    const now = ctx.currentTime;
    v.out.gain.setValueAtTime(0, now);
    v.out.gain.linearRampToValueAtTime(curve(vol), now + 1.5);
  }

  function stop(id) {
    const v = voices.get(id);
    if (!v) return;
    voices.delete(id);
    v.stopped = true;
    v.timers.forEach(r => clearTimeout(r.t));
    setParam(v.out.gain, 0);
    setTimeout(() => {
      v.nodes.forEach(n => { try { n.stop(); } catch { /* déjà arrêté */ } });
      v.out.disconnect();
    }, 1000);
  }

  return {
    start,
    stop,
    stopAll() { [...voices.keys()].forEach(stop); },
    setVolume(id, vol) {
      const v = voices.get(id);
      if (v) setParam(v.out.gain, curve(vol));
    },
    setMaster(vol) {
      masterVol = vol;
      if (master) setParam(master.gain, vol);
    },
    oneShot,
    setFileLoader(fn) { fileLoader = fn; },
    // Précharge un fichier pour que le démarrage soit immédiat.
    preload(id) {
      const def = SOUNDS.find(s => s.id === id);
      if (!def || !def.file) return;
      ensure();
      loadBuffer(def.file, () => fileLoader(def.file)).catch(() => {});
    },
    registerCustom(id, loader) { customLoaders.set(id, loader); },
    forgetCustom(id) { customLoaders.delete(id); customBuffers.delete(id); },
  };
})();
