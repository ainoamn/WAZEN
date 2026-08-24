"use client";
import Link from "next/link";
import { Brand, useCommerceLocale } from "./commercial-kit";

const content = {
  privacy: {
    title: ["سياسة الخصوصية", "Privacy Policy"],
    intro: [
      "توضح هذه السياسة أنواع البيانات التي يعالجها وازن لتشغيل الحسابات المالية للجمعيات والمحافظ الشخصية، وكيف نحميها، وما حقوقك. وازن منصة سجلات مالية وليست بنكاً أو جهة حفظ أموال. هذه النسخة إرشادية تشغيلية وقد تتطلب مراجعة محامٍ قبل الاعتماد القانوني النهائي.",
      "This policy explains the data Wazen processes to run association and personal wallet ledgers, how it is protected, and your rights. Wazen is a financial record platform, not a bank or custodian. This copy is operational guidance and may still need counsel review before final legal adoption.",
    ],
    sections: [
      ["البيانات التي نجمعها", "Data we collect", "بيانات الحساب (الاسم، البريد، رقم الهاتف إن أدخلته)، بيانات المحافظ والأعضاء والحركات والمستندات التي تدخلها، سجلات الجلسات والأمان (مثل عنوان IP مختزن بشكل مشفّر/مُجزّأ)، وبيانات الاشتراك والفوترة اللازمة للباقات.", "Account data (name, email, phone if provided), wallet/member/transaction/document data you enter, session and security events (e.g. hashed/derived IP), and subscription/billing data needed for plans."],
      ["أغراض المعالجة", "Purposes", "تقديم الخدمة ومنع الاحتيال وإساءة الاستخدام، إرسال الإيصالات والكشوف عند طلبك، دعم العملاء، تحسين الاستقرار والأداء، والامتثال للالتزامات القانونية والمحاسبية.", "Delivering the service, preventing fraud and abuse, sending receipts/statements when you request them, customer support, reliability/performance, and legal/accounting duties."],
      ["الحفظ والمشاركة", "Retention and sharing", "نحفظ البيانات طالما الحساب نشط وما تفرضه الحاجة التشغيلية والقانونية بعدها. لا نبيع بياناتك. قد نشاركها فقط مع مزودي البنية السحابية والدفع والبريد المصرّح لهم، أو عند التزام قانوني واضح.", "We retain data while the account is active and as operational/legal needs require thereafter. We do not sell your data. Sharing is limited to authorized cloud, payment and email processors, or clear legal obligations."],
      ["حقوقك وطلباتك", "Your rights and requests", "يمكنك تنزيل بياناتك من الإعدادات، وتصحيح بيانات الحساب، وطلب حذف الحساب مع الاحتفاظ بما يفرضه النظام المالي أو النزاعات. للاستفسارات: استخدم قنوات الدعم الظاهرة في الموقع.", "You can export data from Settings, correct profile details, and request account deletion subject to financial/legal retention. For inquiries use the support channels shown on the site."],
      ["ملفات الارتباط والأمان", "Cookies and security", "نستخدم ملفات جلسة HttpOnly ضرورية لتسجيل الدخول والحماية من CSRF. كلمات المرور مشتقة (PBKDF2)، والصلاحيات تُفرض على الخادم، والسجلات الحساسة تُنقّح في التدقيق.", "We use essential HttpOnly session cookies for sign-in and CSRF protection. Passwords use PBKDF2 derivation, authorization is server-enforced, and sensitive audit metadata is redacted."],
    ],
  },
  terms: {
    title: ["شروط الاستخدام", "Terms of Use"],
    intro: [
      "باستخدامك وازن توافق على أن المنصة أداة لتنظيم السجلات المالية للجمعيات والمحافظ، وليست بنكاً أو مستشاراً استثمارياً أو جهة حفظ أموال أو ضامناً لنتائج مالية. النسخة الحالية للتوضيح التشغيلي وقد تحتاج مراجعة قانونية نهائية.",
      "By using Wazen you agree it is a record-management tool for associations and wallets — not a bank, investment adviser, custodian, or guarantor of financial outcomes. This version is operational and may need final legal review.",
    ],
    sections: [
      ["مسؤولية الحساب", "Account responsibility", "أنت مسؤول عن صحة البيانات، وحماية بيانات الدخول، ومنح الأدوار المناسبة داخل مساحاتك، وعن الامتثال لقوانين بلدك عند جمع مساهمات الأعضاء.", "You are responsible for accurate records, protecting credentials, granting appropriate workspace roles, and complying with local law when collecting member contributions."],
      ["المدفوعات والباقات", "Payments and plans", "تخضع الاشتراكات والأسعار والضرائب والفترات لما يُعرض عند الشراء. قد تتم التسوية يدوياً (تحويل) أو عبر مزود دفع مستقل عند تفعيله. الترقية أو التخفيض تتبع قواعد الاحتفاظ الظاهرة في المنتج.", "Subscriptions, prices, taxes and periods shown at checkout apply. Settlement may be manual transfer or an independent payment provider when enabled. Upgrades/downgrades follow the retention rules shown in-product."],
      ["الاستخدام المقبول", "Acceptable use", "يُمنع الاحتيال، أو محاولة تجاوز الصلاحيات، أو إساءة استخدام روابط الإيصالات/الكشوف العامة، أو تعطيل الخدمة، أو إدخال بيانات مضللة عمداً.", "Fraud, privilege bypass attempts, abuse of public receipt/statement links, service disruption, and deliberate misleading records are prohibited."],
      ["إخلاء المسؤولية", "Disclaimer", "وازن لا يتحقق من كفاية الأموال خارج السجلات التي تدخلها، ولا يضمن توافق تقاريرك مع متطلبات جهة رقابية محددة دون استشارة مختص.", "Wazen does not verify funds outside the ledgers you enter and does not guarantee that your reports meet a specific regulator’s requirements without professional advice."],
      ["إنهاء الخدمة", "Termination", "يمكنك إيقاف الاشتراك وفق الباقة. قد نعلّق أو ننهي الحساب عند مخالفة الشروط أو خطر أمني. تصدير البيانات متاح حسب الباقة قبل الحذف النهائي حيثما أمكن.", "You may stop a subscription per plan terms. We may suspend or terminate accounts for violations or security risk. Data export is available per plan before final deletion where feasible."],
    ],
  },
  security: {
    title: ["مركز الأمان", "Security Center"],
    intro: [
      "طبقات دفاع لحماية الهوية والبيانات المالية وتقليل أثر الأخطاء البشرية والتقنية. التفاصيل التقنية تُحدَّث مع إصدارات المنصة.",
      "Layered controls protect identity and financial data while reducing human and technical risk. Technical details evolve with platform releases.",
    ],
    sections: [
      ["الهوية والوصول", "Identity and access", "كلمات المرور مشتقة بخوارزمية PBKDF2، والجلسات في ملفات HttpOnly تنتهي بإغلاق المتصفح أو بعد 48 ساعة من السكون (منزلق)، مع CSRF مربوط بالجلسة، وصلاحيات مساحات مفروضة على الخادم، ودعم مصادقة ثنائية (TOTP).", "Passwords use PBKDF2, sessions use HttpOnly cookies that end on browser close or after 48 hours idle (sliding), CSRF is session-bound, space authorization is server-side, and TOTP 2FA is supported."],
      ["عزل المستأجرين", "Tenant isolation", "الوصول للمحافظ عبر تفويض مركزي غير كاشف (404 بدل التسريب). على Neon تُفعَّل سياسات RLS كطبقة دفاع إضافية مع تجاوز آمن للتطبيق إلى أن يُفعَّل وضع الإنفاذ الصارم.", "Wallet access uses central non-disclosing authorization (404). On Neon, RLS policies add defense-in-depth with a safe app bypass until strict enforce mode is enabled."],
      ["سلامة الحسابات", "Financial integrity", "تُسجَّل الحركات المهمة بقيود مزدوجة ومفاتيح منع التكرار وسجل تدقيق منقّح، مع سجل تعديلات للعمليات وحراسة انتقالات حالة الدفع على Postgres.", "Important money movements use double-entry journals, idempotency keys, redacted audit logs, transaction revision history, and Postgres payment-status transition guards."],
      ["المراقبة والاستجابة", "Monitoring and response", "الأخطاء تُسجَّل بشكل منظم ويمكن إرسالها إلى Sentry عند ضبط SENTRY_DSN. راقب صفحة الحالة ونبّهنا فوراً عند الاشتباه في دخول غير مصرح أو خطأ مالي.", "Errors are structured-logged and can ship to Sentry when SENTRY_DSN is set. Monitor health and notify us promptly about suspected unauthorized access or financial discrepancies."],
    ],
  },
} as const;

