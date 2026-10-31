// Données des mini-jeux, partagées entre le processus principal (games.js) et les pages qui dessinent
// (compagnon, jardinière, page Jeux) : chapeaux tricotés et plantes de la jardinière.
// Les dessins sont en pixels, tournés vers la droite comme les animaux ; la dernière rangée d'un
// chapeau se pose sur le haut de la tête.
(() => {
  const PAL = {
    k: '#2a2238', w: '#ffffff', r: '#e8455d', R: '#a82a3e', b: '#5bb6ff', B: '#2f6fb0',
    y: '#f6c945', o: '#d99a1e', g: '#5cb85c', G: '#2f7d32', s: '#ecd28f', S: '#b8944f',
    n: '#3a2a1a', N: '#8a5a32', p: '#f4a3b8', P: '#c2185b', v: '#9b6bd6', V: '#5b3a99',
    x: '#b9c1ca', X: '#4d5560', c: '#9fe8ff', l: '#fff3b0', t: '#e06b2d', T: '#a8441a',
  };

  const RARITY = {
    commun: { name: 'Commun', color: '#9aa3ad', chance: 62, price: 20, refund: 3 },
    rare: { name: 'Rare', color: '#4f9cf0', chance: 27, price: 60, refund: 8 },
    epique: { name: 'Épique', color: '#a86bf0', chance: 9, price: 150, refund: 20 },
    legendaire: { name: 'Légendaire', color: '#f0b429', chance: 2, price: 400, refund: 50 },
  };

  const HATS = [
    { id: 'bonnet', name: 'Bonnet rouge', rarity: 'commun', rows: ['...ww...', '..kwwk..', '.krrrrk.', 'krrrrrrk', 'kwwwwwwk'] },
    { id: 'casquette', name: 'Casquette bleue', rarity: 'commun', rows: ['..kkkk....', '.kbbbbk...', 'kbbwbbbk..', 'kBBBBBBkkk', '.kkkkkkkBk'] },
    { id: 'beret', name: 'Béret violet', rarity: 'commun', rows: ['....k....', '..kkkkk..', '.kvvvvvvk', 'kvvvvvvk.', '.kkkkkk..'] },
    { id: 'paille', name: 'Chapeau de paille', rarity: 'commun', rows: ['...kkkk....', '..kssssk...', '..kRRRRk...', 'kkssssssskk', 'kSSSSSSSSSk', '.kkkkkkkkk.'] },
    { id: 'bandana', name: 'Bandana vert', rarity: 'commun', rows: ['..kkkkkk.', '.kggwgggk', 'kgkgggggk', 'gk.kkkkk.', 'k........'] },
    { id: 'bob', name: 'Bob jaune', rarity: 'commun', rows: ['..kkkkk..', '.kyyyyyk.', '.kyyyyyk.', 'kyoooooyk', '.kkkkkkk.'] },
    { id: 'noeud', name: 'Nœud rose', rarity: 'commun', rows: ['kk...kk', 'kpk.kpk', 'kppkppk', 'kpkPkpk', 'kk.k.kk'] },
    { id: 'haut-forme', name: 'Haut-de-forme', rarity: 'rare', rows: ['..kkkkkk..', '..kXXXXk..', '..kXXXXk..', '..kXXXXk..', '..krrrrk..', 'kkkkkkkkkk'] },
    { id: 'sorcier', name: 'Chapeau de sorcier', rarity: 'rare', rows: ['......kk...', '.....kVk...', '....kVVk...', '...kVVVk...', '..kVyVVVk..', '.kVVVVVVVk.', 'kkkkkkkkkkk'] },
    { id: 'fleurs', name: 'Couronne de fleurs', rarity: 'rare', rows: ['.p.y.p.y.', 'kpkykpkyk', 'kgggggggk', '.kkkkkkk.'] },
    { id: 'chantier', name: 'Casque de chantier', rarity: 'rare', rows: ['...kkkk...', '..kyyyyk..', '.kyyoyyyk.', 'kyyyoyyyyk', 'kkkkkkkkkk'] },
    { id: 'lutin', name: 'Bonnet de lutin', rarity: 'rare', rows: ['.......kk', '.....kkgw', '...kkggk.', '..kgggk..', '.kgggggk.', 'kwwwwwwwk'] },
    { id: 'toque', name: 'Toque de chef', rarity: 'rare', rows: ['.kkk.kkk.', 'kwwwkwwwk', 'kwwwwwwwk', '.kwwwwwk.', '.kxxxxxk.', '.kkkkkkk.'] },
    { id: 'pirate', name: 'Chapeau de pirate', rarity: 'epique', rows: ['....kkk....', '..kkXXXkk..', '.kXXXwXXXk.', 'kXXXwXwXXXk', 'kkkkkkkkkkk', '.kooooooook'] },
    { id: 'viking', name: 'Casque viking', rarity: 'epique', rows: ['l.........l', 'lk..kkk..kl', '.lkkxxxkkl.', '..kxxxxxk..', '.kxoxoxoxk.', '.kkkkkkkkk.'] },
    { id: 'couronne', name: 'Couronne royale', rarity: 'epique', rows: ['.y..y..y.', 'kyk.y.kyk', 'kyykykyyk', 'kyrybyryk', 'kyyyyyyyk', '.kkkkkkk.'] },
    { id: 'cowboy', name: 'Chapeau de cowboy', rarity: 'epique', rows: ['...kkkkk...', '..kNNNNNk..', '..kNnnnNk..', 'kkkNNNNNkkk', 'kNNNNNNNNNk', '.kkkkkkkkk.'] },
    { id: 'aureole', name: 'Auréole', rarity: 'legendaire', rows: ['..llll..', '.lyyyyl.', '..llll..', '........', '........'] },
    { id: 'etoiles', name: 'Couronne d\'étoiles', rarity: 'legendaire', rows: ['..y...y...y..', '.yyy.yyy.yyy.', '..y...y...y..', '.kcckcckcck..', '.kkkkkkkkkk..'] },
    { id: 'champignon', name: 'Champignon magique', rarity: 'legendaire', rows: ['...kkkkk...', '.kkrrwrrkk.', 'krrwrrrrwrk', 'krrrrrwrrrk', 'kkkkkkkkkkk', '...kwwwk...'] },
  ];
  // Rangées de même largeur (le dessin peut être retourné quand le compagnon regarde à gauche).
  for (const h of HATS) {
    const w = Math.max(...h.rows.map(r => r.length));
    h.rows = h.rows.map(r => r.padEnd(w, '.'));
  }

  // Plantes : durée de pousse en minutes d'activité sur le PC, prix de la graine et gain en étoiles.
  // Les dessins mûrs font 7 x 9 pixels, posés sur la terre.
  const PLANTS = [
    { id: 'radis', name: 'Radis', minutes: 10, cost: 0, gain: 4, rows: ['.g.g.g.', '..ggg..', '...g...', '..rrr..', '.rrrrr.', '..rrr..', '...r...'] },
    { id: 'carotte', name: 'Carotte', minutes: 30, cost: 4, gain: 12, rows: ['g..g..g', '.g.g.g.', '..ggg..', '..ttt..', '..ttt..', '..tTt..', '...t...'] },
    { id: 'tomate', name: 'Tomate', minutes: 60, cost: 10, gain: 28, rows: ['...g...', '.rgGgr.', 'rrrgrrr', 'rwrrrrr', 'rrr.rrr', '.r.g.r.', '...g...', '...g...'] },
    { id: 'citrouille', name: 'Citrouille', minutes: 120, cost: 20, gain: 60, rows: ['...G...', '...Gg..', '.ttTtt.', 'ttTtTtt', 'ttTtTtt', 'ttTtTtt', '.ttttt.'] },
    { id: 'fleur', name: 'Fleur étoile', minutes: 240, cost: 45, gain: 120, hatChance: 0.3, rows: ['.y.y.y.', '..yly..', 'yyllyyy', '..yly..', '.y.g.y.', '...g...', '.g.g...', '..gg...', '...g...'] },
  ];
  const SPROUT = [['.g.g.', '..g..'], ['g...g', 'gg.gg', '.ggg.', '..g..', '..g..']];

  const DATA = { PAL, RARITY, HATS, PLANTS, SPROUT };
  if (typeof module !== 'undefined') module.exports = DATA;
  else window.GAMES = DATA;
})();
