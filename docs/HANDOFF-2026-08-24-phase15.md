# Handoff — 24 أغسطس 2026 (مرحلة 15)

**الفرع:** `main`  
**المستودع:** https://github.com/ainoamn/WAZEN  
**الإنتاج:** https://wazen-roan.vercel.app · https://wazen.bhd-om.com  

المرجع السابق: [HANDOFF-2026-08-24-phase14.md](./HANDOFF-2026-08-24-phase14.md).

على الجهاز الآخر: `git pull origin main` ثم `npm install` إن لزم. لا ترفع ملفات `public/brand/*-with-bg.png`.

## المرحلة 15 — خطة مساهمة، إعادة فتح فترة، مصروفات، /me

### Business API
- `GET|PUT /api/v1/spaces/{spaceId}/contribution-plan` عبر `lib/v1-contribution-plan.ts` (إعادة بناء الأقساط عند التحديث).
- `POST /api/v1/spaces/{spaceId}/periods/{periodId}/reopen` عبر `reopenV1Period`.
- `GET /api/v1/spaces/{spaceId}/expenses` — مصروفات الرحلة/المجموعة.
- `GET /api/v1/me` — هوية المفتاح/الجلسة والنطاقات وعدد المحافظ.

### Rate limits
- `enforceV1RateLimit` على مسارات v1 المتبقية (spaces، transactions، members، invites، void، surplus، summary، audit، …).

### Webhooks
أحداث جديدة: `period.reopened` · `contribution_plan.updated`.

### OpenAPI / مطوّرون
- `/api/v1/openapi` و`/developers` محدّثان (phase 15).
- قائمة أحداث webhooks في أمان الحساب محدّثة.

### اختبارات
- `tests/phase15-platform.test.mjs`.

### ما يبقى يدوياً
Protect `main`، `SENTRY_DSN`، اعتماد محامٍ، `WAZEN_RLS_ENFORCE=1` بعد Staging، مفاتيح PSP حية.
