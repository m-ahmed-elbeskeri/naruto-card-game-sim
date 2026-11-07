// Ranked play: shared helpers for the /api/ranked/* Functions (Cloudflare Pages Functions + D1, free plan).
import { replay } from './game.js';

export const now = () => Date.now();
export const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
export const fail = (msg, status = 400) => json({ error: msg }, status);

const b64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const randomId = (n = 12) => b64url(crypto.getRandomValues(new Uint8Array(n)));
export async function sha256(s) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// The browser keeps a secret key and sends it as "Authorization: Bearer <key>" (or in the body, for a page that is
// closing). Only its hash is stored.
export async function player(env, request, body) {
  const h = request.headers.get('authorization') || '';
  const token = h.startsWith('Bearer ') ? h.slice(7).trim() : body && typeof body.token === 'string' ? body.token : '';
  if (!token || token.length > 100) return null;
  return env.DB.prepare('SELECT * FROM players WHERE token_hash = ?').bind(await sha256(token)).first();
}
export async function readJSON(request) {
  try { const t = await request.text(); return t.length > 200000 ? null : JSON.parse(t || '{}'); } catch (e) { return null; }
}

// ---- ratings: Glicko-2, one game per rating period ----
const SCALE = 173.7178, TAU = 0.5;
export function glicko(p, o, score) {
  const mu = (p.rating - 1500) / SCALE, mj = (o.rating - 1500) / SCALE;
  // uncertainty grows with time away (one period per 30 days, capped at a new player's)
  const idle = p.last_game ? Math.max(0, (now() - p.last_game) / (30 * 864e5)) : 0;
  const phi = Math.min(350 / SCALE, Math.sqrt((p.rd / SCALE) ** 2 + idle * p.vol ** 2)), pj = o.rd / SCALE;
  const g = x => 1 / Math.sqrt(1 + 3 * x * x / (Math.PI * Math.PI));
  const E = 1 / (1 + Math.exp(-g(pj) * (mu - mj)));
  const v = 1 / (g(pj) ** 2 * E * (1 - E)), delta = v * g(pj) * (score - E);
  const a = Math.log(p.vol ** 2), f = x => { const ex = Math.exp(x); return ex * (delta * delta - phi * phi - v - ex) / (2 * (phi * phi + v + ex) ** 2) - (x - a) / (TAU * TAU); };
  let A = a, B;
  if (delta * delta > phi * phi + v) B = Math.log(delta * delta - phi * phi - v);
  else { let k = 1; while (f(a - k * TAU) < 0 && k < 100) k++; B = a - k * TAU; }
  let fA = f(A), fB = f(B);
  for (let i = 0; i < 100 && Math.abs(B - A) > 1e-6; i++) { const C = A + (A - B) * fA / (fB - fA), fC = f(C); if (fC * fB <= 0) { A = B; fA = fB; } else fA /= 2; B = C; fB = fC; }
  const vol = Math.exp(A / 2), ps = Math.sqrt(phi * phi + vol * vol), pn = 1 / Math.sqrt(1 / (ps * ps) + 1 / v);
  return { rating: SCALE * (mu + pn * pn * g(pj) * (score - E)) + 1500, rd: Math.max(30, SCALE * pn), vol };
}
export const PLACEMENT = 5; // games before a player shows a rank and appears on the leaderboard
const TIERS = [[1900, 'Hokage'], [1750, 'Kage'], [1600, 'Jonin'], [1450, 'Chunin'], [1300, 'Genin'], [-1e9, 'Academy']];
export const tier = p => p.games < PLACEMENT ? 'Placement' : TIERS.find(t => p.rating >= t[0])[1];
export const profile = p => ({ id: p.id, name: p.name, rating: Math.round(p.rating), rd: Math.round(p.rd), games: p.games, wins: p.wins, losses: p.games - p.wins, tier: tier(p), placement: Math.max(0, PLACEMENT - p.games) });

