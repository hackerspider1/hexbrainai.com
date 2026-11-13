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
-- Subdomains known for a program, from ProjectDiscovery's Chaos public dataset (`node scripts/ingest.mjs subdomains`).
-- The names themselves are kept as one compressed text file per program in data/subdomains; this table holds the counts.
CREATE TABLE IF NOT EXISTS program_assets (
  handle TEXT PRIMARY KEY, total INTEGER NOT NULL, roots TEXT NOT NULL,
  branches TEXT NOT NULL, -- how the names divide for drawing: [name, domain, count], by root domain or by the label under a dominant root
  source TEXT NOT NULL, source_updated TEXT, updated_at TEXT NOT NULL
);

-- A headline and the basic facts for every CVE, from cve.now (`node scripts/ingest.mjs cvenow`). Its headlines are CC BY 4.0.
CREATE TABLE IF NOT EXISTS cve_info (
  id TEXT PRIMARY KEY, title TEXT, cvss REAL, product TEXT, fixed TEXT, kev INTEGER NOT NULL DEFAULT 0, published TEXT, modified TEXT
);

-- Word index over those headlines and products, rebuilt after each import, so a product's CVEs are found at once.
CREATE VIRTUAL TABLE IF NOT EXISTS cve_info_fts USING fts5(product, title, content='cve_info', content_rowid='rowid', tokenize='unicode61');

-- When HEXBRAIN_INVITE_ONLY is on, only these email addresses (and the admins) may create and use API keys.
CREATE TABLE IF NOT EXISTS invites (email TEXT PRIMARY KEY, added_by TEXT, created_at TEXT NOT NULL);

-- Derived by `node scripts/ingest.mjs index`: write-ups cut into passages for precise search, the protections
-- each report got past, and which earlier report a bypass refers to.
CREATE TABLE IF NOT EXISTS sections (id INTEGER PRIMARY KEY, report_id INTEGER NOT NULL, heading TEXT, text TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS sections_report ON sections(report_id);
CREATE VIRTUAL TABLE IF NOT EXISTS sections_fts USING fts5(heading, text, content='sections', content_rowid='id', tokenize='porter unicode61');
CREATE TABLE IF NOT EXISTS report_tags (report_id INTEGER NOT NULL, tag TEXT NOT NULL, PRIMARY KEY (report_id, tag));
CREATE INDEX IF NOT EXISTS report_tags_tag ON report_tags(tag);
CREATE TABLE IF NOT EXISTS report_refs (report_id INTEGER NOT NULL, ref_id INTEGER NOT NULL, PRIMARY KEY (report_id, ref_id));

-- Reference techniques and payloads from open collections (see THIRD_PARTY.md), cut into passages by heading.
-- Filled by `node scripts/ingest.mjs payloads`.
CREATE TABLE IF NOT EXISTS techniques (
  id INTEGER PRIMARY KEY, source TEXT NOT NULL, topic TEXT NOT NULL, class_id TEXT, path TEXT NOT NULL, text TEXT NOT NULL, url TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS techniques_topic ON techniques(topic);
CREATE VIRTUAL TABLE IF NOT EXISTS techniques_fts USING fts5(topic, path, text, content='techniques', content_rowid='id', tokenize='porter unicode61');

-- Known CVEs that can be checked for remotely, with how to check, whether they are exploited in the wild, and how
-- likely exploitation is. Filled by `node scripts/ingest.mjs cves` (sources in THIRD_PARTY.md).
CREATE TABLE IF NOT EXISTS cves (
  id TEXT PRIMARY KEY, name TEXT, severity TEXT, description TEXT, impact TEXT, remediation TEXT, vendor TEXT, product TEXT, cpe TEXT,
  cvss REAL, cwe TEXT, tags TEXT, verified INTEGER DEFAULT 0, protocol TEXT, refs TEXT, template_path TEXT, template TEXT, check_summary TEXT,
  kev INTEGER DEFAULT 0, kev_added TEXT, kev_ransomware INTEGER DEFAULT 0, kev_action TEXT, epss REAL, epss_pct REAL
);
CREATE INDEX IF NOT EXISTS cves_product ON cves(product);
CREATE VIRTUAL TABLE IF NOT EXISTS cves_fts USING fts5(id, name, vendor, product, tags, description, content='cves', tokenize='unicode61');

-- Every registered CVE id (from the public EPSS list). For the CVE map each sits in a band of its year
-- (0 exploited, 1 has a ready check, 2 likely, 3 possible, 4 unlikely) at position `pos`, most likely first.
-- `month` is the month the CVE was published (1 to 12), or 0 when no date is known; it and its index are added by the
-- code that opens the database, so that older copies of the file gain them too.
CREATE TABLE IF NOT EXISTS cve_map (id TEXT PRIMARY KEY, year INTEGER NOT NULL, band INTEGER NOT NULL, pos INTEGER NOT NULL, epss REAL, month INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS cve_map_place ON cve_map(year, band, pos);
