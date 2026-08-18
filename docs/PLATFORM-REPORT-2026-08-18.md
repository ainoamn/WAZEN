# وازن | تقرير المنصة الشامل

**التاريخ:** 18 أغسطس 2026  
**المنتج:** وازن | WAZEN (`wazen-finance` الإصدار 0.2.0)  
**المستودع:** https://github.com/ainoamn/WAZEN  
**الفرع المعتمد:** `main`  
**النطاق الإنتاجي:** https://wazen.bhd-om.com  
**نشر Vercel:** https://wazen-roan.vercel.app  

هذه الوثيقة تصف **ما هو الموقع**، **بماذا بُني**، **كيف يعمل**، **ما الذي يرتبط به**، و**علاقته ببقية برامج المجموعة**. هي مرجع الحالة الحالية بعد دمج الطلبات حتى [#43](https://github.com/ainoamn/WAZEN/pull/43).

الفكرة المحاسبية للمنتج (فصل الصندوق المشترك عن فائض العضو) تبقى في [PRODUCT-FOUNDATION.md](./PRODUCT-FOUNDATION.md). تشغيل الإنتاج في [PRODUCTION-DEPLOYMENT.md](./PRODUCTION-DEPLOYMENT.md). الأمان في [SECURITY.md](../SECURITY.md).

---

## 1. ما هو وازن؟

وازن منصة ويب عربية (مع واجهة إنجليزية) لإدارة الأموال **الشخصية والمشتركة** دون أن تكون بنكاً أو حافظاً لأموال العملاء. تسجّل الأرصدة والالتزامات والمستندات داخل حساب المستخدم، ولا تحتفظ بأرصدة نقدية حقيقية نيابة عنه.

تغطي المنصة أربعة منتجات فوق محرك مالي واحد:

| المنتج | الغرض |
|--------|--------|
| المحفظة الشخصية | دخل ومصروف وأهداف وحسابات بنكية شخصية |
| المنزل والعائلة | ميزانية بيت ومصروف مشترك |
| الرحلات | ميزانية سفر، من دفع، تسوية بين الأعضاء |
| الجمعيات والمجموعات | مساهمات دورية، أدوار، قرعة، فائض شخصي محمي |

فوق ذلك طبقة **SaaS تجارية**: باقات، فوترة، كوبونات، مستندات/إيصالات، ولوحة إدارة للمنصة.

جملة المنتج: ليست محفظة واحدة، بل نظام يفصل بين أموال المجموعة، التزامات الأعضاء، فائض كل عضو لدى المجموعة، والمال الشخصي خارج المجموعات.

---

## 2. مجموعة البرامج المرتبطة (BHD)

وازن ليس برنامجاً معزولاً. يعمل ضمن عائلة منتجات **BHD — Build Higher Dreams** على النطاق `bhd-om.com` وحسابات Google Cloud / Vercel لنفس المالك.

| البرنامج | العنوان / المستودع | العلاقة بوازن |
|----------|---------------------|----------------|
| **BHD** | `bhd-om.com`، مشروع Vercel باسم BHD | الهوية المؤسسية والنطاق الأب. النطاق المصرّح في Google هو `bhd-om.com`. |
| **وازن** | `wazen.bhd-om.com` · `ainoamn/WAZEN` · مشروع Vercel `wazen` | هذا المستودع. المنتج المالي الرئيسي للتطوير الحالي. |
| **حسابي (Hisaby)** | `hisaby.pro` / `www.hisaby.pro` · `bhd-pro.vercel.app` | منتج شقيق. عميل OAuth «One BHD» وُلد لحسابي ثم أُضيف إليه نطاق وازن. **لا يُعاد استخدام عميل محذوف**؛ السر والمعرّف يُضبطان في Vercel لوازن. |
| **رِفد (RIFD)** | فرع Git `archive/rifd` | نموذج واجهات سابق (هوية عُمانية). أُرشف عمداً. ليس منصة إنتاج. |
| **نَسَب (Nasab)** | ظهر النطاق `nasab-mu.vercel.app` في Google Auth | مشروع مرتبط بنفس حساب Google Cloud `byfpro`. **ليس جزءاً من كود وازن**. |

**قاعدة تشغيل مهمة:** كل منتج له أصل تطبيق (`WAZEN_APP_ORIGIN`) وعناوين إرجاع OAuth خاصة. خلط عنوانين في متغير واحد أو إعادة استخدام عميل محذوف يعطّل تسجيل جوجل.

DNS للنطاق المخصص: سجل CNAME في Hostinger لـ `wazen.bhd-om.com` يشير إلى Vercel.

---

## 3. كيف بُني النظام (التاريخ المختصر)

1. **رِفد** بدأ كنموذج واجهات (commits الأولى في المستودع نفسه).
2. اعتُمد **وازن** كمنصة رئيسية على `main`، وأُرشفت رِفد على `archive/rifd`.
3. أُضيفت طبقة تجارية (باقات، فواتير، إدارة) ثم حماية v0.2.0 (جلسات، CSRF، تشفير، معدل طلبات).
4. نُقل تخزين الإنتاج إلى **Neon Postgres** مع مترجم SQL من لهجة SQLite.
5. فُرضت الباقة من `/admin/plans` على الواجهة وواجهة البرمجة، مع حصص يومية/شهرية ومطبوعات.
6. أُضيفت جلسة واحدة لكل متصفح، مهلة سكون 10 دقائق، تنبيهات إدارة وحظر IP ساعتين.
7. أُضيف تسجيل الدخول عبر **جوجل** (OAuth + PKCE) على النطاق المخصص، مع إصلاحات الإرجاع والكعكة حتى [#41](https://github.com/ainoamn/WAZEN/pull/41).

التطوير الحالي: فروع `cursor/<اسم>-b4f9`، طلبات دمج عبر GitHub، والنشر التلقائي من `main` إلى Vercel.

---

## 4. التقنيات المستخدمة

### 4.1 التطبيق

| الطبقة | التقنية | ملاحظة |
|--------|---------|--------|
| الإطار | **Next.js 16.3** (App Router) | بدون `output: standalone` على Vercel |
| الواجهة | **React 19** | صفحات عميل للوحات الثقيلة |
| اللغة | **TypeScript 5.9** | `npm run typecheck` |
| التنسيق | **Tailwind CSS 4** + `app/commercial.css` | عربي RTL افتراضي |
| الخطوط | IBM Plex Sans Arabic + Inter | من `next/font/google` |
| الأيقونات | lucide-react | |
| التحقق | **zod** | مدخلات API |
| ORM / مخطط | **drizzle-orm** (تعريف SQLite) | التشغيل الفعلي عبر `db/runtime.ts` |
| PDF / طباعة | html2canvas + jspdf + نافذة طباعة HTML | كشوف A4 عرضي للجداول العريضة |

### 4.2 التشغيل والبيانات

| الخدمة | الدور |
|--------|--------|
| **Vercel** | استضافة السيرفرليس، المنطقة `iad1`، ربط Git بـ `main` |
| **Neon Postgres** | قاعدة الإنتاج عبر `DATABASE_URL` |
| **Turso/libSQL** | خيار قديم اختياري |
| SQLite المحلي | تطوير فقط (`WAZEN_USE_NODE_SQLITE=1`) — ممنوع في الإنتاج |
| **Google Auth Platform** | تسجيل الدخول (`accounts.google.com` + userinfo) |
| **Hostinger DNS** | `wazen.bhd-om.com` → Vercel |
| GitHub | المصدر والطلبات والـ CI اليدوي عبر `npm test` |

محوّل SQL: `db/sql-translate.ts` يحوّل أوامر SQLite (`?`، `COLLATE NOCASE`، `IS ?`) إلى Postgres عند استخدام Neon.

المخطط التشغيلي: `SCHEMA_VERSION = 12` في `db/runtime.ts` (يُنشأ/يُرقَّى عند أول طلب). ملفات `drizzle/*.sql` توثّق الهجرات من النواة حتى `oauth_identities`.

### 4.3 الاختبارات والأدوات

- `npm run test:backend` — منطق مالي، أمان، باقات، جلسات، جوجل
- `npm run test:frontend` — فحوصات أمان الواجهة
- `npm run test:e2e` — مسار تكاملي محلي
- ESLint موجود لكن ما زال يفشل على ملفات أقدم (jsx-a11y / react-hooks)؛ لا يُرفع ESLint إلى 10 في هذا المسار

Node المطلوب: `22.x`.

---

## 5. كيف يعمل الطلب الواحد

```text
المتصفح (wazen.bhd-om.com)
    │
    ├─ صفحات تسويقية/قانونية: React Server Components
    ├─ /login /register: إن وُجدت جلسة → تحويل من الخادم إلى /home
    ├─ /home و /dashboard بلا جلسة → تحويل فوري إلى /login (لا شاشة خطأ)
    ├─ تنقّل الحساب: Link + كاش صفحة (لا إعادة تحميل ولا شعار كامل)
    ├─ /home و /dashboard بعد الدخول: عميل يحمل GET /api/dashboard
    ├─ /admin/*: بوابة صلاحيات ثم GET/POST /api/platform
    │
    ▼
proxy.ts (Next.js 16)
    • تحويل /login إن وُجدت كعكة جلسة
    • تحويل /home و /dashboard للزائر بلا جلسة
    • حماية /admin للزائر بلا جلسة
    • CSP مع nonce لكل طلب
    │
    ▼
مسارات app/api/*
    • rate limit + حظر IP
    • authenticateRequest (كعكة جلسة أو مفتاح API)
    • CSRF على الطفرات
    • صلاحيات المستأجر/المحفظة/الباقة
    • كتابة مزدوجة القيد للحركات المالية الجديدة
    │
    ▼
Neon (أو Turso / SQLite محلي)
```

الكعكات في الإنتاج:

| الاسم | الوظيفة |
|--------|----------|
| `__Host-wazen_session` | الجلسة (HttpOnly، تُحذف عند إغلاق المتصفح) |
| `__Host-wazen_csrf` | رمز CSRF |
| `wazen_browser` | معرّف ثابت لجهاز/ملف المتصفح |
| `wazen_oauth` | nonce قصير أثناء تدفق جوجل (10 دقائق) |

مهلة السكون: **10 دقائق** بلا نشاط. الحد الأقصى لعمر الجلسة: 12 ساعة. جلسة واحدة لكل `browser_id`: تسجيل دخول جديد يلغي جلسات نفس المتصفح. التبويبات تتزامن عبر `BroadcastChannel`.

---

## 6. الصفحات

| المسار | الوظيفة |
|--------|----------|
| `/` | الصفحة التسويقية |
| `/about` `/privacy` `/terms` `/security` | الثقة والهوية |
| `/login` `/register` | بريد+كلمة مرور أو جوجل |
| `/forgot-password` `/reset-password` `/verify-email` | استعادة وتأكيد البريد |
| `/invite` | قبول دعوة محفظة |
| `/home` | الرئيسية بعد الدخول |
| `/dashboard` | لوحة المحافظ والعمليات |
| `/pricing` | اختيار الباقة والدفع |
| `/billing` | فواتير واشتراك العميل |
| `/documents` | إيصالات وكشوف |
| `/account/security` | كلمة المرور، الجلسات، TOTP |
| `/admin` | نظرة عامة وتنبيهات |
| `/admin/users` `/admin/users/[id]` | العملاء، تواريخ الباقة، سجل IP |
| `/admin/plans` | مصفوفة الباقات والحدود |
| `/admin/payments` `/admin/gateways` | المدفوعات والبوابات |
| `/admin/tenants` `/admin/staff` `/admin/reports` | المستأجرون والطاقم والتقارير |
| `/admin/setup` | تهيئة المالك الأول |

اللغة الافتراضية عربية (`dir=rtl`). زر EN/عربي في النماذج التجارية.

---

## 7. واجهات البرمجة

عدد المسارات قليل عمداً: معظم الأفعال تمر عبر `action` داخل لوحتين.

| المسار | الوظيفة |
|--------|----------|
| `GET /api/health` | جاهزية القاعدة والإصدار. تفاصيل التشغيل تتطلب `WAZEN_JOB_SECRET` |
| `GET/POST /api/auth` | الجلسة، تسجيل الدخول/الخروج، التسجيل، TOTP، استعادة البريد |
| `GET /api/auth/google` | بدء OAuth (صفحة HTML قصيرة ثم تحويل إلى Google) |
| `GET /api/auth/google/callback` | استبدال الرمز، إنشاء/ربط المستخدم، ضبط الجلسة |
| `GET/POST /api/dashboard` | المحافظ، الأعضاء، الحركات، الطباعة، الحصص |
| `GET/POST /api/platform` | الباقات، الفوترة، المستندات، إدارة المنصة |
| `POST /api/webhooks/payment` | إشعار مزود الدفع (HMAC + idempotency) |
| `POST /api/jobs/email` | إرسال طابور `email_outbox` |
| `POST /api/jobs/maintenance` | صيانة، أرشفة مهلة الباقة، تنظيف |

المصادقة: كعكة جلسة أو `Authorization: Bearer wzn_...` (مفتاح API مُجزّأ الصلاحيات).

أخطاء شائعة للباقة: `PLAN_FEATURE_REQUIRED`، `PLAN_DAILY_TRANSACTION_LIMIT`، `PLAN_MONTHLY_TRANSACTION_LIMIT`، `PLAN_PRINT_LIMIT`، `PLAN_USER_LIMIT`.

---

## 8. المحرك المالي والبيانات

الأموال تُخزَّن بوحدات صغرى صحيحة (`*_minor`) حسب دقة العملة (OMR ثلاث خانات، SAR/AED خانتان). المنطق في `lib/finance.ts` و`lib/money.ts`.

قواعد المنتج في الكود:

- المساهمة الإلزامية ترفع صندوق المحفظة (`spaces.balance_minor`)
- الفائض الشخصي (`allocation = personal_reserve`) يزيد `members.extra_minor` ولا يدخل ملكية الجمعية
- الحركات الجديدة تُقيَّد قيدين (مدين/دائن) عند تفعيل دفتر اليومية
- القرعة في الجمعيات حتمية من بذرة تُهشَّش؛ لا تُحفظ البذرة الخام

أنواع المحافظ الأساسية: `personal`، `household`، `trip`، `society` / `group`.

الجداول المحورية (ليست قائمة كاملة): `users`، `spaces`، `members`، `transactions`، `journal_entries`، `plans`، `subscriptions`، `invoices`، `payments`، `auth_sessions`، `oauth_identities`، `tenants`، `quota_events`، `security_events`، `blocked_ips`.

عزل البيانات: كل مستخدم له مستأجر افتراضي (`tenant:<userId>`). موارد المحافظ مربوطة بالمستأجر. الإدارة ترى عبر صلاحيات المنصة لا عبر اختلاط البيانات.

---

## 9. الباقات والحدود

تُضبط من `/admin/plans` وتُفرض فوراً على الواجهة وAPI.

| الباقة (البذور) | يومي | شهري | مطبوعات/شهر | مشاركة |
|-----------------|-----:|-----:|------------:|--------|
| البداية | 5 | 50 | 10 | — |
| العائلة | 20 | 300 | 50 | واتساب |
| الاحتراف | 80 | 2000 | 200 | بريد + واتساب + تنزيل |
| الأعمال | ∞ | ∞ | ∞ | بريد + واتساب + تنزيل |

`0` في حد رقمي = غير محدود. عند 80% يظهر تنبيه مع رابط `/pricing`.

تخفيض الباقة: البنود تبقى ظاهرة مع شارة **ترقية**؛ ما ليس في المصفوفة لا يُفتح ولا تُحمَّل بياناته. بعد التخفيض/الانتهاء: تنبيه **15 يوماً** للمستخدم ثم إخفاء من حسابه؛ أرشيف إداري **60 يوماً**.

الترقية بعد الدفع فوراً. التنزيل يبدأ اليوم التالي لانتهاء الفترة الحالية.

---

## 10. المصادقة وتسجيل جوجل

طرق الدخول: بريد + كلمة مرور (PBKDF2-SHA-256، 600000 تكرار)، وGoogle OAuth.

تدفق جوجل:

1. المستخدم يفتح `/login` على **https://wazen.bhd-om.com** فقط (ليس `vercel.app` إن كان الأصل مضبوطاً للنطاق المخصص).
2. `GET /api/auth/google` يضبط كعكة nonce ويربط الحالة بـ `wazen_browser`، ثم يحوّل إلى Google بـ PKCE.
3. Google يعود إلى `https://wazen.bhd-om.com/api/auth/google/callback`.
4. الخادم يتحقق من الحالة، يستبدل الرمز، يقرأ الملف الشخصي، ويرفض بريداً غير مؤكد.
5. يربط حساباً موجوداً بنفس البريد أو ينشئ حساباً جديداً في `oauth_identities`.

في Google Cloud يجب أن يحتوي عميل الويب على **Authorised redirect URIs** (ليس فقط JavaScript origins). إن كان التطبيق Testing يُضاف البريد كـ test user في Audience.

متغيرات Vercel: `GOOGLE_CLIENT_ID`، `GOOGLE_CLIENT_SECRET`، `WAZEN_APP_ORIGIN=https://wazen.bhd-om.com` (عنوان واحد). لا يُكتب السر في Git.

---

## 11. الأمان (الوضع الحالي)

لم يعد النظام يعتمد على demo auth في الإنتاج. الضوابط الفعلية:

- جلسات عشوائية 256-بت مخزّنة كـ SHA-256؛ كعكات `__Host-` في الإنتاج
- CSRF مربوط بالجلسة؛ منع إعادة استخدام خطوة TOTP
- أصل الطلب، حد حجم الجسم، معدل طلبات، Idempotency للطفرات
- حظر IP **ساعتان** (يدوي أو تلقائي) مع إمكانية الرفع من ملف المستخدم
- Webhook الدفع موقّع HMAC-SHA-256
- أسرار المزودين في ظرف AES-256-GCM مع حلقة مفاتيح قابلة للتدوير
- CSP لكل طلب، HSTS، منع الإطارات، COOP/CORP
- لا SQLite مؤقت على Vercel؛ أعلام التجربة تبقى 0 في Production

وازن **ينظّم سجلات مالية** ولا يحفظ أموال العملاء.

---

## 12. ما يرتبط بالموقع خارج الكود

```text
                    ┌──────────────┐
                    │   GitHub     │  ainoamn/WAZEN  main
                    └──────┬───────┘
                           │ نشر تلقائي
                    ┌──────▼───────┐
   Hostinger DNS    │    Vercel     │  مشروع wazen
   wazen.bhd-om.com │  Next.js 16   │  wazen-roan.vercel.app
                    └──────┬───────┘
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
     Neon Postgres    Google OAuth    وظائف مجدولة
     DATABASE_URL     client+secret   /api/jobs/*
                                      (بريد + صيانة)
           ▼
     طابور email_outbox ──► مزود بريد خارجي (Webhook)
     فواتير/مدفوعات  ◄── مزود دفع (HMAC webhook)
```

متغيرات الإنتاج الأساسية: `DATABASE_URL`، `WAZEN_APP_ORIGIN`، `WAZEN_ADMIN_EMAILS`، `WAZEN_JOB_SECRET`، `WAZEN_ENCRYPTION_KEYRING`، `WAZEN_PAYMENT_WEBHOOK_SECRET`، اختياري البريد وجوجل. القائمة الكاملة في `.env.example` و`docs/PRODUCTION-DEPLOYMENT.md`.

---

## 13. هيكل المستودع

| المسار | المحتوى |
|--------|----------|
| `app/` | الصفحات ومسارات API ومزودو الواجهة |
| `components/` | شعار، محفظة شخصية، منزل، أعضاء، تقارير |
| `lib/` | محرك مالي، مصادقة، باقات، طباعة، أمان، جوجل |
| `services/admin/` | فوترة، تنبيهات، مستخدمون، مستأجرون |
| `db/` | المخطط، Neon/Turso/SQLite، ترجمة SQL |
| `drizzle/` | هجرات موثّقة |
| `tests/` | وحدات وخلفية وواجهة وe2e |
| `scripts/` | تهيئة محلية، مدير، نشر إنتاج |
| `docs/` | تسليمات، تشغيل، أمان، هذا التقرير |
| `public/brand/` | شعار وأيقونات (لا تُرفع ملفات `*-with-bg.png`) |
| `proxy.ts` | حارس المسارات وCSP |

---

## 14. ما يعمل وما ينقص

**يعمل في الإنتاج الحالي (MVP تشغيلي):** حسابات وجلسات، محافظ حسب الباقة، حصص، إدارة، طباعة كشوف، نطاق مخصص، مسار جوجل في الكود (يحتاج عميل+سر صحيحين في Vercel واختبار بعد كل نشر).

**لم يكتمل للإطلاق المالي العام:** بوابة دفع حية مكتملة لكل الدول، تحقق Google OAuth خارج وضع الاختبار، مزود بريد إنتاجي مربوط، امتثال قانوني كامل، تطبيق جوال أصلي. المنصة **ليست** بنكاً مرخّصاً.

`DOCUMENTATION.md` ما زال يحتوي تقديرات نضج تاريخية (مثل demo auth). الحالة التشغيلية الحالية هي هذا التقرير + `HANDOFF-2026-08-18.md`.

---

## 15. طلبات الدمج ذات الصلة (حتى 18 أغسطس 2026)

[#10](https://github.com/ainoamn/WAZEN/pull/10)–[#16](https://github.com/ainoamn/WAZEN/pull/16) الباقات والحصص والإدارة · [#17](https://github.com/ainoamn/WAZEN/pull/17)–[#23](https://github.com/ainoamn/WAZEN/pull/23) الجلسة والطباعة والسكون · [#24](https://github.com/ainoamn/WAZEN/pull/24)–[#29](https://github.com/ainoamn/WAZEN/pull/29) تحميل الرئيسية والبناء والتنبيهات والطباعة · [#30](https://github.com/ainoamn/WAZEN/pull/30)–[#32](https://github.com/ainoamn/WAZEN/pull/32) جلسة المتصفح · [#33](https://github.com/ainoamn/WAZEN/pull/33)–[#42](https://github.com/ainoamn/WAZEN/pull/42) جوجل وإرجاعه وتوثيقه · [#43](https://github.com/ainoamn/WAZEN/pull/43) تقرير المنصة.

---

## 16. كيف تتابع العمل

```bash
git pull origin main
npm install
npm run typecheck
npm run test:backend
npm run dev
```

التسليم اليومي: [HANDOFF-2026-08-18.md](./HANDOFF-2026-08-18.md).  
النشر: اربط `main` بـ Vercel، اضبط أسرار Production، ثم اختبر على `https://wazen.bhd-om.com`.
