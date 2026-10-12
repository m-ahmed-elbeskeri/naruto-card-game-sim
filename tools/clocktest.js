// Online match clock and leave handling in js/net.js, driven with a fake clock.
// Side A is the real session code (NS.Net._test.wire); side B is a scripted peer running its own game.
const { NS } = require('./az-common');
let results = [], modals = [];
NS.Audio = { play() { }, playTrack() { } };
NS.Screens = { showResult: (g, d) => results.push(d), show() { }, setGame() { } };
NS.View = { modal: html => { modals.push(html); return () => { }; } };
require('../js/net.js');
const T = NS.Net._test, hash = NS.Net._hash, CLOCK = T.CLOCK, BANK = CLOCK.bank;
let NOW = 1e6;
T.now(() => NOW);
const clone = m => JSON.parse(JSON.stringify(m));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, ms) => { const t0 = Date.now(); while (!f()) { if (Date.now() - t0 > (ms || 8000)) throw new Error('timed out waiting: ' + f); await sleep(1); } };
const start = seed => clone({ seed, names: ['Host', 'Guest'], house: NS.HOUSE_DEFAULTS, decks: NS.STARTERS.map(x => ({ leader: x.leader, cards: x.cards })) });

// scripted peer: answers with the AI and reports `u` ms per decision; `stallAt` = index of its decision it never answers
function peer(me, st, chan, o) {
  const ai = new NS.AI.AIController('chunin', { fast: true }), s = { queue: [], waiter: null, sendNext: false, sent: [], n: 0 };
  const next = () => s.queue.length ? Promise.resolve(s.queue.shift()) : new Promise(r => { s.waiter = r; });
  const theirs = async pick => pick((await next()).k);
  const remote = { takeMain: (g, pi, acts) => theirs(k => k === -1 ? null : acts[k]), respond: (g, pi, win) => theirs(k => k < 0 ? null : win.options[k] || null), choose: (g, req) => theirs(k => k < 0 ? null : req.options[k]) };
  const own = f => async (...a) => {
    if (o.stallAt === s.n) { s.stalled = true; if (o.think) chan({ t: 'think', n: s.g.log.length }); return new Promise(() => { }); }
    s.n++; if (o.think) chan({ t: 'think', n: s.g.log.length });
    const r = await f(...a); s.sendNext = true; return r;
  };
  const mine = { takeMain: own((g, pi, a) => ai.takeMain(g, pi, a)), respond: own((g, pi, w) => ai.respond(g, pi, w)), choose: own((g, r) => ai.choose(g, r)) };
  const g = new NS.Game({ names: st.names, house: st.house, seed: st.seed, controllers: me === 0 ? [mine, remote] : [remote, mine], leaders: st.decks.map(d => NS.Cards.byId[d.leader]), decks: st.decks.map(NS.Cards.expand) });
  g.onDecision = k => { if (s.sendNext) { s.sendNext = false; const m = { t: 'd', k, h: hash(g), u: o.u || 0 }; s.sent.push(m); chan(m); } };
  s.g = g;
  s.recv = m => { if (m.t !== 'd') return; if (s.waiter) { const w = s.waiter; s.waiter = null; w(m); } else s.queue.push(m); };
  return s;
}
// ordered, slightly delayed delivery (a reliable data channel)
const pipe = to => { let tail = Promise.resolve(); return m => { m = clone(m); tail = tail.then(() => sleep(Math.random() < .3 ? 1 : 0)).then(() => to(m)); }; };

