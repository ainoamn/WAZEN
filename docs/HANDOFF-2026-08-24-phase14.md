# Handoff — 24 أغسطس 2026 (مرحلة 14)

**الفرع:** `main`  
**المستودع:** https://github.com/ainoamn/WAZEN  
**الإنتاج:** https://wazen-roan.vercel.app · https://wazen.bhd-om.com  

المرجع السابق: [HANDOFF-2026-08-24-phase13.md](./HANDOFF-2026-08-24-phase13.md).

على الجهاز الآخر: `git pull origin main` ثم `npm install` إن لزم. لا ترفع ملفات `public/brand/*-with-bg.png`.

## المرحلة 14 — مستندات كتابة، تسويات، فترات محاسبية

### Business API
- `POST /api/v1/documents` (نطاق `documents:write`) عبر `lib/v1-create-document.ts`.
- `GET /api/v1/spaces/{spaceId}/settlements?status=&limit=`
- `POST /api/v1/spaces/{spaceId}/settlements/{settlementId}/settle` (نطاق `settlements:write`).
- `GET /api/v1/spaces/{spaceId}/periods`
- `POST /api/v1/spaces/{spaceId}/periods` — إغلاق الفترة؛ يرفض `PERIOD_UNSETTLED` إن بقيت مستحقات/تسويات معلّقة.

### Webhooks
أحداث جديدة: `document.created` · `settlement.settled` · `period.closed`.

### OpenAPI / مطوّرون
- `/api/v1/openapi` و`/developers` محدّثان (phase 14).

### اختبارات
- `tests/phase14-platform.test.mjs`.

### ما يبقى يدوياً
Protect `main`، `SENTRY_DSN`، اعتماد محامٍ، `WAZEN_RLS_ENFORCE=1` بعد Staging، مفاتيح PSP حية.
