"use client";
import { ArrowRight, CreditCard, Download, ReceiptText, WalletCards } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ErrorCard, money, PageLoader, AccountHeader, Status, useCommerceLocale } from "../commercial-kit";
import { PLAN_FEATURE_CATALOG, formatQuota, planHasFeature } from "../../lib/plan-features";
import { userGraceWarningCopy } from "../../lib/plan-retention-rules";
import { apiFetch } from "../../lib/client-api";
import { errorLabel } from "../../lib/admin-labels";
import { clearDashboardCache } from "../../lib/dashboard-session";
import { notifyLiveRefresh } from "../../lib/live-sync";

type SubscriptionRow = {
  name_ar: string;
  name_en: string;
  status: string;
  billing_cycle: string;
  current_period_end: string;
  wallet_limit: number;
  member_limit: number;
  transaction_limit?: number;
  record_limit?: number;
  user_limit?: number;
  daily_transaction_limit?: number;
  monthly_transaction_limit?: number;
  print_limit?: number;
  pending_plan_id?: string | null;
  pending_effective_at?: string | null;
  pending_plan_name_ar?: string | null;
  pending_plan_name_en?: string | null;
};
type InvoiceRow = { id: string; reference: string; created_at: string; total_minor: number; currency: string; status: string; target_plan_id?: string | null };
type PaymentRow = { id: string; reference: string; method: string; amount_minor: number; currency: string; status: string };
type BillingData = {
  subscription?: SubscriptionRow | null;
  invoices: InvoiceRow[];
  payments: PaymentRow[];
  entitlements?: {
    features: string[];
    walletLimit: number;
    memberLimit: number;
    transactionLimit?: number;
    recordLimit?: number;
    userLimit?: number;
    dailyTransactionLimit?: number;
    monthlyTransactionLimit?: number;
    printLimit?: number;
    status: string;
    retention?: { graceEndsAt: string; spaceCount: number; spaceTypes: string[]; userVisibleDays: number } | null;
  };
};

