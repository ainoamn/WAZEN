# Handoff — 24 أغسطس 2026 (مرحلة 4)

**الفرع:** `main`  
**المستودع:** https://github.com/ainoamn/WAZEN  
**الإنتاج:** https://wazen-roan.vercel.app · https://wazen.bhd-om.com  

المرجع السابق: [HANDOFF-2026-08-24.md](./HANDOFF-2026-08-24.md) (مراحل 0–3).

على الجهاز الآخر: `git pull origin main` ثم `npm install` إن لزم. لا ترفع ملفات `public/brand/*-with-bg.png`.

## المرحلة 4 — توسّع وتميّز

### PWA
- `public/manifest.webmanifest` + أيقونات موجودة في `/brand`.
- `public/sw.js`: غلاف ثابت (network-first للتنقل، stale-while-revalidate للأصول). لا يخزّن `/api` أو روابط `/r` و`/s`.
- تسجيل من `app/providers.tsx`؛ بطاقة تثبيت في الإعدادات `components/pwa/PwaInstallCard.tsx`.
- `app/layout.tsx`: `manifest` + `appleWebApp` + `themeColor`.
- CSP: `worker-src 'self'` و`manifest-src 'self'` في `proxy.ts`.
- ترويسات `sw.js` / manifest في `next.config.ts`.

### تصدير CSV / Excel
- `GET /api/platform?view=export&format=csv&kind=transactions|members&locale=ar|en`
- UTF-8 مع BOM عبر `lib/ledger-csv.ts` ليفتح في Excel بشكل صحيح.
- أزرار في **الإعدادات** و**التقارير**.

### نسخة احتياطية أغنى
- نفس `view=export` (JSON): `schemaHint: wazen-backup.v2` ويشمل installments + periods + settlements إضافة لما سبق.
- اسم الملف: `wazen-backup-YYYY-MM-DD.json`.

### استيراد كشف بنكي CSV
- من الإعدادات: رفع CSV → معاينة → استيراد حتى 200 صف كـ `income`/`expense` عبر `addTransaction`.
- يختار المحفظة من قائمة التدقيق في الإعدادات.

### اختبارات
- `tests/ledger-csv.test.mjs` ضمن `npm run test:backend`.

### ما يبقى خارج النطاق / لاحقاً
- إشعارات أصلية Push (تحتاج مفاتيح VAPID وخادم).
- مزود دفع حي و`WAZEN_RLS_ENFORCE`.
- ربط بنكي OAuth / استيراد كشف متعدد الأعمدة المتقدم.
- API مؤسسات Business منفصل.
