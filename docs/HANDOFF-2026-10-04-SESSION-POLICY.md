# تسليم 4 أكتوبر 2026 — تطبيق سياسة جلسة BHD حرفياً

| | |
|--|--|
| **الطلب** | «طبّق حرفياً ما جاء في [`BHD-SESSION-POLICY.md`](https://github.com/ainoamn/ONE-BHD/blob/main/docs/BHD-SESSION-POLICY.md)» |
| **نسخة الوثيقة في وازن** | [`docs/BHD-SESSION-POLICY.md`](./BHD-SESSION-POLICY.md) (منسوخة حرفياً من ONE-BHD) |
| **Commit التنفيذ** | `bbb960d` — Apply BHD session policy: stay signed in until explicit logout |
| **الإنتاج** | https://wazen.bhd-om.com — `buildId` الحي: `bbb960d46870e49aa68a4c0d73c77eb167070a6b` |
| **الفرع** | `main` |

---

## القاعدة المطبّقة

المستخدم يبقى داخلاً **حتى يضغط «خروج»**. الخمول، إغلاق التبويب، إغلاق المتصفح، أو إعادة تشغيل الجهاز **لا تُسقط الجلسة**.

---

## ما الذي تغيّر (بنداً ببند حسب الوثيقة)

### 1) لا مهلة خمول
- حُذفت نافذة الخمول المنزلقة 48 ساعة من `lib/session-policy.ts` (`SESSION_IDLE_MS`، `isSessionIdle`، `idleCutoffIso`).
- حُذف `app/session-idle-guard.tsx` (كان يُخرج المستخدم بعد السكون).
- `lib/auth.ts` → `authenticateRequest`: لا حذف للجلسة بسبب السكون، ولا تمديد منزلق لـ `expires_at`. `last_seen_at` يُكتب للإحصاء فقط مرة كل 15 دقيقة كحد أقصى.
- `verifyCsrfToken` و`issueCsrfToken`: أُزيل شرط `last_seen_at > cutoff`.
- `lib/jobs-maintenance.ts`: تنظيف الجلسات عند `expires_at` فقط (لا حذف بسبب السكون).

### 2) لا `SessionKeepAlive`
- حُذف `components/auth/SessionKeepAlive.tsx` (كان يرسل نبضات إلى `/api/auth/me` عند النقر والكتابة والتركيز وعودة التبويب وكل 15 دقيقة).
- أُزيل من `app/providers.tsx` مع `SessionIdleGuard`.

### 3) `GET /api/auth/me` قراءة فقط
- `app/api/auth/me/route.ts`: يعيد JSON فقط، **بلا `Set-Cookie` إطلاقاً** (لا إصدار CSRF، لا مسح كوكي عند 401).
- `GET /api/auth` و`GET /api/dashboard` و`GET /api/platform`: لم تعد تمسح الكوكي عند 401، وكوكي CSRF تُكتب فقط إذا كانت مفقودة/تالفة (`issued.changed`).
- `proxy.ts`: لم يعد يعيد كتابة كوكي الجلسة في كل طلب صفحة.
- الكوكي تُكتب فقط عند **الدخول الصريح** (`createSession` → `sessionHeaders`) و**الخروج الصريح** (مسح).

### 4) لا `router.refresh()` / `location.reload()` عند عودة التبويب
- `app/browser-session-sync.tsx`: أُزيلت مستمعات `visibilitychange` و`focus`. يبقى فقط التزامن عند دخول/خروج صريح في تبويب آخر (BroadcastChannel).
- `lib/live-sync.ts` → `LiveBuildGuard`: لا يعيد تحميل الصفحة أبداً (يحدّث Service Worker في الخلفية فقط) ولا يستمع لعودة التبويب.
- `useLiveDashboard` يبقى: يجلب **بيانات** اللوحة عند العودة (ليس إعادة تحميل وليس تجديد جلسة ولا يكتب كوكي).

### 5) لا Google One Tap / `auto_select`
- حُذف `app/google-sign-in.tsx` (كان يحمّل سكربت GIS ويستدعي `prompt()` تلقائياً).
- أُزيل زر جوجل من `app/auth-form.tsx` و`googleClientId` من `app/login/page.tsx` و`app/register/page.tsx`.
- `GET /api/auth` يعيد `googleEnabled: false` دائماً.
- مسارات الخادم `/api/auth/google*` باقية لكن لا يصل إليها أي زر في المنتج.

### 6) لا تسخين مسبق لـ `/login` يحمّل GIS
- لا يوجد أي prefetch لـ `/login`، ولم يعد في صفحة الدخول أي سكربت جوجل.

---

## القيم المعتمدة الآن

| البند | القيمة في وازن |
|---|---|
| كوكي الجلسة | `__Host-wazen_session` — `Max-Age=34560000` (400 يوم) ثابتة |
| كوكي CSRF | `__Host-wazen_csrf` — 400 يوم، `SameSite=Strict`، مقروءة للعميل |
| `expires_at` في `auth_sessions` | `created_at + 400 يوم` (ثابت، غير منزلق) |
| HttpOnly / Secure / SameSite | نعم / نعم في الإنتاج / Lax |
| Domain | Host-only (لا `.bhd-om.com`) |
| كوكي `wazen_browser` | 400 يوم، تُكتب فقط إن كانت مفقودة |

---

## ماذا يحدث عند فتح المتصفح

1. كوكي المنتج صالحة → الصفحة تظهر كما هي، بلا إعادة تحميل.
2. جلسة المنتج منتهية و`bhd_id` قائمة على الهوية → تحويل صامت واحد إلى `/api/auth/bhd/start`.
3. بعد خروج موحّد → الكوكي ممسوحة وتظهر شاشة الدخول عبر الهوية.

**الجلسات القديمة (قبل هذا التحديث):** كوكيها القديمة «جلسة متصفح» فتنتهي عند إغلاق المتصفح مرة واحدة؛ بعدها تحويل صامت عبر `bhd/start` يمنح كوكي 400 يوم الجديدة، ومن ثم لا خروج إلا بالزر. قاعدة البيانات تمدّ `expires_at` القديمة إلى 400 يوم تلقائياً دون كتابة كوكي.

---

## الخروج

الطريق الوحيد: زر «خروج» → `POST` خروج المنتج → `https://id.bhd-om.com/oauth/end-session?...` → الهوية تمسح `bhd_id` والمنتج يمسح كوكيه. لا خروج صامت ولا بسبب خمول ولا بسبب فشل `/me`.

---

## الاختبارات والتحقق

- `tests/session-policy.test.mjs` أُعيدت كتابته: يتحقق من 400 يوم، HttpOnly، Lax، بلا Domain، عدم وجود `SessionKeepAlive`/`session-idle-guard`/`google-sign-in`، `/me` بلا `Set-Cookie`، `proxy.ts` بلا `Set-Cookie`، لا reload/refresh في `LiveBuildGuard`، ولا One Tap.
- `tests/frontend-security.test.mjs` و`tests/google-oauth.test.mjs` حُدّثت لتطابق السياسة.
- `npx tsc --noEmit` نظيف، `npm run build` ناجح، اختبارات الجلسة/الأمان/الهوية 38/38.
- فشلان قديمان غير مرتبطين (`phase8-platform`، `security.test.mjs:49` — `ERR_MODULE_NOT_FOUND` في `production-setup.ts`) موجودان قبل التغيير.
- على الإنتاج: `GET /api/auth/me` و`GET /api/auth` بلا جلسة يعيدان 401 **بلا أي `Set-Cookie`**.

---

## ملاحظات للدمج والاستكمال

- أثناء الرفع كان على `main` نحو 90 commit من الجهاز الآخر؛ تمّ rebase وحُلّت التعارضات مع الإبقاء على تغييراتهم (`dashboard/route.ts`، `auth-form.tsx`، `live-sync.ts`، `frontend-security.test.mjs`، `CONTINUE-HERE.md`).
- `components/members/contact-source-bar.tsx` (استيراد جهات الاتصال «من Gmail») كان يعتمد على تعريف `window.google` في الملف المحذوف؛ نُقل التعريف إليه. هذا الزر يحمّل سكربت جوجل **فقط عند ضغط المستخدم** ولجهات الاتصال لا للدخول. إن أُريد تطبيق «المنتجات لا تستدعي جوجل أصلاً» حرفياً فيجب إزالته أيضاً.
- Vercel CLI على هذا الجهاز غير مسجّل؛ النشر تمّ تلقائياً من `main` عبر تكامل Git.
- لا تُرفع `public/brand/*-with-bg.png`.

### اختبار القبول اليدوي (متبقٍ على المستخدم)
1. ادخل → أغلق التبويب ساعة → افتح: ما زلت داخلاً بلا وميض ولا جوجل.
2. أغلق المتصفح كلياً ثم افتحه: داخل بلا طلب دخول.
3. اضغط «خروج»: تُطلب شاشة الدخول في المرة التالية.
4. من منتج BHD آخر: تنقّل صامت بلا كلمة مرور.

---

## للوكيل على الجهاز الثاني

> لا تُعِد مهلة خمول ولا `SessionKeepAlive` ولا كتابة كوكي في `GET /api/auth/me` ولا Google One Tap ولا `reload` عند عودة التبويب. المرجع: `docs/BHD-SESSION-POLICY.md`.
