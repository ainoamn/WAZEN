# وازن | WAZEN

منصة عربية لإدارة الأموال الشخصية والمشتركة: المحافظ، المنزل، الرحلات، الجمعيات، الاشتراكات، المستندات، ولوحة الإدارة التجارية.

هذا المستودع (`main`) هو **المنصة الرئيسية** المعتمدة للتطوير والنشر.

**للمتابعة من جهاز آخر ابدأ من:** **[docs/HANDOFF-2026-08-18.md](./docs/HANDOFF-2026-08-18.md)** ثم التقرير المفصّل **[docs/PLATFORM-REPORT-2026-08-18.md](./docs/PLATFORM-REPORT-2026-08-18.md)**.

## التوثيق الكامل

| الملف | المحتوى |
|--------|---------|
| **[docs/HANDOFF-2026-08-18.md](./docs/HANDOFF-2026-08-18.md)** | **متابعة العمل الآن** — حالة الدمج، جوجل، النطاق المخصص |
| **[docs/PLATFORM-REPORT-2026-08-18.md](./docs/PLATFORM-REPORT-2026-08-18.md)** | **تقرير المنصة** — التقنيات، طريقة البناء والعمل، الأنظمة المرتبطة، مجموعة BHD |
| **[docs/HANDOFF-2026-08-17.md](./docs/HANDOFF-2026-08-17.md)** | تسليم 17 أغسطس — شارة ترقية، حدود الاشتراك، جدول الباقات، حدود الاستخدام، الإدارة، جوجل |
| **[docs/HANDOFF-2026-08-16.md](./docs/HANDOFF-2026-08-16.md)** | تسليم 16 أغسطس — إدارة المنصة، طباعة PDF، كشف العضو |
| **[docs/HANDOFF-2026-08-15.md](./docs/HANDOFF-2026-08-15.md)** | تسليم 15 أغسطس — ربط المحافظ، جداول الإنتاج، واجهة الجوال |
| **[docs/HANDOFF-2026-08-14.md](./docs/HANDOFF-2026-08-14.md)** | تسليم 14 أغسطس — الفترات المحاسبية، الأعضاء، مصروف الصندوق |
| **[docs/PRODUCT-FOUNDATION.md](./docs/PRODUCT-FOUNDATION.md)** | **الأساس المحاسبي للمنتج** — الفكرة، الفائض، المحافظ، الصلاحيات |
| **[docs/HANDOFF-2026-08-13.md](./docs/HANDOFF-2026-08-13.md)** | تسليم 13 أغسطس: محاسبة المساهمة، التقارير، تسريع التنقل |
| **[docs/BRAND.md](./docs/BRAND.md)** | هوية وازن البصرية، الشعار، الألوان وقواعد الاستخدام |
| **[docs/WAZEN-DEVELOPMENT-RESET-ADMIN-PLAN-2026-08-12.md](./docs/WAZEN-DEVELOPMENT-RESET-ADMIN-PLAN-2026-08-12.md)** | تقرير التطوير/التصفير/الإدارة المعتمد |
| **[docs/EXECUTION-BACKLOG-2026-08-12.md](./docs/EXECUTION-BACKLOG-2026-08-12.md)** | خطة تنفيذ ما تبقى (مراحل 0–5) مع قرارات المالك |
| **[docs/OPS-LOG-2026-08-12.md](./docs/OPS-LOG-2026-08-12.md)** | سجل العمليات المنفّذة والمعلّقة |
| **[docs/INTEGRATION-VERIFICATION-2026-08-12.md](./docs/INTEGRATION-VERIFICATION-2026-08-12.md)** | دمج حزمة الحماية v0.2.0، نتائج الاختبارات، معالجة التعارضات، ما تبقّى قبل الإنتاج |
| **[docs/SECURITY-IMPLEMENTATION-REPORT.md](./docs/SECURITY-IMPLEMENTATION-REPORT.md)** | تقرير تنفيذ طبقات الحماية (12 أغسطس 2026) |
| **[docs/PRODUCTION-DEPLOYMENT.md](./docs/PRODUCTION-DEPLOYMENT.md)** | إعداد قاعدة الإنتاج والأسرار والبريد والدفع والنسخ الاحتياطي والمراقبة |
| **[docs/PRODUCTION-PROVISION.md](./docs/PRODUCTION-PROVISION.md)** | أمر واحد لتهيئة Turso + Vercel + المدير |
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
| `/home` | الرئيسية بعد الدخول (الزائر بلا جلسة يُحوَّل إلى `/login`) |
| `/dashboard` | لوحة المستخدم — تنقّل داخلي مع كاش، بلا شاشة شعار |
| `/pricing` | الباقات والكوبونات |
| `/billing` | الفوترة والاشتراك |
| `/documents` | الإيصالات والكشوفات |
| `/admin` | إدارة المنصة (عملاء، مدفوعات، تقارير) |
| `/account/security` | أمان الحساب (TOTP ومفاتيح API) — تغيير كلمة المرور أيضاً في إعدادات اللوحة |
| `/privacy` `/terms` `/security` | صفحات الثقة |

## واجهات API

- `GET/POST /api/dashboard` — المحافظ والعمليات والأعضاء
- `GET/POST /api/platform` — الباقات، الفوترة، المستندات، الإدارة

## قاعدة البيانات

Neon Postgres على الإنتاج عبر `DATABASE_URL`. Turso/libSQL اختياري قديم. SQLite للتطوير المحلي فقط. المخطط في `db/schema.ts` وتهيئة التشغيل `SCHEMA_VERSION = 13` في `db/runtime.ts`.

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

راجع `docs/NEON-SETUP.md` و`docs/PRODUCTION-DEPLOYMENT.md` قبل النشر على Vercel. التسليم الحالي للمتابعة: `docs/HANDOFF-2026-08-18.md`. التقرير المعماري: `docs/PLATFORM-REPORT-2026-08-18.md`.
