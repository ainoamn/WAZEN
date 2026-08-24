# Handoff — 24 أغسطس 2026 (مرحلة 6)

**الفرع:** `main`  
**المستودع:** https://github.com/ainoamn/WAZEN  
**الإنتاج:** https://wazen-roan.vercel.app · https://wazen.bhd-om.com  

المرجع السابق: [HANDOFF-2026-08-24-phase5.md](./HANDOFF-2026-08-24-phase5.md).

على الجهاز الآخر: `git pull origin main` ثم `npm install` إن لزم. لا ترفع ملفات `public/brand/*-with-bg.png`.

## المرحلة 6 — دفع حي، كتابة API، إرسال Push

### إرسال Web Push من الخادم
- جدول `push_outbox` (`SCHEMA_VERSION = 17`).
- تنبيهات `warning`/`danger` تُدرج في الصندوق مع منع التكرار.
- `lib/web-push.ts` يرسل عبر مكتبة `web-push` عند ضبط `WAZEN_VAPID_*`.
- مهمة: `POST /api/jobs/push` مع `Authorization: Bearer $WAZEN_JOB_SECRET`.

### Business API — كتابة
- `POST /api/v1/spaces/{spaceId}/transactions`
- يدعم `income` / `expense` / `contribution` مع Idempotency-Key ونطاق `wallets:write`.
- توثيق محدّث في `/developers`.

### مزود دفع (ثواني)
- `lib/payment-checkout.ts`: جلسة checkout عند وجود مفاتيح ثواني؛ وإلا التحويل اليدوي كما قبل.
- اختيار الباقة يعيد `checkout`؛ الواجهة تحوّل إلى رابط الدفع عند `mode=redirect`.
- Webhook: `POST /api/webhooks/payment/thawani` يعيد استخدام `applyPaymentWebhook`.

### اختبارات
- `tests/phase6-platform.test.mjs` ضمن `npm run test:backend`.

### إعدادات بيئة اختيارية
```
WAZEN_VAPID_PUBLIC_KEY=
WAZEN_VAPID_PRIVATE_KEY=
WAZEN_VAPID_SUBJECT=mailto:support@your-domain.example
WAZEN_THAWANI_SECRET_KEY=
WAZEN_THAWANI_PUBLISHABLE_KEY=
WAZEN_THAWANI_API_BASE=https://checkout.thawani.om/api/v1
WAZEN_THAWANI_WEBHOOK_SECRET=
WAZEN_PAYMENT_PROVIDER_HOSTS=checkout.thawani.om,uatcheckout.thawani.om
```

### ما يبقى لاحقاً
- ~~جدولة cron لـ `/api/jobs/push` و`/api/jobs/email`~~ → مرحلة 7 (`/api/jobs/tick` + vercel.json).
- ~~عمان نت~~ → مرحلة 7.
- اعتماد قانوني نهائي + Required CI على GitHub/Vercel (خطوات يدوية موثّقة في مرحلة 7).
