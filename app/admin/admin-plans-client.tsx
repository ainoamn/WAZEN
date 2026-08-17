"use client";

import { FormEvent, Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Infinity as InfinityIcon, Plus, Users, WalletCards, X } from "lucide-react";
import { ContentBusy, ErrorCard, money, Status, useCommerceLocale } from "../commercial-kit";
import { apiFetch } from "../../lib/client-api";
import {
  formatQuota,
  PLAN_FEATURE_CATALOG,
  PLAN_FEATURE_GROUPS,
  planHasFeature,
  quotaIsUnlimited,
} from "../../lib/plan-features";
import { fetchAdminConsole, patchAdminConsole, readAdminConsole } from "../../lib/admin-session";

type Row = Record<string, unknown>;

type PlanForm = {
  id: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  descriptionEn: string;
  monthlyOmr: string;
  annualOmr: string;
  walletLimit: number;
  memberLimit: number;
  transactionLimit: number;
  recordLimit: number;
  userLimit: number;
  features: string[];
  isActive: boolean;
  sortOrder: number;
  gatewayIds: string[];
};

const emptyPlan: PlanForm = {
  id: "",
  nameAr: "",
  nameEn: "",
  descriptionAr: "",
  descriptionEn: "",
  monthlyOmr: "0.000",
  annualOmr: "0.000",
  walletLimit: 1,
  memberLimit: 2,
  transactionLimit: 50,
  recordLimit: 20,
  userLimit: 1,
  features: ["personal"],
  isActive: true,
  sortOrder: 10,
  gatewayIds: [],
};

async function postAction(action: string, payload: Record<string, unknown>) {
  const response = await apiFetch("/api/platform", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, idempotencyKey: crypto.randomUUID(), ...payload }),
  });
  const result = await response.json() as { error?: string } & Record<string, unknown>;
  if (!response.ok) throw new Error(result.error ?? "ACTION_FAILED");
  return result;
}

function minorToOmr(minor: number) {
  return (Number(minor || 0) / 1000).toFixed(3);
}

function omrToMinor(value: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return 0;
  return Math.round(amount * 1000);
}

function planToForm(plan: Row): PlanForm {
  return {
    id: String(plan.id ?? ""),
    nameAr: String(plan.name_ar ?? ""),
    nameEn: String(plan.name_en ?? ""),
    descriptionAr: String(plan.description_ar ?? ""),
    descriptionEn: String(plan.description_en ?? ""),
    monthlyOmr: minorToOmr(Number(plan.monthly_minor ?? 0)),
    annualOmr: minorToOmr(Number(plan.annual_minor ?? 0)),
    walletLimit: Number(plan.wallet_limit ?? 1),
    memberLimit: Number(plan.member_limit ?? 2),
    transactionLimit: Number(plan.transaction_limit ?? 0),
    recordLimit: Number(plan.record_limit ?? 0),
    userLimit: Number(plan.user_limit ?? 1),
    features: Array.isArray(plan.features) ? plan.features.map(String) : ["personal"],
    isActive: Number(plan.is_active) === 1,
    sortOrder: Number(plan.sort_order ?? 0),
    gatewayIds: Array.isArray(plan.gateway_ids) ? plan.gateway_ids.map(String) : [],
  };
}

function QuotaField({
  label,
  hint,
  value,
  min,
  unlimitedValue,
  onChange,
  unlimitedLabel,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  unlimitedValue: number;
  onChange: (next: number) => void;
  unlimitedLabel: string;
}) {
  const unlimited = quotaIsUnlimited(value);
  return (
    <label className="plan-quota-field">
      <span>{label}</span>
      <small>{hint}</small>
      <div>
        <input
          type="number"
          min={min}
          disabled={unlimited}
          value={unlimited ? "" : value}
          placeholder={unlimited ? "∞" : String(min)}
          onChange={(event) => onChange(Math.max(min, Number(event.target.value) || min))}
        />
        <label className="plan-unlimited">
          <input
            type="checkbox"
            checked={unlimited}
            onChange={(event) => onChange(event.target.checked ? unlimitedValue : Math.max(min, 1))}
          />
          {unlimitedLabel}
        </label>
      </div>
    </label>
  );
}

