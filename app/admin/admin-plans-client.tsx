"use client";

import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeftRight,
  CalendarDays,
  Check,
  FileStack,
  Plus,
  Printer,
  UserRound,
  Users,
  WalletCards,
} from "lucide-react";
import { ContentBusy, ErrorCard, money, useCommerceLocale } from "../commercial-kit";
import { apiFetch } from "../../lib/client-api";
import { errorLabel, scopeLabel } from "../../lib/admin-labels";
import {
  PLAN_FEATURE_CATALOG,
  PLAN_FEATURE_GROUPS,
  PLAN_FEATURE_KEYS,
  planHasFeature,
  quotaIsUnlimited,
} from "../../lib/plan-features";
import { fetchAdminConsole, patchAdminConsole, readAdminConsole } from "../../lib/admin-session";

type Row = Record<string, unknown>;
type Locale = "ar" | "en";

type PlanForm = {
  key: string;
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
  dailyTransactionLimit: number;
  monthlyTransactionLimit: number;
  printLimit: number;
  features: string[];
  isActive: boolean;
  sortOrder: number;
  gatewayIds: string[];
};

type QuotaField = {
  key: "walletLimit" | "memberLimit" | "userLimit" | "transactionLimit" | "recordLimit" | "dailyTransactionLimit" | "monthlyTransactionLimit" | "printLimit";
  ar: string;
  en: string;
  hintAr: string;
  hintEn: string;
  min: number;
  unlimitedValue: number;
  restore: number;
  icon: ReactNode;
};

const emptyPlan = (sortOrder: number): PlanForm => ({
  key: `new-${crypto.randomUUID()}`,
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
  dailyTransactionLimit: 5,
  monthlyTransactionLimit: 50,
  printLimit: 10,
  features: ["personal"],
  isActive: true,
  sortOrder,
  gatewayIds: [],
});

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
  const id = String(plan.id ?? "");
  return {
    key: id,
    id,
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
    dailyTransactionLimit: Number(plan.daily_transaction_limit ?? 0),
    monthlyTransactionLimit: Number(plan.monthly_transaction_limit ?? 0),
    printLimit: Number(plan.print_limit ?? 0),
    features: Array.isArray(plan.features) ? plan.features.map(String) : ["personal"],
    isActive: Number(plan.is_active) === 1,
    sortOrder: Number(plan.sort_order ?? 0),
    gatewayIds: Array.isArray(plan.gateway_ids) ? plan.gateway_ids.map(String) : [],
  };
}

function snapshot(form: PlanForm) {
  const { key: _key, ...rest } = form;
  return JSON.stringify(rest);
}

function Switch({ on, label, onToggle }: { on: boolean; label: string; onToggle: () => void }) {
  return (
    <button type="button" className={`plan-switch${on ? " is-on" : ""}`} role="switch" aria-checked={on} aria-label={label} onClick={onToggle}>
      <i />
    </button>
  );
}

function toggleFeature(features: string[], featureId: string) {
  const expanded = features.includes("*") || features.includes("unlimited")
    ? [...PLAN_FEATURE_KEYS]
    : features;
  return expanded.includes(featureId)
    ? expanded.filter((item) => item !== featureId)
    : [...expanded, featureId];
}

