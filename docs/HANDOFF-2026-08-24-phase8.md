# Handoff — 24 أغسطس 2026 (مرحلة 8)

**الفرع:** `main`  
**المستودع:** https://github.com/ainoamn/WAZEN  
**الإنتاج:** https://wazen-roan.vercel.app · https://wazen.bhd-om.com  

المرجع السابق: [HANDOFF-2026-08-24-phase7.md](./HANDOFF-2026-08-24-phase7.md).

على الجهاز الآخر: `git pull origin main` ثم `npm install` إن لزم. لا ترفع ملفات `public/brand/*-with-bg.png`.

## المرحلة 8 — جاهزية الإطلاق

### Launch readiness
- `lib/launch-readiness.ts` يحسب درجة جاهزية + متطلبات ناقصة.
- `/api/health` (ops) يعيد `readiness`.
- لوحة الإدارة تعرض الجاهزية وآخر `job_runs`.
- `GET /api/platform?view=admin&scope=ops` لنفس البيانات.
- قائمة تشغيل: [LAUNCH-CHECKLIST.md](./LAUNCH-CHECKLIST.md).

### RLS
- تحذير `RLS_MISSING_USER_CONTEXT` عند `WAZEN_RLS_ENFORCE=1` بدون `runWithDbUser` (مرة لكل طلب).
- `WAZEN_RLS_DRY_RUN=1` يظهر في قائمة الجاهزية قبل تفعيل الإنفاذ.
- مسار `/api/platform` ملفوف بـ `runWithDbUser` بعد المصادقة.

### قانوني / مراقبة
- صفحات الخصوصية/الشروط/الأمان: نسخة `v0.2.0-legal` + قائمة اعتماد محامٍ.
- `WAZEN_LEGAL_COUNSEL_SIGNED=1` بعد التوقيع الخارجي.
- أخطاء 5xx كانت تُرسل إلى Sentry عبر `errorResponse` (بدون تغيير سلوك).

### اختبارات
- `tests/phase8-platform.test.mjs` ضمن `npm run test:backend`.

### إعدادات إضافية
```
WAZEN_RLS_DRY_RUN=1
WAZEN_RLS_ENFORCE=0
WAZEN_LEGAL_COUNSEL_SIGNED=0
SENTRY_DSN=
```

### ما يبقى خارج المستودع (يدوي)
1. Protect `main` + Required check `verify`.  
2. ضبط `SENTRY_DSN` في Vercel.  
3. اعتماد محامٍ ثم `WAZEN_LEGAL_COUNSEL_SIGNED=1`.  
4. تفعيل `WAZEN_RLS_ENFORCE=1` بعد Staging ناجح.
