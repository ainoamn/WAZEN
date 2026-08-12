CREATE TABLE IF NOT EXISTS admin_bootstrap_tokens (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_bootstrap_tokens_email ON admin_bootstrap_tokens (email);
CREATE INDEX IF NOT EXISTS idx_admin_bootstrap_tokens_expires ON admin_bootstrap_tokens (expires_at);
