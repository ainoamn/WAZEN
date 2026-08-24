# Handoff — 24 أغسطس 2026 (مرحلة 10)

**الفرع:** `main`  
**المستودع:** https://github.com/ainoamn/WAZEN  
**الإنتاج:** https://wazen-roan.vercel.app · https://wazen.bhd-om.com  

المرجع السابق: [HANDOFF-2026-08-24-phase9.md](./HANDOFF-2026-08-24-phase9.md).

على الجهاز الآخر: `git pull origin main` ثم `npm install` إن لزم. لا ترفع ملفات `public/brand/*-with-bg.png`.

## المرحلة 10 — خصوصية + دعوات API

### تنفيذ طلبات الخصوصية
- `lib/privacy-requests.ts`: يعالج `data_requests` المعلّقة.
  - **تصدير:** يبني JSON ويخزّنه في `privacy_artifacts` (صلاحية 7 أيام) + بريد `privacy_export_ready`.
  - **إغلاق حساب:** يلغي الجلسات ومفاتيح API ويضع `customer_profiles.status=closed` مع الاحتفاظ بالسجلات المالية.
- `SCHEMA_VERSION = 20`: جدول `privacy_artifacts` + عمود `artifact_id` على `data_requests`.
- `/api/jobs/tick` الساعة **03:00 UTC** أو `?tasks=privacy`.
- واجهة الإعدادات: طلب تصدير/إغلاق + تنزيل التصدير الجاهز.
- `GET /api/platform?view=privacyRequests` و `privacyExport&requestId=`.

### Business API
- `POST /api/v1/spaces/{spaceId}/invites` — دعوة بالبريد (نطاق `members:write`)، مذكورة في `/developers`.

### اختبارات
- `tests/phase10-platform.test.mjs`.

### ما يبقى يدوياً
Protect `main`، `SENTRY_DSN`، اعتماد محامٍ، `WAZEN_RLS_ENFORCE=1` بعد Staging، مفاتيح PSP حية.
