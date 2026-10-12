// Staged training for the Hokage bot, built to run on CI where one machine is small but many can run at once.
//   node tools/az-ci.js selfplay minutes=40 out=sp-1.bin.gz [threads=4] [games=0]
//       plays self-play games with ai/cur.json (or ai/best.json) until the time is up and writes the samples
//   node tools/az-ci.js learn in=sp [steps=3000] [gate=200] [kage=200] [threads=4]
//       trains on every sample file under `in`, gates the result against the champion, and updates ai/
//   node tools/az-ci.js match [games=400] [a=ai/best.json] [b=js/az-weights.js] [threads=4]
//       plays network a against network b (default: the champion against the one the site ships) and prints a's score
// The game workers are the ones in az-train.js.
const { Worker } = require('worker_threads');
const fs = require('fs'), path = require('path'), os = require('os'), zlib = require('zlib');
const { NS } = require('./az-common');
const AZ = NS.AZ;

const cmd = process.argv[2];
const args = Object.fromEntries(process.argv.slice(3).map(a => a.split('=')));
const DIR = process.env.AZ_DIR || path.join(__dirname, '..', 'ai');
const THREADS = +(args.threads || os.cpus().length);
const SEARCH = { worlds: 8, sims: 24, cpuct: 1.6 }, NOISE = { alpha: 0.3, eps: 0.25 }, TEMP_MOVES = 12;
const BATCH = 128, LR = 1e-3, GATE_WIN = 0.55, BUFFER_MAX = 600000; // the cap keeps the learn stage inside a CI runner's memory
const { S, A } = AZ.dims();
const log = (...a) => { const s = `[${new Date().toISOString().slice(0, 19).replace('T', ' ')}] ` + a.join(' '); console.log(s); return s; };
const loadNet = f => AZ.Net.fromJSON(JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')));

class Pool {
  constructor(n) {
    this.ws = []; this.free = []; this.q = []; this.cb = new Map(); this.id = 0; this.netVer = {}; this.nets = {};
    for (let i = 0; i < n; i++) {
      const w = new Worker(path.join(__dirname, 'az-train.js'));
      w.sent = {};
      w.on('message', m => { const f = this.cb.get(m.id); this.cb.delete(m.id); this.free.push(w); this.pump(); f(m); });
      w.on('error', e => log('worker error', e));
      this.ws.push(w); this.free.push(w);
    }
  }
  setNet(key, net) { this.nets[key] = net.toJSON(); this.netVer[key] = (this.netVer[key] || 0) + 1; }
  run(job) { return new Promise(r => { job.id = ++this.id; this.q.push([job, r]); this.pump(); }); }
  pump() {
    while (this.free.length && this.q.length) {
      const w = this.free.pop(), [job, r] = this.q.shift(), nets = {};
      for (const k in this.netVer) if (w.sent[k] !== this.netVer[k]) { nets[k] = this.nets[k]; w.sent[k] = this.netVer[k]; }
      this.cb.set(job.id, r);
      w.postMessage(Object.assign({ nets }, job));
    }
  }
  close() { this.ws.forEach(w => w.terminate()); }
}

// samples as one Float32 stream: [count, then per sample: k, z, s[S], a[k][A], pi[k]]
function encode(samples) {
  let len = 1; for (const x of samples) len += 2 + S + x.a.length * (A + 1);
  const f = new Float32Array(len); let o = 0; f[o++] = samples.length;
  for (const x of samples) {
    const k = x.a.length; f[o++] = k; f[o++] = x.z;
    for (let i = 0; i < S; i++) f[o++] = x.s[i];
    for (let c = 0; c < k; c++) for (let i = 0; i < A; i++) f[o++] = x.a[c][i];
    for (let c = 0; c < k; c++) f[o++] = x.pi_t[c];
  }
  return zlib.gzipSync(Buffer.from(f.buffer), { level: 6 });
}
function decode(buf, into) {
  const raw = zlib.gunzipSync(buf), f = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4); let o = 0; const n = f[o++];
  for (let j = 0; j < n; j++) {
    const k = f[o++], z = f[o++], s = f.slice(o, o + S); o += S; const a = [];
    for (let c = 0; c < k; c++) { a.push(f.slice(o, o + A)); o += A; }
    const pi_t = f.slice(o, o + k); o += k;
    into.push({ s, a, pi_t, z });
  }
}

async function selfplay() {
  const net = loadNet(fs.existsSync(path.join(DIR, 'cur.json')) ? 'cur.json' : 'best.json');
  const pool = new Pool(THREADS); pool.setNet('cur', net);
  const end = Date.now() + (+(args.minutes || 40)) * 60000, max = +(args.games || 0);
  const samples = []; let games = 0, turns = 0, errs = 0, started = 0;
  log(`selfplay: ${THREADS} threads, ${args.minutes || 40} min`);
  const one = async () => {
    while (Date.now() < end && (!max || started < max)) {
      started++;
      const r = await pool.run({ type: 'selfplay', search: SEARCH, noise: NOISE, tempMoves: TEMP_MOVES });
      if (r.error) { if (++errs < 3) log('selfplay error', r.error.slice(0, 400)); continue; }
      for (const x of r.samples) samples.push(x); games++; turns += r.turns;
      if (games % 20 === 0) log(`${games} games, ${samples.length} samples`);
    }
  };
  await Promise.all(Array.from({ length: THREADS }, one));
  pool.close();
  const out = args.out || 'sp.bin.gz', buf = encode(samples);
  fs.writeFileSync(out, buf);
  log(`done: ${games} games (avg ${(turns / Math.max(1, games)).toFixed(1)} turns), ${samples.length} samples, ${errs} errors, ${(buf.length / 1048576).toFixed(1)} MB -> ${out}`);
  if (!games) process.exit(1);
}

