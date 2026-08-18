ALTER TABLE auth_sessions ADD COLUMN browser_id TEXT;
CREATE INDEX IF NOT EXISTS idx_auth_sessions_browser ON auth_sessions(browser_id);
