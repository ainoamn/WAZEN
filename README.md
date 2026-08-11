# وازن | WAZEN

منصة عربية لإدارة الأموال الشخصية والمشتركة: المحافظ، المنزل، الرحلات، الجمعيات، الاشتراكات، المستندات، ولوحة الإدارة التجارية.

هذا المستودع (`main`) هو **المنصة الرئيسية** المعتمدة للتطوير والنشر.

## التشغيل المحلي

المتطلبات: Node.js `>=22.13.0`

```bash
npm install
npm run dev
npm run build
```

## الصفحات الرئيسية

| المسار | الوصف |
|--------|--------|
| `/` | الصفحة التسويقية |
| `/dashboard` | لوحة المستخدم (محافظ وعمليات من API + D1) |
| `/pricing` | الباقات والكوبونات |
| `/billing` | الفوترة والاشتراك |
| `/documents` | الإيصالات والكشوفات |
| `/admin` | إدارة المنصة (عملاء، مدفوعات، تقارير) |

## واجهات API

- `GET/POST /api/dashboard` — المحافظ والعمليات والأعضاء
- `GET/POST /api/platform` — الباقات، الفوترة، المستندات، الإدارة

## قاعدة البيانات

Cloudflare D1 عبر Drizzle. المخطط في `db/schema.ts` مع تهيئة runtime في `db/runtime.ts`.

## أرشيف رِفد (النسخة السابقة)

نسخة **رِفد | RIFD** (UI prototype / أفكار الشاشات والهوية) محفوظة للرجوع إليها عند الحاجة، وليست المنصة الرئيسية:

| المكان | المسار |
|--------|--------|
| GitHub | [`archive/rifd`](https://github.com/ainoamn/WAZEN/tree/archive/rifd) |
| الكمبيوتر (worktree) | `C:\dev\WAZEN-archive-rifd` |
| المنصة الرئيسية | `C:\dev\WAZEN` على فرع `main` |

```bash
# من مجلد المنصة الرئيسية
git worktree list
# الأرشيف مربوط بالفرع archive/rifd — لا تعدّل عليه للعمل اليومي
```

يمكن الاستفادة من أرشيف رِفد في الأفكار والسيناريوهات والتصميم دون دمجها كمنصة إنتاج.

## أوامر مفيدة

- `npm run dev` — تشغيل التطوير
- `npm run build` — بناء vinext
- `npm test` — بناء + اختبار HTML
- `npm run db:generate` — توليد migrations من Drizzle

## Learn more

- [vinext](https://github.com/cloudflare/vinext)
- [Drizzle D1](https://orm.drizzle.team/docs/get-started/d1-new)
