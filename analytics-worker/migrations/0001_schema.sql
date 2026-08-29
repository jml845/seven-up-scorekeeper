CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT OR IGNORE INTO settings (key, value) VALUES ('analytics_enabled', 'true');

CREATE TABLE IF NOT EXISTS events (
  event_id TEXT PRIMARY KEY,
  received_at TEXT NOT NULL DEFAULT (datetime('now')),
  day TEXT NOT NULL,
  install_hash TEXT NOT NULL,
  event_name TEXT NOT NULL,
  build INTEGER NOT NULL,
  edition TEXT,
  player_count INTEGER,
  round_count INTEGER,
  cast_used INTEGER NOT NULL DEFAULT 0,
  session_seconds INTEGER,
  campaign TEXT NOT NULL DEFAULT 'direct',
  is_internal INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_events_received ON events(received_at);
CREATE INDEX IF NOT EXISTS idx_events_install_received ON events(install_hash, received_at);

CREATE TABLE IF NOT EXISTS installations (
  install_hash TEXT PRIMARY KEY,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  first_campaign TEXT NOT NULL,
  is_internal INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS daily_installations (
  day TEXT NOT NULL,
  install_hash TEXT NOT NULL,
  is_internal INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(day, install_hash)
);

CREATE TABLE IF NOT EXISTS daily_metrics (
  day TEXT NOT NULL,
  metric TEXT NOT NULL,
  is_internal INTEGER NOT NULL DEFAULT 0,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(day, metric, is_internal)
);
