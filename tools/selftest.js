// Headless AI-vs-AI stress test: node tools/selftest.js [games] [log]
global.window = global;
['data.js', 'engine.js', 'effects.js', 'cards.js', 'ai.js'].forEach(f => require('../js/' + f));
const NS = window.NTCG;
NS.wait = () => Promise.resolve();
NS.settings = { speedMul: () => 0 };
NS.Cards.build(); NS.house = NS.HOUSE_DEFAULTS;
const N = +process.argv[2] || 200, LOG = process.argv[3] === 'log';
const errs = {}; const oe = console.error;
console.error = (...a) => { const k = a.map(x => x && x.stack ? x.stack.split('\n').slice(0, 3).join(' | ') : String(x)).join(' '); errs[k] = (errs[k] || 0) + 1; };
(async () => {
  const wins = { red: 0, blue: 0 }; let turns = 0, fl = 0; const used = {};
  for (let i = 0; i < N; i++) {
    const d = NS.STARTERS.map(s => s);
    if (Math.random() < 0.5) d.reverse();
    const ui = { onEvent: async (t, x) => { if (t === 'supportFlip') used[x.sup.card.id] = (used[x.sup.card.id] || 0) + 1; if (t === 'summon') used[x.unit.card.id] = (used[x.unit.card.id] || 0) + 1; }, onLog: m => { if (LOG) console.log(m); } };
    const g = new NS.Game({ names: [d[0].name, d[1].name], controllers: [new NS.AI.AIController('kage'), new NS.AI.AIController('kage')], ui,
      leaders: d.map(x => NS.Cards.byId[x.leader]), decks: d.map(NS.Cards.expand) });
    try { await Promise.race([g.start(), new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 15000))]); }
    catch (e) { errs['CRASH ' + String(e.stack).split('\n').slice(0, 3).join(' | ')] = 1; g.abort(); continue; }
    if (g.winner == null) { fl++; continue; }
    wins[d[g.winner].color]++; turns += g.turn;
  }
  console.log(`games=${N} red=${wins.red} blue=${wins.blue} unfinished=${fl} avgTurns=${(turns / N).toFixed(1)}`);
  console.log('card usage:', JSON.stringify(used));
  console.log('errors:', Object.keys(errs).length); Object.entries(errs).slice(0, 15).forEach(([k, n]) => console.log(n + 'x', k.slice(0, 350)));
})();
