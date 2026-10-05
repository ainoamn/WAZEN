-- Sequential entry number per wallet; a fund-paid trip bill shares its transaction's number.
ALTER TABLE transactions ADD COLUMN seq_no INTEGER;
---> statement-breakpoint
ALTER TABLE trip_expenses ADD COLUMN seq_no INTEGER;
---> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_transactions_space_seq ON transactions (space_id, seq_no);
---> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_trip_expenses_space_seq ON trip_expenses (space_id, seq_no);
