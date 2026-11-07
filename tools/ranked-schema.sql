-- Ranked play (Cloudflare D1). Apply with:
--   npx wrangler d1 execute narutcgsim-ranked --remote --file tools/ranked-schema.sql
-- Players are device profiles: a name plus a secret key the browser keeps (only its SHA-256 is stored here).

CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL UNIQUE,          -- lower-case name, so names are unique regardless of case
  token_hash TEXT NOT NULL UNIQUE,
  rating REAL NOT NULL DEFAULT 1500,      -- Glicko-2
  rd REAL NOT NULL DEFAULT 350,
  vol REAL NOT NULL DEFAULT 0.06,
  games INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  created INTEGER NOT NULL,
  last_game INTEGER
);
CREATE INDEX IF NOT EXISTS players_board ON players (games, rating);

-- one row per player looking for a match; `match` is set once paired
CREATE TABLE IF NOT EXISTS queue (
  player TEXT PRIMARY KEY,
  deck TEXT NOT NULL,
  build TEXT NOT NULL,
  rating REAL NOT NULL,
  joined INTEGER NOT NULL,
  seen INTEGER NOT NULL,
  match TEXT
);

CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  p0 TEXT NOT NULL, p1 TEXT NOT NULL,
  name0 TEXT NOT NULL, name1 TEXT NOT NULL,
  deck0 TEXT NOT NULL, deck1 TEXT NOT NULL,
  seed INTEGER NOT NULL,
  build TEXT NOT NULL,
  rated INTEGER NOT NULL,
  created INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'live',    -- live | done | void
  rep0 TEXT, rep1 TEXT,                   -- each side's report: { winner, why, log }
  first_report INTEGER,
  winner INTEGER, why TEXT, how TEXT,
  r0 REAL, r1 REAL, d0 REAL, d1 REAL,     -- ratings before, and the change
  finished INTEGER
);
CREATE INDEX IF NOT EXISTS matches_live ON matches (status, created);
CREATE INDEX IF NOT EXISTS matches_pair ON matches (p0, p1, created);

-- new profiles per network address per day (hashed), to slow down mass-made accounts
CREATE TABLE IF NOT EXISTS regs (ip TEXT NOT NULL, at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS regs_ip ON regs (ip, at);
