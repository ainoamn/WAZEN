ALTER TABLE auth_sessions ADD COLUMN csrf_token_hash TEXT;
CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, country TEXT NOT NULL DEFAULT 'SA', currency TEXT NOT NULL DEFAULT 'SAR', locale TEXT NOT NULL DEFAULT 'ar',
  timezone TEXT NOT NULL DEFAULT 'Asia/Riyadh', created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tenant_memberships (
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('owner','admin','finance','member','auditor','viewer')), status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL,
  PRIMARY KEY(tenant_id,user_id)
);
CREATE TABLE IF NOT EXISTS tenant_resources (
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, resource_type TEXT NOT NULL, resource_id TEXT NOT NULL, created_at TEXT NOT NULL,
  PRIMARY KEY(resource_type,resource_id)
);
CREATE TABLE IF NOT EXISTS totp_credentials (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, encrypted_secret TEXT NOT NULL, key_version TEXT NOT NULL,
  last_used_step INTEGER, enabled_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL, key_prefix TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, scopes_json TEXT NOT NULL, expires_at TEXT, last_used_at TEXT, revoked_at TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS payment_provider_settings (
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, provider TEXT NOT NULL, endpoint_url TEXT NOT NULL,
  encrypted_config TEXT NOT NULL, key_version TEXT NOT NULL, updated_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, updated_at TEXT NOT NULL,
  PRIMARY KEY(tenant_id,provider)
);
CREATE TABLE IF NOT EXISTS financial_operation_claims (
  operation_type TEXT NOT NULL, resource_id TEXT NOT NULL, idempotency_key TEXT NOT NULL, created_at TEXT NOT NULL,
  PRIMARY KEY(operation_type,resource_id)
);
CREATE TRIGGER IF NOT EXISTS trg_payment_status_transition BEFORE UPDATE OF status ON payments
WHEN NOT ((OLD.status='pending' AND NEW.status IN ('succeeded','failed')) OR (OLD.status='failed' AND NEW.status='pending') OR (OLD.status='succeeded' AND NEW.status='refunded'))
BEGIN SELECT RAISE(ABORT, 'INVALID_PAYMENT_TRANSITION'); END;
CREATE TRIGGER IF NOT EXISTS trg_space_nonnegative_balance BEFORE UPDATE OF balance_minor ON spaces
WHEN NEW.balance_minor < 0 BEGIN SELECT RAISE(ABORT, 'INSUFFICIENT_FUNDS'); END;
CREATE TRIGGER IF NOT EXISTS trg_member_financial_bounds BEFORE UPDATE OF paid_minor,extra_minor ON members
WHEN NEW.extra_minor < 0 OR NEW.paid_minor < 0 OR NEW.paid_minor > NEW.due_minor BEGIN SELECT RAISE(ABORT, 'MEMBER_FINANCIAL_BOUNDS'); END;
CREATE INDEX IF NOT EXISTS idx_tenant_memberships_user ON tenant_memberships(user_id,status);
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id,revoked_at);
INSERT OR IGNORE INTO tenants (id,name,country,currency,locale,timezone,created_by,created_at)
  SELECT 'tenant:'||id,display_name,'SA',currency,locale,'Asia/Riyadh',id,created_at FROM users;
INSERT OR IGNORE INTO tenant_memberships (tenant_id,user_id,role,status,created_at)
  SELECT 'tenant:'||id,id,'owner','active',created_at FROM users;
INSERT OR IGNORE INTO tenant_resources (tenant_id,resource_type,resource_id,created_at)
  SELECT 'tenant:'||owner_user_id,'space',id,created_at FROM spaces;
INSERT OR IGNORE INTO tenant_resources (tenant_id,resource_type,resource_id,created_at)
  SELECT 'tenant:'||owner_user_id,'document',id,created_at FROM documents;
INSERT OR IGNORE INTO tenant_resources (tenant_id,resource_type,resource_id,created_at)
  SELECT 'tenant:'||user_id,'invoice',id,created_at FROM invoices;
INSERT OR IGNORE INTO tenant_resources (tenant_id,resource_type,resource_id,created_at)
  SELECT 'tenant:'||user_id,'payment',id,created_at FROM payments;
