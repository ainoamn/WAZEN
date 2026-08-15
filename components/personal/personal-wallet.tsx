"use client";

import { FormEvent, useMemo, useState } from "react";
import { Banknote, Check, Plus, WalletCards, X } from "lucide-react";
import { apiFetch } from "../../lib/client-api";
import { formatMoneyMinor } from "../../lib/money";
import OmrSymbol from "../brand/OmrSymbol";

type Locale = "ar" | "en";

export type PersonalAccount = {
  id: string;
  space_id: string;
  name: string;
  kind: string;
  opening_minor: number;
  balance_minor?: number;
};

export type PersonalRule = {
  id: string;
  space_id: string;
  account_id?: string | null;
  kind: string;
  name: string;
  amount_mode: string;
  amount_minor: number;
  due_day: number;
  starts_at: string;
  ends_at?: string | null;
  total_minor: number;
  duration_months: number;
  paid_minor: number;
  status: string;
};

export type PersonalOccurrence = {
  id: string;
  rule_id: string;
  space_id: string;
  account_id?: string | null;
  period_key: string;
  due_at: string;
  expected_minor: number;
  actual_minor?: number | null;
  status: string;
  rule_name?: string;
  rule_kind?: string;
  amount_mode?: string;
  total_minor?: number;
  rule_paid_minor?: number;
};

function money(minor: number, locale: Locale) {
  return formatMoneyMinor(minor, "OMR", locale);
}

