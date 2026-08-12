"use client";
import { ArrowRight, CreditCard, Download, ReceiptText, WalletCards } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ErrorCard, money, PageLoader, PublicHeader, Status, useCommerceLocale } from "../commercial-kit";

type SubscriptionRow = { name_ar: string; name_en: string; status: string; billing_cycle: string; current_period_end: string; wallet_limit: number; member_limit: number };
type InvoiceRow = { id: string; reference: string; created_at: string; total_minor: number; currency: string; status: string };
type PaymentRow = { id: string; reference: string; method: string; amount_minor: number; currency: string; status: string };
type BillingData = { subscription: SubscriptionRow; invoices: InvoiceRow[]; payments: PaymentRow[] };

export function BillingClient() {
  const router = useRouter(); const { locale, setLocale, l } = useCommerceLocale(); const [data, setData] = useState<BillingData|null>(null); const [error, setError] = useState("");
  useEffect(() => { fetch("/api/platform?view=billing", { cache: "no-store" }).then(async r => { if(r.status===401){router.push("/login?next=/billing");throw new Error();}if (!r.ok) throw new Error(); return await r.json() as BillingData; }).then(setData).catch(() => setError(locale === "ar" ? "تعذر تحميل الفوترة" : "Could not load billing")); }, [locale, router]);
  if (error) return <ErrorCard message={error}/>; if (!data) return <PageLoader/>;
  const sub = data.subscription;
  return <main className="billing-page"><PublicHeader locale={locale} setLocale={setLocale}/><section className="route-wrap"><div className="route-head"><div><small>{l("الحساب / الفوترة", "Account / Billing")}</small><h1>{l("الاشتراك والفوترة", "Subscription & billing")}</h1><p>{l("تابع باقتك وفواتيرك ومدفوعاتك من مكان واحد.", "Manage your plan, invoices and payments in one place.")}</p></div><a className="primary-link" href="/pricing">{l("تغيير الباقة", "Change plan")}<ArrowRight size={17}/></a></div>
    <section className="billing-current"><div><WalletCards/><span>{l("الباقة الحالية", "Current plan")}</span><h2>{locale === "ar" ? sub.name_ar : sub.name_en}</h2><Status value={sub.status} locale={locale}/></div><dl><div><dt>{l("دورة الفوترة", "Billing cycle")}</dt><dd>{sub.billing_cycle === "monthly" ? l("شهرية", "Monthly") : l("سنوية", "Annual")}</dd></div><div><dt>{l("نهاية الفترة", "Period ends")}</dt><dd>{new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-GB", { dateStyle: "medium" }).format(new Date(sub.current_period_end))}</dd></div><div><dt>{l("حد المحافظ", "Wallet limit")}</dt><dd>4 / {sub.wallet_limit}</dd></div><div><dt>{l("حد الأعضاء", "Member limit")}</dt><dd>5 / {sub.member_limit}</dd></div></dl></section>
    <div className="billing-grid"><section className="commerce-table-card"><div className="table-card-head"><h2><ReceiptText/>{l("الفواتير", "Invoices")}</h2><button><Download/>{l("تصدير", "Export")}</button></div><div className="table-scroll"><table><thead><tr><th>{l("المرجع", "Reference")}</th><th>{l("التاريخ", "Date")}</th><th>{l("الإجمالي", "Total")}</th><th>{l("الحالة", "Status")}</th></tr></thead><tbody>{data.invoices.map((row)=><tr key={row.id}><td><code>{row.reference}</code></td><td>{new Date(row.created_at).toLocaleDateString()}</td><td>{money(row.total_minor,locale,row.currency)}</td><td><Status value={row.status} locale={locale}/></td></tr>)}</tbody></table></div></section><section className="commerce-table-card"><div className="table-card-head"><h2><CreditCard/>{l("المدفوعات", "Payments")}</h2></div><div className="table-scroll"><table><thead><tr><th>{l("المرجع", "Reference")}</th><th>{l("الطريقة", "Method")}</th><th>{l("المبلغ", "Amount")}</th><th>{l("الحالة", "Status")}</th></tr></thead><tbody>{data.payments.length ? data.payments.map((row)=><tr key={row.id}><td><code>{row.reference}</code></td><td>{row.method}</td><td>{money(row.amount_minor,locale,row.currency)}</td><td><Status value={row.status} locale={locale}/></td></tr>) : <tr><td colSpan={4}>{l("لا توجد مدفوعات بعد", "No payments yet")}</td></tr>}</tbody></table></div></section></div>
  </section></main>;
}
