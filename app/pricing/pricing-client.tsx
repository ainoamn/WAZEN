"use client";

import { Check, ChevronDown, ShieldCheck, Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { ErrorCard, money, PageLoader, PublicHeader, useCommerceLocale } from "../commercial-kit";
import { apiFetch } from "../../lib/client-api";
import { formatQuota } from "../../lib/plan-features";

type Plan = { id: string; name_ar: string; name_en: string; description_ar: string; description_en: string; monthly_minor: number; annual_minor: number; wallet_limit: number; member_limit: number; transaction_limit?: number; record_limit?: number; user_limit?: number; daily_transaction_limit?: number; monthly_transaction_limit?: number; print_limit?: number; features: string[] };
const featureCopy: Record<string, [string, string]> = {
  personal: ["محفظة شخصية", "Personal wallet"], basic_reports: ["تقارير أساسية", "Basic reports"], household: ["محفظة منزلية", "Household wallet"],
  travel: ["السفر والرحلات", "Trips & travel"], circle: ["الجمعيات", "Savings circles"], exports: ["تصدير التقارير", "Report exports"],
  all_wallets: ["جميع أنواع المحافظ", "All wallet types"], documents: ["الإيصالات والكشوفات", "Receipts & statements"], draws: ["القرعة الإلكترونية", "Electronic draws"],
  voting: ["التصويت", "Voting"], advanced_reports: ["تقارير متقدمة", "Advanced reports"], custom_roles: ["صلاحيات مخصصة", "Custom roles"],
  unlimited: ["استخدام غير محدود", "Unlimited usage"], multi_approval: ["موافقات متعددة", "Multi-approval"], audit: ["سجل تدقيق", "Audit trail"], api: ["واجهة API", "API access"], priority_support: ["دعم أولوية", "Priority support"],
  email: ["إرسال بالبريد", "Send by email"], whatsapp: ["إرسال واتساب", "Send on WhatsApp"], downloads: ["تنزيل الإيصالات", "Download receipts"],
  statements: ["كشوف الحساب والطباعة", "Statements & print"], trips: ["محافظ السفر", "Travel wallets"], circles: ["الجمعيات والمجموعات", "Circles & groups"],
};

export function PricingClient() {
  const router = useRouter();
  const { locale, setLocale, l } = useCommerceLocale();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [annual, setAnnual] = useState(true);
  const [coupon, setCoupon] = useState("");
  const [discount, setDiscount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [working, setWorking] = useState("");
  const [invoice, setInvoice] = useState<Record<string, unknown> | null>(null);

  useEffect(() => { fetch("/api/platform?view=pricing").then(async (response) => {
    if (!response.ok) throw new Error(); return response.json();
  }).then((result: unknown) => setPlans((result as { plans: Plan[] }).plans)).catch(() => setError(locale === "ar" ? "تعذر تحميل الباقات" : "Could not load plans")).finally(() => setLoading(false)); }, [locale]);

  const validateCoupon = async (event: FormEvent) => {
    event.preventDefault(); setWorking("coupon");
    const response = await fetch("/api/platform", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "validateCoupon", code: coupon }) });
    const result = await response.json() as { valid: boolean; coupon?: { value: number } }; setDiscount(result.valid ? Number(result.coupon?.value ?? 0) : -1); setWorking("");
  };

  const selectPlan = async (planId: string) => {
    setWorking(planId); setError("");
    const response = await apiFetch("/api/platform", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "selectPlan", idempotencyKey: crypto.randomUUID(), planId, cycle: annual ? "annual" : "monthly", coupon: discount > 0 ? coupon : "" }) });
    if (response.status === 401) { router.push("/login?next=/pricing"); return; }
    const result = await response.json() as { error?: string; invoice?: Record<string, unknown> };
    if (!response.ok) setError(result.error ?? l("تعذر إنشاء الاشتراك", "Could not create subscription")); else setInvoice(result.invoice ?? null);
    setWorking("");
  };

  if (loading) return <PageLoader />;
  return <main className="pricing-page"><PublicHeader locale={locale} setLocale={setLocale} />
    <section className="pricing-hero"><span><Sparkles size={15}/>{l("خطط واضحة بلا رسوم مخفية", "Transparent plans, no hidden fees")}</span><h1>{l("باقة تنمو مع احتياجك", "A plan that grows with you")}</h1><p>{l("ابدأ مجاناً وانتقل عندما تحتاج محافظ أو أعضاء أو تقارير أكثر.", "Start free and upgrade when you need more wallets, members or reports.")}</p><div className="billing-toggle"><button className={!annual ? "active" : ""} onClick={() => setAnnual(false)}>{l("شهري", "Monthly")}</button><button className={annual ? "active" : ""} onClick={() => setAnnual(true)}>{l("سنوي", "Annual")}<em>{l("وفر 20%", "Save 20%")}</em></button></div></section>
    {error && <ErrorCard message={error} />}
    <section className="pricing-grid">{plans.map((plan, index) => { const price = annual ? plan.annual_minor / 12 : plan.monthly_minor; return <article className={index === 2 ? "popular" : ""} key={plan.id}>{index === 2 && <span className="popular-label">{l("الأكثر اختياراً", "Most popular")}</span>}<small>{l("باقة", "Plan")}</small><h2>{locale === "ar" ? plan.name_ar : plan.name_en}</h2><p>{locale === "ar" ? plan.description_ar : plan.description_en}</p><div className="plan-price"><b>{plan.monthly_minor === 0 ? l("مجاناً", "Free") : money(Math.round(price), locale)}</b>{plan.monthly_minor > 0 && <span>/ {l("شهرياً", "month")}</span>}</div>{annual && plan.monthly_minor > 0 && <em className="annual-note">{l("تدفع سنوياً", "Billed annually")} · {money(plan.annual_minor, locale)}</em>}<button disabled={working === plan.id} onClick={() => void selectPlan(plan.id)}>{working === plan.id ? l("جارٍ التجهيز...", "Preparing...") : plan.monthly_minor === 0 ? l("ابدأ مجاناً", "Start free") : l("اختر الباقة", "Choose plan")}</button><ul><li><Check/>{plan.wallet_limit >= 9999 ? l("محافظ غير محدودة", "Unlimited wallets") : `${plan.wallet_limit} ${l("محافظ", "wallets")}`}</li><li><Check/>{plan.member_limit >= 9999 ? l("أعضاء غير محدودين", "Unlimited members") : `${plan.member_limit} ${l("عضواً", "members")}`}</li><li><Check/>{formatQuota(plan.user_limit ?? 1, locale)} {l("مستخدمين", "users")}</li><li><Check/>{formatQuota(plan.transaction_limit ?? 0, locale)} {l("معاملة", "transactions")}</li><li><Check/>{formatQuota(plan.daily_transaction_limit ?? 0, locale)} {l("معاملة يومياً", "daily transactions")}</li><li><Check/>{formatQuota(plan.monthly_transaction_limit ?? 0, locale)} {l("معاملة شهرياً", "monthly transactions")}</li><li><Check/>{formatQuota(plan.record_limit ?? 0, locale)} {l("سجل", "records")}</li><li><Check/>{formatQuota(plan.print_limit ?? 0, locale)} {l("مطبوعات شهرياً", "prints / month")}</li>{plan.features.map((feature) => <li key={feature}><Check/>{featureCopy[feature]?.[locale === "ar" ? 0 : 1] ?? feature}</li>)}</ul></article>; })}</section>
    <form className="coupon-panel" onSubmit={validateCoupon}><div><span>%</span><p><b>{l("لديك كوبون؟", "Have a coupon?")}</b><small>{l("أدخل الرمز لحساب الخصم", "Enter it to calculate your discount")}</small></p></div><input value={coupon} onChange={(event) => setCoupon(event.target.value.toUpperCase())} placeholder="WAZEN20"/><button disabled={working === "coupon"}>{l("تطبيق", "Apply")}</button>{discount > 0 && <em className="coupon-success">{l(`خصم ${discount}% صالح`, `${discount}% discount applied`)}</em>}{discount === -1 && <em className="coupon-error">{l("الرمز غير صالح", "Invalid code")}</em>}</form>
    <section className="pricing-assurance"><div><ShieldCheck/><h3>{l("بياناتك تبقى لك", "Your data stays yours")}</h3><p>{l("عند تغيير الباقة تبقى البيانات محفوظة ويمكن تنزيلها دائماً.", "Your data remains available and exportable when plans change.")}</p></div><div><ChevronDown/><h3>{l("ترقية مرنة", "Flexible upgrades")}</h3><p>{l("الترقية فورية، والتخفيض يبدأ في دورة الفوترة التالية.", "Upgrades are immediate; downgrades start next cycle.")}</p></div></section>
    {invoice && <div className="commerce-modal-bg"><section className="invoice-modal"><button onClick={() => setInvoice(null)}><X/></button><ShieldCheck size={34}/><h2>{l("تم إنشاء طلب الاشتراك", "Subscription request created")}</h2><p>{l("أصدر النظام فاتورة معلقة. اربط بوابة الدفع المرخصة لتحصيلها تلقائياً.", "A pending invoice was created. Connect a licensed payment provider for automatic collection.")}</p><dl><div><dt>{l("الرقم المرجعي", "Reference")}</dt><dd>{String(invoice.reference)}</dd></div><div><dt>{l("المجموع قبل الضريبة", "Subtotal")}</dt><dd>{money(Number(invoice.subtotal_minor), locale)}</dd></div><div><dt>{l("الخصم", "Discount")}</dt><dd>{money(Number(invoice.discount_minor), locale)}</dd></div><div><dt>{l("الضريبة", "Tax")}</dt><dd>{money(Number(invoice.tax_minor), locale)}</dd></div><div><dt>{l("الإجمالي", "Total")}</dt><dd>{money(Number(invoice.total_minor), locale)}</dd></div></dl><a href="/billing">{l("فتح الفوترة", "Open billing")}</a></section></div>}
  </main>;
}
