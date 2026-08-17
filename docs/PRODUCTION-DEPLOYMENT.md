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

يجب أن ينجح `/api/health` بعد النشر. في Production/Vercel يرفض النظام Demo وTrust-headers وNode SQLite حتى لو ضُبطت المتغيرات خطأً، ويعيد `503` من `/api/health` إذا وُجدت هذه المخاطر.

ربط GitHub بمشروع Vercel ينشر كل دفع إلى `main` تلقائياً. العميل يقرأ `buildId` من `/api/health` ويعيد التحميل عند تغيّر النشر، دون زر تحديث في المتصفح. بيانات اللوحة تُزامَن عبر `/api/dashboard?view=revision` كل 4 ثوانٍ عندما تكون الصفحة ظاهرة.

أضف مراقبة خارجية لـ `/api/health` وتنبيهاً لأخطاء الخادم وفشل Webhooks والبريد.

## تصفير آمن وتهيئة المدير

الخيار الموصى به: **قاعدة Turso إنتاجية جديدة** بدل حذف القاعدة الحالية.

```bash
# جرد فقط
npm run db:inventory

# dry-run (افتراضي)
npm run db:reset

# تنفيذ مدمّر — فقط بعد Backup وموافقة صريحة
# WAZEN_ENV_NAME=staging
# WAZEN_RESET_CONFIRM="RESET staging 2026-08-12"
# npm run db:reset -- --execute

# تهيئة مدير أول (رمز لمرة واحدة، بدون كلمة مرور في البيئة)
npm run admin:bootstrap -- --email owner@domain.com --name "Owner" --origin https://your-domain.com
# افتح الرابط المطبوع → /admin/setup?token=...
# ثم فعّل TOTP من /account/security فوراً
```

راجع التقرير المعتمد والخطة التنفيذية:

- `docs/WAZEN-DEVELOPMENT-RESET-ADMIN-PLAN-2026-08-12.md`
- `docs/EXECUTION-BACKLOG-2026-08-12.md`
- `docs/OPS-LOG-2026-08-12.md`

## النسخ الاحتياطي والاستعادة

- فعّل النسخ الاحتياطي والاستعادة الزمنية لدى مزود قاعدة البيانات.
- احتفظ بنسخة منفصلة ومشفرة وفق سياسة الاحتفاظ المحلية.
- اختبر الاستعادة في Staging كل ثلاثة أشهر.
- لا تستخدم بيانات الإنتاج للاختبار.
- قبل أي `db:reset --execute` يجب وجود Backup حديث وchecksum موثّق في سجل العمليات.

## قرارات مطلوبة قبل الإطلاق العام

- اختيار مزود دفع وبريد فعلي وتوقيع اتفاقيات معالجة البيانات.
- مراجعة الخصوصية والشروط بواسطة مستشار قانوني للدول المستهدفة.
- اعتماد سياسة الاسترداد والضرائب والفواتير.
- توفير عنوان دعم وأمن رسمي وخطة استجابة للحوادث.
