-- Postgres / Neon: indexes + RLS defense-in-depth (SCHEMA_VERSION 15)
-- Runtime also applies these via ensureSchemaPatches / applyPostgresRls.

CREATE INDEX IF NOT EXISTS idx_transactions_space_status_date ON transactions(space_id, status, occurred_at);
CREATE INDEX IF NOT EXISTS idx_transactions_member ON transactions(member_id, occurred_at);

CREATE OR REPLACE FUNCTION wazen_space_visible(p_space_id text) RETURNS boolean AS $fn$
DECLARE
  uid text := nullif(current_setting('app.user_id', true), '');
BEGIN
  IF current_setting('app.bypass_rls', true) IS DISTINCT FROM '0' THEN
    RETURN true;
  END IF;
  IF uid IS NULL THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM spaces s
    WHERE s.id = p_space_id AND (s.owner_user_id = uid OR EXISTS (
      SELECT 1 FROM members m WHERE m.space_id = s.id AND m.user_id = uid AND m.status = 'active'
    ))
  );
END;
$fn$ LANGUAGE plpgsql STABLE;
