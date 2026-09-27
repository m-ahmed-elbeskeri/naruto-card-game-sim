/* ============================================================
   AI — heuristic opponent for NARUTO CARD GAME
   ============================================================ */
(function () {
  const NS = window.NTCG = window.NTCG || {};
  const LEVELS = { genin: { noise: 2.5, think: 450 }, chunin: { noise: 1, think: 600 }, jonin: { noise: 0.35, think: 650 }, kage: { noise: 0.05, think: 700 } };

  function unitValue(g, u) {
    if (!u) return 0;
    if (u.isLeader) return 20;
    const c = u.card;
    return (g ? g.pow(u) : c.pow) * 0.45 + (c.hp || 0) * 0.35 + (g ? g.dmg(u) : c.dmg) * 1.4 + (c.type === 'ex' ? 3 : 0) + (u.negated ? -1 : 0);
  }
  function cardValue(g, pi, ci) {
    const c = ci.card;
    return c.pow * 0.4 + (c.hp || 0) * 0.3 + c.dmg * 1.2 + (c.support ? 2.5 : 0) + (c.type === 'ex' ? 2 : 0);
  }
  function handScore(g, pi) {
    const h = g.p(pi).hand;
    const normal = h.filter(x => x.card.type === 'character').length;
    const sup = h.filter(x => x.card.support).length;
    return normal >= 2 && sup >= 1 ? 10 : 3;
  }
  const supDefensive = s => ['oppAttack', 'supportActivated'].includes(s.card.support.timing);

  function scoreMain(g, pi, a) {
    const P = g.p(pi), O = g.p(1 - pi);
    switch (a.kind) {
      case 'end': return 0.2;
      case 'set': {
        const s = a.card.card.support;
        let v = s.timing === 'oppAttack' ? 3 : s.timing === 'supportActivated' ? 2.4 : s.timing === 'quick' ? 2.2 : 1.8;
        v -= P.supports.length * 0.35;
        if (P.hand.length <= 1) v -= 1;
        return v;
      }
      case 'summon': {
        const c = a.card.card;
        let v = 2.5 + unitValue(null, { card: c }) * 0.35;
        if (c.support) v -= 1.2; // better kept as a trap
        return v;
      }
      case 'ex': {
        const sets = g.exTributeSets(pi, a.card.card);
        const cost = Math.min(...sets.map(s => s.reduce((t, u) => t + unitValue(g, u), 0)));
        return 3 + unitValue(null, { card: a.card.card }) - cost * 0.7;
      }
      case 'support': {
        const s = a.sup.card.support;
        if (s.timing === 'main') {
          const mine = P.chars.reduce((t, u) => t + unitValue(g, u), 0), theirs = O.chars.reduce((t, u) => t + unitValue(g, u), 0);
          return theirs - mine - s.cost * 1.2 - 2;
        }
        // quick support in main = extra summon
        return unitValue(null, { card: a.sup.card }) * 0.5 - s.cost - (P.chars.length >= g.house.charLimit - 1 ? 2 : 0);
      }
      case 'leaderAbility': {
        if (P.leader.card.id === 'N-012') return 1.2;
        // Naruto +3: worth it if it lets an attacker K.O. something or enables Rush / EX requirements
        const ready = P.chars.filter(u => g.canAttack(u));
        const rested = O.chars.filter(u => u.rested);
        const enablesKo = ready.some(u => rested.some(t => g.pow(u) < t.card.hp && g.pow(u) + 3 >= t.card.hp));
        const minato = P.chars.some(u => u.card.id === 'N-007' && u.summonedTurn === g.turn && !u.rested && g.pow(u) < 10 && g.pow(u) + 3 >= 10);
        const exReady = P.hand.some(x => x.card.type === 'ex') && P.chars.some(u => g.pow(u) < 10 && g.pow(u) + 3 >= 10);
        const lowChakra = g.faceUpChakra(pi) <= 1 && (P.leader.rested || g.turn < 2);
        return (enablesKo ? 3 : 0) + (minato ? 3 : 0) + (exReady ? 2.5 : 0) - 1.2 - (lowChakra ? 1.5 : 0);
      }
      case 'recovery': {
        const need = 5 - g.faceUpChakra(pi);
        const wants = P.supports.length + P.hand.filter(x => x.card.support).length;
        return need >= 3 && wants ? 2.2 + need * 0.4 : need >= 4 ? 1.5 : -1;
      }
      case 'charAbility': return P.chars.some(u => ['Ino Yamanaka', 'Shikamaru Nara', 'Choji Akimichi'].includes(u.card.name) && !u.rested) ? 5 : -1;
      case 'attack': {
        const at = a.attacker, t = a.target;
        // keep Leader ready for [Recovery] if Chakra is low
        if (at.isLeader && g.faceUpChakra(pi) <= 1 && g.turn >= 2 && P.supports.length) return -1;
        const risk = O.supports.length ? 0.4 * unitValue(g, at) / 5 : 0;
        if (t.isLeader) {
          const d = g.dmg(at);
          if (O.leader.life - d <= 0) return 100;
          return 1.5 + d * 1.6 - risk;
        }
        if (g.pow(at) >= t.card.hp) return 2 + unitValue(g, t) - risk;
        return -3;
      }
    }
    return 0;
  }

  // value of an opponent's attack if it resolves (from defender's view)
  function threat(g, atk) {
    if (atk.target.isLeader) return g.dmg(atk.attacker) * 1.8 + (g.p(atk.target.owner).leader.life <= g.dmg(atk.attacker) ? 100 : 0);
    return g.pow(atk.attacker) >= atk.target.card.hp ? unitValue(g, atk.target) : 0;
  }

  function scoreResponse(g, pi, s, win) {
    const id = s.card.id, cost = s.card.support.cost;
    if (win.kind === 'support') {
      // negate an opponent Support if it hurts us
      const other = win.link.sup.card;
      const bad = { 'N-004': 4, 'N-015': 4, 'N-006': 4, 'N-017': 4, 'N-018': 3, 'N-020': 2.5, 'N-008': 3, 'N-010': 1.5, 'N-002': 2, 'N-021': 1.5, 'N-009': 3, 'N-016': 3 }[other.id] || 1;
      const selfCost = id === 'N-009' ? (g.p(pi).leader.life <= 4 ? 99 : 2) : 1;
      return bad - selfCost - cost * 0.5;
    }
    const atk = win.attack;
    const mine = atk.pi === pi;
    if (mine) {
      if (id === 'N-002' && !atk.target.isLeader && g.pow(atk.attacker) < atk.target.card.hp && g.pow(atk.attacker) * 2 >= atk.target.card.hp) return unitValue(g, atk.target);
      if (id === 'N-021') return 1.2;
      return -1;
    }
    const th = threat(g, atk);
    const av = atk.attacker.isLeader ? 0 : unitValue(g, atk.attacker);
    switch (id) {
      case 'N-008': return th + 1 - cost;
      case 'N-018': return atk.attacker.isLeader || atk.attacker.card.type === 'ex' ? -1 : th + av - cost;
      case 'N-006': case 'N-017': return (atk.attacker.isLeader ? 0 : th + av) + g.p(1 - pi).chars.filter(u => u.rested && u !== atk.attacker).reduce((t, u) => t + unitValue(g, u), 0) * 0.6 - cost * 1.2;
      case 'N-020': return atk.attacker.isLeader ? -1 : th + av * 0.6 - cost;
      case 'N-010': return 2 + (g.p(pi).leader.life <= 6 ? 3 : 0) - cost;
      case 'N-021': case 'N-002': return 1 - cost;
    }
    return -1;
  }

  class AIController {
    constructor(level) { this.lv = LEVELS[level] || LEVELS.chunin; }
    async wait() { await NS.wait(this.lv.think * (NS.settings ? NS.settings.speedMul() : 1)); }
    async takeMain(g, pi, acts) {
      await this.wait();
      let best = null, bs = -Infinity;
      for (const a of acts) {
        const s = scoreMain(g, pi, a) + (a.kind === 'end' ? 0 : (Math.random() - 0.5) * this.lv.noise);
        if (s > bs) { bs = s; best = a; }
      }
      if (bs < 0.5) return { kind: 'end' };
      return best;
    }
    async respond(g, pi, win) {
      await NS.wait(250 * (NS.settings ? NS.settings.speedMul() : 1));
      let best = null, bs = 2.2;
      for (const s of win.options) {
        const v = scoreResponse(g, pi, s, win) + (Math.random() - 0.5) * this.lv.noise * 0.5;
        if (v > bs) { bs = v; best = s; }
      }
      return best;
    }
    async choose(g, req) {
      await NS.wait(180 * (NS.settings ? NS.settings.speedMul() : 1));
      const sc = req.ai || (() => Math.random());
      let best = null, bs = -Infinity;
      for (const o of req.options) { const v = sc(o); if (v > bs) { bs = v; best = o; } }
      if (req.optional && req.kind === 'unit' && bs <= 0) return null;
      return best;
    }
  }

  NS.AI = { AIController, unitValue, cardValue, handScore, LEVELS };
  NS.wait = ms => new Promise(r => setTimeout(r, ms));
})();
