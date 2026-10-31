// Head to head between two search settings on the same network, one game at a time (the options are global to the process).
//   node ab.js <a options> <b options> <games> <seed> [net=ai/best.json] [sims=24] [worlds=8]
// Options: comma-separated names switched on in AZ.opts, or "base" for none, e.g. merge,knownTop v base.
// Prints one JSON line in the same form as play.js.
const fs = require('fs');
const { NS, newGame } = require('../az-common.js');
const AZ = NS.AZ, opt = Object.fromEntries(process.argv.slice(6).map(a => a.split('=')));
const [na, nb, games, seed0] = [process.argv[2], process.argv[3], +process.argv[4], +process.argv[5]];
const net = AZ.Net.fromJSON(JSON.parse(fs.readFileSync(opt.net || 'ai/best.json', 'utf8')));
const cfg = { worlds: +(opt.worlds || 8), sims: +(opt.sims || 24), cpuct: 1.6 };
const flags = s => ({ merge: s.split(',').includes('merge'), knownTop: s.split(',').includes('knownTop') });
class Player extends AZ.AZController {
  async decide(kind, g, pi, x) { AZ.opts = this.o.flags; return super.decide(kind, g, pi, x); }
}
const res = { a: na, b: nb, cfg, games: 0, wins: 0, by: {} };
(async () => {
  for (let i = 0; i < games; i++) {
    const seat = i % 2, mu = ['rb', 'rb', 'rr', 'bb'][(i >> 1) % 4], swap = ((i >> 3) % 2) === 1;
    const ctl = [0, 1].map(p => new Player({ net, cfg, flags: flags(p === seat ? na : nb) }));
    const { g } = newGame(ctl, swap, (seed0 * 100003 + i * 7919) >>> 0, mu);
    await g.start();
    const won = g.winner === seat ? 1 : 0, key = mu === 'rb' ? (g.p(seat).leader.card.id === 'N-001' ? 'a red' : 'a blue') : mu;
    res.games++; res.wins += won;
    const t = res.by[key] = res.by[key] || [0, 0]; t[0] += won; t[1]++;
  }
  console.log(JSON.stringify(res));
})();