// ---- deciding a match ----
// Reports: { winner (seat or null), why, log }. One side's log alone proves nothing (a player could make up the other
// side's moves), so a result needs both sides, or one side and silence from the other. In order:
//  1. both sides name the same winner: that's the result;
//  2. both sent the same log but named different winners (a client fault): the server replays it to the end;
//  3. a player who quit (Quit button, menu, closing the tab) gives the match to the other;
//  4. one side reported and the other said nothing for 45 minutes (longer than any game can still run): the one who
//     stayed wins, unless they say they lost;
//  5. anything else (both lost the connection, the games fell out of sync, reports that disagree): no result.
export const ANSWER_MS = 45 * 60e3, ABANDON_MS = 3 * 3600e3;
const sameLog = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((k, i) => k === b[i]);
export async function decide(m) {
  const reps = [m.rep0, m.rep1].map(r => (r ? JSON.parse(r) : null));
  const named = reps.map(r => (r && (r.winner === 0 || r.winner === 1) ? r.winner : null));
  const both = !!(reps[0] && reps[1]);
  if (both && named[0] != null && named[0] === named[1]) return { winner: named[0], why: reps[0].why, how: 'agreed' };
  if (both && reps[0].log && reps[0].log.length && sameLog(reps[0].log, reps[1].log)) { const x = await replay(m, reps[0].log); if (x.done) return { winner: x.winner, why: 'end', how: 'replay' }; }
  if (reps.some(r => r && r.why === 'nostart')) return { void: true, how: 'no start' }; // the two pages never connected
  const quit = reps.findIndex(r => r && r.why === 'quit');
  if (quit >= 0 && !(reps[1 - quit] && reps[1 - quit].why === 'quit')) return { winner: 1 - quit, why: 'quit', how: 'quit' };
  const only = reps.findIndex(Boolean);
  if (only >= 0 && !both && now() - (m.first_report || 0) >= ANSWER_MS) return named[only] === 1 - only ? { winner: 1 - only, why: reps[only].why, how: 'unanswered' } : { winner: only, why: 'away', how: 'unanswered' };
  if (both) return { void: true, how: 'disputed' };
  return null; // still waiting for the other side
}
export async function finalize(env, m, force) {
  let r = await decide(m);
  if (!r && force) r = { void: true, how: 'abandoned' };
  if (!r) return null;
  const t = now();
  if (r.void) {
    const q = await env.DB.prepare("UPDATE matches SET status = 'void', how = ?, finished = ? WHERE id = ? AND status = 'live'").bind(r.how, t, m.id).run();
    return q.meta.changes ? { status: 'void' } : null;
  }
  const ps = await env.DB.batch([env.DB.prepare('SELECT * FROM players WHERE id = ?').bind(m.p0), env.DB.prepare('SELECT * FROM players WHERE id = ?').bind(m.p1)]);
  const [a, b] = ps.map(x => x.results[0]);
  if (!a || !b) return null;
  const sa = r.winner === 0 ? 1 : 0, na = m.rated ? glicko(a, b, sa) : null, nb = m.rated ? glicko(b, a, 1 - sa) : null;
  // claim the match first, so two requests finishing it at once cannot both move the ratings
  const claim = await env.DB.prepare("UPDATE matches SET status = 'done', winner = ?, why = ?, how = ?, r0 = ?, r1 = ?, d0 = ?, d1 = ?, finished = ? WHERE id = ? AND status = 'live'")
    .bind(r.winner, r.why || '', r.how, a.rating, b.rating, na ? na.rating - a.rating : 0, nb ? nb.rating - b.rating : 0, t, m.id).run();
  if (!claim.meta.changes) return null;
  const upd = (p, n, won) => n
    ? env.DB.prepare('UPDATE players SET rating = ?, rd = ?, vol = ?, games = games + 1, wins = wins + ?, last_game = ? WHERE id = ?').bind(n.rating, n.rd, n.vol, won, t, p.id)
    : env.DB.prepare('UPDATE players SET last_game = ? WHERE id = ?').bind(t, p.id);
  await env.DB.batch([upd(a, na, sa), upd(b, nb, 1 - sa)]);
  return { status: 'done' };
}
// Housekeeping, run now and then by ordinary requests (Pages Functions have no timers): drop players who stopped
// polling the queue, and settle matches whose second report never came.
export async function tidy(env) {
  const t = now();
  await env.DB.prepare('DELETE FROM queue WHERE seen < ?').bind(t - 90e3).run();
  const { results } = await env.DB.prepare("SELECT * FROM matches WHERE status = 'live' AND ((first_report IS NOT NULL AND first_report < ?) OR created < ?) LIMIT 2").bind(t - ANSWER_MS, t - ABANDON_MS).all();
  for (const m of results) await finalize(env, m, m.created < t - ABANDON_MS);
}
