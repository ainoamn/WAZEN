# WAZEN Threat Model

## Scope and assets

The protected assets are credentials, sessions, TOTP seeds, API keys, provider credentials, member identities, wallet balances, financial journal entries, invoices, audit logs and tenant boundaries. Production infrastructure (Vercel, Turso, email and payment providers) is a separate trust domain.

## Trust boundaries and flows

1. Browser → Next.js: TLS, session cookie, session-bound CSRF token, request-size/origin checks and CSP.
2. API → Turso/D1: parameterized SQL, central platform/space authorization, tenant resource mappings, constraints and atomic batches.
3. Provider → payment webhook: HMAC authenticity, immutable event ID/payload hash and atomic state transitions.
4. Worker → email/payment providers: exact HTTPS host allowlists, no redirects, timeouts and encrypted settings.
5. Admin → platform data: centrally enforced role permissions and deliberately reduced audit-log/API projections.

## Primary abuse cases and controls

| Threat | Control | Verification |
|---|---|---|
| Credential/session theft | PBKDF2, HttpOnly/SameSite **session** cookies (cleared when the browser closes), 10-minute idle expiry on `last_seen_at`, password reset/change revokes sessions, TOTP replay protection | backend + E2E |
| CSRF | session-bound double-submit token verified against a server hash | frontend regression + E2E mutations |
| Tenant IDOR | central `authorizeSpace`, tenant mappings, non-disclosing 404 | cross-tenant E2E |
| Audit secret leakage | recursive allow-bounded redaction and admin projection excluding metadata | regression test |
| Stored/reflected XSS | React escaping, download escaping, embedded CSP and nonce CSP | frontend regression + CSP inspection |
| SSRF | HTTPS-only exact allowlist, private/loopback rejection, redirect denial | regression test |
| Duplicate payment/webhook | action-bound idempotency, unique event/payload, DB transition trigger, atomic batch | E2E race |
| Financial rounding/race | integer minor units parsed with BigInt, basis points, atomic references, DB constraints | backend + E2E concurrency |
| Secret compromise | versioned keyring, HKDF purpose separation, AES-256-GCM, rotation indicator | backend test |

## Residual risks

- Compromise of a production operator or hosting account remains an infrastructure risk; MFA, least privilege and provider audit logs are required.
- Legal compliance, PCI scope and independent penetration testing require external specialists and a controlled production-like environment.
- POS, restaurant, public invoice-link and attachment-upload modules are not present. Their absence is tested/documented; any future implementation must pass the same authorization, output-encoding and attachment policy gates before release.

Review this model for every new provider, public route, file upload, country pack or role.
