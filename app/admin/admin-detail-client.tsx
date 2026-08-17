"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { CreditCard, Search, ShieldCheck, Users, WalletCards } from "lucide-react";
import { ContentBusy, ErrorCard, money, Status, useCommerceLocale } from "../commercial-kit";
import { apiFetch } from "../../lib/client-api";
import { DateField } from "../../components/ui/date-field";
import { PLAN_FEATURE_CATALOG } from "../../lib/plan-features";
import { fetchAdminConsole, readAdminConsole } from "../../lib/admin-session";

type Row = Record<string, unknown>;

type UserDetail = {
  profile: Row;
  sessions: Row[];
  apiKeys: Row[];
  spaces: Row[];
  tenants: Row[];
  audit: Row[];
  billing?: {
    subscriptions: Row[];
    invoices: Row[];
    payments: Row[];
    couponRedemptions: Row[];
  };
};

function applyProfileToForm(
  profile: Row,
  setters: {
    setPlanId: (v: string) => void;
    setStatus: (v: string) => void;
    setAccountStatus: (v: string) => void;
    setDisplayName: (v: string) => void;
    setBillingCycle: (v: string) => void;
    setPeriodEnd: (v: string) => void;
    setDiscountPercent: (v: string) => void;
    setDiscountFixed: (v: string) => void;
    setDiscountLabel: (v: string) => void;
    setAdminNote: (v: string) => void;
    setFeaturesGrant: (v: string[]) => void;
    setFeaturesDeny: (v: string[]) => void;
    setWalletLimitOverride: (v: string) => void;
    setMemberLimitOverride: (v: string) => void;
    setTransactionLimitOverride: (v: string) => void;
    setRecordLimitOverride: (v: string) => void;
    setUserLimitOverride: (v: string) => void;
  },
) {
  setters.setPlanId(String(profile.plan_id ?? "starter"));
  setters.setStatus(String(profile.subscription_status ?? "active"));
  setters.setAccountStatus(String(profile.status ?? "active"));
  setters.setDisplayName(String(profile.display_name ?? ""));
  setters.setBillingCycle(String(profile.billing_cycle ?? "monthly"));
  setters.setPeriodEnd(profile.current_period_end ? String(profile.current_period_end).slice(0, 10) : "");
  setters.setDiscountPercent(String(profile.discount_percent ?? 0));
  setters.setDiscountFixed(String(profile.discount_fixed_minor ?? 0));
  setters.setDiscountLabel(String(profile.discount_label ?? ""));
  setters.setAdminNote(String(profile.admin_note ?? ""));
  setters.setFeaturesGrant(Array.isArray(profile.features_grant) ? profile.features_grant.map(String) : []);
  setters.setFeaturesDeny(Array.isArray(profile.features_deny) ? profile.features_deny.map(String) : []);
  setters.setWalletLimitOverride(String(profile.wallet_limit_override ?? 0));
  setters.setMemberLimitOverride(String(profile.member_limit_override ?? 0));
  setters.setTransactionLimitOverride(String(profile.transaction_limit_override ?? 0));
  setters.setRecordLimitOverride(String(profile.record_limit_override ?? 0));
  setters.setUserLimitOverride(String(profile.user_limit_override ?? 0));
}

