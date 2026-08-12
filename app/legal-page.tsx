"use client";
import Link from "next/link";
import { Brand, useCommerceLocale } from "./commercial-kit";

const content = {
  privacy: { title: ["سياسة الخصوصية", "Privacy Policy"], intro: ["نوضح هنا البيانات التي يحتاجها وازن لتشغيل الحسابات المالية وكيف نحميها ونمنحك التحكم بها.", "This explains the data Wazen needs to operate financial accounts, how it is protected, and how you control it."], sections: [
    ["البيانات والاستخدام", "Data and use", "نجمع بيانات الحساب والحركات والمستندات التي تدخلها لتقديم الخدمة ومنع الاحتيال ودعمك. لا نبيع بياناتك.", "We process account, transaction and document data you provide to deliver the service, prevent fraud and support you. We do not sell your data."],
    ["الحفظ والمشاركة", "Retention and sharing", "نحفظ البيانات وفق مدة الحاجة القانونية والتشغيلية، ولا نشاركها إلا مع مزودي البنية والدفع المصرح لهم أو عند التزام قانوني.", "Data is retained for legal and operational needs and shared only with authorized infrastructure/payment processors or where legally required."],
    ["حقوقك", "Your rights", "يمكنك تنزيل بياناتك وطلب تصحيحها أو حذف الحساب من الإعدادات، مع الاحتفاظ بما يفرضه النظام المالي والقانوني.", "You can export, correct, or request deletion of your account data, subject to financial and legal retention duties."],
  ]},
  terms: { title: ["شروط الاستخدام", "Terms of Use"], intro: ["وازن أداة لتنظيم السجلات وليس بنكاً أو مستشاراً استثمارياً أو جهة حفظ أموال.", "Wazen is a record-management tool, not a bank, investment adviser or custodian of funds."], sections: [
    ["مسؤولية الحساب", "Account responsibility", "أنت مسؤول عن صحة البيانات والمحافظة على بيانات الدخول ومنح الصلاحيات المناسبة لأعضاء مساحاتك.", "You are responsible for accurate records, protecting credentials and granting appropriate workspace roles."],
    ["المدفوعات", "Payments", "تخضع الاشتراكات والأسعار والضرائب والفترات الموضحة عند الشراء، وتتم معالجة الدفع عبر مزود مستقل.", "Subscriptions, prices, taxes and periods shown at checkout apply; payments are processed by an independent provider."],
    ["الاستخدام المقبول", "Acceptable use", "يُمنع إساءة الاستخدام أو الاحتيال أو محاولة تجاوز الصلاحيات أو تعطيل الخدمة.", "Fraud, abuse, unauthorized access attempts and service disruption are prohibited."],
  ]},
  security: { title: ["مركز الأمان", "Security Center"], intro: ["طبقات دفاع لحماية الهوية والبيانات المالية وتقليل أثر الأخطاء البشرية والتقنية.", "Layered controls protect identity and financial data while reducing human and technical risk."], sections: [
    ["الهوية والوصول", "Identity and access", "كلمات المرور مشتقة بخوارزمية PBKDF2، والجلسات في ملفات HttpOnly، والصلاحيات مفروضة على الخادم.", "Passwords use PBKDF2 derivation, sessions use HttpOnly cookies, and authorization is enforced server-side."],
    ["سلامة الحسابات", "Financial integrity", "تُسجل الحركات المهمة بقيود مزدوجة ومفاتيح منع التكرار وسجل تدقيق لا يحتاج المستخدم إلى كشف الأسرار فيه.", "Important money movements use double-entry journals, idempotency keys and secret-safe audit logs."],
    ["الاستجابة", "Response", "راقب صفحة الحالة ونبّهنا فوراً عند الاشتباه في دخول غير مصرح أو خطأ مالي.", "Monitor service health and notify us promptly about suspected unauthorized access or financial discrepancies."],
  ]},
} as const;

export function LegalPage({ kind }: { kind: keyof typeof content }) {
  const { locale, setLocale } = useCommerceLocale(); const index = locale === "ar" ? 0 : 1; const page = content[kind];
  return <main className="legal-page"><header><Brand /><nav><Link href="/privacy">{locale === "ar" ? "الخصوصية" : "Privacy"}</Link><Link href="/terms">{locale === "ar" ? "الشروط" : "Terms"}</Link><Link href="/security">{locale === "ar" ? "الأمان" : "Security"}</Link></nav><button onClick={() => setLocale(locale === "ar" ? "en" : "ar")}>{locale === "ar" ? "EN" : "عربي"}</button></header><article><small>WAZEN · 2026-08-11</small><h1>{page.title[index]}</h1><p className="lead">{page.intro[index]}</p>{page.sections.map((section) => <section key={section[1]}><h2>{section[index]}</h2><p>{section[index + 2]}</p></section>)}</article></main>;
}

