// GET    /api/ranked/profile   your ranked profile and leaderboard position (Authorization: Bearer <key>)
// POST   /api/ranked/profile   { name } -> a new profile and its secret key (shown once; the browser keeps it)
// PATCH  /api/ranked/profile   { name } -> rename
import { json, fail, player, readJSON, randomId, sha256, now, profile, tidy, PLACEMENT } from '../../_lib/core.js';

const NAME = /^[A-Za-z0-9][A-Za-z0-9 _.-]{1,14}[A-Za-z0-9_.-]$/;
const cleanName = n => String(n || '').replace(/\s+/g, ' ').trim();
async function nameFree(env, name, except) {
  const row = await env.DB.prepare('SELECT id FROM players WHERE name_key = ?').bind(name.toLowerCase()).first();
  return !row || row.id === except;
}
async function position(env, p) {
  if (p.games < PLACEMENT) return null;
  const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM players WHERE games >= ? AND rating > ?').bind(PLACEMENT, p.rating).first();
  return r.n + 1;
}

export async function onRequestGet({ request, env }) {
  const p = await player(env, request);
  if (!p) return fail('No ranked profile with that key.', 401);
  if (Math.random() < 0.3) await tidy(env);
  return json({ profile: profile(p), position: await position(env, p) });
}

export async function onRequestPost({ request, env }) {
  const b = await readJSON(request), name = cleanName(b && b.name);
  if (!NAME.test(name)) return fail('Names are 3 to 16 letters, numbers, spaces, dots, dashes or underscores.');
  if (!(await nameFree(env, name))) return fail('That name is taken.');
  const ip = await sha256('ip:' + (request.headers.get('cf-connecting-ip') || 'local')), t = now();
  const made = await env.DB.prepare('SELECT COUNT(*) AS n FROM regs WHERE ip = ? AND at > ?').bind(ip, t - 864e5).first();
  if (made.n >= 5) return fail('Too many new profiles from this network today. Try again tomorrow.', 429);
  const token = randomId(32), id = randomId(9);
  try {
    await env.DB.batch([
      env.DB.prepare('INSERT INTO players (id, name, name_key, token_hash, created) VALUES (?, ?, ?, ?, ?)').bind(id, name, name.toLowerCase(), await sha256(token), t),
      env.DB.prepare('INSERT INTO regs (ip, at) VALUES (?, ?)').bind(ip, t),
      env.DB.prepare('DELETE FROM regs WHERE at < ?').bind(t - 864e5),
    ]);
  } catch (e) { return fail('That name is taken.'); } // someone took it a moment ago (the name is unique in the table)
  const p = await env.DB.prepare('SELECT * FROM players WHERE id = ?').bind(id).first();
  return json({ token, profile: profile(p), position: null });
}

export async function onRequestPatch({ request, env }) {
  const p = await player(env, request);
  if (!p) return fail('No ranked profile with that key.', 401);
  const b = await readJSON(request), name = cleanName(b && b.name);
  if (!NAME.test(name)) return fail('Names are 3 to 16 letters, numbers, spaces, dots, dashes or underscores.');
  if (!(await nameFree(env, name, p.id))) return fail('That name is taken.');
  try { await env.DB.prepare('UPDATE players SET name = ?, name_key = ? WHERE id = ?').bind(name, name.toLowerCase(), p.id).run(); } catch (e) { return fail('That name is taken.'); }
  return json({ profile: profile(Object.assign({}, p, { name })), position: await position(env, p) });
}
