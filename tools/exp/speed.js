// Simulations per second under each search option, on the same real positions, taking turns so machine load evens out.
//   node speed.js [rounds=5] [net=ai/best.json]
const fs = require('fs');
const { NS, newGame } = require('../az-common.js');
const AZ = NS.AZ, opt = Object.fromEntries(process.argv.slice(2).map(a => a.split('=')));
const net = AZ.Net.fromJSON(JSON.parse(fs.readFileSync(opt.net || 'ai/best.json', 'utf8')));
const sets = {
  base: { merge: false, knownTop: false },
  merge: { merge: true, knownTop: false },
  knownTop: { merge: false, knownTop: true },
  both: { merge: true, knownTop: true },
};
const specs = [], rng = NS.mulberry32(11);
const player = i => {
  const c = new NS.AI.AIController('kage', { fast: true, rand: NS.mulberry32(i) }), m = c.takeMain.bind(c);
  c.takeMain = async (g, pi, a) => { if (g.turn > 3 && a.length > 3 && rng() < 0.25) specs.push([g.spec(), pi]); return m(g, pi, a); };
  return c;
};
(async () => {
  for (let i = 0; i < 24 && specs.length < 100; i++) {
    const { g } = newGame([player(i * 2 + 1), player(i * 2 + 2)], i % 2 === 1, 500 + i, ['rb', 'rr', 'bb'][i % 3]);
    await g.start();
  }
  const use = specs.slice(0, 100), t = {};
  for (let round = 0; round < +(opt.rounds || 5); round++) {
    for (const k of Object.keys(sets)) {
      AZ.opts = sets[k];
      const t0 = process.hrtime.bigint(); let sims = 0;
      for (const [sp, pi] of use) { const r = await AZ.search(sp, pi, net, { worlds: 4, sims: 24, seed: 3 }); if (r) sims += r.sims; }
      const us = Number(process.hrtime.bigint() - t0) / 1000 / sims;
      (t[k] = t[k] || []).push(us);
    }
  }
  const mid = a => a.slice().sort((x, y) => x - y)[a.length >> 1];
  for (const k of Object.keys(sets)) {
    const line = `${k}: ${mid(t[k]).toFixed(0)} us per simulation, ${(100 * mid(t.base) / mid(t[k])).toFixed(1)}% of base speed | rounds ${t[k].map(x => x.toFixed(0)).join(' ')}`;
    console.log('SPEED RESULT ' + line);
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, line + '\n\n');
  }
})();
