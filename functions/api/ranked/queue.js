// The ranked queue. The browser polls it every couple of seconds while it waits.
// POST   { deck, build } join (or rejoin) with a deck; build = the game version, players are only paired on the same one
// GET    -> { state: 'idle' | 'waiting' | 'matched', ... }
// DELETE leave
import { json, fail, player, readJSON, randomId, now, profile, tidy, finalize } from '../../_lib/core.js';
import { checkDeck, house } from '../../_lib/game.js';

const STALE = 15e3;                                        // a waiting player who stopped polling this long ago is skipped
const reach = waitMs => 150 + 15 * (waitMs / 1000);       // allowed rating gap: 150, widening by 15 a second
const PAIR_LIMIT = 3;                                      // rated games between the same two players per day

async function info(env, m, me) {
  const ps = await env.DB.batch([env.DB.prepare('SELECT * FROM players WHERE id = ?').bind(m.p0), env.DB.prepare('SELECT * FROM players WHERE id = ?').bind(m.p1)]);
  const pr = ps.map(x => profile(x.results[0]));
  return { id: m.id, seat: m.p0 === me ? 0 : 1, rated: !!m.rated, players: pr.map(p => ({ name: p.name, rating: p.rating, tier: p.tier })),
    start: { seed: m.seed, names: [m.name0, m.name1], decks: [JSON.parse(m.deck0), JSON.parse(m.deck1)], house: house() } };
}
async function pair(env, me) {
  const t = now();
  const { results } = await env.DB.prepare('SELECT * FROM queue WHERE player != ? AND match IS NULL AND seen > ? AND build = ? ORDER BY joined LIMIT 20').bind(me.player, t - STALE, me.build).all();
  for (const c of results) {
    if (Math.abs(c.rating - me.rating) > reach(Math.max(t - me.joined, t - c.joined))) continue;
    const swap = Math.random() < 0.5, a = swap ? c : me, b = swap ? me : c;
    const ps = await env.DB.batch([env.DB.prepare('SELECT name FROM players WHERE id = ?').bind(a.player), env.DB.prepare('SELECT name FROM players WHERE id = ?').bind(b.player),
      env.DB.prepare("SELECT COUNT(*) AS n FROM matches WHERE rated = 1 AND status != 'void' AND created > ? AND ((p0 = ? AND p1 = ?) OR (p0 = ? AND p1 = ?))").bind(t - 864e5, a.player, b.player, b.player, a.player)]);
    const [na, nb] = ps.slice(0, 2).map(x => x.results[0] && x.results[0].name);
    if (!na || !nb) continue;
    const id = randomId(9), seed = crypto.getRandomValues(new Uint32Array(1))[0], rated = ps[2].results[0].n < PAIR_LIMIT ? 1 : 0;
    const res = await env.DB.batch([
      env.DB.prepare('INSERT INTO matches (id, p0, p1, name0, name1, deck0, deck1, seed, build, rated, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(id, a.player, b.player, na, nb, a.deck, b.deck, seed, me.build, rated, t),
      env.DB.prepare('UPDATE queue SET match = ? WHERE player = ? AND match IS NULL').bind(id, a.player),
      env.DB.prepare('UPDATE queue SET match = ? WHERE player = ? AND match IS NULL').bind(id, b.player),
    ]);
    if (res[1].meta.changes === 1 && res[2].meta.changes === 1) return env.DB.prepare('SELECT * FROM matches WHERE id = ?').bind(id).first();
    // the other player was paired by someone else a moment earlier: undo and keep looking
    await env.DB.batch([env.DB.prepare('DELETE FROM matches WHERE id = ?').bind(id), env.DB.prepare('UPDATE queue SET match = NULL WHERE match = ?').bind(id)]);
  }
  return null;
}
async function matched(env, m, me) {
  await env.DB.prepare('DELETE FROM queue WHERE player = ?').bind(me).run();
  return json({ state: 'matched', match: await info(env, m, me) });
}
const waiting = (q, t) => json({ state: 'waiting', waited: Math.round((t - q.joined) / 1000), reach: Math.round(reach(t - q.joined)) });

export async function onRequestPost({ request, env }) {
  const b = await readJSON(request), p = await player(env, request, b);
  if (!p) return fail('No ranked profile with that key.', 401);
  const d = checkDeck(b && b.deck);
  if (d.err) return fail('This deck is not legal for ranked play: ' + d.err);
  const build = String((b && b.build) || 'dev').slice(0, 20), t = now();
  // joining again gives up any match of yours still being played (the page that was playing it is gone)
  const { results: live } = await env.DB.prepare("SELECT * FROM matches WHERE status = 'live' AND (p0 = ? OR p1 = ?)").bind(p.id, p.id).all();
  for (const m of live) {
    const k = m.p0 === p.id ? 'rep0' : 'rep1';
    if (m[k]) continue;
    const early = t - m.created < 120e3; // just paired: the two pages most likely never connected
    await env.DB.prepare(`UPDATE matches SET ${k} = ?, first_report = COALESCE(first_report, ?) WHERE id = ?`).bind(JSON.stringify(early ? { winner: null, why: 'nostart', log: [] } : { winner: m.p0 === p.id ? 1 : 0, why: 'quit', log: [] }), t, m.id).run();
    await finalize(env, await env.DB.prepare('SELECT * FROM matches WHERE id = ?').bind(m.id).first());
  }
  await env.DB.prepare('INSERT INTO queue (player, deck, build, rating, joined, seen, match) VALUES (?, ?, ?, ?, ?, ?, NULL) ON CONFLICT(player) DO UPDATE SET deck = excluded.deck, build = excluded.build, rating = excluded.rating, joined = excluded.joined, seen = excluded.seen, match = NULL')
    .bind(p.id, JSON.stringify(d.deck), build, p.rating, t, t).run();
  const q = { player: p.id, deck: JSON.stringify(d.deck), build, rating: p.rating, joined: t };
  const m = await pair(env, q);
  return m ? matched(env, m, p.id) : waiting(q, t);
}

export async function onRequestGet({ request, env }) {
  const p = await player(env, request);
  if (!p) return fail('No ranked profile with that key.', 401);
  const t = now(), q = await env.DB.prepare('SELECT * FROM queue WHERE player = ?').bind(p.id).first();
  if (!q) return json({ state: 'idle' });
  if (q.match) {
    const m = await env.DB.prepare('SELECT * FROM matches WHERE id = ?').bind(q.match).first();
    if (m) return matched(env, m, p.id);
  }
  await env.DB.prepare('UPDATE queue SET seen = ?, match = NULL WHERE player = ?').bind(t, p.id).run();
  if (Math.random() < 0.1) await tidy(env);
  const m = await pair(env, q);
  return m ? matched(env, m, p.id) : waiting(q, t);
}

export async function onRequestDelete({ request, env }) {
  const p = await player(env, request);
  if (!p) return fail('No ranked profile with that key.', 401);
  await env.DB.prepare('DELETE FROM queue WHERE player = ? AND match IS NULL').bind(p.id).run();
  return json({ state: 'idle' });
}
