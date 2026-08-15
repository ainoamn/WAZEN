CREATE TABLE IF NOT EXISTS space_links (
  id TEXT PRIMARY KEY,
  hub_space_id TEXT NOT NULL,
  linked_space_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  UNIQUE(hub_space_id, linked_space_id)
);
CREATE INDEX IF NOT EXISTS idx_space_links_hub ON space_links(hub_space_id, status);
CREATE TABLE IF NOT EXISTS space_bank_links (
  id TEXT PRIMARY KEY,
  hub_space_id TEXT NOT NULL,
  linked_space_id TEXT NOT NULL UNIQUE,
  account_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_space_bank_hub ON space_bank_links(hub_space_id, account_id);
