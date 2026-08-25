# Handoff — 25 أغسطس 2026 (مرحلة 25)

**الفرع:** `main`  
**المستودع:** https://github.com/ainoamn/WAZEN  
**الإنتاج:** https://wazen-roan.vercel.app · https://wazen.bhd-om.com  

المرجع السابق: [HANDOFF-2026-08-24-phase24.md](./HANDOFF-2026-08-24-phase24.md).

على الجهاز الآخر: `git pull origin main` ثم `npm install` إن لزم. لا ترفع ملفات `public/brand/*-with-bg.png`.

## المرحلة 25 — المحاسب الذكي وسجل العضو

### Business API
- `GET /api/v1/spaces/{spaceId}/members/{memberId}/ledger` — كشف/سجل حي للعضو (`?focus=all|paid|spent|owes|credit`).
- `POST /api/v1/spaces/{spaceId}/members/{memberId}/pay/preview` — معاينة توزيع الدفع على الأقساط.
- `POST /api/v1/spaces/{spaceId}/members/{memberId}/smart-pay` — تنفيذ المحاسب الذكي مع تخصيص الأقساط (`selectedIds` اختياري).

يتطلب ميزة الباقة `smart_accountant` لمعاينة/تنفيذ الدفع الذكي.

### Webhooks
حدث جديد: `smart_pay.applied`.

### OpenAPI / مطوّرون
- `/api/v1/openapi` و`/developers` محدّثان (phase 25).

### اختبارات
- `tests/phase25-platform.test.mjs`.

### ما يبقى يدوياً
Protect `main`، `SENTRY_DSN`، اعتماد محامٍ، `WAZEN_RLS_ENFORCE=1` بعد Staging، مفاتيح PSP حية.
