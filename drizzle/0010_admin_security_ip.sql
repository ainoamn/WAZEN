-- Admin security: session IP tracking, security events, blocked IPs (schema v10)

ALTER TABLE auth_sessions ADD COLUMN ip_hash TEXT;
ALTER TABLE auth_sessions ADD COLUMN ip_masked TEXT;
ALTER TABLE auth_sessions ADD COLUMN user_agent TEXT;
ALTER TABLE auth_sessions ADD COLUMN country_code TEXT;

CREATE TABLE IF NOT EXISTS security_events (
  id TEXT PRIMARY KEY,
  ip_hash TEXT NOT NULL,
  ip_masked TEXT NOT NULL,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  country_code TEXT,
  user_agent TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_security_events_ip ON security_events(ip_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_user ON security_events(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS blocked_ips (
  ip_hash TEXT PRIMARY KEY,
  ip_masked TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'blocked' CHECK(status IN ('blocked','allowed')),
  blocked_by TEXT NOT NULL,
  blocked_at TEXT NOT NULL,
  expires_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_blocked_ips_status ON blocked_ips(status, expires_at);
