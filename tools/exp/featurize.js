// Replays recorded games and writes, for every searched decision, three encodings of the same position:
//   S    the current network's state features (271)          A    its per-move features (76)
//   TOK  one token per leader / Character / hand card / set Support / chain link: F numbers + a card index
//   PTR  for each move, the token it acts with and the token it targets (-1: none)
// plus the search's visit shares (PI) and the outcome for the deciding player (Z).
// node featurize.js <out dir> <games.jsonl>...
const fs = require('fs'), path = require('path');
const ROOT = require('path').join(__dirname, '..', '..') + '/';
const { NS, newGame } = require(ROOT + 'tools/az-common.js');
const AZ = NS.AZ, { S, A, n } = AZ.dims(), IDS = Object.keys(NS.Cards.byId).sort();
const { tokens, T, F, SLOTS } = require('./tokens.js')(NS);
const out = process.argv[2], files = process.argv.slice(3);
fs.mkdirSync(out, { recursive: true });

// streamed to disk every 2000 positions so memory stays small
const names = { S: 'S.f32', TOK: 'TOK.f32', TOKC: 'TOKC.i8', A: 'A.f32', PTR: 'PTR.i8', PI: 'PI.f32', AOFF: 'AOFF.i32', META: 'META.i32' };
const fds = {}; for (const k in names) fds[k] = fs.openSync(path.join(out, names[k]), 'w');
let bufs, npos = 0;
const fresh = () => { bufs = { S: [], TOK: [], TOKC: [], A: [], PTR: [], PI: [], AOFF: [], META: [] }; };
fresh();
function flush() {
  const f32 = arrs => { const n = arrs.reduce((t, a) => t + a.length, 0), o = new Float32Array(n); let k = 0; for (const a of arrs) { o.set(a, k); k += a.length; } return Buffer.from(o.buffer); };
  const i8 = arrs => Buffer.from(Int8Array.from(arrs.flatMap(c => Array.from(c))).buffer);
  fs.writeSync(fds.S, f32(bufs.S)); fs.writeSync(fds.TOK, f32(bufs.TOK)); fs.writeSync(fds.A, f32(bufs.A));
  fs.writeSync(fds.TOKC, i8(bufs.TOKC)); fs.writeSync(fds.PTR, i8(bufs.PTR));
  fs.writeSync(fds.PI, Buffer.from(Float32Array.from(bufs.PI).buffer));
  fs.writeSync(fds.AOFF, Buffer.from(Int32Array.from(bufs.AOFF).buffer));
  fs.writeSync(fds.META, Buffer.from(Int32Array.from(bufs.META.flat()).buffer));
  fresh();
}
let nact = 0, skipped = 0, gameNo = 0;
async function replay(rec) {
  const searched = new Map(rec.searched.map(([li, pi, v]) => [li, { pi, v }]));
  const ask = (kind, g, pi, x) => {
    const li = g.log.length, k = rec.log[li], hit = searched.get(li);
    if (hit) {
      const D = AZ.describe(kind, g, pi, x);
      if (D.cands.length !== hit.v.length) skipped++;
      else {
        const s = AZ.stateFeat(g, pi, D), { tok, card, ptr } = tokens(g, pi, D);
        bufs.S.push(s); bufs.TOK.push(tok); bufs.TOKC.push(card);
        D.cands.forEach((c, j) => { bufs.A.push(AZ.actFeat(g, pi, D, c)); bufs.PTR.push(ptr[j]); bufs.PI.push(hit.v[j]); });
        bufs.AOFF.push(nact); nact += D.cands.length; npos++;
        bufs.META.push([rec.winner === pi ? 1 : -1, gameNo, pi, ['main', 'respond', 'choose'].indexOf(kind)]);
      }
    }
    if (kind === 'main') return k === -1 ? null : x[k];
    if (kind === 'respond') return k < 0 ? null : x.options[k];
    return k < 0 ? null : x.options[k];
  };
  const ctl = { takeMain: async (g, p, acts) => ask('main', g, p, acts), respond: async (g, p, w) => ask('respond', g, p, w), choose: async (g, req) => ask('choose', g, req.player, req) };
  const { g } = newGame([ctl, ctl], rec.swap, rec.seed, rec.mu);
  await g.start();
  if (g.winner !== rec.winner) throw new Error(`game ${gameNo} replayed to a different result`);
}
(async () => {
  for (const f of files) for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    await replay(JSON.parse(line)); gameNo++;
    if (bufs.S.length >= 2000) flush();
  }
  bufs.AOFF.push(nact); flush();
  for (const k in fds) fs.closeSync(fds[k]);
  fs.writeFileSync(path.join(out, 'info.json'), JSON.stringify({ N: npos, M: nact, S, A, T, F, SLOTS, cards: n, games: gameNo, skipped }));
  console.log(JSON.stringify({ N: npos, M: nact, games: gameNo, skipped }));
})();
