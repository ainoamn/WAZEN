# تهيئة الإنتاج الكاملة

بعد إصلاح نشر Vercel، يبقى ربط Turso فقط.

## الخيار الموصى به

1. أنشئ حساب/منظمة على [Turso](https://turso.tech) واصنع API token.
2. من جذر المشروع:

```powershell
$env:TURSO_API_TOKEN="..."
$env:TURSO_ORG="your-org-slug"
npm run provision:production
```

3. افتح `setupUrl` المطبوع خلال 15 دقيقة.
4. عيّن كلمة مرور ≥ 12 حرفاً لـ `admin@wazen.pro`.
5. فعّل TOTP من `/account/security`.
6. احذف `WAZEN_ADMIN_EMAILS` من Vercel بعد نجاح المدير الاحتياطي.

## يدوي

راجع `docs/PRODUCTION-DEPLOYMENT.md` و`npm run admin:bootstrap`.
