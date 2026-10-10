// Lockstep check for online play: two separate Game instances, one per "browser", exchange only
// decision indices + state hashes (exactly what js/net.js sends). They must stay identical.
const { NS } = require('./az-common');
require('../js/net.js');
const hash = NS.Net._hash;
function side(me, st, chan) {
  const ai = new NS.AI.AIController(me === 0 ? 'kage' : 'chunin', { fast: true });
  const s = { queue: [], waiter: null, sendNext: false, bad: 0 };
  const next = () => s.queue.length ? Promise.resolve(s.queue.shift()) : new Promise(r => { s.waiter = r; });
  const theirs = async pick => { const m = await next(); if (m.h !== hash(s.g)) s.bad++; return pick(m.k); };
  const remote = { takeMain: (g, pi, acts) => theirs(k => k === -1 ? null : acts[k] || { kind: 'illegal-remote' }), respond: (g, pi, win) => theirs(k => k < 0 ? null : win.options[k] || null), choose: (g, req) => theirs(k => k < 0 ? null : req.options[k]) };
  const mine = { takeMain: async (g, pi, a) => { const r = await ai.takeMain(g, pi, a); s.sendNext = true; return r; }, respond: async (g, pi, w) => { const r = await ai.respond(g, pi, w); s.sendNext = true; return r; }, choose: async (g, req) => { const r = await ai.choose(g, req); s.sendNext = true; return r; } };
  const g = new NS.Game({ names: st.names, house: st.house, seed: st.seed, controllers: me === 0 ? [mine, remote] : [remote, mine], leaders: st.decks.map(d => NS.Cards.byId[d.leader]), decks: st.decks.map(NS.Cards.expand) });
  g.onDecision = k => { if (s.sendNext) { s.sendNext = false; chan({ t: 'd', k, h: hash(g) }); } };
  s.g = g;
  s.recv = m => { m = JSON.parse(JSON.stringify(m)); if (s.waiter) { const w = s.waiter; s.waiter = null; w(m); } else s.queue.push(m); };
  return s;
}
(async () => {
  let ok = 0, bad = 0, msgs = 0;
  for (let i = 0; i < 100; i++) {
    const d = i % 2 ? NS.STARTERS.slice().reverse() : NS.STARTERS;
    const st = JSON.parse(JSON.stringify({ seed: (Math.random() * 4294967296) >>> 0, names: ['Host', 'Guest'], house: NS.HOUSE_DEFAULTS, decks: d.map(x => ({ leader: x.leader, cards: x.cards })) }));
    let A, B;
    // delayed but ordered delivery, like a reliable WebRTC data channel
    const pipe = to => { let tail = Promise.resolve(); return m => { msgs++; tail = tail.then(() => new Promise(r => setTimeout(r, Math.random() * 2))).then(() => to().recv(m)); }; };
    A = side(0, st, pipe(() => B));
    B = side(1, st, pipe(() => A));
    await Promise.all([A.g.start(), B.g.start()]);
    const same = A.g.winner === B.g.winner && A.g.turn === B.g.turn && hash(A.g) === hash(B.g) && A.g.log.join() === B.g.log.join();
    if (same && !A.bad && !B.bad && A.g.winner != null) ok++; else { bad++; if (bad < 4) console.log('MISMATCH game', i, A.g.winner, B.g.winner, A.g.turn, B.g.turn, 'hash errs', A.bad, B.bad); }
  }
  console.log(`online lockstep: ${ok} games in sync, ${bad} out of sync, ${msgs} messages`);
})();