export function PersonalWalletPanel({
  spaceId,
  locale,
  accounts,
  rules,
  occurrences,
  onChanged,
}: {
  spaceId: string;
  locale: Locale;
  accounts: PersonalAccount[];
  rules: PersonalRule[];
  occurrences: PersonalOccurrence[];
  onChanged: (next: Record<string, unknown>) => void;
}) {
  const [accountOpen, setAccountOpen] = useState(false);
  const [ruleOpen, setRuleOpen] = useState<"income" | "expense" | null>(null);
  const spaceAccounts = accounts.filter((item) => item.space_id === spaceId);
  const spaceRules = rules.filter((item) => item.space_id === spaceId);
  const pending = occurrences.filter((item) => item.space_id === spaceId && item.status === "pending");
  const loans = spaceRules.filter((item) => Number(item.total_minor) > 0);

  return (
    <>
      <article className="panel">
        <div className="panel-heading">
          <div>
            <span className="section-kicker"><WalletCards size={15} />{locale === "ar" ? "حساباتك" : "Your accounts"}</span>
            <h2>{locale === "ar" ? "البنوك والنقد" : "Banks and cash"}</h2>
          </div>
          <button type="button" className="primary-button" onClick={() => setAccountOpen(true)}><Plus size={15} />{locale === "ar" ? "إضافة حساب" : "Add account"}</button>
        </div>
        <p className="modal-note">{locale === "ar" ? "كل حساب منفصل. الرصيد الافتتاحي هو ما لديك الآن، والراتب والخصم لا يُرحَّلان إلا بعد زر «خصم» أو «تجاهل»." : "Each account is separate. Opening is what you hold now. Salary and bills post only after Deduct or Skip."}</p>
        <div className="personal-account-grid">
          {spaceAccounts.map((account) => (
            <div className="personal-account-card" key={account.id}>
              <i><Banknote size={16} /></i>
              <div>
                <small>{account.kind === "cash" ? (locale === "ar" ? "نقد" : "Cash") : account.kind === "wallet" ? (locale === "ar" ? "محفظة" : "Wallet") : (locale === "ar" ? "بنك" : "Bank")}</small>
                <strong>{account.name}</strong>
              </div>
              <b>{money(Number(account.balance_minor ?? account.opening_minor), locale)}</b>
            </div>
          ))}
          {!spaceAccounts.length && <p className="empty-state">{locale === "ar" ? "أضف حساب بنك نزوى أو مسقط أو النقد أولاً." : "Add Bank Nizwa, Muscat, or cash first."}</p>}
        </div>
      </article>

      {pending.length > 0 && (
        <article className="panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">{locale === "ar" ? "بانتظار التأكيد" : "Awaiting confirmation"}</span>
              <h2>{locale === "ar" ? "دخل وخصومات هذا الشهر" : "This month’s income and bills"}</h2>
            </div>
          </div>
          <div className="personal-occ-list">
            {pending.map((item) => (
              <OccurrenceRow key={item.id} item={item} locale={locale} accounts={spaceAccounts} onChanged={onChanged} />
            ))}
          </div>
        </article>
      )}

      {loans.length > 0 && (
        <article className="panel">
          <div className="panel-heading"><h2>{locale === "ar" ? "تقدم الأقساط" : "Installment progress"}</h2></div>
          <div className="personal-loan-list">
            {loans.map((rule) => {
              const paid = Number(rule.paid_minor);
              const total = Number(rule.total_minor);
              const left = Math.max(0, total - paid);
              const pct = total ? Math.min(100, Math.round((paid / total) * 100)) : 0;
              return (
                <div className="personal-loan-row" key={rule.id}>
                  <div>
                    <strong>{rule.name}</strong>
                    <span>{locale === "ar" ? `مدفوع ${money(paid, locale)} · متبقي ${money(left, locale)}` : `Paid ${money(paid, locale)} · remaining ${money(left, locale)}`}</span>
                  </div>
                  <div className="progress-track"><span style={{ width: `${pct}%` }} /></div>
                  <b>{pct}%</b>
                </div>
              );
            })}
          </div>
        </article>
      )}

      <article className="panel">
        <div className="panel-heading">
          <div>
            <span className="section-kicker">{locale === "ar" ? "القواعد الشهرية" : "Monthly rules"}</span>
            <h2>{locale === "ar" ? "دخل ثابت وخصومات" : "Standing income and deductions"}</h2>
          </div>
          <div className="section-title-actions">
            <button type="button" className="secondary-button" onClick={() => setRuleOpen("income")}><Plus size={15} />{locale === "ar" ? "دخل ثابت" : "Standing income"}</button>
            <button type="button" className="primary-button" onClick={() => setRuleOpen("expense")}><Plus size={15} />{locale === "ar" ? "خصم / قسط" : "Bill / installment"}</button>
          </div>
        </div>
        <div className="personal-rule-list">
          {spaceRules.map((rule) => (
            <div className="personal-rule-row" key={rule.id}>
              <strong>{rule.name}</strong>
              <span>{rule.kind === "income" ? (locale === "ar" ? "دخل" : "Income") : (locale === "ar" ? "خصم" : "Expense")} · {rule.amount_mode === "variable" ? (locale === "ar" ? "فاتورة متغيرة" : "Variable bill") : (locale === "ar" ? "ثابت" : "Fixed")} · {locale === "ar" ? `يوم ${rule.due_day}` : `Day ${rule.due_day}`}</span>
              <b>{rule.amount_minor ? money(rule.amount_minor, locale) : (locale === "ar" ? "يُدخل كل شهر" : "Enter each month")}</b>
            </div>
          ))}
          {!spaceRules.length && <p className="empty-state">{locale === "ar" ? "أضف الراتب ثم أقساط السيارة والبيت والمدرسة والفواتير." : "Add salary, then car, house, school, and utility bills."}</p>}
        </div>
      </article>

      {accountOpen && <AccountModal locale={locale} spaceId={spaceId} onClose={() => setAccountOpen(false)} onChanged={(next) => { onChanged(next); setAccountOpen(false); }} />}
      {ruleOpen && <RuleModal locale={locale} spaceId={spaceId} kind={ruleOpen} accounts={spaceAccounts} onClose={() => setRuleOpen(null)} onChanged={(next) => { onChanged(next); setRuleOpen(null); }} />}
    </>
  );
}

