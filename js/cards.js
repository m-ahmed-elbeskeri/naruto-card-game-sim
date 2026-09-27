/* ============================================================
   CARDS — card index, deck helpers
   ============================================================ */
(function () {
  const NS = window.NTCG = window.NTCG || {};
  const byId = {};
  const all = [];
  function build() {
    NS.CARD_DATA.forEach(c => {
      c.lines = [];
      (c.text || []).forEach(t => c.lines.push(t));
      if (c.support) c.lines.push(`[Support] ${c.support.name} — ${NS.TIMING[c.support.timing]} ${c.support.text}`);
      byId[c.id] = c; all.push(c);
    });
  }
  const leaders = () => all.filter(c => c.type === 'leader');
  const poolFor = color => all.filter(c => (c.type === 'character' || c.type === 'ex') && c.color === color);

  function expand(def) {
    const out = [];
    Object.entries(def.cards).forEach(([id, n]) => { for (let i = 0; i < n; i++) if (byId[id]) out.push(byId[id]); });
    return out;
  }
  function validate(def, house) {
    house = house || NS.house || NS.HOUSE_DEFAULTS;
    const errs = [];
    const L = byId[def.leader];
    if (!L) errs.push('Choose a Leader.');
    const total = Object.values(def.cards || {}).reduce((a, b) => a + b, 0);
    if (total !== house.deckSize) errs.push(`Deck must have exactly ${house.deckSize} cards (${total}).`);
    Object.entries(def.cards || {}).forEach(([id, n]) => {
      const c = byId[id];
      if (!c) return;
      if (n > house.copyLimit) errs.push(`Max ${house.copyLimit} copies of ${c.name} (${id}).`);
      if (L && c.color !== L.color) errs.push(`${c.name} doesn't match your Leader's color.`);
    });
    return errs;
  }
  // pad/trim a starter to the current house deck size (for 50-card official mode)
  function fitDeck(def, house) {
    house = house || NS.house;
    const d = JSON.parse(JSON.stringify(def));
    let total = Object.values(d.cards).reduce((a, b) => a + b, 0);
    const ids = Object.keys(d.cards);
    let guard = 0;
    while (total < house.deckSize && guard++ < 500) {
      const pool = poolFor(byId[d.leader].color).map(c => c.id).filter(id => (d.cards[id] || 0) < house.copyLimit);
      if (!pool.length) break;
      const id = pool[Math.floor(Math.random() * pool.length)];
      d.cards[id] = (d.cards[id] || 0) + 1; total++;
    }
    while (total > house.deckSize && guard++ < 1000) {
      const id = ids[Math.floor(Math.random() * ids.length)];
      if (d.cards[id] > 1) { d.cards[id]--; total--; }
    }
    return d;
  }
  NS.Cards = { build, byId, all, leaders, poolFor, expand, validate, fitDeck };
})();
