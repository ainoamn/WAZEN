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
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
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

## النطاق المخصص و`ERR_TIMED_OUT` من عُمان

التطبيق على Vercel يعمل. إذا ظهر في Chrome «لا يمكن الوصول» / `ERR_TIMED_OUT` على `https://wazen.bhd-om.com` بينما `https://wazen-roan.vercel.app` يفتح، فالمشكلة **ليست الكود**. نطاق Vercel المخصص يُحل إلى العناوين `216.198.79.1` و`64.29.17.1`، وبعض شبكات عُمان (مثل Omantel) لا تصل إليها. عنوان `*.vercel.app` يستخدم `.195` فيصل.

في Hostinger → DNS لسجل `wazen` (CNAME):

- القيمة الحالية الشائعة: `5adf9afd8bf28722.vercel-dns-017.com`
- غيّرها إلى: `cname.vercel-dns.com`

احفظ، انتظر حتى دقيقة TTL (غالباً 5 دقائق)، ثم من Windows: `ipconfig /flushdns` وأعد فتح الصفحة. لا تحذف النطاق من لوحة Vercel.

للتأكد فوراً بدون تغيير DNS: افتح `https://wazen-roan.vercel.app`. تسجيل جوجل يبقى مربوطاً بالنطاق المخصص بعد إصلاح الـ CNAME.

## تسجيل الدخول عبر جوجل

وازن يستخدم نفس أسلوب **حسابي**: زر Google Identity Services يعطي `id_token`، والخادم يتحقق منه دون `GOOGLE_CLIENT_SECRET`. لهذا يعمل حسابي دون سر عميل.

