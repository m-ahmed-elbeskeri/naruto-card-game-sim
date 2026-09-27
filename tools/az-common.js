// Shared loader for the AZ tools (Node): loads the game scripts into a fake window.
global.window = global;
['data.js', 'engine.js', 'effects.js', 'cards.js', 'ai.js', 'az.js'].forEach(f => require('../js/' + f));
const NS = window.NTCG;
NS.wait = () => Promise.resolve();
NS.settings = { speedMul: () => 0 };
NS.Cards.build();
NS.house = NS.HOUSE_DEFAULTS;
function newGame(controllers, swap, seed) {
  const d = swap ? NS.STARTERS.slice().reverse() : NS.STARTERS;
  return { g: new NS.Game({ names: d.map(x => x.name), controllers, leaders: d.map(x => NS.Cards.byId[x.leader]), decks: d.map(NS.Cards.expand), seed }), decks: d };
}
module.exports = { NS, newGame };
