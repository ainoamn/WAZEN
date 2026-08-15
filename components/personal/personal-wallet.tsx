"use client";

import { FormEvent, useMemo, useState } from "react";
import { Banknote, Check, ChevronDown, Plus, WalletCards, X } from "lucide-react";
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
  schedule?: string;
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
  const [incomeMenu, setIncomeMenu] = useState(false);
  const [expenseMenu, setExpenseMenu] = useState(false);
  const [ruleOpen, setRuleOpen] = useState<{ kind: "income" | "expense"; schedule: "monthly" | "once" | "unscheduled"; amountMode: "fixed" | "variable" } | null>(null);
  const spaceAccounts = accounts.filter((item) => item.space_id === spaceId);
  const spaceRules = rules.filter((item) => item.space_id === spaceId);
  const spaceOcc = occurrences.filter((item) => item.space_id === spaceId);
  const pending = spaceOcc.filter((item) => item.status === "pending");
  const loans = spaceRules.filter((item) => Number(item.total_minor) > 0);
  const unscheduled = spaceRules.filter((item) => (item.schedule ?? "monthly") === "unscheduled");
  const byMonth = [...spaceOcc].sort((a, b) => a.period_key.localeCompare(b.period_key)).reduce((map, item) => {
    const list = map.get(item.period_key) ?? [];
    list.push(item);
    map.set(item.period_key, list);
    return map;
  }, new Map<string, PersonalOccurrence[]>());

  return (
    <>
      <article className="panel">
        <div className="panel-heading">
          <div>
            <span className="section-kicker"><WalletCards size={15} />{locale === "ar" ? "Ø­Ø³Ø§Ø¨Ø§ØªÙƒ" : "Your accounts"}</span>
            <h2>{locale === "ar" ? "Ø§Ù„Ø¨Ù†ÙˆÙƒ ÙˆØ§Ù„Ù†Ù‚Ø¯" : "Banks and cash"}</h2>
          </div>
          <button type="button" className="primary-button" onClick={() => setAccountOpen(true)}><Plus size={15} />{locale === "ar" ? "Ø¥Ø¶Ø§ÙØ© Ø­Ø³Ø§Ø¨" : "Add account"}</button>
        </div>
        <p className="modal-note">{locale === "ar" ? "ÙƒÙ„ Ø­Ø³Ø§Ø¨ Ù…Ù†ÙØµÙ„. Ø§Ù„Ø±ØµÙŠØ¯ Ø§Ù„Ø§ÙØªØªØ§Ø­ÙŠ Ù‡Ùˆ Ù…Ø§ Ù„Ø¯ÙŠÙƒ Ø§Ù„Ø¢Ù†ØŒ ÙˆØ§Ù„Ø±Ø§ØªØ¨ ÙˆØ§Ù„Ø®ØµÙ… Ù„Ø§ ÙŠÙØ±Ø­Ù‘ÙŽÙ„Ø§Ù† Ø¥Ù„Ø§ Ø¨Ø¹Ø¯ Ø²Ø± Â«Ø®ØµÙ…Â» Ø£Ùˆ Â«ØªØ¬Ø§Ù‡Ù„Â»." : "Each account is separate. Opening is what you hold now. Salary and bills post only after Deduct or Skip."}</p>
        <div className="personal-account-grid">
          {spaceAccounts.map((account) => (
            <div className="personal-account-card" key={account.id}>
              <i><Banknote size={16} /></i>
              <div>
                <small>{account.kind === "cash" ? (locale === "ar" ? "Ù†Ù‚Ø¯" : "Cash") : account.kind === "wallet" ? (locale === "ar" ? "Ù…Ø­ÙØ¸Ø©" : "Wallet") : (locale === "ar" ? "Ø¨Ù†Ùƒ" : "Bank")}</small>
                <strong>{account.name}</strong>
              </div>
              <b>{money(Number(account.balance_minor ?? account.opening_minor), locale)}</b>
            </div>
          ))}
          {!spaceAccounts.length && <p className="empty-state">{locale === "ar" ? "Ø£Ø¶Ù Ø­Ø³Ø§Ø¨ Ø¨Ù†Ùƒ Ù†Ø²ÙˆÙ‰ Ø£Ùˆ Ù…Ø³Ù‚Ø· Ø£Ùˆ Ø§Ù„Ù†Ù‚Ø¯ Ø£ÙˆÙ„Ø§Ù‹." : "Add Bank Nizwa, Muscat, or cash first."}</p>}
        </div>
      </article>

      {byMonth.size > 0 && (
        <article className="panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">{locale === "ar" ? "Ø­Ø³Ø§Ø¨ Ø§Ù„Ø£Ø´Ù‡Ø±" : "Month ledgers"}</span>
              <h2>{locale === "ar" ? "ÙƒÙ„ Ø´Ù‡Ø± ÙŠØ¸Ù‡Ø± Ø¯Ø®Ù„Ù‡ ÙˆÙ…ØµØ±ÙˆÙÙ‡ Ø§Ù„Ù…Ø¬Ø¯ÙˆÙ„ Ù‚Ø¨Ù„ Ø§Ù„ØªØ±Ø­ÙŠÙ„" : "Each month shows scheduled income and spend before posting"}</h2>
            </div>
          </div>
          {[...byMonth.entries()].map(([period, rows]) => {
            const plannedIn = rows.filter((row) => row.rule_kind === "income" && row.status !== "skipped").reduce((sum, row) => sum + Number(row.actual_minor ?? row.expected_minor), 0);
            const plannedOut = rows.filter((row) => row.rule_kind !== "income" && row.status !== "skipped").reduce((sum, row) => sum + Number(row.actual_minor ?? row.expected_minor), 0);
            return (
              <div className="personal-month-block" key={period}>
                <div className="personal-month-head">
                  <strong>{period}</strong>
                  <span>{locale === "ar" ? `Ø¯Ø®Ù„ ${money(plannedIn, locale)} Â· ØµØ±Ù ${money(plannedOut, locale)} Â· Ù…ØªØ¨Ù‚ÙŠ ${money(plannedIn - plannedOut, locale)}` : `In ${money(plannedIn, locale)} Â· out ${money(plannedOut, locale)} Â· left ${money(plannedIn - plannedOut, locale)}`}</span>
                </div>
                <div className="personal-occ-list">
                  {rows.filter((row) => row.status === "pending").map((item) => (
                    <OccurrenceRow key={item.id} item={item} locale={locale} accounts={spaceAccounts} onChanged={onChanged} />
                  ))}
                  {rows.filter((row) => row.status !== "pending").map((item) => (
                    <div className="personal-rule-row" key={item.id}>
                      <strong>{item.rule_name}</strong>
                      <span>{item.status === "posted" ? (locale === "ar" ? "Ù…Ø±Ø­Ù‘Ù„" : "Posted") : (locale === "ar" ? "Ù…ØªØ¬Ø§Ù‡Ù„" : "Skipped")}</span>
                      <b>{money(Number(item.actual_minor ?? item.expected_minor), locale)}</b>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </article>
      )}

      {unscheduled.length > 0 && (
        <article className="panel">
          <div className="panel-heading"><h2>{locale === "ar" ? "Ø¯Ø®Ù„ Ø¢Ø®Ø± Ø¨Ø¯ÙˆÙ† Ù…ÙˆØ¹Ø¯" : "Other income â€” no due date"}</h2></div>
          {unscheduled.map((rule) => (
            <UnscheduledRow key={rule.id} rule={rule} locale={locale} onChanged={onChanged} />
          ))}
        </article>
      )}

      {loans.length > 0 && (
        <article className="panel">
          <div className="panel-heading"><h2>{locale === "ar" ? "ØªÙ‚Ø¯Ù… Ø§Ù„Ø£Ù‚Ø³Ø§Ø·" : "Installment progress"}</h2></div>
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
                    <span>{locale === "ar" ? `Ù…Ø¯ÙÙˆØ¹ ${money(paid, locale)} Â· Ù…ØªØ¨Ù‚ÙŠ ${money(left, locale)}` : `Paid ${money(paid, locale)} Â· remaining ${money(left, locale)}`}</span>
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
            <span className="section-kicker">{locale === "ar" ? "Ø§Ù„Ù‚ÙˆØ§Ø¹Ø¯ Ø§Ù„Ø´Ù‡Ø±ÙŠØ©" : "Monthly rules"}</span>
            <h2>{locale === "ar" ? "Ø¯Ø®Ù„ Ø«Ø§Ø¨Øª ÙˆÙ…ØªØºÙŠØ± ÙˆØ¢Ø®Ø±ØŒ ÙˆØ®ØµÙˆÙ… Ù…Ø¬Ø¯ÙˆÙ„Ø©" : "Fixed, variable and other income, plus scheduled bills"}</h2>
          </div>
          <div className="section-title-actions">
            <div className="action-menu">
              <button type="button" className="primary-button" onClick={() => { setExpenseMenu(false); setIncomeMenu((open) => !open); }} aria-expanded={incomeMenu}>
                <Plus size={15} />{locale === "ar" ? "Ø¯Ø®Ù„" : "Income"}<ChevronDown size={15} />
              </button>
              {incomeMenu && (
                <div className="action-menu-panel" role="menu">
                  <button type="button" role="menuitem" onClick={() => { setIncomeMenu(false); setRuleOpen({ kind: "income", schedule: "monthly", amountMode: "fixed" }); }}>{locale === "ar" ? "Ø¯Ø®Ù„ Ø«Ø§Ø¨Øª" : "Fixed income"}</button>
                  <button type="button" role="menuitem" onClick={() => { setIncomeMenu(false); setRuleOpen({ kind: "income", schedule: "monthly", amountMode: "variable" }); }}>{locale === "ar" ? "Ø¯Ø®Ù„ Ù…ØªØºÙŠØ±" : "Variable income"}</button>
                  <button type="button" role="menuitem" onClick={() => { setIncomeMenu(false); setRuleOpen({ kind: "income", schedule: "unscheduled", amountMode: "fixed" }); }}>{locale === "ar" ? "Ø¯Ø®Ù„ Ø¢Ø®Ø±" : "Other income"}</button>
                </div>
              )}
            </div>
            <div className="action-menu">
              <button type="button" className="primary-button" onClick={() => { setIncomeMenu(false); setExpenseMenu((open) => !open); }} aria-expanded={expenseMenu}>
                <Plus size={15} />{locale === "ar" ? "Ø®ØµÙ…" : "Expense"}<ChevronDown size={15} />
              </button>
              {expenseMenu && (
                <div className="action-menu-panel" role="menu">
                  <button type="button" role="menuitem" onClick={() => { setExpenseMenu(false); setRuleOpen({ kind: "expense", schedule: "monthly", amountMode: "fixed" }); }}>{locale === "ar" ? "Ø®ØµÙ… Ø«Ø§Ø¨Øª ÙƒÙ„ Ø´Ù‡Ø±" : "Fixed monthly"}</button>
                  <button type="button" role="menuitem" onClick={() => { setExpenseMenu(false); setRuleOpen({ kind: "expense", schedule: "monthly", amountMode: "variable" }); }}>{locale === "ar" ? "Ø®ØµÙ… Ù…ØªØºÙŠØ± ÙƒÙ„ Ø´Ù‡Ø±" : "Variable monthly"}</button>
                  <button type="button" role="menuitem" onClick={() => { setExpenseMenu(false); setRuleOpen({ kind: "expense", schedule: "once", amountMode: "fixed" }); }}>{locale === "ar" ? "Ø®ØµÙ… Ù…Ø±Ø© ÙˆØ§Ø­Ø¯Ø©" : "One-time expense"}</button>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="personal-rule-list">
          {spaceRules.map((rule) => (
            <div className="personal-rule-row" key={rule.id}>
              <strong>{rule.name}</strong>
              <span>{rule.kind === "income" ? (locale === "ar" ? "Ø¯Ø®Ù„" : "Income") : (locale === "ar" ? "Ù…ØµØ±ÙˆÙ" : "Expense")} Â· {(rule.schedule ?? "monthly") === "once" ? (locale === "ar" ? `Ù…Ø¬Ø¯ÙˆÙ„ ${rule.starts_at.slice(0, 7)}` : `scheduled ${rule.starts_at.slice(0, 7)}`) : (rule.schedule ?? "monthly") === "unscheduled" ? (locale === "ar" ? "Ø¨Ø¯ÙˆÙ† Ù…ÙˆØ¹Ø¯" : "no date") : (rule.amount_mode === "variable" ? (locale === "ar" ? "Ù…ØªØºÙŠØ± Ø´Ù‡Ø±ÙŠØ§Ù‹" : "variable monthly") : (locale === "ar" ? "Ø«Ø§Ø¨Øª Ø´Ù‡Ø±ÙŠØ§Ù‹" : "fixed monthly"))}</span>
              <b>{rule.amount_minor ? money(rule.amount_minor, locale) : (locale === "ar" ? "ÙŠÙØ¯Ø®Ù„ Ø¹Ù†Ø¯ Ø§Ù„ØªØ±Ø­ÙŠÙ„" : "enter when posting")}</b>
            </div>
          ))}
          {!spaceRules.length && <p className="empty-state">{locale === "ar" ? "Ø£Ø¶Ù Ø±Ø§ØªØ¨Ø§Ù‹ Ø«Ø§Ø¨ØªØ§Ù‹ Ø£Ùˆ Ù…ØªØºÙŠØ±Ø§Ù‹ Ø£Ùˆ Ø¯Ø®Ù„Ø§Ù‹ Ø¨Ù„Ø§ Ù…ÙˆØ¹Ø¯ØŒ ÙˆØ¬Ø¯ÙˆÙÙ„ Ù…ØµØ±ÙˆÙØ§Ù‹ Ù„Ø´Ù‡Ø± Ù…Ø¹ÙŠÙ‘Ù† Ù…Ø«Ù„ Ø£ÙƒØªÙˆØ¨Ø±." : "Add fixed, variable, or undated income, and schedule an expense for a month such as October."}</p>}
        </div>
      </article>

      {accountOpen && <AccountModal locale={locale} spaceId={spaceId} onClose={() => setAccountOpen(false)} onChanged={(next) => { onChanged(next); setAccountOpen(false); }} />}
      {ruleOpen && <RuleModal locale={locale} spaceId={spaceId} kind={ruleOpen.kind} schedule={ruleOpen.schedule} amountMode={ruleOpen.amountMode} accounts={spaceAccounts} onClose={() => setRuleOpen(null)} onChanged={(next) => { onChanged(next); setRuleOpen(null); }} />}
    </>
  );
}

function UnscheduledRow({ rule, locale, onChanged }: { rule: PersonalRule; locale: Locale; onChanged: (next: Record<string, unknown>) => void }) {
  const [periodKey, setPeriodKey] = useState(new Date().toISOString().slice(0, 7));
  const [amount, setAmount] = useState(rule.amount_minor ? String(rule.amount_minor / 1000) : "");
  const [busy, setBusy] = useState(false);
  const queue = async () => {
    setBusy(true);
    const response = await apiFetch("/api/dashboard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "queuePersonalOccurrence", idempotencyKey: crypto.randomUUID(), ruleId: rule.id, periodKey, amount }) });
    const result = await response.json() as Record<string, unknown> & { error?: string };
    setBusy(false);
    if (!response.ok) { window.alert(result.error ?? "FAILED"); return; }
    onChanged(result);
  };
  return (
    <div className="personal-occ-row">
      <div>
        <strong>{rule.name}</strong>
        <span>{locale === "ar" ? "Ø§Ø®ØªØ± Ø§Ù„Ø´Ù‡Ø± Ø§Ù„Ø°ÙŠ ÙŠØ³Ø¬Ù‘ÙŽÙ„ ÙÙŠÙ‡ Ù‡Ø°Ø§ Ø§Ù„Ø¯Ø®Ù„" : "Pick the month this income belongs to"}</span>
      </div>
      <input type="month" value={periodKey} onChange={(event) => setPeriodKey(event.target.value)} />
      <div className="money-input"><input type="number" min="0.001" step="0.001" value={amount} onChange={(event) => setAmount(event.target.value)} /><b className="money-currency"><OmrSymbol size={12} /></b></div>
      <button type="button" className="primary-button" disabled={busy} onClick={() => void queue()}>{locale === "ar" ? "Ø£Ø¶Ù Ù„Ù„Ø´Ù‡Ø±" : "Add to month"}</button>
    </div>
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
        <span>{item.period_key} Â· {item.rule_kind === "income" ? (locale === "ar" ? "Ø¯Ø®Ù„" : "Income") : (locale === "ar" ? "Ø®ØµÙ…" : "Bill")}{variable ? (locale === "ar" ? " Â· Ù…ØªØºÙŠØ±Ø© â€” Ø£Ø¯Ø®Ù„ Ø§Ù„Ù…Ø¨Ù„Øº" : " Â· variable â€” enter amount") : ""}</span>
      </div>
      <div className="money-input"><input type="number" min="0.001" step="0.001" required={variable} value={amount} onChange={(event) => setAmount(event.target.value)} /><b className="money-currency"><OmrSymbol size={12} /></b></div>
      <select value={accountId} onChange={(event) => setAccountId(event.target.value)}>
        {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
      </select>
      <button type="button" className="primary-button" disabled={busy} onClick={() => void post(false)}><Check size={14} />{locale === "ar" ? "Ø®ØµÙ…" : "Post"}</button>
      <button type="button" className="secondary-button" disabled={busy} onClick={() => void post(true)}><X size={14} />{locale === "ar" ? "ØªØ¬Ø§Ù‡Ù„" : "Skip"}</button>
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
        <div className="modal-header"><h2>{locale === "ar" ? "Ø­Ø³Ø§Ø¨ Ø´Ø®ØµÙŠ" : "Personal account"}</h2><button type="button" onClick={onClose}><X size={20} /></button></div>
        <form className="modal-form" onSubmit={(event) => void submit(event)}>
          <label><span>{locale === "ar" ? "Ø§Ø³Ù… Ø§Ù„Ø­Ø³Ø§Ø¨" : "Account name"}</span><input required value={name} onChange={(event) => setName(event.target.value)} placeholder={locale === "ar" ? "Ø¨Ù†Ùƒ Ù†Ø²ÙˆÙ‰" : "Bank Nizwa"} /></label>
          <label><span>{locale === "ar" ? "Ø§Ù„Ù†ÙˆØ¹" : "Type"}</span>
            <select value={kind} onChange={(event) => setKind(event.target.value)}>
              <option value="bank">{locale === "ar" ? "Ø¨Ù†Ùƒ" : "Bank"}</option>
              <option value="cash">{locale === "ar" ? "Ù†Ù‚Ø¯" : "Cash"}</option>
              <option value="wallet">{locale === "ar" ? "Ù…Ø­ÙØ¸Ø© Ø±Ù‚Ù…ÙŠØ©" : "E-wallet"}</option>
            </select>
          </label>
          <label><span>{locale === "ar" ? "Ø§Ù„Ø±ØµÙŠØ¯ Ø§Ù„Ø­Ø§Ù„ÙŠ" : "Current balance"}</span><div className="money-input"><input type="number" min="0" step="0.001" value={opening} onChange={(event) => setOpening(event.target.value)} /><b className="money-currency"><OmrSymbol size={14} /></b></div></label>
          <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>{locale === "ar" ? "Ø¥Ù„ØºØ§Ø¡" : "Cancel"}</button><button className="primary-button" disabled={saving}>{saving ? "â€¦" : (locale === "ar" ? "Ø­ÙØ¸" : "Save")}</button></div>
        </form>
      </section>
    </div>
  );
}

function RuleModal({ locale, spaceId, kind, schedule, amountMode: initialMode, accounts, onClose, onChanged }: { locale: Locale; spaceId: string; kind: "income" | "expense"; schedule: "monthly" | "once" | "unscheduled"; amountMode: "fixed" | "variable"; accounts: PersonalAccount[]; onClose: () => void; onChanged: (next: Record<string, unknown>) => void }) {
  const [name, setName] = useState("");
  const [expenseType, setExpenseType] = useState<"fixed" | "variable" | "once">(schedule === "once" ? "once" : initialMode === "variable" ? "variable" : "fixed");
  const amountMode = initialMode;
  const [amount, setAmount] = useState("");
  const [total, setTotal] = useState("");
  const [duration, setDuration] = useState("");
  const [dueDay, setDueDay] = useState("1");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [startsAt, setStartsAt] = useState(new Date().toISOString().slice(0, 10));
  const [endsAt, setEndsAt] = useState("");
  const [saving, setSaving] = useState(false);
  const resolvedSchedule = kind === "expense" ? (expenseType === "once" ? "once" : "monthly") : schedule;
  const resolvedAmountMode = kind === "expense" ? (expenseType === "variable" ? "variable" : "fixed") : amountMode;
  const title = kind === "income"
    ? (schedule === "unscheduled" ? (locale === "ar" ? "Ø¯Ø®Ù„ Ø¢Ø®Ø± Ø¨Ø¯ÙˆÙ† Ù…ÙˆØ¹Ø¯" : "Other income â€” no date") : amountMode === "variable" ? (locale === "ar" ? "Ø¯Ø®Ù„ Ù…ØªØºÙŠØ±" : "Variable income") : (locale === "ar" ? "Ø¯Ø®Ù„ Ø«Ø§Ø¨Øª" : "Fixed income"))
    : (expenseType === "once" ? (locale === "ar" ? "Ø®ØµÙ… Ù…Ø±Ø© ÙˆØ§Ø­Ø¯Ø©" : "One-time expense") : expenseType === "variable" ? (locale === "ar" ? "Ø®ØµÙ… Ù…ØªØºÙŠØ±" : "Variable bill") : (locale === "ar" ? "Ø®ØµÙ… Ø´Ù‡Ø±ÙŠ Ø«Ø§Ø¨Øª" : "Fixed monthly bill"));
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
        amountMode: resolvedAmountMode,
        schedule: resolvedSchedule,
        amount: amount || undefined,
        total: total || undefined,
        durationMonths: duration ? Number(duration) : 0,
        dueDay: Number(dueDay) || 1,
        startsAt,
        endsAt: resolvedSchedule === "once" ? startsAt : (endsAt || undefined),
      }),
    });
    const result = await response.json() as Record<string, unknown> & { error?: string };
    setSaving(false);
    if (!response.ok) { window.alert(result.error === "VARIABLE_AMOUNT_REQUIRED" || result.error === "INVALID_AMOUNT" ? (locale === "ar" ? "Ø£Ø¯Ø®Ù„ Ù…Ø¨Ù„ØºØ§Ù‹ ØµØ­ÙŠØ­Ø§Ù‹." : "Enter a valid amount.") : (result.error ?? "FAILED")); return; }
    onChanged(result);
  };
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal-card" role="dialog">
        <div className="modal-header"><h2>{title}</h2><button type="button" onClick={onClose}><X size={20} /></button></div>
        <form className="modal-form" onSubmit={(event) => void submit(event)}>
          <label><span>{locale === "ar" ? "Ø§Ù„Ø§Ø³Ù…" : "Name"}</span><input required value={name} onChange={(event) => setName(event.target.value)} placeholder={kind === "income" ? (locale === "ar" ? "Ø±Ø§ØªØ¨ / Ù…ÙƒØ§ÙØ£Ø© / Ù‡Ø¯ÙŠØ©" : "Salary / bonus / gift") : (locale === "ar" ? "Ø³Ø¯Ø§Ø¯ Ù„Ø´Ø®Øµ / ÙƒÙ‡Ø±Ø¨Ø§Ø¡" : "Pay someone / electricity")} /></label>
          {kind === "expense" && (
            <label><span>{locale === "ar" ? "Ù†ÙˆØ¹ Ø§Ù„Ø®ØµÙ…" : "Expense type"}</span>
              <select value={expenseType} onChange={(event) => setExpenseType(event.target.value as "fixed" | "variable" | "once")}>
                <option value="fixed">{locale === "ar" ? "Ø«Ø§Ø¨Øª ÙƒÙ„ Ø´Ù‡Ø±" : "Fixed monthly"}</option>
                <option value="variable">{locale === "ar" ? "Ù…ØªØºÙŠØ± â€” ÙŠÙØ·Ù„Ø¨ Ø§Ù„Ù…Ø¨Ù„Øº ÙƒÙ„ Ø´Ù‡Ø±" : "Variable â€” enter each month"}</option>
                <option value="once">{locale === "ar" ? "Ù…Ø±Ø© ÙˆØ§Ø­Ø¯Ø© â€” ÙŠÙØ¯Ø®Ù„ Ø§Ù„Ù…Ø¨Ù„Øº Ù„Ù‡Ø°Ø§ Ø§Ù„Ø´Ù‡Ø± ÙÙ‚Ø·" : "One-time â€” enter amount for that month only"}</option>
              </select>
            </label>
          )}
          {(resolvedAmountMode === "fixed" || resolvedSchedule === "once" || schedule === "unscheduled") && <label><span>{locale === "ar" ? "Ø§Ù„Ù…Ø¨Ù„Øº" : "Amount"}</span><div className="money-input"><input required type="number" min="0.001" step="0.001" value={amount} onChange={(event) => setAmount(event.target.value)} /><b className="money-currency"><OmrSymbol size={14} /></b></div></label>}
          {kind === "expense" && resolvedSchedule === "monthly" && (
            <div className="form-row">
              <label><span>{locale === "ar" ? "Ø§Ù„Ø¥Ø¬Ù…Ø§Ù„ÙŠ (Ø§Ø®ØªÙŠØ§Ø±ÙŠ)" : "Total (optional)"}</span><div className="money-input"><input type="number" min="0" step="0.001" value={total} onChange={(event) => setTotal(event.target.value)} /><b className="money-currency"><OmrSymbol size={14} /></b></div></label>
              <label><span>{locale === "ar" ? "Ø¹Ø¯Ø¯ Ø§Ù„Ø£Ø´Ù‡Ø±" : "Months"}</span><input type="number" min="0" max="360" value={duration} onChange={(event) => setDuration(event.target.value)} /></label>
            </div>
          )}
          {preview > 0 && resolvedSchedule === "monthly" && kind === "expense" && <p className="modal-note">{locale === "ar" ? `Ø§Ù„Ù‚Ø³Ø· Ø§Ù„Ø´Ù‡Ø±ÙŠ â‰ˆ ${preview.toFixed(3)} Ø±.Ø¹.` : `Monthly installment â‰ˆ ${preview.toFixed(3)} OMR`}</p>}
          {schedule !== "unscheduled" && (
            <div className="form-row">
              {resolvedSchedule === "monthly" && <label><span>{locale === "ar" ? "ÙŠÙˆÙ… Ø§Ù„Ø§Ø³ØªØ­Ù‚Ø§Ù‚" : "Due day"}</span><input type="number" min="1" max="28" value={dueDay} onChange={(event) => setDueDay(event.target.value)} /></label>}
              <label><span>{resolvedSchedule === "once" ? (locale === "ar" ? "ØªØ§Ø±ÙŠØ® Ø§Ù„Ø®ØµÙ… (Ø´Ù‡Ø± ÙˆØ§Ø­Ø¯)" : "Expense date (one month)") : (locale === "ar" ? "ÙŠØ¨Ø¯Ø£ Ù…Ù†" : "Starts")}</span><input type="date" required value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /></label>
              {resolvedSchedule === "monthly" && <label><span>{locale === "ar" ? "ÙŠÙ†ØªÙ‡ÙŠ ÙÙŠ (Ø§Ø®ØªÙŠØ§Ø±ÙŠ)" : "Ends (optional)"}</span><input type="date" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} /></label>}
            </div>
          )}
          <label><span>{locale === "ar" ? "Ø§Ù„Ø­Ø³Ø§Ø¨" : "Account"}</span>
            <select value={accountId} onChange={(event) => setAccountId(event.target.value)}>
              <option value="">{locale === "ar" ? "Ø¨Ø¯ÙˆÙ† Ø±Ø¨Ø·" : "Unlinked"}</option>
              {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
            </select>
          </label>
          {resolvedSchedule === "once" && <p className="modal-note">{locale === "ar" ? "Ø®ØµÙ… Ù…Ø±Ø© ÙˆØ§Ø­Ø¯Ø©: ÙŠÙØ¯Ø®Ù„ Ø§Ù„Ù…Ø¨Ù„Øº ÙˆÙŠØ¸Ù‡Ø± ÙÙŠ Ø­Ø³Ø§Ø¨ Ø°Ù„Ùƒ Ø§Ù„Ø´Ù‡Ø± ÙÙ‚Ø·ØŒ Ø«Ù… ØªØ®ØµÙ…Ù‡ Ø£Ùˆ ØªØªØ¬Ø§Ù‡Ù„Ù‡." : "One-time: enter the amount; it appears in that month only until you post or skip it."}</p>}
          {schedule === "unscheduled" && <p className="modal-note">{locale === "ar" ? "Ø¨Ù„Ø§ ØªØ§Ø±ÙŠØ® Ø§Ø³ØªØ­Ù‚Ø§Ù‚. Ø¹Ù†Ø¯Ù…Ø§ ÙŠØµÙ„ Ø§Ù„Ù…Ø¨Ù„Øº Ø§Ø®ØªØ± Ø§Ù„Ø´Ù‡Ø± Ø«Ù… Â«Ø£Ø¶Ù Ù„Ù„Ø´Ù‡Ø±Â»." : "No due date. When the money arrives, pick a month and add it."}</p>}
          <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>{locale === "ar" ? "Ø¥Ù„ØºØ§Ø¡" : "Cancel"}</button><button className="primary-button" disabled={saving}>{saving ? "â€¦" : (locale === "ar" ? "Ø­ÙØ¸" : "Save")}</button></div>
        </form>
      </section>
    </div>
  );
}
