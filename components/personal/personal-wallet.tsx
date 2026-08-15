"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Archive, Banknote, CalendarClock, Check, ChevronDown, Lock, Pause, Pencil, Play, Plus, Printer, Trash2, Unlock, WalletCards, X } from "lucide-react";
import { CollapsiblePanel, FoldWrap } from "../ui/collapsible-panel";
import { apiFetch } from "../../lib/client-api";
import { formatMoneyMinor } from "../../lib/money";
import { occurrenceVarianceCopy, occurrenceLedgerStatus } from "../../lib/personal-finance";
import OmrSymbol from "../brand/OmrSymbol";
import { DateField } from "../ui/date-field";

type Locale = "ar" | "en";

export type PersonalAccount = {
  id: string;
  space_id: string;
  name: string;
  kind: string;
  opening_minor: number;
  balance_minor?: number;
  status?: string;
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
  transaction_id?: string | null;
  rule_name?: string;
  rule_kind?: string;
  amount_mode?: string;
  total_minor?: number;
  rule_paid_minor?: number;
};

function money(minor: number, locale: Locale) {
  return formatMoneyMinor(minor, "OMR", locale);
}

function printOccurrenceStatement(item: PersonalOccurrence, locale: Locale) {
  const expected = Number(item.expected_minor);
  const actual = Number(item.actual_minor ?? item.expected_minor);
  const delta = actual - expected;
  const title = locale === "ar" ? "كشف بند وازن" : "WAZEN item statement";
  const rows = locale === "ar"
    ? [
        ["البند", item.rule_name ?? ""],
        ["الشهر", item.period_key],
        ["الاستحقاق", formatDue(item.due_at) || item.due_at.slice(0, 10)],
        ["النوع", item.rule_kind === "income" ? "دخل" : "خصم"],
        ["الالتزام", money(expected, locale)],
        ["المدفوع", money(actual, locale)],
        ["الفرق", delta === 0 ? "لا يوجد" : `${delta > 0 ? "زيادة" : "نقص"} ${money(Math.abs(delta), locale)}`],
      ]
    : [
        ["Item", item.rule_name ?? ""],
        ["Month", item.period_key],
        ["Due", formatDue(item.due_at) || item.due_at.slice(0, 10)],
        ["Type", item.rule_kind === "income" ? "Income" : "Expense"],
        ["Commitment", money(expected, locale)],
        ["Paid", money(actual, locale)],
        ["Variance", delta === 0 ? "None" : `${delta > 0 ? "Over" : "Short"} ${money(Math.abs(delta), locale)}`],
      ];
  const html = `<!doctype html><html lang="${locale}" dir="${locale === "ar" ? "rtl" : "ltr"}"><head><meta charset="utf-8"/><title>${title}</title>
  <style>body{font-family:Tahoma,Arial,sans-serif;padding:32px;color:#12231f}h1{margin:0 0 8px;font-size:22px}table{width:100%;border-collapse:collapse}td{padding:10px 0;border-bottom:1px solid #e5ebe7;font-size:14px}td:last-child{text-align:end;font-weight:700}.brand{color:#0d7a65;font-weight:800}</style></head><body>
  <div class="brand">WAZEN · وازن</div><h1>${title}</h1>
  <table>${rows.map((row) => `<tr><td>${row[0]}</td><td>${row[1]}</td></tr>`).join("")}</table>
  <script>window.print()</script></body></html>`;
  const popup = window.open("", "_blank", "noopener,noreferrer,width=720,height=900");
  if (!popup) return;
  popup.document.write(html);
  popup.document.close();
}