export function AdminUserDetail() {
  const { locale, l } = useCommerceLocale();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const userId = params.id;
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [plans, setPlans] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reason, setReason] = useState("");
  const [working, setWorking] = useState(false);
  const [planId, setPlanId] = useState("");
  const [status, setStatus] = useState("active");
  const [accountStatus, setAccountStatus] = useState("active");
  const [displayName, setDisplayName] = useState("");
  const [billingCycle, setBillingCycle] = useState("monthly");
  const [periodEnd, setPeriodEnd] = useState("");
  const [discountPercent, setDiscountPercent] = useState("0");
  const [discountFixed, setDiscountFixed] = useState("0");
  const [discountLabel, setDiscountLabel] = useState("");
  const [adminNote, setAdminNote] = useState("");
  const [featuresGrant, setFeaturesGrant] = useState<string[]>([]);
  const [featuresDeny, setFeaturesDeny] = useState<string[]>([]);
  const [walletLimitOverride, setWalletLimitOverride] = useState("0");
  const [memberLimitOverride, setMemberLimitOverride] = useState("0");
  const [transactionLimitOverride, setTransactionLimitOverride] = useState("0");
  const [recordLimitOverride, setRecordLimitOverride] = useState("0");
  const [userLimitOverride, setUserLimitOverride] = useState("0");

  const syncForm = useCallback((profile: Row) => {
    applyProfileToForm(profile, {
      setPlanId, setStatus, setAccountStatus, setDisplayName, setBillingCycle,
      setPeriodEnd, setDiscountPercent, setDiscountFixed, setDiscountLabel, setAdminNote,
      setFeaturesGrant, setFeaturesDeny, setWalletLimitOverride, setMemberLimitOverride,
      setTransactionLimitOverride, setRecordLimitOverride, setUserLimitOverride,
    });
  }, []);

  const load = useCallback(() => {
    setError("");
    fetch(`/api/platform?view=admin&scope=users&userId=${encodeURIComponent(userId)}`, { cache: "no-store", credentials: "same-origin" })
      .then(async (userRes) => {
        if (userRes.status === 401) {
          router.push(`/login?next=${encodeURIComponent(`/admin/users/${userId}`)}`);
          throw new Error("AUTH");
        }
        const userResult = await userRes.json() as { error?: string; detail?: UserDetail; plans?: Row[] };
        if (!userRes.ok) throw new Error(userResult.error ?? "LOAD");
        if (userResult.plans?.length) setPlans(userResult.plans);
        return userResult.detail!;
      })
      .then((next) => {
        setDetail(next);
        syncForm(next.profile);
      })
      .catch((caught: Error) => setError(caught.message === "FORBIDDEN" ? "FORBIDDEN" : caught.message || "LOAD"));
  }, [router, syncForm, userId]);

  useEffect(() => { void load(); }, [load]);

  const revokeSessions = async (event: FormEvent) => {
    event.preventDefault();
    setWorking(true);
    setError("");
    setNotice("");
    try {
      const response = await apiFetch("/api/platform", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "revokeUserSessions", idempotencyKey: crypto.randomUUID(), userId, reason }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "REVOKE_FAILED");
      setReason("");
      setNotice(l("تم إلغاء الجلسات.", "Sessions revoked."));
      void load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "REVOKE_FAILED");
    } finally {
      setWorking(false);
    }
  };

  const saveAccount = async (event: FormEvent) => {
    event.preventDefault();
    setWorking(true);
    setError("");
    setNotice("");
    try {
      const response = await apiFetch("/api/platform", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "adminUpdateUser",
          idempotencyKey: crypto.randomUUID(),
          userId,
          displayName: displayName.trim(),
          status: accountStatus,
        }),
      });
      const result = await response.json() as { error?: string; detail?: UserDetail };
      if (!response.ok) throw new Error(result.error ?? "SAVE_FAILED");
      if (result.detail) {
        setDetail(result.detail);
        syncForm(result.detail.profile);
      } else void load();
      setNotice(l("تم حفظ بيانات الحساب.", "Account details saved."));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "SAVE_FAILED");
    } finally {
      setWorking(false);
    }
  };

  const verifyEmail = async () => {
    setWorking(true);
    setError("");
    setNotice("");
    try {
      const response = await apiFetch("/api/platform", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "adminVerifyEmail", idempotencyKey: crypto.randomUUID(), userId }),
      });
      const result = await response.json() as { error?: string; detail?: UserDetail; alreadyVerified?: boolean };
      if (!response.ok) throw new Error(result.error ?? "VERIFY_FAILED");
      if (result.detail) {
        setDetail(result.detail);
        syncForm(result.detail.profile);
      } else void load();
      setNotice(result.alreadyVerified
        ? l("البريد مفعّل مسبقاً.", "Email was already verified.")
        : l("تم تفعيل الحساب يدوياً. يمكن للمستخدم تسجيل الدخول الآن.", "Account activated manually. The user can sign in now."));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "VERIFY_FAILED");
    } finally {
      setWorking(false);
    }
  };

  const saveSubscription = async (event: FormEvent, pause?: boolean) => {
    event.preventDefault();
    setWorking(true);
    setError("");
    setNotice("");
    try {
      if (!planId) throw new Error("PLAN_REQUIRED");
      const response = await apiFetch("/api/platform", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "adminUpdateSubscription",
          idempotencyKey: crypto.randomUUID(),
          userId,
          planId,
          status: pause === undefined ? status : undefined,
          billingCycle,
          periodEnd: periodEnd || undefined,
          discountPercent: Number(discountPercent || 0),
          discountFixedMinor: Number(discountFixed || 0),
          discountLabel: discountLabel || null,
          adminNote: adminNote || null,
          pause,
          featuresGrant,
          featuresDeny,
          walletLimitOverride: Number(walletLimitOverride || 0) || null,
          memberLimitOverride: Number(memberLimitOverride || 0) || null,
          transactionLimitOverride: Number(transactionLimitOverride || 0) || null,
          recordLimitOverride: Number(recordLimitOverride || 0) || null,
          userLimitOverride: Number(userLimitOverride || 0) || null,
        }),
      });
      const result = await response.json() as { error?: string; detail?: UserDetail };
      if (!response.ok) throw new Error(result.error ?? "SAVE_FAILED");
      if (result.detail) {
        setDetail(result.detail);
        syncForm(result.detail.profile);
      } else void load();
      setNotice(
        pause === true
          ? l("تم إيقاف الاشتراك.", "Subscription paused.")
          : pause === false
            ? l("تم استئناف الاشتراك.", "Subscription resumed.")
            : l("تم حفظ الاشتراك.", "Subscription saved."),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "SAVE_FAILED");
    } finally {
      setWorking(false);
    }
  };

  if (error && !detail) {
    return <ErrorCard message={error === "FORBIDDEN" ? l("لا تملك صلاحية", "Forbidden") : l("تعذر التحميل", "Load failed")} retry={load} />;
  }
  if (!detail) return <ContentBusy />;
  const profile = detail.profile;
  const billing = detail.billing;
  const emailVerified = Boolean(profile.email_verified_at);
  const fmt = (value: unknown) => value ? new Date(String(value)).toLocaleString(locale === "ar" ? "ar" : "en-GB") : "—";
  const errorLabel = (code: string) => {
    const map: Record<string, [string, string]> = {
      INVALID_SUBSCRIPTION_UPDATE: ["بيانات الاشتراك غير صالحة", "Invalid subscription data"],
      SUBSCRIPTION_NOT_FOUND: ["تعذر العثور على الاشتراك أو الباقة", "Subscription or plan not found"],
      PLAN_REQUIRED: ["اختر باقة أولاً", "Choose a plan first"],
      FORBIDDEN: ["لا تملك صلاحية", "Forbidden"],
      NO_CREDENTIALS: ["لا توجد بيانات دخول لهذا المستخدم", "User has no login credentials"],
      CANNOT_SUSPEND_SELF: ["لا يمكن إيقاف حسابك أنت", "You cannot suspend your own account"],
      INVALID_USER_UPDATE: ["بيانات الحساب غير صالحة", "Invalid account data"],
    };
    return map[code] ? (locale === "ar" ? map[code][0] : map[code][1]) : code;
  };

  return (
    <>
      <div className="admin-page-head">
        <div>
          <small><Link href="/admin/users">{l("المستخدمون", "Users")}</Link> / {String(profile.email)}</small>
          <h1>{String(profile.display_name)}</h1>
          <p>{l("الاشتراك والخصومات والمعاملات والجلسات.", "Subscription, discounts, transactions and sessions.")}</p>
        </div>
        <Status value={String(profile.status ?? "active")} locale={locale} />
      </div>

      {(error || notice) && (
        <div className={`admin-inline-alert ${error ? "is-error" : "is-ok"}`} role="status">
          {error ? errorLabel(error) : notice}
        </div>
      )}

      <div className="admin-kpis">
        <article><i><WalletCards /></i><span>{l("الباقة", "Plan")}</span><b>{String(profile.plan_name_ar ?? profile.plan_name_en ?? "—")}</b><small><Status value={String(profile.subscription_status ?? "pending")} locale={locale} /></small></article>
        <article><i><CreditCard /></i><span>{l("ينتهي", "Ends")}</span><b>{profile.current_period_end ? new Date(String(profile.current_period_end)).toLocaleDateString(locale === "ar" ? "ar" : "en-GB") : "—"}</b><small>{String(profile.billing_cycle ?? "—")}</small></article>
        <article><i><Users /></i><span>{l("خصم خاص", "Special discount")}</span><b>{Number(profile.discount_percent ?? 0)}% + {money(Number(profile.discount_fixed_minor ?? 0), locale)}</b><small>{String(profile.discount_label ?? "—")}</small></article>
        <article><i><ShieldCheck /></i><span>{l("البريد", "Email")}</span><b>{emailVerified ? l("مفعّل", "Verified") : l("غير مفعّل", "Unverified")}</b><small>{String(profile.role)}</small></article>
      </div>

      <section className="admin-panel">
        <div className="admin-panel-head">
          <div>
            <h2>{l("بيانات الحساب", "Account details")}</h2>
            <p>{l("تعديل الاسم وحالة الحساب وتفعيل البريد يدوياً.", "Edit name, account status, and manually verify email.")}</p>
          </div>
        </div>
        <form className="admin-account-form" onSubmit={(event) => void saveAccount(event)}>
          <label>
            <span>{l("الاسم الظاهر", "Display name")}</span>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required minLength={2} maxLength={120} />
          </label>
          <label>
            <span>{l("حالة الحساب", "Account status")}</span>
            <select value={accountStatus} onChange={(e) => setAccountStatus(e.target.value)}>
              <option value="active">{l("نشط", "Active")}</option>
              <option value="suspended">{l("موقوف", "Suspended")}</option>
              <option value="closed">{l("مغلق", "Closed")}</option>
            </select>
          </label>
          <label>
            <span>{l("البريد", "Email")}</span>
            <input value={String(profile.email ?? "")} readOnly />
          </label>
          <div className="admin-account-actions">
            <button disabled={working} type="submit">{l("حفظ بيانات الحساب", "Save account")}</button>
            <button disabled={working || emailVerified} type="button" onClick={() => void verifyEmail()}>
              {emailVerified ? l("الحساب مفعّل", "Already verified") : l("تفعيل الحساب يدوياً", "Activate account manually")}
            </button>
          </div>
        </form>
        {!emailVerified && (
          <p className="admin-help-text">{l("استخدم التفعيل اليدوي إذا لم يصل إيميل التحقق للمستخدم.", "Use manual activation when the verification email never arrives.")}</p>
        )}
      </section>

      <section className="admin-panel">
        <div className="admin-panel-head">
          <div>
            <h2>{l("التحكم بالاشتراك", "Subscription controls")}</h2>
            <p>{l("ترقية أو منح أو إيقاف أو خصم خاص وتتبع نهاية الفترة.", "Upgrade, grant, pause, or apply a special discount and track period end.")}</p>
          </div>
        </div>
        <form className="admin-subscription-form" onSubmit={(event) => void saveSubscription(event)}>
          <label>
            <span>{l("الباقة", "Plan")}</span>
            <select value={planId} onChange={(e) => setPlanId(e.target.value)} required>
              {!plans.length && <option value="">{l("لا توجد باقات", "No plans")}</option>}
              {plans.map((plan) => (
                <option key={String(plan.id)} value={String(plan.id)}>
                  {locale === "ar" ? String(plan.name_ar) : String(plan.name_en)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{l("حالة الاشتراك", "Subscription status")}</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              {["active", "trialing", "pending_payment", "suspended", "cancelled"].map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </label>
          <label>
            <span>{l("دورة الفوترة", "Billing cycle")}</span>
            <select value={billingCycle} onChange={(e) => setBillingCycle(e.target.value)}>
              <option value="monthly">{l("شهري", "Monthly")}</option>
              <option value="annual">{l("سنوي", "Annual")}</option>
            </select>
          </label>
          <label>
            <span>{l("نهاية الفترة", "Period end")}</span>
            <DateField value={periodEnd} onChange={setPeriodEnd} />
          </label>
          <label>
            <span>{l("خصم %", "Discount %")}</span>
            <input type="number" min={0} max={100} value={discountPercent} onChange={(e) => setDiscountPercent(e.target.value)} />
          </label>
          <label>
            <span>{l("خصم ثابت (بيسة)", "Fixed discount (baisa)")}</span>
            <input type="number" min={0} value={discountFixed} onChange={(e) => setDiscountFixed(e.target.value)} />
          </label>
          <label>
            <span>{l("تسمية الخصم", "Discount label")}</span>
            <input value={discountLabel} onChange={(e) => setDiscountLabel(e.target.value)} />
          </label>
          <label>
            <span>{l("ملاحظة إدارية", "Admin note")}</span>
            <input value={adminNote} onChange={(e) => setAdminNote(e.target.value)} />
          </label>
          <label>
            <span>{l("حد المحافظ (0 = الباقة)", "Wallet cap (0 = plan)")}</span>
            <input type="number" min={0} value={walletLimitOverride} onChange={(e) => setWalletLimitOverride(e.target.value)} />
          </label>
          <label>
            <span>{l("حد الأعضاء (0 = الباقة)", "Member cap (0 = plan)")}</span>
            <input type="number" min={0} value={memberLimitOverride} onChange={(e) => setMemberLimitOverride(e.target.value)} />
          </label>
          <label>
            <span>{l("حد المستخدمين (0 = الباقة)", "User cap (0 = plan)")}</span>
            <input type="number" min={0} value={userLimitOverride} onChange={(e) => setUserLimitOverride(e.target.value)} />
          </label>
          <label>
            <span>{l("حد المعاملات (0 = الباقة)", "Transaction cap (0 = plan)")}</span>
            <input type="number" min={0} value={transactionLimitOverride} onChange={(e) => setTransactionLimitOverride(e.target.value)} />
          </label>
          <label>
            <span>{l("حد السجلات (0 = الباقة)", "Record cap (0 = plan)")}</span>
            <input type="number" min={0} value={recordLimitOverride} onChange={(e) => setRecordLimitOverride(e.target.value)} />
          </label>
          <div className="admin-account-actions">
            <button disabled={working || !planId} type="submit">{l("حفظ الاشتراك", "Save subscription")}</button>
            <button disabled={working || !planId} type="button" onClick={(event) => void saveSubscription(event as unknown as FormEvent, true)}>{l("إيقاف الاشتراك", "Pause subscription")}</button>
            <button disabled={working || !planId} type="button" onClick={(event) => void saveSubscription(event as unknown as FormEvent, false)}>{l("استئناف الاشتراك", "Resume subscription")}</button>
          </div>
        </form>
        {Array.isArray(profile.effective_features) && (
          <p style={{ marginTop: 12 }}><small>{l("الصلاحيات الفعلية", "Effective entitlements")}: {profile.effective_features.map(String).join(", ") || "—"} · {l("محافظ", "wallets")} {String(profile.effective_wallet_limit ?? "—")} · {l("أعضاء", "members")} {String(profile.effective_member_limit ?? "—")} · {l("مستخدمون", "users")} {String(profile.effective_user_limit ?? "—")} · {l("معاملات", "txns")} {String(profile.effective_transaction_limit ?? "—")} · {l("سجلات", "records")} {String(profile.effective_record_limit ?? "—")}</small></p>
        )}
        <div className="admin-feature-grid">
          {PLAN_FEATURE_CATALOG.map((feature) => {
            const granted = featuresGrant.includes(feature.id);
            const denied = featuresDeny.includes(feature.id);
            const onPlan = Array.isArray(profile.features) && profile.features.includes(feature.id);
            return (
              <label key={feature.id} className="admin-feature-row">
                <span><b>{locale === "ar" ? feature.ar : feature.en}</b><small>{onPlan ? l("في الباقة", "on plan") : l("ليست في الباقة", "not on plan")}</small></span>
                <button type="button" className={granted ? "active" : ""} onClick={() => { setFeaturesGrant((current) => current.includes(feature.id) ? current.filter((id) => id !== feature.id) : [...current, feature.id]); setFeaturesDeny((current) => current.filter((id) => id !== feature.id)); }}>{l("منح", "Grant")}</button>
                <button type="button" className={denied ? "danger" : ""} onClick={() => { setFeaturesDeny((current) => current.includes(feature.id) ? current.filter((id) => id !== feature.id) : [...current, feature.id]); setFeaturesGrant((current) => current.filter((id) => id !== feature.id)); }}>{l("قيّد", "Deny")}</button>
              </label>
            );
          })}
        </div>
        {!profile.subscription_id && (
          <p className="admin-help-text">{l("لا يوجد اشتراك بعد — اختر باقة ثم احفظ لمنح اشتراك جديد.", "No subscription yet — choose a plan and save to grant one.")}</p>
        )}
      </section>

      <div className="admin-overview-grid">
        <section className="admin-panel">
          <div className="admin-panel-head"><h2>{l("الفواتير", "Invoices")}</h2></div>
          <div className="audit-list">
            {(billing?.invoices ?? []).map((invoice) => (
              <div key={String(invoice.id)}>
                <CreditCard />
                <span>
                  <b>{String(invoice.reference)}</b>
                  <small>{money(Number(invoice.total_minor ?? 0), locale, String(invoice.currency ?? "OMR"))} · {fmt(invoice.created_at)}</small>
                </span>
                <Status value={String(invoice.status)} locale={locale} />
              </div>
            ))}
            {!billing?.invoices?.length && <p>{l("لا فواتير.", "No invoices.")}</p>}
          </div>
        </section>
        <section className="admin-panel">
          <div className="admin-panel-head"><h2>{l("المعاملات", "Transactions")}</h2></div>
          <div className="audit-list">
            {(billing?.payments ?? []).map((payment) => (
              <div key={String(payment.id)}>
                <CreditCard />
                <span>
                  <b>{String(payment.reference)}</b>
                  <small>{money(Number(payment.amount_minor ?? 0), locale, String(payment.currency ?? "OMR"))} · {String(payment.method)} · {fmt(payment.occurred_at)}</small>
                </span>
                <Status value={String(payment.status)} locale={locale} />
              </div>
            ))}
            {!billing?.payments?.length && <p>{l("لا معاملات.", "No payments.")}</p>}
          </div>
        </section>
      </div>

      <section className="admin-panel">
        <div className="admin-panel-head"><div><h2>{l("إلغاء كل الجلسات", "Revoke all sessions")}</h2><p>{l("يتطلب سبباً ويُسجَّل في التدقيق.", "Requires a reason and writes an audit event.")}</p></div></div>
        <form className="coupon-create" onSubmit={revokeSessions}>
          <input required minLength={3} maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} placeholder={l("سبب الإلغاء", "Revocation reason")} />
          <button disabled={working}>{l("إلغاء الجلسات", "Revoke sessions")}</button>
        </form>
      </section>

      <div className="admin-overview-grid">
        <section className="admin-panel">
          <div className="admin-panel-head"><h2>{l("الجلسات", "Sessions")}</h2></div>
          <div className="audit-list">
            {detail.sessions.map((session) => (
              <div key={String(session.id)}>
                <ShieldCheck />
                <span><b>{String(session.id).slice(0, 8)}…</b><small>{l("آخر ظهور", "Last seen")}: {session.last_seen_at ? new Date(String(session.last_seen_at)).toLocaleString() : "—"}</small></span>
              </div>
            ))}
            {!detail.sessions.length && <p>{l("لا جلسات.", "No sessions.")}</p>}
          </div>
        </section>
        <section className="admin-panel">
          <div className="admin-panel-head"><h2>{l("مفاتيح API", "API keys")}</h2></div>
          <div className="audit-list">
            {detail.apiKeys.map((key) => (
              <div key={String(key.id)}>
                <ShieldCheck />
                <span><b>{String(key.name)}</b><small>{String(key.key_prefix)}… · {key.revoked_at ? l("ملغى", "revoked") : l("نشط", "active")}</small></span>
              </div>
            ))}
            {!detail.apiKeys.length && <p>{l("لا مفاتيح.", "No API keys.")}</p>}
          </div>
        </section>
      </div>

      <div className="admin-overview-grid">
        <section className="admin-panel">
          <div className="admin-panel-head"><h2>{l("المحافظ المملوكة", "Owned wallets")}</h2></div>
          <div className="audit-list">
            {detail.spaces.map((space) => (
              <div key={String(space.id)}><Users /><span><b>{String(space.name_ar ?? space.name_en)}</b><small>{String(space.type)} · {String(space.currency)}</small></span></div>
            ))}
            {!detail.spaces.length && <p>{l("لا محافظ.", "No wallets.")}</p>}
          </div>
        </section>
        <section className="admin-panel">
          <div className="admin-panel-head"><h2>{l("المستأجرون", "Tenants")}</h2></div>
          <div className="audit-list">
            {detail.tenants.map((tenant) => (
              <div key={String(tenant.tenant_id)}><Users /><span><b>{String(tenant.tenant_name)}</b><small>{String(tenant.role)} · {String(tenant.status)}</small></span></div>
            ))}
            {!detail.tenants.length && <p>{l("لا مستأجرين.", "No tenants.")}</p>}
          </div>
        </section>
      </div>

      <section className="admin-panel">
        <div className="admin-panel-head"><h2>{l("سجل التدقيق", "Audit log")}</h2></div>
        <div className="audit-list">
          {detail.audit.map((row) => (
            <div key={String(row.id)}>
              <Search />
              <span><b>{String(row.action)}</b><small>{String(row.entity_type)}/{String(row.entity_id)} · {fmt(row.created_at)}</small></span>
            </div>
          ))}
          {!detail.audit.length && <p>{l("لا أحداث.", "No events.")}</p>}
        </div>
      </section>
    </>
  );
}

export function AdminTenants() {
  const { locale, l } = useCommerceLocale();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const cachedTenants = readAdminConsole()?.tenantsPage ?? null;
  const [data, setData] = useState<{ items: Row[]; total: number; page: number; pageSize: number } | null>(() =>
    query || page !== 1 ? null : cachedTenants,
  );
  const [error, setError] = useState("");

  const load = useCallback(() => {
    if (!query.trim() && page === 1) {
      const cached = readAdminConsole()?.tenantsPage;
      if (cached) {
        setData(cached);
        void fetchAdminConsole();
        return;
      }
      return fetchAdminConsole()
        .then((result) => {
          if (result.tenantsPage) setData(result.tenantsPage);
        })
        .catch((caught: Error) => {
          if (caught.message === "AUTH") {
            router.push("/login?next=/admin/tenants");
            return;
          }
          if (!readAdminConsole()) setError(caught.message === "FORBIDDEN" ? "FORBIDDEN" : "LOAD");
        });
    }
    const params = new URLSearchParams({ scope: "tenants", view: "admin", page: String(page), pageSize: "25" });
    if (query.trim()) params.set("q", query.trim());
    fetch(`/api/platform?${params}`, { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 401) {
          router.push("/login?next=/admin/tenants");
          throw new Error("AUTH");
        }
        const result = await response.json() as { error?: string; tenantsPage?: typeof data };
        if (!response.ok) throw new Error(result.error ?? "LOAD");
        return result.tenantsPage!;
      })
      .then(setData)
      .catch((caught: Error) => setError(caught.message === "FORBIDDEN" ? "FORBIDDEN" : "LOAD"));
  }, [page, query, router]);

  useEffect(() => { void load(); }, [load]);

  if (error && !data) {
    return <ErrorCard message={error === "FORBIDDEN" ? l("لا تملك صلاحية", "Forbidden") : l("تعذر التحميل", "Load failed")} retry={load} />;
  }
  if (!data) return <ContentBusy />;

  return (
    <>
      <div className="admin-page-head">
        <div>
          <small>{l("الإدارة / المستأجرون", "Admin / Tenants")}</small>
          <h1>{l("الشركات والمستأجرون", "Companies & tenants")}</h1>
          <p>{l("عرض المالك والأعضاء والاستخدام دون انتحال صامت.", "Owner, members and usage — no silent impersonation.")}</p>
        </div>
      </div>
      <section className="admin-panel admin-table-panel">
        <div className="admin-filters">
          <label><Search /><input value={query} onChange={(event) => { setPage(1); setQuery(event.target.value); }} placeholder={l("بحث بالاسم أو البريد…", "Search name or email…")} /></label>
        </div>
        <div className="admin-table-scroll">
          <table>
            <thead>
              <tr>
                <th>{l("المستأجر", "Tenant")}</th>
                <th>{l("المالك", "Owner")}</th>
                <th>{l("الدولة", "Country")}</th>
                <th>{l("أعضاء", "Members")}</th>
                <th>{l("محافظ", "Spaces")}</th>
                <th>{l("تفاصيل", "Details")}</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((tenant) => (
                <tr key={String(tenant.id)}>
                  <td><b>{String(tenant.name)}</b><small>{String(tenant.id)}</small></td>
                  <td><b>{String(tenant.owner_name ?? "—")}</b><small>{String(tenant.owner_email ?? "")}</small></td>
                  <td>{String(tenant.country)} · {String(tenant.currency)}</td>
                  <td>{String(tenant.member_count)}</td>
                  <td>{String(tenant.space_count)}</td>
                  <td><Link href={`/admin/tenants/${encodeURIComponent(String(tenant.id))}`}>{l("فتح", "Open")}</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="admin-filters" style={{ marginTop: 12 }}>
          <button type="button" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>{l("السابق", "Prev")}</button>
          <span>{l("صفحة", "Page")} {data.page} · {data.total} {l("إجمالي", "total")}</span>
          <button type="button" disabled={page * data.pageSize >= data.total} onClick={() => setPage((value) => value + 1)}>{l("التالي", "Next")}</button>
        </div>
      </section>
    </>
  );
}

export function AdminTenantDetail() {
  const { locale, l } = useCommerceLocale();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const tenantId = decodeURIComponent(params.id);
  const [detail, setDetail] = useState<{ tenant: Row; members: Row[]; resources: Row[] } | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    fetch(`/api/platform?view=admin&scope=tenants&tenantId=${encodeURIComponent(tenantId)}`, { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 401) {
          router.push(`/login?next=${encodeURIComponent(`/admin/tenants/${tenantId}`)}`);
          throw new Error("AUTH");
        }
        const result = await response.json() as { error?: string; detail?: typeof detail };
        if (!response.ok) throw new Error(result.error ?? "LOAD");
        return result.detail!;
      })
      .then(setDetail)
      .catch((caught: Error) => setError(caught.message === "FORBIDDEN" ? "FORBIDDEN" : "LOAD"));
  }, [router, tenantId]);

  useEffect(() => { void load(); }, [load]);

  if (error && !detail) {
    return <ErrorCard message={error === "FORBIDDEN" ? l("لا تملك صلاحية", "Forbidden") : l("تعذر التحميل", "Load failed")} retry={load} />;
  }
  if (!detail) return <ContentBusy />;

  return (
    <>
      <div className="admin-page-head">
        <div>
          <small><Link href="/admin/tenants">{l("المستأجرون", "Tenants")}</Link> / {String(detail.tenant.id)}</small>
          <h1>{String(detail.tenant.name)}</h1>
          <p>{l("تفاصيل الشركة والأعضاء والموارد المرتبطة.", "Company details, members and linked resources.")}</p>
        </div>
      </div>
      <div className="admin-kpis">
        <article><i><Users /></i><span>{l("المالك", "Owner")}</span><b>{String(detail.tenant.owner_name ?? "—")}</b><small>{String(detail.tenant.owner_email ?? "")}</small></article>
        <article><i><Users /></i><span>{l("الدولة", "Country")}</span><b>{String(detail.tenant.country)}</b><small>{String(detail.tenant.currency)}</small></article>
        <article><i><Users /></i><span>{l("الأعضاء", "Members")}</span><b>{detail.members.length}</b><small>{l("نشطون/مسجّلون", "recorded")}</small></article>
        <article><i><Users /></i><span>{l("الموارد", "Resources")}</span><b>{detail.resources.length}</b><small>{l("حتى 100", "up to 100")}</small></article>
      </div>
      <div className="admin-overview-grid">
        <section className="admin-panel">
          <div className="admin-panel-head"><h2>{l("الأعضاء", "Members")}</h2></div>
          <div className="audit-list">
            {detail.members.map((member) => (
              <div key={String(member.user_id)}>
                <Users />
                <span>
                  <b><Link href={`/admin/users/${encodeURIComponent(String(member.user_id))}`}>{String(member.display_name ?? member.email)}</Link></b>
                  <small>{String(member.role)} · {String(member.status)}</small>
                </span>
              </div>
            ))}
          </div>
        </section>
        <section className="admin-panel">
          <div className="admin-panel-head"><h2>{l("الموارد", "Resources")}</h2></div>
          <div className="audit-list">
            {detail.resources.map((resource) => (
              <div key={`${resource.resource_type}:${resource.resource_id}`}>
                <Users />
                <span><b>{String(resource.resource_type)}</b><small>{String(resource.resource_id)}</small></span>
              </div>
            ))}
            {!detail.resources.length && <p>{l("لا موارد.", "No resources.")}</p>}
          </div>
        </section>
      </div>
    </>
  );
}

export function AdminStaff() {
  const { locale, l } = useCommerceLocale();
  const router = useRouter();
  const staffFrom = (rows: Row[]) => rows.filter((row) => String(row.role) !== "customer");
  const [roles, setRoles] = useState<Row[] | null>(() => {
    const cached = readAdminConsole();
    return cached ? staffFrom(cached.roles) : null;
  });
  const [error, setError] = useState("");

  const load = useCallback(() => {
    return fetchAdminConsole()
      .then((result) => setRoles(staffFrom(result.roles)))
      .catch((caught: Error) => {
        if (caught.message === "AUTH") {
          router.push("/login?next=/admin/staff");
          return;
        }
        if (!readAdminConsole()) setError(caught.message === "FORBIDDEN" ? "FORBIDDEN" : "LOAD");
      });
  }, [router]);

  useEffect(() => { void load(); }, [load]);

  if (error && !roles) {
    return <ErrorCard message={error === "FORBIDDEN" ? l("لا تملك صلاحية", "Forbidden") : l("تعذر التحميل", "Load failed")} retry={load} />;
  }
  if (!roles) return <ContentBusy />;

  return (
    <>
      <div className="admin-page-head">
        <div>
          <small>{l("الإدارة / الفريق", "Admin / Staff")}</small>
          <h1>{l("فريق الإدارة والصلاحيات", "Admin staff & roles")}</h1>
          <p>{l("عرض الأدوار الحالية. دعوات الموظفين ومصفوفة الصلاحيات الكاملة تُستكمل لاحقاً.", "Current roles. Staff invites and full permission matrix come next.")}</p>
        </div>
      </div>
      <section className="admin-panel">
        <div className="admin-panel-head"><h2>{l("الأدوار النشطة", "Active roles")}</h2></div>
        <div className="role-list">
          {roles.map((row) => (
            <div key={String(row.user_id)}>
              <i><ShieldCheck /></i>
              <span>
                <b><Link href={`/admin/users/${encodeURIComponent(String(row.user_id))}`}>{String(row.display_name ?? row.email ?? row.user_id)}</Link></b>
                <small>{String(row.email ?? "")}</small>
              </span>
              <code>{String(row.role)}</code>
            </div>
          ))}
          {!roles.length && <p>{l("لا يوجد موظفون إداريون بعد. أنشئ المدير عبر bootstrap.", "No admin staff yet. Bootstrap the first admin.")}</p>}
        </div>
        <p className="modal-note" style={{ marginTop: 16 }}>
          {l(
            "التهيئة الآمنة: أضف DATABASE_URL من Neon ثم npm run admin:bootstrap وافتح /admin/setup.",
            "Safe bootstrap: set DATABASE_URL from Neon, run npm run admin:bootstrap, open /admin/setup.",
          )}
        </p>
      </section>
    </>
  );
}