function OccurrenceRow({ item, locale, accounts, onChanged }: { item: PersonalOccurrence; locale: Locale; accounts: PersonalAccount[]; onChanged: (next: Record<string, unknown>) => void }) {
  const [amount, setAmount] = useState(item.expected_minor ? String(item.expected_minor / 1000) : "");
  const [accountId, setAccountId] = useState(item.account_id ?? accounts[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const variable = item.amount_mode === "variable";
  const post = async (skip = false) => {
    setBusy(true);
    try {
      const response = await apiFetch("/api/dashboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(skip
          ? { action: "skipPersonalOccurrence", idempotencyKey: crypto.randomUUID(), occurrenceId: item.id }
          : { action: "confirmPersonalOccurrence", idempotencyKey: crypto.randomUUID(), occurrenceId: item.id, amount, accountId }),
      });
      const result = await response.json() as Record<string, unknown> & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "FAILED");
      onChanged(result);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "FAILED");
    } finally { setBusy(false); }
  };
  return (
    <div className="personal-occ-row">
      <div>
        <strong>{item.rule_name}</strong>
        <span>{item.period_key} · {item.rule_kind === "income" ? (locale === "ar" ? "دخل" : "Income") : (locale === "ar" ? "خصم" : "Bill")}{variable ? (locale === "ar" ? " · متغيرة — أدخل المبلغ" : " · variable — enter amount") : ""}</span>
      </div>
      <div className="money-input"><input type="number" min="0.001" step="0.001" required={variable} value={amount} onChange={(event) => setAmount(event.target.value)} /><b className="money-currency"><OmrSymbol size={12} /></b></div>
      <select value={accountId} onChange={(event) => setAccountId(event.target.value)}>
        {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
      </select>
      <button type="button" className="primary-button" disabled={busy} onClick={() => void post(false)}><Check size={14} />{locale === "ar" ? "خصم" : "Post"}</button>
      <button type="button" className="secondary-button" disabled={busy} onClick={() => void post(true)}><X size={14} />{locale === "ar" ? "تجاهل" : "Skip"}</button>
    </div>
  );
}

function AccountModal({ locale, spaceId, onClose, onChanged }: { locale: Locale; spaceId: string; onClose: () => void; onChanged: (next: Record<string, unknown>) => void }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState("bank");
  const [opening, setOpening] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    const response = await apiFetch("/api/dashboard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "addPersonalAccount", idempotencyKey: crypto.randomUUID(), spaceId, name, kind, opening: opening || "0" }) });
    const result = await response.json() as Record<string, unknown> & { error?: string };
    setSaving(false);
    if (!response.ok) { window.alert(result.error ?? "FAILED"); return; }
    onChanged(result);
  };
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal-card" role="dialog">
        <div className="modal-header"><h2>{locale === "ar" ? "حساب شخصي" : "Personal account"}</h2><button type="button" onClick={onClose}><X size={20} /></button></div>
        <form className="modal-form" onSubmit={(event) => void submit(event)}>
          <label><span>{locale === "ar" ? "اسم الحساب" : "Account name"}</span><input required value={name} onChange={(event) => setName(event.target.value)} placeholder={locale === "ar" ? "بنك نزوى" : "Bank Nizwa"} /></label>
          <label><span>{locale === "ar" ? "النوع" : "Type"}</span>
            <select value={kind} onChange={(event) => setKind(event.target.value)}>
              <option value="bank">{locale === "ar" ? "بنك" : "Bank"}</option>
              <option value="cash">{locale === "ar" ? "نقد" : "Cash"}</option>
              <option value="wallet">{locale === "ar" ? "محفظة رقمية" : "E-wallet"}</option>
            </select>
          </label>
          <label><span>{locale === "ar" ? "الرصيد الحالي" : "Current balance"}</span><div className="money-input"><input type="number" min="0" step="0.001" value={opening} onChange={(event) => setOpening(event.target.value)} /><b className="money-currency"><OmrSymbol size={14} /></b></div></label>
          <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>{locale === "ar" ? "إلغاء" : "Cancel"}</button><button className="primary-button" disabled={saving}>{saving ? "…" : (locale === "ar" ? "حفظ" : "Save")}</button></div>
        </form>
      </section>
    </div>
  );
}

