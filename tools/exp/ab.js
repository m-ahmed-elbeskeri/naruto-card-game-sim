// Head to head between two search settings on the same network, one game at a time (the options are global to the process).
//   node ab.js <a> <b> <games> <seed> [net=ai/best.json]
// Each side: its AZ.opts names, comma-separated ("base" for none), then ;key=value search settings, e.g.
//   "merge,knownTop;ms=750;worlds=3" v "merge,knownTop;ms=300;worlds=3", or "base;sims=24;cheat=1" (cheat: search sees the hidden cards).
// Defaults: 8 worlds, 24 simulations. Prints one JSON line in the same form as play.js.
const fs = require('fs');
const { NS, newGame } = require('../az-common.js');
const AZ = NS.AZ, opt = Object.fromEntries(process.argv.slice(6).map(a => a.split('=')));
const [na, nb, games, seed0] = [process.argv[2], process.argv[3], +process.argv[4], +process.argv[5]];
const net = AZ.Net.fromJSON(JSON.parse(fs.readFileSync(opt.net || 'ai/best.json', 'utf8')));
function side(s) {
  const [names, ...rest] = s.split(';'), o = Object.fromEntries(rest.filter(Boolean).map(a => a.split('=').map((x, i) => i ? +x : x)));
  const cfg = Object.assign({ worlds: 8, cpuct: 1.6 }, o.ms ? {} : { sims: 24 }, o);
  return { cfg, flags: { merge: names.split(',').includes('merge'), knownTop: names.split(',').includes('knownTop') } };
}
const A = side(na), B = side(nb);
class Player extends AZ.AZController {
  async decide(kind, g, pi, x) { AZ.opts = this.o.flags; return super.decide(kind, g, pi, x); }
}
const res = { a: na, b: nb, games: 0, wins: 0, by: {} };
(async () => {
  for (let i = 0; i < games; i++) {
    const seat = i % 2, mu = ['rb', 'rb', 'rr', 'bb'][(i >> 1) % 4], swap = ((i >> 3) % 2) === 1;
    const ctl = [0, 1].map(p => { const s = p === seat ? A : B; return new Player({ net, cfg: s.cfg, flags: s.flags }); });
    const { g } = newGame(ctl, swap, (seed0 * 100003 + i * 7919) >>> 0, mu);
    await g.start();
    const won = g.winner === seat ? 1 : 0, key = mu === 'rb' ? (g.p(seat).leader.card.id === 'N-001' ? 'a red' : 'a blue') : mu;
    res.games++; res.wins += won;
    const t = res.by[key] = res.by[key] || [0, 0]; t[0] += won; t[1]++;
  }
  console.log(JSON.stringify(res));
})();
