# Handoff — 24 أغسطس 2026 (مرحلة 20)

**الفرع:** `main`  
**المستودع:** https://github.com/ainoamn/WAZEN  
**الإنتاج:** https://wazen-roan.vercel.app · https://wazen.bhd-om.com  

المرجع السابق: [HANDOFF-2026-08-24-phase19.md](./HANDOFF-2026-08-24-phase19.md).

على الجهاز الآخر: `git pull origin main` ثم `npm install` إن لزم. لا ترفع ملفات `public/brand/*-with-bg.png`.

## المرحلة 20 — إدارة Webhooks عبر Business API

### Business API
- `GET /api/v1/webhooks` — قائمة الـ webhooks (+ `?deliveries=1` للتسليمات الأخيرة) وكتالوج الأحداث.
- `POST /api/v1/webhooks` — إنشاء webhook (يعيد `secret` مرة واحدة).
- `DELETE /api/v1/webhooks/{webhookId}` — إلغاء webhook نشط.
- `POST /api/v1/webhooks/{webhookId}/test` — طابور تسليم `webhook.test`.

### نطاقات المفاتيح
- `webhooks:read` · `webhooks:write` مسموحان عند إنشاء مفتاح من أمان الحساب / المنصة.
- مفاتيح القراءة/الكتابة الافتراضية في واجهة الأمان تتضمن النطاقات الجديدة.

### OpenAPI / مطوّرون
- `/api/v1/openapi` و`/developers` محدّثان (phase 20).

### اختبارات
- `tests/phase20-platform.test.mjs`.

### ما يبقى يدوياً
Protect `main`، `SENTRY_DSN`، اعتماد محامٍ، `WAZEN_RLS_ENFORCE=1` بعد Staging، مفاتيح PSP حية.
