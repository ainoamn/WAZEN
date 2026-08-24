# Handoff — 24 أغسطس 2026 (مرحلة 7)

**الفرع:** `main`  
**المستودع:** https://github.com/ainoamn/WAZEN  
**الإنتاج:** https://wazen-roan.vercel.app · https://wazen.bhd-om.com  

المرجع السابق: [HANDOFF-2026-08-24-phase6.md](./HANDOFF-2026-08-24-phase6.md).

على الجهاز الآخر: `git pull origin main` ثم `npm install` إن لزم. لا ترفع ملفات `public/brand/*-with-bg.png`.

## المرحلة 7 — تشغيل آلي، عمان نت، ops

### جدولة المهام (Vercel Cron)
- `vercel.json` → cron كل 5 دقائق على `/api/jobs/tick`.
- `GET|POST /api/jobs/tick` يقبل `Authorization: Bearer $WAZEN_JOB_SECRET` أو `Bearer $CRON_SECRET`.
- الافتراضي: تصريف البريد + Web Push؛ الصيانة (`maintenance`) الساعة 02:00 UTC أو عبر `?tasks=maintenance`.
- المسارات الفردية ما زالت تعمل: `/api/jobs/email` · `/api/jobs/push` · `/api/jobs/maintenance`.
- جدول `job_runs` (`SCHEMA_VERSION = 18`) لتسجيل آخر التشغيلات.

### عمان نت
- `WAZEN_OMANNET_API_KEY` + `WAZEN_OMANNET_CHECKOUT_URL` (middleware يُرجع `checkoutUrl`).
- `WAZEN_CHECKOUT_PROVIDER=thawani|omannet|manual|auto` لاختيار المزود.
- Webhook: `POST /api/webhooks/payment/omannet`.

### CI / النشر (يدوي في لوحة GitHub/Vercel)
1. GitHub → Settings → Branches → Protect `main` → Require status checks → اختر `verify`.
2. Vercel → Project → Git → Ignored Build Step أو «Deploy only after checks pass» إن وُجد.
3. في Vercel عيّن `CRON_SECRET` (يولَّد تلقائياً غالباً) و`WAZEN_JOB_SECRET`.

### اختبارات
- `tests/phase7-platform.test.mjs` ضمن `npm run test:backend`.

### إعدادات بيئة إضافية
```
CRON_SECRET=
WAZEN_CHECKOUT_PROVIDER=auto
WAZEN_OMANNET_API_KEY=
WAZEN_OMANNET_CHECKOUT_URL=https://payments.example/omannet/session
WAZEN_OMANNET_WEBHOOK_SECRET=
```

### ما يبقى خارج المستودع
- ~~اعتماد قانوني نهائي للنصوص~~ → قائمة اعتماد في الصفحات القانونية + علم `WAZEN_LEGAL_COUNSEL_SIGNED` (التوقيع نفسه يدوي).
- تفعيل حماية الفرع وRequired checks يدوياً (لا يمكن من الكود وحده).
- ضبط `SENTRY_DSN` و`WAZEN_RLS_ENFORCE=1` بعد اختبار Staging — أدوات الجاهزية في مرحلة 8.