function RuleModal({ locale, spaceId, kind, accounts, onClose, onChanged }: { locale: Locale; spaceId: string; kind: "income" | "expense"; accounts: PersonalAccount[]; onClose: () => void; onChanged: (next: Record<string, unknown>) => void }) {
  const [name, setName] = useState("");
  const [amountMode, setAmountMode] = useState<"fixed" | "variable">(kind === "income" ? "fixed" : "fixed");
  const [amount, setAmount] = useState("");
  const [total, setTotal] = useState("");
  const [duration, setDuration] = useState("");
  const [dueDay, setDueDay] = useState("1");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [startsAt, setStartsAt] = useState(new Date().toISOString().slice(0, 10));
  const [endsAt, setEndsAt] = useState("");
  const [saving, setSaving] = useState(false);
  const preview = useMemo(() => {
    const monthly = Number(amount || 0);
    const tot = Number(total || 0);
    const months = Number(duration || 0);
    if (tot > 0 && months > 0 && monthly <= 0) return tot / months;
    return monthly;
  }, [amount, total, duration]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    const response = await apiFetch("/api/dashboard", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "addPersonalRule",
        idempotencyKey: crypto.randomUUID(),
        spaceId,
        accountId: accountId || undefined,
        kind,
        name,
        amountMode,
        amount: amount || undefined,
        total: total || undefined,
        durationMonths: duration ? Number(duration) : 0,
        dueDay: Number(dueDay) || 1,
        startsAt,
        endsAt: endsAt || undefined,
      }),
    });
    const result = await response.json() as Record<string, unknown> & { error?: string };
    setSaving(false);
    if (!response.ok) { window.alert(result.error === "VARIABLE_AMOUNT_REQUIRED" || result.error === "INVALID_AMOUNT" ? (locale === "ar" ? "أدخل مبلغاً صحيحاً، أو الإجمالي وعدد الأشهر." : "Enter a valid amount, or total and months.") : (result.error ?? "FAILED")); return; }
    onChanged(result);
  };
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal-card" role="dialog">
        <div className="modal-header"><h2>{kind === "income" ? (locale === "ar" ? "دخل ثابت" : "Standing income") : (locale === "ar" ? "خصم أو قسط" : "Bill or installment")}</h2><button type="button" onClick={onClose}><X size={20} /></button></div>
        <form className="modal-form" onSubmit={(event) => void submit(event)}>
          <label><span>{locale === "ar" ? "الاسم" : "Name"}</span><input required value={name} onChange={(event) => setName(event.target.value)} placeholder={kind === "income" ? (locale === "ar" ? "راتب" : "Salary") : (locale === "ar" ? "قسط سيارة / كهرباء" : "Car / electricity")} /></label>
          <label><span>{locale === "ar" ? "نوع المبلغ" : "Amount type"}</span>
            <select value={amountMode} onChange={(event) => setAmountMode(event.target.value as "fixed" | "variable")}>
              <option value="fixed">{locale === "ar" ? "ثابت كل شهر" : "Fixed monthly"}</option>
              <option value="variable">{locale === "ar" ? "متغير — يُطلب المبلغ كل شهر" : "Variable — enter each month"}</option>
            </select>
          </label>
          {amountMode === "fixed" && <label><span>{locale === "ar" ? "المبلغ الشهري" : "Monthly amount"}</span><div className="money-input"><input type="number" min="0" step="0.001" value={amount} onChange={(event) => setAmount(event.target.value)} /><b className="money-currency"><OmrSymbol size={14} /></b></div></label>}
          {kind === "expense" && (
            <div className="form-row">
              <label><span>{locale === "ar" ? "الإجمالي (اختياري)" : "Total (optional)"}</span><div className="money-input"><input type="number" min="0" step="0.001" value={total} onChange={(event) => setTotal(event.target.value)} /><b className="money-currency"><OmrSymbol size={14} /></b></div></label>
              <label><span>{locale === "ar" ? "عدد الأشهر" : "Months"}</span><input type="number" min="0" max="360" value={duration} onChange={(event) => setDuration(event.target.value)} /></label>
            </div>
          )}
          {preview > 0 && <p className="modal-note">{locale === "ar" ? `القسط الشهري ≈ ${preview.toFixed(3)} ر.ع.` : `Monthly installment ≈ ${preview.toFixed(3)} OMR`}</p>}
          <div className="form-row">
            <label><span>{locale === "ar" ? "يوم الاستحقاق" : "Due day"}</span><input type="number" min="1" max="28" value={dueDay} onChange={(event) => setDueDay(event.target.value)} /></label>
            <label><span>{locale === "ar" ? "من حساب" : "From / to account"}</span>
              <select value={accountId} onChange={(event) => setAccountId(event.target.value)}>
                <option value="">{locale === "ar" ? "بدون ربط" : "Unlinked"}</option>
                {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
              </select>
            </label>
          </div>
          <div className="form-row">
            <label><span>{locale === "ar" ? "يبدأ من" : "Starts"}</span><input type="date" required value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /></label>
            <label><span>{locale === "ar" ? "ينتهي في (اختياري)" : "Ends (optional)"}</span><input type="date" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} /></label>
          </div>
          <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>{locale === "ar" ? "إلغاء" : "Cancel"}</button><button className="primary-button" disabled={saving}>{saving ? "…" : (locale === "ar" ? "حفظ" : "Save")}</button></div>
        </form>
      </section>
    </div>
  );
}
