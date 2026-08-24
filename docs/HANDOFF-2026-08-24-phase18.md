# Handoff — 24 أغسطس 2026 (مرحلة 18)

**الفرع:** `main`  
**المستودع:** https://github.com/ainoamn/WAZEN  
**الإنتاج:** https://wazen-roan.vercel.app · https://wazen.bhd-om.com  

المرجع السابق: [HANDOFF-2026-08-24-phase17.md](./HANDOFF-2026-08-24-phase17.md).

على الجهاز الآخر: `git pull origin main` ثم `npm install` إن لزم. لا ترفع ملفات `public/brand/*-with-bg.png`.

## المرحلة 18 — مشاركة روابط، تفاصيل حركة، إشعارات

### Business API
- `POST /api/v1/spaces/{spaceId}/shares/receipt` — رابط إيصال + واتساب.
- `POST /api/v1/spaces/{spaceId}/shares/member-statement` — كشف عضو.
- `POST /api/v1/spaces/{spaceId}/shares/statement` — كشف الجمعية.
- `GET /api/v1/spaces/{spaceId}/transactions/{transactionId}`
- `GET /api/v1/spaces/{spaceId}/transactions/{transactionId}/revisions`
- `GET /api/v1/notifications` · `POST /api/v1/notifications/read`

### Webhooks
حدث جديد: `share.created`.

### OpenAPI / مطوّرون
- `/api/v1/openapi` و`/developers` محدّثان (phase 18).

### اختبارات
- `tests/phase18-platform.test.mjs`.

### ما يبقى يدوياً
Protect `main`، `SENTRY_DSN`، اعتماد محامٍ، `WAZEN_RLS_ENFORCE=1` بعد Staging، مفاتيح PSP حية.
