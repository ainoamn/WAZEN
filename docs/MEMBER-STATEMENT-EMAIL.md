# Member statement emails — كشف الحساب بالبريد

## When it runs

| Trigger | Scope |
|---------|--------|
| `addTransaction` on group wallets | Auto-email all active members with email |
| `addTripExpense` | Same |
| `sendMemberStatementEmails` (dashboard) | Manual — all members or one member |

Group wallet types: `household`, `trip`, `society`, `group`.

## What each member receives

Arabic/English polite email (`member_statement` template):

1. Greeting and wallet name
2. New transaction note (description, amount, date) when triggered by a txn
3. Balance alert: **«عليك للجمعية مبلغ X»** if owes; credit/balanced otherwise
4. Statement summary table (recent lines + paid/owes/credit totals)
5. CTA button → signed link `/s/{token}` (30-day TTL, same as WhatsApp statement share)

Receipt emails (`member_receipt`) for the paying member are unchanged and may send in addition.

## Requirements

- Plan feature: **`email`** on the wallet owner’s subscription
- Provider: `RESEND_API_KEY` + `RESEND_FROM_EMAIL`, or legacy email webhook
- Each member must have **email** on file (`members.email`)
- Cron `/api/jobs/tick` drains `email_outbox` if send is deferred

## Manual send (UI)

Dashboard → transaction row (group wallet) → **Mail** icon → confirm **Send statements by email**.

API: `POST /api/dashboard` with `action: "sendMemberStatementEmails"`, `spaceId`, optional `transactionId`, optional `memberId`, optional `locale`.

## Code map

| File | Role |
|------|------|
| `lib/member-statement-email.ts` | Load ledger bundle, queue per member, flush |
| `lib/member-statement-email-content.ts` | HTML for alert + summary table |
| `lib/email-template-catalog.ts` | `member_statement` default copy |
| `app/api/dashboard/route.ts` | Hooks + `sendMemberStatementEmails` |
| `components/members/association-members.tsx` | `MemberStatementEmailModal` |
| `tests/member-statement-email.test.mjs` | Unit tests |

## Related

- WhatsApp statement share: `createMemberStatementShare` · [HANDOFF-2026-08-16.md](./HANDOFF-2026-08-16.md)
- Email infra: [PRODUCTION-DEPLOYMENT.md](./PRODUCTION-DEPLOYMENT.md) § البريد والدعوات
