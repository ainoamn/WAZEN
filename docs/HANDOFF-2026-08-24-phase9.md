# Handoff — 24 أغسطس 2026 (مرحلة 9)

**الفرع:** `main`  
**المستودع:** https://github.com/ainoamn/WAZEN  
**الإنتاج:** https://wazen-roan.vercel.app · https://wazen.bhd-om.com  

المرجع السابق: [HANDOFF-2026-08-24-phase8.md](./HANDOFF-2026-08-24-phase8.md).

على الجهاز الآخر: `git pull origin main` ثم `npm install` إن لزم. لا ترفع ملفات `public/brand/*-with-bg.png`.

## المرحلة 9 — مستحقات، API أعضاء، أداء، تدقيق

### تذكير المستحقات اليومي
- `lib/dues-digest.ts` + جدول `dues_digest_log` (`SCHEMA_VERSION = 19`).
- يُشغَّل من `/api/jobs/tick` الساعة **06:00 UTC** أو `?tasks=dues`.
- لمالك المحفظة: إشعار داخل التطبيق + Push (إن وُجد) + بريد `dues_digest` في الطابور.

### Business API
- `POST /api/v1/spaces/{spaceId}/members` (نطاق `members:write`).
- رؤوس `X-Response-Time` و`Server-Timing` على مسارات المعاملات والأعضاء.

### سجل التدقيق
- `listSpaceAudit` يدعم بحث `q`.
- حقل بحث في إعدادات اللوحة.

### اختبارات
- `tests/phase9-platform.test.mjs`.

### ما يبقى يدوياً (كما في مرحلة 8)
Protect `main`، `SENTRY_DSN`، اعتماد محامٍ، `WAZEN_RLS_ENFORCE=1` بعد Staging.
