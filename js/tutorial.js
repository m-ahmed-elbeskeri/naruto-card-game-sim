/* ============================================================
   TUTORIAL — guided match with stacked decks, a scripted rival
   and a coach that only allows the move being taught.
   ============================================================ */
(function () {
  const NS = window.NTCG = window.NTCG || {};
  const $ = (s, r) => (r || document).querySelector(s);

  const STEPS = [
    { t: 'info', text: 'Welcome to the <b>NARUTO CARD GAME</b>! This short lesson teaches you everything with a real match. You play <b>Naruto (Red)</b> against <b>Sasuke (Blue)</b>.' },
    { t: 'info', focus: '[data-zone="life-0"]', text: 'This is your <b>Leader</b>. It starts with <b>15 LIFE</b>. Get your rival\'s Leader to <b>0</b> and you win.' },
    { t: 'info', focus: '[data-zone="life-1"]', text: 'This is your rival\'s Leader, Sasuke. Every hit on a Leader removes Life equal to the attacker\'s <b>DMG</b>.' },
    { t: 'info', focus: '[data-zone="chakra-0"]', text: 'These are your <b>5 Chakra cards</b>. To use jutsu you turn them <b>face-down</b>. They don\'t come back on their own — only your Leader\'s <b>[Recovery]</b> refills them.' },
    { t: 'info', focus: '[data-k="SUM0"]', text: 'This is your <b>Summon card</b>. Rest it to bring one Character from your hand onto the field. That\'s <b>one normal summon per turn</b>.' },
    { t: 'do', focus: '[data-zone="hand"]', text: 'Let\'s summon! Click <b>Minato Namikaze</b> in your hand and choose <b>Summon</b>.', expect: a => a.kind === 'summon' && a.card.card.id === 'N-007' },
    { t: 'info', focus: '[data-zone="chars-0"]', text: 'Minato has joined the front line! Characters <b>can\'t attack on the turn they\'re summoned</b> unless they have <span class="kw rush">Rush</span>. Minato gets Rush on your turn whenever he has 10+ power.' },
    { t: 'do', focus: '[data-zone="hand"]', text: 'Now the core trick of this game: click <b>Shikamaru Nara</b> and choose <b>Set face-down as Support</b>.', expect: a => a.kind === 'set' && a.card.card.id === 'N-008' },
    { t: 'info', focus: '[data-zone="support-0"]', text: 'Your <b>Support Area</b> holds up to 5 face-down cards. Each one hides a jutsu you can trigger later by paying its Chakra cost. Shikamaru\'s <i>Shadow Possession Jutsu</i> costs 1 Chakra and fires <b>during your opponent\'s attack</b>.' },
    { t: 'do', focus: '#endBtn', text: 'The first player can\'t attack on turn 1, so click <b>End Turn</b>. Then watch what Sasuke does…', expect: a => a.kind === 'end' },
    { t: 'respond', text: 'Sasuke\'s Leader is attacking you! Flip <b>Shikamaru</b> — <i>Shadow Possession Jutsu</i> — to stop the attack.', pick: s => s.card.id === 'N-008' },
    { t: 'info', focus: '[data-zone="chars-0"]', text: '<b>ATTACK CANCEL!</b> One Chakra card turned face-down to pay, and Shikamaru was summoned from the Support Area. Traps like this are the heart of the game — face-down cards are always a threat.' },
    { t: 'info', focus: '#phaseDots', text: 'It\'s your turn again. Each turn runs <b>Refresh</b> (your rested cards stand up) → <b>Draw</b> → <b>Main</b> → <b>End</b>. You do everything in the Main phase: summon, set, use abilities and attack.' },
    { t: 'do', focus: '[data-k="L0"]', text: 'Click your <b>Leader</b> and use its ability: flip 1 Chakra to give a Character <b>+3 power</b>.', expect: a => a.kind === 'leaderAbility' },
    { t: 'choose', text: 'Give the +3 power to <b>Minato</b>.', pick: u => u.card && u.card.id === 'N-007' },
    { t: 'info', focus: '[data-zone="chars-0"]', text: 'Minato now has <b>11 power</b>! That unlocks <b>EX Characters</b>. <b>Gamabunta</b> in your hand needs "1 Character with 10 or more power" placed in your trash as its <span class="kw req">Summon Requirement</span>.' },
    { t: 'do', focus: '[data-zone="hand"]', text: 'Click <b>Gamabunta</b> and choose <b>EX Summon</b>. Minato goes to the trash to call the Chief Toad!', expect: a => a.kind === 'ex' && a.card.card.id === 'N-005' },
    { t: 'choose', text: 'Gamabunta\'s <span class="kw on">On Summon</span>: bring <b>Minato</b> back from your trash!', pick: c => c.card && c.card.id === 'N-007' },
    { t: 'info', focus: '[data-zone="chars-0"]', text: 'A classic combo: you got a <b>10-power EX Character</b> and kept Minato. Remember, anything summoned this turn can\'t attack yet.' },
    { t: 'do', focus: '[data-zone="chars-0"]', text: 'Shikamaru has been on the field since your rival\'s turn, so he <b>can</b> attack. Click <b>Shikamaru</b> → <b>Attack…</b> → click the <b>enemy Leader</b>.', expect: a => a.kind === 'attack' && a.attacker.card && a.attacker.card.id === 'N-008' && a.target.isLeader },
    { t: 'info', focus: '[data-zone="chars-1"]', text: 'Your rival flipped a trap: <b>Karin</b> summoned herself and <b>gained 2 Life</b>. Your hit still landed. Always count your rival\'s face-down Supports before you attack!' },
    { t: 'info', focus: '[data-zone="chars-0"]', text: 'Attacking <b>rests</b> (turns sideways) a Character. Rested Characters <b>can be attacked</b>: if the attacker\'s <b>POW ≥ the target\'s HP</b>, the target is K.O.\'d. Keep that in mind when choosing who to send in.' },
    { t: 'do', focus: '[data-k="L0"]', text: 'You\'ve spent Chakra. Click your <b>Leader</b> → <b>[Recovery]</b> to rest your Leader and flip <b>all</b> Chakra face-up again.', expect: a => a.kind === 'recovery' },
    { t: 'info', focus: '[data-zone="chakra-0"]', text: 'All 5 Chakra are ready for your traps. The price: your Leader is rested, so it can\'t attack this turn. Balancing Leader attacks against Recovery is a key decision.' },
    { t: 'do', focus: '#endBtn', text: 'Great work! Click <b>End Turn</b>.', expect: a => a.kind === 'end' },
    { t: 'info', final: true, text: '<b>Tutorial complete!</b> You know the whole game loop: summon, set Supports, react with jutsu, EX summon, attack and Recover. Sasuke will now play for real — finish the match!' },
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
      const plan = [
        a => a.kind === 'summon' && a.card.card.id === 'N-019',
        a => a.kind === 'set' && a.card.card.id === 'N-010',
        a => a.kind === 'attack' && a.attacker.isLeader && a.target.isLeader,
      ];
      return {
        async takeMain(g, pi, acts) {
          await D.runInfo();
          if (D.done) return ai.takeMain(g, pi, acts);
          await NS.wait(650 * NS.settings.speedMul());
          while (plan.length) { const f = plan.shift(); const a = acts.find(f); if (a) return a; }
          return { kind: 'end' };
        },
        async respond(g, pi, win) {
          if (D.done) return ai.respond(g, pi, win);
          await NS.wait(400 * NS.settings.speedMul());
          return win.kind === 'attack' ? (win.options.find(s => s.card.id === 'N-010') || null) : null;
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
      house: Object.assign({}, NS.HOUSE_DEFAULTS, { mulligan: false, handSize: 5, drawPerTurn: 1, firstPlayerDraws: false, firstPlayerCanAttack: false, leaderCanAttack: true, attackRestedOnly: true, charLimit: 5 }),
      controllers: [D.human(ui.controllerFor(0)), D.rival()],
      leaders: [NS.Cards.byId['N-001'], NS.Cards.byId['N-012']],
      decks: [stacked('st-red', ['N-007', 'N-008', 'N-005', 'N-006', 'N-018', 'N-020']), stacked('st-blue', ['N-019', 'N-010', 'N-021', 'N-017', 'N-013', 'N-022'])],
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
