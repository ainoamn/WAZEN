# Handoff — 24 أغسطس 2026 (مرحلة 5)

**الفرع:** `main`  
**المستودع:** https://github.com/ainoamn/WAZEN  
**الإنتاج:** https://wazen-roan.vercel.app · https://wazen.bhd-om.com  

المرجع السابق: [HANDOFF-2026-08-24-phase4.md](./HANDOFF-2026-08-24-phase4.md).

على الجهاز الآخر: `git pull origin main` ثم `npm install` إن لزم. لا ترفع ملفات `public/brand/*-with-bg.png`.

## المرحلة 5 — مؤسسات، إشعارات، دول، RLS

### إشعارات
- جداول `user_notifications` + `push_subscriptions` (`SCHEMA_VERSION = 16`).
- لوحة التحكم تُزامن تنبيهات المساحة إلى صندوق الإشعارات وتعيدها في GET.
- جرس التنبيهات يعرض الإشعارات المحفوظة + التنبيهات الحية.
- `/api/push`: قراءة الإشعارات، `subscribe` / `unsubscribe` / `markRead`، ومفتاح VAPID العام.
- بطاقة «إشعارات الجهاز» في الإعدادات (تعمل عند ضبط `WAZEN_VAPID_*`).
- `sw.js` يستمع لـ `push` و`notificationclick`.

### Business API v1
- `GET /api/v1/spaces`
- `GET /api/v1/spaces/{id}`
- `GET /api/v1/spaces/{id}/transactions`
- `GET /api/v1/spaces/{id}/members`
- المصادقة: `Authorization: Bearer wzn_...` (مفاتيح من `/account/security`).
- صفحة توثيق: `/developers`.

### RLS enforce
- `lib/db-request-context.ts` + `runWithDbUser` حول مسارات Dashboard وv1 وpush.
- عند `WAZEN_RLS_ENFORCE=1` يضبط Neon `app.user_id` و`app.bypass_rls=0` داخل معاملة لكل استعلام/دفعة.

### حزم دول
- إضافة BH / KW / QA في `lib/country-packs.ts` وتحديث `docs/COUNTRY-PACKS.md`.

### اختبارات
- `tests/phase5-platform.test.mjs` ضمن `npm run test:backend`.

### إعدادات بيئة اختيارية
```
WAZEN_RLS_ENFORCE=0
WAZEN_VAPID_PUBLIC_KEY=
WAZEN_VAPID_PRIVATE_KEY=
WAZEN_VAPID_SUBJECT=mailto:support@your-domain.example
```

### ما يبقى لاحقاً
- ~~إرسال Web Push فعلي من الخادم~~ → مرحلة 6.
- ~~كتابة عبر `/api/v1`~~ → مرحلة 6.
- ~~مزود دفع حي (ثواني)~~ → مرحلة 6 (اختياري عبر env؛ الافتراضي تحويل يدوي).
- عمان نت ومزوّدون إضافيون؛ جدولة cron للمهام.
