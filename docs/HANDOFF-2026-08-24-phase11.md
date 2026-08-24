# Handoff — 24 أغسطس 2026 (مرحلة 11)

**الفرع:** `main`  
**المستودع:** https://github.com/ainoamn/WAZEN  
**الإنتاج:** https://wazen-roan.vercel.app · https://wazen.bhd-om.com  

المرجع السابق: [HANDOFF-2026-08-24-phase10.md](./HANDOFF-2026-08-24-phase10.md).

على الجهاز الآخر: `git pull origin main` ثم `npm install` إن لزم. لا ترفع ملفات `public/brand/*-with-bg.png`.

## المرحلة 11 — Business API أعمق + مفاتيح كتابة

### إلغاء حركة مشترك
- `lib/ledger-void.ts`: `voidApprovedTransaction` + إعادة بناء الرصيد ودفاتر الأعضاء.
- لوحة التحكم تستورد نفس الوحدة (بدون تكرار المنطق).
- `POST /api/v1/spaces/{spaceId}/transactions/{transactionId}/void` (نطاق `wallets:write`).

### تدقيق وسحب فائض
- `GET /api/v1/spaces/{spaceId}/audit?limit=&q=`
- `POST /api/v1/spaces/{spaceId}/surplus/withdraw` (نطاق `settlements:write`) عبر `lib/v1-surplus.ts`.

### مفاتيح API
- صفحة أمان الحساب: مفتاح **قراءة** أو **كتابة** (يشمل `wallets:write` / `members:write` / `settlements:write`).
- `/developers` محدّث (phase 11).

### اختبارات
- `tests/phase11-platform.test.mjs`.

### ما يبقى يدوياً
Protect `main`، `SENTRY_DSN`، اعتماد محامٍ، `WAZEN_RLS_ENFORCE=1` بعد Staging، مفاتيح PSP حية.
