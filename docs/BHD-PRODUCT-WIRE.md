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
| `lib/identity/client.ts` | `identityFetch` + `switchWindowAccount` + `applyAccountIsolation` (rebind أولاً) |
| `lib/identity/window-session.ts` | `bhd_window_token` |
| `lib/bhd/catalog.ts` + `lib/identity/use-bhd-catalog.ts` | كتالوج حي + حدث `bhd-catalog` |
| `components/bhd/BhdSilentSso.tsx` | rebind عند عدم تطابق الحساب |
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
