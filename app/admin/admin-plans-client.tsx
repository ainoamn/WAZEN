"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeftRight,
  Check,
  FileStack,
  Pencil,
  Plus,
  UserRound,
  Users,
  WalletCards,
} from "lucide-react";
import { ContentBusy, ErrorCard, money, useCommerceLocale } from "../commercial-kit";
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
type Locale = "ar" | "en";

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

function Switch({ on, label, onToggle }: { on: boolean; label: string; onToggle: () => void }) {
  return (
    <button type="button" className={`plan-switch${on ? " is-on" : ""}`} role="switch" aria-checked={on} aria-label={label} onClick={onToggle}>
      <i />
    </button>
  );
}

function QuotaTile({
  icon,
  label,
  hint,
  value,
  min,
  unlimitedValue,
  unlimitedLabel,
  onChange,
}: {
  icon: ReactNode;
  label: string;
  hint: string;
  value: number;
  min: number;
  unlimitedValue: number;
  unlimitedLabel: string;
  onChange: (next: number) => void;
}) {
  const unlimited = quotaIsUnlimited(value);
  return (
    <article className={`plan-quota-tile${unlimited ? " is-unlimited" : ""}`}>
      <header>
        <span>{icon}</span>
        <div>
          <b>{label}</b>
          <small>{hint}</small>
        </div>
      </header>
      <div className="plan-quota-tile-controls">
        <input
          type="number"
          min={min}
          disabled={unlimited}
          value={unlimited ? "" : value}
          placeholder="∞"
          onChange={(event) => onChange(Math.max(min, Number(event.target.value) || min))}
        />
        <label>
          <Switch on={unlimited} label={unlimitedLabel} onToggle={() => onChange(unlimited ? Math.max(min, 1) : unlimitedValue)} />
          {unlimitedLabel}
        </label>
      </div>
    </article>
  );
}

function quotaMetrics(plan: Row, locale: Locale) {
  return [
    { key: "wallets", ar: "محافظ", en: "Wallets", value: Number(plan.wallet_limit ?? 1) },
    { key: "members", ar: "أعضاء", en: "Members", value: Number(plan.member_limit ?? 2) },
    { key: "users", ar: "مستخدمون", en: "Users", value: Number(plan.user_limit ?? 1) },
    { key: "transactions", ar: "معاملات", en: "Transactions", value: Number(plan.transaction_limit ?? 0) },
    { key: "records", ar: "سجلات", en: "Records", value: Number(plan.record_limit ?? 0) },
  ].map((item) => ({ ...item, label: locale === "ar" ? item.ar : item.en, display: formatQuota(item.value, locale) }));
}

