// Head to head between two networks inside the real search.
//   node play.js <a> <b> <games> <seed> [sims=24 | ms=300] [worlds=8]
// a / b: a train.py export (.json with cfg), a training checkpoint (ai/best.json style) or a site weights file (.js).
// Seats alternate; half the games are red v blue (decks alternate too), a quarter each red and blue mirrors.
// Prints one JSON line: a's wins per matchup.
const fs = require('fs');
const { NS, newGame } = require('../az-common.js');
const nets = require('./nets.js')(NS), AZ = NS.AZ;
const opt = Object.fromEntries(process.argv.slice(7).map(a => a.split('=')));
const [pa, pb, games, seed0] = [process.argv[2], process.argv[3], +process.argv[4], +process.argv[5]];
const kv = (process.argv[6] || 'sims=24').split('=');
function load(p) {
  const t = fs.readFileSync(p, 'utf8');
  if (p.endsWith('.js')) return AZ.Net.fromJSON(JSON.parse(t.slice(t.indexOf('{', t.indexOf('AZ_WEIGHTS')), t.lastIndexOf('}') + 1)));
  const j = JSON.parse(t);
  return j.cfg ? nets.load(p) : AZ.Net.fromJSON(j);
}
const A = load(pa), B = load(pb);
const cfg = Object.assign({ worlds: +(opt.worlds || 8), cpuct: 1.6 }, kv[0] === 'ms' ? { ms: +kv[1] } : { sims: +kv[1] });
const res = { a: pa, b: pb, cfg, games: 0, wins: 0, by: {} };
(async () => {
  for (let i = 0; i < games; i++) {
    const seat = i % 2, mu = ['rb', 'rb', 'rr', 'bb'][(i >> 1) % 4], swap = ((i >> 3) % 2) === 1;
    const ctl = [0, 1].map(p => new AZ.AZController({ net: p === seat ? A : B, cfg }));
    const { g } = newGame(ctl, swap, (seed0 * 100003 + i * 7919) >>> 0, mu);
    await g.start();
    const won = g.winner === seat ? 1 : 0, key = mu === 'rb' ? (g.p(seat).leader.card.id === 'N-001' ? 'a red' : 'a blue') : mu;
    res.games++; res.wins += won;
    const t = res.by[key] = res.by[key] || [0, 0]; t[0] += won; t[1]++;
  }
  console.log(JSON.stringify(res));
})();
