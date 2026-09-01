# Launch checklist — WAZEN

Operational go-live list. Code ships readiness signals; several steps stay manual in GitHub/Vercel/counsel.

## Required (blocks “ready” score)

1. `DATABASE_URL` (Neon) linked  
2. `WAZEN_APP_ORIGIN` clean HTTPS origin  
3. `WAZEN_ENCRYPTION_KEYRING`  
4. Demo / trust-headers / Node SQLite **off** in production  
5. `WAZEN_JOB_SECRET` (≥32) and/or `CRON_SECRET`  
6. `WAZEN_PAYMENT_WEBHOOK_SECRET`  

Verify: `GET /api/health` with `Authorization: Bearer $WAZEN_JOB_SECRET` → `readiness.ready === true`.

## Recommended before public traffic

| Item | Action |
|------|--------|
| Sentry | Set `SENTRY_DSN` |
| Email | `RESEND_API_KEY` + `RESEND_FROM_EMAIL` (أو webhook قديم) + cron tick · قالب `member_statement` بعد المعاملات الجماعية ([MEMBER-STATEMENT-EMAIL.md](./MEMBER-STATEMENT-EMAIL.md)) |
| WhatsApp invites | `WHATSAPP_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID` (+ قالب `WHATSAPP_INVITE_TEMPLATE`) |
| SMS invites | Twilio **أو** Unifonic env (انظر `.env.example`) |
| Web Push | `WAZEN_VAPID_*` |
| Card pay | Thawani or OmanNet env (manual transfer OK) |
| RLS | Staging with `WAZEN_RLS_DRY_RUN=1`, then `WAZEN_RLS_ENFORCE=1` |
| CI gate | Protect `main` → require check `verify` |
| Legal | Counsel review → `WAZEN_LEGAL_COUNSEL_SIGNED=1` |

## Ops surfaces

- Admin overview: launch readiness + recent `job_runs`  
- `GET /api/platform?view=admin&scope=ops`  
- Cron: `/api/jobs/tick` every 5 minutes (`vercel.json`) — email/push/webhooks; privacy at 03:00 UTC; dues at 06:00 UTC; maintenance at 02:00 UTC  

Handoff: [HANDOFF-2026-08-30.md](./HANDOFF-2026-08-30.md) · [HANDOFF-2026-08-25-phase25.md](./HANDOFF-2026-08-25-phase25.md)
