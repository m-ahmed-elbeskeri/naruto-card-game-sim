// Staged training for the Hokage bot, built to run on CI where one machine is small but many can run at once.
//   node tools/az-ci.js selfplay minutes=40 out=sp-1.bin.gz [sims=48] [past=0] [threads=4] [games=0]
//       plays self-play games with ai/cur.json (or ai/best.json) until the time is up and writes the samples;
//       sims= is the search per world (8 worlds), deeper than the gate's 24 so the moves learned from are sharper;
//       past= is the share of games played against past champions (ai/pool/gen-N.json and the current champion)
//       instead of itself, and writes the learner's score against each to sp-1.league.json
//   node tools/az-ci.js learn in=sp [steps=3000] [lr=0.0003] [sims=48] [past=0] [gate=200] [gatewin=0.55] [kage=200] [threads=4]
//       trains on every sample file under `in`, gates the result against the champion (always at 8 x 24; it takes
//       the gatewin share of the games to replace it), and updates ai/; sims= and past= only label the log line.
//       A champion that is replaced moves to ai/pool/.
//   node tools/az-ci.js match [games=400] [a=ai/best.json] [b=js/az-weights.js | b=genin|chunin|jonin|kage] [threads=4]
//       plays network a against network b, or against one of the heuristic levels (default: the champion against the
//       network the site ships), and prints a's score: overall, per matchup, per deck side and per turn order;
//       worlds= / sims= change the search both players use (default 8 x 24, as in training); ms= gives both players
//       the same thinking time per decision instead, as the browser does, which is the fair test between networks
//       of different sizes (a larger one searches less in the same time); json=<file> also writes every game's
//       result there for `verdict`, tagged with group= and label=
//   node tools/az-ci.js shipplan [past=3]
//       prints the match jobs of a ship check (see .github/workflows/shipcheck.yml) as a GitHub Actions matrix
//   node tools/az-ci.js verdict in=results
//       combines a ship check's result files into one table and says whether the network can go on the site
//   node tools/az-ci.js export ref=<commit> score=<v live> games=<n> kage=<v Kage> kage-games=<n>
//       writes ai/best.json from <commit> to js/az-weights.js, the network the site ships, with those results
// Decks: every stage takes mix=<share of mirror matches> (default 0.5: half red against blue, a quarter each red
// and blue mirror), so the bot is trained and judged on every matchup the two decks allow.
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
const SP_SEARCH = Object.assign({}, SEARCH, { sims: +args.sims || 48 }); // self-play only
const BATCH = 128, LR = +args.lr || 3e-4, GATE_WIN = +args.gatewin || 0.55, BUFFER_MAX = 600000; // the cap keeps the learn stage inside a CI runner's memory
const MIX = args.mix == null || args.mix === '' ? 0.5 : Math.max(0, Math.min(1, +args.mix));
// score per matchup, e.g. "rb 61% (402) / rr 58% (199) / bb 57% (199)"
const cell = (rs, label) => rs.length ? `${label} ${(100 * rs.reduce((t, r) => t + r.win, 0) / rs.length).toFixed(0)}% (${rs.length})` : '';
const split = rs => ['rb', 'rr', 'bb'].map(k => cell(rs.filter(r => r.matchup === k), k)).filter(Boolean).join(' / ');
// red against blue seen from each side, and the score by turn order
const sides = rs => [cell(rs.filter(r => r.matchup === 'rb' && r.deck === 'r'), 'as red v blue'), cell(rs.filter(r => r.matchup === 'rb' && r.deck === 'b'), 'as blue v red'),
  cell(rs.filter(r => r.first), 'going first'), cell(rs.filter(r => !r.first), 'going second')].filter(Boolean).join(' / ');
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

// Past champions: every champion that has been replaced is kept in ai/pool/gen-N.json (the newest POOL_KEEP), and the
// current one is ai/best.json. Self-play alone only ever meets the learner's own latest version, so it can forget how
// to beat a style it has moved away from; playing a share of the games against these keeps those styles in its data.
const POOL_KEEP = 6, PAST = Math.max(0, Math.min(1, +(args.past || 0)));
function pastChampions() {
  const dir = path.join(DIR, 'pool'), state = JSON.parse(fs.readFileSync(path.join(DIR, 'state.json'), 'utf8'));
  const old = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => /^gen-\d+\.json$/.test(f)).map(f => +f.match(/\d+/)[0]).sort((x, y) => x - y) : [];
  return old.map(gen => ({ gen, file: path.join('pool', `gen-${gen}.json`) })).concat([{ gen: state.gen, file: 'best.json' }]);
}
const leagueText = rows => rows.filter(r => r.n).map(r => `gen ${r.gen} ${(100 * r.w / r.n).toFixed(0)}% (${r.n})`).join(' / ');