// one match: A = net.js with `local(ui)` as its player, B = peer(o)
function match(seed, local, o, uiExtra) {
  results = []; modals = [];
  const st = start(seed), sentA = [], ui = Object.assign({ toast() { }, render() { }, dismiss() { ui.dismissed = true; }, autoResolve: () => '' }, uiExtra || {});
  let B;
  const toB = pipe(m => B.recv(m));
  T.out(m => { sentA.push(clone(m)); toB(m); });
  const gA = T.wire(st, 0, ui, local(ui));
  const S0 = T.state(); // a late message of an earlier match must not reach the next one
  B = peer(1, st, pipe(m => { if (T.state() === S0) T.recv(m); }), o || {});
  return { st, gA, B, sentA, ui, S: S0, done: Promise.all([gA.start(), B.g.start()]) };
}
// the peer has stalled and our side is waiting for exactly that decision
function stuck(m) { const S = m.S; return m.B.stalled && S.waiter && S.ck.wait && S.ck.wait.n === m.B.g.log.length; 
}
const aiLocal = think => () => { const ai = new NS.AI.AIController('kage', { fast: true }); const w = f => async (...a) => { NOW += think; return f(...a); }; return { takeMain: w((g, pi, a) => ai.takeMain(g, pi, a)), respond: w((g, pi, x) => ai.respond(g, pi, x)), choose: w((g, r) => ai.choose(g, r)) }; };
// a player who never answers: only the clock does (ui.autoResolve)
const idleLocal = () => ui => {
  let pend = null;
  ui.autoResolve = () => { if (!pend) return ''; const p = pend; pend = null; p.res(p.dflt()); return 'Turn ended'; };
  const q = dflt => new Promise(res => { pend = { res, dflt }; });
  return { takeMain: () => q(() => ({ kind: 'end' })), respond: () => q(() => null), choose: (g, req) => q(() => NS.Net.defaultChoice(req)) };
};

let fails = 0;
const ok = (c, what) => { console.log((c ? '  ok   ' : '  FAIL ') + what); if (!c) fails++; };

