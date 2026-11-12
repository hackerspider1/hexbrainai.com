CREATE TABLE IF NOT EXISTS reports (
  id            INTEGER PRIMARY KEY,
  title         TEXT NOT NULL,
  program       TEXT,
  program_name  TEXT,
  severity      TEXT,
  weakness      TEXT,
  cve_ids       TEXT,
  bounty        REAL,
  votes         INTEGER DEFAULT 0,
  reporter      TEXT,
  substate      TEXT,
  asset_type    TEXT,
  asset         TEXT,
  disclosed_at  TEXT,
  submitted_at  TEXT,
  summary       TEXT,
  body          TEXT,
  detail_at     TEXT,
  detail_status INTEGER
);
CREATE INDEX IF NOT EXISTS reports_weakness ON reports(weakness);
CREATE INDEX IF NOT EXISTS reports_disclosed ON reports(disclosed_at);
CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);

CREATE TABLE IF NOT EXISTS programs (name TEXT PRIMARY KEY, handle TEXT, logo_url TEXT, logo_file TEXT);

CREATE INDEX IF NOT EXISTS reports_votes ON reports(votes DESC);
CREATE INDEX IF NOT EXISTS reports_program ON reports(COALESCE(program_name, program));

-- Full-text index over the report text, kept in step with the reports table by triggers.
CREATE VIRTUAL TABLE IF NOT EXISTS reports_fts USING fts5(
  title, program_name, weakness, summary, body,
  content='reports', content_rowid='id', tokenize='porter unicode61'
);
CREATE TRIGGER IF NOT EXISTS reports_fts_ai AFTER INSERT ON reports BEGIN
  INSERT INTO reports_fts(rowid, title, program_name, weakness, summary, body)
  VALUES (new.id, new.title, new.program_name, new.weakness, new.summary, new.body);
END;
CREATE TRIGGER IF NOT EXISTS reports_fts_ad AFTER DELETE ON reports BEGIN
  INSERT INTO reports_fts(reports_fts, rowid, title, program_name, weakness, summary, body)
  VALUES ('delete', old.id, old.title, old.program_name, old.weakness, old.summary, old.body);
END;
CREATE TRIGGER IF NOT EXISTS reports_fts_au AFTER UPDATE OF title, program_name, weakness, summary, body ON reports BEGIN
  INSERT INTO reports_fts(reports_fts, rowid, title, program_name, weakness, summary, body)
  VALUES ('delete', old.id, old.title, old.program_name, old.weakness, old.summary, old.body);
  INSERT INTO reports_fts(rowid, title, program_name, weakness, summary, body)
  VALUES (new.id, new.title, new.program_name, new.weakness, new.summary, new.body);
END;

-- Accounts: people sign in with Google and create keys for the API.
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT, sub TEXT UNIQUE NOT NULL, email TEXT, name TEXT, picture TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS api_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, name TEXT NOT NULL, prefix TEXT NOT NULL, hash TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL, last_used_at TEXT, requests INTEGER NOT NULL DEFAULT 0, revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS api_keys_user ON api_keys(user_id);