async function selfplay() {
  const net = loadNet(fs.existsSync(path.join(DIR, 'cur.json')) ? 'cur.json' : 'best.json');
  const pool = new Pool(THREADS); pool.setNet('cur', net);
  const past = PAST > 0 ? pastChampions() : [], league = past.map(c => ({ gen: c.gen, n: 0, w: 0 }));
  past.forEach((c, i) => pool.setNet('past' + i, loadNet(c.file)));
  const end = Date.now() + (+(args.minutes || 40)) * 60000, max = +(args.games || 0);
  const samples = []; let games = 0, turns = 0, errs = 0, started = 0;
  log(`selfplay: ${THREADS} threads, ${args.minutes || 40} min, ${Math.round(MIX * 100)}% mirror matches, search ${SP_SEARCH.worlds} x ${SP_SEARCH.sims}` +
    (past.length ? `, ${Math.round(PAST * 100)}% of games against past champions (gen ${past.map(c => c.gen).join(', ')})` : ''));
  const seen = { rb: 0, rr: 0, bb: 0 };
  const one = async () => {
    while (Date.now() < end && (!max || started < max)) {
      const seat = started++ % 2, k = past.length && Math.random() < PAST ? (Math.random() * past.length) | 0 : -1;
      const job = { search: SP_SEARCH, noise: NOISE, tempMoves: TEMP_MOVES, mix: MIX };
      const r = await pool.run(k < 0 ? Object.assign(job, { type: 'selfplay' }) : Object.assign(job, { type: 'league', opp: 'past' + k, seat }));
      if (r.error) { if (++errs < 3) log('selfplay error', r.error.slice(0, 400)); continue; }
      for (const x of r.samples) samples.push(x); games++; turns += r.turns; seen[r.matchup]++;
      if (k >= 0) { league[k].n++; league[k].w += r.win; }
      if (games % 20 === 0) log(`${games} games, ${samples.length} samples`);
    }
  };
  await Promise.all(Array.from({ length: THREADS }, one));
  pool.close();
  const out = args.out || 'sp.bin.gz', buf = encode(samples);
  fs.writeFileSync(out, buf);
  if (past.length) { fs.writeFileSync(out.replace(/\.bin\.gz$/, '') + '.league.json', JSON.stringify(league)); log(`learner against past champions: ${leagueText(league)}`); }
  log(`matchups: red v blue ${seen.rb}, red mirror ${seen.rr}, blue mirror ${seen.bb}`);
  log(`done: ${games} games (avg ${(turns / Math.max(1, games)).toFixed(1)} turns), ${samples.length} samples, ${errs} errors, ${(buf.length / 1048576).toFixed(1)} MB -> ${out}`);
  if (!games) process.exit(1);
}

async function arena(pool, a, b, games, by) {
  const rs = await Promise.all(Array.from({ length: games }, (_, i) => pool.run({ type: 'arena', a, b, seat: i % 2, search: SEARCH, mix: MIX })));
  const ok = rs.filter(r => !r.error); if (ok.length < rs.length) log('arena errors', rs.length - ok.length, (rs.find(r => r.error).error || '').slice(0, 300));
  if (by) by.text = split(ok);
  return ok.reduce((t, r) => t + r.win, 0) / Math.max(1, ok.length);
}

