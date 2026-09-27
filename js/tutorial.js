/* ============================================================
   TUTORIAL — guided match with stacked decks, a scripted rival
   and a coach that only allows the move being taught.
   ============================================================ */
(function () {
  const NS = window.NTCG = window.NTCG || {};
  const $ = (s, r) => (r || document).querySelector(s);

  const STEPS = [
    { t: 'info', text: 'Welcome to the <b>NARUTO CARD GAME</b>! This lesson plays a real match against Sasuke and covers everything you need. You are <b>Naruto (Red)</b>.' },
    { t: 'info', focus: '[data-zone="life-0"]', text: 'This is your <b>Leader</b> with <b>15 LIFE</b>. Get your rival\'s Leader to <b>0</b> and you win. You also lose if your deck runs out.' },
    { t: 'info', focus: '[data-zone="life-1"]', text: 'This is your rival\'s Leader. Hitting a Leader removes Life equal to the attacker\'s <b>DMG</b>.' },
    { t: 'info', focus: '[data-zone="chakra-0"]', text: 'These are your <b>5 Chakra cards</b>. Paying for jutsu turns them <b>face-down</b>, and they don\'t come back on their own. Only your Leader\'s <b>[Recovery]</b> refills them.' },
    { t: 'info', focus: '[data-k="SUM0"]', text: 'This is your <b>Summon card</b>. Rest it to play <b>one Character per turn</b>. You drew <b>1</b> card this turn because you went first; from now on everyone draws <b>2</b>.' },
    { t: 'do', focus: '[data-zone="hand"]', text: 'Let\'s summon! Click <b>Minato Namikaze</b> in your hand and choose <b>Summon</b>.', expect: a => a.kind === 'summon' && a.card.card.id === 'N-007' },
    { t: 'info', focus: '[data-zone="chars-0"]', text: 'Minato is on the field! <b>Neither player can attack during their first turn</b>, not even with <span class="kw rush">Rush</span>. After that, a Character can\'t attack on the turn it\'s summoned unless it has Rush.' },
    { t: 'do', focus: '[data-zone="hand"]', text: 'Now the core trick of this game: click <b>Shikamaru Nara</b> and choose <b>Set face-down as Support</b>.', expect: a => a.kind === 'set' && a.card.card.id === 'N-008' },
    { t: 'info', focus: '[data-zone="support-0"]', text: 'The <b>Support Area</b> holds up to 5 face-down cards. Each one hides a jutsu you trigger later by paying Chakra. Shikamaru\'s <i>Shadow Possession Jutsu</i> costs 1 Chakra and fires <b>when your opponent attacks</b>.' },
    { t: 'do', focus: '#endBtn', text: 'That\'s all for your first turn. Click <b>End Turn</b> and watch Sasuke.', expect: a => a.kind === 'end' },
    { t: 'info', focus: '[data-zone="chars-1"]', text: 'Sasuke summoned <b>Jugo</b> and set a face-down Support. Watch out for that hidden card! It\'s your turn: you stood up and drew 2.' },
    { t: 'do', focus: '[data-k="L0"]', text: 'Click your <b>Leader</b> and use its ability: flip 1 Chakra to give a Character <b>+3 power</b>.', expect: a => a.kind === 'leaderAbility' },
    { t: 'choose', text: 'Give the +3 power to <b>Minato</b>.', pick: u => u.card && u.card.id === 'N-007' },
    { t: 'info', focus: '[data-zone="chars-0"]', text: 'Minato now has <b>11 power</b>, which unlocks <b>EX Characters</b>. <b>Gamabunta</b> needs "1 of your Characters with 10 or more power" put in your trash. EX summons don\'t use the Summon card and aren\'t limited to one per turn.' },
    { t: 'do', focus: '[data-zone="hand"]', text: 'Click <b>Gamabunta</b> and choose <b>EX Summon</b>. Minato goes to the trash to call the Chief Toad!', expect: a => a.kind === 'ex' && a.card.card.id === 'N-005' },
    { t: 'choose', text: 'Gamabunta\'s <span class="kw on">On Summon</span>: bring <b>Minato</b> back from your trash!', pick: c => c.card && c.card.id === 'N-007' },
    { t: 'info', focus: '[data-zone="chars-0"]', text: 'Classic combo: you got a 10-power EX Character and kept Minato. Both were just summoned, so they can\'t attack this turn. Your Leader can, though.' },
    { t: 'do', focus: '[data-k="L0"]', text: 'Click your <b>Leader</b>, choose <b>Attack…</b>, then click <b>Sasuke\'s Leader</b>.', expect: a => a.kind === 'attack' && a.attacker.isLeader && a.target.isLeader },
    { t: 'info', focus: '[data-zone="chars-1"]', text: 'Sasuke\'s face-down card was <b>Karin</b>: she summoned herself and <b>gained 2 Life</b> before your hit landed. Supports can cut in when someone attacks, summons, or activates an effect. Count your rival\'s face-down cards!' },
    { t: 'do', focus: '#endBtn', text: 'Click <b>End Turn</b>. Sasuke will attack now, and you\'re ready for him.', expect: a => a.kind === 'end' },
    { t: 'respond', text: '<b>Jugo</b> is attacking your Leader! Flip <b>Shikamaru</b>\'s <i>Shadow Possession Jutsu</i> to stop the attack.', pick: s => s.card.id === 'N-008' },
    { t: 'info', focus: '[data-zone="chars-0"]', text: '<b>ATTACK CANCEL!</b> You paid 1 Chakra, and Shikamaru jumped onto the field. On your own turn you can even activate Supports <b>straight from your hand</b>.' },
    { t: 'do', focus: '[data-k="L0"]', text: 'You\'ve spent Chakra. Click your <b>Leader</b> and choose <b>[Recovery]</b>: it rests your Leader and flips <b>all</b> your Chakra face-up.', expect: a => a.kind === 'recovery' },
    { t: 'info', focus: '[data-zone="chakra-0"]', text: 'All 5 Chakra are ready again. The price: your Leader is rested, so it can\'t attack this turn.' },
    { t: 'do', focus: '[data-zone="chars-0"]', text: 'Jugo attacked last turn, so he\'s still <b>rested</b>, and only rested Characters can be attacked. Click <b>Gamabunta</b>, choose <b>Attack…</b>, then click <b>Jugo</b>.', expect: a => a.kind === 'attack' && a.attacker.card && a.attacker.card.id === 'N-005' && a.target.card && a.target.card.id === 'N-019' },
    { t: 'info', focus: '[data-zone="chars-1"]', text: 'Gamabunta\'s <b>10 POW</b> beat Jugo\'s <b>7 HP</b>, so Jugo was K.O.\'d. Damage on a Character <b>stays until the end of the turn</b>, so two smaller attacks can add up to a K.O.' },
    { t: 'do', focus: '#endBtn', text: 'Great work! Click <b>End Turn</b>.', expect: a => a.kind === 'end' },
    { t: 'info', final: true, text: '<b>Tutorial complete!</b> You know the full loop: summon, set Supports, cut in with jutsu, EX summon, attack, and Recover. Sasuke plays for real from here. Finish the match!' },
  ];

  class Director {
    constructor(ui) { this.ui = ui; this.i = 0; this.done = false; }
    step() { return STEPS[this.i]; }
    async runInfo() {
      while (!this.done && this.step() && this.step().t === 'info') {
        const s = this.step();
        await this.coach(s, true);
        this.i++;
        if (s.final) { this.done = true; this.hide(); }
      }
    }
    coach(s, needNext) {
      this.hide();
      const box = document.createElement('div');
      box.className = 'coach';
      const L = NS.Cards.byId['N-001'];
      box.innerHTML = `<div class="coach-ava" style="${NS.View.portraitCSS(L, 1.7)}"></div><div class="coach-body"><div class="coach-name">Tutorial · ${this.i + 1}/${STEPS.length}</div><div class="coach-text">${s.text}</div>${needNext ? `<button class="btn small" id="coachNext">${s.final ? 'Finish' : 'Next'} ${NS.icon('next')}</button>` : ''}<button class="coach-skip" id="coachSkip">Skip tutorial</button></div>`;
      document.body.appendChild(box);
      this.box = box;
      if (s.focus) { const f = document.querySelector(s.focus); if (f) { f.classList.add('coach-focus'); this.focused = f; } }
      $('#coachSkip', box).onclick = () => { this.done = true; this.hide(); if (this.skipResolve) this.skipResolve(); };
      NS.Audio.play('edge');
      if (!needNext) return Promise.resolve();
      return new Promise(r => { this.skipResolve = r; $('#coachNext', box).onclick = () => { NS.Audio.play('click'); r(); }; });
    }
    hide() {
      if (this.box) { this.box.remove(); this.box = null; }
      document.querySelectorAll('.coach-focus').forEach(e => e.classList.remove('coach-focus'));
    }
    refocus() {
      const s = this.step();
      if (!this.box || !s || !s.focus) return;
      const f = document.querySelector(s.focus);
      if (f && !f.classList.contains('coach-focus')) f.classList.add('coach-focus');
    }

    // ---- the human player's controller ----
    human(base) {
      const D = this;
      return {
        async takeMain(g, pi, acts) {
          await D.runInfo();
          const s = D.step();
          if (D.done || !s || s.t !== 'do') return base.takeMain(g, pi, acts);
          const allowed = acts.filter(s.expect);
          if (!allowed.length) { D.i++; return base.takeMain(g, pi, acts); }
          D.coach(s, false);
          const iv = setInterval(() => D.refocus(), 300);
          const a = await base.takeMain(g, pi, allowed);
          clearInterval(iv);
          D.hide(); D.i++;
          return a;
        },
        async respond(g, pi, win) {
          await D.runInfo();
          const s = D.step();
          if (D.done) return base.respond(g, pi, win);
          if (!s || s.t !== 'respond') return null;
          const opts = win.options.filter(s.pick);
          if (!opts.length) { D.i++; return null; }
          D.coach(s, false);
          const pick = await base.respond(g, pi, Object.assign({}, win, { options: opts, noSkip: true }));
          D.hide(); D.i++;
          return pick;
        },
        async choose(g, req) {
          await D.runInfo();
          const s = D.step();
          if (D.done || !s || s.t !== 'choose') return base.choose(g, req);
          const opts = req.options.filter(s.pick);
          if (!opts.length) { D.i++; return base.choose(g, req); }
          D.coach(s, false);
          const v = await base.choose(g, Object.assign({}, req, { options: opts, optional: false }));
          D.hide(); D.i++;
          return v;
        },
      };
    }
    // ---- the scripted rival ----
    rival() {
      const D = this;
      const ai = new NS.AI.AIController('genin');
      const plans = {
        1: [a => a.kind === 'summon' && a.card.card.id === 'N-019', a => a.kind === 'set' && a.card.card.id === 'N-010'],
        2: [a => a.kind === 'attack' && a.attacker.card && a.attacker.card.id === 'N-019' && a.target.isLeader],
      };
      return {
        async takeMain(g, pi, acts) {
          await D.runInfo();
          if (D.done) return ai.takeMain(g, pi, acts);
          await NS.wait(650 * NS.settings.speedMul());
          const plan = plans[g.p(pi).turns] || [];
          while (plan.length) { const f = plan.shift(); const a = acts.find(f); if (a) return a; }
          return { kind: 'end' };
        },
        async respond(g, pi, win) {
          if (D.done) return ai.respond(g, pi, win);
          await NS.wait(400 * NS.settings.speedMul());
          return win.kind === 'attack' && win.attack.target.isLeader ? (win.options.find(s => s.card.id === 'N-010') || null) : null;
        },
        async choose(g, req) { return ai.choose(g, req); },
      };
    }
  }

  function stacked(starterId, top) {
    const st = NS.STARTERS.find(s => s.id === starterId);
    const rest = NS.Cards.expand(st);
    top.forEach(id => { const k = rest.findIndex(c => c.id === id); if (k >= 0) rest.splice(k, 1); });
    return top.map(id => NS.Cards.byId[id]).concat(NS.shuffle(rest));
  }

  function start() {
    NS.Audio.ensure();
    const ui = new NS.GameUI({ humans: [true, false], hotseat: false });
    const D = new Director(ui);
    const g = new NS.Game({
      names: [NS.Screens.store.get('myName', 'Player'), 'Sasuke'], ui,
      house: Object.assign({}, NS.HOUSE_DEFAULTS, { mulligan: false }),
      controllers: [D.human(ui.controllerFor(0)), D.rival()],
      leaders: [NS.Cards.byId['N-001'], NS.Cards.byId['N-012']],
      decks: [stacked('st-red', ['N-007', 'N-008', 'N-005', 'N-006', 'N-018', 'N-004', 'N-003', 'N-011', 'N-002', 'N-009']), stacked('st-blue', ['N-019', 'N-010', 'N-021', 'N-017', 'N-013', 'N-015', 'N-020', 'N-022', 'N-014', 'N-016'])],
      noShuffle: true, first: 0,
    });
    ui.setGame(g);
    NS.Screens.setGame(g, ui);
    NS.debug = { ui, g, D };
    NS.Screens.show('game');
    NS.Audio.playTrack('battle');
    ui.render({ noFlip: true });
    g.start().finally(() => D.hide());
  }

  NS.Tutorial = { start, STEPS };
})();
