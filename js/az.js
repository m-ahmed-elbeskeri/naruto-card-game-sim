/* ============================================================
   AZ — AlphaZero-style AI for NARUTO CARD GAME
   * policy/value network (small MLP, pure JS, trainable)
   * determinized PUCT Monte Carlo Tree Search (hidden cards are
     re-dealt at random for every sampled world, so the bot never
     sees the opponent's hand, Supports or deck order)
   * works in the page, in Web Workers and in Node (training)
   ============================================================ */
(function () {
  const NS = window.NTCG = window.NTCG || {};
  const AZ = NS.AZ = NS.AZ || {};

  // ---------------- encoding ----------------
  let IDS = null, IDX = null;
  function ids() {
    if (!IDS) { IDS = Object.keys(NS.Cards.byId).sort(); IDX = {}; IDS.forEach((id, i) => { IDX[id] = i; }); }
    return IDS;
  }
  const PROMPT_BUCKETS = 16;
  function promptBucket(s) { let h = 7; s = String(s || '').slice(0, 14); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h % PROMPT_BUCKETS; }
  const ACT_KINDS = ['summon', 'ex', 'set', 'support', 'leaderAbility', 'recovery', 'charAbility', 'attack', 'end', 'respPick', 'respPass', 'choosePick', 'chooseNone', 'keep', 'mulligan'];
  const CTX_KINDS = ['main', 'respAttack', 'respSupport', 'respOther', 'choose', 'mulligan'];

  function dims() {
    const n = ids().length;
    const S = 30 + 10 + 8 * n + CTX_KINDS.length + 9 + n + 1 + PROMPT_BUCKETS + 1;
    const A = ACT_KINDS.length + 2 * n + 17;
    return { S, A, n };
  }

  // Describe a decision: the candidate moves in a fixed order (index = what the engine logs)
  function describe(kind, g, pi, x) {
    if (kind === 'main') return { kind, pi, x, cands: x.map(a => ({ ret: a, a })) };
    if (kind === 'respond') return { kind, pi, x, cands: [{ ret: null, pass: true }].concat(x.options.map(s => ({ ret: s, s }))) };
    const c = x.options.map(o => ({ ret: o, o }));
    if (x.optional) c.push({ ret: null, none: true });
    return { kind, pi, x, cands: c };
  }

  const cardOf = o => o && (o.card || null);
  function stateFeat(g, pi, D, out) {
    const { S, n } = dims();
    const f = out || new Float32Array(S);
    f.fill(0);
    let o = 0;
    const P = g.p(pi), O = g.p(1 - pi);
    const b = v => { f[o++] = v ? 1 : 0; }, x = v => { f[o++] = v; };
    // 30 scalars
    x(P.leader.life / 15); x(O.leader.life / 15);
    x(g.faceUpChakra(pi) / 5); x(g.faceUpChakra(1 - pi) / 5);
    x(P.hand.length / 8); x(O.hand.length / 8);
    x(P.deck.length / 30); x(O.deck.length / 30);
    x(P.supports.length / 5); x(O.supports.length / 5);
    x(P.chars.length / 5); x(O.chars.length / 5);
    b(g.active === pi); b(P.summonRested); b(O.summonRested); b(P.leader.rested); b(O.leader.rested);
    b(g.turn <= P.chakraLockUntil); b(g.turn <= O.chakraLockUntil);
    x(Math.min(g.turn, 40) / 40); b(P.turns <= 1); b(O.turns <= 1); b(P.once['N-012']); b(g.first === pi);
    b(P.leader.card.id === 'N-001'); b(O.leader.card.id === 'N-001');
    b(P.leader.flags.cantAttackTurn >= g.turn); b(O.leader.flags.cantAttackTurn >= g.turn);
    x(Math.max(0, P.leader.life - O.leader.life) / 15); x(Math.max(0, O.leader.life - P.leader.life) / 15);
    // 10 board aggregates
    for (const Q of [P, O]) {
      let pw = 0, hp = 0, dm = 0, ready = 0, rested = 0;
      for (const u of Q.chars) { pw += g.pow(u); hp += g.hpLeft(u); dm += g.dmg(u); if (!u.rested) ready++; else rested++; }
      x(pw / 40); x(hp / 40); x(dm / 10); x(ready / 5); x(rested / 5);
    }
    // 8 count vectors
    const cnt = (list, get) => { for (const it of list) { const c = get(it); if (c && IDX[c.id] != null) f[o + IDX[c.id]] += 1; } o += n; };
    cnt(P.hand, c => c.card); cnt(P.supports, c => c.card); cnt(P.chars, u => u.card); cnt(P.chars.filter(u => u.rested), u => u.card); cnt(P.trash, c => c.card);
    cnt(O.chars, u => u.card); cnt(O.chars.filter(u => u.rested), u => u.card); cnt(O.trash, c => c.card);
    // decision context
    let ck = 'main';
    if (D.kind === 'respond') ck = D.x.kind === 'attack' ? 'respAttack' : D.x.kind === 'support' ? 'respSupport' : 'respOther';
    else if (D.kind === 'choose') ck = D.x.kind === 'mulligan' ? 'mulligan' : 'choose';
    f[o + CTX_KINDS.indexOf(ck)] = 1; o += CTX_KINDS.length;
    const atk = D.kind === 'respond' && D.x.attack;
    if (atk) {
      const A = atk.attacker, T = atk.target;
      b(A.owner === pi); b(A.isLeader); x(g.pow(A) / 15); x(g.dmg(A) / 5); b(T.isLeader); b(T.owner === pi); x(g.hpLeft(T) / 15);
      b(!T.isLeader && g.pow(A) >= g.hpLeft(T)); b(T.isLeader && g.dmg(A) >= T.life);
    } else o += 9;
    const link = D.kind === 'respond' && D.x.link;
    if (link && IDX[link.sup.card.id] != null) f[o + IDX[link.sup.card.id]] = 1;
    o += n; b(link && link.pi === pi);
    if (D.kind === 'choose') f[o + promptBucket(D.x.prompt)] = 1;
    o += PROMPT_BUCKETS;
    x(g.chain.length / 4);
    return f;
  }

  function actFeat(g, pi, D, c, out) {
    const { A, n } = dims();
    const f = out || new Float32Array(A);
    f.fill(0);
    let kind, card = null, tgt = null, a = c.a;
    if (D.kind === 'main') { kind = a.kind === 'illegal' ? 'end' : a.kind; card = cardOf(a.card) || cardOf(a.sup) || cardOf(a.unit) || cardOf(a.attacker); tgt = a.target || null; }
    else if (D.kind === 'respond') { kind = c.pass ? 'respPass' : 'respPick'; card = c.s ? c.s.card : null; }
    else if (D.x.kind === 'mulligan') kind = c.o === 'mulligan' ? 'mulligan' : 'keep';
    else { kind = c.none ? 'chooseNone' : 'choosePick'; card = c.o && c.o.card || null; tgt = c.o && c.o.card ? c.o : null; }
    let o = 0;
    f[o + ACT_KINDS.indexOf(kind)] = 1; o += ACT_KINDS.length;
    if (card && IDX[card.id] != null) f[o + IDX[card.id]] = 1; o += n;
    if (tgt && tgt.card && IDX[tgt.card.id] != null) f[o + IDX[tgt.card.id]] = 1; o += n;
    const isUnit = tgt && (tgt.uid || tgt.isLeader);
    const P = g.p(pi);
    f[o++] = tgt && tgt.isLeader ? 1 : 0;
    f[o++] = tgt && tgt.owner === pi ? 1 : 0;
    f[o++] = isUnit && tgt.rested ? 1 : 0;
    f[o++] = isUnit ? g.hpLeft(tgt) / 15 : 0;
    f[o++] = isUnit && !tgt.isLeader ? g.pow(tgt) / 15 : 0;
    if (D.kind === 'main' && a.attacker) {
      const at = a.attacker;
      f[o++] = g.pow(at) / 15; f[o++] = g.dmg(at) / 5;
      f[o++] = !a.target.isLeader && g.pow(at) >= g.hpLeft(a.target) ? 1 : 0;
      f[o++] = a.target.isLeader && g.dmg(at) >= a.target.life ? 1 : 0;
      f[o++] = at.isLeader ? 1 : 0;
    } else o += 5;
    f[o++] = a && a.fromHand ? 1 : 0;
    const inZone = z => !!(c.o && P[z] && P[z].includes(c.o));
    f[o++] = isUnit ? 1 : 0; f[o++] = inZone('hand') ? 1 : 0; f[o++] = inZone('trash') ? 1 : 0; f[o++] = inZone('deck') ? 1 : 0;
    const sp = (c.s && c.s.card.support) || (a && a.sup && a.sup.card.support);
    f[o++] = sp ? sp.cost / 2 : 0;
    f[o++] = card && card.type === 'ex' ? 1 : 0;
    return f;
  }

  // ---------------- network ----------------
  const H = 128, HV = 64, HP = 96;
  function randn(rng) { let u = 0, v = 0; while (!u) u = rng(); while (!v) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  const LAYERS = () => { const { S, A } = dims(); return [['W1', S, H], ['W2', H, H], ['Wv1', H, HV], ['Wv2', HV, 1], ['Wph', H, HP], ['Wpa', A, HP], ['Wp2', HP, 1]]; };

  class Net {
    constructor(seed) {
      const rng = NS.mulberry32(seed || 1);
      this.p = {};
      for (const [k, i, o] of LAYERS()) {
        const w = new Float32Array(i * o), s = Math.sqrt(2 / i);
        for (let j = 0; j < w.length; j++) w[j] = randn(rng) * s * (k === 'Wv2' || k === 'Wp2' ? 0.1 : 1);
        this.p[k] = w; this.p['b' + k.slice(1)] = new Float32Array(o);
      }
      this.p.bph = new Float32Array(HP); // shared hidden bias of the policy head
    }
    static shape() { return LAYERS(); }
    toJSON() { const o = {}; for (const k in this.p) o[k] = b64(this.p[k]); return { v: 1, dims: dims(), p: o }; }
    static fromJSON(j) {
      const net = new Net(1);
      for (const k in j.p) { const a = unb64(j.p[k]); if (net.p[k] && net.p[k].length === a.length) net.p[k] = a; }
      return net;
    }
    clone() { const n = new Net(1); for (const k in this.p) n.p[k] = this.p[k].slice(); return n; }
    // forward pass; keeps activations when `keep` is set (for training)
    forward(s, acts, keep) {
      const p = this.p, { S, A } = dims();
      const dense = (x, W, bias, I, O, relu) => {
        const y = new Float32Array(O);
        y.set(bias);
        for (let i = 0; i < I; i++) { const xi = x[i]; if (xi === 0) continue; const r = i * O; for (let j = 0; j < O; j++) y[j] += xi * W[r + j]; }
        if (relu) for (let j = 0; j < O; j++) if (y[j] < 0) y[j] = 0;
        return y;
      };
      const h1 = dense(s, p.W1, p.b1, S, H, true);
      const h2 = dense(h1, p.W2, p.b2, H, H, true);
      const v1 = dense(h2, p.Wv1, p.bv1, H, HV, true);
      const v2 = dense(v1, p.Wv2, p.bv2, HV, 1, false);
      const v = Math.tanh(v2[0]);
      const ph = dense(h2, p.Wph, p.bph, H, HP, false);
      const logits = new Float32Array(acts.length), pa = [];
      for (let k = 0; k < acts.length; k++) {
        const z = dense(acts[k], p.Wpa, p.bpa, A, HP, false);
        for (let j = 0; j < HP; j++) { z[j] += ph[j]; if (z[j] < 0) z[j] = 0; }
        let l = p.bp2[0];
        for (let j = 0; j < HP; j++) l += z[j] * p.Wp2[j];
        logits[k] = l;
        if (keep) pa.push(z);
      }
      const out = { v, logits, priors: softmax(logits) };
      if (keep) Object.assign(out, { s, acts, h1, h2, v1, pa });
      return out;
    }
    // accumulate gradients for one sample: value target z in [-1,1], policy target pi (sums to 1)
    backward(fw, z, pi, G, wv) {
      const p = this.p, { S, A } = dims();
      const addOuter = (Gw, x, dy, I, O) => { for (let i = 0; i < I; i++) { const xi = x[i]; if (xi === 0) continue; const r = i * O; for (let j = 0; j < O; j++) Gw[r + j] += xi * dy[j]; } };
      const back = (dy, W, I, O) => { const dx = new Float32Array(I); for (let i = 0; i < I; i++) { let s = 0; const r = i * O; for (let j = 0; j < O; j++) s += W[r + j] * dy[j]; dx[i] = s; } return dx; };
      const addv = (Gb, d) => { for (let j = 0; j < d.length; j++) Gb[j] += d[j]; };
      // value head: loss = wv * (v - z)^2
      const dv2 = new Float32Array([2 * wv * (fw.v - z) * (1 - fw.v * fw.v)]);
      addOuter(G.Wv2, fw.v1, dv2, HV, 1); addv(G.bv2, dv2);
      const dv1 = back(dv2, p.Wv2, HV, 1); for (let j = 0; j < HV; j++) if (fw.v1[j] <= 0) dv1[j] = 0;
      addOuter(G.Wv1, fw.h2, dv1, H, HV); addv(G.bv1, dv1);
      const dh2 = back(dv1, p.Wv1, H, HV);
      // policy head: cross-entropy with target pi
      const dph = new Float32Array(HP);
      for (let k = 0; k < fw.acts.length; k++) {
        const dl = fw.priors[k] - pi[k];
        if (Math.abs(dl) < 1e-7) continue;
        const za = fw.pa[k];
        G.bp2[0] += dl;
        const dz = new Float32Array(HP);
        for (let j = 0; j < HP; j++) { G.Wp2[j] += za[j] * dl; dz[j] = za[j] > 0 ? p.Wp2[j] * dl : 0; }
        addOuter(G.Wpa, fw.acts[k], dz, A, HP); addv(G.bpa, dz); addv(dph, dz);
      }
      addOuter(G.Wph, fw.h2, dph, H, HP); addv(G.bph, dph);
      const dh2p = back(dph, p.Wph, H, HP);
      for (let j = 0; j < H; j++) { dh2[j] += dh2p[j]; if (fw.h2[j] <= 0) dh2[j] = 0; }
      addOuter(G.W2, fw.h1, dh2, H, H); addv(G.b2, dh2);
      const dh1 = back(dh2, p.W2, H, H); for (let j = 0; j < H; j++) if (fw.h1[j] <= 0) dh1[j] = 0;
      addOuter(G.W1, fw.s, dh1, S, H); addv(G.b1, dh1);
      const ce = -fw.acts.reduce((t, _, k) => t + (pi[k] > 0 ? pi[k] * Math.log(fw.priors[k] + 1e-9) : 0), 0);
      return { vl: (fw.v - z) * (fw.v - z), pl: ce };
    }
    zeros() { const G = {}; for (const k in this.p) G[k] = new Float32Array(this.p[k].length); return G; }
  }
  // Adam optimiser
  class Adam {
    constructor(net, lr, wd) { this.net = net; this.lr = lr || 1e-3; this.wd = wd || 1e-4; this.t = 0; this.m = net.zeros(); this.v = net.zeros(); }
    step(G, scale) {
      this.t++;
      const b1 = 0.9, b2 = 0.999, lr = this.lr * Math.sqrt(1 - Math.pow(b2, this.t)) / (1 - Math.pow(b1, this.t));
      for (const k in this.net.p) {
        const w = this.net.p[k], g = G[k], m = this.m[k], v = this.v[k], decay = k[0] === 'W' ? this.wd : 0;
        for (let i = 0; i < w.length; i++) {
          const gi = g[i] * scale + decay * w[i];
          m[i] = b1 * m[i] + (1 - b1) * gi; v[i] = b2 * v[i] + (1 - b2) * gi * gi;
          w[i] -= lr * m[i] / (Math.sqrt(v[i]) + 1e-8);
        }
      }
    }
  }
  function softmax(l) {
    let m = -Infinity; for (const x of l) if (x > m) m = x;
    const e = new Float32Array(l.length); let s = 0;
    for (let i = 0; i < l.length; i++) { e[i] = Math.exp(l[i] - m); s += e[i]; }
    for (let i = 0; i < l.length; i++) e[i] /= s;
    return e;
  }
  function b64(f32) {
    const u8 = new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength);
    if (typeof Buffer !== 'undefined') return Buffer.from(u8).toString('base64');
    let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function unb64(str) {
    let u8;
    if (typeof Buffer !== 'undefined') { const b = Buffer.from(str, 'base64'); u8 = new Uint8Array(b.length); u8.set(b); }
    else { const s = atob(str); u8 = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i); }
    return new Float32Array(u8.buffer);
  }

  // ---------------- determinized PUCT MCTS ----------------
  const STOP_SIGNAL = { message: 'aborted' }; // plain object: no stack capture, far cheaper than an Error
  const STOP = () => STOP_SIGNAL;
  function newNode() { return { expanded: false, n: 0 }; }

  // Re-deal everything `pi` cannot see: the opponent's hand, face-down Supports and deck, plus pi's own deck order
  function determinize(g, pi, rng) {
    const O = g.p(1 - pi), P = g.p(pi);
    const pinned = new Set(g.chain.map(l => l.sup));
    const zones = [O.hand, O.supports, O.deck];
    let pool = [];
    zones.forEach(z => z.forEach(c => { if (!pinned.has(c)) pool.push(c); }));
    NS.shuffle(pool, rng);
    // face-down Supports can only be cards that have a [Support] ability: deal those slots first
    for (let i = 0; i < O.supports.length; i++) {
      if (pinned.has(O.supports[i])) continue;
      const j = pool.findIndex(c => c.card.support);
      O.supports[i] = pool[j]; pool.splice(j, 1);
    }
    let k = 0;
    for (const z of [O.hand, O.deck]) for (let i = 0; i < z.length; i++) if (!pinned.has(z[i])) z[i] = pool[k++];
    NS.shuffle(P.deck, rng);
  }

  function expand(node, net, g, dpi, D, rootNoise, rng) {
    const s = stateFeat(g, dpi, D);
    const acts = D.cands.map(c => actFeat(g, dpi, D, c));
    const out = net.forward(s, acts);
    let P = out.priors;
    if (rootNoise) {
      const a = rootNoise.alpha, eps = rootNoise.eps, gam = [];
      let t = 0;
      for (let i = 0; i < P.length; i++) { const x = gammaSample(a, rng); gam.push(x); t += x; }
      P = P.map((p, i) => (1 - eps) * p + eps * gam[i] / t);
    }
    node.expanded = true; node.p = dpi; node.P = P; node.N = new Int32Array(P.length); node.W = new Float64Array(P.length); node.kids = new Array(P.length); node.v = out.v;
    return out.v;
  }
  function gammaSample(a, rng) { // Marsaglia–Tsang (a < 1 boosted)
    if (a < 1) return gammaSample(a + 1, rng) * Math.pow(rng(), 1 / a);
    const d = a - 1 / 3, c = 1 / Math.sqrt(9 * d);
    for (;;) { let x, v; do { x = randn(rng); v = 1 + c * x; } while (v <= 0); v = v * v * v; const u = rng(); if (u < 1 - 0.0331 * x * x * x * x || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v; }
  }
  function select(node, rootPi, cpuct) {
    const sgn = node.p === rootPi ? 1 : -1, sq = Math.sqrt(node.n + 1);
    let best = 0, bs = -Infinity;
    const fpu = node.v - 0.15; // first-play urgency for unvisited moves (node player's view)
    for (let k = 0; k < node.P.length; k++) {
      const q = node.N[k] ? sgn * node.W[k] / node.N[k] : fpu;
      const u = q + cpuct * node.P[k] * sq / (1 + node.N[k]);
      if (u > bs) { bs = u; best = k; }
    }
    return best;
  }

  // one simulation inside one sampled world
  async function simulate(spec, pi, world, net, cfg) {
    let atRoot = true, node = world.root, leaf = null;
    const path = [];
    const onDecision = (kind, g, dpi, x) => {
      const D = describe(kind, g, dpi, x);
      if (atRoot) {
        atRoot = false;
        determinize(g, pi, NS.mulberry32(world.seed));
        g.rng.set(world.seed ^ 0x5bd1e995);
      }
      if (D.cands.length === 1) return D.cands[0].ret;
      if (!node.expanded) {
        const v = expand(node, net, g, dpi, D, node === world.root && cfg.noise ? cfg.noise : null, NS.mulberry32(world.seed + 17));
        leaf = dpi === pi ? v : -v;
        throw STOP();
      }
      const k = select(node, pi, cfg.cpuct);
      path.push([node, k]);
      node = node.kids[k] || (node.kids[k] = newNode());
      return D.cands[k].ret;
    };
    const ctl = {
      takeMain: async (g, p, acts) => onDecision('main', g, p, acts),
      respond: async (g, p, win) => onDecision('respond', g, p, win),
      choose: async (g, req) => onDecision('choose', g, req.player, req),
    };
    const g = new NS.Game({ names: ['a', 'b'], controllers: [ctl, ctl], leaders: spec.leaders.map(id => NS.Cards.byId[id]), decks: [[], []], house: spec.house, seed: 1 });
    g.noSnap = true;
    await g.resume(spec.snap, spec.log);
    let v = leaf;
    if (v == null) v = g.over ? (g.winner === pi ? 1 : -1) : 0;
    for (const [nd, k] of path) { nd.N[k]++; nd.W[k] += v; nd.n++; }
    return v;
  }

  // Search the decision that comes right after `spec.log`. Returns summed root visit counts per candidate.
  // cfg: { worlds, sims (per world) | ms (time budget), cpuct, noise, seed }
  async function search(spec, pi, net, cfg) {
    cfg = Object.assign({ worlds: 8, sims: 24, cpuct: 1.6, seed: 1 }, cfg);
    const worlds = [];
    for (let w = 0; w < cfg.worlds; w++) worlds.push({ seed: (cfg.seed * 7919 + w * 104729) >>> 0, root: newNode() });
    const t0 = Date.now();
    let total = 0;
    const deadline = cfg.ms ? t0 + cfg.ms : Infinity;
    for (let r = 0; ; r++) {
      if (cfg.ms ? Date.now() > deadline : r >= cfg.sims + 1) break;
      for (const w of worlds) { await simulate(spec, pi, w, net, cfg); total++; }
      if (cfg.maxSims && total >= cfg.maxSims) break;
    }
    const root = worlds[0].root;
    if (!root.expanded) return null;
    const visits = new Float64Array(root.P.length), value = new Float64Array(root.P.length), prior = new Float64Array(root.P.length);
    for (const w of worlds) if (w.root.expanded && w.root.P.length === visits.length) for (let k = 0; k < visits.length; k++) { visits[k] += w.root.N[k]; value[k] += w.root.W[k]; prior[k] += w.root.P[k] / worlds.length; }
    return { visits: Array.from(visits), value: Array.from(value), prior: Array.from(prior), sims: total, ms: Date.now() - t0 };
  }

  function pickFromVisits(visits, temp, rng) {
    if (!temp) { let b = 0; for (let k = 1; k < visits.length; k++) if (visits[k] > visits[b]) b = k; return b; }
    const w = visits.map(x => Math.pow(x, 1 / temp)); const t = w.reduce((a, b) => a + b, 0);
    let r = (rng || Math.random)() * t;
    for (let k = 0; k < w.length; k++) { r -= w[k]; if (r <= 0) return k; }
    return w.length - 1;
  }

  // ---------------- controller ----------------
  // opts: { net, cfg, remote: async (spec, pi, cfg) => result, record: fn(sample), temp: n => temperature }
  class AZController {
    constructor(opts) {
      this.o = opts || {};
      this.fallback = new NS.AI.AIController('kage', { fast: true });
      this.n = 0;
    }
    async decide(kind, g, pi, x) {
      const D = describe(kind, g, pi, x);
      if (D.cands.length === 1) return D.cands[0].ret;
      if (!g.snap) return kind === 'main' ? this.fallback.takeMain(g, pi, x) : kind === 'respond' ? this.fallback.respond(g, pi, x) : this.fallback.choose(g, x);
      const spec = g.spec();
      const cfg = Object.assign({}, this.o.cfgFor ? this.o.cfgFor(kind) : this.o.cfg, { seed: (Math.random() * 1e9) >>> 0 });
      const r = this.o.remote ? await this.o.remote(spec, pi, cfg) : await search(spec, pi, this.o.net, cfg);
      if (!r || r.visits.length !== D.cands.length) return kind === 'main' ? this.fallback.takeMain(g, pi, x) : kind === 'respond' ? this.fallback.respond(g, pi, x) : this.fallback.choose(g, x);
      const tot = r.visits.reduce((a, b) => a + b, 0) || 1;
      if (this.o.record) this.o.record({ pi, s: stateFeat(g, pi, D), a: D.cands.map(c => actFeat(g, pi, D, c)), pi_t: r.visits.map(v => v / tot) });
      const temp = this.o.temp ? this.o.temp(g, this.n++) : 0;
      const k = pickFromVisits(r.visits, temp);
      this.last = { kind, r, k, cands: D.cands.length };
      return D.cands[k].ret;
    }
    async takeMain(g, pi, acts) { if (this.o.think) await this.o.think(); return this.decide('main', g, pi, acts); }
    async respond(g, pi, win) { return this.decide('respond', g, pi, win); }
    async choose(g, req) { return this.decide('choose', g, req.player, req); }
  }

  // ---------------- browser: Web Worker pool + Hokage controller ----------------
  let pool = null;
  function getPool() {
    if (pool) return pool;
    if (typeof Worker === 'undefined' || typeof document === 'undefined') return null;
    const tag = document.querySelector('script[src*="js/engine.js"]');
    const v = tag && (tag.getAttribute('src').match(/v=(\d+)/) || [])[1];
    const n = Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 1));
    pool = AZ._pool = { ws: [], ok: false, id: 0, cb: new Map(), errors: [] };
    pool.ready = new Promise(res => {
      let pending = n;
      const settle = () => { if (--pending === 0) res(); };
      for (let i = 0; i < n; i++) {
        let w, done = false;
        const once = () => { if (!done) { done = true; settle(); } };
        try { w = new Worker('js/az-worker.js' + (v ? '?v=' + v : '')); } catch (e) { once(); continue; }
        w.onmessage = e => {
          const m = e.data;
          if (m.ready) { if (m.ok) { pool.ok = true; pool.ws.push(w); res(); } once(); return; }
          const f = pool.cb.get(m.id);
          if (f) { pool.cb.delete(m.id); f(m.r); }
        };
        w.onerror = e => { pool.errors.push(e.message); once(); };
      }
      setTimeout(res, 20000);
    });
    return pool;
  }
  // every worker searches its own sampled worlds for the same time budget; root visit counts are summed
  async function remoteSearch(spec, pi, cfg) {
    const p = getPool();
    if (!p) return null;
    await p.ready;
    if (!p.ok || !p.ws.length) return null;
    const rs = await Promise.all(p.ws.map((w, i) => new Promise(res => {
      const id = ++p.id;
      p.cb.set(id, res);
      w.postMessage({ id, spec, pi, cfg: Object.assign({}, cfg, { seed: (cfg.seed + i * 7777) >>> 0 }) });
    })));
    let out = null;
    for (const r of rs) {
      if (!r) continue;
      if (!out) out = { visits: r.visits.slice(), value: r.value.slice(), prior: r.prior.slice(), sims: r.sims, ms: r.ms };
      else if (r.visits.length === out.visits.length) { r.visits.forEach((x, k) => { out.visits[k] += x; out.value[k] += r.value[k]; }); out.sims += r.sims; }
    }
    return out;
  }
  const BUDGET = { main: 1400, respond: 900, choose: 800 };
  function hokage() {
    getPool();
    return new AZController({ remote: remoteSearch, cfgFor: kind => ({ worlds: 3, ms: BUDGET[kind] || 900, cpuct: 1.6 }) });
  }

  Object.assign(AZ, { dims, describe, stateFeat, actFeat, Net, Adam, softmax, search, determinize, pickFromVisits, AZController, hokage, warm: getPool });
})();
