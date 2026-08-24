# Handoff — 24 أغسطس 2026 (مرحلة 23)

**الفرع:** `main`  
**المستودع:** https://github.com/ainoamn/WAZEN  
**الإنتاج:** https://wazen-roan.vercel.app · https://wazen.bhd-om.com  

المرجع السابق: [HANDOFF-2026-08-24-phase22.md](./HANDOFF-2026-08-24-phase22.md).

على الجهاز الآخر: `git pull origin main` ثم `npm install` إن لزم. لا ترفع ملفات `public/brand/*-with-bg.png`.

## المرحلة 23 — تعديل/حذف قواعد وتأكيد/تخطي استحقاقات

### Business API
- `PATCH /api/v1/spaces/{spaceId}/rules/{ruleId}` — تعديل قاعدة أو حالتها (`active`/`paused`/`archived`).
- `DELETE /api/v1/spaces/{spaceId}/rules/{ruleId}` — حذف قاعدة مع إلغاء الاستحقاقات المعلّقة.
- `POST /api/v1/spaces/{spaceId}/occurrences/{occurrenceId}/confirm` — تأكيد استحقاق وترحيل حركة (مبلغ/حساب اختياريان).
- `POST /api/v1/spaces/{spaceId}/occurrences/{occurrenceId}/skip` — تخطي استحقاق معلّق.

### Webhooks
أحداث جديدة: `rule.updated` · `rule.deleted` · `occurrence.posted` · `occurrence.skipped`.

### OpenAPI / مطوّرون
- `/api/v1/openapi` و`/developers` محدّثان (phase 23).

### اختبارات
- `tests/phase23-platform.test.mjs`.

### ما يبقى يدوياً
Protect `main`، `SENTRY_DSN`، اعتماد محامٍ، `WAZEN_RLS_ENFORCE=1` بعد Staging، مفاتيح PSP حية.
