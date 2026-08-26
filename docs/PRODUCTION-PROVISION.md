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
4. سجّل الدخول عبر الهوية بـ `a.hamid89@hotmail.com` (بريد موثّق على `id.bhd-om.com`).
5. تأكد من وصول `/admin` بعد أول SSO (الترقية عبر `WAZEN_ADMIN_EMAILS`).
6. احذف `WAZEN_ADMIN_EMAILS` من Vercel بعد نجاح المدير إن رغبت؛ الدور يبقى في قاعدة البيانات.

## يدوي

راجع `docs/PRODUCTION-DEPLOYMENT.md` و`npm run admin:bootstrap`.
