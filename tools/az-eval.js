// Strength test: AZ bot vs the Kage heuristic.
//   node tools/az-eval.js games=100 worlds=8 sims=24 threads=8 [weights=ai/best.json] [cheat=1]
// cheat=1 skips determinization (the bot sees all hidden cards) -> an upper bound on what search can reach.
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const fs = require('fs'), path = require('path');
const { NS, newGame } = require('./az-common');
const AZ = NS.AZ;

const args = Object.fromEntries(process.argv.slice(2).map(a => a.split('=')));
const opt = { games: +(args.games || 100), worlds: +(args.worlds || 8), sims: +(args.sims || 24), threads: +(args.threads || 8), weights: args.weights || path.join(__dirname, '..', 'ai', 'best.json'), cheat: args.cheat === '1', opp: args.opp || 'kage', rollout: +(args.rollout || 0), nonet: args.nonet === '1' };

if (!isMainThread) {
  const net = workerData.nonet ? null : AZ.Net.fromJSON(JSON.parse(fs.readFileSync(workerData.weights, 'utf8')));
  parentPort.on('message', async m => {
    const A = new AZ.AZController({ net, cfg: { worlds: workerData.worlds, sims: workerData.sims, cpuct: 1.6, cheat: workerData.cheat, rollout: workerData.rollout } });
    const B = new NS.AI.AIController(workerData.opp, { fast: true });
    const seat = m.i % 2, swap = (m.i >> 1) % 2 === 1;
    const { g } = newGame(seat === 0 ? [A, B] : [B, A], swap);
    await g.start();
    parentPort.postMessage({ win: g.winner == null ? 0.5 : g.winner === seat ? 1 : 0, deck: swap ? 1 - seat : seat, first: g.first === seat, turns: g.turn });
  });
  return;
}
(async () => {
  const t0 = Date.now();
  let done = 0, wins = 0; const byDeck = [[0, 0], [0, 0]], byFirst = [[0, 0], [0, 0]];
  const ws = [];
  let next = 0;
  await new Promise(res => {
    for (let t = 0; t < opt.threads; t++) {
      const w = new Worker(__filename, { workerData: opt });
      ws.push(w);
      const feed = () => { if (next < opt.games) w.postMessage({ i: next++ }); };
      w.on('message', r => {
        done++; wins += r.win;
        byDeck[r.deck][0] += r.win; byDeck[r.deck][1]++;
        byFirst[r.first ? 0 : 1][0] += r.win; byFirst[r.first ? 0 : 1][1]++;
        if (done === opt.games) res(); else feed();
      });
      w.on('error', e => { console.error(e); });
      feed();
    }
  });
  ws.forEach(w => w.terminate());
  const pct = (a) => a[1] ? (100 * a[0] / a[1]).toFixed(1) + '% of ' + a[1] : '-';
  const p = wins / done, se = Math.sqrt(p * (1 - p) / done);
  console.log(`${JSON.stringify(opt)}\nwin ${(100 * p).toFixed(1)}% ±${(196 * se).toFixed(1)} | as red ${pct(byDeck[0])} | as blue ${pct(byDeck[1])} | going first ${pct(byFirst[0])} | going second ${pct(byFirst[1])} | ${((Date.now() - t0) / 1000).toFixed(0)}s`);
})();
