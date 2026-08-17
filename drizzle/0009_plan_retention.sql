-- Plan retention: 15-day user grace + 60-day admin archive after downgrade/expiry.
ALTER TABLE spaces ADD COLUMN grace_until TEXT;
CREATE TABLE IF NOT EXISTS plan_retention_archives (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  original_space_id TEXT NOT NULL,
  space_type TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  reason TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  archived_at TEXT NOT NULL,
  purge_after TEXT NOT NULL,
  restored_at TEXT,
  restored_by TEXT,
  purged_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_plan_retention_owner ON plan_retention_archives(owner_user_id, archived_at);
CREATE INDEX IF NOT EXISTS idx_plan_retention_purge ON plan_retention_archives(purge_after, purged_at);
CREATE INDEX IF NOT EXISTS idx_spaces_grace_until ON spaces(grace_until);
