CREATE TABLE IF NOT EXISTS oauth_identities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  email TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(provider, provider_user_id)
);
CREATE INDEX IF NOT EXISTS idx_oauth_identities_user ON oauth_identities(user_id);
