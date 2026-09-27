// AlphaZero-style training for the NARUTO CARD GAME bot.
//   node tools/az-train.js [iterations]
// State lives in training/ (resumable). The current champion is exported to js/az-weights.js.
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const fs = require('fs'), path = require('path'), os = require('os');
const { NS, newGame } = require('./az-common');
const AZ = NS.AZ;

const CFG = {
  threads: Math.max(1, os.cpus().length - 1),
  selfplayGames: 300,          // per iteration
  search: { worlds: 8, sims: 24, cpuct: 1.6 },          // ~200 simulations per move during self-play
  noise: { alpha: 0.3, eps: 0.25 },
  tempMoves: 12,               // sample moves in proportion to visits for the first N decisions of each player
  bufferMax: 120000,
  batch: 128, stepsPerIter: 1000, lr: 1e-3,
  gateGames: 80, gateWin: 0.55,
  kageGames: 80,
  imitationGames: 3000, imitationSteps: 6000,
};
if (process.env.AZ_CFG) Object.assign(CFG, JSON.parse(process.env.AZ_CFG));
const DIR = process.env.AZ_DIR || path.join(__dirname, '..', 'training');

// ======================= worker =======================
if (!isMainThread) {
  let nets = {};
  const getNet = (key, json) => { if (json) nets[key] = AZ.Net.fromJSON(json); return nets[key]; };
  const same = (x, a) => x.kind === a.kind && x.card === a.card && x.sup === a.sup && x.unit === a.unit && x.attacker === a.attacker && x.target === a.target;

  // heuristic player whose choices are recorded as one-hot policy targets
  function recordingKage(level, rec) {
    const k = new NS.AI.AIController(level, { fast: true });
    const note = (kind, g, pi, x, r) => {
      const D = AZ.describe(kind, g, pi, x);
      if (D.cands.length < 2) return;
      let idx;
      if (kind === 'main') idx = r.kind === 'end' ? x.length - 1 : x.findIndex(a => same(a, r));
      else idx = D.cands.findIndex(c => c.ret === r);
      if (idx < 0) return;
      const t = D.cands.map((_, i) => (i === idx ? 0.9 : 0.1 / (D.cands.length - 1)));
      rec({ pi, s: AZ.stateFeat(g, pi, D), a: D.cands.map(c => AZ.actFeat(g, pi, D, c)), pi_t: t });
    };
    return {
      async takeMain(g, pi, acts) { const r = await k.takeMain(g, pi, acts); note('main', g, pi, acts, r); return r; },
      async respond(g, pi, win) { const r = await k.respond(g, pi, win); note('respond', g, pi, win, r); return r; },
      async choose(g, req) { const r = await k.choose(g, req); note('choose', g, req.player, req, r); return r; },
    };
  }
  const pack = (samples, winner) => samples.map(x => ({ s: x.s, a: x.a, pi_t: x.pi_t, z: winner == null ? 0 : (x.pi === winner ? 1 : -1) }));

  parentPort.on('message', async m => {
    try {
      if (m.nets) for (const k in m.nets) getNet(k, m.nets[k]);
      const swap = Math.random() < 0.5;
      if (m.type === 'imitate') {
        const samples = [];
        const lv = ['chunin', 'jonin', 'kage', 'kage'];
        const { g } = newGame([recordingKage(lv[(Math.random() * 4) | 0], x => samples.push(x)), recordingKage(lv[(Math.random() * 4) | 0], x => samples.push(x))], swap);
        await g.start();
        parentPort.postMessage({ id: m.id, samples: pack(samples, g.winner) });
      } else if (m.type === 'selfplay') {
        const samples = [];
        const mk = () => new AZ.AZController({ net: nets.cur, cfg: Object.assign({ noise: m.noise }, m.search), record: x => samples.push(x), temp: (g, n) => (n < m.tempMoves ? 1 : 0) });
        const { g } = newGame([mk(), mk()], swap);
        await g.start();
        parentPort.postMessage({ id: m.id, samples: pack(samples, g.winner), turns: g.turn });
      } else if (m.type === 'arena') {
        // player A (net m.a) vs player B (net m.b, or the Kage heuristic when m.b is null); A sits in seat m.seat
        const A = new AZ.AZController({ net: nets[m.a], cfg: m.search });
        const B = m.b ? new AZ.AZController({ net: nets[m.b], cfg: m.search }) : new NS.AI.AIController('kage', { fast: true });
        const ctl = m.seat === 0 ? [A, B] : [B, A];
        const { g } = newGame(ctl, swap);
        await g.start();
        parentPort.postMessage({ id: m.id, win: g.winner == null ? 0.5 : g.winner === m.seat ? 1 : 0 });
      }
    } catch (e) { parentPort.postMessage({ id: m.id, error: String(e.stack || e) }); }
  });
  return;
}

