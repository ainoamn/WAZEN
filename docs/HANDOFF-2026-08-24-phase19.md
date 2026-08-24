# Handoff — 24 أغسطس 2026 (مرحلة 19)

**الفرع:** `main`  
**المستودع:** https://github.com/ainoamn/WAZEN  
**الإنتاج:** https://wazen-roan.vercel.app · https://wazen.bhd-om.com  

المرجع السابق: [HANDOFF-2026-08-24-phase18.md](./HANDOFF-2026-08-24-phase18.md).

على الجهاز الآخر: `git pull origin main` ثم `npm install` إن لزم. لا ترفع ملفات `public/brand/*-with-bg.png`.

## المرحلة 19 — تعديل حركة، مصروفات، ربط محافظ

### Business API
- `PATCH /api/v1/spaces/{spaceId}/transactions/{transactionId}` — تعديل مع سجل مراجعات.
- `PATCH /api/v1/spaces/{spaceId}/expenses/{expenseId}` — تعديل مصروف وإعادة تقسيم.
- `POST /api/v1/spaces/{spaceId}/expenses/resplit` — إعادة تقسيم المصروفات غير المسوّاة.
- `GET|POST|DELETE /api/v1/spaces/{spaceId}/links` — ربط/فك محفظة بالمحفظة الشخصية.

### Webhooks
أحداث جديدة: `transaction.updated` · `expense.updated` · `expense.resplit` · `space.linked` · `space.unlinked`.

### OpenAPI / مطوّرون
- `/api/v1/openapi` و`/developers` محدّثان (phase 19).

### اختبارات
- `tests/phase19-platform.test.mjs`.

### ما يبقى يدوياً
Protect `main`، `SENTRY_DSN`، اعتماد محامٍ، `WAZEN_RLS_ENFORCE=1` بعد Staging، مفاتيح PSP حية.
