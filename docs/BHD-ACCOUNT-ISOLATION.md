# عزل بيانات الحساب بعد التبديل (خصوصية — نموذج جوجل)

> **الحالة:** إلزامي لكل منتج مرتبط بـ `id.bhd-om.com`.  
> **تاريخ التحليل:** 29 أكتوبر 2026  
> **لوحة الربط:** https://id.bhd-om.com/admin#connect  
> **النموذج:** مثل جوجل `authuser` — كل تبويب مربوط بحساب عبر `?au=<sub>`.

---

## القاعدة (نموذج جوجل)

### ربط التبويب (`?au=<sub>`)
1. بعد التبديل: `?au=<bhdSub>&_bhd=<ts>` مرة واحدة ثم يُزال `_bhd` بهدوء (`history.replaceState`).
2. `sessionStorage`: خريطة `bhd_account_tokens[sub]` + `bhd_active_au`.
3. عند التطابق: لا ملاحظة ولا حجاب — الصفحة تعمل مباشرة.
4. عند الانحراف (تبويب آخر): `POST /api/auth/bhd/rebind` بصيغة JSON صامتة بلا شاشة ولا نص.

### التبديل (فقط عند اختيار حساب)
1. غطاء فارغ بلا نص (لا «جاري عزل…»).
2. `POST /api/auth/switch` مع `X-BHD-Persist-Cookie: 1`.
3. ثم form `rebind` لإعادة تحميل كاملة (عزل React state 100%).

### نوافذ متعددة
`BhdSilentSso` يصلح بهدوء كل ~20ث أو عند الظهور — بلا وميض وبلا ملاحظات.

مرجع التطبيق: `lib/identity/client.ts` + `BhdPrivacyGate` + `BhdSilentSso`.

تفاصيل الأمر للوكيل: [`BHD-CURSOR-PRODUCT-WIRE.md`](BHD-CURSOR-PRODUCT-WIRE.md) §3.
