"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, WalletCards } from "lucide-react";
import { ContentBusy, ErrorCard, Status, useCommerceLocale } from "../commercial-kit";
import { apiFetch } from "../../lib/client-api";
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
