CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON users(email COLLATE NOCASE);
ALTER TABLE contribution_plans ADD COLUMN duration_months INTEGER NOT NULL DEFAULT 60;
CREATE TABLE IF NOT EXISTS auth_credentials (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, password_hash TEXT NOT NULL, password_salt TEXT NOT NULL,
  password_iterations INTEGER NOT NULL DEFAULT 600000, email_verified_at TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL, created_at TEXT NOT NULL, last_seen_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_expiry ON auth_sessions(user_id, expires_at);
CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, used_at TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, used_at TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY, hits INTEGER NOT NULL DEFAULT 0, window_started_at TEXT NOT NULL, expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, action TEXT NOT NULL, response_json TEXT,
  created_at TEXT NOT NULL, expires_at TEXT NOT NULL, PRIMARY KEY(key,user_id)
);
CREATE TABLE IF NOT EXISTS journal_entries (
  id TEXT PRIMARY KEY, space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE RESTRICT, transaction_id TEXT REFERENCES transactions(id) ON DELETE RESTRICT, created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  description TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'posted' CHECK(status IN ('posted','reversed')),
  reversal_of TEXT REFERENCES journal_entries(id) ON DELETE RESTRICT, occurred_at TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS journal_lines (
  id TEXT PRIMARY KEY, entry_id TEXT NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE, account_code TEXT NOT NULL, member_id TEXT,
  debit_minor INTEGER NOT NULL DEFAULT 0 CHECK(debit_minor>=0), credit_minor INTEGER NOT NULL DEFAULT 0 CHECK(credit_minor>=0),
  created_at TEXT NOT NULL, CHECK((debit_minor=0 AND credit_minor>0) OR (credit_minor=0 AND debit_minor>0))
);
CREATE INDEX IF NOT EXISTS idx_journal_entries_space_date ON journal_entries(space_id,occurred_at);
CREATE INDEX IF NOT EXISTS idx_journal_lines_entry ON journal_lines(entry_id);
CREATE TABLE IF NOT EXISTS circle_configs (
  space_id TEXT PRIMARY KEY REFERENCES spaces(id) ON DELETE CASCADE, ordering_mode TEXT NOT NULL DEFAULT 'manual', draw_seed_hash TEXT,
  current_turn INTEGER NOT NULL DEFAULT 0, updated_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS circle_turns (
  id TEXT PRIMARY KEY, space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE, member_id TEXT NOT NULL REFERENCES members(id) ON DELETE RESTRICT, turn_number INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled', amount_minor INTEGER NOT NULL CHECK(amount_minor>0),
  scheduled_at TEXT, paid_at TEXT, created_at TEXT NOT NULL, UNIQUE(space_id,turn_number)
);
CREATE TABLE IF NOT EXISTS trip_expenses (
  id TEXT PRIMARY KEY, space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE, paid_by_member_id TEXT NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  amount_minor INTEGER NOT NULL CHECK(amount_minor>0), description TEXT NOT NULL,
  occurred_at TEXT NOT NULL, created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS expense_splits (
  id TEXT PRIMARY KEY, expense_id TEXT NOT NULL REFERENCES trip_expenses(id) ON DELETE CASCADE, member_id TEXT NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  share_minor INTEGER NOT NULL CHECK(share_minor>=0), UNIQUE(expense_id,member_id)
);
CREATE TABLE IF NOT EXISTS settlements (
  id TEXT PRIMARY KEY, space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE, from_member_id TEXT NOT NULL, to_member_id TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK(amount_minor>0), status TEXT NOT NULL DEFAULT 'pending', settled_at TEXT, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_trip_expenses_space ON trip_expenses(space_id,occurred_at);
CREATE TABLE IF NOT EXISTS email_outbox (
  id TEXT PRIMARY KEY, recipient TEXT NOT NULL, template TEXT NOT NULL, payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, sent_at TEXT
);
CREATE TABLE IF NOT EXISTS webhook_events (
  provider TEXT NOT NULL, event_id TEXT NOT NULL, payload_hash TEXT NOT NULL, processed_at TEXT NOT NULL,
  PRIMARY KEY(provider,event_id)
);
CREATE TABLE IF NOT EXISTS coupon_redemptions (
  id TEXT PRIMARY KEY, coupon_id TEXT NOT NULL REFERENCES coupons(id) ON DELETE RESTRICT, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, invoice_id TEXT NOT NULL UNIQUE REFERENCES invoices(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'reserved', created_at TEXT NOT NULL, redeemed_at TEXT
);
CREATE TRIGGER IF NOT EXISTS trg_coupon_usage_limit BEFORE UPDATE OF used_count ON coupons
WHEN NEW.used_count > NEW.usage_limit BEGIN SELECT RAISE(ABORT, 'COUPON_USAGE_LIMIT'); END;
CREATE TABLE IF NOT EXISTS data_requests (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, type TEXT NOT NULL CHECK(type IN ('export','deletion')),
  status TEXT NOT NULL DEFAULT 'pending', requested_at TEXT NOT NULL, completed_at TEXT
);
