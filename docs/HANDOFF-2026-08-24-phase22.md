# Handoff — 24 أغسطس 2026 (مرحلة 22)

**الفرع:** `main`  
**المستودع:** https://github.com/ainoamn/WAZEN  
**الإنتاج:** https://wazen-roan.vercel.app · https://wazen.bhd-om.com  

المرجع السابق: [HANDOFF-2026-08-24-phase21.md](./HANDOFF-2026-08-24-phase21.md).

على الجهاز الآخر: `git pull origin main` ثم `npm install` إن لزم. لا ترفع ملفات `public/brand/*-with-bg.png`.

## المرحلة 22 — تعديل/حذف حسابات وقواعد دخل/مصروف

### Business API
- `PATCH /api/v1/spaces/{spaceId}/accounts/{accountId}` — تعديل اسم/نوع/رصيد افتتاحي/حالة.
- `DELETE /api/v1/spaces/{spaceId}/accounts/{accountId}` — حذف حساب بلا حركات معتمدة (`ACCOUNT_HAS_ACTIVITY` إن وُجدت).
- `GET /api/v1/spaces/{spaceId}/rules` — قواعد الدخل/المصروف + استحقاقات معلّقة (يُولَّد الناقص تلقائياً).
- `POST /api/v1/spaces/{spaceId}/rules` — إنشاء قاعدة شهرية/مرة واحدة/غير مجدولة.

### Webhooks
أحداث جديدة: `account.updated` · `account.deleted` · `rule.created`.

### OpenAPI / مطوّرون
- `/api/v1/openapi` و`/developers` محدّثان (phase 22).

### اختبارات
- `tests/phase22-platform.test.mjs`.

### ما يبقى يدوياً
Protect `main`، `SENTRY_DSN`، اعتماد محامٍ، `WAZEN_RLS_ENFORCE=1` بعد Staging، مفاتيح PSP حية.
