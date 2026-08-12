# وازن | WAZEN

منصة عربية لإدارة الأموال الشخصية والمشتركة: المحافظ، المنزل، الرحلات، الجمعيات، الاشتراكات، المستندات، ولوحة الإدارة التجارية.

هذا المستودع (`main`) هو **المنصة الرئيسية** المعتمدة للتطوير والنشر.

## التوثيق الكامل

| الملف | المحتوى |
|--------|---------|
| **[docs/PRODUCT-FOUNDATION.md](./docs/PRODUCT-FOUNDATION.md)** | **الأساس الذي بُني عليه النظام** — الفكرة الكاملة، مثال 20 ر.س + الفائض، المحافظ، الصلاحيات، المراحل، مصفوفة التنفيذ |
| **[docs/INTEGRATION-VERIFICATION-2026-08-12.md](./docs/INTEGRATION-VERIFICATION-2026-08-12.md)** | دمج حزمة الحماية v0.2.0، نتائج الاختبارات، معالجة التعارضات، ما تبقّى قبل الإنتاج |
| **[docs/SECURITY-IMPLEMENTATION-REPORT.md](./docs/SECURITY-IMPLEMENTATION-REPORT.md)** | تقرير تنفيذ طبقات الحماية (12 أغسطس 2026) |
| **[docs/PRODUCTION-DEPLOYMENT.md](./docs/PRODUCTION-DEPLOYMENT.md)** | إعداد قاعدة الإنتاج والأسرار والبريد والدفع والنسخ الاحتياطي والمراقبة |
| **[SECURITY.md](./SECURITY.md)** | طبقات الحماية الحالية ومتطلبات التشغيل والإبلاغ الأمني |
| **[DOCUMENTATION.md](./DOCUMENTATION.md)** | توثيق تقني: التقنيات، APIs، الأمان الفعلي، الثغرات، سجل Git، ما ينقص للإطلاق |
| **[docs/SECURITY-CONTROLS.md](./docs/SECURITY-CONTROLS.md)** | مصفوفة تنفيذ متطلبات الحماية والأدلة والحدود |
| **[docs/THREAT-MODEL.md](./docs/THREAT-MODEL.md)** | نموذج التهديدات وحدود الثقة والمخاطر المتبقية |
| **[docs/RUNBOOKS.md](./docs/RUNBOOKS.md)** | الإصدار، الاستعادة، الحوادث وتدوير المفاتيح |
| **[docs/COUNTRY-PACKS.md](./docs/COUNTRY-PACKS.md)** | العملات والضرائب والترجمة والتوسع الدولي |

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
| `/login` `/register` | تسجيل الدخول وإنشاء الحساب |
| `/dashboard` | لوحة المستخدم (محافظ وعمليات من API) |
| `/pricing` | الباقات والكوبونات |
| `/billing` | الفوترة والاشتراك |
| `/documents` | الإيصالات والكشوفات |
| `/admin` | إدارة المنصة (عملاء، مدفوعات، تقارير) |
| `/account/security` | أمان الحساب (كلمة المرور / الجلسات / TOTP) |
| `/privacy` `/terms` `/security` | صفحات الثقة |

## واجهات API

- `GET/POST /api/dashboard` — المحافظ والعمليات والأعضاء
- `GET/POST /api/platform` — الباقات، الفوترة، المستندات، الإدارة

## قاعدة البيانات

Turso/libSQL على Vercel، مع إمكانية D1 في بيئة Cloudflare مهيأة. المخطط في `db/schema.ts` وتهيئة التشغيل في `db/runtime.ts`.

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
- `npm run build` — بناء Next.js الإنتاجي
- `npm test` — فحص TypeScript واختبارات المنطق المالي
- `npm run audit:prod` — تدقيق اعتماديات الإنتاج
- `npm run test:full` — اختبارات Backend وFrontend وIntegration/E2E
- `npm run db:migrate` — تطبيق هجرات Turso المتحققة بالـ checksum

## الإطلاق

راجع `docs/PRODUCTION-DEPLOYMENT.md` لإعداد قاعدة Turso والأسرار والبريد وويب هوك الدفع قبل النشر على Vercel.
