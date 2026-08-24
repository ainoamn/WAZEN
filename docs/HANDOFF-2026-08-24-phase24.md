# Handoff — 24 أغسطس 2026 (مرحلة 24)

**الفرع:** `main`  
**المستودع:** https://github.com/ainoamn/WAZEN  
**الإنتاج:** https://wazen-roan.vercel.app · https://wazen.bhd-om.com  

المرجع السابق: [HANDOFF-2026-08-24-phase23.md](./HANDOFF-2026-08-24-phase23.md).

على الجهاز الآخر: `git pull origin main` ثم `npm install` إن لزم. لا ترفع ملفات `public/brand/*-with-bg.png`.

## المرحلة 24 — طابور استحقاق، تعيين حساب، تأجيل

### Business API
- `POST /api/v1/spaces/{spaceId}/occurrences` — إضافة استحقاق لفترة (`ruleId` + `periodKey`).
- `PATCH /api/v1/spaces/{spaceId}/occurrences/{occurrenceId}` — تعيين حساب بنكي/نقدي لاستحقاق معلّق.
- `POST /api/v1/spaces/{spaceId}/occurrences/{occurrenceId}/defer` — تأجيل إلى تاريخ (`deferUntil: YYYY-MM-DD`).

### Webhooks
أحداث جديدة: `occurrence.queued` · `occurrence.updated` · `occurrence.deferred`.

### OpenAPI / مطوّرون
- `/api/v1/openapi` و`/developers` محدّثان (phase 24).

### اختبارات
- `tests/phase24-platform.test.mjs`.

### ما يبقى يدوياً
Protect `main`، `SENTRY_DSN`، اعتماد محامٍ، `WAZEN_RLS_ENFORCE=1` بعد Staging، مفاتيح PSP حية.
