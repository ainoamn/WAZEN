# رِفد | RIFD

منصة عُمانية لإدارة الأموال الشخصية والمشتركة، المحافظ المنزلية، الرحلات، الجمعيات، الاشتراكات، المدفوعات، الإيصالات والتقارير.

## التشغيل محلياً

المتطلبات: Node.js 22.13 أو أحدث.

```bash
npm install
npm run dev
```

ثم افتح العنوان الذي يظهر في نافذة الأوامر.

## البناء

```bash
npm run build
```

## الصفحات الرئيسية

- `/` الصفحة الرئيسية.
- `/dashboard` لوحة المستخدم.
- `/admin` لوحة الإدارة.
- `/admin/users` إدارة المستخدمين.
- `/admin/payments` المدفوعات والفواتير.
- `/admin/reports` تقارير الإدارة والإيرادات.
- `/pricing` الباقات والاشتراكات.
- `/documents` الإيصالات والكشوفات.

## الرفع إلى GitHub

```bash
git init
git add .
git commit -m "Initial RIFD project"
git branch -M main
git remote add origin YOUR_REPOSITORY_URL
git push -u origin main
```

لا ترفع ملفات `.env` أو مفاتيح بوابات الدفع إلى GitHub. ملفات الحزم والبناء مستبعدة بواسطة `.gitignore` ويمكن إنشاؤها مجدداً.
