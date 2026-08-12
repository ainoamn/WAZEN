const secretKey = /(authorization|cookie|password|passphrase|secret|token|api[_-]?key|session|otp|totp|cvv|cvc|card(number)?|private[_-]?key|access[_-]?key)/i;
const secretValue = /^(bearer\s+|basic\s+|wzn_[a-z0-9_-]{16,}|[a-z0-9_-]{40,})/i;
const REDACTED = "[REDACTED]";
const MAX_DEPTH = 5;
const MAX_KEYS = 50;
const MAX_STRING = 500;

export function sanitizeAuditMetadata(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return "[TRUNCATED]";
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string") {
    if (secretValue.test(value)) return REDACTED;
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
  }
  if (Array.isArray(value)) return value.slice(0, MAX_KEYS).map((item) => sanitizeAuditMetadata(item, depth + 1));
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).slice(0, MAX_KEYS);
    return Object.fromEntries(entries.map(([key, item]) => [key, secretKey.test(key) ? REDACTED : sanitizeAuditMetadata(item, depth + 1)]));
  }
  return String(value);
}

export function prepareAudit(db: D1Database, input: {
  userId: string; action: string; entityType: string; entityId: string; metadata?: unknown; createdAt?: string;
}) {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const metadata = JSON.stringify(sanitizeAuditMetadata(input.metadata ?? {}));
  return db.prepare("INSERT INTO audit_logs (id,user_id,action,entity_type,entity_id,metadata_json,created_at) VALUES (?,?,?,?,?,?,?)")
    .bind(crypto.randomUUID(), input.userId, input.action.slice(0, 100), input.entityType.slice(0, 80), input.entityId.slice(0, 160), metadata, createdAt);
}

export async function writeAudit(db: D1Database, input: {
  userId: string; action: string; entityType: string; entityId: string; metadata?: unknown; createdAt?: string;
}) {
  await prepareAudit(db, input).run();
}
