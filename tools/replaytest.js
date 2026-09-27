// Verifies that any game can be rebuilt exactly from a turn snapshot + decision log.
global.window = global;
['data.js', 'engine.js', 'effects.js', 'cards.js', 'ai.js'].forEach(f => require('../js/' + f));
const NS = window.NTCG; NS.wait = () => Promise.resolve(); NS.settings = { speedMul: () => 0 }; NS.Cards.build();
const boom = { takeMain() { throw new Error('controller called during replay'); }, respond() { throw new Error('controller called'); }, choose() { throw new Error('controller called'); } };
const sig = g => JSON.stringify([g.winner, g.turn, g.players.map(P => [P.leader.life, P.hand.map(c => c.card.id), P.chars.map(u => u.card.id + ':' + u.rested), P.trash.length, P.deck.map(c => c.card.id)])]);
(async () => {
  let ok = 0, bad = 0;
  for (let i = 0; i < 60; i++) {
    const d = NS.STARTERS;
    const snaps = [];
    const g = new NS.Game({ names: ['a', 'b'], controllers: [new NS.AI.AIController('kage', { fast: true }), new NS.AI.AIController('chunin', { fast: true })], leaders: d.map(x => NS.Cards.byId[x.leader]), decks: d.map(NS.Cards.expand) });
    const orig = g.loop.bind(g);
    g.snapshot = (f => function () { const s = f.call(this); snaps.push({ s: JSON.parse(JSON.stringify(s)), at: this.log.length }); return s; })(g.snapshot);
    await g.start();
    const final = sig(g);
    for (const k of [0, (snaps.length / 2) | 0, snaps.length - 1]) {
      const { s, at } = snaps[k];
      const h = new NS.Game({ names: ['a', 'b'], controllers: [boom, boom], leaders: d.map(x => NS.Cards.byId[x.leader]), decks: [[], []] });
      await h.resume(s, g.log.slice(at));
      if (sig(h) === final) ok++; else { bad++; if (bad < 3) console.log('MISMATCH game', i, 'snap', k, '\n', final, '\n', sig(h)); }
    }
  }
  console.log('replay ok', ok, 'bad', bad);
})();
