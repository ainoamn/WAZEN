# نشر وازن للإنتاج على Vercel

## قاعدة البيانات الدائمة

أنشئ قاعدة Turso/libSQL مستقلة للإنتاج وتوكن محدود الصلاحية، ثم أضف في Vercel:

```text
TURSO_DATABASE_URL=libsql://...
TURSO_AUTH_TOKEN=...
```

لن يعمل API على Vercel بلا قاعدة دائمة، عمداً. لم يعد النظام يعود إلى `/tmp/wazen.sqlite` لأن بياناته تُمسح عند إعادة تشغيل الدالة.

## الهوية والأسرار

أنشئ أسراراً عشوائية بطول 32 بايت أو أكثر:

```text
WAZEN_ADMIN_EMAILS=owner@your-domain.com
WAZEN_APP_ORIGIN=https://your-domain.com
WAZEN_PAYMENT_WEBHOOK_SECRET=...
WAZEN_JOB_SECRET=...
WAZEN_ENCRYPTION_KEYRING={"active":"v1","keys":{"v1":"<32-byte-base64>"}}
```

اترك القيم التالية معطلة في Production:

```text
WAZEN_DEMO_MODE=0
WAZEN_USE_NODE_SQLITE=0
WAZEN_TRUST_OAI_HEADERS=0
```

أنشئ حساب المالك بالبريد الموجود في `WAZEN_ADMIN_EMAILS`. لا يحصل أول مستخدم تلقائياً على الإدارة.

## البريد والدعوات

الدعوات تُكتب في طابور `email_outbox`. اربط مزود البريد عبر Webhook:

```text
WAZEN_EMAIL_WEBHOOK_URL=https://provider.example/send-template
WAZEN_EMAIL_WEBHOOK_TOKEN=...
WAZEN_EMAIL_PROVIDER_HOSTS=provider.example
WAZEN_PAYMENT_PROVIDER_HOSTS=api.payment-provider.example
```

شغّل `POST /api/jobs/email` كل دقيقة و`POST /api/jobs/maintenance` يومياً مع `Authorization: Bearer WAZEN_JOB_SECRET`. يستقبل مزود البريد `{ to, template, data }`.

## الدفع

اربط مزود الدفع بإرسال JSON إلى `/api/webhooks/payment`:

```json
{ "id": "provider-event-id", "paymentId": "wazen-payment-id", "status": "succeeded" }
```

ضع HMAC-SHA-256 للـ body الخام بصيغة hex في `x-wazen-signature`. واجهة الاشتراك تُنشئ فاتورة محلية، لكن Checkout المستضاف لدى مزود الدفع يجب إعداده قبل تحصيل أموال حقيقية.

## فحوص الإصدار

```bash
npm ci
npm run db:migrate
npm run typecheck
npm run test:full
npm run audit:prod
npm run build
```

يجب أن ينجح `/api/health` بعد النشر. أضف مراقبة خارجية له وتنبيهاً لأخطاء الخادم وفشل Webhooks والبريد.

## النسخ الاحتياطي والاستعادة

- فعّل النسخ الاحتياطي والاستعادة الزمنية لدى مزود قاعدة البيانات.
- احتفظ بنسخة منفصلة ومشفرة وفق سياسة الاحتفاظ المحلية.
- اختبر الاستعادة في Staging كل ثلاثة أشهر.
- لا تستخدم بيانات الإنتاج للاختبار.

## قرارات مطلوبة قبل الإطلاق العام

- اختيار مزود دفع وبريد فعلي وتوقيع اتفاقيات معالجة البيانات.
- مراجعة الخصوصية والشروط بواسطة مستشار قانوني للدول المستهدفة.
- اعتماد سياسة الاسترداد والضرائب والفواتير.
- توفير عنوان دعم وأمن رسمي وخطة استجابة للحوادث.
