// Shared loader for the AZ tools (Node): loads the game scripts into a fake window.
global.window = global;
['data.js', 'engine.js', 'effects.js', 'cards.js', 'ai.js', 'az.js'].forEach(f => require('../js/' + f));
const NS = window.NTCG;
NS.wait = () => Promise.resolve();
NS.settings = { speedMul: () => 0 };
NS.Cards.build();
NS.house = NS.HOUSE_DEFAULTS;
// matchup: 'rb' (default) = the two starter decks against each other, `swap` decides who gets which;
// 'rr' / 'bb' = both players on the red / the blue deck
function newGame(controllers, swap, seed, matchup) {
  const S = NS.STARTERS, d = matchup === 'rr' ? [S[0], S[0]] : matchup === 'bb' ? [S[1], S[1]] : swap ? S.slice().reverse() : S;
  return { g: new NS.Game({ names: d.map(x => x.name), controllers, leaders: d.map(x => NS.Cards.byId[x.leader]), decks: d.map(NS.Cards.expand), seed }), decks: d };
}
module.exports = { NS, newGame };