export function PersonalWalletPanel({
  spaceId,
  locale,
  accounts,
  rules,
  occurrences,
  transactions = [],
  onChanged,
}: {
  spaceId: string;
  locale: Locale;
  accounts: PersonalAccount[];
  rules: PersonalRule[];
  occurrences: PersonalOccurrence[];
  transactions?: Array<{
    id: string;
    space_id: string;
    status?: string;
    kind: string;
    amount_minor: number;
    occurred_at: string;
    description_ar?: string;
    description_en?: string;
  }>;
  onChanged: (next: Record<string, unknown>) => void;
}) {
  const [accountOpen, setAccountOpen] = useState<PersonalAccount | true | null>(null);
  const spaceAccounts = accounts.filter((item) => item.space_id === spaceId);
  const activeAccounts = spaceAccounts.filter((item) => (item.status ?? "active") === "active");
  const spaceRules = rules.filter((item) => item.space_id === spaceId);
  const spaceOcc = occurrences
    .filter((item) => item.space_id === spaceId)
    .map((item) => ({ ...item, status: occurrenceLedgerStatus(item, transactions) }));
  const loans = spaceRules.filter((item) => Number(item.total_minor) > 0);
  const unscheduled = spaceRules.filter((item) => (item.schedule ?? "monthly") === "unscheduled" && item.status === "active");
  const byMonth = [...spaceOcc].sort((a, b) => (a.due_at || a.period_key).localeCompare(b.due_at || b.period_key)).reduce((map, item) => {
    const key = (item.due_at || item.period_key).slice(0, 7);
    const list = map.get(key) ?? [];
    list.push(item);
    map.set(key, list);
    return map;
  }, new Map<string, PersonalOccurrence[]>());

  const mutateAccount = async (accountId: string, status: "active" | "paused" | "archived") => {
    const response = await apiFetch("/api/dashboard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "setPersonalAccountStatus", idempotencyKey: crypto.randomUUID(), accountId, status }) });
    const result = await response.json() as Record<string, unknown> & { error?: string };
    if (!response.ok) { window.alert(result.error ?? "FAILED"); return; }
    onChanged(result);
  };
  const removeAccount = async (accountId: string) => {
    if (!window.confirm(locale === "ar" ? "حذف هذا الحساب؟ لا يمكن الحذف إن وُجدت عليه حركات معتمدة." : "Delete this account? Posted activity blocks deletion.")) return;
    const response = await apiFetch("/api/dashboard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "deletePersonalAccount", idempotencyKey: crypto.randomUUID(), accountId }) });
    const result = await response.json() as Record<string, unknown> & { error?: string };
    if (!response.ok) { window.alert(result.error === "ACCOUNT_HAS_ACTIVITY" ? (locale === "ar" ? "لا يمكن الحذف: عليه حركات. أرشف الحساب بدلاً من ذلك." : "Cannot delete: it has posted activity. Archive it instead.") : (result.error ?? "FAILED")); return; }
    onChanged(result);
  };
  return (
    <>
      <CollapsiblePanel
        id={`${spaceId}:accounts`}
        heading={<><span className="section-kicker"><WalletCards size={15} />{locale === "ar" ? "حساباتك" : "Your accounts"}</span><h2>{locale === "ar" ? "البنوك والنقد" : "Banks and cash"}</h2></>}
        actions={<button type="button" className="primary-button" onClick={() => setAccountOpen(true)}><Plus size={15} />{locale === "ar" ? "إضافة حساب" : "Add account"}</button>}
        foldLabel={locale === "ar" ? "طي الحسابات" : "Fold accounts"}
      >
        <p className="modal-note">{locale === "ar" ? "كل حساب منفصل. الرصيد الافتتاحي هو ما لديك الآن، والدخل والخصم لا يُعتمدان إلا بعد «اعتماد الدخل» أو «اعتماد الخصم»، أو تجاهل، أو تأجيل للشهر التالي." : "Each account is separate. Opening is what you hold now. Income and bills post only after you approve, skip, or defer them."}</p>
        <div className="personal-account-grid">
          {spaceAccounts.map((account) => (
            <AccountCard
              key={account.id}
              account={account}
              locale={locale}
              onEdit={() => setAccountOpen(account)}
              onPause={() => void mutateAccount(account.id, (account.status ?? "active") === "paused" ? "active" : "paused")}
              onArchive={() => void mutateAccount(account.id, (account.status ?? "active") === "archived" ? "active" : "archived")}
              onDelete={() => void removeAccount(account.id)}
            />
          ))}
          {!spaceAccounts.length && <p className="empty-state">{locale === "ar" ? "أضف حساب بنك نزوى أو مسقط أو النقد أولاً." : "Add Bank Nizwa, Muscat, or cash first."}</p>}
        </div>
      </CollapsiblePanel>
      {byMonth.size > 0 && (
        <CollapsiblePanel
          id={`${spaceId}:months`}
          heading={<><span className="section-kicker">{locale === "ar" ? "حساب الأشهر" : "Month ledgers"}</span><h2>{locale === "ar" ? "كل شهر يظهر الدخل والصرف المعتمد، والمعلّق ينتظر الاعتماد" : "Each month shows posted income and spend; pending items wait for approval"}</h2></>}
          foldLabel={locale === "ar" ? "طي حساب الأشهر" : "Fold month ledgers"}
        >
          {[...byMonth.entries()].map(([period, rows]) => {
            const postedIn = rows.filter((row) => row.rule_kind === "income" && row.status === "posted").reduce((sum, row) => sum + Number(row.actual_minor ?? row.expected_minor), 0);
            const postedOut = rows.filter((row) => row.rule_kind !== "income" && row.status === "posted").reduce((sum, row) => sum + Number(row.actual_minor ?? row.expected_minor), 0);
            const pendingIn = rows.filter((row) => row.rule_kind === "income" && row.status === "pending").reduce((sum, row) => sum + Number(row.expected_minor), 0);
            const pendingOut = rows.filter((row) => row.rule_kind !== "income" && row.status === "pending").reduce((sum, row) => sum + Number(row.expected_minor), 0);
            const pendingNote = pendingIn || pendingOut
              ? (locale === "ar"
                ? ` · معلّق دخل ${money(pendingIn, locale)} · خصم ${money(pendingOut, locale)}`
                : ` · pending in ${money(pendingIn, locale)} · out ${money(pendingOut, locale)}`)
              : "";
            return (
              <FoldWrap key={period} id={`${spaceId}:month:${period}`} label={locale === "ar" ? `طي ${period}` : `Fold ${period}`}>
              <div className="personal-month-block">
                <div className="personal-month-head">
                  <strong>{period}</strong>
                  <span>{locale === "ar" ? `دخل ${money(postedIn, locale)} · صرف ${money(postedOut, locale)} · متبقي ${money(postedIn - postedOut, locale)}${pendingNote}` : `In ${money(postedIn, locale)} · out ${money(postedOut, locale)} · left ${money(postedIn - postedOut, locale)}${pendingNote}`}</span>
                </div>
                <div className="personal-occ-list">
                  {rows.filter((row) => row.status === "pending").map((item) => (
                    <OccurrenceRow key={item.id} item={item} locale={locale} accounts={activeAccounts} onChanged={onChanged} />
                  ))}
                  {rows.filter((row) => row.status !== "pending").map((item) => {
                    const expected = Number(item.expected_minor);
                    const actual = Number(item.actual_minor ?? item.expected_minor);
                    const showVariance = item.status === "posted" && item.amount_mode !== "variable" && expected > 0;
                    const statusLabel = item.status === "posted" ? (locale === "ar" ? "معتمد" : "Posted")
                      : item.status === "deferred" ? (locale === "ar" ? "مؤجّل" : "Deferred")
                      : item.status === "voided" ? (locale === "ar" ? "ملغى" : "Voided")
                      : item.status === "superseded" ? (locale === "ar" ? "مستبدل" : "Replaced")
                      : item.status === "skipped" ? (locale === "ar" ? "موقوف" : "Paused")
                      : (locale === "ar" ? "متجاهل" : "Skipped");
                    return (
                    <div className={`personal-rule-row${["voided", "superseded", "skipped"].includes(item.status) ? " is-inactive" : ""}`} key={item.id}>
                      <div>
                        <strong>{item.rule_name}</strong>
                        <span>
                          {statusLabel}
                          {showVariance ? ` · ${occurrenceVarianceCopy(expected, actual, locale)}` : ""}
                        </span>
                      </div>
                      <b>{money(actual, locale)}</b>
                      {item.status === "posted" && (
                        <button type="button" className="secondary-button compact" onClick={() => printOccurrenceStatement(item, locale)}>
                          <Printer size={14} />{locale === "ar" ? "كشف البند" : "Item statement"}
                        </button>
                      )}
                    </div>
                    );
                  })}
                </div>
              </div>
              </FoldWrap>
            );
          })}
        </CollapsiblePanel>
      )}

      {unscheduled.length > 0 && (
        <CollapsiblePanel id={`${spaceId}:unscheduled`} heading={<h2>{locale === "ar" ? "دخل آخر بدون موعد" : "Other income — no due date"}</h2>} foldLabel={locale === "ar" ? "طي الدخل الآخر" : "Fold other income"}>
          {unscheduled.map((rule) => (
            <UnscheduledRow key={rule.id} rule={rule} locale={locale} onChanged={onChanged} />
          ))}
        </CollapsiblePanel>
      )}

      {loans.length > 0 && (
        <CollapsiblePanel id={`${spaceId}:loans`} heading={<h2>{locale === "ar" ? "تقدم الأقساط" : "Installment progress"}</h2>} foldLabel={locale === "ar" ? "طي الأقساط" : "Fold installments"}>
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
        </CollapsiblePanel>
      )}

      {accountOpen && <AccountModal locale={locale} spaceId={spaceId} existing={accountOpen === true ? undefined : accountOpen} onClose={() => setAccountOpen(null)} onChanged={(next) => { onChanged(next); setAccountOpen(null); }} />}
    </>
  );
}

export function PersonalRulesSetup({
  spaceId,
  locale,
  accounts,
  rules,
  onChanged,
}: {
  spaceId: string;
  locale: Locale;
  accounts: PersonalAccount[];
  rules: PersonalRule[];
  onChanged: (next: Record<string, unknown>) => void;
}) {
  const [incomeMenu, setIncomeMenu] = useState(false);
  const [expenseMenu, setExpenseMenu] = useState(false);
  const [busyReset, setBusyReset] = useState(false);
  const [ruleOpen, setRuleOpen] = useState<{ kind: "income" | "expense"; schedule: "monthly" | "once" | "unscheduled"; amountMode: "fixed" | "variable"; existing?: PersonalRule } | null>(null);
  const spaceRules = rules.filter((item) => item.space_id === spaceId);
  const activeAccounts = accounts.filter((item) => item.space_id === spaceId && (item.status ?? "active") === "active");
  const mutateRule = async (ruleId: string, status: "active" | "paused" | "archived") => {
    const response = await apiFetch("/api/dashboard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "setPersonalRuleStatus", idempotencyKey: crypto.randomUUID(), ruleId, status }) });
    const result = await response.json() as Record<string, unknown> & { error?: string };
    if (!response.ok) { window.alert(result.error ?? "FAILED"); return; }
    onChanged(result);
  };
  const resetWallet = async () => {
    const first = window.confirm(locale === "ar"
      ? "تصفية المحفظة تصفّر الرصيد وتحذف الحسابات والدخل والخصوم وكل العمليات. المحفظة نفسها تبقى. لا يمكن التراجع."
      : "This wipes balances, accounts, income, bills, and every transaction. The wallet itself stays. This cannot be undone.");
    if (!first) return;
    const typed = window.prompt(locale === "ar" ? "اكتب تصفير للتأكيد" : "Type RESET to confirm", "");
    if ((locale === "ar" && typed !== "تصفير") || (locale !== "ar" && typed !== "RESET")) {
      if (typed != null && typed !== "") window.alert(locale === "ar" ? "لم يُطابق النص. أُلغي التصفير." : "Confirmation text did not match. Reset cancelled.");
      return;
    }
    setBusyReset(true);
    const response = await apiFetch("/api/dashboard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "resetWalletData", idempotencyKey: crypto.randomUUID(), spaceId, confirm: "RESET" }) });
    const result = await response.json() as Record<string, unknown> & { error?: string };
    setBusyReset(false);
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
    <div className="personal-setup-rules">
      <div className="panel-heading">
        <div>
          <span className="section-kicker">{locale === "ar" ? "ضبط المحفظة" : "Wallet setup"}</span>
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
      <p className="modal-note">{locale === "ar" ? "هنا تُعرَّف بنود الدخل والخصم. اعتماد الدفع والتأجيل يظهر في حساب الأشهر." : "Define income and bills here. Approving, skipping, and deferring stay in the month ledger."}</p>
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
      {ruleOpen && <RuleModal locale={locale} spaceId={spaceId} kind={ruleOpen.kind} schedule={ruleOpen.schedule} amountMode={ruleOpen.amountMode} existing={ruleOpen.existing} accounts={activeAccounts} onClose={() => setRuleOpen(null)} onChanged={(next) => { onChanged(next); setRuleOpen(null); }} />}
      <div className="personal-reset-box">
        <div>
          <strong>{locale === "ar" ? "تصفية وتصفير البيانات" : "Wipe and reset data"}</strong>
          <p>{locale === "ar" ? "يحذف الحسابات والدخل والخصوم وكل العمليات ويرجع الرصيد إلى صفر. اسم المحفظة يبقى." : "Deletes accounts, income, bills, and every transaction, and sets the balance to zero. The wallet name stays."}</p>
        </div>
        <button type="button" className="danger-button" disabled={busyReset} onClick={() => void resetWallet()}>
          <Trash2 size={14} />{busyReset ? "…" : (locale === "ar" ? "تصفية المحفظة" : "Reset wallet")}
        </button>
      </div>
    </div>
  );
}

function AccountCard({ account, locale, onEdit, onPause, onArchive, onDelete }: { account: PersonalAccount; locale: Locale; onEdit: () => void; onPause: () => void; onArchive: () => void; onDelete: () => void }) {
  const [unlocked, setUnlocked] = useState(false);
  const status = account.status ?? "active";
  return (
    <div className={`personal-account-card ${status !== "active" ? "is-paused" : ""}`}>
      <i><Banknote size={16} /></i>
      <div>
        <small>{account.kind === "cash" ? (locale === "ar" ? "نقد" : "Cash") : account.kind === "wallet" ? (locale === "ar" ? "محفظة" : "Wallet") : (locale === "ar" ? "بنك" : "Bank")}{status === "paused" ? (locale === "ar" ? " · متوقف" : " · paused") : status === "archived" ? (locale === "ar" ? " · مؤرشف" : " · archived") : ""}</small>
        <strong>{account.name}</strong>
      </div>
      <b>{money(Number(account.balance_minor ?? account.opening_minor), locale)}</b>
      <div className="personal-account-guard">
        <button type="button" className={`account-lock ${unlocked ? "open" : ""}`} onClick={() => setUnlocked((current) => !current)}>
          {unlocked ? <Unlock size={14} /> : <Lock size={14} />}
          {unlocked ? (locale === "ar" ? "إخفاء" : "Hide") : (locale === "ar" ? "إدارة" : "Manage")}
        </button>
        {unlocked && (
          <div className="personal-rule-actions">
            <button type="button" title={locale === "ar" ? "تعديل" : "Edit"} onClick={onEdit}><Pencil size={14} /></button>
            <button type="button" title={status === "paused" ? (locale === "ar" ? "تشغيل" : "Resume") : (locale === "ar" ? "إيقاف" : "Pause")} onClick={onPause}>{status === "paused" ? <Play size={14} /> : <Pause size={14} />}</button>
            <button type="button" title={status === "archived" ? (locale === "ar" ? "استعادة" : "Restore") : (locale === "ar" ? "أرشفة" : "Archive")} onClick={onArchive}><Archive size={14} /></button>
            <button type="button" className="danger" title={locale === "ar" ? "حذف" : "Delete"} onClick={onDelete}><Trash2 size={14} /></button>
          </div>
        )}
      </div>
    </div>
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
      <DateField mode="month" value={periodKey} onChange={setPeriodKey} />
      <div className="money-input"><input type="number" min="0.001" step="0.001" value={amount} onChange={(event) => setAmount(event.target.value)} /><b className="money-currency"><OmrSymbol size={12} /></b></div>
      <button type="button" className="primary-button" disabled={busy} onClick={() => void queue()}>{locale === "ar" ? "أضف للشهر" : "Add to month"}</button>
    </div>
  );
}

function localIsoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addDaysIso(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return localIsoDate(date);
}

function addMonthsIso(months: number) {
  const date = new Date();
  date.setMonth(date.getMonth() + months);
  return localIsoDate(date);
}

function formatDue(value: string | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function OccurrenceRow({ item, locale, accounts, onChanged }: { item: PersonalOccurrence; locale: Locale; accounts: PersonalAccount[]; onChanged: (next: Record<string, unknown>) => void }) {
  const [amount, setAmount] = useState(item.expected_minor ? String(item.expected_minor / 1000) : "");
  const [accountId, setAccountId] = useState(item.account_id ?? accounts[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [deferOpen, setDeferOpen] = useState(false);
  const [deferUntil, setDeferUntil] = useState((item.due_at || item.period_key).slice(0, 10) || addDaysIso(7));
  useEffect(() => {
    if (!accountId && accounts[0]?.id) setAccountId(accounts[0].id);
  }, [accountId, accounts]);
  const variable = item.amount_mode === "variable";
  const income = item.rule_kind === "income";
  const act = async (mode: "confirm" | "skip" | "defer") => {
    setBusy(true);
    try {
      const payload = mode === "skip"
        ? { action: "skipPersonalOccurrence", idempotencyKey: crypto.randomUUID(), occurrenceId: item.id }
        : mode === "defer"
          ? { action: "deferPersonalOccurrence", idempotencyKey: crypto.randomUUID(), occurrenceId: item.id, deferUntil }
          : { action: "confirmPersonalOccurrence", idempotencyKey: crypto.randomUUID(), occurrenceId: item.id, amount: amount || undefined, accountId: accountId || undefined };
      const response = await apiFetch("/api/dashboard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json() as Record<string, unknown> & { error?: string };
      if (!response.ok) {
        const messages: Record<string, string> = locale === "ar"
          ? { INVALID_OCCURRENCE: "تعذر اعتماد البند. حدّث الصفحة وحاول مرة أخرى.", INVALID_AMOUNT: "أدخل مبلغاً صحيحاً.", VARIABLE_AMOUNT_REQUIRED: "أدخل المبلغ قبل الاعتماد.", INVALID_ACCOUNT: "اختر حساباً لاستلام الدخل أو الخصم.", OCCURRENCE_NOT_PENDING: "هذا البند معتمد أو ملغى مسبقاً." }
          : { INVALID_OCCURRENCE: "Could not post this item. Refresh and try again.", INVALID_AMOUNT: "Enter a valid amount.", VARIABLE_AMOUNT_REQUIRED: "Enter the amount before approving.", INVALID_ACCOUNT: "Choose an account.", OCCURRENCE_NOT_PENDING: "This item is already posted or cancelled." };
        throw new Error(messages[result.error ?? ""] ?? (result.error ?? "FAILED"));
      }
      onChanged(result);
      if (mode === "defer") setDeferOpen(false);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "FAILED");
    } finally { setBusy(false); }
  };
  const presets = [
    { label: locale === "ar" ? "أسبوع" : "1 week", value: addDaysIso(7) },
    { label: locale === "ar" ? "أسبوعان" : "2 weeks", value: addDaysIso(14) },
    { label: locale === "ar" ? "3 أسابيع" : "3 weeks", value: addDaysIso(21) },
    { label: locale === "ar" ? "شهر" : "1 month", value: addMonthsIso(1) },
    { label: locale === "ar" ? "شهران" : "2 months", value: addMonthsIso(2) },
  ];
  return (
    <div className="personal-occ-row">
      <div>
        <strong>{item.rule_name}</strong>
        <span>{formatDue(item.due_at) || item.period_key} · {income ? (locale === "ar" ? "دخل" : "Income") : (locale === "ar" ? "خصم" : "Bill")}{!variable && Number(item.expected_minor) > 0 ? (locale === "ar" ? ` · الالتزام ${money(Number(item.expected_minor), locale)}` : ` · due ${money(Number(item.expected_minor), locale)}`) : ""}{variable ? (locale === "ar" ? " · متغيرة — أدخل المبلغ" : " · variable — enter amount") : ""}</span>
      </div>
      <div className="personal-occ-fields">
        <label className="personal-occ-account">
          <span>{variable ? (locale === "ar" ? "المبلغ" : "Amount") : (locale === "ar" ? "المدفوع" : "Paid")}</span>
          <div className="money-input"><input type="text" inputMode="decimal" autoComplete="off" required={variable} value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^\d.]/g, ""))} aria-label={locale === "ar" ? "المدفوع" : "Paid"} /><b className="money-currency"><OmrSymbol size={12} /></b></div>
        </label>
        <label className="personal-occ-account">
          <span>{income ? (locale === "ar" ? "إلى حساب" : "Into account") : (locale === "ar" ? "من حساب" : "From account")}</span>
          <select value={accountId} onChange={(event) => {
            const next = event.target.value;
            setAccountId(next);
            void apiFetch("/api/dashboard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "assignPersonalOccurrenceAccount", idempotencyKey: crypto.randomUUID(), occurrenceId: item.id, accountId: next }) }).then(async (response) => {
              const result = await response.json() as Record<string, unknown> & { error?: string };
              if (!response.ok) throw new Error(result.error ?? "FAILED");
              onChanged(result);
            }).catch((error: unknown) => window.alert(error instanceof Error ? error.message : "FAILED"));
          }}>
            {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
          </select>
        </label>
      </div>
      <div className="personal-occ-actions">
        <button type="button" className="primary-button" disabled={busy} onClick={() => void act("confirm")}><Check size={14} />{income ? (locale === "ar" ? "اعتماد الدخل" : "Approve income") : (locale === "ar" ? "اعتماد الخصم" : "Approve debit")}</button>
        <button type="button" className="secondary-button" disabled={busy} onClick={() => setDeferOpen((open) => !open)}><CalendarClock size={14} />{locale === "ar" ? "تأجيل" : "Defer"}</button>
        <button type="button" className="secondary-button" disabled={busy} onClick={() => void act("skip")}><X size={14} />{locale === "ar" ? "تجاهل" : "Skip"}</button>
      </div>
      {deferOpen && (
        <div className="personal-defer-box">
          <div className="personal-defer-presets">
            {presets.map((preset) => (
              <button key={preset.label} type="button" className={deferUntil === preset.value ? "chip active" : "chip"} onClick={() => setDeferUntil(preset.value)}>{preset.label}</button>
            ))}
          </div>
          <label className="personal-occ-account">
            <span>{locale === "ar" ? "أو اختر التاريخ من التقويم" : "Or pick a date"}</span>
            <DateField value={deferUntil} onChange={setDeferUntil} />
          </label>
          <div className="personal-occ-actions">
            <button type="button" className="secondary-button" onClick={() => setDeferOpen(false)}>{locale === "ar" ? "إلغاء" : "Cancel"}</button>
            <button type="button" className="primary-button" disabled={busy || !/^\d{4}-\d{2}-\d{2}$/.test(deferUntil)} onClick={() => void act("defer")}>{locale === "ar" ? "تأكيد التأجيل" : "Confirm defer"}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function AccountModal({ locale, spaceId, existing, onClose, onChanged }: { locale: Locale; spaceId: string; existing?: PersonalAccount; onClose: () => void; onChanged: (next: Record<string, unknown>) => void }) {
  const [name, setName] = useState(existing?.name ?? "");
  const [kind, setKind] = useState(existing?.kind ?? "bank");
  const [opening, setOpening] = useState(existing ? String(Number(existing.opening_minor) / 1000) : "");
  const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    const response = await apiFetch("/api/dashboard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: existing ? "updatePersonalAccount" : "addPersonalAccount", idempotencyKey: crypto.randomUUID(), accountId: existing?.id, spaceId, name, kind, opening: opening || "0" }) });
    const result = await response.json() as Record<string, unknown> & { error?: string };
    setSaving(false);
    if (!response.ok) { window.alert(result.error ?? "FAILED"); return; }
    onChanged(result);
  };
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal-card" role="dialog">
        <div className="modal-header"><h2>{existing ? (locale === "ar" ? "تعديل الحساب" : "Edit account") : (locale === "ar" ? "حساب شخصي" : "Personal account")}</h2><button type="button" onClick={onClose}><X size={20} /></button></div>
        <form className="modal-form" onSubmit={(event) => void submit(event)}>
          <label><span>{locale === "ar" ? "اسم الحساب" : "Account name"}</span><input required value={name} onChange={(event) => setName(event.target.value)} placeholder={locale === "ar" ? "بنك نزوى" : "Bank Nizwa"} /></label>
          <label><span>{locale === "ar" ? "النوع" : "Type"}</span>
            <select value={kind} onChange={(event) => setKind(event.target.value)}>
              <option value="bank">{locale === "ar" ? "بنك" : "Bank"}</option>
              <option value="cash">{locale === "ar" ? "نقد" : "Cash"}</option>
              <option value="wallet">{locale === "ar" ? "محفظة رقمية" : "E-wallet"}</option>
            </select>
          </label>
          <label><span>{locale === "ar" ? "الرصيد الافتتاحي" : "Opening balance"}</span><div className="money-input"><input type="number" min="0" step="0.001" value={opening} onChange={(event) => setOpening(event.target.value)} /><b className="money-currency"><OmrSymbol size={14} /></b></div></label>
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
              <label><span>{resolvedSchedule === "once" ? (locale === "ar" ? "تاريخ الخصم (شهر واحد)" : "Expense date (one month)") : (locale === "ar" ? "يبدأ من" : "Starts")}</span><DateField required value={startsAt} onChange={setStartsAt} /></label>
              {resolvedSchedule === "monthly" && <label><span>{locale === "ar" ? "ينتهي في (اختياري)" : "Ends (optional)"}</span><DateField value={endsAt} onChange={setEndsAt} /></label>}
            </div>
          )}
          <label><span>{kind === "income" ? (locale === "ar" ? "يُضاف إلى الحساب" : "Credit account") : (locale === "ar" ? "يُخصم من الحساب" : "Debit account")}</span>
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
