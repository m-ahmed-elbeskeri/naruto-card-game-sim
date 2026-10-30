// The per-unit encoding shared by featurize.js (training data) and nets.js (playing): one token per leader,
// Character, hand card, set Support and chain link, F numbers each plus a card index (0 = none / hidden), and
// for every candidate move the token it acts with and the token it targets (-1: none).
// Tokens 0..11 are fixed slots: my leader, their leader, my 5 Characters, their 5 Characters.
module.exports = NS => {
  const IDS = Object.keys(NS.Cards.byId).sort(), IDX = {};
  IDS.forEach((id, i) => { IDX[id] = i + 1; });
  const T = 36, F = 32, SLOTS = 12, TIMING = ['main', 'quick', 'oppAttack', 'supportActivated'];
  function tokens(g, pi, D) {
    const P = g.p(pi), O = g.p(1 - pi);
    const tok = new Float32Array(T * F), card = new Int8Array(T), where = new Map();
    let k = SLOTS;
    const put = (i, type, obj, c, mine, fill) => {
      const f = tok.subarray(i * F, (i + 1) * F);
      f[type - 1] = 1; f[7] = mine ? 1 : 0;
      card[i] = c ? IDX[c.id] || 0 : 0;
      if (c) {
        f[8] = (c.pow || 0) / 15; f[9] = (c.dmg || 0) / 5; f[10] = (c.hp || 0) / 15; f[11] = (c.hp || 0) / 15; f[28] = c.type === 'ex' ? 1 : 0;
        const sp = c.support;
        if (sp) { f[22] = sp.cost / 2; f[23 + Math.max(0, TIMING.indexOf(sp.timing))] = 1; }
      }
      if (fill) fill(f);
      if (obj) where.set(obj, i);
    };
    const unit = u => f => {
      f[8] = g.pow(u) / 15; f[9] = g.dmg(u) / 5; f[10] = g.hpLeft(u) / 15; f[12] = u.isLeader ? u.life / 15 : 0;
      f[13] = u.rested ? 1 : 0; f[14] = !u.isLeader && u.summonedTurn === g.turn ? 1 : 0; f[15] = g.canAttack(u) ? 1 : 0;
      f[16] = !u.isLeader && g.hasRush(u) ? 1 : 0; f[17] = u.negated ? 1 : 0;
      f[18] = (u.buffs || []).reduce((t, b) => t + (b.pow || 0), 0) / 10; f[19] = (u.buffs || []).some(b => b.double) ? 1 : 0;
      f[20] = u.flags.immuneSupportTurn === g.turn ? 1 : 0; f[21] = u.flags.cantAttackTurn === g.turn ? 1 : 0;
    };
    put(0, 1, P.leader, P.leader.card, true, unit(P.leader));
    put(1, 1, O.leader, O.leader.card, false, unit(O.leader));
    P.chars.slice(0, 5).forEach((u, i) => put(2 + i, 2, u, u.card, true, f => { unit(u)(f); f[31] = i / 5; }));
    O.chars.slice(0, 5).forEach((u, i) => put(7 + i, 2, u, u.card, false, f => { unit(u)(f); f[31] = i / 5; }));
    P.hand.slice(0, 10).forEach((c, i) => put(k++, 3, c, c.card, true, f => { f[31] = i / 10; }));
    P.supports.forEach((c, i) => put(k++, 4, c, c.card, true, f => { f[27] = c.setTurn === g.turn ? 1 : 0; f[31] = i / 5; }));
    const pinned = new Set(g.chain.map(l => l.sup));
    O.supports.forEach((c, i) => put(k++, 5, c, pinned.has(c) ? c.card : null, false, f => { f[27] = c.setTurn === g.turn ? 1 : 0; f[31] = i / 5; }));
    g.chain.slice(-4).forEach((l, i) => put(k++, 6, null, l.sup.card, l.pi === pi, f => { f[29] = l.negated ? 1 : 0; f[30] = l.pi === pi ? 1 : 0; f[31] = i / 4; }));
    const at = o => (o != null && where.has(o) ? where.get(o) : -1);
    const ptr = D.cands.map(c => {
      if (D.kind === 'main') {
        const a = c.a;
        if (a.kind === 'leaderAbility' || a.kind === 'recovery') return [0, -1];
        return [at(a.attacker || a.unit || a.sup || a.card), at(a.target)];
      }
      if (D.kind === 'respond') return [at(c.s), D.x.attack ? at(D.x.attack.attacker) : -1];
      return [at(c.o), -1];
    });
    return { tok, card, ptr };
  }
  return { tokens, T, F, SLOTS, NC: IDS.length };
};
