# Handoff — 24 أغسطس 2026 (مرحلة 17)

**الفرع:** `main`  
**المستودع:** https://github.com/ainoamn/WAZEN  
**الإنتاج:** https://wazen-roan.vercel.app · https://wazen.bhd-om.com  

المرجع السابق: [HANDOFF-2026-08-24-phase16.md](./HANDOFF-2026-08-24-phase16.md).

على الجهاز الآخر: `git pull origin main` ثم `npm install` إن لزم. لا ترفع ملفات `public/brand/*-with-bg.png`.

## المرحلة 17 — دائرة الجمعية، أرشفة، إلغاء تسوية

### Business API
- `GET /api/v1/spaces/{spaceId}/circle` — إعداد الدورة والأدوار.
- `POST /api/v1/spaces/{spaceId}/circle/order` — تعيين ترتيب الصرف (نطاق `circles:write`).
- `POST /api/v1/spaces/{spaceId}/circle/turns/{turnId}/complete` — صرف الدور الحالي.
- `POST /api/v1/spaces/{spaceId}/archive` — أرشفة/استعادة محفظة (المالك فقط).
- `POST /api/v1/spaces/{spaceId}/settlements/{settlementId}/void` — إلغاء تسوية معلّقة.

### Webhooks
أحداث جديدة: `circle.order_set` · `circle.turn_paid` · `space.archived` · `settlement.voided`.

### OpenAPI / مطوّرون
- `/api/v1/openapi` و`/developers` محدّثان (phase 17) مع ذكر `circles:write`.

### اختبارات
- `tests/phase17-platform.test.mjs`.

### ما يبقى يدوياً
Protect `main`، `SENTRY_DSN`، اعتماد محامٍ، `WAZEN_RLS_ENFORCE=1` بعد Staging، مفاتيح PSP حية.