(async () => {
  // 1. books: both players' time is charged exactly as reported, and the games stay in step
  {
    const m = match(11, aiLocal(1500), { u: 700, think: true });
    await m.done;
    const ck = m.S.ck, usedA = m.sentA.filter(x => x.t === 'd').reduce((t, x) => t + x.u, 0), nA = m.sentA.filter(x => x.t === 'd').length;
    console.log(`1. normal play (${nA} + ${m.B.sent.length} decisions, ${m.gA.turn} turns)`);
    ok(m.gA.winner != null && m.gA.winner === m.B.g.winner && m.gA.log.join() === m.B.g.log.join(), 'both games end the same way');
    ok(usedA === nA * 1500 && ck.bank[0] === BANK - usedA, `our bank is charged with our own thinking time (${usedA} ms)`);
    ok(ck.bank[1] === BANK - 700 * m.B.sent.length, `their bank is charged with what they report (${700 * m.B.sent.length} ms)`);
    ok(!results.length && !modals.length && m.sentA.every(x => x.t === 'd' || x.t === 'think') && m.sentA.filter(x => x.t === 'think').length === nA, 'no timeout, no claim; one "think" per decision');
    NS.Net.leave();
  }
  // 2. a player who never answers: every decision is defaulted at its limit, then the bank runs out
  {
    CLOCK.bank = 400e3;
    const m = match(12, idleLocal(), { u: 0 }), S = m.S, lims = [];
    await until(() => { const r = S.ck.run; if (r && !r.late) { lims.push({ lim: r.lim, own: r.own }); NOW = r.t0 + r.lim + 5; T.tick(); } return results.length || m.gA.over; });
    CLOCK.bank = BANK;
    await sleep(20);
    const ds = m.sentA.filter(x => x.t === 'd');
    console.log(`2. idle player (${ds.length} defaulted decisions, limits ${lims.map(l => l.lim / 1000).join('/')} s)`);
    ok(ds.length > 0 && ds.every((d, i) => d.late === 1 && d.u === lims[i].lim), 'each decision is answered by default at its limit and marked late');
    ok(lims.some(l => l.own && l.lim === CLOCK.turn), 'own turn: 3 minutes');
    ok(lims.filter(l => !l.own).every(l => l.lim <= CLOCK.resp), "opponent's turn: at most 1 minute");
    ok(results.length === 1 && results[0].winner === 1 && results[0].why === 'time' && m.sentA.some(x => x.t === 'flag'), 'bank empty: flag sent, lost on time');
    ok(m.gA.aborted && m.ui.dismissed, 'the game is stopped and open questions are closed');
    NS.Net.leave();
  }
  // 3. the other side stalls: after the stall allowance and its limit, the win is claimed
  for (const think of [false, true]) {
    const m = match(13, aiLocal(0), { stallAt: 3, think }), S = m.S;
    await until(() => stuck(m));
    await sleep(10);
    const w = S.ck.wait, t0 = think ? w.t0 : w.at + CLOCK.stall;
    console.log(`3. stalled opponent (${think ? 'reported thinking' : 'never reported'}, limit ${w.lim / 1000} s)`);
    ok(think ? w.t0 > 0 : w.t0 === 0, think ? 'their clock started when they reported it' : 'their clock has not started yet');
    NOW = t0 + w.lim + CLOCK.grace - 1000; T.tick();
    ok(!results.length, 'no claim before limit + grace');
    NOW = t0 + w.lim + CLOCK.grace + 1000; T.tick();
    ok(results.length === 1 && results[0].winner === 0 && results[0].why === 'away' && m.sentA.some(x => x.t === 'claim'), 'claim sent, won');
    NS.Net.leave();
  }
  // 4. messages from the other side that end the match
  {
    let m = match(14, aiLocal(0), { stallAt: 2 });
    await until(() => stuck(m));
    T.recv({ t: 'flag' });
    console.log('4. end-of-match messages');
    ok(results.length === 1 && results[0].winner === 0 && results[0].why === 'time', '"flag": they ran out of time, we win');
    NS.Net.leave();
    m = match(15, aiLocal(0), { stallAt: 2 });
    await until(() => stuck(m));
    T.recv({ t: 'claim' });
    ok(results.length === 1 && results[0].winner === 1 && results[0].why === 'away', '"claim": we were too slow, they win');
    NS.Net.leave();
    m = match(16, aiLocal(0), { stallAt: 2 });
    await until(() => stuck(m));
    T.recv({ t: 'bye' });
    ok(modals.length === 1 && !T.state() && m.gA.aborted, '"bye" while we wait for them: match ended');
    NS.Net.leave();
    m = match(17, idleLocal(), {});
    await until(() => m.S.asking);
    T.recv({ t: 'bye' });
    ok(modals.length === 1 && !T.state(), '"bye" while we are being asked: match ended');
    NS.Net.leave();
  }
  // 5. they finish first and leave while we are still playing out their last decisions: we still reach the end
  {
    const rec = match(18, aiLocal(0), {});
    await rec.done;
    const mineK = rec.sentA.filter(x => x.t === 'd').map(x => x.k), theirs = rec.B.sent.map(clone), winner = rec.gA.winner;
    NS.Net.leave();
    results = []; modals = [];
    let i = 0, hold = null, release = null, byeAt = -1;
    const replay = () => { const nx = () => mineK[i++]; return { takeMain: async (g, pi, acts) => { const k = nx(); return k === -1 ? null : acts[k]; }, respond: async (g, pi, w) => { const k = nx(); return k < 0 ? null : w.options[k]; }, choose: async (g, req) => { const k = nx(); return k < 0 ? null : req.options[k]; } }; };
    const ui = { toast() { }, render() { }, dismiss() { }, autoResolve: () => '', onEvent: async () => { if (i === mineK.length && !hold) { hold = new Promise(r => { release = r; }); } if (hold) await hold; } };
    T.out(() => { });
    const gA = T.wire(rec.st, 0, ui, replay());
    theirs.forEach(m => T.recv(m)); // everything they ever decided is already here
    const run = gA.start();
    await until(() => hold);        // our last decision is made; an "animation" is playing
    const S = T.state();
    T.recv({ t: 'bye' }); byeAt = gA.log.length;
    ok(!modals.length && T.state() === S && !gA.aborted, '"bye" during an animation: the match goes on');
    release(); await run;
    console.log(`5. opponent leaves early (bye at decision ${byeAt} of ${rec.gA.log.length})`);
    ok(gA.over && gA.winner === winner && gA.log.join() === rec.gA.log.join() && !modals.length, 'we play their remaining decisions and reach the same result');
    NS.Net.leave();
  }
  console.log(fails ? `clock: ${fails} FAILED` : 'clock: all checks passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
