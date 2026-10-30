// Self-play games for the network comparison, saved as replays: seed, decks, the full decision log and, for
// every searched decision, its log index and the search's visit shares. Any input encoding can be rebuilt later
// by replaying the log. Same settings as training self-play (noise, 12 sampled moves), search 8 x 24.
// node record.js <out.jsonl> <minutes> <seed base> [net=ai/best.json]
const fs = require('fs');
const ROOT = require('path').join(__dirname, '..', '..') + '/';
const { NS, newGame } = require(ROOT + 'tools/az-common.js');
const [out, minutes, base] = [process.argv[2], +process.argv[3] || 10, +process.argv[4] || 1];
const net = NS.AZ.Net.fromJSON(JSON.parse(fs.readFileSync(ROOT + (process.argv[5] || 'ai/best.json'), 'utf8')));
const end = Date.now() + minutes * 60000;
(async () => {
  for (let i = 0; Date.now() < end; i++) {
    let cur = null;
    const searched = [];
    const mk = () => new NS.AZ.AZController({
      net, cfg: { worlds: 8, sims: 24, cpuct: 1.6, noise: { alpha: 0.3, eps: 0.25 } },
      record: x => searched.push([cur.log.length, x.pi, x.pi_t.map(p => Math.round(p * 1e4) / 1e4)]),
      temp: (g, n) => (n < 12 ? 1 : 0),
    });
    const mu = Math.random() < 0.5 ? (Math.random() < 0.5 ? 'rr' : 'bb') : 'rb', swap = Math.random() < 0.5, seed = (base * 1000003 + i * 7919) >>> 0;
    const { g } = newGame([mk(), mk()], swap, seed, mu);
    cur = g;
    await g.start();
    if (g.winner == null) continue;
    fs.appendFileSync(out, JSON.stringify({ seed, mu, swap, winner: g.winner, turns: g.turn, log: g.log, searched }) + '\n');
  }
})();