export function LegalPage({ kind }: { kind: keyof typeof content }) {
  const { locale, setLocale } = useCommerceLocale();
  const index = locale === "ar" ? 0 : 1;
  const page = content[kind];
  return (
    <main className="legal-page">
      <header>
        <Brand />
        <nav>
          <Link href="/privacy">{locale === "ar" ? "الخصوصية" : "Privacy"}</Link>
          <Link href="/terms">{locale === "ar" ? "الشروط" : "Terms"}</Link>
          <Link href="/security">{locale === "ar" ? "الأمان" : "Security"}</Link>
        </nav>
        <button type="button" onClick={() => setLocale(locale === "ar" ? "en" : "ar")}>{locale === "ar" ? "EN" : "عربي"}</button>
      </header>
      <article>
        <small>WAZEN · 2026-08-24 · v0.2.0-legal · {locale === "ar" ? "مراجعة تشغيلية — يُفضّل اعتماد محامٍ" : "Operational review — counsel adoption recommended"}</small>
        <h1>{page.title[index]}</h1>
        <p className="lead">{page.intro[index]}</p>
        {page.sections.map((section) => (
          <section key={section[1]}>
            <h2>{section[index]}</h2>
            <p>{section[index + 2]}</p>
          </section>
        ))}
        <section>
          <h2>{locale === "ar" ? "قائمة اعتماد قانوني" : "Counsel adoption checklist"}</h2>
          <p>
            {locale === "ar"
              ? "قبل الاعتماد النهائي: مراجعة محامٍ محلي للدول المستهدفة، مواءمة نصوص الاحتفاظ والحذف مع قانون حماية البيانات، وتوثيق مزودي المعالجة (استضافة، بريد، دفع). بعد التوقيع اضبط WAZEN_LEGAL_COUNSEL_SIGNED=1 في بيئة الإنتاج."
              : "Before final adoption: local counsel review for target countries, align retention/deletion with data-protection law, and document processors (hosting, email, payments). After sign-off set WAZEN_LEGAL_COUNSEL_SIGNED=1 in production."}
          </p>
        </section>
      </article>
    </main>
  );
}
