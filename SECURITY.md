# Wazen security policy

## Reporting

Do not include customer records, passwords, session cookies, invite tokens, database tokens, or webhook secrets in an issue. Send a private report to the security contact configured for the production domain.

## Implemented controls (v0.2.0)

- PBKDF2-SHA-256 password derivation with a unique salt and 600,000 iterations.
- Random 256-bit sessions stored as SHA-256 hashes; cookies are `HttpOnly`, `SameSite=Lax`, and `Secure` in production. One active session per browser profile via `browser_id` (persisted in `localStorage` and the `wazen_browser` cookie): a new sign-in deletes every prior session row for that browser id; tabs broadcast session changes and reload when the signed-in user changes.
- Session-bound CSRF tokens, `__Host-` production cookies, TOTP replay prevention, and scoped/hashed/expiring API keys.
- No shared Vercel demo identity. Demo data is local/explicit only.
- Durable D1 or Turso/libSQL storage; Vercel `/tmp` SQLite is rejected.
- Central server-side tenant isolation, active-account enforcement, module permissions, and role-specific capabilities.
- Same-origin checks, body limits, persistent rate limits, mutation idempotency, and temporary IP blocks (`IP_BLOCK_HOURS = 2`) that expire automatically and can be lifted by admin.
- Double-entry journals for new financial movements and insufficient-funds checks.
- Invite tokens are hashed, expire after seven days, and are never returned by the API.
- Payment webhooks require HMAC-SHA-256 signatures, payload-bound event idempotency, and database-enforced transitions.
- Per-request nonce CSP, HSTS, frame denial, content-type protection, referrer, and permissions headers.
- Sensitive configuration uses versioned AES-256-GCM envelopes with HKDF purpose separation and rotation support.
- Audit metadata is centrally redacted; maintenance also scrubs legacy rows in bounded batches.

## Operational requirements

- Never enable `WAZEN_DEMO_MODE`, `WAZEN_USE_NODE_SQLITE`, or trusted OpenAI identity headers on Vercel production.
- Rotate database, job, email, and payment secrets after any suspected exposure.
- Protect Vercel and GitHub with MFA and least-privilege access.
- Configure point-in-time recovery/backups and test a restore at least quarterly.

Wazen organizes financial records. It is not a bank or a custodian of customer funds.
