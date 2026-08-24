# Handoff — 24 أغسطس 2026 (مرحلة 21)

**الفرع:** `main`  
**المستودع:** https://github.com/ainoamn/WAZEN  
**الإنتاج:** https://wazen-roan.vercel.app · https://wazen.bhd-om.com  

المرجع السابق: [HANDOFF-2026-08-24-phase20.md](./HANDOFF-2026-08-24-phase20.md).

على الجهاز الآخر: `git pull origin main` ثم `npm install` إن لزم. لا ترفع ملفات `public/brand/*-with-bg.png`.

## المرحلة 21 — حسابات شخصية، ربط بنكي، تحويل مرتبط

### Business API
- `GET|POST /api/v1/spaces/{spaceId}/accounts` — قائمة/إنشاء حسابات بنكية ونقدية للمحفظة الشخصية.
- `PUT /api/v1/spaces/{spaceId}/links/bank` — ربط أو فك حساب بنكي لمحفظة مرتبطة (`accountId: null` للفك).
- `POST /api/v1/spaces/{spaceId}/links/transfer` — تحويل `to_linked` / `to_hub` بين الشخصية والمرتبطة.
- `GET …/links` يعيد أيضاً `bankAccountId` لكل ربط.

### Webhooks
أحداث جديدة: `account.created` · `space.bank_linked` · `space.bank_unlinked` · `space.transferred`.

### OpenAPI / مطوّرون
- `/api/v1/openapi` و`/developers` محدّثان (phase 21).

### اختبارات
- `tests/phase21-platform.test.mjs`.

### ما يبقى يدوياً
Protect `main`، `SENTRY_DSN`، اعتماد محامٍ، `WAZEN_RLS_ENFORCE=1` بعد Staging، مفاتيح PSP حية.