1. [Clients](https://console.cloud.google.com/auth/clients) → عميل Web (One BHD).
2. **Authorized JavaScript origins** يجب أن تتضمن:
   `https://wazen.bhd-om.com`
3. لا حاجة لسر جديد للزر. المعرّف العام (نفس حسابي):
   `162957418455-d734efb8n4oe0ba5e664583a255ks50t.apps.googleusercontent.com`
4. اختياري في Vercel: `GOOGLE_CLIENT_ID` بنفس القيمة. إن تُرك فارغاً يستخدم وازن نفس معرّف حسابي.
5. `WAZEN_APP_ORIGIN=https://wazen.bhd-om.com`
6. إن كان التطبيق Testing: أضف البريد في Audience.
7. **Redeploy** ثم اختبر على `https://wazen.bhd-om.com/login`.

مسار الإرجاع القديم (`/api/auth/google/callback`) يبقى احتياطياً ويتطلب سراً صحيحاً إن استُخدم. الزر في `/login` لم يعد يمر به.

## حساب BHD الموحّد (SSO)

المواصفة: [BHD-IDENTITY-SSO.md](./BHD-IDENTITY-SSO.md) (نسخة من ONE-BHD بلا تعديل القيم المجمّدة). **الدليل المرجعي الكامل:** [BHD-UNIFIED-LOGIN-AND-APPS.md](./BHD-UNIFIED-LOGIN-AND-APPS.md) (القسم 12.2 — سجل وازن).

`/login` وزر **تسجيل الدخول** يحوّلان إلى `GET /api/auth/bhd/start`. إن قبلت الهوية `redirect_uri` يفتح المتصفح بوابة المجموعة (`one-bhd.vercel.app`) بنفس شاشة الدخول: بريد أو جوجل هناك، ثم يعود وازن بجلسة `__Host-wazen_session`. جوجل لا يظهر على وازن بعد الربط.

إن رفضت الهوية النطاق (حالياً `wazen-roan.vercel.app` غير مسجّل على `bhd-wazen`) يبقى النموذج المحلي `/login?local=1` بدل صفحة 400. بعد نجاح النموذج المحلي تُفتح الوجهة بتحميل كامل (`location.assign`).

إذا عاد المستخدم من BHD إلى `/home` وبقيت صفحة الشعار فقط، فتحقق من سياسة `Content-Security-Policy` على الصفحات المحمية: Next قد يحتاج inline bootstrapping scripts حتى يكتمل hydration. الإصدار الحالي من `proxy.ts` يسمح بـ `script-src 'self' https://accounts.google.com 'unsafe-inline'` حتى لا تتعطل `/home` بعد SSO رغم نجاح إنشاء الجلسة.

العملاء من الطرف الأول (`bhd-wazen`) يُكملون PKCE **بدون** `client_secret`. authorize/end-session الافتراضي: `https://id.bhd-om.com` (القسم 4.4). إن تعذّر الوصول من شبكة معيّنة اضبط `BHD_IDENTITY_ENDPOINT=https://one-bhd.vercel.app`. token/userinfo/JWKS تبقى على الـ Issuer عبر `identityApiBase()` ما لم يُضبط `BHD_IDENTITY_API_ENDPOINT`.

**إلزامي على مشروع الهوية `one-bhd`** في `BHD-Complete-Brand-and-Portal-v1.1.0/app/lib/identity/clients.ts` (ومثله في v1.1.1) لعميل `bhd-wazen`:

```ts
"https://wazen-roan.vercel.app/api/auth/bhd/callback",
```

وفي `postLogoutRedirectUris`:

```ts
"https://wazen-roan.vercel.app/",
```

بدون هذين السطرين الهوية ترفض `redirect_uri` من نطاق Vercel بـ `unauthorized_client`. أعد نشر `one-bhd` بعد الدمج.

على مشروع وازن (اختياري):

```text
BHD_IDENTITY_ISSUER=https://id.bhd-om.com
# BHD_IDENTITY_ENDPOINT=https://one-bhd.vercel.app
# BHD_IDENTITY_API_ENDPOINT=https://id.bhd-om.com
BHD_OAUTH_CLIENT_ID=bhd-wazen
# اختياري إن وُجد السر على الهوية:
# BHD_OAUTH_CLIENT_SECRET=
# لا تضبط BHD_OAUTH_REDIRECT_URI على نطاق مختلف عن صفحة المستخدم
# BHD_IDENTITY_TOKEN_SECRET=  # يجب أن يطابق IDENTITY_TOKEN_SECRET في الهوية؛ إن اختلف أو قَدُم يُستخدم /oauth/userinfo تلقائياً
```

لا ترفع الأسرار إلى Git. لا تشارك `DATABASE_URL` مع الهوية.

### دخول الأدمن وفيسبوك الهوية (§0.7 / §4.9)

- رابط الفوتر `/api/auth/admin-entry` يحوّل إلى `/api/auth/bhd/start?returnTo=/admin` (أبداً `?local=1`). الأدمن صلاحية محلية في `platform_roles` لنفس `bhd_sub` فقط.
- على أصول SSO: `/login` و`/register` يحوّلان إلى الهوية؛ `local=1` نحو `/admin` يُعاد توجيهه إلى `admin-entry`.
- رسالة فيسبوك «التطبيق غير نشط» تُعالَج في لوحة Meta لتطبيق **ONE-BHD / الهوية** (Live أو Testers)، وليست متغير بيئة في وازن.

## البريد والدعوات

الدعوات تُكتب في طابور `email_outbox`. اربط مزود البريد عبر Webhook:

```text
WAZEN_EMAIL_WEBHOOK_URL=https://provider.example/send-template
WAZEN_EMAIL_WEBHOOK_TOKEN=...
WAZEN_EMAIL_PROVIDER_HOSTS=provider.example
WAZEN_PAYMENT_PROVIDER_HOSTS=api.payment-provider.example
```

شغّل `POST /api/jobs/email` كل دقيقة و`POST /api/jobs/maintenance` يومياً مع `Authorization: Bearer WAZEN_JOB_SECRET`. يستقبل مزود البريد `{ to, template, data }`. مهمة الصيانة أيضاً تنقل المحافظ منتهية مهلة الـ 15 يوماً إلى أرشيف الإدارة لمدة 60 يوماً ثم تصفّي الأرشيف المنتهي.

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

ربط GitHub بمشروع Vercel ينشر كل دفع إلى `main` تلقائياً. العميل يقرأ `buildId` من `/api/health` كل 60 ثانية ويعيد التحميل عند تغيّر النشر، دون زر تحديث في المتصفح. بيانات اللوحة تُزامَن عبر `/api/dashboard?view=revision` كل 12 ثانية عندما تكون الصفحة ظاهرة (طلب خفيف بلا عدّ حصص).

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