// ======================= main =======================
fs.mkdirSync(DIR, { recursive: true });
const logf = path.join(DIR, 'log.txt');
const log = (...a) => { const s = `[${new Date().toISOString().slice(11, 19)}] ` + a.join(' '); console.log(s); fs.appendFileSync(logf, s + '\n'); };

class Pool {
  constructor(n) {
    this.ws = []; this.free = []; this.q = []; this.cb = new Map(); this.id = 0; this.netVer = {};
    for (let i = 0; i < n; i++) {
      const w = new Worker(__filename);
      w.sent = {};
      w.on('message', m => { const f = this.cb.get(m.id); this.cb.delete(m.id); this.free.push(w); this.pump(); f(m); });
      w.on('error', e => log('worker error', e));
      this.ws.push(w); this.free.push(w);
    }
  }
  setNet(key, net) { this.nets = this.nets || {}; this.nets[key] = net.toJSON(); this.netVer[key] = (this.netVer[key] || 0) + 1; }
  run(job) { return new Promise(r => { job.id = ++this.id; this.q.push([job, r]); this.pump(); }); }
  pump() {
    while (this.free.length && this.q.length) {
      const w = this.free.pop(), [job, r] = this.q.shift();
      const nets = {};
      for (const k in this.netVer) if (w.sent[k] !== this.netVer[k]) { nets[k] = this.nets[k]; w.sent[k] = this.netVer[k]; }
      this.cb.set(job.id, r);
      w.postMessage(Object.assign({ nets }, job));
    }
  }
  close() { this.ws.forEach(w => w.terminate()); }
}

const buffer = [];
function addSamples(ss) { for (const s of ss) buffer.push(s); if (buffer.length > CFG.bufferMax) buffer.splice(0, buffer.length - CFG.bufferMax); }

function train(net, opt, steps) {
  let vl = 0, pl = 0, n = 0;
  for (let st = 0; st < steps; st++) {
    const G = net.zeros();
    for (let b = 0; b < CFG.batch; b++) {
      const x = buffer[(Math.random() * buffer.length) | 0];
      const fw = net.forward(x.s, x.a, true);
      const r = net.backward(fw, x.z, x.pi_t, G, 1);
      vl += r.vl; pl += r.pl; n++;
    }
    opt.step(G, 1 / CFG.batch);
  }
  return { vl: (vl / n).toFixed(3), pl: (pl / n).toFixed(3) };
}

async function arena(pool, a, b, games) {
  const jobs = [];
  for (let i = 0; i < games; i++) jobs.push(pool.run({ type: 'arena', a, b, seat: i % 2, search: CFG.search }));
  const rs = await Promise.all(jobs);
  const errs = rs.filter(r => r.error); if (errs.length) log('arena errors', errs.length, errs[0].error.slice(0, 300));
  return rs.filter(r => !r.error).reduce((t, r) => t + r.win, 0) / Math.max(1, rs.length - errs.length);
}

function exportWeights(net, meta) {
  const js = `/* AlphaZero-style network for the NARUTO CARD GAME bot — generated by tools/az-train.js */\nwindow.NTCG = window.NTCG || {};\nwindow.NTCG.AZ_WEIGHTS = ${JSON.stringify(Object.assign(net.toJSON(), { meta }))};\n`;
  fs.writeFileSync(path.join(__dirname, '..', 'js', 'az-weights.js'), js);
}

