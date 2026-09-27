/* Search worker for the Hokage (AlphaZero-style) bot.
   Loads the rules engine + trained network, then runs determinized MCTS on request. */
self.window = self;
const V = (self.location.search.match(/v=(\d+)/) || [])[1] || '';
importScripts(...['data.js', 'engine.js', 'effects.js', 'cards.js', 'ai.js', 'az.js', 'az-weights.js'].map(f => f + (V ? '?v=' + V : '')));
const NS = self.NTCG;
NS.wait = () => Promise.resolve();
NS.settings = { speedMul: () => 0 };
NS.Cards.build();
const net = NS.AZ_WEIGHTS ? NS.AZ.Net.fromJSON(NS.AZ_WEIGHTS) : null;
self.onmessage = async e => {
  const { id, spec, pi, cfg } = e.data;
  try {
    const r = net ? await NS.AZ.search(spec, pi, net, cfg) : null;
    self.postMessage({ id, r });
  } catch (err) { self.postMessage({ id, r: null, error: String(err && err.stack || err) }); }
};
self.postMessage({ ready: true, ok: !!net });
