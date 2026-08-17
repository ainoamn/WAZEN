# Security Control Status

Status reflects repository controls, not a certification or a guarantee of zero vulnerabilities.

| Requested control | Repository status / evidence |
|---|---|
| Audit secret leakage | Implemented: centralized recursive redaction, bounded metadata, metadata omitted from admin list, regression test |
| Central API roles/modules | Implemented for platform and wallet mutation APIs in `lib/authorization.ts`; API keys enforce scopes |
| Invoice/POS/restaurant XSS | Print/preview uses escaped HTML and blob URLs (`openReportPreview`); no `document.write`. Frontend regression covers dashboard and personal wallet. POS/restaurant modules do not exist |
| Duplicate payments/webhook races | Conditional payment UPDATE by current status; Postgres plpgsql guard on Neon; SQLite RAISE triggers skipped only when non-portable |
| Public invoice data minimization | No public invoice endpoint exists; E2E asserts unauthenticated path is 404 |
| Payment-setting SSRF | Exact HTTPS allowlist, no ports/credentials/private hosts; email redirect denial/timeout |
| Password change/reset/session revocation | Implemented with UI; change/reset revoke sessions and issue one replacement session. Cookies are browser-session (no Expires). Idle > 3 minutes revokes the row and the client signs out |
| CSRF/TOTP/API keys | Session-bound CSRF; TOTP re-enroll stores a pending secret until confirm; ±1 step/replay prevention; hashed scoped expiring API keys shown once |
| Encryption rotation | AES-256-GCM envelope, key versions, HKDF purpose separation, multi-key decrypt/rotation helper |
| Invoice numbering/Decimal | Atomic UPSERT/RETURNING sequence; exact minor-unit parsing with BigInt and basis-point tax |
| Tenant isolation | Central non-disclosing space authorization, tenant mapping foundation and cross-tenant E2E |
| Dependencies | Locked versions, production audit command, Dependabot and CI audit gate |
| Tests | Backend, frontend security regression and API E2E suites |
| CI/CD/Docker/migrations | CI workflow, non-root standalone Docker image, checksum migration runner and release runbook |
| CSP/headers/attachments | Per-request nonce CSP and hardened headers. No attachment-upload surface exists |
| Accessibility/trust/privacy | jsx-a11y CI lint, bilingual trust/security/privacy/terms pages; legal text still requires counsel |
| Service organization | Payment webhook state transition moved to a focused service; use this pattern incrementally |
| Country packs | SA/AE/OM typed foundation, currency scales and expansion checklist |
| Threat model/runbooks/policies | Threat model, incident/release/rotation/restore runbooks and deployment policy |

## 16 Aug 2026 hardening (in repo)

- Registration no longer returns `verifyUrl` in production-like runtimes when email is unconfigured.
- Public `/api/health` returns only `status`, `version`, and `database`; ops details require `Authorization: Bearer $WAZEN_JOB_SECRET`.
- Dashboard JSON redacts other members' email/phone, masks payout account numbers, and limits personal ledgers to owned wallets.
- Schema patches (including TOTP pending columns) run when `schema_meta` is missing or behind `SCHEMA_VERSION` (currently 7). If the stored version is current, `ensureSchema` returns immediately — do not re-run patches on every request (that caused 30–50s add/void on Neon).

Still open: PostgreSQL RLS, making GitHub CI a required Vercel gate, full atomic journal+balance transactions on every edit path.

## External actions still required

Rotate real production credentials, configure hosting/DNS/database/cache/storage/monitoring/email permissions, validate backups, approve legal policies, and commission an authorized penetration test. PCI/SOC 2/ISO claims require the relevant independent process and evidence.
