"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, Plus, WalletCards } from "lucide-react";
import { ContentBusy, ErrorCard, money, Status, useCommerceLocale } from "../commercial-kit";
import { apiFetch } from "../../lib/client-api";
import { PLAN_FEATURE_CATALOG } from "../../lib/plan-features";
import { fetchAdminConsole, patchAdminConsole, readAdminConsole } from "../../lib/admin-session";

type Row = Record<string, unknown>;

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

export function AdminGateways() {
  const { locale, l } = useCommerceLocale();
  const router = useRouter();
  const cached = readAdminConsole();
  const [gateways, setGateways] = useState<Row[]>(() => cached?.gateways ?? []);
  const [plans, setPlans] = useState<Row[]>(() => cached?.plans ?? []);
  const [error, setError] = useState("");
  const [working, setWorking] = useState("");
  const [loaded, setLoaded] = useState(() => Boolean(cached));

  const load = useCallback(() => {
    return fetchAdminConsole()
      .then((result) => {
        setGateways(result.gateways ?? []);
        setPlans(result.plans ?? []);
        setLoaded(true);
      })
      .catch((caught: Error) => {
        if (caught.message === "AUTH") {
          router.push("/login?next=/admin/gateways");
          return;
        }
        if (!readAdminConsole()) setError(caught.message === "FORBIDDEN" ? "FORBIDDEN" : "LOAD");
      });
  }, [router]);

  useEffect(() => { void load(); }, [load]);

  const toggle = async (gateway: Row, field: "isEnabled" | "isTestMode") => {
    setWorking(String(gateway.id));
    try {
      const result = await postAction("updateGateway", {
        gatewayId: gateway.id,
        [field]: !(Number(gateway[field === "isEnabled" ? "is_enabled" : "is_test_mode"]) === 1),
      });
      setGateways((result.gateways as Row[]) ?? []);
      if (result.plans) setPlans(result.plans as Row[]);
      patchAdminConsole({
        gateways: (result.gateways as Row[]) ?? [],
        ...(result.plans ? { plans: result.plans as Row[] } : {}),
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "SAVE");
    } finally {
      setWorking("");
    }
  };

  const linkPlans = async (gatewayId: string, planIds: string[]) => {
    setWorking(gatewayId);
    try {
      const result = await postAction("updateGateway", { gatewayId, planIds });
      setGateways((result.gateways as Row[]) ?? []);
      patchAdminConsole({ gateways: (result.gateways as Row[]) ?? [] });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "SAVE");
    } finally {
      setWorking("");
    }
  };

  if (error && !gateways.length) {
    return <ErrorCard message={error === "FORBIDDEN" ? l("لا تملك صلاحية", "Forbidden") : l("تعذر التحميل", "Load failed")} retry={load} />;
  }
  if (!loaded) return <ContentBusy />;

  const scopeLabel = (scope: string) => scope === "local" ? l("محلية", "Local") : scope === "regional" ? l("إقليمية", "Regional") : l("عالمية", "Global");

  return (
    <>
      <div className="admin-page-head">
        <div>
          <small>{l("الإدارة / بوابات الدفع", "Admin / Payment gateways")}</small>
          <h1>{l("بوابات الدفع المحلية والعالمية", "Local & global payment gateways")}</h1>
          <p>{l("فعّل البوابات واربطها بالباقات. الإعدادات التقنية تُدار لاحقاً لكل مزوّد.", "Enable gateways and link them to plans. Provider credentials can be configured later.")}</p>
        </div>
      </div>
      <div className="admin-kpis">
        <article><i><CreditCard /></i><span>{l("إجمالي البوابات", "Total gateways")}</span><b>{gateways.length}</b><small>{l("في الكتالوج", "in catalog")}</small></article>
        <article><i><CreditCard /></i><span>{l("مفعّلة", "Enabled")}</span><b>{gateways.filter((g) => Number(g.is_enabled) === 1).length}</b><small>{l("جاهزة للاستخدام", "ready")}</small></article>
        <article><i><WalletCards /></i><span>{l("الباقات", "Plans")}</span><b>{plans.length}</b><small>{l("قابلة للربط", "linkable")}</small></article>
      </div>
      <section className="admin-panel admin-table-panel">
        <div className="admin-table-scroll">
          <table>
            <thead>
              <tr>
                <th>{l("البوابة", "Gateway")}</th>
                <th>{l("النطاق", "Scope")}</th>
                <th>{l("الطرق", "Methods")}</th>
                <th>{l("الوضع", "Mode")}</th>
                <th>{l("الباقات المرتبطة", "Linked plans")}</th>
                <th>{l("التفعيل", "Enable")}</th>
              </tr>
            </thead>
            <tbody>
              {gateways.map((gateway) => {
                const planIds = Array.isArray(gateway.plan_ids) ? gateway.plan_ids.map(String) : [];
                return (
                  <tr key={String(gateway.id)}>
                    <td>
                      <b>{locale === "ar" ? String(gateway.name_ar) : String(gateway.name_en)}</b>
                      <small>{String(gateway.provider_key)}</small>
                    </td>
                    <td>{scopeLabel(String(gateway.scope))}</td>
                    <td><small>{Array.isArray(gateway.methods) ? gateway.methods.join(", ") : "—"}</small></td>
                    <td>
                      <button disabled={working === gateway.id} onClick={() => void toggle(gateway, "isTestMode")}>
                        {Number(gateway.is_test_mode) === 1 ? l("تجريبي", "Test") : l("إنتاج", "Live")}
                      </button>
                    </td>
                    <td>
                      <select
                        multiple
                        disabled={working === String(gateway.id)}
                        value={planIds}
                        style={{ minWidth: 160, minHeight: 72 }}
                        onChange={(event) => {
                          const selected = Array.from(event.target.selectedOptions).map((option) => option.value);
                          void linkPlans(String(gateway.id), selected);
                        }}
                      >
                        {plans.map((plan) => (
                          <option key={String(plan.id)} value={String(plan.id)}>
                            {locale === "ar" ? String(plan.name_ar) : String(plan.name_en)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <button disabled={working === gateway.id} onClick={() => void toggle(gateway, "isEnabled")}>
                        <Status value={Number(gateway.is_enabled) === 1 ? "active" : "closed"} locale={locale} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

const emptyPlan = {
  id: "",
  nameAr: "",
  nameEn: "",
  descriptionAr: "",
  descriptionEn: "",
  monthlyMinor: 0,
  annualMinor: 0,
  walletLimit: 1,
  memberLimit: 2,
  features: ["personal"] as string[],
  isActive: true,
  sortOrder: 10,
  gatewayIds: [] as string[],
};

export function AdminPlans() {
  const { locale, l } = useCommerceLocale();
  const router = useRouter();
  const cached = readAdminConsole();
  const [plans, setPlans] = useState<Row[]>(() => cached?.plans ?? []);
  const [gateways, setGateways] = useState<Row[]>(() => cached?.gateways ?? []);
  const [form, setForm] = useState(emptyPlan);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [loaded, setLoaded] = useState(() => Boolean(cached));

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

  const edit = (plan: Row) => {
    setForm({
      id: String(plan.id),
      nameAr: String(plan.name_ar ?? ""),
      nameEn: String(plan.name_en ?? ""),
      descriptionAr: String(plan.description_ar ?? ""),
      descriptionEn: String(plan.description_en ?? ""),
      monthlyMinor: Number(plan.monthly_minor ?? 0),
      annualMinor: Number(plan.annual_minor ?? 0),
      walletLimit: Number(plan.wallet_limit ?? 1),
      memberLimit: Number(plan.member_limit ?? 2),
      features: Array.isArray(plan.features) ? plan.features.map(String) : ["personal"],
      isActive: Number(plan.is_active) === 1,
      sortOrder: Number(plan.sort_order ?? 0),
      gatewayIds: Array.isArray(plan.gateway_ids) ? plan.gateway_ids.map(String) : [],
    });
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setWorking(true);
    try {
      const result = await postAction("upsertPlan", form);
      setPlans((result.plans as Row[]) ?? []);
      if (result.gateways) setGateways(result.gateways as Row[]);
      patchAdminConsole({
        plans: (result.plans as Row[]) ?? [],
        ...(result.gateways ? { gateways: result.gateways as Row[] } : {}),
      });
      setForm(emptyPlan);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "SAVE");
    } finally {
      setWorking(false);
    }
  };

  if (error && !plans.length) {
    return <ErrorCard message={error === "FORBIDDEN" ? l("لا تملك صلاحية", "Forbidden") : l("تعذر التحميل", "Load failed")} retry={load} />;
  }
  if (!loaded) return <ContentBusy />;

  return (
    <>
      <div className="admin-page-head">
        <div>
          <small>{l("الإدارة / الباقات", "Admin / Plans")}</small>
          <h1>{l("الباقات والصلاحيات", "Plans & entitlements")}</h1>
          <p>{l("عدّل الأسعار والحدود والميزات وبوابات الدفع المرتبطة بكل باقة.", "Edit pricing, limits, features and payment gateways per plan.")}</p>
        </div>
      </div>

      <section className="admin-panel">
        <div className="admin-panel-head">
          <div>
            <h2>{form.id ? l("تعديل الباقة", "Edit plan") : l("باقة جديدة", "New plan")}</h2>
            <p>{l("الصلاحيات تُطبَّق عند إنشاء المحافظ والمستندات.", "Entitlements apply when creating wallets and documents.")}</p>
          </div>
        </div>
        <form className="coupon-create" onSubmit={submit} style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))" }}>
          <input required value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value })} placeholder={l("المعرّف (starter)", "id (starter)")} />
          <input required value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} placeholder={l("الاسم عربي", "Arabic name")} />
          <input required value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} placeholder={l("الاسم إنجليزي", "English name")} />
          <input required value={form.descriptionAr} onChange={(e) => setForm({ ...form, descriptionAr: e.target.value })} placeholder={l("الوصف عربي", "Arabic description")} />
          <input required value={form.descriptionEn} onChange={(e) => setForm({ ...form, descriptionEn: e.target.value })} placeholder={l("الوصف إنجليزي", "English description")} />
          <input type="number" min={0} value={form.monthlyMinor} onChange={(e) => setForm({ ...form, monthlyMinor: Number(e.target.value) })} placeholder={l("شهري (بيسة)", "Monthly minor")} />
          <input type="number" min={0} value={form.annualMinor} onChange={(e) => setForm({ ...form, annualMinor: Number(e.target.value) })} placeholder={l("سنوي (بيسة)", "Annual minor")} />
          <input type="number" min={1} value={form.walletLimit} onChange={(e) => setForm({ ...form, walletLimit: Number(e.target.value) })} placeholder={l("حد المحافظ", "Wallet limit")} />
          <input type="number" min={1} value={form.memberLimit} onChange={(e) => setForm({ ...form, memberLimit: Number(e.target.value) })} placeholder={l("حد الأعضاء", "Member limit")} />
          <input type="number" min={0} value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })} placeholder={l("الترتيب", "Sort")} />
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
            {l("نشطة", "Active")}
          </label>
          <div style={{ gridColumn: "1 / -1" }}>
            <small>{l("الصلاحيات", "Features")}</small>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
              {PLAN_FEATURE_CATALOG.map((feature) => (
                <label key={feature.id} style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={form.features.includes(feature.id)}
                    onChange={(e) => setForm({
                      ...form,
                      features: e.target.checked ? [...form.features, feature.id] : form.features.filter((item) => item !== feature.id),
                    })}
                  />
                  {locale === "ar" ? feature.ar : feature.en}
                </label>
              ))}
            </div>
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <small>{l("بوابات الدفع", "Payment gateways")}</small>
            <select
              multiple
              value={form.gatewayIds}
              style={{ width: "100%", minHeight: 90, marginTop: 6 }}
              onChange={(e) => setForm({ ...form, gatewayIds: Array.from(e.target.selectedOptions).map((o) => o.value) })}
            >
              {gateways.map((gateway) => (
                <option key={String(gateway.id)} value={String(gateway.id)}>
                  {locale === "ar" ? String(gateway.name_ar) : String(gateway.name_en)} ({String(gateway.scope)})
                </option>
              ))}
            </select>
          </div>
          <button disabled={working} type="submit"><Plus />{form.id ? l("حفظ التعديل", "Save changes") : l("إنشاء باقة", "Create plan")}</button>
          {form.id && <button type="button" onClick={() => setForm(emptyPlan)}>{l("إلغاء", "Cancel")}</button>}
        </form>
      </section>

      <section className="admin-panel admin-table-panel">
        <div className="admin-table-scroll">
          <table>
            <thead>
              <tr>
                <th>{l("الباقة", "Plan")}</th>
                <th>{l("السعر", "Price")}</th>
                <th>{l("الحدود", "Limits")}</th>
                <th>{l("الصلاحيات", "Features")}</th>
                <th>{l("المشتركون", "Subscribers")}</th>
                <th>{l("الحالة", "Status")}</th>
                <th>{l("إجراء", "Action")}</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((plan) => (
                <tr key={String(plan.id)}>
                  <td><b>{locale === "ar" ? String(plan.name_ar) : String(plan.name_en)}</b><small>{String(plan.id)}</small></td>
                  <td>{money(Number(plan.monthly_minor ?? 0), locale)} / {l("شهر", "mo")}</td>
                  <td>{String(plan.wallet_limit)} {l("محافظ", "wallets")} · {String(plan.member_limit)} {l("أعضاء", "members")}</td>
                  <td><small>{Array.isArray(plan.features) ? plan.features.join(", ") : "—"}</small></td>
                  <td>{String(plan.subscriber_count ?? 0)}</td>
                  <td><Status value={Number(plan.is_active) === 1 ? "active" : "closed"} locale={locale} /></td>
                  <td><button onClick={() => edit(plan)}>{l("تعديل", "Edit")}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
