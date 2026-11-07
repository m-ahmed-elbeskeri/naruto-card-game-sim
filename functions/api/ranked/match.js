// GET ?id=<match> -- how one of your ranked matches stands: live (waiting for reports), done (with your rating
// change) or void (no result).
import { json, fail, player, now, finalize, ANSWER_MS, profile } from '../../_lib/core.js';

export async function status(env, id, p) {
  let m = await env.DB.prepare('SELECT * FROM matches WHERE id = ?').bind(id).first();
  if (!m) return { status: 'missing' };
  if (m.status === 'live' && m.first_report && now() - m.first_report >= ANSWER_MS) { await finalize(env, m); m = await env.DB.prepare('SELECT * FROM matches WHERE id = ?').bind(id).first(); }
  const seat = m.p0 === p.id ? 0 : 1, me = await env.DB.prepare('SELECT * FROM players WHERE id = ?').bind(p.id).first();
  const out = { status: m.status, seat, rated: !!m.rated, profile: profile(me) };
  if (m.status === 'done') Object.assign(out, { winner: m.winner, won: m.winner === seat, how: m.how, delta: Math.round(seat ? m.d1 : m.d0), before: Math.round(seat ? m.r1 : m.r0) });
  if (m.status === 'void') out.how = m.how;
  if (m.status === 'live') out.waiting = !!(seat ? m.rep1 : m.rep0); // you have reported; the other side has not yet
  return out;
}

export async function onRequestGet({ request, env }) {
  const p = await player(env, request);
  if (!p) return fail('No ranked profile with that key.', 401);
  const id = new URL(request.url).searchParams.get('id') || '';
  const m = await env.DB.prepare('SELECT p0, p1 FROM matches WHERE id = ?').bind(id).first();
  if (!m || (m.p0 !== p.id && m.p1 !== p.id)) return fail('No such ranked match.', 404);
  return json(await status(env, id, p));
}
