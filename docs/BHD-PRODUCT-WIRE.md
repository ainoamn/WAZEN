# ربط WAZEN بهوية BHD الحية

> تاريخ التحديث: 29 أكتوبر 2026  
> المصدر: https://id.bhd-om.com

## الملفات التي تغيّرت

| ملف | الغرض |
|-----|--------|
| `app/layout.tsx` | تحميل `bhd-identity.js` |
| `proxy.ts` | CSP: `script-src` / `connect-src` / `img-src` لـ `id.bhd-om.com` |
| `lib/bhd/runtime.ts` | `session.maxAgeSec` من `/api/bhd/runtime` (~5 دقائق cache) |
| `lib/session-policy.ts` | Max-Age للكوكي من runtime |
| `app/api/auth/bhd/rebind/route.ts` | ربط جلسة WAZEN بـ Bearer النافذة |
| `lib/identity/client.ts` | `?au=` + silent JSON rebind + `paintPrivacyVeil` + `switchWindowAccount` (`X-BHD-Persist-Cookie:1`) |
| `lib/identity/window-session.ts` | `bhd_account_tokens` + `bhd_active_au` + `boundWindowToken` |
| `components/bhd/BhdPrivacyGate.tsx` + `BhdPrivacyGateProduct.tsx` | عزل صامت عند تحميل الجلسة |
| `lib/bhd/catalog.ts` + `lib/identity/use-bhd-catalog.ts` | كتالوج حي + حدث `bhd-catalog` |
| `components/bhd/BhdSilentSso.tsx` | reconcile ~20s، `silent:true` فقط — بلا رسائل |
| `app/api/auth/bhd/rebind/route.ts` | JSON `Accept: application/json` → `{ ok, unchanged?, user }` + Set-Cookie |
| `components/bhd/useBhdAccountMenu.ts` | تبديل → `switchWindowAccount` ثم rebind |
| `components/bhd/BhdAppSwitcher.tsx` | شبكة التطبيقات من الكتالوج الحي |
| `app/page.tsx` | فوتر الأيقونات من الكتالوج |

## متغيرات البيئة

- `BHD_OAUTH_CLIENT_ID` (افتراضي `bhd-wazen`)
- `BHD_OAUTH_CLIENT_SECRET` — اختياري لـ PKCE؛ مطلوب لبعض مسارات token في الإنتاج
- `BHD_IDENTITY_ISSUER` — اختياري (افتراضي `https://id.bhd-om.com`)

## كيف تختبر

1. افتح https://wazen.bhd-om.com (أو محلي) — Network: `bhd-identity.js` + `/api/bhd/runtime`.
2. سجّل دخولاً → Cookie `wazen_session` / `__Host-wazen_session` بـ Max-Age ≈ runtime.
3. من قائمة الحساب: بدّل حساباً → `POST /api/auth/bhd/rebind` → لوحة الحساب الجديد فقط.
4. شبكة التطبيقات تعرض أيقونات من `GET https://id.bhd-om.com/api/bhd/catalog`.

## تحديث §95 (29 أكتوبر 2026)

إصلاح جذر العزل على الهوية: `POST /api/auth/switch` يكتب `bhd_id` دائماً. هذا المنتج يعتمد `rebind` محلياً بعد التبديل. التفاصيل: `BHD-ACCOUNT-ISOLATION.md`.
