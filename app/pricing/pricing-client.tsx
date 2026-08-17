"use client";

import { Check, ChevronDown, ShieldCheck, Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { ErrorCard, money, PageLoader, PublicHeader, useCommerceLocale } from "../commercial-kit";
import { apiFetch } from "../../lib/client-api";
import { errorLabel } from "../../lib/admin-labels";
import { formatQuota } from "../../lib/plan-features";
import { clearDashboardCache } from "../../lib/dashboard-session";
import { notifyLiveRefresh } from "../../lib/live-sync";

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

type InvoiceResult = {
  id: string;
  reference: string;
  subtotal_minor: number;
  discount_minor: number;
  tax_minor: number;
  total_minor: number;
  currency: string;
  status?: string;
};

type SelectResult = {
  error?: string;
  change?: string;
  effectiveAt?: string;
  paymentId?: string;
  planId?: string;
  invoice?: InvoiceResult | null;
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
  const [result, setResult] = useState<SelectResult | null>(null);

  useEffect(() => { fetch("/api/platform?view=pricing").then(async (response) => {
    if (!response.ok) throw new Error(); return response.json();
  }).then((payload: unknown) => setPlans((payload as { plans: Plan[] }).plans)).catch(() => setError(locale === "ar" ? "تعذر تحميل الباقات" : "Could not load plans")).finally(() => setLoading(false)); }, [locale]);

  const validateCoupon = async (event: FormEvent) => {
    event.preventDefault(); setWorking("coupon");
    const response = await fetch("/api/platform", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "validateCoupon", code: coupon }) });
    const payload = await response.json() as { valid: boolean; coupon?: { value: number } }; setDiscount(payload.valid ? Number(payload.coupon?.value ?? 0) : -1); setWorking("");
  };

  const selectPlan = async (planId: string) => {
    setWorking(planId); setError(""); setResult(null);
    try {
      const response = await apiFetch("/api/platform", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "selectPlan", idempotencyKey: crypto.randomUUID(), planId, cycle: annual ? "annual" : "monthly", coupon: discount > 0 ? coupon : "" }) });
      if (response.status === 401) { router.push("/login?next=/pricing"); return; }
      const payload = await response.json() as SelectResult;
      if (!response.ok) {
        setError(errorLabel(payload.error ?? "INTERNAL_ERROR", locale));
        return;
      }
      clearDashboardCache();
      notifyLiveRefresh();
      setResult(payload);
    } catch {
      setError(errorLabel("INTERNAL_ERROR", locale));
    } finally {
      setWorking("");
    }
  };

  const payInvoice = async () => {
    const invoiceId = result?.invoice?.id;
    if (!invoiceId) return;
    setWorking("pay");
    setError("");
    try {
      const response = await apiFetch("/api/platform", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "confirmInvoicePayment", idempotencyKey: crypto.randomUUID(), invoiceId }),
      });
      const payload = await response.json() as { error?: string; ok?: boolean };
      if (!response.ok) {
        setError(errorLabel(payload.error ?? "INTERNAL_ERROR", locale));
        return;
      }
      clearDashboardCache();
      notifyLiveRefresh();
      setResult({
        change: "upgraded",
        planId: result?.planId,
        invoice: result?.invoice ? { ...result.invoice, status: "paid", total_minor: result.invoice.total_minor } : null,
      });
    } catch {
      setError(errorLabel("INTERNAL_ERROR", locale));
    } finally {
      setWorking("");
    }
  };

  if (loading) return <PageLoader />;
  return <main className="pricing-page"><PublicHeader locale={locale} setLocale={setLocale} />
    <section className="pricing-hero"><span><Sparkles size={15}/>{l("خطط واضحة بلا رسوم مخفية", "Transparent plans, no hidden fees")}</span><h1>{l("باقة تنمو مع احتياجك", "A plan that grows with you")}</h1><p>{l("ابدأ مجاناً وانتقل عندما تحتاج محافظ أو أعضاء أو تقارير أكثر.", "Start free and upgrade when you need more wallets, members or reports.")}</p><div className="billing-toggle"><button className={!annual ? "active" : ""} onClick={() => setAnnual(false)}>{l("شهري", "Monthly")}</button><button className={annual ? "active" : ""} onClick={() => setAnnual(true)}>{l("سنوي", "Annual")}<em>{l("وفر 20%", "Save 20%")}</em></button></div></section>
    {error && <ErrorCard message={error} />}
    <section className="pricing-grid">{plans.map((plan, index) => { const price = annual ? plan.annual_minor / 12 : plan.monthly_minor; return <article className={index === 2 ? "popular" : ""} key={plan.id}>{index === 2 && <span className="popular-label">{l("الأكثر اختياراً", "Most popular")}</span>}<small>{l("باقة", "Plan")}</small><h2>{locale === "ar" ? plan.name_ar : plan.name_en}</h2><p>{locale === "ar" ? plan.description_ar : plan.description_en}</p><div className="plan-price"><b>{plan.monthly_minor === 0 ? l("مجاناً", "Free") : money(Math.round(price), locale)}</b>{plan.monthly_minor > 0 && <span>/ {l("شهرياً", "month")}</span>}</div>{annual && plan.monthly_minor > 0 && <em className="annual-note">{l("تدفع سنوياً", "Billed annually")} · {money(plan.annual_minor, locale)}</em>}<button disabled={working === plan.id} onClick={() => void selectPlan(plan.id)}>{working === plan.id ? l("جارٍ التجهيز...", "Preparing...") : plan.monthly_minor === 0 ? l("ابدأ مجاناً", "Start free") : l("اختر الباقة", "Choose plan")}</button><ul><li><Check/>{plan.wallet_limit >= 9999 ? l("محافظ غير محدودة", "Unlimited wallets") : `${plan.wallet_limit} ${l("محافظ", "wallets")}`}</li><li><Check/>{plan.member_limit >= 9999 ? l("أعضاء غير محدودين", "Unlimited members") : `${plan.member_limit} ${l("عضواً", "members")}`}</li><li><Check/>{formatQuota(plan.user_limit ?? 1, locale)} {l("مستخدمين", "users")}</li><li><Check/>{formatQuota(plan.transaction_limit ?? 0, locale)} {l("معاملة", "transactions")}</li><li><Check/>{formatQuota(plan.daily_transaction_limit ?? 0, locale)} {l("معاملة يومياً", "daily transactions")}</li><li><Check/>{formatQuota(plan.monthly_transaction_limit ?? 0, locale)} {l("معاملة شهرياً", "monthly transactions")}</li><li><Check/>{formatQuota(plan.record_limit ?? 0, locale)} {l("سجل", "records")}</li><li><Check/>{formatQuota(plan.print_limit ?? 0, locale)} {l("مطبوعات شهرياً", "prints / month")}</li>{plan.features.map((feature) => <li key={feature}><Check/>{featureCopy[feature]?.[locale === "ar" ? 0 : 1] ?? feature}</li>)}</ul></article>; })}</section>
    <form className="coupon-panel" onSubmit={validateCoupon}><div><span>%</span><p><b>{l("لديك كوبون؟", "Have a coupon?")}</b><small>{l("أدخل الرمز لحساب الخصم", "Enter it to calculate your discount")}</small></p></div><input value={coupon} onChange={(event) => setCoupon(event.target.value.toUpperCase())} placeholder="WAZEN20"/><button disabled={working === "coupon"}>{l("تطبيق", "Apply")}</button>{discount > 0 && <em className="coupon-success">{l(`خصم ${discount}% صالح`, `${discount}% discount applied`)}</em>}{discount === -1 && <em className="coupon-error">{l("الرمز غير صالح", "Invalid code")}</em>}</form>
    <section className="pricing-assurance"><div><ShieldCheck/><h3>{l("بياناتك تبقى لك", "Your data stays yours")}</h3><p>{l("عند تغيير الباقة تبقى البيانات محفوظة ويمكن تنزيلها دائماً.", "Your data remains available and exportable when plans change.")}</p></div><div><ChevronDown/><h3>{l("ترقية مرنة", "Flexible upgrades")}</h3><p>{l("الترقية تُفعَّل فور الدفع. التنزيل يبدأ من اليوم التالي لانتهاء الفترة الحالية.", "Upgrades activate right after payment. Downgrades start the day after the current period ends.")}</p></div></section>
    {result && (
      <div className="commerce-modal-bg">
        <section className="invoice-modal">
          <button type="button" onClick={() => setResult(null)}><X/></button>
          <ShieldCheck size={34}/>
          {result.change === "scheduled_downgrade" ? (
            <>
              <h2>{l("تم جدولة تخفيض الباقة", "Downgrade scheduled")}</h2>
              <p>{l(
                `تبقى باقتك الحالية حتى نهاية الفترة. يبدأ التخفيض من ${result.effectiveAt ? new Intl.DateTimeFormat(locale === "ar" ? "ar-OM" : "en-GB", { dateStyle: "medium" }).format(new Date(result.effectiveAt)) : "—"}.`,
                `Your current plan stays until the period ends. The lower plan starts on ${result.effectiveAt ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(result.effectiveAt)) : "—"}.`,
              )}</p>
            </>
          ) : result.change === "upgrade_pending_payment" && result.invoice ? (
            <>
              <h2>{l("ادفع لتفعيل الترقية", "Pay to activate the upgrade")}</h2>
              <p>{l("باقتك الحالية تبقى كما هي حتى يكتمل الدفع. بعد الدفع تُفعَّل الباقة الجديدة فوراً.", "Your current plan stays until payment completes. After payment the new plan activates immediately.")}</p>
              <dl>
                <div><dt>{l("الرقم المرجعي", "Reference")}</dt><dd>{result.invoice.reference}</dd></div>
                <div><dt>{l("المجموع قبل الضريبة", "Subtotal")}</dt><dd>{money(Number(result.invoice.subtotal_minor), locale, result.invoice.currency)}</dd></div>
                <div><dt>{l("الخصم", "Discount")}</dt><dd>{money(Number(result.invoice.discount_minor), locale, result.invoice.currency)}</dd></div>
                <div><dt>{l("الضريبة", "Tax")}</dt><dd>{money(Number(result.invoice.tax_minor), locale, result.invoice.currency)}</dd></div>
                <div><dt>{l("الإجمالي", "Total")}</dt><dd>{money(Number(result.invoice.total_minor), locale, result.invoice.currency)}</dd></div>
              </dl>
              <button type="button" className="primary-link" disabled={working === "pay"} onClick={() => void payInvoice()}>
                {working === "pay" ? l("جارٍ التأكيد...", "Confirming...") : l("تأكيد الدفع وتفعيل الباقة", "Confirm payment & activate")}
              </button>
            </>
          ) : (
            <>
              <h2>{l("تم تفعيل الباقة", "Plan activated")}</h2>
              <p>{l("باقتك محدّثة الآن ويمكنك استخدام الميزات الجديدة مباشرة.", "Your plan is updated and the new features are available now.")}</p>
              {result.invoice ? (
                <dl>
                  <div><dt>{l("الرقم المرجعي", "Reference")}</dt><dd>{result.invoice.reference}</dd></div>
                  <div><dt>{l("الإجمالي", "Total")}</dt><dd>{money(Number(result.invoice.total_minor), locale, result.invoice.currency)}</dd></div>
                </dl>
              ) : null}
            </>
          )}
          <a href="/billing">{l("فتح الفوترة", "Open billing")}</a>
          <a href="/dashboard">{l("لوحة المستخدم", "Dashboard")}</a>
        </section>
      </div>
    )}
  </main>;
}
