# Operations Runbooks

## Release

1. Create a database backup and record the deployed commit.
2. Run `npm ci`, `npm run audit:prod`, `npm run test:full`, `npm run build` and `docker build .` in CI.
3. Review pending SQL files. Run `npm run db:migrate` once against staging, then production. Never edit an applied migration.
4. Deploy one immutable build; verify login, dashboard read/write, document reference, webhook replay and health logs.
5. Roll back the application build if verification fails. Database rollback uses a forward corrective migration or a tested restore; do not reverse financial rows manually.

## Encryption-key rotation

1. Generate a new random 32-byte key and add it to `WAZEN_ENCRYPTION_KEYRING.keys`; retain prior keys.
2. Change `active` to the new version and deploy.
3. Re-encrypt provider/TOTP rows through an approved maintenance job using `rotateSecret`; verify decryption counts without logging plaintext.
4. Remove an old key only after the database contains no envelope referencing it and a backup restore test succeeds.

## Payment/webhook incident

1. Disable the affected provider at its console and rotate the webhook secret; do not place secrets in tickets or logs.
2. Export event IDs, payload hashes, payment transitions and sanitized audit entries.
3. Reconcile provider settlement totals against WAZEN journal/invoice totals. Never replay an event under a new event ID without finance approval.
4. Restore traffic gradually and monitor conflict/replay/error rates.

## Suspected account compromise

1. Suspend the account, revoke its sessions/API keys and require a password reset.
2. Review role changes, provider-setting changes, data exports and financial audit events.
3. Notify the privacy/security owner according to local breach-notification rules.

## Database restore

1. Restore into an isolated environment first; never overwrite production as the first test.
2. Validate schema migration ledger, row counts, tenant isolation queries, balanced journals and newest invoice references.
3. Put production in maintenance mode, take a final snapshot, restore, run read-only validation, then reopen writes.

## Required alerts

Alert on repeated auth failures, CSRF rejection spikes, webhook signature failures/conflicts, provider changes, role escalation, migration failure, negative-balance trigger attempts, backup failure and elevated API 5xx rates. Configure these in the chosen provider (for example Sentry) with sensitive-field scrubbing.
