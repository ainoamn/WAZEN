ALTER TABLE users ADD COLUMN bhd_sub TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS users_bhd_sub_idx ON users(bhd_sub);