export function AdminPlans() {
  const { locale, l } = useCommerceLocale();
  const router = useRouter();
  const editorRef = useRef<HTMLElement>(null);
  const cached = readAdminConsole();
  const [plans, setPlans] = useState<Row[]>(() => cached?.plans ?? []);
  const [gateways, setGateways] = useState<Row[]>(() => cached?.gateways ?? []);
  const [form, setForm] = useState<PlanForm>(emptyPlan);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
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

  const openEditor = (next: PlanForm) => {
    setForm(next);
    setNotice("");
    requestAnimationFrame(() => editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const edit = (plan: Row) => openEditor(planToForm(plan));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setWorking(true);
    setError("");
    setNotice("");
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
      const nextPlans = (result.plans as Row[]) ?? [];
      setPlans(nextPlans);
      if (result.gateways) setGateways(result.gateways as Row[]);
      patchAdminConsole({
        plans: nextPlans,
        ...(result.gateways ? { gateways: result.gateways as Row[] } : {}),
      });
      const saved = nextPlans.find((plan) => String(plan.id) === form.id.trim().toLowerCase());
      if (saved) setForm(planToForm(saved));
      setNotice(l("تم حفظ الباقة.", "Plan saved."));
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

  const toggleFeature = (featureId: string) => {
    setForm((current) => ({
      ...current,
      features: current.features.includes(featureId)
        ? current.features.filter((item) => item !== featureId)
        : [...current.features, featureId],
    }));
  };

  const toggleGateway = (gatewayId: string) => {
    setForm((current) => ({
      ...current,
      gatewayIds: current.gatewayIds.includes(gatewayId)
        ? current.gatewayIds.filter((item) => item !== gatewayId)
        : [...current.gatewayIds, gatewayId],
    }));
  };

  return (
    <div className="plan-studio">
      <div className="admin-page-head">
        <div>
          <small>{l("الإدارة / الباقات", "Admin / Plans")}</small>
          <h1>{l("استوديو الباقات", "Plan studio")}</h1>
          <p>{l("قارن الحدود والميزات في بطاقات واضحة، ثم عدّل ما يُمنح عند الاشتراك: مستخدمون، معاملات، سجلات، وصلاحيات.", "Compare quotas and features on clear cards, then grant users, transactions, records, and permissions on subscribe.")}</p>
        </div>
        <button type="button" onClick={() => openEditor(emptyPlan)}><Plus />{l("باقة جديدة", "New plan")}</button>
      </div>

      <div className="admin-kpis">
        <article><i><WalletCards /></i><span>{l("الباقات", "Plans")}</span><b>{plans.length}</b><small>{l("في الكتالوج", "in catalog")}</small></article>
        <article><i><Check /></i><span>{l("نشطة", "Active")}</span><b>{plans.filter((plan) => Number(plan.is_active) === 1).length}</b><small>{l("ظاهرة للعملاء", "visible to customers")}</small></article>
        <article><i><Users /></i><span>{l("المشتركون", "Subscribers")}</span><b>{subscribers}</b><small>{l("على كل الباقات", "across all plans")}</small></article>
      </div>

      {error ? <p className="admin-inline-alert is-error">{error}</p> : null}
      {notice ? <p className="admin-inline-alert is-ok">{notice}</p> : null}

      <section className="plan-studio-board" aria-label={l("مقارنة الباقات", "Plan comparison")}>
        {plans.map((plan, index) => {
          const selected = form.id === String(plan.id);
          const features = Array.isArray(plan.features) ? plan.features.map(String) : [];
          const metrics = quotaMetrics(plan, locale);
          const monthly = Number(plan.monthly_minor ?? 0);
          const active = Number(plan.is_active) === 1;
          return (
            <article key={String(plan.id)} className={`plan-tier-card${selected ? " is-selected" : ""}${index === 2 ? " is-featured" : ""}${active ? "" : " is-inactive"}`}>
              {index === 2 ? <em className="plan-tier-ribbon">{l("الأوسع استخداماً", "Most used")}</em> : null}
              <header>
                <span className="plan-tier-slug">{String(plan.id)}</span>
                <h2>{locale === "ar" ? String(plan.name_ar) : String(plan.name_en)}</h2>
                <p>{locale === "ar" ? String(plan.description_ar) : String(plan.description_en)}</p>
              </header>
              <div className="plan-tier-price">
                <b>{monthly === 0 ? l("مجاناً", "Free") : money(monthly, locale)}</b>
                {monthly > 0 ? <small>{l("شهرياً", "per month")}</small> : null}
                {Number(plan.annual_minor ?? 0) > 0 ? <span>{l("سنوياً", "Yearly")} {money(Number(plan.annual_minor), locale)}</span> : null}
              </div>
              <dl className="plan-tier-quotas">
                {metrics.map((metric) => (
                  <div key={metric.key}>
                    <dt>{metric.label}</dt>
                    <dd>{metric.display}</dd>
                  </div>
                ))}
              </dl>
              {PLAN_FEATURE_GROUPS.map((group) => (
                <div key={group.id} className="plan-tier-group">
                  <h3>{locale === "ar" ? group.ar : group.en}</h3>
                  <ul>
                    {PLAN_FEATURE_CATALOG.filter((feature) => feature.group === group.id).map((feature) => {
                      const included = planHasFeature(features, feature.id);
                      return (
                        <li key={feature.id} className={included ? "is-on" : "is-off"}>
                          <i>{included ? <Check size={13} /> : null}</i>
                          {locale === "ar" ? feature.ar : feature.en}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
              <footer>
                <small>{String(plan.subscriber_count ?? 0)} {l("مشترك", "subscribers")}</small>
                <button type="button" onClick={() => edit(plan)}><Pencil size={15} />{l("تعديل", "Edit")}</button>
              </footer>
            </article>
          );
        })}
      </section>

      <section className="plan-studio-editor" ref={editorRef}>
        <div className="plan-studio-editor-head">
          <div>
            <small>{editing ? l("تحرير الباقة", "Editing plan") : l("إنشاء باقة", "Create plan")}</small>
            <h2>{editing ? (locale === "ar" ? form.nameAr : form.nameEn) || form.id : l("باقة جديدة", "New plan")}</h2>
            <p>{l("الحدود والخصائص تُطبَّق فور اشتراك المستخدم في هذه الباقة.", "Quotas and features apply as soon as a user subscribes to this plan.")}</p>
          </div>
          <label className="plan-active-toggle">
            <Switch on={form.isActive} label={l("نشطة", "Active")} onToggle={() => setForm({ ...form, isActive: !form.isActive })} />
            {l("ظاهرة في التسعير", "Visible on pricing")}
          </label>
        </div>

        <form className="plan-studio-form" onSubmit={submit}>
          <div className="plan-studio-grid">
            <fieldset>
              <legend>{l("الهوية", "Identity")}</legend>
              <div className="plan-studio-fields">
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
              <label className="is-wide">
                <span>{l("الوصف عربي", "Arabic description")}</span>
                <input required value={form.descriptionAr} onChange={(event) => setForm({ ...form, descriptionAr: event.target.value })} />
              </label>
              <label className="is-wide">
                <span>{l("الوصف إنجليزي", "English description")}</span>
                <input required value={form.descriptionEn} onChange={(event) => setForm({ ...form, descriptionEn: event.target.value })} />
              </label>
              <label>
                <span>{l("ترتيب العرض", "Display order")}</span>
                <input type="number" min={0} value={form.sortOrder} onChange={(event) => setForm({ ...form, sortOrder: Number(event.target.value) })} />
              </label>
              </div>
            </fieldset>

            <fieldset className="plan-studio-price">
              <legend>{l("التسعير", "Pricing")}</legend>
              <div className="plan-studio-fields">
              <label>
                <span>{l("شهري (ر.ع)", "Monthly (OMR)")}</span>
                <input type="number" min={0} step="0.001" value={form.monthlyOmr} onChange={(event) => setForm({ ...form, monthlyOmr: event.target.value })} />
              </label>
              <label>
                <span>{l("سنوي (ر.ع)", "Annual (OMR)")}</span>
                <input type="number" min={0} step="0.001" value={form.annualOmr} onChange={(event) => setForm({ ...form, annualOmr: event.target.value })} />
              </label>
              </div>
            </fieldset>
          </div>

          <fieldset className="plan-studio-quotas">
            <legend>{l("حدود الاشتراك", "Subscription quotas")}</legend>
            <div className="plan-quota-tiles">
            <QuotaTile
              icon={<WalletCards size={18} />}
              label={l("المحافظ", "Wallets")}
              hint={l("عدد المحافظ التي يمكن إنشاؤها", "Wallets the subscriber can create")}
              value={form.walletLimit}
              min={1}
              unlimitedValue={9999}
              unlimitedLabel={l("غير محدود", "Unlimited")}
              onChange={(walletLimit) => setForm({ ...form, walletLimit })}
            />
            <QuotaTile
              icon={<Users size={18} />}
              label={l("الأعضاء لكل محفظة", "Members per wallet")}
              hint={l("سجلات الأعضاء داخل المحفظة الواحدة", "Member records inside one wallet")}
              value={form.memberLimit}
              min={1}
              unlimitedValue={9999}
              unlimitedLabel={l("غير محدود", "Unlimited")}
              onChange={(memberLimit) => setForm({ ...form, memberLimit })}
            />
            <QuotaTile
              icon={<UserRound size={18} />}
              label={l("المستخدمون", "Users")}
              hint={l("حسابات الدخول المرتبطة بالاشتراك", "Login seats on this subscription")}
              value={form.userLimit}
              min={0}
              unlimitedValue={0}
              unlimitedLabel={l("غير محدود", "Unlimited")}
              onChange={(userLimit) => setForm({ ...form, userLimit })}
            />
            <QuotaTile
              icon={<ArrowLeftRight size={18} />}
              label={l("المعاملات", "Transactions")}
              hint={l("إجمالي الحركات في محافظ المشترك", "Ledger entries across the subscriber’s wallets")}
              value={form.transactionLimit}
              min={0}
              unlimitedValue={0}
              unlimitedLabel={l("غير محدود", "Unlimited")}
              onChange={(transactionLimit) => setForm({ ...form, transactionLimit })}
            />
            <QuotaTile
              icon={<FileStack size={18} />}
              label={l("السجلات", "Records")}
              hint={l("المستندات والإيصالات والكشوف", "Documents, receipts, and statements")}
              value={form.recordLimit}
              min={0}
              unlimitedValue={0}
              unlimitedLabel={l("غير محدود", "Unlimited")}
              onChange={(recordLimit) => setForm({ ...form, recordLimit })}
            />
            </div>
          </fieldset>

          <fieldset className="plan-studio-features">
            <legend>{l("الخصائص الممنوحة", "Granted features")}</legend>
            <div className="plan-feature-blocks">
            {PLAN_FEATURE_GROUPS.map((group) => (
              <div key={group.id} className="plan-feature-block">
                <h3>{locale === "ar" ? group.ar : group.en}</h3>
                <ul>
                  {PLAN_FEATURE_CATALOG.filter((feature) => feature.group === group.id).map((feature) => {
                    const on = form.features.includes(feature.id);
                    return (
                      <li key={feature.id}>
                        <span>{locale === "ar" ? feature.ar : feature.en}</span>
                        <Switch on={on} label={locale === "ar" ? feature.ar : feature.en} onToggle={() => toggleFeature(feature.id)} />
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
            </div>
          </fieldset>

          <fieldset>
            <legend>{l("بوابات الدفع", "Payment gateways")}</legend>
            <div className="plan-gateway-chips">
              {gateways.map((gateway) => {
                const id = String(gateway.id);
                const on = form.gatewayIds.includes(id);
                return (
                  <button
                    key={id}
                    type="button"
                    className={on ? "is-on" : ""}
                    onClick={() => toggleGateway(id)}
                  >
                    <b>{locale === "ar" ? String(gateway.name_ar) : String(gateway.name_en)}</b>
                    <small>{String(gateway.scope)}</small>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="plan-studio-actions">
            <button disabled={working} type="submit">{working ? l("جارٍ الحفظ...", "Saving...") : editing ? l("حفظ الباقة", "Save plan") : l("إنشاء الباقة", "Create plan")}</button>
            {editing ? <button type="button" onClick={() => openEditor(emptyPlan)}>{l("باقة جديدة", "New plan")}</button> : null}
          </div>
        </form>
      </section>
    </div>
  );
}
