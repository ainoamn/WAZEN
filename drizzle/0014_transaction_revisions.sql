-- In-place transaction edits keep the same id; revisions store the previous snapshot.
ALTER TABLE transactions ADD COLUMN modified_at TEXT;
---> statement-breakpoint
ALTER TABLE transactions ADD COLUMN edit_count INTEGER NOT NULL DEFAULT 0;
---> statement-breakpoint
CREATE TABLE IF NOT EXISTS transaction_revisions (
  id TEXT PRIMARY KEY NOT NULL,
  transaction_id TEXT NOT NULL,
  edited_by TEXT NOT NULL,
  editor_name TEXT NOT NULL,
  edited_at TEXT NOT NULL,
  kind TEXT NOT NULL,
  allocation TEXT NOT NULL,
  amount_minor INTEGER NOT NULL,
  member_id TEXT,
  description_ar TEXT NOT NULL,
  description_en TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  status TEXT NOT NULL
);
---> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_transaction_revisions_txn ON transaction_revisions (transaction_id, edited_at);
