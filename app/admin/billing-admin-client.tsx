"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, Globe2, Landmark, WalletCards } from "lucide-react";
import { ContentBusy, ErrorCard, useCommerceLocale } from "../commercial-kit";
import { apiFetch } from "../../lib/client-api";
import { goToSignIn } from "../../lib/client-sign-in";
import { fetchAdminConsole, patchAdminConsole, readAdminConsole } from "../../lib/admin-session";
import { AdminConsole, AdminSwitch } from "./admin-ui";
import { methodListLabel, errorLabel, scopeLabel } from "../../lib/admin-labels";

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
          goToSignIn("/admin/gateways");
          return;
        }
        if (!readAdminConsole()) setError(caught.message === "FORBIDDEN" ? "FORBIDDEN" : "LOAD");
      });
  }, [router]);

  useEffect(() => { void load(); }, [load]);

  const applyResult = (result: Record<string, unknown>) => {
    setGateways((result.gateways as Row[]) ?? []);
    if (result.plans) setPlans(result.plans as Row[]);
    patchAdminConsole({
      gateways: (result.gateways as Row[]) ?? [],
      ...(result.plans ? { plans: result.plans as Row[] } : {}),
    });
  };

  const toggle = async (gateway: Row, field: "isEnabled" | "isTestMode") => {
    setWorking(String(gateway.id));
    try {
      const result = await postAction("updateGateway", {
        gatewayId: gateway.id,
        [field]: !(Number(gateway[field === "isEnabled" ? "is_enabled" : "is_test_mode"]) === 1),
      });
      applyResult(result);
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
      applyResult(result);
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

  const enabledCount = gateways.filter((gateway) => Number(gateway.is_enabled) === 1).length;
  const localCount = gateways.filter((gateway) => String(gateway.scope) === "local").length;

  return (
    <AdminConsole>
      <div className="admin-page-head">
        <div>
          <small>{l("الإدارة / بوابات الدفع", "Admin / Payment gateways")}</small>
          <h1>{l("بوابات الدفع", "Payment gateways")}</h1>
          <p>{l("البوابات أعمدة. الصف الأول العناوين، الرأس اسم البوابة، ثم التفعيل والوضع وربط كل باقة.", "Gateways are columns. Title row, gateway header, then enable, mode, and a switch per plan.")}</p>
        </div>
      </div>
      {error ? <p className="admin-inline-alert is-error">{errorLabel(error, locale)}</p> : null}
      <div className="admin-kpis">
        <article><i><CreditCard /></i><span>{l("إجمالي البوابات", "Total gateways")}</span><b>{gateways.length}</b><small>{l("في الكتالوج", "in catalog")}</small></article>
        <article><i><CreditCard /></i><span>{l("مفعّلة", "Enabled")}</span><b>{enabledCount}</b><small>{l("جاهزة للاستخدام", "ready")}</small></article>
        <article><i><Landmark /></i><span>{l("محلية", "Local")}</span><b>{localCount}</b><small>{l("عُمان والخليج", "Oman & GCC")}</small></article>
        <article><i><WalletCards /></i><span>{l("الباقات", "Plans")}</span><b>{plans.length}</b><small>{l("قابلة للربط", "linkable")}</small></article>
      </div>
      <div className="plan-matrix-shell">
        <table className="plan-matrix">
          <thead>
            <tr>
              <th className="plan-matrix-titles" scope="col">{l("العناوين", "Titles")}</th>
              {gateways.map((gateway) => (
                <th key={String(gateway.id)} className={`plan-matrix-head${Number(gateway.is_enabled) === 1 ? "" : " is-inactive"}`} scope="col">
                  <span>{String(gateway.provider_key)}</span>
                  <strong>{locale === "ar" ? String(gateway.name_ar) : String(gateway.name_en)}</strong>
                  <small>{scopeLabel(String(gateway.scope), locale)}</small>
                  <span className="plan-head-chip">{methodListLabel(gateway.methods, locale)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="plan-matrix-section">
              <th colSpan={gateways.length + 1}>{l("التشغيل", "Operation")}</th>
            </tr>
            <tr>
              <th className="plan-matrix-label" scope="row"><div><span><b>{l("مفعّلة", "Enabled")}</b><small>{l("ظاهرة للدفع", "Visible for checkout")}</small></span></div></th>
              {gateways.map((gateway) => (
                <td key={String(gateway.id)} className="plan-matrix-switch">
                  <AdminSwitch
                    on={Number(gateway.is_enabled) === 1}
                    disabled={working === String(gateway.id)}
                    label={l("تفعيل", "Enable")}
                    onToggle={() => void toggle(gateway, "isEnabled")}
                  />
                </td>
              ))}
            </tr>
            <tr>
              <th className="plan-matrix-label" scope="row"><div><span><b>{l("وضع تجريبي", "Test mode")}</b><small>{l("بدون تحصيل حقيقي", "No live capture")}</small></span></div></th>
              {gateways.map((gateway) => (
                <td key={String(gateway.id)} className="plan-matrix-switch">
                  <AdminSwitch
                    on={Number(gateway.is_test_mode) === 1}
                    disabled={working === String(gateway.id)}
                    label={l("تجريبي", "Test")}
                    onToggle={() => void toggle(gateway, "isTestMode")}
                  />
                </td>
              ))}
            </tr>
            <tr className="plan-matrix-section">
              <th colSpan={gateways.length + 1}>{l("الباقات المرتبطة", "Linked plans")}</th>
            </tr>
            {plans.map((plan) => {
              const planId = String(plan.id);
              const label = locale === "ar" ? String(plan.name_ar) : String(plan.name_en);
              return (
                <tr key={planId}>
                  <th className="plan-matrix-label" scope="row">
                    <div>
                      <span>
                        <b>{label}</b>
                        <small>{planId}</small>
                      </span>
                    </div>
                  </th>
                  {gateways.map((gateway) => {
                    const planIds = Array.isArray(gateway.plan_ids) ? gateway.plan_ids.map(String) : [];
                    const on = planIds.includes(planId);
                    return (
                      <td key={String(gateway.id)} className="plan-matrix-switch">
                        <AdminSwitch
                          on={on}
                          disabled={working === String(gateway.id)}
                          label={`${label} / ${String(gateway.id)}`}
                          onToggle={() => void linkPlans(String(gateway.id), on ? planIds.filter((id) => id !== planId) : [...planIds, planId])}
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            <tr>
              <th className="plan-matrix-label" scope="row"><div><i><Globe2 size={14} /></i><span><b>{l("النطاق", "Scope")}</b></span></div></th>
              {gateways.map((gateway) => (
                <td key={String(gateway.id)}>{scopeLabel(String(gateway.scope), locale)}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </AdminConsole>
  );
}
