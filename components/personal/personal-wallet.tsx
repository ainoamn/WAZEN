"use client";

import { FormEvent, useMemo, useState } from "react";
import { Archive, Banknote, CalendarClock, Check, ChevronDown, Pause, Pencil, Play, Plus, Trash2, WalletCards, X } from "lucide-react";
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
  const [ruleOpen, setRuleOpen] = useState<{ kind: "income" | "expense"; schedule: "monthly" | "once" | "unscheduled"; amountMode: "fixed" | "variable"; existing?: PersonalRule } | null>(null);
  const spaceAccounts = accounts.filter((item) => item.space_id === spaceId);
  const spaceRules = rules.filter((item) => item.space_id === spaceId);
  const spaceOcc = occurrences.filter((item) => item.space_id === spaceId);
  const pending = spaceOcc.filter((item) => item.status === "pending");
  const loans = spaceRules.filter((item) => Number(item.total_minor) > 0);
  const unscheduled = spaceRules.filter((item) => (item.schedule ?? "monthly") === "unscheduled" && item.status === "active");
  const byMonth = [...spaceOcc].sort((a, b) => a.period_key.localeCompare(b.period_key)).reduce((map, item) => {
    const list = map.get(item.period_key) ?? [];
    list.push(item);
    map.set(item.period_key, list);
    return map;
  }, new Map<string, PersonalOccurrence[]>());

  const mutateRule = async (ruleId: string, status: "active" | "paused" | "archived") => {
    const response = await apiFetch("/api/dashboard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "setPersonalRuleStatus", idempotencyKey: crypto.randomUUID(), ruleId, status }) });
    const result = await response.json() as Record<string, unknown> & { error?: string };
    if (!response.ok) { window.alert(result.error ?? "FAILED"); return; }
    onChanged(result);
  };
  const removeRule = async (ruleId: string) => {
    if (!window.confirm(locale === "ar" ? "حذف هذا البند؟ القيود المرحلة تبقى، والاستحقاقات المعلقة تُلغى." : "Delete this rule? Posted entries stay; pending months are removed.")) return;
    const response = await apiFetch("/api/dashboard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "deletePersonalRule", idempotencyKey: crypto.randomUUID(), ruleId }) });
    const result = await response.json() as Record<string, unknown> & { error?: string };
    if (!response.ok) { window.alert(result.error ?? "FAILED"); return; }
    onChanged(result);
  };

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
        <p className="modal-note">{locale === "ar" ? "كل حساب منفصل. الرصيد الافتتاحي هو ما لديك الآن، والدخل والخصم لا يُعتمدان إلا بعد «اعتماد الدخل» أو «اعتماد الخصم»، أو تجاهل، أو تأجيل للشهر التالي." : "Each account is separate. Opening is what you hold now. Income and bills post only after you approve, skip, or defer them."}</p>
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

      {byMonth.size > 0 && (
        <article className="panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">{locale === "ar" ? "حساب الأشهر" : "Month ledgers"}</span>
              <h2>{locale === "ar" ? "كل شهر يظهر دخله ومصروفه المجدول قبل الترحيل" : "Each month shows scheduled income and spend before posting"}</h2>
            </div>
          </div>
          {[...byMonth.entries()].map(([period, rows]) => {
            const plannedIn = rows.filter((row) => row.rule_kind === "income" && row.status !== "skipped" && row.status !== "deferred").reduce((sum, row) => sum + Number(row.actual_minor ?? row.expected_minor), 0);
            const plannedOut = rows.filter((row) => row.rule_kind !== "income" && row.status !== "skipped" && row.status !== "deferred").reduce((sum, row) => sum + Number(row.actual_minor ?? row.expected_minor), 0);
            return (
              <div className="personal-month-block" key={period}>
                <div className="personal-month-head">
                  <strong>{period}</strong>
                  <span>{locale === "ar" ? `دخل ${money(plannedIn, locale)} · صرف ${money(plannedOut, locale)} · متبقي ${money(plannedIn - plannedOut, locale)}` : `In ${money(plannedIn, locale)} · out ${money(plannedOut, locale)} · left ${money(plannedIn - plannedOut, locale)}`}</span>
                </div>
                <div className="personal-occ-list">
                  {rows.filter((row) => row.status === "pending").map((item) => (
                    <OccurrenceRow key={item.id} item={item} locale={locale} accounts={spaceAccounts} onChanged={onChanged} />
                  ))}
                  {rows.filter((row) => row.status !== "pending").map((item) => (
                    <div className="personal-rule-row" key={item.id}>
                      <strong>{item.rule_name}</strong>
                      <span>{item.status === "posted" ? (locale === "ar" ? "معتمد" : "Posted") : item.status === "deferred" ? (locale === "ar" ? "مؤجّل" : "Deferred") : (locale === "ar" ? "متجاهل" : "Skipped")}</span>
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
          <div className="panel-heading"><h2>{locale === "ar" ? "دخل آخر بدون موعد" : "Other income — no due date"}</h2></div>
          {unscheduled.map((rule) => (
            <UnscheduledRow key={rule.id} rule={rule} locale={locale} onChanged={onChanged} />
          ))}
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
            <h2>{locale === "ar" ? "دخل ثابت ومتغير وآخر، وخصوم مجدولة" : "Fixed, variable and other income, plus scheduled bills"}</h2>
          </div>
          <div className="section-title-actions">
            <div className="action-menu">
              <button type="button" className="primary-button" onClick={() => { setExpenseMenu(false); setIncomeMenu((open) => !open); }} aria-expanded={incomeMenu}>
                <Plus size={15} />{locale === "ar" ? "دخل" : "Income"}<ChevronDown size={15} />
              </button>
              {incomeMenu && (
                <div className="action-menu-panel" role="menu">
                  <button type="button" role="menuitem" onClick={() => { setIncomeMenu(false); setRuleOpen({ kind: "income", schedule: "monthly", amountMode: "fixed" }); }}>{locale === "ar" ? "دخل ثابت" : "Fixed income"}</button>
                  <button type="button" role="menuitem" onClick={() => { setIncomeMenu(false); setRuleOpen({ kind: "income", schedule: "monthly", amountMode: "variable" }); }}>{locale === "ar" ? "دخل متغير" : "Variable income"}</button>
                  <button type="button" role="menuitem" onClick={() => { setIncomeMenu(false); setRuleOpen({ kind: "income", schedule: "unscheduled", amountMode: "fixed" }); }}>{locale === "ar" ? "دخل آخر" : "Other income"}</button>
                </div>
              )}
            </div>
            <div className="action-menu">
              <button type="button" className="primary-button" onClick={() => { setIncomeMenu(false); setExpenseMenu((open) => !open); }} aria-expanded={expenseMenu}>
                <Plus size={15} />{locale === "ar" ? "خصم" : "Expense"}<ChevronDown size={15} />
              </button>
              {expenseMenu && (
                <div className="action-menu-panel" role="menu">
                  <button type="button" role="menuitem" onClick={() => { setExpenseMenu(false); setRuleOpen({ kind: "expense", schedule: "monthly", amountMode: "fixed" }); }}>{locale === "ar" ? "خصم ثابت كل شهر" : "Fixed monthly"}</button>
                  <button type="button" role="menuitem" onClick={() => { setExpenseMenu(false); setRuleOpen({ kind: "expense", schedule: "monthly", amountMode: "variable" }); }}>{locale === "ar" ? "خصم متغير كل شهر" : "Variable monthly"}</button>
                  <button type="button" role="menuitem" onClick={() => { setExpenseMenu(false); setRuleOpen({ kind: "expense", schedule: "once", amountMode: "fixed" }); }}>{locale === "ar" ? "خصم مرة واحدة" : "One-time expense"}</button>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="personal-rule-list">
          {spaceRules.map((rule) => (
            <div className={`personal-rule-row ${rule.status !== "active" ? "is-paused" : ""}`} key={rule.id}>
              <div>
                <strong>{rule.name}</strong>
                <span>{rule.kind === "income" ? (locale === "ar" ? "دخل" : "Income") : (locale === "ar" ? "مصروف" : "Expense")} · {(rule.schedule ?? "monthly") === "once" ? (locale === "ar" ? `مجدول ${rule.starts_at.slice(0, 7)}` : `scheduled ${rule.starts_at.slice(0, 7)}`) : (rule.schedule ?? "monthly") === "unscheduled" ? (locale === "ar" ? "بدون موعد" : "no date") : (rule.amount_mode === "variable" ? (locale === "ar" ? "متغير شهرياً" : "variable monthly") : (locale === "ar" ? "ثابت شهرياً" : "fixed monthly"))}{rule.status === "paused" ? (locale === "ar" ? " · متوقف" : " · paused") : rule.status === "archived" ? (locale === "ar" ? " · مؤرشف" : " · archived") : ""}</span>
              </div>
              <b>{rule.amount_minor ? money(rule.amount_minor, locale) : (locale === "ar" ? "يُدخل عند الترحيل" : "enter when posting")}</b>
              <div className="personal-rule-actions">
                <button type="button" title={locale === "ar" ? "تعديل" : "Edit"} onClick={() => setRuleOpen({ kind: rule.kind === "expense" ? "expense" : "income", schedule: (rule.schedule === "once" || rule.schedule === "unscheduled" ? rule.schedule : "monthly"), amountMode: rule.amount_mode === "variable" ? "variable" : "fixed", existing: rule })}><Pencil size={14} /></button>
                <button type="button" title={rule.status === "paused" ? (locale === "ar" ? "تشغيل" : "Resume") : (locale === "ar" ? "إيقاف" : "Pause")} onClick={() => void mutateRule(rule.id, rule.status === "paused" ? "active" : "paused")}>{rule.status === "paused" ? <Play size={14} /> : <Pause size={14} />}</button>
                <button type="button" title={rule.status === "archived" ? (locale === "ar" ? "استعادة" : "Restore") : (locale === "ar" ? "أرشفة" : "Archive")} onClick={() => void mutateRule(rule.id, rule.status === "archived" ? "active" : "archived")}><Archive size={14} /></button>
                <button type="button" className="danger" title={locale === "ar" ? "حذف" : "Delete"} onClick={() => void removeRule(rule.id)}><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
          {!spaceRules.length && <p className="empty-state">{locale === "ar" ? "أضف راتباً ثابتاً أو متغيراً أو دخلاً بلا موعد، وجدوِل مصروفاً لشهر معيّن مثل أكتوبر." : "Add fixed, variable, or undated income, and schedule an expense for a month such as October."}</p>}
        </div>
      </article>

      {accountOpen && <AccountModal locale={locale} spaceId={spaceId} onClose={() => setAccountOpen(false)} onChanged={(next) => { onChanged(next); setAccountOpen(false); }} />}
      {ruleOpen && <RuleModal locale={locale} spaceId={spaceId} kind={ruleOpen.kind} schedule={ruleOpen.schedule} amountMode={ruleOpen.amountMode} existing={ruleOpen.existing} accounts={spaceAccounts} onClose={() => setRuleOpen(null)} onChanged={(next) => { onChanged(next); setRuleOpen(null); }} />}
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
        <span>{locale === "ar" ? "اختر الشهر الذي يسجَّل فيه هذا الدخل" : "Pick the month this income belongs to"}</span>
      </div>
      <input type="month" value={periodKey} onChange={(event) => setPeriodKey(event.target.value)} />
      <div className="money-input"><input type="number" min="0.001" step="0.001" value={amount} onChange={(event) => setAmount(event.target.value)} /><b className="money-currency"><OmrSymbol size={12} /></b></div>
      <button type="button" className="primary-button" disabled={busy} onClick={() => void queue()}>{locale === "ar" ? "أضف للشهر" : "Add to month"}</button>
    </div>
  );
}

function OccurrenceRow({ item, locale, accounts, onChanged }: { item: PersonalOccurrence; locale: Locale; accounts: PersonalAccount[]; onChanged: (next: Record<string, unknown>) => void }) {
  const [amount, setAmount] = useState(item.expected_minor ? String(item.expected_minor / 1000) : "");
  const [accountId, setAccountId] = useState(item.account_id ?? accounts[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const variable = item.amount_mode === "variable";
  const income = item.rule_kind === "income";
  const act = async (mode: "confirm" | "skip" | "defer") => {
    setBusy(true);
    try {
      const payload = mode === "skip"
        ? { action: "skipPersonalOccurrence", idempotencyKey: crypto.randomUUID(), occurrenceId: item.id }
        : mode === "defer"
          ? { action: "deferPersonalOccurrence", idempotencyKey: crypto.randomUUID(), occurrenceId: item.id }
          : { action: "confirmPersonalOccurrence", idempotencyKey: crypto.randomUUID(), occurrenceId: item.id, amount, accountId };
      const response = await apiFetch("/api/dashboard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
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
        <span>{item.period_key} · {income ? (locale === "ar" ? "دخل" : "Income") : (locale === "ar" ? "خصم" : "Bill")}{variable ? (locale === "ar" ? " · متغيرة — أدخل المبلغ" : " · variable — enter amount") : ""}</span>
      </div>
      <div className="money-input"><input type="number" min="0.001" step="0.001" required={variable} value={amount} onChange={(event) => setAmount(event.target.value)} /><b className="money-currency"><OmrSymbol size={12} /></b></div>
      <select value={accountId} onChange={(event) => setAccountId(event.target.value)}>
        {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
      </select>
      <div className="personal-occ-actions">
        <button type="button" className="primary-button" disabled={busy} onClick={() => void act("confirm")}><Check size={14} />{income ? (locale === "ar" ? "اعتماد الدخل" : "Approve income") : (locale === "ar" ? "اعتماد الخصم" : "Approve debit")}</button>
        <button type="button" className="secondary-button" disabled={busy} onClick={() => void act("defer")}><CalendarClock size={14} />{locale === "ar" ? "تأجيل" : "Defer"}</button>
        <button type="button" className="secondary-button" disabled={busy} onClick={() => void act("skip")}><X size={14} />{locale === "ar" ? "تجاهل" : "Skip"}</button>
      </div>
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

function RuleModal({ locale, spaceId, kind, schedule, amountMode: initialMode, existing, accounts, onClose, onChanged }: { locale: Locale; spaceId: string; kind: "income" | "expense"; schedule: "monthly" | "once" | "unscheduled"; amountMode: "fixed" | "variable"; existing?: PersonalRule; accounts: PersonalAccount[]; onClose: () => void; onChanged: (next: Record<string, unknown>) => void }) {
  const [name, setName] = useState(existing?.name ?? "");
  const [expenseType, setExpenseType] = useState<"fixed" | "variable" | "once">(schedule === "once" ? "once" : initialMode === "variable" ? "variable" : "fixed");
  const amountMode = initialMode;
  const [amount, setAmount] = useState(existing?.amount_minor ? String(existing.amount_minor / 1000) : "");
  const [total, setTotal] = useState(existing?.total_minor ? String(existing.total_minor / 1000) : "");
  const [duration, setDuration] = useState(existing?.duration_months ? String(existing.duration_months) : "");
  const [dueDay, setDueDay] = useState(String(existing?.due_day || 1));
  const [accountId, setAccountId] = useState(existing?.account_id ?? accounts[0]?.id ?? "");
  const [startsAt, setStartsAt] = useState((existing?.starts_at ?? new Date().toISOString()).slice(0, 10));
  const [endsAt, setEndsAt] = useState(existing?.ends_at ? existing.ends_at.slice(0, 10) : "");
  const [saving, setSaving] = useState(false);
  const resolvedSchedule = kind === "expense" ? (expenseType === "once" ? "once" : "monthly") : schedule;
  const resolvedAmountMode = kind === "expense" ? (expenseType === "variable" ? "variable" : "fixed") : amountMode;
  const title = kind === "income"
    ? (schedule === "unscheduled" ? (locale === "ar" ? "دخل آخر بدون موعد" : "Other income — no date") : amountMode === "variable" ? (locale === "ar" ? "دخل متغير" : "Variable income") : (locale === "ar" ? "دخل ثابت" : "Fixed income"))
    : (expenseType === "once" ? (locale === "ar" ? "خصم مرة واحدة" : "One-time expense") : expenseType === "variable" ? (locale === "ar" ? "خصم متغير" : "Variable bill") : (locale === "ar" ? "خصم شهري ثابت" : "Fixed monthly bill"));
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
        action: existing ? "updatePersonalRule" : "addPersonalRule",
        idempotencyKey: crypto.randomUUID(),
        ruleId: existing?.id,
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
    if (!response.ok) { window.alert(result.error === "VARIABLE_AMOUNT_REQUIRED" || result.error === "INVALID_AMOUNT" ? (locale === "ar" ? "أدخل مبلغاً صحيحاً." : "Enter a valid amount.") : (result.error ?? "FAILED")); return; }
    onChanged(result);
  };
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal-card" role="dialog">
        <div className="modal-header"><h2>{title}</h2><button type="button" onClick={onClose}><X size={20} /></button></div>
        <form className="modal-form" onSubmit={(event) => void submit(event)}>
          <label><span>{locale === "ar" ? "الاسم" : "Name"}</span><input required value={name} onChange={(event) => setName(event.target.value)} placeholder={kind === "income" ? (locale === "ar" ? "راتب / مكافأة / هدية" : "Salary / bonus / gift") : (locale === "ar" ? "سداد لشخص / كهرباء" : "Pay someone / electricity")} /></label>
          {kind === "expense" && (
            <label><span>{locale === "ar" ? "نوع الخصم" : "Expense type"}</span>
              <select value={expenseType} onChange={(event) => setExpenseType(event.target.value as "fixed" | "variable" | "once")}>
                <option value="fixed">{locale === "ar" ? "ثابت كل شهر" : "Fixed monthly"}</option>
                <option value="variable">{locale === "ar" ? "متغير — يُطلب المبلغ كل شهر" : "Variable — enter each month"}</option>
                <option value="once">{locale === "ar" ? "مرة واحدة — يُدخل المبلغ لهذا الشهر فقط" : "One-time — enter amount for that month only"}</option>
              </select>
            </label>
          )}
          {(resolvedAmountMode === "fixed" || resolvedSchedule === "once" || schedule === "unscheduled") && <label><span>{locale === "ar" ? "المبلغ" : "Amount"}</span><div className="money-input"><input required type="number" min="0.001" step="0.001" value={amount} onChange={(event) => setAmount(event.target.value)} /><b className="money-currency"><OmrSymbol size={14} /></b></div></label>}
          {kind === "expense" && resolvedSchedule === "monthly" && (
            <div className="form-row">
              <label><span>{locale === "ar" ? "الإجمالي (اختياري)" : "Total (optional)"}</span><div className="money-input"><input type="number" min="0" step="0.001" value={total} onChange={(event) => setTotal(event.target.value)} /><b className="money-currency"><OmrSymbol size={14} /></b></div></label>
              <label><span>{locale === "ar" ? "عدد الأشهر" : "Months"}</span><input type="number" min="0" max="360" value={duration} onChange={(event) => setDuration(event.target.value)} /></label>
            </div>
          )}
          {preview > 0 && resolvedSchedule === "monthly" && kind === "expense" && <p className="modal-note">{locale === "ar" ? `القسط الشهري ≈ ${preview.toFixed(3)} ر.ع.` : `Monthly installment ≈ ${preview.toFixed(3)} OMR`}</p>}
          {schedule !== "unscheduled" && (
            <div className="form-row">
              {resolvedSchedule === "monthly" && <label><span>{locale === "ar" ? "يوم الاستحقاق" : "Due day"}</span><input type="number" min="1" max="28" value={dueDay} onChange={(event) => setDueDay(event.target.value)} /></label>}
              <label><span>{resolvedSchedule === "once" ? (locale === "ar" ? "تاريخ الخصم (شهر واحد)" : "Expense date (one month)") : (locale === "ar" ? "يبدأ من" : "Starts")}</span><input type="date" required value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /></label>
              {resolvedSchedule === "monthly" && <label><span>{locale === "ar" ? "ينتهي في (اختياري)" : "Ends (optional)"}</span><input type="date" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} /></label>}
            </div>
          )}
          <label><span>{locale === "ar" ? "الحساب" : "Account"}</span>
            <select value={accountId} onChange={(event) => setAccountId(event.target.value)}>
              <option value="">{locale === "ar" ? "بدون ربط" : "Unlinked"}</option>
              {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
            </select>
          </label>
          {resolvedSchedule === "once" && <p className="modal-note">{locale === "ar" ? "خصم مرة واحدة: يُدخل المبلغ ويظهر في حساب ذلك الشهر فقط، ثم تخصمه أو تتجاهله." : "One-time: enter the amount; it appears in that month only until you post or skip it."}</p>}
          {schedule === "unscheduled" && <p className="modal-note">{locale === "ar" ? "بلا تاريخ استحقاق. عندما يصل المبلغ اختر الشهر ثم «أضف للشهر»." : "No due date. When the money arrives, pick a month and add it."}</p>}
          <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>{locale === "ar" ? "إلغاء" : "Cancel"}</button><button className="primary-button" disabled={saving}>{saving ? "…" : (existing ? (locale === "ar" ? "حفظ التعديل" : "Save changes") : (locale === "ar" ? "حفظ" : "Save"))}</button></div>
        </form>
      </section>
    </div>
  );
}
