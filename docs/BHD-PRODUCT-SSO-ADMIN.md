# دليل تنفيذ المنتج — SSO صامت وأدمن محلي

> **الحالة:** معتمد للتطبيق في كل مستودع منتج.  
> **المصدر:** [BHD-UNIFIED-LOGIN-AND-APPS.md](BHD-UNIFIED-LOGIN-AND-APPS.md) القسم **0.7** و**4.9**  
> **Issuer:** `https://id.bhd-om.com`  
> **لا تغيّر هذه القواعد محلياً.**

انسخ هذا الملف إلى `docs/BHD-PRODUCT-SSO-ADMIN.md` داخل مستودع المنتج ونفّذه حرفياً.

---

## 1. الخلاصة التقنية (الأنسب والآمن)

| الطبقة | ماذا تفعل | أين |
|---|---|---|
| الهوية | من أنت (حساب واحد) | `id.bhd-om.com` فقط |
| جلسة التنقّل | كوكي `bhd_id` → SSO بلا كلمة مرور | `start` → `authorize` → `callback` |
| صلاحية الأدمن | ماذا يحق لك داخل **هذا** المنتج | جدول الدور المحلي مربوط بـ `bhd_sub` |

**ممنوع:** مفتاح أدمن واحد من الهوية يفتح كل المنتجات.  
**مسموح:** نفس البريد يُعيَّن أدمن في وازن **وفي** نَسَب بقرار منفصل في كل قاعدة.

أدمن منصة الهوية (`BHD_PLATFORM_ADMIN_EMAILS`) يخص `https://id.bhd-om.com/admin` فقط.

---

## 2. لماذا يظهر العطل عندك

| العرض | السبب | الإصلاح هنا |
|---|---|---|
| لوحة تسجيل قديمة | دخول محلي / جوجل محلي | غلاف → `/api/auth/bhd/start` فقط |
| الانتقال يطلب دخولاً | لا `bhd_id` أو `mode=browse` أو بلا `start`/`callback` | أكمل القسم 3؛ أبلغ ONE-BHD لقلب `mode` إلى `sso` |
| أدمن «غير موجود» | صف أدمن محلي غير مربوط بـ `bhd_sub` | ربط بالبريد في `callback` مع الإبقاء على الدور |

---

## 3. قائمة تنفيذ إلزامية

### 3.1 مسارات الهوية على المنتج

- [ ] `GET /api/auth/bhd/start` → 302 إلى `https://id.bhd-om.com/oauth/authorize` (ليس أصل المنتج)
- [ ] `GET /api/auth/bhd/callback` → استبدال الكود على الخادم + upsert على `bhd_sub`
- [ ] `GET /api/auth/bhd/logout` → مسح جلسة المنتج ثم `end-session` على الهوية
- [ ] انسخ `admin-entry` من  
  `BHD-Complete-Brand-and-Portal-v1.1.0/app/api/auth/admin-entry/route.ts`

### 3.2 إزالة اللوحة القديمة

- [ ] `/login` و`/register` (أو المكافئ) يحوّلان إلى `/api/auth/bhd/start` إلا طوارئ `?local=1` إن وُجدت
- [ ] `local=1` مع `next` يبدأ بـ `/admin` → `/api/auth/admin-entry`
- [ ] أزل زر Google المحلي بعد الربط
- [ ] فوتر/Gate الأدمن → `/api/auth/admin-entry`

### 3.3 ربط أدمن قديم (في `callback` بعد التحقق من `id_token`)

```
1. إن وُجد مستخدم bhd_sub = sub → حدّث الملف، احتفظ بالدور، افتح الجلسة.
2. وإلا إن وُجد نفس البريد الموثّق و bhd_sub فارغ
   → اكتب bhd_sub = sub، احتفظ بـ role/admin، لا تُنشئ صفاً جديداً.
3. وإلا → أنشئ مستخدماً بدور افتراضي (مستخدم) — ليس أدمن تلقائياً.
4. امسح جلسة المنتج السابقة قبل ضبط الكوكي الجديدة.
```

تعيين أدمن جديد لاحقاً: من `/admin` داخل المنتج أو SQL على الصف المرتبط بـ `bhd_sub` — **ليس** من شاشة الهوية.

### 3.4 بعد نجاح المسار الحي

- [ ] تحقق: `GET {origin}/api/auth/bhd/start` يعيد 302 إلى `id.bhd-om.com`
- [ ] أبلغ ONE-BHD لقلب عنصر المنتج في `app/lib/bhd/apps.ts` من `browse` إلى `sso`
- [ ] اختبار: دخول الهوية → منتج ثانٍ بلا كلمة مرور؛ `/admin` إن كان الدور محلياً admin

---

## 4. اختبار قبول سريع

1. مستخدم جديد على الهوية → يدخل المنتج → صف فيه `bhd_sub = sub`.
2. أدمن قديم بنفس البريد → بعد أول SSO يبقى `admin` في هذا المنتج فقط.
3. نفس الحساب في منتج آخر بلا تعيين → مستخدم عادي.
4. جلسة `bhd_id` قائمة → فتح منتج `mode=sso` بلا نموذج.
5. خروج موحّد → كل منتج يطلب دخولاً من جديد عبر الهوية.

---

## 5. مراجع

- [BHD-UNIFIED-LOGIN-AND-APPS.md](BHD-UNIFIED-LOGIN-AND-APPS.md) — القسم 0.7 و4 و4.9
- [BHD-IDENTITY-SSO.md](BHD-IDENTITY-SSO.md) — بروتوكول OIDC
- [BHD-APP-SWITCHER.md](BHD-APP-SWITCHER.md) — المشغّل والكتالوج المجمد

---

## 6. حالة وازن (تنفيذ حي)

نُفِّذ حرفياً في `ainoamn/WAZEN` (أغسطس 2026):

- مسارات `start` / `callback` / `logout` + `admin-entry` → `start?returnTo=/admin`
- غلاف `/login` و`/register`؛ `local=1` + `/admin` → `admin-entry`
- ربط `bhd_sub` مع الإبقاء على `platform_roles`؛ لا أدمن تلقائي من الهوية
- كتالوج محلي `mode: "sso"`؛ خمول 48 ساعة + `SessionKeepAlive` + `/api/auth/me`
- التفصيل: القسم **12.2** في [BHD-UNIFIED-LOGIN-AND-APPS.md](BHD-UNIFIED-LOGIN-AND-APPS.md)