async function learn() {
  const buffer = [], league = {};
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).forEach(e => {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (p.endsWith('.bin.gz')) decode(fs.readFileSync(p), buffer);
    else if (p.endsWith('.league.json')) for (const r of JSON.parse(fs.readFileSync(p, 'utf8'))) { const t = league[r.gen] = league[r.gen] || { gen: r.gen, n: 0, w: 0 }; t.n += r.n; t.w += r.w; }
  });
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
  const sb = {}, sk = {}, vb = await arena(pool, 'cur', 'best', gate, sb), vk = await arena(pool, 'cur', null, kage, sk);
  pool.close();
  const lg = leagueText(Object.values(league).sort((x, y) => x.gen - y.gen));
  let msg = `iter ${state.iter}: ${buffer.length} samples (self-play ${SP_SEARCH.worlds} x ${SP_SEARCH.sims}${PAST > 0 ? `, ${Math.round(PAST * 100)}% v past champions` : ''}), train ${((t1 - t0) / 1000).toFixed(0)}s lr ${LR} loss v=${loss.v} p=${loss.p} | vs champion ${(vb * 100).toFixed(1)}% (${gate} games: ${sb.text}) | vs Kage ${(vk * 100).toFixed(1)}% (${kage} games: ${sk.text})` +
    (lg ? ` | self-play learner v past champions: ${lg}` : '');
  if (vb >= GATE_WIN) {
    // the champion being replaced joins the past champions; the oldest beyond POOL_KEEP drop out
    const dir = path.join(DIR, 'pool');
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(path.join(DIR, 'best.json'), path.join(dir, `gen-${state.gen}.json`));
    const kept = fs.readdirSync(dir).filter(f => /^gen-\d+\.json$/.test(f)).sort((x, y) => +y.match(/\d+/)[0] - +x.match(/\d+/)[0]);
    for (const f of kept.slice(POOL_KEEP)) fs.unlinkSync(path.join(dir, f));
    state.gen++; best = cur; fs.writeFileSync(path.join(DIR, 'best.json'), JSON.stringify(best.toJSON())); msg += ` -> NEW CHAMPION gen ${state.gen}`;
  }
  state.lastKage = vk; state.lastGate = vb;
  fs.writeFileSync(path.join(DIR, 'cur.json'), JSON.stringify(cur.toJSON()));
  fs.writeFileSync(path.join(DIR, 'state.json'), JSON.stringify(state));
  fs.appendFileSync(path.join(DIR, 'log.txt'), log(msg) + '\n');
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, msg + '\n');
}

// Head to head. A .js weights file is the exported form: the same JSON assigned to window.NTCG.AZ_WEIGHTS.
async function match() {
  const read = f => { const t = fs.readFileSync(path.resolve(__dirname, '..', f), 'utf8'); return AZ.Net.fromJSON(JSON.parse(f.endsWith('.js') ? t.slice(t.indexOf('{', t.indexOf('AZ_WEIGHTS')), t.lastIndexOf('}') + 1) : t)); };
  const a = args.a || 'ai/best.json', b = args.b || 'js/az-weights.js', games = +(args.games || 400), level = ['genin', 'chunin', 'jonin', 'kage'].includes(b) ? b : null;
  const pool = new Pool(THREADS); pool.setNet('a', read(a)); if (!level) pool.setNet('b', read(b));
  const search = Object.assign({}, SEARCH, +args.worlds ? { worlds: +args.worlds } : {}, +args.sims ? { sims: +args.sims } : {}, +args.ms ? { ms: +args.ms } : {});
  const how = search.ms ? `${search.worlds} x ${search.ms} ms` : `${search.worlds} x ${search.sims}`;
  log(`match: ${a} vs ${b}, ${games} games, ${THREADS} threads, ${Math.round(MIX * 100)}% mirror matches, search ${how}`);
  let done = 0;
  const rs = await Promise.all(Array.from({ length: games }, (_, i) => pool.run({ type: 'arena', a: 'a', b: level ? null : 'b', level, seat: i % 2, search, mix: MIX }).then(r => { if (++done % 100 === 0) log(`${done}/${games}`); return r; })));
  pool.close();
  const ok = rs.filter(r => !r.error), n = ok.length, p = ok.reduce((t, r) => t + r.win, 0) / Math.max(1, n), ci = 196 * Math.sqrt(p * (1 - p) / Math.max(1, n));
  if (n < games) log('match errors', games - n, (rs.find(r => r.error).error || '').slice(0, 300));
  const msg = `MATCH RESULT: ${a} scores ${(p * 100).toFixed(1)}% (95% interval +-${ci.toFixed(1)}) against ${b} over ${n} games (search ${how}) | ${split(ok)} | ${sides(ok)}`;
  log(msg);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, msg + '\n');
  if (args.json) fs.writeFileSync(args.json, JSON.stringify({ group: args.group || 'match', label: args.label || b, a, b, search: how, results: ok.map(r => [r.win, r.matchup, r.deck, r.first ? 1 : 0]) }));
  if (!n) process.exit(1);
}