async function arena(pool, a, b, games) {
  const rs = await Promise.all(Array.from({ length: games }, (_, i) => pool.run({ type: 'arena', a, b, seat: i % 2, search: SEARCH })));
  const ok = rs.filter(r => !r.error); if (ok.length < rs.length) log('arena errors', rs.length - ok.length, (rs.find(r => r.error).error || '').slice(0, 300));
  return ok.reduce((t, r) => t + r.win, 0) / Math.max(1, ok.length);
}

async function learn() {
  const buffer = [], walk = d => fs.readdirSync(d, { withFileTypes: true }).forEach(e => { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (p.endsWith('.bin.gz')) decode(fs.readFileSync(p), buffer); });
  walk(args.in || 'sp');
  const total = buffer.length;
  if (total > BUFFER_MAX) { for (let i = 0; i < BUFFER_MAX; i++) { const j = i + ((Math.random() * (total - i)) | 0), t = buffer[i]; buffer[i] = buffer[j]; buffer[j] = t; } buffer.length = BUFFER_MAX; log(`kept ${BUFFER_MAX} of ${total} samples`); }
  if (buffer.length < 1000 && !args.force) { log('too few samples:', buffer.length); process.exit(1); }
  const state = JSON.parse(fs.readFileSync(path.join(DIR, 'state.json'), 'utf8'));
  let best = loadNet('best.json');
  const cur = fs.existsSync(path.join(DIR, 'cur.json')) ? loadNet('cur.json') : best.clone();
  state.iter++;
  const steps = +(args.steps || 3000), opt = new AZ.Adam(cur, LR), t0 = Date.now();
  let loss = {};
  for (let done = 0; done < steps;) {
    const n = Math.min(500, steps - done); let vl = 0, pl = 0, cnt = 0;
    for (let st = 0; st < n; st++) {
      const G = cur.zeros();
      for (let b = 0; b < BATCH; b++) { const x = buffer[(Math.random() * buffer.length) | 0], r = cur.backward(cur.forward(x.s, x.a, true), x.z, x.pi_t, G, 1); vl += r.vl; pl += r.pl; cnt++; }
      opt.step(G, 1 / BATCH);
    }
    done += n; loss = { v: (vl / cnt).toFixed(3), p: (pl / cnt).toFixed(3) }; log(`train ${done}/${steps} v=${loss.v} p=${loss.p}`);
  }
  const t1 = Date.now(), pool = new Pool(THREADS);
  pool.setNet('cur', cur); pool.setNet('best', best);
  const gate = +(args.gate || 200), kage = +(args.kage || 200);
  const vb = await arena(pool, 'cur', 'best', gate), vk = await arena(pool, 'cur', null, kage);
  pool.close();
  let msg = `iter ${state.iter}: ${buffer.length} samples, train ${((t1 - t0) / 1000).toFixed(0)}s loss v=${loss.v} p=${loss.p} | vs champion ${(vb * 100).toFixed(1)}% (${gate} games) | vs Kage ${(vk * 100).toFixed(1)}% (${kage} games)`;
  if (vb >= GATE_WIN) { state.gen++; best = cur; fs.writeFileSync(path.join(DIR, 'best.json'), JSON.stringify(best.toJSON())); msg += ` -> NEW CHAMPION gen ${state.gen}`; }
  state.lastKage = vk; state.lastGate = vb;
  fs.writeFileSync(path.join(DIR, 'cur.json'), JSON.stringify(cur.toJSON()));
  fs.writeFileSync(path.join(DIR, 'state.json'), JSON.stringify(state));
  fs.appendFileSync(path.join(DIR, 'log.txt'), log(msg) + '\n');
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, msg + '\n');
}

// Head to head. A .js weights file is the exported form: the same JSON assigned to window.NTCG.AZ_WEIGHTS.
async function match() {
  const read = f => { const t = fs.readFileSync(path.resolve(__dirname, '..', f), 'utf8'); return AZ.Net.fromJSON(JSON.parse(f.endsWith('.js') ? t.slice(t.indexOf('{', t.indexOf('AZ_WEIGHTS')), t.lastIndexOf('}') + 1) : t)); };
  const a = args.a || 'ai/best.json', b = args.b || 'js/az-weights.js', games = +(args.games || 400);
  const pool = new Pool(THREADS); pool.setNet('a', read(a)); pool.setNet('b', read(b));
  log(`match: ${a} vs ${b}, ${games} games, ${THREADS} threads`);
  let done = 0;
  const rs = await Promise.all(Array.from({ length: games }, (_, i) => pool.run({ type: 'arena', a: 'a', b: 'b', seat: i % 2, search: SEARCH }).then(r => { if (++done % 100 === 0) log(`${done}/${games}`); return r; })));
  pool.close();
  const ok = rs.filter(r => !r.error), n = ok.length, p = ok.reduce((t, r) => t + r.win, 0) / Math.max(1, n), ci = 196 * Math.sqrt(p * (1 - p) / Math.max(1, n));
  if (n < games) log('match errors', games - n, (rs.find(r => r.error).error || '').slice(0, 300));
  const msg = `MATCH RESULT: ${a} scores ${(p * 100).toFixed(1)}% (95% interval +-${ci.toFixed(1)}) against ${b} over ${n} games`;
  log(msg);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, msg + '\n');
  if (!n) process.exit(1);
}

const run = { selfplay, learn, match }[cmd];
(run ? run() : Promise.reject(new Error('usage: az-ci.js selfplay|learn|match'))).catch(e => { console.error(e); process.exit(1); });
