/* ============================================================
   DATA — NARUTO CARD GAME (Bandai) revealed cards (pre-release)
   Sources: naruto-cardgame.com, official Overview Trailer,
   Gen Con 2026 English demo cards (transcribed). See research/bandai.
   ============================================================ */
(function () {
  const NS = window.NTCG = window.NTCG || {};
  const B = 'https://www.naruto-cardgame.com';

  // Official art sources. box = [x, y, w, h] of the card face inside the source image.
  const SRC = {
    leaders: { url: B + '/images/welcome/feature_img02_en.webp?v1', w: 610, h: 458 },
    naruto_leader: { url: B + '/images/welcome/type_img01_en.webp', w: 439, h: 341 },
    ino_shika: { url: B + '/images/welcome/type_img02_en.webp', w: 568, h: 362 },
    gamabunta: { url: B + '/images/welcome/type_img03_en.webp', w: 439, h: 340 },
    chakra: { url: B + '/images/welcome/type_img04_en.webp', w: 439, h: 341 },
    summon: { url: B + '/images/welcome/type_img05_en.webp', w: 439, h: 341 },
    ino: { url: B + '/images/welcome/feature_img03_en.webp', w: 610, h: 458 },
  };
  const gallery = n => ({ url: `${B}/images/welcome/card/en/card${n}.webp${n === '02' ? '?v1' : ''}`, w: 600, h: 838, box: [0, 0, 600, 838] }); // full official showcase card (its printed stats are placeholders; real values are in the text panel)
  const face = (src, box) => Object.assign({}, SRC[src], { box });

  NS.ASSETS = {
    keyArt: B + '/images/top/mv.webp',
    swirl: B + '/images/common/bg_pc.webp',
    swirlPage: B + '/images/page/bg_pc.webp',
    playmat: B + '/images/welcome/pc/mv_bg.webp',
    welcome: B + '/images/top/welcome_bg.webp',
    logo: B + '/images/common/logo.webp',
    logoNaruto: B + '/images/welcome/logo_naruto_en.webp?v1',
    kishimoto: B + '/images/top/comment_en.webp',
    video: B + '/video/pv_en.mp4',
    chakraFace: { url: 'https://exburst.dev/nrtb/cards/hd/C-001.webp', full: true },
    summonFace: { url: 'https://exburst.dev/nrtb/cards/hd/S-001.webp', full: true },
  };

  // mode: 'face' = real official card face (text printed on it),
  //       'art'  = official illustration with simulator frame,
  //       'plain'= art not revealed yet (simulator frame only)
  const C = [
    // ---------------- RED (Naruto) ----------------
    {
      id: 'N-001', type: 'leader', name: 'Naruto Uzumaki', color: 'red', dmg: 1, pow: 3, life: 15, rarity: 'L',
      traits: ['Wind', 'Jinchuriki', 'Hidden Leaf Village', 'Team 7'],
      text: [
        '[Activate: Main] Flip 1 of your CHAKRA face-down and choose 1 Character: The chosen card gets +3 power during this turn.',
        '[Recovery] If it is the second turn or later, rest this card and flip all of your CHAKRA face-up.',
      ],
      mode: 'face', conf: 'official',
    },
    {
      id: 'N-003', type: 'ex', name: 'Naruto Uzumaki', color: 'red', dmg: 3, pow: 11, hp: 10, rarity: 'SR',
      traits: ['Wind', 'Jinchuriki', 'Hidden Leaf Village', 'Team 7'],
      text: [
        'Cannot be summoned normally.',
        '[Summon Requirements] Place 1 of your Characters and 1 of your Characters with 10 or more power in your trash.',
        '[Rush] (This card can attack on the turn in which it is played.)',
        '[On Summon] Summon up to 1 [Naruto Uzumaki] from your deck or trash with its effects negated.',
      ],
      mode: 'face', conf: 'demo',
    },
    {
      id: 'N-004', type: 'character', name: 'Naruto Uzumaki', color: 'red', dmg: 1, pow: 5, hp: 4, rarity: 'R',
      traits: ['Special', 'Jinchuriki', 'Hidden Leaf Village', 'Team 7'],
      support: { name: 'Rasengan', cost: 2, timing: 'main', text: 'K.O. all Characters.' },
      mode: 'face', conf: 'demo',
    },
    {
      id: 'N-005', type: 'ex', name: 'Gamabunta', color: 'red', dmg: 2, pow: 10, hp: 8, rarity: 'R',
      traits: ['Water', 'Toad', 'Mount Myoboku'],
      text: [
        'Cannot be summoned normally.',
        '[Summon Requirements] Place 1 of your Characters with 10 or more power in your trash.',
        '[On Summon] Summon 1 non-EX [Naruto Uzumaki], [Jiraiya], or [Minato Namikaze] Character from your trash.',
      ],
      mode: 'face', conf: 'official',
    },
    {
      id: 'N-006', type: 'character', name: 'Jiraiya', color: 'red', dmg: 1, pow: 7, hp: 4, rarity: 'R',
      traits: ['Fire', 'The Legendary Sannin', 'Hidden Leaf Village'],
      support: { name: 'Fire Style: Toad Flame Bombs', cost: 2, timing: 'oppAttack', text: 'Choose up to 2 rested Characters: K.O. the chosen cards.' },
      mode: 'face', conf: 'demo',
    },
    {
      id: 'N-007', type: 'character', name: 'Minato Namikaze', color: 'red', dmg: 2, pow: 8, hp: 8, rarity: 'R',
      traits: ['Wind', 'Lightning', 'The Five Kage', 'Hidden Leaf Village'],
      text: ['[Your Turn] If this Character has 10 or more power, this Character gains [Rush].'],
      mode: 'face', conf: 'demo',
    },
    {
      id: 'N-008', type: 'character', name: 'Shikamaru Nara', color: 'red', dmg: 1, pow: 6, hp: 4, rarity: 'C',
      traits: ['Special', 'Hidden Leaf Village', 'Team 10'],
      support: { name: 'Shadow Possession Jutsu', cost: 1, timing: 'oppAttack', text: 'Summon this card and interrupt that attack.' },
      mode: 'face', conf: 'official',
    },
    {
      id: 'N-009', type: 'character', name: 'Kakashi Hatake', color: 'red', dmg: 1, pow: 7, hp: 4, rarity: 'R',
      traits: ['Lightning', 'Hidden Leaf Village', 'Team 7'],
      support: { name: 'Lightning Blade', cost: 1, timing: 'supportActivated', text: 'Negate that card. Then, reduce your life by 2.' },
      mode: 'face', conf: 'demo',
    },
    {
      id: 'N-011', type: 'character', name: 'Ino Yamanaka', color: 'red', dmg: 2, pow: 5, hp: 8, rarity: 'C',
      traits: ['Special', 'Hidden Leaf Village', 'Team 10'],
      text: ['[Activate: Main] [Once Per Turn] If you have [Shikamaru Nara] and [Choji Akimichi] on the field, your [Ino Yamanaka], [Shikamaru Nara], and [Choji Akimichi] all gain [Rush] and +5 power/+1 damage during this turn. (This card can attack on the turn in which it is summoned.)'],
      mode: 'face', conf: 'official',
    },
    {
      id: 'N-002', type: 'character', name: 'Choji Akimichi', color: 'red', dmg: 1, pow: 7, hp: 3, rarity: 'C',
      traits: ['Taijutsu', 'Hidden Leaf Village', 'Team 10'],
      support: { name: 'Expansion Jutsu', cost: 1, timing: 'quick', text: "Choose 1 Character: Summon this card, and the chosen card's power is doubled during this turn." },
      mode: 'face', conf: 'demo',
    },
    {
      id: 'N-020', type: 'character', name: 'Sakura Haruno', color: 'red', dmg: 2, pow: 6, hp: 4, rarity: 'C',
      traits: ['Taijutsu', 'Hidden Leaf Village', 'Team 7'],
      support: { name: 'Cha!', cost: 1, timing: 'oppAttack', text: "Choose 1 Character: Return the chosen card to the owner's hand." },
      mode: 'face', conf: 'demo',
    },
    {
      id: 'N-018', type: 'character', name: 'Hinata Hyuga', color: 'red', dmg: 1, pow: 5, hp: 5, rarity: 'C',
      traits: ['Hyuga Clan', 'Hidden Leaf Village', 'Team 8'],
      support: { name: '[8-TRIGRAM] Air Palm', cost: 1, timing: 'oppAttack', text: 'Choose 1 non-EX Character: K.O. the chosen card.' },
      mode: 'face', conf: 'demo',
    },
    // ---------------- BLUE (Sasuke) ----------------
    {
      id: 'N-012', type: 'leader', name: 'Sasuke Uchiha', color: 'blue', dmg: 1, pow: 3, life: 15, rarity: 'L',
      traits: ['Fire', 'Lightning', 'Uchiha Clan', 'The Taka'],
      text: [
        '[Activate: Main] [Once Per Turn] Draw 1 card and place 1 card from your hand on top of your deck.',
        '[Recovery] If it is the second turn or later, rest this card and flip all of your CHAKRA face-up.',
      ],
      mode: 'face', conf: 'official',
    },
    {
      id: 'N-010', type: 'character', name: 'Karin', color: 'blue', dmg: 1, pow: 4, hp: 6, rarity: 'C',
      traits: ['Special', 'The Taka'],
      support: { name: 'Hurry up and bite me!', cost: 1, timing: 'oppAttack', text: 'Summon this card and you gain 2 Life.' },
      mode: 'face', conf: 'demo',
    },
    {
      id: 'N-013', type: 'character', name: 'Itachi Uchiha', color: 'blue', dmg: 2, pow: 8, hp: 8, rarity: 'R',
      traits: ['Fire', 'Illusion', 'Uchiha Clan', 'Akatsuki'],
      text: ['[On Summon] Choose 1 Leader or Character: Reveal the top card of your deck, and if the revealed card has the {Uchiha Clan} type, the selected card cannot attack during your opponent\'s next turn.'],
      mode: 'face', conf: 'official',
    },
    {
      id: 'N-014', type: 'ex', name: 'Sasuke Uchiha', color: 'blue', dmg: 3, pow: 10, hp: 11, rarity: 'SR',
      traits: ['Fire', 'Lightning', 'Uchiha Clan', 'The Taka'],
      text: [
        'Cannot be summoned normally.',
        '[Summon Requirements] Place 1 of your Characters and 1 of your {The Taka} type Characters in your trash.',
        '[Rush] (This card can attack on the turn in which it is summoned.)',
        '[On Summon] Choose 1 Character: K.O. the chosen card.',
      ],
      mode: 'face', conf: 'demo',
    },
    {
      id: 'N-016', type: 'character', name: 'Shisui Uchiha', color: 'blue', dmg: 1, pow: 5, hp: 6, rarity: 'R',
      traits: ['Illusion', 'Uchiha Clan', 'Hidden Leaf Village'],
      support: { name: 'Koto Amatsukami', cost: 1, timing: 'supportActivated', text: "Negate that card. Then, from this turn until the end of your next turn's End Phase, you cannot turn your CHAKRA face-up." },
      mode: 'face', conf: 'demo',
    },
    {
      id: 'N-019', type: 'character', name: 'Jugo', color: 'blue', dmg: 2, pow: 9, hp: 7, rarity: 'C',
      traits: ['Special', 'The Taka'],
      text: ['[When Attacking] Reveal the top card of your deck, and if the revealed card is [Sasuke Uchiha], or {The Taka} type card other than an EX Character, summon that card.'],
      mode: 'face', conf: 'demo',
    },
    {
      id: 'N-021', type: 'character', name: 'Suigetsu Hozuki', color: 'blue', dmg: 1, pow: 5, hp: 5, rarity: 'C',
      traits: ['Water', 'The Taka'],
      support: { name: 'Water Transformation Jutsu', cost: 1, timing: 'quick', text: "Choose 1 Character: Summon this card, and the chosen card will not be affected by your opponent's Support effects during this turn." },
      mode: 'face', conf: 'demo',
    },
    {
      id: 'N-022', type: 'ex', name: 'Manda', color: 'blue', dmg: 2, pow: 8, hp: 10, rarity: 'R',
      traits: ['Special', 'Snake'],
      text: [
        'Cannot be summoned normally.',
        '[Summon Requirements] Place 1 of your Characters in your trash.',
        '[On Summon] Reveal the top card of your deck, and if the revealed card is a non-EX Character, summon that card.',
      ],
      mode: 'face', conf: 'demo',
    },
    {
      id: 'N-015', type: 'character', name: 'Sasuke Uchiha', color: 'blue', dmg: 1, pow: 4, hp: 5, rarity: 'R',
      traits: ['Lightning', 'Uchiha Clan'],
      support: { name: 'Chidori: One Thousand Birds', cost: 2, timing: 'main', text: 'K.O. all Characters.' },
      mode: 'face', conf: 'demo',
    },
    {
      id: 'N-017', type: 'character', name: 'Orochimaru', color: 'blue', dmg: 1, pow: 4, hp: 7, rarity: 'R',
      traits: ['Special', 'The Legendary Sannin', 'Hidden Sound Village'],
      support: { name: 'Striking Shadow Snake', cost: 2, timing: 'oppAttack', text: 'Choose up to 2 rested Characters: K.O. the chosen cards.' },
      mode: 'face', conf: 'demo',
    },
  ];

  const TIMING = {
    main: '[During Your Main]',
    oppAttack: "[During Your Opponent's Attack]",
    quick: '[Quick]',
    supportActivated: '[Support Activated]',
  };

  // House rules: every rule Bandai has not published yet. Editable in Settings.
  NS.HOUSE_DEFAULTS = {
    deckSize: 30,        // official: 50 (only ~20 designs revealed so far)
    copyLimit: 4,
    handSize: 5,
    mulligan: true,
    drawPerTurn: 1,
    firstPlayerDraws: false,
    firstPlayerCanAttack: false,
    charLimit: 5,
    battle: 'powVsHp',   // attacker POW >= target HP -> K.O.
    exUsesSummonCard: false,
    setLimitPerTurn: 0,  // 0 = unlimited (area max 5)
    deckOutLoses: true,
    leaderCanAttack: true,
    attackRestedOnly: true,
  };

  const STARTERS = [
    {
      id: 'st-red', name: 'Will of Fire (Red)', leader: 'N-001', color: 'red',
      desc: 'Naruto leader. Team 10 combos, Rasengan board wipes and toad summons with Gamabunta.',
      cards: { 'N-004': 2, 'N-006': 4, 'N-007': 3, 'N-008': 4, 'N-009': 2, 'N-011': 3, 'N-002': 3, 'N-020': 2, 'N-018': 4, 'N-003': 2, 'N-005': 1 },
    },
    {
      id: 'st-blue', name: 'Path of Revenge (Blue)', leader: 'N-012', color: 'blue',
      desc: 'Sasuke leader. Team Taka swarm, Uchiha genjutsu and Chidori, finished by EX Sasuke and Manda.',
      cards: { 'N-010': 4, 'N-013': 4, 'N-016': 2, 'N-019': 4, 'N-021': 4, 'N-015': 3, 'N-017': 3, 'N-014': 3, 'N-022': 3 },
    },
  ];

  // real card faces (HD scans) from the ExBurst card database
  const EXB = 'https://exburst.dev/nrtb/cards/';
  C.forEach(c => { c.art = { url: EXB + (c.id === 'N-020' ? 'sd/' : 'hd/') + c.id + '.webp', full: true }; });
  NS.CARD_DATA = C;
  NS.TIMING = TIMING;
  NS.STARTERS = STARTERS;
})();
