# Handoff — 24 أغسطس 2026 (مرحلة 12)

**الفرع:** `main`  
**المستودع:** https://github.com/ainoamn/WAZEN  
**الإنتاج:** https://wazen-roan.vercel.app · https://wazen.bhd-om.com  

المرجع السابق: [HANDOFF-2026-08-24-phase11.md](./HANDOFF-2026-08-24-phase11.md).

على الجهاز الآخر: `git pull origin main` ثم `npm install` إن لزم. لا ترفع ملفات `public/brand/*-with-bg.png`.

## المرحلة 12 — Webhooks تكامل + مساهمات وملخص API

### Outbound webhooks
- `SCHEMA_VERSION = 21`: جداول `integration_webhooks` + `webhook_outbox`.
- `lib/integration-webhooks.ts`: إنشاء/إلغاء، طابور أحداث، تسليم موقّع `X-Wazen-Signature: sha256=…`.
- HTTPS عام مع منع الشبكات الخاصة (`validatePublicHttpsWebhookUrl`).
- أحداث: `transaction.created` · `transaction.voided` · `member.invited` · `surplus.withdrawn` · `contribution.recorded`.
- `/api/jobs/tick` يصرف الطابور كل دورة (`?tasks=webhooks`).
- إدارة من أمان الحساب + `GET/POST` عبر platform (`view=webhooks`, `createWebhook`, `revokeWebhook`).

### Business API
- `GET /api/v1/spaces/{spaceId}/summary` — أرصدة ومستحقات ومتأخرون.
- `POST /api/v1/spaces/{spaceId}/contributions` — مساهمة مع تقسيم إلزامي/فائض.

### اختبارات
- `tests/phase12-platform.test.mjs`.

### ما يبقى يدوياً
Protect `main`، `SENTRY_DSN`، اعتماد محامٍ، `WAZEN_RLS_ENFORCE=1` بعد Staging، مفاتيح PSP حية.