export function AdminPlans() {
  const { locale, l } = useCommerceLocale();
  const router = useRouter();
  const cached = readAdminConsole();
  const [plans, setPlans] = useState<Row[]>(() => cached?.plans ?? []);
  const [gateways, setGateways] = useState<Row[]>(() => cached?.gateways ?? []);
  const [form, setForm] = useState<PlanForm>(emptyPlan);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [loaded, setLoaded] = useState(() => Boolean(cached));
  const editing = Boolean(form.id && plans.some((plan) => String(plan.id) === form.id));

  const load = useCallback(() => {
    return fetchAdminConsole()
      .then((result) => {
        setPlans(result.plans ?? []);
        setGateways(result.gateways ?? []);
        setLoaded(true);
      })
      .catch((caught: Error) => {
        if (caught.message === "AUTH") {
          router.push("/login?next=/admin/plans");
          return;
        }
        if (!readAdminConsole()) setError(caught.message === "FORBIDDEN" ? "FORBIDDEN" : "LOAD");
      });
  }, [router]);

  useEffect(() => { void load(); }, [load]);

  const edit = (plan: Row) => setForm(planToForm(plan));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setWorking(true);
    setError("");
    try {
      const result = await postAction("upsertPlan", {
        id: form.id,
        nameAr: form.nameAr,
        nameEn: form.nameEn,
        descriptionAr: form.descriptionAr,
        descriptionEn: form.descriptionEn,
        monthlyMinor: omrToMinor(form.monthlyOmr),
        annualMinor: omrToMinor(form.annualOmr),
        walletLimit: form.walletLimit,
        memberLimit: form.memberLimit,
        transactionLimit: form.transactionLimit,
        recordLimit: form.recordLimit,
        userLimit: form.userLimit,
        features: form.features,
        isActive: form.isActive,
        sortOrder: form.sortOrder,
        gatewayIds: form.gatewayIds,
      });
      setPlans((result.plans as Row[]) ?? []);
      if (result.gateways) setGateways(result.gateways as Row[]);
      patchAdminConsole({
        plans: (result.plans as Row[]) ?? [],
        ...(result.gateways ? { gateways: result.gateways as Row[] } : {}),
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "SAVE");
    } finally {
      setWorking(false);
    }
  };

  const subscribers = useMemo(
    () => plans.reduce((sum, plan) => sum + Number(plan.subscriber_count ?? 0), 0),
    [plans],
  );

  if (error && !plans.length) {
    return <ErrorCard message={error === "FORBIDDEN" ? l("لا تملك صلاحية", "Forbidden") : l("تعذر التحميل", "Load failed")} retry={load} />;
  }
  if (!loaded) return <ContentBusy />;

  const quotaRows = [
    { key: "wallets", ar: "المحافظ", en: "Wallets", read: (plan: Row) => Number(plan.wallet_limit ?? 1) },
    { key: "members", ar: "الأعضاء لكل محفظة", en: "Members per wallet", read: (plan: Row) => Number(plan.member_limit ?? 2) },
    { key: "users", ar: "المستخدمون", en: "Users", read: (plan: Row) => Number(plan.user_limit ?? 1) },
    { key: "transactions", ar: "المعاملات", en: "Transactions", read: (plan: Row) => Number(plan.transaction_limit ?? 0) },
    { key: "records", ar: "السجلات", en: "Records", read: (plan: Row) => Number(plan.record_limit ?? 0) },
  ];

  return (
    <>
      <div className="admin-page-head">
        <div>
          <small>{l("الإدارة / الباقات", "Admin / Plans")}</small>
          <h1>{l("مصفوفة الباقات والصلاحيات", "Plan comparison & entitlements")}</h1>
          <p>{l("قارن الحدود والميزات جنباً إلى جنب، ثم حدّد ما يُمنح للمشترك: معاملات، سجلات، مستخدمون، وصلاحيات.", "Compare limits and features side by side, then grant transactions, records, users, and permissions per subscription.")}</p>
        </div>
        <button type="button" onClick={() => setForm(emptyPlan)}><Plus />{l("باقة جديدة", "New plan")}</button>
      </div>

      <div className="admin-kpis">
        <article><i><WalletCards /></i><span>{l("الباقات", "Plans")}</span><b>{plans.length}</b><small>{l("في الكتالوج", "in catalog")}</small></article>
        <article><i><Check /></i><span>{l("نشطة", "Active")}</span><b>{plans.filter((plan) => Number(plan.is_active) === 1).length}</b><small>{l("ظاهرة للعملاء", "visible to customers")}</small></article>
        <article><i><Users /></i><span>{l("المشتركون", "Subscribers")}</span><b>{subscribers}</b><small>{l("على كل الباقات", "across all plans")}</small></article>
      </div>

      {error ? <p className="admin-inline-alert is-error">{error}</p> : null}

      <section className="admin-panel plan-matrix-panel">
        <div className="admin-panel-head">
          <div>
            <h2>{l("مقارنة الباقات", "Plan comparison")}</h2>
            <p>{l("اضغط عمود الباقة لتعديل حدودها وخصائصها.", "Select a plan column to edit its quotas and features.")}</p>
          </div>
        </div>
        <div className="plan-matrix-scroll">
          <table className="plan-matrix">
            <thead>
              <tr>
                <th>{l("البند", "Item")}</th>
                {plans.map((plan) => {
                  const selected = form.id === String(plan.id);
                  return (
                    <th key={String(plan.id)} className={selected ? "is-selected" : undefined}>
                      <button type="button" onClick={() => edit(plan)}>
                        <b>{locale === "ar" ? String(plan.name_ar) : String(plan.name_en)}</b>
                        <small>{String(plan.id)}</small>
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th>{l("السعر الشهري", "Monthly price")}</th>
                {plans.map((plan) => (
                  <td key={`${plan.id}-price`} className={form.id === String(plan.id) ? "is-selected" : undefined}>
                    {Number(plan.monthly_minor ?? 0) === 0 ? l("مجاناً", "Free") : money(Number(plan.monthly_minor ?? 0), locale)}
                  </td>
                ))}
              </tr>
              <tr>
                <th>{l("السعر السنوي", "Annual price")}</th>
                {plans.map((plan) => (
                  <td key={`${plan.id}-annual`} className={form.id === String(plan.id) ? "is-selected" : undefined}>
                    {Number(plan.annual_minor ?? 0) === 0 ? "—" : money(Number(plan.annual_minor ?? 0), locale)}
                  </td>
                ))}
              </tr>
              {quotaRows.map((row) => (
                <tr key={row.key}>
                  <th>{locale === "ar" ? row.ar : row.en}</th>
                  {plans.map((plan) => {
                    const value = row.read(plan);
                    return (
                      <td key={`${plan.id}-${row.key}`} className={form.id === String(plan.id) ? "is-selected" : undefined}>
                        {quotaIsUnlimited(value) ? <span className="plan-unlimited-chip"><InfinityIcon size={14} />{formatQuota(value, locale)}</span> : value}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {PLAN_FEATURE_GROUPS.map((group) => (
                <Fragment key={group.id}>
                  <tr className="plan-matrix-group">
                    <th colSpan={plans.length + 1}>{locale === "ar" ? group.ar : group.en}</th>
                  </tr>
                  {PLAN_FEATURE_CATALOG.filter((feature) => feature.group === group.id).map((feature) => (
                    <tr key={feature.id}>
                      <th>{locale === "ar" ? feature.ar : feature.en}</th>
                      {plans.map((plan) => {
                        const features = Array.isArray(plan.features) ? plan.features.map(String) : [];
                        const included = planHasFeature(features, feature.id);
                        return (
                          <td key={`${plan.id}-${feature.id}`} className={`${form.id === String(plan.id) ? "is-selected " : ""}${included ? "is-on" : "is-off"}`}>
                            {included ? <Check size={16} /> : <X size={16} />}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </Fragment>
              ))}
              <tr>
                <th>{l("المشتركون", "Subscribers")}</th>
                {plans.map((plan) => (
                  <td key={`${plan.id}-subs`} className={form.id === String(plan.id) ? "is-selected" : undefined}>
                    {String(plan.subscriber_count ?? 0)}
                  </td>
                ))}
              </tr>
              <tr>
                <th>{l("الحالة", "Status")}</th>
                {plans.map((plan) => (
                  <td key={`${plan.id}-status`} className={form.id === String(plan.id) ? "is-selected" : undefined}>
                    <Status value={Number(plan.is_active) === 1 ? "active" : "closed"} locale={locale} />
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-panel plan-editor">
        <div className="admin-panel-head">
          <div>
            <h2>{editing ? l("تعديل الباقة", "Edit plan") : l("باقة جديدة", "New plan")}</h2>
            <p>{l("هذه الحدود تُطبَّق عند الاشتراك: عدد المعاملات والسجلات والمستخدمين والخصائص الممنوحة.", "These quotas apply on subscribe: transactions, records, users, and granted features.")}</p>
          </div>
        </div>
        <form className="plan-editor-form" onSubmit={submit}>
          <fieldset>
            <legend>{l("الهوية", "Identity")}</legend>
            <label>
              <span>{l("المعرّف", "Plan ID")}</span>
              <input required value={form.id} onChange={(event) => setForm({ ...form, id: event.target.value })} placeholder="starter" />
            </label>
            <label>
              <span>{l("الاسم عربي", "Arabic name")}</span>
              <input required value={form.nameAr} onChange={(event) => setForm({ ...form, nameAr: event.target.value })} />
            </label>
            <label>
              <span>{l("الاسم إنجليزي", "English name")}</span>
              <input required value={form.nameEn} onChange={(event) => setForm({ ...form, nameEn: event.target.value })} />
            </label>
            <label>
              <span>{l("الوصف عربي", "Arabic description")}</span>
              <input required value={form.descriptionAr} onChange={(event) => setForm({ ...form, descriptionAr: event.target.value })} />
            </label>
            <label>
              <span>{l("الوصف إنجليزي", "English description")}</span>
              <input required value={form.descriptionEn} onChange={(event) => setForm({ ...form, descriptionEn: event.target.value })} />
            </label>
            <label>
              <span>{l("الترتيب", "Sort order")}</span>
              <input type="number" min={0} value={form.sortOrder} onChange={(event) => setForm({ ...form, sortOrder: Number(event.target.value) })} />
            </label>
            <label className="plan-active">
              <input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} />
              {l("باقة نشطة ظاهرة في التسعير", "Active plan visible on pricing")}
            </label>
          </fieldset>

          <fieldset>
            <legend>{l("التسعير (ر.ع)", "Pricing (OMR)")}</legend>
            <label>
              <span>{l("شهري", "Monthly")}</span>
              <input type="number" min={0} step="0.001" value={form.monthlyOmr} onChange={(event) => setForm({ ...form, monthlyOmr: event.target.value })} />
            </label>
            <label>
              <span>{l("سنوي", "Annual")}</span>
              <input type="number" min={0} step="0.001" value={form.annualOmr} onChange={(event) => setForm({ ...form, annualOmr: event.target.value })} />
            </label>
          </fieldset>

          <fieldset className="plan-quota-grid">
            <legend>{l("حدود الاشتراك", "Subscription quotas")}</legend>
            <QuotaField
              label={l("المحافظ", "Wallets")}
              hint={l("عدد المحافظ التي يمكن إنشاؤها", "Wallets the subscriber can create")}
              value={form.walletLimit}
              min={1}
              unlimitedValue={9999}
              unlimitedLabel={l("غير محدود", "Unlimited")}
              onChange={(walletLimit) => setForm({ ...form, walletLimit })}
            />
            <QuotaField
              label={l("الأعضاء لكل محفظة", "Members per wallet")}
              hint={l("سجلات الأعضاء داخل المحفظة الواحدة", "Member records inside one wallet")}
              value={form.memberLimit}
              min={1}
              unlimitedValue={9999}
              unlimitedLabel={l("غير محدود", "Unlimited")}
              onChange={(memberLimit) => setForm({ ...form, memberLimit })}
            />
            <QuotaField
              label={l("المستخدمون", "Users")}
              hint={l("حسابات الدخول المرتبطة بالاشتراك", "Login seats on this subscription")}
              value={form.userLimit}
              min={0}
              unlimitedValue={0}
              unlimitedLabel={l("غير محدود", "Unlimited")}
              onChange={(userLimit) => setForm({ ...form, userLimit })}
            />
            <QuotaField
              label={l("المعاملات", "Transactions")}
              hint={l("إجمالي الحركات في محافظ المشترك", "Ledger entries across the subscriber’s wallets")}
              value={form.transactionLimit}
              min={0}
              unlimitedValue={0}
              unlimitedLabel={l("غير محدود", "Unlimited")}
              onChange={(transactionLimit) => setForm({ ...form, transactionLimit })}
            />
            <QuotaField
              label={l("السجلات", "Records")}
              hint={l("المستندات والإيصالات والكشوف", "Documents, receipts, and statements")}
              value={form.recordLimit}
              min={0}
              unlimitedValue={0}
              unlimitedLabel={l("غير محدود", "Unlimited")}
              onChange={(recordLimit) => setForm({ ...form, recordLimit })}
            />
          </fieldset>

          <fieldset>
            <legend>{l("الخصائص الممنوحة عند الاشتراك", "Features granted on subscribe")}</legend>
            {PLAN_FEATURE_GROUPS.map((group) => (
              <div key={group.id} className="plan-feature-group">
                <h3>{locale === "ar" ? group.ar : group.en}</h3>
                <div>
                  {PLAN_FEATURE_CATALOG.filter((feature) => feature.group === group.id).map((feature) => (
                    <label key={feature.id}>
                      <input
                        type="checkbox"
                        checked={form.features.includes(feature.id)}
                        onChange={(event) => setForm({
                          ...form,
                          features: event.target.checked
                            ? [...form.features, feature.id]
                            : form.features.filter((item) => item !== feature.id),
                        })}
                      />
                      {locale === "ar" ? feature.ar : feature.en}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </fieldset>

          <fieldset>
            <legend>{l("بوابات الدفع", "Payment gateways")}</legend>
            <div className="plan-gateway-grid">
              {gateways.map((gateway) => {
                const id = String(gateway.id);
                return (
                  <label key={id}>
                    <input
                      type="checkbox"
                      checked={form.gatewayIds.includes(id)}
                      onChange={(event) => setForm({
                        ...form,
                        gatewayIds: event.target.checked
                          ? [...form.gatewayIds, id]
                          : form.gatewayIds.filter((item) => item !== id),
                      })}
                    />
                    {locale === "ar" ? String(gateway.name_ar) : String(gateway.name_en)}
                    <small>{String(gateway.scope)}</small>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="plan-editor-actions">
            <button disabled={working} type="submit"><Plus />{editing ? l("حفظ التعديل", "Save changes") : l("إنشاء باقة", "Create plan")}</button>
            {editing ? <button type="button" onClick={() => setForm(emptyPlan)}>{l("باقة جديدة", "New plan")}</button> : null}
          </div>
        </form>
      </section>
    </>
  );
}
