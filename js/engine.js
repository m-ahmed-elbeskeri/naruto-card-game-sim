/* ============================================================
   ENGINE — NARUTO CARD GAME (Bandai) pre-release rules
   Confirmed: 15 Life leaders, 5 Chakra flipped face-down to pay,
   [Recovery] rests the Leader to flip all Chakra face-up, Summon card
   rested to summon, face-down Support Area (max 5) activated with
   Chakra, EX Characters via [Summon Requirements], 4 phases
   (Refresh/Draw/Main/End), no attacking the turn a Character is played.
   Everything else comes from the House Rules (NS.HOUSE_DEFAULTS).
   Controllers: { takeMain(g, pi, actions), choose(g, req), respond(g, pi, window) }
   ============================================================ */
(function () {
  const NS = window.NTCG = window.NTCG || {};
  let UID = 1;
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const isAbort = e => e && e.message === 'aborted';

  class Game {
    constructor(o) {
      this.opts = o;
      this.house = Object.assign({}, NS.HOUSE_DEFAULTS, o.house || {});
      this.ui = o.ui || null;
      this.players = [0, 1].map(i => ({
        idx: i, name: o.names[i], controller: o.controllers[i],
        leader: { uid: 'L' + i, card: o.leaders[i], life: o.leaders[i].life || 15, rested: false, isLeader: true, owner: i, buffs: [], flags: {} },
        summonRested: false,
        chakra: [true, true, true, true, true],
        chakraLockUntil: -1,
        deck: (o.noShuffle ? x => x : shuffle)(o.decks[i].map(c => ({ iid: 'c' + (UID++), card: c, owner: i }))),
        hand: [], trash: [], exclusion: [],
        chars: [], supports: [],
        setThisTurn: 0, once: {},
      }));
      this.turn = 0;
      this.active = 0;
      this.first = 0;
      this.phase = 'setup';
      this.over = false;
      this.winner = null;
      this.aborted = false;
      this.chain = [];
    }
    p(i) { return this.players[i]; }
    abort() { this.aborted = true; }

    async emit(type, d) {
      if (this.aborted) throw new Error('aborted');
      if (this.ui && this.ui.onEvent) await this.ui.onEvent(type, d || {}, this);
    }
    say(msg, cls) { if (this.ui && this.ui.onLog) this.ui.onLog(msg, cls); }
    async choose(req) {
      if (this.aborted) throw new Error('aborted');
      if (!req.options || !req.options.length) return null;
      return this.p(req.player).controller.choose(this, req);
    }

    // ---------------- stats ----------------
    pow(u) {
      if (!u) return 0;
      let p = u.card.pow || 0;
      (u.buffs || []).forEach(b => { if (b.pow) p += b.pow; });
      if ((u.buffs || []).some(b => b.double)) p *= 2;
      return Math.max(0, p);
    }
    dmg(u) {
      let d = u.card.dmg || 0;
      (u.buffs || []).forEach(b => { if (b.dmg) d += b.dmg; });
      return Math.max(0, d);
    }
    hasRush(u) {
      if ((u.buffs || []).some(b => b.rush)) return true;
      if (u.isLeader || u.negated) return false;
      if ((u.card.text || []).some(x => x.startsWith('[Rush]'))) return true;
      if (u.card.id === 'N-007' && this.active === u.owner && this.pow(u) >= 10) return true;
      return false;
    }
    canAttack(u) {
      if (this.active !== u.owner || this.phase !== 'main' || this.over) return false;
      if (u.rested) return false;
      if (u.flags.cantAttackTurn === this.turn) return false;
      if (this.turn === 1 && !this.house.firstPlayerCanAttack) return false;
      if (u.isLeader) return !!this.house.leaderCanAttack;
      if (u.summonedTurn === this.turn && !this.hasRush(u)) return false;
      return true;
    }
    targetsFor(pi) {
      const O = this.p(1 - pi);
      return [O.leader].concat(O.chars.filter(c => !this.house.attackRestedOnly || c.rested));
    }
    faceUpChakra(pi) { return this.p(pi).chakra.filter(Boolean).length; }
    async payChakra(pi, n) {
      const P = this.p(pi);
      let paid = 0;
      for (let i = 4; i >= 0 && paid < n; i--) if (P.chakra[i]) { P.chakra[i] = false; paid++; }
      if (paid) await this.emit('chakra', { player: pi, amount: -paid });
      return paid === n;
    }
    unitName(u) { return u.isLeader ? `${u.card.name} (Leader)` : u.card.name; }
    hasName(pi, name) { return this.p(pi).chars.some(u => u.card.name === name); }

    // ---------------- legal main actions ----------------
    mainActions(pi) {
      const P = this.p(pi), H = this.house, out = [];
      const space = P.chars.length < H.charLimit;
      for (const c of P.hand) {
        if (c.card.type === 'character' && !P.summonRested && space) out.push({ kind: 'summon', card: c });
        if (c.card.type === 'ex' && (!H.exUsesSummonCard || !P.summonRested) && this.exTributeSets(pi, c.card).length) out.push({ kind: 'ex', card: c });
        if (c.card.support && P.supports.length < 5 && (!H.setLimitPerTurn || P.setThisTurn < H.setLimitPerTurn)) out.push({ kind: 'set', card: c });
      }
      for (const s of P.supports) {
        const sp = s.card.support;
        if ((sp.timing === 'main' || sp.timing === 'quick') && this.faceUpChakra(pi) >= sp.cost && this.supportUsable(pi, s, { kind: 'main' })) out.push({ kind: 'support', sup: s });
      }
      const L = P.leader;
      if (NS.LEADER[L.card.id] && NS.LEADER[L.card.id].usable(this, pi)) out.push({ kind: 'leaderAbility' });
      if (!L.rested && this.turn >= 2 && this.turn > P.chakraLockUntil && this.faceUpChakra(pi) < 5) out.push({ kind: 'recovery' });
      for (const u of P.chars) if (NS.ABILITY[u.card.id] && !u.negated && NS.ABILITY[u.card.id].usable(this, pi, u)) out.push({ kind: 'charAbility', unit: u });
      for (const a of [L].concat(P.chars)) if (this.canAttack(a)) for (const t of this.targetsFor(pi)) out.push({ kind: 'attack', attacker: a, target: t });
      out.push({ kind: 'end' });
      return out;
    }
    supportUsable(pi, s, win) {
      const def = NS.SUPPORTS[s.card.id];
      if (def && def.usable) return def.usable(this, pi, s, win || {});
      return true;
    }
    // EX summon requirements -> list of valid tribute arrays
    exTributeSets(pi, card) {
      const reqs = NS.EX_REQ[card.id] || [];
      const chars = this.p(pi).chars;
      const out = [];
      const rec = (i, used) => {
        if (out.length > 40) return;
        if (i === reqs.length) { out.push(used.slice()); return; }
        for (const u of chars) if (!used.includes(u) && reqs[i](this, u)) { used.push(u); rec(i + 1, used); used.pop(); }
      };
      if (reqs.length) rec(0, []);
      return out;
    }

    // ---------------- flow ----------------
    async start() {
      try {
        const H = this.house;
        this.first = this.opts.first != null ? this.opts.first : (Math.random() < 0.5 ? 0 : 1);
        this.say(`${this.p(this.first).name} goes first.`, 'sys');
        await this.emit('coin', { player: this.first });
        for (const i of [0, 1]) await this.draw(i, H.handSize, true);
        await this.emit('dealt');
        if (H.mulligan) for (const i of [this.first, 1 - this.first]) {
          const r = await this.choose({ player: i, kind: 'mulligan', options: ['keep', 'mulligan'], prompt: 'Keep this hand or mulligan?', ai: o => o === 'keep' ? NS.AI.handScore(this, i) : 5 });
          if (r === 'mulligan') {
            const P = this.p(i);
            P.deck.push(...P.hand); P.hand = []; shuffle(P.deck);
            this.say(`${P.name} redraws their hand.`, 'sys');
            await this.draw(i, H.handSize, true);
            await this.emit('mulligan', { player: i });
          }
        }
        this.active = this.first;
        while (!this.over && this.turn < 200) {
          this.turn++;
          await this.playTurn(this.active);
          if (this.over) break;
          this.active = 1 - this.active;
        }
        this.phase = 'over';
        await this.emit('gameOver', { winner: this.winner });
      } catch (e) {
        if (isAbort(e)) return;
        console.error(e); throw e;
      }
    }

    async playTurn(pi) {
      const P = this.p(pi);
      P.once = {}; P.setThisTurn = 0;
      this.phase = 'refresh';
      await this.emit('turn', { player: pi, turn: this.turn });
      P.leader.rested = false; P.summonRested = false;
      P.chars.forEach(u => { u.rested = false; });
      await this.emit('refresh', { player: pi });
      this.phase = 'draw';
      if (!(this.turn === 1 && !this.house.firstPlayerDraws)) {
        await this.draw(pi, this.house.drawPerTurn);
        if (this.over) return;
      }
      this.phase = 'main';
      await this.emit('phase', { phase: 'main', player: pi });
      let guard = 0;
      while (!this.over && guard++ < 150) {
        const acts = this.mainActions(pi);
        const a = await P.controller.takeMain(this, pi, acts);
        if (!a || a.kind === 'end') break;
        await this.doAction(pi, a);
      }
      if (this.over) return;
      this.phase = 'end';
      for (const pl of this.players) for (const u of [pl.leader].concat(pl.chars)) u.buffs = (u.buffs || []).filter(b => b.until !== 'turn');
      await this.emit('phase', { phase: 'end', player: pi });
    }

    async draw(pi, n, silent) {
      const P = this.p(pi);
      let k = 0;
      for (; k < n; k++) {
        if (!P.deck.length) {
          if (this.house.deckOutLoses && !silent) { this.say(`${P.name} cannot draw — deck out!`, 'ko'); await this.lose(pi); }
          break;
        }
        const c = P.deck.shift();
        P.hand.push(c);
        await this.emit('draw', { player: pi, card: c, silent });
      }
      if (!silent && k) this.say(`${P.name} draws ${k}.`, 'draw');
      return k;
    }
    async lose(pi) { if (this.over) return; this.over = true; this.winner = 1 - pi; }

    // ---------------- actions ----------------
    async doAction(pi, a) {
      const P = this.p(pi);
      const legal = this.mainActions(pi).find(x => x.kind === a.kind && x.card === a.card && x.sup === a.sup && x.unit === a.unit && x.attacker === a.attacker && x.target === a.target);
      if (!legal) { this.say('That action is no longer legal.', 'sys'); return; }
      switch (a.kind) {
        case 'summon':
          P.summonRested = true;
          await this.emit('summonCard', { player: pi });
          await this.summon(pi, a.card, 'hand');
          break;
        case 'ex': {
          const reqs = NS.EX_REQ[a.card.card.id];
          const chosen = [];
          for (let i = 0; i < reqs.length; i++) {
            const sets = this.exTributeSets(pi, a.card.card).filter(s => chosen.every((c, j) => s[j] === c));
            const uniq = [...new Set(sets.map(s => s[i]))];
            const u = uniq.length === 1 ? uniq[0] : await this.choose({ player: pi, kind: 'unit', options: uniq, prompt: `Summon Requirements for ${a.card.card.name}: choose Character ${i + 1}/${reqs.length} to place in your trash`, must: true, ai: x => -NS.AI.unitValue(this, x) });
            chosen.push(u || uniq[0]);
          }
          if (this.house.exUsesSummonCard) { P.summonRested = true; await this.emit('summonCard', { player: pi }); }
          this.say(`${P.name} fulfils the Summon Requirements of ${a.card.card.name}!`, 'ex');
          for (const u of chosen) await this.toTrash(u, 'tribute');
          await this.summon(pi, a.card, 'hand', { ex: true });
          break;
        }
        case 'set':
          P.hand.splice(P.hand.indexOf(a.card), 1);
          a.card.setTurn = this.turn;
          P.supports.push(a.card);
          P.setThisTurn++;
          this.say(`${P.name} sets a card face-down in the Support Area.`, 'set');
          await this.emit('set', { player: pi, sup: a.card });
          break;
        case 'support': await this.activateSupport(pi, a.sup, { kind: 'main' }); break;
        case 'leaderAbility': await this.safe(() => NS.LEADER[P.leader.card.id].run(this.ctx(pi, P.leader))); break;
        case 'recovery':
          P.leader.rested = true;
          P.chakra = [true, true, true, true, true];
          this.say(`${P.name} uses [Recovery] — all Chakra flipped face-up!`, 'chakra');
          await this.emit('recovery', { player: pi });
          break;
        case 'charAbility': await this.safe(() => NS.ABILITY[a.unit.card.id].run(this.ctx(pi, a.unit))); break;
        case 'attack': await this.attack(pi, a.attacker, a.target); break;
      }
      await this.checkLife();
    }
    ctx(pi, self, extra) { return Object.assign({ g: this, pi, opp: 1 - pi, self }, extra || {}); }
    async safe(fn) { try { await fn(); } catch (e) { if (isAbort(e)) throw e; console.error(e); } }

    // put a card into the Character Area
    async summon(pi, ci, from, o) {
      o = o || {};
      const P = this.p(pi);
      if (P.chars.length >= this.house.charLimit) { this.say('The Character Area is full.', 'sys'); return null; }
      [P.hand, P.deck, P.trash, P.supports].forEach(z => { const i = z.indexOf(ci); if (i >= 0) z.splice(i, 1); });
      const u = { uid: 'U' + (UID++), card: ci.card, iid: ci.iid, owner: pi, rested: false, summonedTurn: this.turn, buffs: [], flags: {}, negated: !!o.negated };
      P.chars.push(u);
      const where = { support: ' from the Support Area', trash: ' from the trash', deck: ' from the deck' }[from] || '';
      this.say(`${P.name} summons ${u.card.name}${where}${o.negated ? ' (effects negated)' : ''}!`, o.ex ? 'ex' : 'summon');
      await this.emit('summon', { player: pi, unit: u, from, ex: !!o.ex, sup: from === 'support' ? ci : null });
      if (!u.negated && NS.ON_SUMMON[u.card.id]) await this.safe(() => NS.ON_SUMMON[u.card.id](this.ctx(pi, u)));
      return u;
    }
    async toTrash(u, how) {
      const P = this.p(u.owner);
      if (!P.chars.includes(u)) return false;
      await this.emit(how === 'tribute' ? 'tribute' : 'ko', { unit: u });
      P.chars.splice(P.chars.indexOf(u), 1);
      P.trash.push({ iid: u.iid, card: u.card, owner: u.owner });
      return true;
    }
    immune(u, viaSupportOf) { return viaSupportOf != null && viaSupportOf !== u.owner && u.flags.immuneSupportTurn === this.turn; }
    async ko(u, viaSupportOf) {
      if (!u || !this.p(u.owner).chars.includes(u)) return false;
      if (this.immune(u, viaSupportOf)) { this.say(`${u.card.name} is unaffected by the opponent's Support!`, 'sys'); await this.emit('immune', { unit: u }); return false; }
      this.say(`${u.card.name} is K.O.'d!`, 'ko');
      return this.toTrash(u, 'ko');
    }
    async bounce(u, viaSupportOf) {
      const P = this.p(u.owner);
      if (!P.chars.includes(u)) return false;
      if (this.immune(u, viaSupportOf)) { await this.emit('immune', { unit: u }); return false; }
      await this.emit('bounce', { unit: u });
      P.chars.splice(P.chars.indexOf(u), 1);
      P.hand.push({ iid: u.iid, card: u.card, owner: u.owner });
      this.say(`${u.card.name} returns to its owner's hand.`, 'move');
      return true;
    }
    async changeLife(pi, n, source) {
      const L = this.p(pi).leader;
      L.life = Math.max(0, L.life + n);
      this.say(`${this.p(pi).name} ${n < 0 ? 'loses' : 'gains'} ${Math.abs(n)} Life (${L.life} left).`, n < 0 ? 'dmg' : 'heal');
      await this.emit('life', { player: pi, amount: n, source });
    }
    async checkLife() {
      for (const i of [0, 1]) if (this.p(i).leader.life <= 0 && !this.over) { this.say(`${this.p(i).name}'s Leader has fallen!`, 'win'); await this.lose(i); }
    }

    // ---------------- supports & chain ----------------
    async activateSupport(pi, s, win) {
      const P = this.p(pi), sp = s.card.support;
      if (!P.supports.includes(s)) return;
      await this.payChakra(pi, sp.cost);
      const link = { pi, sup: s, negated: false };
      this.chain.push(link);
      this.say(`${P.name} flips ${s.card.name}: ${sp.name}!`, 'support');
      await this.emit('supportFlip', { player: pi, sup: s, attack: win && win.attack });
      await this.responseWindow(1 - pi, { kind: 'support', link });
      this.chain.pop();
      if (link.negated) {
        this.say(`${sp.name} is negated!`, 'ko');
        const i = P.supports.indexOf(s);
        if (i >= 0) { P.supports.splice(i, 1); P.trash.push(s); }
        await this.emit('supportEnd', { player: pi, sup: s, negated: true });
        return;
      }
      const def = NS.SUPPORTS[s.card.id];
      if (def && def.resolve) await this.safe(() => def.resolve(this.ctx(pi, null, { sup: s, link, win })));
      const j = P.supports.indexOf(s);
      if (j >= 0) { P.supports.splice(j, 1); P.trash.push(s); }
      await this.emit('supportEnd', { player: pi, sup: s });
      await this.checkLife();
    }
    // a player may activate eligible supports during a window, one after another
    async responseWindow(pi, win) {
      for (let guard = 0; guard < 6 && !this.over; guard++) {
        const P = this.p(pi);
        const opts = P.supports.filter(s => {
          const t = s.card.support.timing;
          if (this.faceUpChakra(pi) < s.card.support.cost) return false;
          let okT = false;
          if (win.kind === 'support') okT = t === 'supportActivated' || t === 'quick';
          if (win.kind === 'attack') okT = (t === 'oppAttack' && this.active !== pi) || t === 'quick';
          return okT && this.supportUsable(pi, s, win);
        });
        if (!opts.length) return;
        const pick = await P.controller.respond(this, pi, Object.assign({ options: opts }, win));
        if (!pick) return;
        await this.activateSupport(pi, pick, win);
        if (win.kind === 'support' && win.link.negated) return;
        if (win.kind === 'attack' && win.attack.interrupted) return;
      }
    }

    // ---------------- battle ----------------
    async attack(pi, attacker, target) {
      const P = this.p(pi);
      attacker.rested = true;
      const atk = { attacker, target, pi, interrupted: false };
      this.say(`${P.name}: ${this.unitName(attacker)} attacks ${this.unitName(target)}!`, 'attack');
      await this.emit('attack', { attacker, target, player: pi });
      if (!attacker.isLeader && !attacker.negated && NS.WHEN_ATTACKING[attacker.card.id]) await this.safe(() => NS.WHEN_ATTACKING[attacker.card.id](this.ctx(pi, attacker, { attack: atk })));
      await this.responseWindow(1 - pi, { kind: 'attack', attack: atk });
      if (!atk.interrupted && !this.over) await this.responseWindow(pi, { kind: 'attack', attack: atk });
      const alive = attacker.isLeader || P.chars.includes(attacker);
      if (atk.interrupted) { this.say('The attack is interrupted!', 'support'); await this.emit('interrupted', { attack: atk }); return; }
      if (!alive) { await this.emit('fizzle', { attack: atk }); return; }
      if (target.isLeader) {
        const d = this.dmg(attacker);
        await this.emit('hit', { attacker, target, amount: d });
        await this.changeLife(target.owner, -d, attacker);
      } else {
        if (!this.p(target.owner).chars.includes(target)) { await this.emit('fizzle', { attack: atk }); return; }
        const pw = this.pow(attacker);
        await this.emit('hit', { attacker, target, amount: pw });
        if (pw >= (target.card.hp || 0)) await this.ko(target, null);
        else { this.say(`${target.card.name} withstands the blow (${pw} POW vs ${target.card.hp} HP).`, 'sys'); await this.emit('withstand', { target }); }
      }
      await this.checkLife();
    }
  }

  NS.Game = Game;
  NS.shuffle = shuffle;
})();