// ---------------- ship check ----------------
// What a new champion has to clear before it goes on the site (.github/workflows/shipcheck.yml runs the jobs in parallel):
//   live   1600 games against the live network at training search: clearly ahead overall, not behind in any matchup
//   deep   800 games against it at 12 x 150, closer to the search players face: not behind
//   gen-N  400 games against each of the last `past` generations that were live before: not behind any of them,
//          so a gain against the live network is not just an exploit of its habits
//   kage   400 games against the Kage heuristic, which plays nothing like it: at least 90%, so nothing is broken
const ROOT = path.join(__dirname, '..');
const git = (...a) => require('child_process').execFileSync('git', a, { cwd: ROOT, maxBuffer: 1 << 28 }).toString();
const genOf = t => +((t.match(/"meta":\{"gen":(\d+)/) || [])[1]);

function shipplan() {
  const live = genOf(fs.readFileSync(path.join(ROOT, 'js', 'az-weights.js'), 'utf8')), seen = new Set([live]), older = [];
  for (const c of git('log', '--format=%h', '--', 'js/az-weights.js').split('\n').filter(Boolean)) {
    const g = genOf(git('show', `${c}:js/az-weights.js`));
    if (!Number.isFinite(g) || seen.has(g)) continue;
    seen.add(g); older.push({ gen: g, ref: c });
    if (older.length >= +(args.past || 3)) break;
  }
  const job = (name, group, label, o) => Object.assign({ name, group, label, b: 'js/az-weights.js', ref: '', games: 400, worlds: '', sims: '' }, o);
  const jobs = [];
  for (let i = 1; i <= 4; i++) jobs.push(job(`live-${i}`, 'live', `gen ${live} (live)`));
  for (let i = 1; i <= 4; i++) jobs.push(job(`deep-${i}`, 'deep', `gen ${live} (live), search 12 x 150`, { games: 200, worlds: 12, sims: 150 }));
  for (const o of older) jobs.push(job(`gen-${o.gen}`, `gen-${o.gen}`, `gen ${o.gen} (live before)`, { b: '', ref: o.ref }));
  jobs.push(job('kage', 'kage', 'Kage', { b: 'kage' }));
  console.log('matrix=' + JSON.stringify(jobs));
}

function verdict() {
  const groups = {};
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).forEach(e => {
    const p = path.join(d, e.name);
    if (e.isDirectory()) return walk(p);
    if (!p.endsWith('.json')) return;
    const r = JSON.parse(fs.readFileSync(p, 'utf8')), g = groups[r.group] = groups[r.group] || { label: r.label, a: r.a, search: r.search, rs: [] };
    for (const [win, matchup, deck, first] of r.results) g.rs.push({ win, matchup, deck, first: !!first });
  });
  walk(args.in || 'results');
  const stat = rs => { const n = rs.length, p = rs.reduce((t, r) => t + r.win, 0) / Math.max(1, n); return { n, p, ci: 1.96 * Math.sqrt(p * (1 - p) / Math.max(1, n)) }; };
  const pct = x => (100 * x).toFixed(1) + '%';
  // pass: at least level; hold: below but within the noise; fail: clearly below
  const notBehind = s => s.p >= 0.5 ? 'pass' : s.p + s.ci >= 0.5 ? 'hold' : 'fail';
  const order = ['live', 'deep', ...Object.keys(groups).filter(k => /^gen-/.test(k)).sort((x, y) => +y.slice(4) - +x.slice(4)), 'kage'];
  const lines = [], problems = [];
  lines.push('| Check | Opponent | Search | Games | Score | rb | rr | bb | Result |', '|---|---|---|---|---|---|---|---|---|');
  for (const k of order) {
    const g = groups[k];
    if (!g) { problems.push(['fail', `${k}: no results`]); continue; }
    const s = stat(g.rs), by = ['rb', 'rr', 'bb'].map(m => stat(g.rs.filter(r => r.matchup === m)));
    let res;
    if (k === 'live') {
      res = s.p - s.ci > 0.5 ? 'pass' : s.p >= 0.5 ? 'hold' : notBehind(s);
      if (res !== 'pass') problems.push([res, `not clearly ahead of the live network (${pct(s.p)} +-${(100 * s.ci).toFixed(1)})`]);
      by.forEach((m, i) => { const r = m.n ? notBehind(m) : 'pass'; if (r !== 'pass') { problems.push([r, `behind the live network in ${['rb', 'rr', 'bb'][i]} (${pct(m.p)} of ${m.n})`]); if (res === 'pass') res = r; } });
    } else if (k === 'kage') {
      res = s.p >= 0.9 ? 'pass' : 'fail';
      if (res !== 'pass') problems.push([res, `only ${pct(s.p)} against Kage`]);
    } else {
      res = notBehind(s);
      if (res !== 'pass') problems.push([res, `behind ${g.label}${k === 'deep' ? ' at deeper search' : ''} (${pct(s.p)} +-${(100 * s.ci).toFixed(1)})`]);
    }
    lines.push(`| ${k} | ${g.label} | ${g.search} | ${s.n} | ${pct(s.p)} +-${(100 * s.ci).toFixed(1)} | ${by.map(m => m.n ? `${(100 * m.p).toFixed(0)}% (${m.n})` : '-').join(' | ')} | ${res.toUpperCase()} |`);
  }
  const worst = problems.some(p => p[0] === 'fail') ? 'fail' : problems.length ? 'hold' : 'pass';
  const head = `SHIP CHECK: ${{ pass: 'SHIP', hold: 'HOLD', fail: "DON'T SHIP" }[worst]}`;
  const why = problems.map(p => `- ${p[0] === 'fail' ? 'FAIL' : 'HOLD'}: ${p[1]}`);
  const live = groups.live && stat(groups.live.rs), kage = groups.kage && stat(groups.kage.rs), sha = (process.env.GITHUB_SHA || git('rev-parse', 'HEAD').trim()).slice(0, 7);
  const a = (Object.values(groups)[0] || {}).a || 'ai/best.json';
  let who = a;
  if (a === 'ai/best.json') { const st = JSON.parse(fs.readFileSync(path.join(DIR, 'state.json'), 'utf8')); who = `ai/best.json (gen ${st.gen}) at ${sha}`; }
  const out = [head, '', `Candidate: ${who}`, '', ...lines, '', ...(why.length ? why : ['Everything passed.'])];
  if (a === 'ai/best.json' && live && kage && worst !== 'fail') out.push('', worst === 'pass' ? 'To ship it:' : 'To ship it anyway:', '', `    node tools/az-ci.js export ref=${sha} score=${live.p.toFixed(3)} games=${live.n} kage=${kage.p.toFixed(3)} kage-games=${kage.n}`);
  console.log(out.join('\n'));
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, out.join('\n') + '\n');
}

