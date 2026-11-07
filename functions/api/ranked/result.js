// POST { match, winner, why, log } -- one side's account of how a ranked match ended (see decide() in _lib/core.js).
// winner: seat 0 / 1, or null when this side cannot tell (connection lost). why: end | time | away | quit | opp-quit |
// lost | desync | nostart. A page that is closing sends this with navigator.sendBeacon and its key in the body.
import { json, fail, player, readJSON, now, finalize } from '../../_lib/core.js';
import { status } from './match.js';

const WHY = new Set(['end', 'time', 'away', 'quit', 'opp-quit', 'lost', 'desync', 'nostart']);

export async function onRequestPost({ request, env }) {
  const b = await readJSON(request), p = await player(env, request, b);
  if (!p) return fail('No ranked profile with that key.', 401);
  const m = await env.DB.prepare('SELECT * FROM matches WHERE id = ?').bind(String((b && b.match) || '')).first();
  if (!m || (m.p0 !== p.id && m.p1 !== p.id)) return fail('No such ranked match.', 404);
  const seat = m.p0 === p.id ? 0 : 1, k = seat ? 'rep1' : 'rep0', t = now();
  if (m.status === 'live' && !m[k]) {
    let why = WHY.has(b.why) ? b.why : 'lost';
    if (why === 'nostart' && t - m.created > 120e3) why = 'lost'; // only right after pairing
    const winner = b.winner === 0 || b.winner === 1 ? b.winner : null;
    const log = Array.isArray(b.log) ? b.log.slice(0, 5000).map(x => (Number.isInteger(x) ? x : -9)) : [];
    const rep = JSON.stringify({ winner: why === 'quit' ? 1 - seat : winner, why, log });
    await env.DB.prepare(`UPDATE matches SET ${k} = ?, first_report = COALESCE(first_report, ?) WHERE id = ? AND ${k} IS NULL`).bind(rep, t, m.id).run();
    const m2 = await env.DB.prepare('SELECT * FROM matches WHERE id = ?').bind(m.id).first();
    await finalize(env, m2);
  }
  return json(await status(env, m.id, p));
}
