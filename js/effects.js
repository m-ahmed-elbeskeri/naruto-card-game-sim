/* ============================================================
   EFFECTS — every revealed NARUTO CARD GAME card, scripted
   ============================================================ */
(function () {
  const NS = window.NTCG = window.NTCG || {};
  const hasTrait = (card, t) => (card.traits || []).includes(t);
  const allChars = g => g.p(0).chars.concat(g.p(1).chars);
  const val = (g, u) => NS.AI ? NS.AI.unitValue(g, u) : 1;
  const harm = (g, pi) => u => (u.owner !== pi ? 1 : -1) * val(g, u);
  const help = (g, pi) => u => (u.owner === pi ? 1 : -1) * val(g, u);

  async function pickUnit(c, options, prompt, o) {
    o = o || {};
    if (!options.length) return null;
    return c.g.choose({ player: o.chooser != null ? o.chooser : c.pi, kind: 'unit', options, prompt, optional: !o.must, ai: o.ai || harm(c.g, c.pi) });
  }
  async function revealTop(c) {
    const P = c.g.p(c.pi);
    const top = P.deck[0];
    if (!top) return null;
    c.g.say(`${P.name} reveals the top card of their deck: ${top.card.name}.`, 'sys');
    await c.g.emit('revealTop', { player: c.pi, card: top });
    return top;
  }
  const space = c => c.g.p(c.pi).chars.length < c.g.house.charLimit;

  // ---------- EX Summon Requirements (ordered tribute slots) ----------
  NS.EX_REQ = {
    'N-003': [(g, u) => true, (g, u) => g.pow(u) >= 10],
    'N-005': [(g, u) => g.pow(u) >= 10],
    'N-014': [(g, u) => true, (g, u) => hasTrait(u.card, 'The Taka')],
    'N-022': [(g, u) => true],
  };

  // ---------- [On Summon] ----------
  NS.ON_SUMMON = {
    'N-003': async c => {
      if (!space(c)) return;
      const P = c.g.p(c.pi);
      const pool = P.deck.concat(P.trash).filter(x => x.card.name === 'Naruto Uzumaki' && x.card.type === 'character');
      if (!pool.length) return;
      const pick = await c.g.choose({ player: c.pi, kind: 'card', options: pool, prompt: 'Summon up to 1 [Naruto Uzumaki] from your deck or trash (effects negated)', optional: true, ai: x => x.card.pow + x.card.hp });
      if (!pick) return;
      const fromDeck = P.deck.includes(pick);
      await c.g.summon(c.pi, pick, fromDeck ? 'deck' : 'trash', { negated: true });
      if (fromDeck) NS.shuffle(P.deck, c.g.rng);
    },
    'N-005': async c => {
      if (!space(c)) return;
      const P = c.g.p(c.pi);
      const pool = P.trash.filter(x => x.card.type === 'character' && ['Naruto Uzumaki', 'Jiraiya', 'Minato Namikaze'].includes(x.card.name));
      const pick = await c.g.choose({ player: c.pi, kind: 'card', options: pool, prompt: 'Gamabunta: summon a non-EX Naruto, Jiraiya or Minato from your trash', optional: false, ai: x => x.card.pow + x.card.hp });
      if (pick) await c.g.summon(c.pi, pick, 'trash');
    },
    'N-013': async c => {
      const g = c.g;
      const opts = [g.p(c.opp).leader].concat(allChars(g));
      const t = await pickUnit(c, opts, 'Itachi: choose a Leader or Character (it may be unable to attack next turn)', { must: true, ai: u => (u.owner !== c.pi ? 1 : -2) * (u.isLeader ? 2 : val(g, u)) });
      const top = await revealTop(c);
      if (t && top && hasTrait(top.card, 'Uchiha Clan')) {
        t.flags.cantAttackTurn = g.turn + 1;
        g.say(`Tsukuyomi! ${g.unitName(t)} cannot attack during the next turn.`, 'support');
        await g.emit('genjutsu', { unit: t });
      } else if (top) g.say(`Not an Uchiha — the genjutsu fails.`, 'sys');
    },
    'N-014': async c => {
      const t = await pickUnit(c, allChars(c.g).filter(u => u !== c.self), 'EX Sasuke: choose 1 Character to K.O.', { must: false });
      if (t) await c.g.ko(t, null);
    },
    'N-022': async c => {
      const top = await revealTop(c);
      if (top && top.card.type === 'character' && space(c)) await c.g.summon(c.pi, top, 'deck');
    },
  };

  // ---------- [When Attacking] ----------
  NS.WHEN_ATTACKING = {
    'N-019': async c => {
      const top = await revealTop(c);
      if (top && top.card.type !== 'ex' && (top.card.name === 'Sasuke Uchiha' || hasTrait(top.card, 'The Taka')) && space(c)) await c.g.summon(c.pi, top, 'deck');
    },
  };

  // ---------- Leader [Activate: Main] ----------
  NS.LEADER = {
    'N-001': {
      label: '+3 Power (flip 1 Chakra)',
      usable: (g, pi) => g.faceUpChakra(pi) >= 1 && allChars(g).length > 0,
      run: async c => {
        const g = c.g;
        const ai = u => help(g, c.pi)(u) + (u.owner === c.pi && g.pow(u) < 10 && g.pow(u) + 3 >= 10 ? 6 : 0) + (u.owner === c.pi && g.canAttack(u) ? 3 : 0);
        const t = await pickUnit(c, allChars(g), 'Naruto: choose 1 Character to get +3 power this turn', { must: true, ai });
        if (!t) return;
        await c.g.payChakra(c.pi, 1);
        t.buffs.push({ pow: 3, until: 'turn' });
        c.g.say(`${t.card.name} gets +3 power!`, 'power');
        await c.g.emit('buff', { unit: t, text: '+3 POW' });
      },
    },
    'N-012': {
      label: 'Draw 1, then put 1 on top (once per turn)',
      usable: (g, pi) => !g.p(pi).once['N-012'] && g.p(pi).deck.length > 0,
      run: async c => {
        const P = c.g.p(c.pi);
        P.once['N-012'] = true;
        await c.g.draw(c.pi, 1);
        const k = await c.g.choose({ player: c.pi, kind: 'card', options: P.hand.slice(), prompt: 'Place 1 card from your hand on top of your deck', optional: false, zone: 'hand', ai: x => -NS.AI.cardValue(c.g, c.pi, x) });
        if (k) { P.hand.splice(P.hand.indexOf(k), 1); P.deck.unshift(k); await c.g.emit('toDeck', { player: c.pi }); }
      },
    },
  };

  // ---------- Character [Activate: Main] ----------
  NS.ABILITY = {
    'N-011': {
      label: 'Ino-Shika-Cho formation',
      usable: (g, pi, u) => !g.p(pi).once['N-011:' + u.uid] && g.hasName(pi, 'Shikamaru Nara') && g.hasName(pi, 'Choji Akimichi'),
      run: async c => {
        c.g.p(c.pi).once['N-011:' + c.self.uid] = true;
        for (const u of c.g.p(c.pi).chars.filter(u => ['Ino Yamanaka', 'Shikamaru Nara', 'Choji Akimichi'].includes(u.card.name))) {
          u.buffs.push({ pow: 5, dmg: 1, rush: true, until: 'turn' });
          await c.g.emit('buff', { unit: u, text: '+5 POW +1 DMG RUSH' });
        }
        c.g.say('Ino-Shika-Cho! Team 10 gains [Rush] and +5 power/+1 damage.', 'power');
      },
    },
  };

  // ---------- [Support] effects ----------
  const koRested = {
    usable: (g, pi, s, w) => w.kind === 'attack' && allChars(g).some(u => u.rested),
    resolve: async c => {
      const g = c.g; const done = [];
      for (let i = 0; i < 2; i++) {
        const t = await pickUnit(c, allChars(g).filter(u => u.rested && !done.includes(u)), `Choose up to 2 rested Characters to K.O. (${i + 1}/2)`);
        if (!t) break;
        done.push(t);
      }
      for (const t of done) await g.ko(t, c.pi);
    },
  };
  const koAll = {
    usable: (g, pi, s, w) => w.kind === 'main' && allChars(g).length > 0,
    resolve: async c => { for (const u of allChars(c.g).slice()) await c.g.ko(u, c.pi); },
  };
  const negate = extra => ({
    usable: (g, pi, s, w) => w.kind === 'support' && w.link && w.link.pi !== pi,
    resolve: async c => { if (c.win && c.win.link) c.win.link.negated = true; await extra(c); },
  });

  NS.SUPPORTS = {
    'N-004': koAll,
    'N-015': koAll,
    'N-006': koRested,
    'N-017': koRested,
    'N-008': {
      usable: (g, pi, s, w) => w.kind === 'attack',
      resolve: async c => {
        if (c.g.p(c.pi).chars.length < c.g.house.charLimit) await c.g.summon(c.pi, c.sup, 'support');
        if (c.win && c.win.attack) c.win.attack.interrupted = true;
      },
    },
    'N-010': {
      usable: (g, pi, s, w) => w.kind === 'attack',
      resolve: async c => {
        if (c.g.p(c.pi).chars.length < c.g.house.charLimit) await c.g.summon(c.pi, c.sup, 'support');
        await c.g.changeLife(c.pi, 2);
      },
    },
    'N-020': {
      usable: (g, pi, s, w) => w.kind === 'attack' && allChars(g).length > 0,
      resolve: async c => { const t = await pickUnit(c, allChars(c.g), 'Cha! Return 1 Character to its owner\'s hand', { must: true }); if (t) await c.g.bounce(t, c.pi); },
    },
    'N-018': {
      usable: (g, pi, s, w) => w.kind === 'attack' && allChars(g).some(u => u.card.type !== 'ex'),
      resolve: async c => { const t = await pickUnit(c, allChars(c.g).filter(u => u.card.type !== 'ex'), 'Air Palm: choose 1 non-EX Character to K.O.', { must: true }); if (t) await c.g.ko(t, c.pi); },
    },
    'N-002': {
      usable: (g, pi) => allChars(g).length > 0 && g.p(pi).chars.length < g.house.charLimit,
      resolve: async c => {
        const t = await pickUnit(c, allChars(c.g), 'Expansion Jutsu: choose 1 Character to double its power', { must: true, ai: help(c.g, c.pi) });
        await c.g.summon(c.pi, c.sup, 'support');
        if (t) { t.buffs.push({ double: true, until: 'turn' }); await c.g.emit('buff', { unit: t, text: 'POW ×2' }); }
      },
    },
    'N-021': {
      usable: (g, pi) => g.p(pi).chars.length < g.house.charLimit,
      resolve: async c => {
        const opts = c.g.p(c.pi).chars.slice();
        const t = opts.length ? await pickUnit(c, opts, 'Water Transformation: choose 1 Character to shield from opponent Supports', { must: true, ai: help(c.g, c.pi) }) : null;
        const u = await c.g.summon(c.pi, c.sup, 'support');
        const target = t || u;
        if (target) { target.flags.immuneSupportTurn = c.g.turn; await c.g.emit('buff', { unit: target, text: 'SHIELDED' }); }
      },
    },
    'N-009': negate(async c => c.g.changeLife(c.pi, -2)),
    'N-016': negate(async c => {
      const g = c.g;
      c.g.p(c.pi).chakraLockUntil = g.active === c.pi ? g.turn + 2 : g.turn + 1;
      g.say(`${g.p(c.pi).name} cannot flip Chakra face-up until the end of their next turn.`, 'sys');
    }),
  };
})();
