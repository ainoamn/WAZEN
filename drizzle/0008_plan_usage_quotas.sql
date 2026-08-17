ALTER TABLE plans ADD COLUMN daily_transaction_limit INTEGER NOT NULL DEFAULT 0;
ALTER TABLE plans ADD COLUMN monthly_transaction_limit INTEGER NOT NULL DEFAULT 0;
ALTER TABLE plans ADD COLUMN print_limit INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS quota_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_quota_events_user_kind ON quota_events(user_id, kind, created_at);
UPDATE plans SET daily_transaction_limit=5, monthly_transaction_limit=50, print_limit=10 WHERE id='starter';
UPDATE plans SET daily_transaction_limit=20, monthly_transaction_limit=300, print_limit=50 WHERE id='family';
UPDATE plans SET daily_transaction_limit=80, monthly_transaction_limit=2000, print_limit=200 WHERE id='pro';
UPDATE plans SET daily_transaction_limit=0, monthly_transaction_limit=0, print_limit=0 WHERE id='business';
