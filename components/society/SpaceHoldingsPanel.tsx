"use client";

import { FormEvent, useState } from "react";
import { CalendarClock, Landmark, PiggyBank, Plus, TrendingUp } from "lucide-react";
import { apiFetch } from "../../lib/client-api";
import { currencyScale, formatMoneyMinor } from "../../lib/money";
import {
  holdingKindLabel,
  holdingMaturityLabel,
  holdingMaturityTone,
  holdingsExpectedReturnMinor,
  holdingsTotalMinor,
} from "../../lib/space-holdings";
import { DateField } from "../ui/date-field";

type Locale = "ar" | "en";

type Holding = {
  id: string;
  space_id: string;
  name: string;
  kind: string;
  amount_minor: number;
  notes?: string | null;
  acquired_at: string;
  matures_at?: string | null;
  expected_return_minor?: number;
  status?: string;
};

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

function dateInputValue(iso: string | null | undefined) {
  if (!iso) return "";
  return iso.slice(0, 10);
}

export function SpaceHoldingsPanel({
  spaceId,
  currency,
  cashMinor,
  holdings,
  locale,
  canManage,
  onChanged,
}: {
  spaceId: string;
  currency: string;
  cashMinor: number;
  holdings: Holding[];
  locale: Locale;
  canManage: boolean;
  onChanged: (next: Record<string, unknown>) => void;
}) {
  const active = holdings.filter((row) => row.space_id === spaceId && (row.status ?? "active") === "active");
  const invested = holdingsTotalMinor(active);
  const expectedReturn = holdingsExpectedReturnMinor(active);
  const total = cashMinor + invested;
  const nextMaturity = active
    .filter((row) => row.matures_at)
    .slice()
    .sort((a, b) => String(a.matures_at).localeCompare(String(b.matures_at)))[0];
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"deposit" | "investment" | "other">("deposit");
  const [amount, setAmount] = useState("");
  const [occurredOn, setOccurredOn] = useState(todayInput());
  const [maturesOn, setMaturesOn] = useState("");
  const [expectedReturnText, setExpectedReturnText] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [editId, setEditId] = useState("");
  const [editMaturesOn, setEditMaturesOn] = useState("");
  const [editExpectedReturn, setEditExpectedReturn] = useState("");
  const [editNotes, setEditNotes] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await apiFetch("/api/dashboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "addSpaceHolding",
          idempotencyKey: crypto.randomUUID(),
          spaceId,
          name,
          kind,
          amount,
          notes: notes.trim() || undefined,
          occurredAt: occurredOn,
          maturesAt: maturesOn || undefined,
          expectedReturn: expectedReturnText.trim() || undefined,
        }),
      });
      const result = await response.json() as Record<string, unknown> & { error?: string };
      if (!response.ok) {
        const messages: Record<string, string> = locale === "ar"
          ? { INSUFFICIENT_FUNDS: "النقد المتاح لا يكفي لهذا التحويل.", INVALID_AMOUNT: "المبلغ غير صالح.", INVALID_HOLDING: "بيانات الأصل ناقصة." }
          : { INSUFFICIENT_FUNDS: "Not enough spendable cash.", INVALID_AMOUNT: "Invalid amount.", INVALID_HOLDING: "Holding details incomplete." };
        throw new Error(messages[result.error ?? ""] ?? result.error ?? "FAILED");
      }
      onChanged(result);
      setOpen(false);
      setName("");
      setAmount("");
      setMaturesOn("");
      setExpectedReturnText("");
      setNotes("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "FAILED");
    } finally {
      setSaving(false);
    }
  };

  const redeem = async (holding: Holding) => {
    const profit = Number(holding.expected_return_minor || 0);
    let includeExpectedReturn = false;
    if (profit > 0) {
      includeExpectedReturn = window.confirm(locale === "ar"
        ? `استرداد «${holding.name}» مع الأرباح المتوقعة ${formatMoneyMinor(profit, currency, locale)}؟\nموافق = أصل + أرباح · إلغاء = الأصل فقط.`
        : `Return “${holding.name}” with expected profit ${formatMoneyMinor(profit, currency, locale)}?\nOK = principal + profit · Cancel = principal only.`);
      if (!includeExpectedReturn && !window.confirm(locale === "ar"
        ? `استرداد الأصل فقط بدون الأرباح؟`
        : `Return principal only (no profit)?`)) {
        return;
      }
    } else if (!window.confirm(locale === "ar"
      ? `استرداد «${holding.name}» إلى النقد المتاح؟`
      : `Return “${holding.name}” to spendable cash?`)) {
      return;
    }
    setBusyId(holding.id);
    try {
      const response = await apiFetch("/api/dashboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "redeemSpaceHolding",
          idempotencyKey: crypto.randomUUID(),
          holdingId: holding.id,
          includeExpectedReturn,
        }),
      });
      const result = await response.json() as Record<string, unknown> & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "FAILED");
      onChanged(result);
    } catch (caught) {
      window.alert(caught instanceof Error ? caught.message : "FAILED");
    } finally {
      setBusyId("");
    }
  };

  const startEdit = (holding: Holding) => {
    setEditId(holding.id);
    setEditMaturesOn(dateInputValue(holding.matures_at));
    setEditExpectedReturn(
      Number(holding.expected_return_minor || 0) > 0
        ? (Number(holding.expected_return_minor) / 10 ** currencyScale(currency)).toFixed(currencyScale(currency))
        : "",
    );
    setEditNotes(holding.notes || "");
  };

  const saveEdit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editId) return;
    setBusyId(editId);
    setError("");
    try {
      const response = await apiFetch("/api/dashboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "updateSpaceHolding",
          idempotencyKey: crypto.randomUUID(),
          holdingId: editId,
          maturesAt: editMaturesOn || undefined,
          clearMaturesAt: !editMaturesOn,
          expectedReturn: editExpectedReturn.trim() || "0",
          notes: editNotes.trim() || null,
        }),
      });
      const result = await response.json() as Record<string, unknown> & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "FAILED");
      onChanged(result);
      setEditId("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "FAILED");
    } finally {
      setBusyId("");
    }
  };

  return (
    <article className="panel workflow-panel">
      <div className="panel-heading">
        <div>
          <span className="section-kicker"><PiggyBank size={15} />{locale === "ar" ? "النقد والودائع والاستثمارات" : "Cash, deposits & investments"}</span>
          <h2>{locale === "ar" ? "أين فلوس الجمعية؟" : "Where is the association money?"}</h2>
        </div>
        {canManage ? (
          <button type="button" className="primary-button" onClick={() => setOpen((value) => !value)}>
            <Plus size={15} />{locale === "ar" ? "تحويل لوديعة / استثمار" : "Move to deposit / investment"}
          </button>
        ) : null}
      </div>
      <p className="modal-note">
        {locale === "ar"
          ? "النقد المتاح هو ما يُصرف منه. سجّل تاريخ استحقاق الوديعة والأرباح المتوقعة؛ عند الاسترداد يمكن إضافة الأرباح للنقد."
          : "Spendable cash is what you can spend. Record maturity and expected profit; on redeem you can credit the profit to cash."}
      </p>
      <div className="space-hero-facts-row" style={{ marginBottom: 12 }}>
        <div className="hero-fact-mint"><i><Landmark size={16} /></i><div><small>{locale === "ar" ? "نقد متاح" : "Spendable cash"}</small><b>{formatMoneyMinor(cashMinor, currency, locale)}</b></div></div>
        <div className="hero-fact-violet"><i><PiggyBank size={16} /></i><div><small>{locale === "ar" ? "ودائع واستثمارات" : "Holdings"}</small><b>{formatMoneyMinor(invested, currency, locale)}</b></div></div>
        <div className="hero-fact-gold"><i><TrendingUp size={16} /></i><div><small>{locale === "ar" ? "إجمالي الأصول" : "Total assets"}</small><b>{formatMoneyMinor(total, currency, locale)}</b></div></div>
        <div className="hero-fact-mint"><i><CalendarClock size={16} /></i><div>
          <small>{locale === "ar" ? "أقرب استحقاق" : "Next maturity"}</small>
          <b>{nextMaturity ? holdingMaturityLabel(nextMaturity.matures_at, locale) : (locale === "ar" ? "—" : "—")}</b>
          {expectedReturn > 0 ? <span style={{ display: "block", fontSize: 12, opacity: 0.8 }}>{locale === "ar" ? `أرباح متوقعة ${formatMoneyMinor(expectedReturn, currency, locale)}` : `Expected profit ${formatMoneyMinor(expectedReturn, currency, locale)}`}</span> : null}
        </div></div>
      </div>
      {open ? (
        <form className="modal-form" onSubmit={submit} style={{ padding: "0 0 16px" }}>
          <label><span>{locale === "ar" ? "الاسم" : "Name"}</span><input required minLength={2} value={name} onChange={(event) => setName(event.target.value)} placeholder={locale === "ar" ? "مثال: وديعة 6 أشهر" : "e.g. 6-month deposit"} /></label>
          <div className="form-row">
            <label><span>{locale === "ar" ? "النوع" : "Type"}</span>
              <select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}>
                <option value="deposit">{locale === "ar" ? "وديعة بنكية" : "Bank deposit"}</option>
                <option value="investment">{locale === "ar" ? "استثمار / أسهم" : "Investment / stocks"}</option>
                <option value="other">{locale === "ar" ? "أصل آخر" : "Other asset"}</option>
              </select>
            </label>
            <label><span>{locale === "ar" ? "المبلغ من النقد" : "Amount from cash"}</span><input required inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^\d.]/g, ""))} /></label>
          </div>
          <div className="form-row">
            <label><span>{locale === "ar" ? "تاريخ التحويل" : "Transfer date"}</span><DateField required value={occurredOn} onChange={setOccurredOn} /></label>
            <label><span>{locale === "ar" ? "تاريخ الاستحقاق / الإرجاع" : "Maturity / return date"}</span><DateField value={maturesOn} onChange={setMaturesOn} /></label>
          </div>
          <div className="form-row">
            <label><span>{locale === "ar" ? "الأرباح المتوقعة عند الاستحقاق" : "Expected profit at maturity"}</span><input inputMode="decimal" value={expectedReturnText} onChange={(event) => setExpectedReturnText(event.target.value.replace(/[^\d.]/g, ""))} placeholder="0" /></label>
            <label><span>{locale === "ar" ? "ملاحظة (اختياري)" : "Note (optional)"}</span><input value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
          </div>
          {error ? <p className="modal-error">{error}</p> : null}
          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={() => setOpen(false)}>{locale === "ar" ? "إلغاء" : "Cancel"}</button>
            <button className="primary-button" disabled={saving}>{saving ? "…" : (locale === "ar" ? "تحويل من النقد" : "Move from cash")}</button>
          </div>
        </form>
      ) : null}
      {active.length ? (
        <div className="members-table">
          <div className="table-head" style={{ gridTemplateColumns: "2fr 1fr 1fr 1.2fr 1.4fr" }}>
            <span>{locale === "ar" ? "الأصل" : "Holding"}</span>
            <span>{locale === "ar" ? "النوع" : "Type"}</span>
            <span>{locale === "ar" ? "المبلغ" : "Amount"}</span>
            <span>{locale === "ar" ? "الاستحقاق / الأرباح" : "Maturity / profit"}</span>
            <span>{locale === "ar" ? "إجراء" : "Action"}</span>
          </div>
          {active.map((holding) => {
            const tone = holdingMaturityTone(holding.matures_at);
            const toneColor = tone === "overdue" ? "var(--danger, #b42318)" : tone === "soon" ? "var(--warning, #b54708)" : undefined;
            return (
              <div className="member-row" key={holding.id} style={{ gridTemplateColumns: "2fr 1fr 1fr 1.2fr 1.4fr" }}>
                <div>
                  <strong>{holding.name}</strong>
                  <span>{new Date(holding.acquired_at).toLocaleDateString(locale === "ar" ? "ar-OM" : "en-GB")}{holding.notes ? ` · ${holding.notes}` : ""}</span>
                </div>
                <span>{holdingKindLabel(holding.kind, locale)}</span>
                <strong>{formatMoneyMinor(holding.amount_minor, currency, locale)}</strong>
                <div>
                  <strong style={{ color: toneColor }}>{holdingMaturityLabel(holding.matures_at, locale)}</strong>
                  <span>{Number(holding.expected_return_minor || 0) > 0
                    ? (locale === "ar" ? `أرباح ${formatMoneyMinor(holding.expected_return_minor || 0, currency, locale)}` : `Profit ${formatMoneyMinor(holding.expected_return_minor || 0, currency, locale)}`)
                    : (locale === "ar" ? "بدون أرباح مسجّلة" : "No profit set")}</span>
                </div>
                {canManage ? (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button type="button" className="secondary-button compact" disabled={busyId === holding.id} onClick={() => startEdit(holding)}>
                      {locale === "ar" ? "تعديل" : "Edit"}
                    </button>
                    <button type="button" className="secondary-button compact" disabled={busyId === holding.id} onClick={() => void redeem(holding)}>
                      {locale === "ar" ? "استرداد للنقد" : "Return to cash"}
                    </button>
                  </div>
                ) : <span>—</span>}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="modal-note">{locale === "ar" ? "لا ودائع أو استثمارات بعد. الـ 3000 وديعة تُسجَّل هنا لا كمصروف." : "No deposits or investments yet. Bank deposits belong here, not as expenses."}</p>
      )}
      {editId ? (
        <form className="modal-form" onSubmit={saveEdit} style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border, #e5e7eb)" }}>
          <h3 style={{ margin: "0 0 8px", fontSize: 16 }}>{locale === "ar" ? "تعديل الاستحقاق والأرباح" : "Edit maturity & profit"}</h3>
          <div className="form-row">
            <label><span>{locale === "ar" ? "تاريخ الاستحقاق / الإرجاع" : "Maturity / return date"}</span><DateField value={editMaturesOn} onChange={setEditMaturesOn} /></label>
            <label><span>{locale === "ar" ? "الأرباح المتوقعة" : "Expected profit"}</span><input inputMode="decimal" value={editExpectedReturn} onChange={(event) => setEditExpectedReturn(event.target.value.replace(/[^\d.]/g, ""))} /></label>
          </div>
          <label><span>{locale === "ar" ? "ملاحظة" : "Note"}</span><input value={editNotes} onChange={(event) => setEditNotes(event.target.value)} /></label>
          {error ? <p className="modal-error">{error}</p> : null}
          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={() => setEditId("")}>{locale === "ar" ? "إلغاء" : "Cancel"}</button>
            <button className="primary-button" disabled={busyId === editId}>{locale === "ar" ? "حفظ" : "Save"}</button>
          </div>
        </form>
      ) : null}
    </article>
  );
}
