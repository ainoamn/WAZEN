# Handoff — 24 أغسطس 2026 (مرحلة 13)

**الفرع:** `main`  
**المستودع:** https://github.com/ainoamn/WAZEN  
**الإنتاج:** https://wazen-roan.vercel.app · https://wazen.bhd-om.com  

المرجع السابق: [HANDOFF-2026-08-24-phase12.md](./HANDOFF-2026-08-24-phase12.md).

على الجهاز الآخر: `git pull origin main` ثم `npm install` إن لزم. لا ترفع ملفات `public/brand/*-with-bg.png`.

## المرحلة 13 — مستندات وأقساط وPATCH أعضاء + اختبار Webhooks

### Business API
- `GET /api/v1/documents` (نطاق `documents:read`) + حد معدل.
- `GET /api/v1/spaces/{spaceId}/installments?memberId=&limit=`
- `PATCH /api/v1/spaces/{spaceId}/members/{memberId}` — دور / حالة / اسم؛ حدث `member.updated`.
- `GET /api/v1/openapi` — لقطة OpenAPI 3.0 للمسارات.

### Webhooks
- `testWebhook` يضع `webhook.test` في الطابور لـ webhook محدد.
- `view=webhooks` يعيد `deliveries` الأخيرة.
- زر «اختبار» + قائمة التسليمات في أمان الحساب.

### حد المعدل
- `lib/v1-rate-limit.ts`: 300 قراءة / 120 كتابة لكل دقيقة لكل مستخدم أو مفتاح.

### اختبارات
- `tests/phase13-platform.test.mjs`.

### ما يبقى يدوياً
Protect `main`، `SENTRY_DSN`، اعتماد محامٍ، `WAZEN_RLS_ENFORCE=1` بعد Staging، مفاتيح PSP حية.
