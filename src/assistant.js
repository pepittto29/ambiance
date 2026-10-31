// Page « Compagnon » : parler à son compagnon. Trois étages, du plus sûr au plus libre :
//   1. les commandes claires (« mets de la pluie », « mode focus », « ajoute la tâche… ») sont
//      reconnues directement, avec ou sans IA, et toujours de la même façon ;
//   2. sans IA, des réponses toutes faites pour bavarder un peu ;
//   3. avec l'IA locale (ai.js), le compagnon comprend les phrases libres, discute avec sa
//      personnalité et peut proposer une action, toujours vérifiée avant d'être exécutée.
// Le compagnon retient le prénom et quelques goûts de l'utilisateur (dans ce PC seulement).
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const api = window.ambiance;
  if (!api || !api.ai) return;
  const { toast, soundById } = App;

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  // Minuscules sans accents ni ponctuation superflue : « Mets de l'Orage ! » → « mets de l orage ».
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[’']/g, ' ').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const pick = list => list[Math.floor(Math.random() * list.length)];
  const has = (text, words) => words.some(w => new RegExp(`(^| )${w}( |$)`).test(text));

  // ---------- Mémoire ----------
  const MEM_KEY = 'ambiance.compagnon';
  let mem = { history: [], userName: '', likes: [] };
  try { mem = { ...mem, ...JSON.parse(localStorage.getItem(MEM_KEY) || '{}') }; } catch { /* mémoire vide */ }
  const saveMem = () => {
    mem.history = mem.history.slice(-40);
    mem.likes = mem.likes.slice(-12);
    try { localStorage.setItem(MEM_KEY, JSON.stringify(mem)); } catch { /* stockage indisponible */ }
  };

  // Ce que l'utilisateur dit de lui : prénom et goûts.
  function learn(raw) {
    const name = /\b(?:je m'?\s?appelle|moi c'?est|mon (?:pr[ée]nom|nom) est)\s+([A-Za-zÀ-ÿ-]{2,20})/i.exec(raw);
    if (name) { mem.userName = name[1][0].toUpperCase() + name[1].slice(1); saveMem(); return 'name'; }
    const like = /\bj'?\s?(aime|adore|d[ée]teste)\s+(.{3,60}?)[.!?]?$/i.exec(raw);
    if (like) {
      const fact = `${like[1].toLowerCase().startsWith('d') ? 'déteste' : 'aime'} ${like[2].trim()}`;
      mem.likes = [...mem.likes.filter(f => f !== fact), fact];
      saveMem();
      return 'like';
    }
    return null;
  }

  // ---------- Contexte ----------
  let config = { petAnimal: 'souris', petName: 'Pixel', pet: true };
  let modesState = { modes: [], active: 'normal' };
  let aiState = null;
  const petName = () => config.petName || 'Pixel';

  const ANIMALS = {
    souris: { a: 'une petite souris', cri: 'couic', snack: 'un pixel de fromage' },
    hamster: { a: 'un petit hamster', cri: 'pouic', snack: 'une graine de tournesol' },
    lapin: { a: 'un petit lapin', cri: 'grignote grignote', snack: 'une carotte croquante' },
    chat: { a: 'un petit chat', cri: 'miaou', snack: 'trois croquettes' },
  };
  const animal = () => ANIMALS[config.petAnimal] || ANIMALS.souris;
  const activeMode = () => modesState.modes.find(m => m.id === modesState.active) || modesState.modes[0];

  // Mots qui désignent chaque son (en plus de son nom affiché).
  const ALIASES = {
    rain: ['pluie', 'il pleut'], thunder: ['orage', 'tonnerre'], beach: ['plage', 'vagues', 'la mer'], wind: ['vent'],
    fireplace: ['feu', 'cheminee', 'feu de cheminee'], cafe: ['cafe', 'bistrot'], birds: ['oiseaux', 'oiseau'],
    creek: ['ruisseau'], fan: ['ventilateur', 'ventilo'], white: ['bruit blanc'], pink: ['bruit rose'], brown: ['bruit brun'],
    chiptune: ['chiptune', '8 bits', 'musique retro'], arcade: ['arcade', 'salle d arcade'],
    rainforest: ['foret tropicale', 'jungle'], waterfall: ['riviere', 'cascade'], underwater: ['sous l eau'],
    city: ['ville', 'parc'], ocean: ['ocean'], crickets: ['grillons'], frogs: ['grenouilles'], train: ['train'],
    airplane: ['avion'], 'cat-purr': ['ronronnement', 'ronron', 'chat qui ronronne'], clock: ['horloge', 'tic tac'],
    keyboard: ['clavier'], 'wind-chimes': ['carillon'], campfire: ['feu de camp'], 'night-forest': ['foret la nuit', 'foret de nuit'],
    blizzard: ['blizzard', 'tempete de neige'], 'washing-machine': ['machine a laver'],
  };
  function soundTable() {
    const rows = [];
    for (const s of SOUNDS) {
      for (const w of new Set([norm(s.name), ...(ALIASES[s.id] || [])])) rows.push([w, s.id]);
    }
    return rows.sort((a, b) => b[0].length - a[0].length); // les plus longs d'abord (« feu de camp » avant « feu »)
  }
  function findSounds(text) {
    let rest = ` ${text} `;
    const found = [];
    for (const [w, id] of soundTable()) {
      if (rest.includes(` ${w} `)) { if (!found.includes(id)) found.push(id); rest = rest.replace(` ${w} `, ' # '); }
    }
    return found;
  }
  function findMode(text) {
    const t = ` ${text} `;
    if (/ (normale?|habituel|rien) /.test(t) && / (mode|retour|reviens|repasse) /.test(t)) return modesState.modes.find(m => m.id === 'normal');
    return [...modesState.modes].sort((a, b) => b.name.length - a.name.length).find(m => t.includes(` ${norm(m.name)} `));
  }

  const isoDay = (offset = 0) => { const d = new Date(); d.setDate(d.getDate() + offset); return d.toLocaleDateString('sv-SE'); };

  // ---------- 1. Commandes claires ----------
  function parse(raw) {
    const t = norm(raw);
    if (!t) return null;
    let m;
    // Créer un mode à partir d'une description.
    if ((m = /^(?:cree|crees|creer|fais|fait|invente|prepare|imagine)(?: moi| nous)? un (?:nouveau )?mode (.+)$/.exec(t))) return { type: 'newmode', text: raw };
    // Tâches (avant les sons : « ajoute la tâche acheter du café » ne doit pas lancer le café).
    if ((m = /^(?:ajoute|ajouter|note|noter|nouvelle|cree|creer)(?: une| la| ma)? tache(?: de| d)?\s*(.+)$/.exec(t))
      || (m = /^(?:rappelle moi|rappelle toi|n oublie pas|noublie pas)(?: de| d)? (.+)$/.exec(t))) {
      // On reprend le texte d'origine (accents, majuscules) après le mot-clé.
      const cut = raw.replace(/^\s*(ajoute[rz]?|note[rz]?|nouvelle|cr[ée]er?|rappelle[- ](moi|toi)|n'?\s?oublie pas)\s*(une |la |ma )?(t[âa]che)?\s*(de |d'|:)?\s*/i, '').trim();
      let text = cut || m[1];
      let due = null;
      if (/\bdemain\b/i.test(text)) { due = isoDay(1); text = text.replace(/\s*\bdemain\b\s*/i, ' ').trim(); }
      else if (/\baujourd'?hui\b/i.test(text)) { due = isoDay(0); text = text.replace(/\s*\baujourd'?hui\b\s*/i, ' ').trim(); }
      return { type: 'task', text: text.replace(/^[:\s]+/, ''), due };
    }
    if (/(qu est ce qu il me reste|qu est ce que j ai a faire|mes taches|quelles taches|liste des taches|il me reste quoi)/.test(t)) return { type: 'tasks' };
    if (/^(?:lance|lancer|demarre|demarrer|commence|commencer|on fait)(?: une| un| la| le)? (?:session )?(?:focus|pomodoro|concentration)/.test(t)) return { type: 'focus' };
    // Musique des autres applications.
    if (/^(?:musique |chanson |morceau |titre )?suivante?$|^(?:passe|mets) (?:a )?la (?:musique|chanson) suivante/.test(t)) return { type: 'music', cmd: 'next' };
    if (/^(?:musique |chanson )?precedente?$/.test(t)) return { type: 'music', cmd: 'prev' };
    // Arrêter / reprendre les sons.
    if (/^(?:stop|pause|silence|chut|tais toi)$/.test(t) || /^(?:arrete|arreter|coupe|couper|stoppe|eteins|mets en pause)(?: le| la| les| tout| tous)?(?: son| sons| bruit| ambiance| musique| tout)?$/.test(t)) return { type: 'pause' };
    if (/^(?:reprends|reprend|relance|play|lecture|continue)(?: le son| les sons| la lecture)?$/.test(t)) return { type: 'play' };
    // Modes.
    const mode = findMode(t);
    if (mode && (/(^| )mode( |$)/.test(t) || /^(?:passe|active|lance|mets|met|retour|reviens|repasse)\b/.test(t))) return { type: 'mode', id: mode.id };
    // Sons : « mets de la pluie et du vent », « joue l'orage », ou juste « pluie ».
    const sounds = findSounds(t);
    if (sounds.length) {
      const verb = /^(?:mets|met|mettre|joue|jouer|lance|lancer|ajoute|ajouter|je veux|j veux|envie d|un peu d|du|de la|des|le|la|les)\b/.test(t);
      const alone = t.split(' ').length <= 4;
      if (verb || alone) return { type: 'sound', ids: sounds, add: /^(?:ajoute|ajouter)/.test(t) };
    }
    if (/^(?:quelle heure|il est quelle heure|l heure)/.test(t)) return { type: 'time' };
    return null;
  }

  // Exécute une action et renvoie ce que le compagnon en dit.
  async function run(a) {
    switch (a.type) {
      case 'pause':
        App.pause();
        return { did: 'Sons coupés', say: pick(['Chut… voilà, silence.', 'Hop, je coupe tout.', 'D\'accord, place au calme.']) };
      case 'play':
        if (!App.hasSounds()) return { say: 'Il n\'y a aucun son à reprendre. Dis-moi par exemple « mets de la pluie ».' };
        App.play();
        return { did: 'Lecture reprise', say: 'C\'est reparti !' };
      case 'sound': {
        const ids = a.ids.filter(id => SOUNDS.some(s => s.id === id));
        if (!ids.length) return { say: 'Je ne connais pas ce son.' };
        ids.forEach(id => App.install(id));
        const keep = a.add ? { ...App.state.active } : {};
        const mix = { ...keep };
        for (const id of ids) mix[id] = mix[id] || 0.6;
        App.playMix({ name: ids.map(id => soundById(id)?.name || id).join(' + '), sounds: mix });
        const names = ids.map(id => `${soundById(id)?.emoji || ''} ${soundById(id)?.name || id}`.trim()).join(', ');
        return { did: `Son : ${names}`, say: pick([`Et voilà : ${names}.`, `${names}, c'est parti !`, `J'adore ça : ${names}.`]) };
      }
      case 'mode': {
        const m = modesState.modes.find(x => x.id === a.id);
        if (!m) return { say: 'Je ne trouve pas ce mode.' };
        modesState = await api.activateMode(m.id);
        return { did: `Mode ${m.emoji} ${m.name}`, say: m.id === 'normal' ? 'Retour à la normale !' : pick([`Mode ${m.name} activé !`, `On passe en mode ${m.name}.`]) };
      }
      case 'task': {
        if (!a.text) return { say: 'Quelle tâche veux-tu ajouter ?' };
        await api.tasks.add({ text: a.text, due: a.due });
        const when = a.due === isoDay(1) ? ' pour demain' : '';
        return { did: `Tâche ajoutée${when} : ${a.text}`, say: pick(['C\'est noté !', 'Je m\'en souviendrai.', 'Ajouté à ta liste !']) };
      }
      case 'tasks': {
        const list = (await api.tasks.get()).filter(x => !x.done);
        if (!list.length) return { say: 'Rien sur ta liste. Profites-en !' };
        const top = list.slice(0, 3).map(x => `• ${x.text}`).join('\n');
        return { say: `Il te reste ${list.length} tâche${list.length > 1 ? 's' : ''} :\n${top}${list.length > 3 ? '\n…' : ''}` };
      }
      case 'focus':
        if (window.Premium) window.Premium.startFocus();
        return { did: 'Session Focus lancée', say: 'Session Focus lancée. Je reste sage pendant ce temps !' };
      case 'music':
        api.music.command(a.cmd);
        return { did: a.cmd === 'next' ? 'Musique suivante' : 'Musique précédente', say: 'Hop !' };
      case 'time': {
        const d = new Date();
        return { say: `Il est ${d.getHours()} h ${String(d.getMinutes()).padStart(2, '0')}.` };
      }
      case 'newmode': {
        const draft = await describeMode(a.text);
        if (window.Modes) window.Modes.openDraft(draft);
        return { did: `Mode préparé : ${draft.emoji} ${draft.name}`, say: 'Je t\'ai préparé un mode : vérifie-le et enregistre-le s\'il te plaît !' };
      }
      default:
        return null;
    }
  }

  // ---------- 2. Réponses toutes faites ----------
  const JOKES = [
    'Que dit une imprimante dans l\'eau ? « J\'ai papier ! »',
    'Pourquoi les plongeurs plongent-ils toujours en arrière ? Parce que sinon, ils tombent dans le bateau.',
    'Quel est le comble pour un électricien ? De ne pas être au courant.',
    'Que fait une fraise sur un cheval ? Tagada, tagada…',
    'Pourquoi l\'ordinateur a-t-il froid ? Parce qu\'il a laissé ses fenêtres ouvertes.',
  ];
  function smallTalk(raw, learned) {
    const t = norm(raw);
    const you = mem.userName ? ` ${mem.userName}` : '';
    const a = animal();
    if (learned === 'name') return `Enchanté ${mem.userName} ! Moi c'est ${petName()}. ${a.cri[0].toUpperCase() + a.cri.slice(1)} !`;
    if (learned === 'like') return pick(['Je m\'en souviendrai !', 'Noté dans ma petite tête.', 'Oh, intéressant !']);
    if (/(mon prenom|comment je m appelle|qui suis je|tu sais qui je suis)/.test(t)) {
      const last = mem.likes[mem.likes.length - 1];
      return mem.userName ? `Bien sûr, tu es ${mem.userName} !${last ? ` Et tu ${last.replace(/^(aime|déteste)/, '$1s')}.` : ''}` : 'Tu ne m\'as pas encore dit ton prénom ! Dis-moi « je m\'appelle… ».';
    }
    if (has(t, ['salut', 'bonjour', 'coucou', 'hello', 'bonsoir', 'yo', 'hey', 'cc'])) return pick([`Coucou${you} ! Qu'est-ce qu'on écoute ?`, `Salut${you} ! ${a.cri[0].toUpperCase() + a.cri.slice(1)} !`, `Bonjour${you} ! Prêt pour une bonne session ?`]);
    if (/(ca va|comment vas tu|comment tu vas|la forme)/.test(t)) return pick([`Super bien, je viens de manger ${a.snack} ! Et toi ?`, 'Toujours en forme quand tu es là !']);
    if (/^(merci|thanks|cool|super|genial|top)/.test(t)) return pick(['Avec plaisir !', 'De rien !', `${a.cri[0].toUpperCase() + a.cri.slice(1)} ! (ça veut dire « de rien »)`]);
    if (/(blague|drole|fais moi rire)/.test(t)) return pick(JOKES);
    if (/(qui es tu|t es qui|comment tu t appelles|ton nom)/.test(t)) return `Je suis ${petName()}, ${a.a} qui vit sur ton bureau. Je garde un œil sur tes tâches et je mets l'ambiance !`;
    if (/(aide|que sais tu faire|tu sais faire quoi|tu peux faire quoi|commandes)/.test(t)) {
      return 'Je peux lancer des sons (« mets de la pluie »), changer de mode (« mode focus »), noter une tâche (« ajoute la tâche appeler Léa demain »), lancer une session Focus, te dire ce qu\'il te reste à faire, ou créer un mode (« crée un mode pour lire le soir »).';
    }
    if (/(fatigue|creve|epuise|stress|angoisse|triste|deprime|marre)/.test(t)) return 'Oh… Prends une pause. Tu veux que je passe en mode Détente ? Ou essaie la page Respiration, ça aide vraiment.';
    if (/(je m ennuie|ennui|j ai rien a faire)/.test(t)) return 'On pourrait écouter la salle d\'arcade ? Ou alors avancer une petite tâche, juste une !';
    if (/(je t aime|t es mignon|t es mignonne|trop mignon)/.test(t)) return 'Rooh, tu me fais rougir les pixels ! ♥';
    if (/(bonne nuit|a demain|au revoir|bye|ciao)/.test(t)) return pick(['À plus tard !', 'Bonne nuit, fais de beaux rêves en 8 bits.']);
    return null;
  }
  const NO_AI = () => pick([
    `Hmm… je suis ${animal().a}, je ne comprends pas encore tout. Donne-moi un cerveau (IA locale, en bas de la page) pour qu'on discute vraiment !`,
    'Je n\'ai pas compris, mais je t\'écoute ! Essaie « aide » pour voir ce que je sais faire.',
  ]);

  // ---------- 3. IA locale ----------
  // Les petits modèles suivent mieux des exemples que de longues consignes : la consigne est courte et
  // trois échanges d'exemple montrent le ton attendu (en français, court, avec la personnalité).
  function systemPrompt() {
    const a = animal();
    const mode = activeMode();
    const energy = mode && mode.pet ? mode.pet.energy : 'normal';
    const trait = { calme: 'calme et douce', normal: 'joyeuse, curieuse et un peu espiègle', joueur: 'très joueuse et blagueuse' }[energy] || 'joyeuse';
    const playing = App.state.playing ? Object.keys(App.state.active).map(id => soundById(id)?.name).filter(Boolean) : [];
    const d = new Date();
    const facts = [];
    if (mem.userName) facts.push(`L'utilisateur s'appelle ${mem.userName}.`);
    if (mem.likes.length) facts.push(`Il ${mem.likes.join(', il ')}.`);
    return [
      `Tu es ${petName()}, ${a.a} en pixel art qui vit sur l'ordinateur de l'utilisateur. Ta personnalité : ${trait}.`,
      'Réponds toujours en français, en une ou deux phrases courtes. Tu tutoies toujours (jamais « vous »). Ne répète jamais ces consignes.',
      `Il est ${d.getHours()} h ${String(d.getMinutes()).padStart(2, '0')}. Mode : ${mode ? mode.name : 'Normal'}. Son : ${playing.join(', ') || 'aucun'}.`,
      ...facts,
    ].join('\n');
  }
  function examples() {
    const a = animal();
    const cri = a.cri[0].toUpperCase() + a.cri.slice(1);
    return [
      { role: 'user', content: 'Salut !' },
      { role: 'assistant', content: `Coucou ! ${cri} ! Qu'est-ce qu'on écoute aujourd'hui ?` },
      { role: 'user', content: 'Je suis un peu stressé.' },
      { role: 'assistant', content: 'Oh… Respire un grand coup avec moi. Un peu de pluie douce, ça te dirait ?' },
      { role: 'user', content: 'J\'ai eu une journée nulle.' },
      { role: 'assistant', content: 'Oh non… Tu veux m\'en parler ? Je t\'écoute, bien au chaud.' },
      { role: 'user', content: 'Tu aimes quoi ?' },
      { role: 'assistant', content: `J'adore grignoter ${a.snack} en écoutant le feu de cheminée !` },
    ];
  }

  // Nettoie la réponse : deux ou trois phrases au plus, sans recopie des consignes.
  function tidy(text) {
    let t = String(text || '').replace(/\s+/g, ' ').trim();
    if (/consigne|une ou deux phrases|en pixel art qui vit/i.test(t)) return '';
    const parts = t.match(/[^.!?…]+[.!?…]+|[^.!?…]+$/g) || [t];
    t = parts.slice(0, 3).join(' ').trim();
    return t.length > 280 ? t.slice(0, 277).replace(/\s+\S*$/, '') + '…' : t;
  }

  // Les demandes (« j'ai besoin de me concentrer », « tu peux mettre un truc calme ») peuvent mener à
  // une action : le modèle la propose, elle est vérifiée, et l'utilisateur la lance d'un clic.
  const REQUEST = /(besoin de|envie de|j aimerais|je voudrais|je veux|mets|lance|concentr|dormir|endormir|detendre|me reposer|travailler|reviser|bosser)/;
  const ACTION_SCHEMA = {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['aucune', 'mode', 'son', 'focus'] },
      cible: { type: 'string', maxLength: 40 },
    },
    required: ['action', 'cible'],
  };
  async function suggestAction(raw) {
    if (!REQUEST.test(norm(raw))) return null;
    const modes = modesState.modes.filter(m => m.id !== 'normal').map(m => m.name).join(', ');
    const sounds = SOUNDS.filter(x => x.builtin).map(x => x.name).join(', ');
    const res = await api.ai.chat([
      { role: 'system', content: `Choisis l'action qui aide l'utilisateur. Modes : ${modes}. Sons : ${sounds}. "focus" = minuteur de concentration. Si rien ne convient : "aucune".` },
      { role: 'user', content: 'je dois bosser sur mon rapport' }, { role: 'assistant', content: '{"action":"mode","cible":"Focus"}' },
      { role: 'user', content: 'mets un truc pour dormir' }, { role: 'assistant', content: '{"action":"son","cible":"Pluie"}' },
      { role: 'user', content: 'tu aimes les carottes ?' }, { role: 'assistant', content: '{"action":"aucune","cible":""}' },
      { role: 'user', content: raw },
    ], { schema: ACTION_SCHEMA, temperature: 0, maxTokens: 40 });
    if (!res.ok) return null;
    const { action, cible } = res.data;
    const c = norm(cible);
    if (action === 'mode') {
      const m = modesState.modes.find(x => x.id !== 'normal' && norm(x.name) === c);
      return m && m.id !== modesState.active ? { type: 'mode', id: m.id, label: `${m.emoji} Mode ${m.name}` } : null;
    }
    if (action === 'son') {
      const ids = findSounds(c);
      return ids.length ? { type: 'sound', ids, label: ids.map(id => `${soundById(id)?.emoji || ''} ${soundById(id)?.name || id}`).join(' + ') } : null;
    }
    if (action === 'focus') return { type: 'focus', label: '⏱️ Lancer une session Focus' };
    return null;
  }

  async function askAI(raw) {
    const history = mem.history.slice(-6).map(h => ({ role: h.who === 'me' ? 'user' : 'assistant', content: h.text }));
    const [reply, action] = await Promise.all([
      api.ai.chat([{ role: 'system', content: systemPrompt() }, ...examples(), ...history, { role: 'user', content: raw }], { temperature: 0.6, maxTokens: 110 }),
      suggestAction(raw).catch(() => null),
    ]);
    if (!reply.ok) throw new Error(reply.error);
    return { say: tidy(reply.data), action };
  }

  // ---------- Créer un mode à partir d'une phrase ----------
  const WALLS = ['coucher', 'nuit', 'jour', 'arcade'];
  // Les réglages (notifications, thème…) viennent des mots-clés, plus fiables qu'un petit modèle ;
  // l'IA choisit le nom, l'emoji, la description et les sons.
  const MODE_SCHEMA = {
    type: 'object',
    properties: {
      nom: { type: 'string', maxLength: 24 },
      emoji: { type: 'string', maxLength: 4 },
      description: { type: 'string', maxLength: 90 },
      sons: { type: 'array', minItems: 1, maxItems: 3, items: { type: 'string', enum: SOUNDS.map(s => s.id) } },
    },
    required: ['nom', 'emoji', 'description', 'sons'],
  };

  // Sans IA : on repère les mots-clés de la phrase.
  function modeFromKeywords(raw) {
    const t = norm(raw);
    const focus = /(concentr|travail|bosser|revis|etud|devoir|code|coder|ecrire|redige|focus|boulot|examen)/.test(t);
    const calm = /(detente|repos|relax|calme|lire|lecture|medit|yoga|zen|pause|cocoon)/.test(t);
    const night = /(nuit|soir|dormir|sommeil|coucher|endormir)/.test(t);
    const retro = /(retro|pixel|8 bits|arcade|jeu video|old school)/.test(t);
    const fun = /(jeu|jouer|gaming|fun|fete|danse)/.test(t);
    const noNotif = /((sans|pas de|coupe\w*|aucune?) notif)/.test(t) || focus;
    const sounds = findSounds(t);
    if (!sounds.length) sounds.push(retro ? 'chiptune' : focus ? 'brown' : night ? 'rain' : calm ? 'creek' : 'cafe');
    const words = raw.replace(/^\s*(cr[ée]e[rsz]?|fais|invente|pr[ée]pare|imagine)(-moi)?\s+/i, '').replace(/^(un\s+)?(nouveau\s+)?mode\s*/i, '').replace(/^(pour|de|du|d')\s*/i, '').trim();
    // Trois mots au plus, sans couper un mot en deux.
    let name = words.split(/\s+/).slice(0, 3).join(' ');
    while (name.length > 24 && name.includes(' ')) name = name.replace(/\s+\S*$/, '');
    name = (name || 'Mon mode').slice(0, 24);
    return {
      nom: name[0].toUpperCase() + name.slice(1), emoji: retro ? '👾' : focus ? '🎯' : night ? '🌙' : calm ? '🍃' : fun ? '🎮' : '✨',
      description: words.slice(0, 90), sons: sounds.slice(0, 3), focus, energie: focus || calm || night ? 'calme' : fun || retro ? 'joueur' : 'normal',
      noirEtBlanc: /noir et blanc|gris/.test(t), ecranChaud: night || /chaud|lumiere bleue/.test(t),
      couperNotifications: noNotif, masquerIcones: focus || /bureau (vide|propre|epure)|sans icone/.test(t),
      theme: /sombre|dark/.test(t) || night ? 'sombre' : /clair|light/.test(t) ? 'clair' : 'inchange',
      pasDeVeille: /(veille|film|presentation)/.test(t) || focus, retro,
    };
  }

  const firstEmoji = e => { const g = [...new Intl.Segmenter('fr', { granularity: 'grapheme' }).segment(String(e || ''))][0]; return g && /\p{Extended_Pictographic}/u.test(g.segment) ? g.segment : null; };

  async function describeMode(raw) {
    const d = modeFromKeywords(raw);
    if (aiState && aiState.ready) {
      const list = SOUNDS.map(s => `${s.id} (${s.name})`).join(', ');
      const res = await api.ai.chat([
        { role: 'system', content: `Tu donnes un nom, un emoji, une description et des sons à un mode de l'application Ambiance, d'après la demande. Sons (identifiants) : ${list}. Nom en français, 1 à 3 mots, sans le mot « mode ». Description : une phrase en français.` },
        { role: 'user', content: 'un mode pour lire au coin du feu' },
        { role: 'assistant', content: '{"nom":"Lecture cosy","emoji":"📖","description":"Un bon livre au chaud près du feu.","sons":["fireplace","rain"]}' },
        { role: 'user', content: raw },
      ], { schema: MODE_SCHEMA, temperature: 0.3, maxTokens: 160 });
      if (res.ok) {
        const ai = res.data;
        const nom = String(ai.nom || '').replace(/[_-]+/g, ' ').replace(/^mode\s+/i, '').trim();
        // Un nom anglais ou mal formé garde le nom tiré de la phrase.
        if (nom && !/[a-z][A-Z]/.test(nom) && !/\b(the|with|and|of|for|night|coding|time)\b/i.test(nom)) d.nom = nom[0].toUpperCase() + nom.slice(1);
        d.emoji = firstEmoji(ai.emoji) || d.emoji;
        if (ai.description) d.description = String(ai.description).trim();
        // Les sons du modèle complètent ceux trouvés dans la phrase (sans doublons).
        d.sons = [...new Set([...findSounds(norm(raw)), ...(ai.sons || [])])];
      }
    }
    // Les sons cités explicitement dans la phrase passent toujours en premier.
    const said = findSounds(norm(raw));
    const sons = [...new Set([...said, ...(d.sons || [])])].filter(id => SOUNDS.some(s => s.id === id)).slice(0, 3);
    const mix = Object.fromEntries(sons.map((id, i) => [id, i === 0 ? 0.5 : 0.3]));
    sons.forEach(id => App.install(id));
    return {
      id: null, name: String(d.nom || 'Mon mode').replace(/^mode\s+/i, '').slice(0, 30), emoji: d.emoji || '✨',
      colors: d.retro ? ['#ff4fa3', '#2a0f45'] : d.focus ? ['#7e57c2', '#2a1a52'] : ['#00897b', '#00302b'],
      desc: d.description || '',
      sound: { mix }, focusTimer: !!d.focus, pet: { energy: d.energie || 'normal' },
      screen: { grayscale: !!d.noirEtBlanc, warmth: d.ecranChaud ? 0.4 : 0, dim: 0 },
      win: {
        theme: d.theme === 'sombre' ? 'dark' : d.theme === 'clair' ? 'light' : null, notifications: d.couperNotifications ? false : null,
        hideIcons: d.masquerIcones ? true : null, autoHideTaskbar: null, power: null,
        wallpaper: d.retro ? `retro:${pick(WALLS)}` : null, cursors: d.retro ? 'retro' : null, accent: null, keepAwake: !!d.pasDeVeille,
      },
      frame: d.retro ? 'pixel' : '', minimize: [], launch: [], music: '',
    };
  }

  // ---------- Conversation ----------
  function addMsg(who, text, did, offer) {
    const b = el('div', `as-msg ${who}`);
    if (who === 'pet') b.append(el('span', 'who', petName()));
    b.append(document.createTextNode(text));
    if (did) b.append(el('span', 'did', `✓ ${did}`));
    // Action proposée par l'IA : rien ne se lance sans un clic.
    if (offer) {
      const btn = el('button', 'as-chip as-offer', `▶ ${offer.label}`);
      btn.type = 'button';
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        const r = await run(offer);
        btn.replaceWith(el('span', 'did', `✓ ${r.did || offer.label}`));
      });
      b.append(btn);
    }
    $('#as-log').append(b);
    $('#as-log').scrollTop = $('#as-log').scrollHeight;
    return b;
  }

  let busy = false;
  let askedName = false;
  async function send(raw) {
    raw = String(raw || '').trim();
    if (!raw || busy) return;
    busy = true;
    $('#as-input').value = '';
    addMsg('me', raw);
    mem.history.push({ who: 'me', text: raw });
    let say = '', did = '', offer = null;
    const thinking = addMsg('pet thinking', '…');
    try {
      // L'état de l'IA est relu à chaque message (installée, supprimée ou changée entre-temps).
      aiState = await api.ai.state();
      let learned = learn(raw);
      // Réponse à « dis-moi ton prénom » : un ou deux mots seuls sont pris pour le prénom.
      if (!learned && askedName && /^[A-Za-zÀ-ÿ-]{2,20}( [A-Za-zÀ-ÿ-]{2,20})?$/.test(raw.trim())) {
        mem.userName = raw.trim().split(' ').map(w => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(' ');
        learned = 'name';
      }
      askedName = false;
      const cmd = learned === 'name' ? null : parse(raw);
      if (cmd) {
        const r = await run(cmd);
        say = r.say; did = r.did || '';
      } else if (learned === 'name' || /(mon prenom|comment je m appelle|qui suis je|tu sais qui je suis|blague|drole|fais moi rire)/.test(norm(raw))) {
        // Les blagues viennent de la liste : les modèles locaux refusent souvent ou en inventent sans chute.
        say = smallTalk(raw, learned);
      } else if (aiState && aiState.ready) {
        if (!aiState.running) thinking.lastChild.textContent = 'Je me réveille… (quelques secondes)';
        const r = await askAI(raw);
        say = r.say || smallTalk(raw, learned) || 'Hmm… dis-m\'en un peu plus ?';
        offer = r.action;
      } else {
        say = smallTalk(raw, learned) || NO_AI();
      }
    } catch (e) {
      say = smallTalk(raw, null) || `Oups, j'ai eu un petit bug : ${e.message}`;
    }
    thinking.remove();
    askedName = /ton pr[ée]nom|comment tu t'appelles/i.test(say);
    addMsg('pet', say, did, offer);
    mem.history.push({ who: 'pet', text: say });
    saveMem();
    // Le compagnon le dit aussi dans sa bulle quand la fenêtre n'est pas regardée.
    if (!document.hasFocus()) api.petSay(say);
    busy = false;
  }

  const CHIPS = ['Mets de la pluie', 'Mode Focus', 'Qu\'est-ce qu\'il me reste ?', 'Crée un mode pour lire le soir', 'Raconte-moi une blague', 'Aide'];
  $('#as-chips').replaceChildren(...CHIPS.map(c => { const b = el('button', 'as-chip', c); b.type = 'button'; b.addEventListener('click', () => send(c)); return b; }));
  $('#as-form').addEventListener('submit', e => { e.preventDefault(); send($('#as-input').value); });

  // ---------- Installation de l'IA ----------
  const mb = n => n >= 1e9 ? `${(n / 1e9).toFixed(1).replace('.', ',')} Go` : `${Math.round(n / 1e6)} Mo`;
  function renderAI(s) {
    aiState = s;
    const active = s.models.find(m => m.id === s.model);
    $('#as-status').textContent = s.download ? 'Téléchargement en cours…'
      : active ? `IA locale active : modèle ${active.name}${s.running ? ' (éveillé)' : ' (endormi, se réveille à la première question)'}.`
        : `Pas encore d'IA : réponses toutes faites. Votre PC a ${s.ramGb} Go de mémoire, le modèle conseillé est « ${s.models.find(m => m.id === s.recommended).name} ».`;
    $('#as-models').replaceChildren(...s.models.map(m => {
      const c = el('div', 'as-model' + (m.id === s.model ? ' on' : ''));
      const t = el('div', 't');
      t.append(el('span', null, m.name), el('small', null, mb(m.size)));
      c.append(t, el('div', 's-sub', m.desc));
      const row = el('div', 'row');
      if (m.id === s.recommended) row.append(el('span', 'as-tag', 'Conseillé'));
      if (m.installed) {
        if (m.id !== s.model) { const u = el('button', 'btn', 'Utiliser'); u.addEventListener('click', async () => renderAI(await api.ai.use(m.id))); row.append(u); }
        const r = el('button', 'btn danger', 'Supprimer');
        r.addEventListener('click', async () => {
          if (!await App.dialog({ title: `Supprimer le modèle ${m.name} ?`, text: `${mb(m.size)} seront libérés. Vous pourrez le retélécharger plus tard.`, ok: 'Supprimer' })) return;
          renderAI(await api.ai.remove(m.id));
        });
        row.append(r);
      } else {
        const d = el('button', 'btn accent', `Télécharger (${mb(m.size)})`);
        d.disabled = !!s.download;
        if (s.ramGb < m.ram) d.title = `Ce modèle préfère ${m.ram} Go de mémoire : il risque d'être lent sur ce PC.`;
        d.addEventListener('click', () => installModel(m));
        row.append(d);
      }
      c.append(row);
      return c;
    }));
    $('#as-progress').classList.toggle('hidden', !s.download);
    if (s.download) {
      const pct = s.download.total ? Math.floor(s.download.done / s.download.total * 100) : 0;
      $('#as-bar').style.width = `${pct}%`;
      $('#as-progress-text').textContent = `${s.download.step || 'Préparation'} · ${mb(s.download.done)} sur ${mb(s.download.total)} (${pct} %)`;
    }
  }
  async function installModel(m) {
    const r = await api.ai.install(m.id);
    if (r.ok) { toast(`🧠 ${petName()} a un nouveau cerveau !`); addMsg('pet', pick(['Waouh, je me sens plus malin ! Parle-moi de tout ce que tu veux.', 'Mon nouveau cerveau est installé. On discute ?'])); }
    else if (!/annul/i.test(r.error)) toast(r.error);
    renderAI(await api.ai.state());
  }
  $('#as-cancel').addEventListener('click', () => api.ai.cancel());
  api.ai.onState(renderAI);

  // ---------- Nom du compagnon ----------
  function renderName() {
    $('#as-name-title').textContent = petName();
    if (document.activeElement !== $('#as-name')) $('#as-name').value = petName();
  }
  $('#as-name').addEventListener('change', async () => {
    config = await api.setConfig({ petName: $('#as-name').value });
    renderName();
  });
  if (api.onConfig) api.onConfig(c => { config = c; renderName(); });
  api.onModeChanged(() => api.getModes().then(s => { modesState = s; }));

  // « Décrire un mode » sur la page Modes.
  $('#btn-describe-mode').addEventListener('click', async () => {
    const text = await App.dialog({ title: 'Décrire un mode', text: 'En une phrase, ex. « réviser le soir avec de la pluie, sans notifications ».', input: '', ok: 'Préparer' });
    if (!text) return;
    toast(`${petName()} prépare ton mode…`);
    const draft = await describeMode(text);
    if (window.Modes) window.Modes.openDraft(draft);
  });

  // Historique de la conversation (les derniers échanges).
  for (const h of mem.history.slice(-12)) addMsg(h.who === 'me' ? 'me' : 'pet', h.text);
  if (!mem.history.length) addMsg('pet', 'Coucou ! Demande-moi un son, un mode, une tâche… ou dis-moi juste bonjour.');

  Promise.all([api.info(), api.getModes(), api.ai.state()]).then(([info, ms, s]) => {
    config = info.config; modesState = ms;
    renderName();
    renderAI(s);
  });

  // Pour les tests.
  window.Assistant = { parse, describeMode, modeFromKeywords, send };
})();