// Ship: ai/best.json from the commit the ship check ran on becomes js/az-weights.js, and the cache version in
// index.html changes so browsers (and the search workers, which load the weights with ?v=) fetch it.
function exportNet() {
  if (!args.ref || args.games == null || args.kage == null) throw new Error('usage: az-ci.js export ref=<commit> score=<v live> games=<n> kage=<v Kage> kage-games=<n>');
  const net = JSON.parse(git('show', `${args.ref}:ai/best.json`)), state = JSON.parse(git('show', `${args.ref}:ai/state.json`));
  const promoted = git('show', `${args.ref}:ai/log.txt`).split('\n').find(l => l.includes(`NEW CHAMPION gen ${state.gen}`)), iter = promoted ? +promoted.match(/iter (\d+)/)[1] : state.iter;
  if (net.v !== 1 || !net.dims || !net.p) throw new Error('unexpected weights format');
  const file = path.join(ROOT, 'js', 'az-weights.js'), prev = genOf(fs.readFileSync(file, 'utf8'));
  const meta = { gen: state.gen, vsKage: +args.kage, iter, games: +(args['kage-games'] || 0), vsShipped: { gen: prev, score: +args.score, games: +args.games } };
  fs.writeFileSync(file, `/* AlphaZero-style network for the NARUTO CARD GAME bot — generated by tools/az-train.js */\nwindow.NTCG = window.NTCG || {};\nwindow.NTCG.AZ_WEIGHTS = ${JSON.stringify(Object.assign({ v: net.v, dims: net.dims, p: net.p }, { meta }))};\n`);
  const t = fs.readFileSync(file, 'utf8'), back = JSON.parse(t.slice(t.indexOf('{', t.indexOf('AZ_WEIGHTS')), t.lastIndexOf('}') + 1));
  if (JSON.stringify(back.p) !== JSON.stringify(net.p) || JSON.stringify(back.dims) !== JSON.stringify(net.dims)) throw new Error('the written weights differ from the source');
  const html = path.join(ROOT, 'index.html'), h = fs.readFileSync(html, 'utf8'), old = (h.match(/\?v=(\d{6,})/) || [])[1], v = String(Math.floor(Date.now() / 1000));
  if (old) fs.writeFileSync(html, h.split(`v=${old}`).join(`v=${v}`));
  log(`exported gen ${state.gen} (iter ${iter}) from ${args.ref} over gen ${prev}; cache version ${old} -> ${v}`);
}

const run = { selfplay, learn, match, shipplan, verdict, export: exportNet }[cmd];
(run ? Promise.resolve().then(run) : Promise.reject(new Error('usage: az-ci.js selfplay|learn|match|shipplan|verdict|export'))).catch(e => { console.error(e); process.exit(1); });