export function BillingClient() {
  const router = useRouter();
  const { locale, setLocale, l } = useCommerceLocale();
  const [data, setData] = useState<BillingData | null>(null);
  const [error, setError] = useState("");
  const [payingId, setPayingId] = useState("");

  const load = () => {
    fetch("/api/platform?view=billing", { cache: "no-store" }).then(async (r) => {
      if (r.status === 401) { router.push("/login?next=/billing"); throw new Error(); }
      if (!r.ok) throw new Error();
      return await r.json() as BillingData;
    }).then(setData).catch(() => setError(locale === "ar" ? "تعذر تحميل الفوترة" : "Could not load billing"));
  };

  useEffect(() => { load(); }, [locale, router]);

  const payInvoice = async (invoiceId: string) => {
    setPayingId(invoiceId);
    setError("");
    try {
      const response = await apiFetch("/api/platform", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "confirmInvoicePayment", idempotencyKey: crypto.randomUUID(), invoiceId }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) {
        setError(errorLabel(result.error ?? "INTERNAL_ERROR", locale));
        return;
      }
      clearDashboardCache();
      notifyLiveRefresh();
      load();
    } catch {
      setError(errorLabel("INTERNAL_ERROR", locale));
    } finally {
      setPayingId("");
    }
  };

  if (error && !data) return <ErrorCard message={error} />;
  if (!data) return <PageLoader />;
  const sub = data.subscription;
  const features = data.entitlements?.features?.length ? data.entitlements.features : ["personal"];
  const canExport = planHasFeature(features, "exports");
  return (
    <main className="billing-page">
      <AccountHeader locale={locale} setLocale={setLocale} active="billing" />
      <section className="route-wrap">
        <div className="route-head">
          <div>
            <small>{l("الحساب / الفوترة", "Account / Billing")}</small>
            <h1>{l("الاشتراك والفوترة", "Subscription & billing")}</h1>
            <p>{l("تابع باقتك وفواتيرك ومدفوعاتك من مكان واحد.", "Manage your plan, invoices and payments in one place.")}</p>
          </div>
          <a className="primary-link" href="/pricing">{l("تغيير الباقة", "Change plan")}<ArrowRight size={17} /></a>
        </div>
        {error ? <p className="admin-inline-alert is-error">{error}</p> : null}
        {data.entitlements?.retention ? (() => {
          const notice = userGraceWarningCopy(locale, data.entitlements.retention.graceEndsAt, data.entitlements.retention.spaceCount);
          return (
            <div className="retention-warning" role="status">
              <div>
                <strong>{notice.title}</strong>
                <p>{notice.text}</p>
              </div>
              <a href="/pricing">{l("ترقية الباقة", "Upgrade plan")}</a>
            </div>
          );
        })() : null}
        <section className="billing-current">
          <div>
            <WalletCards />
            <span>{l("الباقة الحالية", "Current plan")}</span>
            <h2>{sub ? (locale === "ar" ? sub.name_ar : sub.name_en) : l("المجانية", "Starter")}</h2>
            {sub ? <Status value={sub.status} locale={locale} /> : null}
          </div>
          <dl>
            <div>
              <dt>{l("دورة الفوترة", "Billing cycle")}</dt>
              <dd>{sub ? (sub.billing_cycle === "monthly" ? l("شهرية", "Monthly") : l("سنوية", "Annual")) : "—"}</dd>
            </div>
            <div>
              <dt>{l("نهاية الفترة", "Period ends")}</dt>
              <dd>{sub ? new Intl.DateTimeFormat(locale === "ar" ? "ar-OM" : "en-GB", { dateStyle: "medium" }).format(new Date(sub.current_period_end)) : "—"}</dd>
            </div>
            <div>
              <dt>{l("حد المحافظ", "Wallet limit")}</dt>
              <dd>{formatQuota(data.entitlements?.walletLimit ?? sub?.wallet_limit ?? 1, locale)}</dd>
            </div>
            <div>
              <dt>{l("حد الأعضاء", "Member limit")}</dt>
              <dd>{formatQuota(data.entitlements?.memberLimit ?? sub?.member_limit ?? 2, locale)}</dd>
            </div>
            <div>
              <dt>{l("المستخدمون", "Users")}</dt>
              <dd>{formatQuota(data.entitlements?.userLimit ?? sub?.user_limit ?? 1, locale)}</dd>
            </div>
            <div>
              <dt>{l("المعاملات", "Transactions")}</dt>
              <dd>{formatQuota(data.entitlements?.transactionLimit ?? sub?.transaction_limit ?? 0, locale)}</dd>
            </div>
            <div>
              <dt>{l("يومياً", "Daily")}</dt>
              <dd>{formatQuota(data.entitlements?.dailyTransactionLimit ?? sub?.daily_transaction_limit ?? 0, locale)}</dd>
            </div>
            <div>
              <dt>{l("شهرياً", "Monthly")}</dt>
              <dd>{formatQuota(data.entitlements?.monthlyTransactionLimit ?? sub?.monthly_transaction_limit ?? 0, locale)}</dd>
            </div>
            <div>
              <dt>{l("السجلات", "Records")}</dt>
              <dd>{formatQuota(data.entitlements?.recordLimit ?? sub?.record_limit ?? 0, locale)}</dd>
            </div>
            <div>
              <dt>{l("المطبوعات", "Prints")}</dt>
              <dd>{formatQuota(data.entitlements?.printLimit ?? sub?.print_limit ?? 0, locale)}</dd>
            </div>
          </dl>
        </section>
        {sub?.pending_plan_id && sub.pending_effective_at ? (
          <section className="panel billing-features">
            <h2>{l("تخفيض مجدول", "Scheduled downgrade")}</h2>
            <p>{l(
              `ستنتقل إلى «${locale === "ar" ? (sub.pending_plan_name_ar ?? sub.pending_plan_id) : (sub.pending_plan_name_en ?? sub.pending_plan_id)}» من ${new Intl.DateTimeFormat(locale === "ar" ? "ar-OM" : "en-GB", { dateStyle: "medium" }).format(new Date(sub.pending_effective_at))} (اليوم التالي لانتهاء الفترة الحالية). بعدها تبقى المحافظ غير المشمولة ظاهرة 15 يوماً ثم تُحذف من حسابك.`,
              `You will move to “${sub.pending_plan_name_en ?? sub.pending_plan_id}” on ${new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(sub.pending_effective_at))} (the day after the current period ends). Out-of-plan wallets then stay visible for 15 days before they are removed from your account.`,
            )}</p>
          </section>
        ) : null}
        <section className="panel billing-features">
          <h2>{l("ميزات الباقة", "Plan features")}</h2>
          <p>{l("كل الميزات ظاهرة. ما ليس مشمولاً يحمل شارة ترقية.", "Every feature stays listed. Locked items show an upgrade badge.")}</p>
          <ul className="plan-feature-list">
            {PLAN_FEATURE_CATALOG.map((item) => {
              const included = planHasFeature(features, item.id);
              return (
                <li key={item.id} className={included ? "is-included" : "is-locked"}>
                  <span>
                    {locale === "ar" ? item.ar : item.en}
                    {included ? null : <em className="plan-lock-badge">{locale === "ar" ? "ترقية" : "Upgrade"}</em>}
                  </span>
                  {included ? (
                    <span className="muted">{l("مشمولة", "Included")}</span>
                  ) : (
                    <a className="text-link" href="/pricing">{l("ترقية", "Upgrade")}</a>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
        <div className="billing-grid">
          <section className="commerce-table-card">
            <div className="table-card-head">
              <h2><ReceiptText />{l("الفواتير", "Invoices")}</h2>
              <button
                type="button"
                className={canExport ? "" : "is-plan-locked"}
                onClick={() => { if (!canExport) router.push("/pricing"); }}
              >
                <Download />{l("تصدير", "Export")}
                {canExport ? null : <em className="plan-lock-badge">{locale === "ar" ? "ترقية" : "Upgrade"}</em>}
              </button>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>{l("المرجع", "Reference")}</th>
                    <th>{l("التاريخ", "Date")}</th>
                    <th>{l("الإجمالي", "Total")}</th>
                    <th>{l("الحالة", "Status")}</th>
                    <th>{l("إجراء", "Action")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.invoices.map((row) => (
                    <tr key={row.id}>
                      <td><code>{row.reference}</code></td>
                      <td>{new Intl.DateTimeFormat(locale === "ar" ? "ar-OM" : "en-GB").format(new Date(row.created_at))}</td>
                      <td>{money(row.total_minor, locale, row.currency)}</td>
                      <td><Status value={row.status} locale={locale} /></td>
                      <td>
                        {row.status === "pending" ? (
                          <button type="button" disabled={payingId === row.id} onClick={() => void payInvoice(row.id)}>
                            {payingId === row.id ? l("جارٍ...", "Paying...") : l("تأكيد الدفع", "Confirm payment")}
                          </button>
                        ) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="commerce-table-card">
            <div className="table-card-head"><h2><CreditCard />{l("المدفوعات", "Payments")}</h2></div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>{l("المرجع", "Reference")}</th>
                    <th>{l("الطريقة", "Method")}</th>
                    <th>{l("المبلغ", "Amount")}</th>
                    <th>{l("الحالة", "Status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.payments.length ? data.payments.map((row) => (
                    <tr key={row.id}>
                      <td><code>{row.reference}</code></td>
                      <td>{row.method}</td>
                      <td>{money(row.amount_minor, locale, row.currency)}</td>
                      <td><Status value={row.status} locale={locale} /></td>
                    </tr>
                  )) : <tr><td colSpan={4}>{l("لا توجد مدفوعات بعد", "No payments yet")}</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
