// GET -- the top 100 players who have finished their placement games, and where you stand if you send your key.
import { json, player, tidy, profile, PLACEMENT } from '../../_lib/core.js';

export async function onRequestGet({ request, env }) {
  if (Math.random() < 0.3) await tidy(env);
  const [top, count] = await env.DB.batch([
    env.DB.prepare('SELECT * FROM players WHERE games >= ? ORDER BY rating DESC, games DESC LIMIT 100').bind(PLACEMENT),
    env.DB.prepare('SELECT COUNT(*) AS n FROM players WHERE games >= ?').bind(PLACEMENT),
  ]);
  const out = { players: top.results.map(profile), total: count.results[0].n };
  const p = await player(env, request);
  if (p) {
    out.me = profile(p);
    if (p.games >= PLACEMENT) out.position = (await env.DB.prepare('SELECT COUNT(*) AS n FROM players WHERE games >= ? AND rating > ?').bind(PLACEMENT, p.rating).first()).n + 1;
  }
  return json(out, 200);
}