export function AdminPlans() {
  const { locale, l } = useCommerceLocale();
  const router = useRouter();
  const cached = readAdminConsole();
  const [plans, setPlans] = useState<Row[]>(() => cached?.plans ?? []);
  const [gateways, setGateways] = useState<Row[]>(() => cached?.gateways ?? []);
  const [drafts, setDrafts] = useState<PlanForm[]>(() => (cached?.plans ?? []).map(planToForm));
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [savingKey, setSavingKey] = useState("");
  const [loaded, setLoaded] = useState(() => Boolean(cached));

  const originals = useMemo(
    () => Object.fromEntries((plans ?? []).map((plan) => [String(plan.id), snapshot(planToForm(plan))])),
    [plans],
  );

  const load = useCallback(() => {
    return fetchAdminConsole()
      .then((result) => {
        const nextPlans = result.plans ?? [];
        setPlans(nextPlans);
        setGateways(result.gateways ?? []);
        setDrafts(nextPlans.map(planToForm));
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

  const patchDraft = (key: string, patch: Partial<PlanForm> | ((current: PlanForm) => PlanForm)) => {
    setDrafts((current) => current.map((draft) => {
      if (draft.key !== key) return draft;
      return typeof patch === "function" ? patch(draft) : { ...draft, ...patch };
    }));
    setNotice("");
  };

  const addPlan = () => {
    const sortOrder = drafts.reduce((max, draft) => Math.max(max, draft.sortOrder), 0) + 10;
    setDrafts((current) => [...current, emptyPlan(sortOrder)]);
    setNotice("");
  };

  const saveDraft = async (draft: PlanForm) => {
    setSavingKey(draft.key);
    setError("");
    setNotice("");
    try {
      const result = await postAction("upsertPlan", {
        id: draft.id.trim().toLowerCase(),
        nameAr: draft.nameAr,
        nameEn: draft.nameEn,
        descriptionAr: draft.descriptionAr,
        descriptionEn: draft.descriptionEn,
        monthlyMinor: omrToMinor(draft.monthlyOmr),
        annualMinor: omrToMinor(draft.annualOmr),
        walletLimit: draft.walletLimit,
        memberLimit: draft.memberLimit,
        transactionLimit: draft.transactionLimit,
        recordLimit: draft.recordLimit,
        userLimit: draft.userLimit,
        dailyTransactionLimit: draft.dailyTransactionLimit,
        monthlyTransactionLimit: draft.monthlyTransactionLimit,
        printLimit: draft.printLimit,
        features: draft.features,
        isActive: draft.isActive,
        sortOrder: draft.sortOrder,
        gatewayIds: draft.gatewayIds,
      });
      const nextPlans = (result.plans as Row[]) ?? [];
      const savedId = draft.id.trim().toLowerCase();
      const saved = nextPlans.find((plan) => String(plan.id) === savedId);
      setPlans(nextPlans);
      if (result.gateways) setGateways(result.gateways as Row[]);
      patchAdminConsole({
        plans: nextPlans,
        ...(result.gateways ? { gateways: result.gateways as Row[] } : {}),
      });
      if (saved) {
        setDrafts((current) => current.map((item) => item.key === draft.key ? planToForm(saved) : item));
      }
      setNotice(l("تم حفظ الباقة.", "Plan saved."));
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "SAVE");
      return false;
    } finally {
      setSavingKey("");
    }
  };

  const saveDirty = async () => {
    const dirty = drafts.filter((draft) => isDirty(draft, originals));
    for (const draft of dirty) {
      const ok = await saveDraft(draft);
      if (!ok) break;
    }
  };

  const subscribers = useMemo(
    () => plans.reduce((sum, plan) => sum + Number(plan.subscriber_count ?? 0), 0),
    [plans],
  );

  const quotaFields: QuotaField[] = [
    { key: "walletLimit", ar: "المحافظ", en: "Wallets", hintAr: "عدد المحافظ التي يمكن إنشاؤها", hintEn: "Wallets the subscriber can create", min: 1, unlimitedValue: 9999, restore: 1, icon: <WalletCards size={14} /> },
    { key: "memberLimit", ar: "الأعضاء لكل محفظة", en: "Members per wallet", hintAr: "سجلات الأعضاء داخل المحفظة", hintEn: "Member records inside one wallet", min: 1, unlimitedValue: 9999, restore: 2, icon: <Users size={14} /> },
    { key: "userLimit", ar: "المستخدمون", en: "Users", hintAr: "حسابات الدخول المرتبطة بالاشتراك", hintEn: "Login seats on this subscription", min: 0, unlimitedValue: 0, restore: 1, icon: <UserRound size={14} /> },
    { key: "transactionLimit", ar: "المعاملات الإجمالية", en: "Lifetime transactions", hintAr: "إجمالي الحركات في محافظ المشترك", hintEn: "Ledger entries across subscriber wallets", min: 0, unlimitedValue: 0, restore: 50, icon: <ArrowLeftRight size={14} /> },
    { key: "dailyTransactionLimit", ar: "المعاملات اليومية", en: "Daily transactions", hintAr: "حد الحركات في اليوم", hintEn: "Ledger entries allowed per day", min: 0, unlimitedValue: 0, restore: 5, icon: <CalendarDays size={14} /> },
    { key: "monthlyTransactionLimit", ar: "المعاملات الشهرية", en: "Monthly transactions", hintAr: "حد الحركات في الشهر", hintEn: "Ledger entries allowed per month", min: 0, unlimitedValue: 0, restore: 50, icon: <CalendarDays size={14} /> },
    { key: "recordLimit", ar: "السجلات", en: "Records", hintAr: "المستندات والإيصالات والكشوف", hintEn: "Documents, receipts, and statements", min: 0, unlimitedValue: 0, restore: 20, icon: <FileStack size={14} /> },
    { key: "printLimit", ar: "المطبوعات شهرياً", en: "Prints per month", hintAr: "عدد الطباعات المسموحة كل شهر", hintEn: "Print jobs allowed each month", min: 0, unlimitedValue: 0, restore: 10, icon: <Printer size={14} /> },
  ];

  if (error && !plans.length && !drafts.length) {
    return <ErrorCard message={error === "FORBIDDEN" ? l("لا تملك صلاحية", "Forbidden") : l("تعذر التحميل", "Load failed")} retry={load} />;
  }
  if (!loaded) return <ContentBusy />;

  const colSpan = drafts.length + 1;
  const dirtyCount = drafts.filter((draft) => isDirty(draft, originals)).length;

  return (
    <div className="plan-studio">
      <div className="admin-page-head">
        <div>
          <small>{l("الإدارة / الباقات", "Admin / Plans")}</small>
          <h1>{l("الباقات والاشتراكات", "Plans & subscriptions")}</h1>
          <p>{l("صف العناوين، ثم رأس كل باقة، ثم صفوف التحكم. الباقات أعمدة للمقارنة والتعديل في نفس الجدول.", "Title row, then each plan header, then control rows. Plans are columns so you can compare and edit in one table.")}</p>
        </div>
        <div className="plan-matrix-toolbar">
          {dirtyCount ? <button type="button" onClick={() => void saveDirty()} disabled={Boolean(savingKey)}>{savingKey ? l("جارٍ الحفظ...", "Saving...") : l(`حفظ التغييرات (${dirtyCount})`, `Save changes (${dirtyCount})`)}</button> : null}
          <button type="button" onClick={addPlan}><Plus />{l("عمود باقة جديدة", "New plan column")}</button>
        </div>
      </div>

      <div className="admin-kpis">
        <article><i><WalletCards /></i><span>{l("الباقات", "Plans")}</span><b>{plans.length}</b><small>{l("في الكتالوج", "in catalog")}</small></article>
        <article><i><Check /></i><span>{l("نشطة", "Active")}</span><b>{plans.filter((plan) => Number(plan.is_active) === 1).length}</b><small>{l("ظاهرة للعملاء", "visible to customers")}</small></article>
        <article><i><Users /></i><span>{l("المشتركون", "Subscribers")}</span><b>{subscribers}</b><small>{l("على كل الباقات", "across all plans")}</small></article>
      </div>

      {error ? <p className="admin-inline-alert is-error">{errorLabel(error, locale)}</p> : null}
      {notice ? <p className="admin-inline-alert is-ok">{notice}</p> : null}

      <div className="plan-matrix-shell">
        <table className="plan-matrix" aria-label={l("مقارنة الباقات وتعديلها", "Compare and edit plans")}>
          <thead>
            <tr>
              <th className="plan-matrix-titles" scope="col">{l("العناوين", "Titles")}</th>
              {drafts.map((draft, index) => {
                const monthly = omrToMinor(draft.monthlyOmr);
                const dirty = isDirty(draft, originals);
                const saved = plans.find((plan) => String(plan.id) === draft.id);
                return (
                  <th key={draft.key} scope="col" className={`plan-matrix-head${index === 2 ? " is-featured" : ""}${dirty ? " is-dirty" : ""}${draft.isActive ? "" : " is-inactive"}`}>
                    {index === 2 ? <em>{l("الأوسع استخداماً", "Most used")}</em> : null}
                    <span>{draft.id || l("باقة جديدة", "New plan")}</span>
                    <strong>{(locale === "ar" ? draft.nameAr : draft.nameEn) || l("بدون اسم", "Untitled")}</strong>
                    <b>{monthly === 0 ? l("مجاناً", "Free") : money(monthly, locale)}</b>
                    <small>{saved ? `${saved.subscriber_count ?? 0} ${l("مشترك", "subscribers")}` : l("غير محفوظة", "Unsaved")}</small>
                    <div className="plan-matrix-head-actions">
                      <label>
                        <Switch on={draft.isActive} label={l("نشطة", "Active")} onToggle={() => patchDraft(draft.key, { isActive: !draft.isActive })} />
                        {l("نشطة", "Active")}
                      </label>
                      <button type="button" disabled={!dirty || savingKey === draft.key} onClick={() => void saveDraft(draft)}>
                        {savingKey === draft.key ? l("حفظ...", "Saving...") : l("حفظ", "Save")}
                      </button>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            <SectionRow label={l("هوية الباقة", "Plan identity")} span={colSpan} />
            <ControlRow label={l("المعرّف", "Plan ID")} hint={l("لا يُغيَّر بعد الحفظ", "Locked after save")}>
              {drafts.map((draft) => (
                <td key={draft.key}>
                  <input
                    value={draft.id}
                    disabled={!draft.key.startsWith("new-")}
                    placeholder="starter"
                    onChange={(event) => patchDraft(draft.key, { id: event.target.value })}
                  />
                </td>
              ))}
            </ControlRow>
            <ControlRow label={l("الاسم عربي", "Arabic name")}>
              {drafts.map((draft) => (
                <td key={draft.key}><input value={draft.nameAr} onChange={(event) => patchDraft(draft.key, { nameAr: event.target.value })} /></td>
              ))}
            </ControlRow>
            <ControlRow label={l("الاسم إنجليزي", "English name")}>
              {drafts.map((draft) => (
                <td key={draft.key}><input value={draft.nameEn} onChange={(event) => patchDraft(draft.key, { nameEn: event.target.value })} /></td>
              ))}
            </ControlRow>
            <ControlRow label={l("الوصف عربي", "Arabic description")}>
              {drafts.map((draft) => (
                <td key={draft.key}><input value={draft.descriptionAr} onChange={(event) => patchDraft(draft.key, { descriptionAr: event.target.value })} /></td>
              ))}
            </ControlRow>
            <ControlRow label={l("الوصف إنجليزي", "English description")}>
              {drafts.map((draft) => (
                <td key={draft.key}><input value={draft.descriptionEn} onChange={(event) => patchDraft(draft.key, { descriptionEn: event.target.value })} /></td>
              ))}
            </ControlRow>
            <ControlRow label={l("ترتيب العرض", "Display order")}>
              {drafts.map((draft) => (
                <td key={draft.key}><input type="number" min={0} value={draft.sortOrder} onChange={(event) => patchDraft(draft.key, { sortOrder: Number(event.target.value) })} /></td>
              ))}
            </ControlRow>

            <SectionRow label={l("التسعير", "Pricing")} span={colSpan} />
            <ControlRow label={l("شهري (ر.ع)", "Monthly (OMR)")}>
              {drafts.map((draft) => (
                <td key={draft.key}><input type="number" min={0} step="0.001" value={draft.monthlyOmr} onChange={(event) => patchDraft(draft.key, { monthlyOmr: event.target.value })} /></td>
              ))}
            </ControlRow>
            <ControlRow label={l("سنوي (ر.ع)", "Annual (OMR)")}>
              {drafts.map((draft) => (
                <td key={draft.key}><input type="number" min={0} step="0.001" value={draft.annualOmr} onChange={(event) => patchDraft(draft.key, { annualOmr: event.target.value })} /></td>
              ))}
            </ControlRow>

            <SectionRow label={l("حدود الاشتراك", "Subscription quotas")} span={colSpan} />
            {quotaFields.map((field) => (
              <ControlRow key={field.key} label={locale === "ar" ? field.ar : field.en} hint={locale === "ar" ? field.hintAr : field.hintEn} icon={field.icon}>
                {drafts.map((draft) => (
                  <td key={draft.key}>
                    <QuotaCell
                      value={draft[field.key]}
                      min={field.min}
                      unlimitedValue={field.unlimitedValue}
                      restore={field.restore}
                      unlimitedLabel={l("غير محدود", "Unlimited")}
                      onChange={(value) => patchDraft(draft.key, { [field.key]: value })}
                    />
                  </td>
                ))}
              </ControlRow>
            ))}

            {PLAN_FEATURE_GROUPS.map((group) => (
              <Fragment key={group.id}>
                <SectionRow label={locale === "ar" ? group.ar : group.en} span={colSpan} />
                {PLAN_FEATURE_CATALOG.filter((feature) => feature.group === group.id).map((feature) => {
                  const label = locale === "ar" ? feature.ar : feature.en;
                  return (
                    <ControlRow key={feature.id} label={label}>
                      {drafts.map((draft) => {
                        const on = planHasFeature(draft.features, feature.id);
                        return (
                          <td key={draft.key} className="plan-matrix-switch">
                            <Switch on={on} label={label} onToggle={() => patchDraft(draft.key, { features: toggleFeature(draft.features, feature.id) })} />
                          </td>
                        );
                      })}
                    </ControlRow>
                  );
                })}
              </Fragment>
            ))}

            <SectionRow label={l("بوابات الدفع", "Payment gateways")} span={colSpan} />
            {gateways.map((gateway) => {
              const id = String(gateway.id);
              const label = locale === "ar" ? String(gateway.name_ar) : String(gateway.name_en);
              return (
                <ControlRow key={id} label={label} hint={scopeLabel(String(gateway.scope), locale)}>
                  {drafts.map((draft) => {
                    const on = draft.gatewayIds.includes(id);
                    return (
                      <td key={draft.key} className="plan-matrix-switch">
                        <Switch
                          on={on}
                          label={label}
                          onToggle={() => patchDraft(draft.key, {
                            gatewayIds: on ? draft.gatewayIds.filter((item) => item !== id) : [...draft.gatewayIds, id],
                          })}
                        />
                      </td>
                    );
                  })}
                </ControlRow>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function isDirty(draft: PlanForm, originals: Record<string, string>) {
  if (draft.key.startsWith("new-")) return true;
  return snapshot(draft) !== originals[draft.id];
}

function SectionRow({ label, span }: { label: string; span: number }) {
  return (
    <tr className="plan-matrix-section">
      <th colSpan={span}>{label}</th>
    </tr>
  );
}

function ControlRow({ label, hint, icon, children }: { label: string; hint?: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <tr>
      <th className="plan-matrix-label" scope="row">
        <div>
          {icon ? <i>{icon}</i> : null}
          <span>
            <b>{label}</b>
            {hint ? <small>{hint}</small> : null}
          </span>
        </div>
      </th>
      {children}
    </tr>
  );
}

function QuotaCell({
  value,
  min,
  unlimitedValue,
  restore,
  unlimitedLabel,
  onChange,
}: {
  value: number;
  min: number;
  unlimitedValue: number;
  restore: number;
  unlimitedLabel: string;
  onChange: (next: number) => void;
}) {
  const unlimited = quotaIsUnlimited(value);
  return (
    <div className={`plan-quota-cell${unlimited ? " is-unlimited" : ""}`}>
      <input
        type="number"
        min={min}
        disabled={unlimited}
        value={unlimited ? "" : value}
        placeholder="∞"
        onChange={(event) => onChange(Math.max(min, Number(event.target.value) || min))}
      />
      <button type="button" className={unlimited ? "is-on" : ""} onClick={() => onChange(unlimited ? restore : unlimitedValue)}>
        {unlimitedLabel}
      </button>
    </div>
  );
}
