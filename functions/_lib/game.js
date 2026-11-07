// The same game engine the browser runs, for checking ranked decks and replaying a match from its decision log.
import './shim.js';
import '../../js/data.js';
import '../../js/engine.js';
import '../../js/effects.js';
import '../../js/cards.js';
import '../../js/ai.js';

let NS = null;
function ready() {
  if (NS) return NS;
  NS = globalThis.NTCG;
  NS.Cards.build();
  NS.wait = () => Promise.resolve();
  NS.settings = { speedMul: () => 0 };
  NS.house = NS.HOUSE_DEFAULTS;
  return NS;
}
export const house = () => Object.assign({}, ready().HOUSE_DEFAULTS);

// a deck as the client sends it: { leader, cards: { id: count } }. Returns the clean deck, or the first problem.
export function checkDeck(d) {
  const N = ready(), by = N.Cards.byId;
  if (!d || typeof d !== 'object' || !by[d.leader] || by[d.leader].type !== 'leader' || !d.cards || typeof d.cards !== 'object') return { err: 'That deck could not be read.' };
  const cards = {};
  for (const [id, n] of Object.entries(d.cards)) {
    if (!by[id] || by[id].type === 'leader' || !Number.isInteger(n) || n < 0 || n > 60) return { err: 'That deck has a card this server does not know.' };
    if (n) cards[id] = n;
  }
  const deck = { name: String(d.name || 'Deck').slice(0, 28), leader: d.leader, cards };
  const errs = N.Cards.validate(deck, N.HOUSE_DEFAULTS);
  return errs.length ? { err: errs[0] } : { deck };
}

// Play a match again from its seed, decks and decision log. Every index must fit the options of its decision.
// Returns { done, winner, used, bad }: done = the log reaches the end of the game.
export async function replay(m, log) {
  const N = ready(), by = N.Cards.byId;
  if (!Array.isArray(log) || log.length > 5000) return { done: false, bad: true, used: 0 };
  const decks = [m.deck0, m.deck1].map(s => JSON.parse(s));
  let bad = false, g = null;
  const stop = () => { g.abort(); throw new Error('aborted'); }; // the log ran out before the game ended
  const ctl = { takeMain: stop, respond: stop, choose: stop };
  g = new N.Game({ names: [m.name0, m.name1], house: N.HOUSE_DEFAULTS, seed: m.seed, replay: log.slice(), controllers: [ctl, ctl], leaders: decks.map(d => by[d.leader]), decks: decks.map(N.Cards.expand) });
  g.noSnap = true;
  const decide = g.decide.bind(g);
  g.decide = (options, ask, toIdx, fromIdx) => {
    if (g.replay && g.rp < g.replay.length) {
      const k = g.replay[g.rp];
      if (!Number.isInteger(k) || k < -2 || k >= options.length) { bad = true; g.abort(); throw new Error('aborted'); }
    }
    return decide(options, ask, toIdx, fromIdx);
  };
  try { await g.start(); } catch (e) { bad = true; }
  return { done: !bad && g.over && g.winner != null, winner: g.winner, used: g.rp, bad };
}