(async () => {
  const iters = +process.argv[2] || 20;
  const pool = new Pool(CFG.threads);
  log(`start: ${CFG.threads} threads, dims`, JSON.stringify(AZ.dims()));
  let best, state = { gen: 0, iter: 0 };
  const bestPath = path.join(DIR, 'best.json'), statePath = path.join(DIR, 'state.json');
  if (fs.existsSync(bestPath)) {
    best = AZ.Net.fromJSON(JSON.parse(fs.readFileSync(bestPath, 'utf8')));
    state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    log('resumed at generation', state.gen);
  } else {
    // ---- generation 0: imitate the Kage heuristic so self-play starts from sensible play ----
    best = new AZ.Net(12345);
    log(`imitation: ${CFG.imitationGames} heuristic games`);
    const jobs = [];
    for (let i = 0; i < CFG.imitationGames; i++) jobs.push(pool.run({ type: 'imitate' }).then(r => { if (r.error) log('err', r.error.slice(0, 300)); else addSamples(r.samples); }));
    await Promise.all(jobs);
    log('imitation samples', buffer.length);
    const opt = new AZ.Adam(best, CFG.lr);
    for (let k = 0; k < CFG.imitationSteps; k += 1000) log('imitation train', k, JSON.stringify(train(best, opt, 1000)));
    fs.writeFileSync(bestPath, JSON.stringify(best.toJSON()));
    fs.writeFileSync(statePath, JSON.stringify(state));
    pool.setNet('best', best);
    const vk = await arena(pool, 'best', null, CFG.kageGames);
    log(`gen 0 vs Kage heuristic: ${(vk * 100).toFixed(1)}%`);
    exportWeights(best, { gen: 0, vsKage: vk });
    buffer.length = 0; // self-play data only from here on
  }
  pool.setNet('best', best);
  let cur = best.clone();
  let opt = new AZ.Adam(cur, CFG.lr);

  for (let it = 0; it < iters; it++) {
    state.iter++;
    const t0 = Date.now();
    pool.setNet('cur', cur);
    let turns = 0, errs = 0;
    const jobs = [];
    for (let i = 0; i < CFG.selfplayGames; i++) jobs.push(pool.run({ type: 'selfplay', search: CFG.search, noise: CFG.noise, tempMoves: CFG.tempMoves }).then(r => {
      if (r.error) { errs++; if (errs < 3) log('selfplay error', r.error.slice(0, 400)); return; }
      addSamples(r.samples); turns += r.turns;
    }));
    await Promise.all(jobs);
    const t1 = Date.now();
    const loss = train(cur, opt, CFG.stepsPerIter);
    const t2 = Date.now();
    pool.setNet('cur', cur);
    const vb = await arena(pool, 'cur', 'best', CFG.gateGames);
    let msg = `iter ${state.iter}: selfplay ${((t1 - t0) / 1000).toFixed(0)}s (avg ${(turns / CFG.selfplayGames).toFixed(1)} turns, buffer ${buffer.length}) train ${((t2 - t1) / 1000).toFixed(0)}s loss v=${loss.vl} p=${loss.pl} | vs best ${(vb * 100).toFixed(1)}%`;
    if (vb >= CFG.gateWin) {
      state.gen++;
      best = cur.clone();
      pool.setNet('best', best);
      fs.writeFileSync(bestPath, JSON.stringify(best.toJSON()));
      const vk = await arena(pool, 'best', null, CFG.kageGames);
      msg += ` -> NEW CHAMPION gen ${state.gen}, vs Kage ${(vk * 100).toFixed(1)}%`;
      exportWeights(best, { gen: state.gen, vsKage: vk, iter: state.iter });
    }
    fs.writeFileSync(statePath, JSON.stringify(state));
    fs.writeFileSync(path.join(DIR, 'cur.json'), JSON.stringify(cur.toJSON()));
    log(msg);
  }
  pool.close();
})();
