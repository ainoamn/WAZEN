# ربط وازن بـ Neon (PostgreSQL)

المشروع يدعم الآن **Neon أولاً** عبر `DATABASE_URL`، مع الإبقاء على Turso كخيار قديم.

## 1) إنشاء المشروع في Neon

1. افتح [Neon Console](https://console.neon.tech/app/org-broad-surf-16375800/projects)
2. **New Project** → اختر اسماً مثل `wazen-production`
3. انسخ **Connection string** (URI) بصيغة:
   `postgresql://USER:PASSWORD@HOST/DB?sslmode=require`

## 2) إضافة المتغير في Vercel

```powershell
cd C:\dev\WAZEN
npx vercel env add DATABASE_URL production
# الصق Connection string ثم Enter
```

أو من لوحة Vercel → Project → Settings → Environment Variables:
- Name: `DATABASE_URL`
- Value: رابط Neon
- Environment: Production

تأكد أيضاً من:
```text
WAZEN_ADMIN_EMAILS=admin@wazen.pro
WAZEN_APP_ORIGIN=https://wazen-roan.vercel.app
```

## 3) إعادة النشر

```powershell
npx vercel --prod --yes
```

عند أول طلب، وازن ينشئ الجداول تلقائياً عبر `ensureSchema`.

## 4) تهيئة المشرف

```powershell
cd C:\dev\WAZEN
$env:DATABASE_URL="postgresql://..."
npm run admin:bootstrap -- --email admin@wazen.pro --name "Wazen Admin" --origin https://wazen-roan.vercel.app
```

افتح `setupUrl` خلال 15 دقيقة وعيّن كلمة المرور.

## ملاحظات

- Neon = Postgres (توسع أفقي/عمودي أقوى).
- بعض محفزات SQLite القديمة تُتخطى على Neon؛ القيود المالية تبقى في منطق التطبيق.
- لا ترفع `DATABASE_URL` إلى Git.
