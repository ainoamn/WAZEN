"use client";

import { FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import { Archive, Banknote, Bell, CalendarClock, Check, ChevronDown, Link2, Lock, Pause, Pencil, Play, Plus, Printer, Repeat2, Sparkles, Trash2, Unlock, WalletCards, X } from "lucide-react";
import { CollapsiblePanel, FoldWrap } from "../ui/collapsible-panel";
import { apiFetch } from "../../lib/client-api";
import { formatMoneyMinor } from "../../lib/money";
import { escapeHtml } from "../../lib/html";
import { printWazenHtml, wrapPrintDocument } from "../../lib/print-document";
import { consumePlanQuota } from "../../lib/plan-quota-client";
import { buildAccountStatementHtml } from "../../lib/account-statement";
import { occurrenceVarianceCopy, occurrenceLedgerStatus } from "../../lib/personal-finance";
import { personalCategoryLabel, presetsForKind, inferPersonalCategory } from "../../lib/personal-categories";
import { buildPersonalCoachBriefing } from "../../lib/personal-coach";
import { bankCustodySplit, holdingsForAccount } from "../../lib/wallet-links";
import OmrSymbol from "../brand/OmrSymbol";
import { DateField } from "../ui/date-field";

type Locale = "ar" | "en";

export async function confirmResetWalletData(
  locale: Locale,
  spaceId: string,
  onChanged: (next: Record<string, unknown>) => void,
  options?: { kind?: "personal" | "group" },
) {
  const group = options?.kind === "group";
  const first = window.confirm(locale === "ar"
    ? (group
      ? "تصفية المحفظة تصفّر الرصيد وتحذف العمليات والمصروفات والتسويات والأقساط وأدوار الدفع. الأعضاء وخطة المساهمة واسم المحفظة تبقى. لا يمكن التراجع."
      : "تصفية المحفظة تصفّر الرصيد وتحذف الحسابات والدخل والخصوم وكل العمليات. المحفظة نفسها تبقى. لا يمكن التراجع.")
    : (group
      ? "This wipes balances, transactions, expenses, settlements, installments, and turn payments. Members, the contribution plan, and the wallet name stay. This cannot be undone."
      : "This wipes balances, accounts, income, bills, and every transaction. The wallet itself stays. This cannot be undone."));
  if (!first) return false;
  const typed = window.prompt(locale === "ar" ? "اكتب تصفير للتأكيد" : "Type RESET to confirm", "");
  if ((locale === "ar" && typed !== "تصفير") || (locale !== "ar" && typed !== "RESET")) {
    if (typed != null && typed !== "") {
      window.alert(locale === "ar" ? "لم يُطابق النص. أُلغي التصفير." : "Confirmation text did not match. Reset cancelled.");
    }
    return false;
  }
  const response = await apiFetch("/api/dashboard", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "resetWalletData", idempotencyKey: crypto.randomUUID(), spaceId, confirm: "RESET" }),
  });
  const result = await response.json() as Record<string, unknown> & { error?: string };
  if (!response.ok) {
    window.alert(result.error ?? "FAILED");
    return false;
  }
  onChanged(result);
  return true;
}

type LinkedSpace = { id: string; name_ar: string; name_en: string; type: string; balance_minor: number; status?: string; currency?: string };
type SpaceLink = { hub_space_id: string; linked_space_id: string; status: string };
type SpaceBankLink = { hub_space_id: string; linked_space_id: string; account_id: string };

function spaceTitle(space: LinkedSpace, locale: Locale) {
  return locale === "ar" ? space.name_ar : space.name_en;
}

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
  category?: string | null;
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
  rule_category?: string | null;
};

function money(minor: number, locale: Locale) {
  return formatMoneyMinor(minor, "OMR", locale);
}

type PersonalSection = "overview" | "income" | "spend" | "months" | "activity";

function laneOf(kind?: string | null) {
  return kind === "income" ? "is-income" : "is-spend";
}

function PersonalSectionNav({
  locale,
  section,
  onChange,
  counts,
}: {
  locale: Locale;
  section: PersonalSection;
  onChange: (next: PersonalSection) => void;
  counts: { income: number; spend: number; months: number; pending: number };
}) {
  const items: Array<{ id: PersonalSection; ar: string; en: string; tone?: "income" | "spend"; count?: number }> = [
    { id: "overview", ar: "نظرة عامة", en: "Overview" },
    { id: "income", ar: "الدخل", en: "Income", tone: "income", count: counts.income },
    { id: "spend", ar: "المصروف", en: "Spend", tone: "spend", count: counts.spend },
    { id: "months", ar: "الأشهر", en: "Months", count: counts.pending || counts.months },
    { id: "activity", ar: "المعاملات", en: "Activity" },
  ];
  return (
    <nav className="personal-section-nav" aria-label={locale === "ar" ? "أقسام المحفظة الشخصية" : "Personal wallet sections"}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`${item.tone ? `is-${item.tone}` : ""}${section === item.id ? " active" : ""}`.trim()}
          aria-current={section === item.id ? "page" : undefined}
          onClick={() => onChange(item.id)}
        >
          {locale === "ar" ? item.ar : item.en}
          {item.count ? <em>{item.count}</em> : null}
        </button>
      ))}
    </nav>
  );
}

function printOccurrenceStatement(item: PersonalOccurrence, locale: Locale, entityName: string) {
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
        ["التصنيف", personalCategoryLabel(item.rule_kind === "income" ? "income" : "expense", item.rule_category, "ar", item.rule_name)],
        ["الالتزام", money(expected, locale)],
        ["المدفوع", money(actual, locale)],
        ["الفرق", delta === 0 ? "لا يوجد" : `${delta > 0 ? "زيادة" : "نقص"} ${money(Math.abs(delta), locale)}`],
      ]
    : [
        ["Item", item.rule_name ?? ""],
        ["Month", item.period_key],
        ["Due", formatDue(item.due_at) || item.due_at.slice(0, 10)],
        ["Type", item.rule_kind === "income" ? "Income" : "Expense"],
        ["Category", personalCategoryLabel(item.rule_kind === "income" ? "income" : "expense", item.rule_category, "en", item.rule_name)],
        ["Commitment", money(expected, locale)],
        ["Paid", money(actual, locale)],
        ["Variance", delta === 0 ? "None" : `${delta > 0 ? "Over" : "Short"} ${money(Math.abs(delta), locale)}`],
      ];
  const table = `<section><table>${rows.map((row) => `<tr><td>${escapeHtml(row[0])}</td><td>${escapeHtml(row[1])}</td></tr>`).join("")}</table></section>`;
  void consumePlanQuota("print", locale, item.space_id).then((quota) => {
    if (!quota.ok) return;
    void printWazenHtml((logoUrl) => wrapPrintDocument({
      locale,
      title,
      entityName,
      logoUrl,
      bodyHtml: table,
    }), true);
  });
}

export function PersonalWalletPanel({
  spaceId,
  locale,
  accounts,
  rules,
  occurrences,
  transactions = [],
  spaces = [],
  spaceLinks = [],
  spaceBankLinks = [],
  members = [],
  issuerName = "WAZEN",
  overviewExtra,
  activity,
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
    member_id?: string | null;
    account_id?: string | null;
    allocation?: string;
  }>;
  members?: Array<{ id: string; space_id: string; display_name: string }>;
  issuerName?: string;
  spaces?: LinkedSpace[];
  spaceLinks?: SpaceLink[];
  spaceBankLinks?: SpaceBankLink[];
  overviewExtra?: ReactNode;
  activity?: ReactNode;
  onChanged: (next: Record<string, unknown>) => void;
}) {
  const [accountOpen, setAccountOpen] = useState<PersonalAccount | true | null>(null);
  const [section, setSection] = useState<PersonalSection>("overview");
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(`wazen-personal-section:${spaceId}`);
      if (stored === "overview" || stored === "income" || stored === "spend" || stored === "months" || stored === "activity") {
        setSection(stored);
      }
    } catch { /* ignore */ }
  }, [spaceId]);
  const changeSection = (next: PersonalSection) => {
    setSection(next);
    try { sessionStorage.setItem(`wazen-personal-section:${spaceId}`, next); } catch { /* ignore */ }
  };
  const holdings = spaceBankLinks
    .filter((row) => row.hub_space_id === spaceId)
    .map((row) => {
      const space = spaces.find((item) => item.id === row.linked_space_id);
      return { spaceId: row.linked_space_id, accountId: row.account_id, balanceMinor: Number(space?.balance_minor ?? 0), name: space ? spaceTitle(space, locale) : row.linked_space_id };
    });

  const spaceAccounts = accounts.filter((item) => item.space_id === spaceId);
  const activeAccounts = spaceAccounts.filter((item) => (item.status ?? "active") === "active");
  const statementSpaces = spaces.map((item) => ({
    id: item.id,
    name_ar: item.name_ar,
    name_en: item.name_en,
    type: item.type,
    currency: item.currency ?? "OMR",
    balance_minor: item.balance_minor,
  }));
  const printWallet = (accountId?: string) => {
    void consumePlanQuota("print", locale, spaceId).then((quota) => {
      if (!quota.ok) return;
      void printWazenHtml((logoUrl) => buildAccountStatementHtml({
      locale,
      logoUrl,
      issuerName,
      spaces: statementSpaces,
      members,
      accounts: spaceAccounts,
      transactions: transactions.map((txn) => ({
        ...txn,
        description_ar: txn.description_ar ?? "",
        description_en: txn.description_en ?? "",
      })),
      occurrences,
      spaceId,
      accountId: accountId ?? null,
    }), true);
    });
  };
  const spaceRules = rules.filter((item) => item.space_id === spaceId);
  const spaceOcc = occurrences
    .filter((item) => item.space_id === spaceId)
    .map((item) => ({ ...item, status: occurrenceLedgerStatus(item, transactions) }));
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
  const monthlyRules = spaceRules.filter((rule) => rule.status === "active" && (rule.schedule ?? "monthly") === "monthly");
  const incomeCount = monthlyRules.filter((rule) => rule.kind === "income").length + unscheduled.length;
  const spendCount = monthlyRules.filter((rule) => rule.kind !== "income").length;
  const pendingCount = spaceOcc.filter((row) => row.status === "pending").length;
  const walletName = spaceTitle(spaces.find((row) => row.id === spaceId) ?? { id: spaceId, name_ar: "وازن", name_en: "WAZEN", type: "personal", balance_minor: 0 }, locale);
  const renderPosted = (item: PersonalOccurrence) => {
    const income = item.rule_kind === "income";
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
      <div className={`personal-rule-row ${laneOf(item.rule_kind)}${["voided", "superseded", "skipped"].includes(item.status) ? " is-inactive" : ""}`} key={item.id}>
        <div>
          <strong>{item.rule_name}</strong>
          <span>
            {statusLabel}
            {` · ${personalCategoryLabel(income ? "income" : "expense", item.rule_category, locale, item.rule_name)}`}
            {showVariance ? ` · ${occurrenceVarianceCopy(expected, actual, locale)}` : ""}
          </span>
        </div>
        <b className={`personal-lane-amount ${laneOf(item.rule_kind)}`}>{income ? "+" : "−"}{money(actual, locale)}</b>
        {item.status === "posted" && (
          <button type="button" className="secondary-button compact" onClick={() => printOccurrenceStatement(item, locale, walletName)}>
            <Printer size={14} />{locale === "ar" ? "كشف البند" : "Item statement"}
          </button>
        )}
      </div>
    );
  };
  return (
    <div className="personal-workspace">
      <PersonalSectionNav
        locale={locale}
        section={section}
        onChange={changeSection}
        counts={{ income: incomeCount, spend: spendCount, months: byMonth.size, pending: pendingCount }}
      />
      {section === "overview" && (
        <>
          {overviewExtra}
          <CollapsiblePanel
            id={`${spaceId}:accounts`}
            heading={<><span className="section-kicker"><WalletCards size={15} />{locale === "ar" ? "حساباتك" : "Your accounts"}</span><h2>{locale === "ar" ? "البنوك والنقد" : "Banks and cash"}</h2></>}
            actions={<><button type="button" className="secondary-button" onClick={() => printWallet()}><Printer size={15} />{locale === "ar" ? "كشف المحفظة" : "Wallet statement"}</button><button type="button" className="primary-button" onClick={() => setAccountOpen(true)}><Plus size={15} />{locale === "ar" ? "إضافة حساب" : "Add account"}</button></>}
            foldLabel={locale === "ar" ? "طي الحسابات" : "Fold accounts"}
          >
            <p className="modal-note">{locale === "ar" ? "كل حساب منفصل. الرصيد الافتتاحي هو ما لديك الآن. الدخل والمصروف لكل منهما صفحة خاصة، والمعاملات في تبويب منفصل." : "Each account is separate. Opening is what you hold now. Income, spend, and transactions each have their own page."}</p>
            <div className="personal-account-grid">
              {spaceAccounts.map((account) => (
                <AccountCard
                  key={account.id}
                  account={account}
                  locale={locale}
                  holdings={holdingsForAccount(account.id, holdings).map((row) => ({ name: row.name ?? row.spaceId, balanceMinor: row.balanceMinor }))}
                  onEdit={() => setAccountOpen(account)}
                  onPause={() => void mutateAccount(account.id, (account.status ?? "active") === "paused" ? "active" : "paused")}
                  onArchive={() => void mutateAccount(account.id, (account.status ?? "active") === "archived" ? "active" : "archived")}
                  onDelete={() => void removeAccount(account.id)}
                  onPrint={() => printWallet(account.id)}
                />
              ))}
              {!spaceAccounts.length && <p className="empty-state">{locale === "ar" ? "أضف حساب بنك نزوى أو مسقط أو النقد أولاً." : "Add Bank Nizwa, Muscat, or cash first."}</p>}
            </div>
          </CollapsiblePanel>
          <WalletLinksPanel
            spaceId={spaceId}
            locale={locale}
            accounts={activeAccounts}
            spaces={spaces}
            spaceLinks={spaceLinks}
            spaceBankLinks={spaceBankLinks}
            onChanged={onChanged}
          />
          <PersonalCoachPanel locale={locale} spaceId={spaceId} rules={spaceRules} occurrences={spaceOcc} />
        </>
      )}
      {section === "income" && (
        <>
          <RecurringBillsPanel
            spaceId={spaceId}
            locale={locale}
            focus="income"
            accounts={activeAccounts}
            rules={spaceRules}
            occurrences={spaceOcc}
            onChanged={onChanged}
          />
          {unscheduled.length > 0 && (
            <CollapsiblePanel id={`${spaceId}:unscheduled`} className="panel personal-lane-panel is-income" heading={<h2>{locale === "ar" ? "دخل آخر بدون موعد" : "Other income — no due date"}</h2>} foldLabel={locale === "ar" ? "طي الدخل الآخر" : "Fold other income"}>
              {unscheduled.map((rule) => (
                <UnscheduledRow key={rule.id} rule={rule} locale={locale} onChanged={onChanged} />
              ))}
            </CollapsiblePanel>
          )}
        </>
      )}
      {section === "spend" && (
        <RecurringBillsPanel
          spaceId={spaceId}
          locale={locale}
          focus="spend"
          accounts={activeAccounts}
          rules={spaceRules}
          occurrences={spaceOcc}
          onChanged={onChanged}
        />
      )}
      {section === "months" && (
        <CollapsiblePanel
          id={`${spaceId}:months`}
          heading={<><span className="section-kicker">{locale === "ar" ? "حساب الأشهر" : "Month ledgers"}</span><h2>{locale === "ar" ? "الدخل على اليمين أو في عمود أخضر، والمصروف في عمود أحمر" : "Income in the green column, spend in the rose column"}</h2></>}
          foldLabel={locale === "ar" ? "طي حساب الأشهر" : "Fold month ledgers"}
        >
          {byMonth.size ? [...byMonth.entries()].map(([period, rows]) => {
            const postedIn = rows.filter((row) => row.rule_kind === "income" && row.status === "posted").reduce((sum, row) => sum + Number(row.actual_minor ?? row.expected_minor), 0);
            const postedOut = rows.filter((row) => row.rule_kind !== "income" && row.status === "posted").reduce((sum, row) => sum + Number(row.actual_minor ?? row.expected_minor), 0);
            const pendingIn = rows.filter((row) => row.rule_kind === "income" && row.status === "pending").reduce((sum, row) => sum + Number(row.expected_minor), 0);
            const pendingOut = rows.filter((row) => row.rule_kind !== "income" && row.status === "pending").reduce((sum, row) => sum + Number(row.expected_minor), 0);
            const incomeRows = rows.filter((row) => row.rule_kind === "income");
            const spendRows = rows.filter((row) => row.rule_kind !== "income");
            return (
              <FoldWrap key={period} id={`${spaceId}:month:${period}`} label={locale === "ar" ? `طي ${period}` : `Fold ${period}`}>
              <div className="personal-month-block">
                <div className="personal-month-head">
                  <strong>{period}</strong>
                  <span>
                    <b className="personal-lane-amount is-income">{locale === "ar" ? "دخل" : "In"} {money(postedIn, locale)}</b>
                    {" · "}
                    <b className="personal-lane-amount is-spend">{locale === "ar" ? "صرف" : "Out"} {money(postedOut, locale)}</b>
                    {" · "}
                    {locale === "ar" ? `متبقي ${money(postedIn - postedOut, locale)}` : `left ${money(postedIn - postedOut, locale)}`}
                    {pendingIn || pendingOut
                      ? (locale === "ar" ? ` · معلّق دخل ${money(pendingIn, locale)} · خصم ${money(pendingOut, locale)}` : ` · pending in ${money(pendingIn, locale)} · out ${money(pendingOut, locale)}`)
                      : ""}
                  </span>
                </div>
                <div className="personal-month-lanes">
                  <section className="personal-lane is-income">
                    <h3>{locale === "ar" ? "الدخل" : "Income"}</h3>
                    <div className="personal-occ-list">
                      {incomeRows.filter((row) => row.status === "pending").map((item) => (
                        <OccurrenceRow key={item.id} item={item} locale={locale} accounts={activeAccounts} onChanged={onChanged} />
                      ))}
                      {incomeRows.filter((row) => row.status !== "pending").map(renderPosted)}
                      {!incomeRows.length && <p className="empty-state">{locale === "ar" ? "لا دخل في هذا الشهر." : "No income this month."}</p>}
                    </div>
                  </section>
                  <section className="personal-lane is-spend">
                    <h3>{locale === "ar" ? "المصروف" : "Spend"}</h3>
                    <div className="personal-occ-list">
                      {spendRows.filter((row) => row.status === "pending").map((item) => (
                        <OccurrenceRow key={item.id} item={item} locale={locale} accounts={activeAccounts} onChanged={onChanged} />
                      ))}
                      {spendRows.filter((row) => row.status !== "pending").map(renderPosted)}
                      {!spendRows.length && <p className="empty-state">{locale === "ar" ? "لا مصروف في هذا الشهر." : "No spend this month."}</p>}
                    </div>
                  </section>
                </div>
              </div>
              </FoldWrap>
            );
          }) : <p className="empty-state">{locale === "ar" ? "لا أشهر بعد. أضف دخلاً أو مصروفاً ثابتاً ليظهر هنا كل شهر." : "No months yet. Add fixed income or spend so each month appears here."}</p>}
        </CollapsiblePanel>
      )}
      {section === "activity" && (activity ?? <p className="empty-state">{locale === "ar" ? "لا معاملات في هذه المحفظة بعد." : "No transactions in this wallet yet."}</p>)}

      {accountOpen && <AccountModal locale={locale} spaceId={spaceId} existing={accountOpen === true ? undefined : accountOpen} onClose={() => setAccountOpen(null)} onChanged={(next) => { onChanged(next); setAccountOpen(null); }} />}
    </div>
  );
}

function CategoryField({
  locale,
  kind,
  value,
  onChange,
}: {
  locale: Locale;
  kind: "income" | "expense";
  value: string;
  onChange: (next: string) => void;
}) {
  const presets = presetsForKind(kind);
  const known = presets.some((preset) => preset.id === value);
  const selectValue = known ? value : (value ? "custom" : (kind === "income" ? "salary" : "other_expense"));
  return (
    <>
      <label>
        <span>{kind === "income" ? (locale === "ar" ? "تصنيف الدخل" : "Income category") : (locale === "ar" ? "تصنيف المصروف" : "Expense category")}</span>
        <select
          value={selectValue}
          onChange={(event) => {
            const next = event.target.value;
            if (next === "custom") onChange(value && !known ? value : "");
            else onChange(next);
          }}
        >
          {presets.map((preset) => <option key={preset.id} value={preset.id}>{locale === "ar" ? preset.ar : preset.en}</option>)}
          <option value="custom">{locale === "ar" ? "تسمية أخرى…" : "Custom name…"}</option>
        </select>
      </label>
      {selectValue === "custom" && (
        <label>
          <span>{locale === "ar" ? "المسمّى" : "Label"}</span>
          <input
            required
            maxLength={40}
            value={known ? "" : value}
            onChange={(event) => onChange(event.target.value.slice(0, 40))}
            placeholder={kind === "income" ? (locale === "ar" ? "دخل إيجار" : "Rental income") : (locale === "ar" ? "مصاريف السفر" : "Travel")}
          />
        </label>
      )}
    </>
  );
}

function PersonalCoachPanel({
  locale,
  spaceId,
  rules,
  occurrences,
}: {
  locale: Locale;
  spaceId: string;
  rules: PersonalRule[];
  occurrences: PersonalOccurrence[];
}) {
  const briefing = useMemo(
    () => buildPersonalCoachBriefing({ rules, occurrences }),
    [rules, occurrences],
  );
  const gap = briefing.plannedLeftMinor;
  return (
    <CollapsiblePanel
      id={`${spaceId}:coach`}
      heading={<><span className="section-kicker"><Sparkles size={15} />{locale === "ar" ? "تقرير وتوفير" : "Report & savings"}</span><h2>{locale === "ar" ? "الدخل مقابل المصروف هذا الشهر، والثغرات، ونصائح عملية" : "This month’s income vs spend, gaps, and practical tips"}</h2></>}
      foldLabel={locale === "ar" ? "طي التقرير" : "Fold report"}
    >
      <div className="personal-coach-metrics">
        <div className="personal-coach-metric is-income">
          <span>{locale === "ar" ? "دخل مبرمج" : "Planned in"}</span>
          <b className="personal-lane-amount is-income">+{money(briefing.plannedInMinor, locale)}</b>
        </div>
        <div className="personal-coach-metric is-spend">
          <span>{locale === "ar" ? "صرف مبرمج" : "Planned out"}</span>
          <b className="personal-lane-amount is-spend">−{money(briefing.plannedOutMinor, locale)}</b>
        </div>
        <div className={`personal-coach-metric${gap < 0 ? " is-danger" : gap > 0 ? " is-ok" : ""}`}>
          <span>{locale === "ar" ? "الفائض / الثغرة" : "Surplus / gap"}</span>
          <b>{money(gap, locale)}</b>
        </div>
        <div className="personal-coach-metric">
          <span>{locale === "ar" ? "هامش التوفير" : "Savings rate"}</span>
          <b>{briefing.savingsRate}%</b>
        </div>
      </div>
      <ul className="personal-coach-tips">
        {briefing.tips.map((tip) => (
          <li key={tip.id} className={`personal-coach-tip is-${tip.severity}`}>{locale === "ar" ? tip.ar : tip.en}</li>
        ))}
      </ul>
    </CollapsiblePanel>
  );
}

function RecurringBillsPanel({
  spaceId,
  locale,
  focus,
  accounts,
  rules,
  occurrences,
  onChanged,
}: {
  spaceId: string;
  locale: Locale;
  focus: "income" | "spend";
  accounts: PersonalAccount[];
  rules: PersonalRule[];
  occurrences: PersonalOccurrence[];
  onChanged: (next: Record<string, unknown>) => void;
}) {
  const [open, setOpen] = useState<"installment" | "bill" | "income" | null>(null);
  const [editRule, setEditRule] = useState<PersonalRule | null>(null);
  const monthly = rules.filter((rule) => rule.space_id === spaceId && rule.status === "active" && (rule.schedule ?? "monthly") === "monthly");
  const incomes = monthly.filter((rule) => rule.kind === "income");
  const expenses = monthly.filter((rule) => rule.kind !== "income");
  const incomeFocus = focus === "income";
  const renderRow = (rule: PersonalRule) => {
    const paid = Number(rule.paid_minor);
    const total = Number(rule.total_minor);
    const left = Math.max(0, total - paid);
    const next = occurrences
      .filter((row) => row.rule_id === rule.id && row.status === "pending")
      .sort((a, b) => a.due_at.localeCompare(b.due_at))[0];
    const dueLabel = rule.due_day >= 29 ? (locale === "ar" ? "آخر الشهر" : "month-end") : (locale === "ar" ? `يوم ${rule.due_day}` : `day ${rule.due_day}`);
    const cat = personalCategoryLabel(rule.kind === "income" ? "income" : "expense", rule.category, locale, rule.name);
    const income = rule.kind === "income";
    return (
      <div className={`personal-loan-row ${laneOf(rule.kind)}`} key={rule.id}>
        <div>
          <strong>{rule.name} <em className={`personal-cat-chip ${laneOf(rule.kind)}`}>{cat}</em></strong>
          <span>
            {income
              ? (locale === "ar" ? `دخل ثابت ${money(rule.amount_minor, locale)} ${dueLabel}` : `Fixed income ${money(rule.amount_minor, locale)} ${dueLabel}`)
              : total > 0
                ? (locale === "ar" ? `مدفوع ${money(paid, locale)} · متبقي ${money(left, locale)} · القسط ${money(rule.amount_minor, locale)} ${dueLabel}` : `Paid ${money(paid, locale)} · remaining ${money(left, locale)} · ${money(rule.amount_minor, locale)} ${dueLabel}`)
                : (locale === "ar" ? `دفع متكرر ${money(rule.amount_minor, locale)} ${dueLabel}` : `Recurring ${money(rule.amount_minor, locale)} ${dueLabel}`)}
            {next ? (locale === "ar" ? ` · القادم ${next.due_at.slice(0, 10)}` : ` · next ${next.due_at.slice(0, 10)}`) : ""}
          </span>
        </div>
        <div className="progress-track">{!income && total > 0 ? <span style={{ width: `${Math.min(100, Math.round((paid / total) * 100))}%` }} /> : null}</div>
        <b className={`personal-lane-amount ${laneOf(rule.kind)}`}>{income ? `+${money(rule.amount_minor, locale)}` : total > 0 ? `${Math.min(100, Math.round((paid / total) * 100))}%` : `−${money(rule.amount_minor, locale)}`}</b>
        <button type="button" className="secondary-button compact" title={locale === "ar" ? "تعديل" : "Edit"} onClick={() => setEditRule(rule)}><Pencil size={14} /></button>
      </div>
    );
  };
  return (
    <CollapsiblePanel
      id={`${spaceId}:recurring:${focus}`}
      className={`panel personal-lane-panel ${incomeFocus ? "is-income" : "is-spend"}`}
      heading={<><span className="section-kicker"><Bell size={15} />{incomeFocus ? (locale === "ar" ? "صفحة الدخل" : "Income page") : (locale === "ar" ? "صفحة المصروف" : "Spend page")}</span><h2>{incomeFocus ? (locale === "ar" ? "رواتب ودخل ثابت فقط — بلا فواتير هنا" : "Salaries and fixed income only — no bills here") : (locale === "ar" ? "فواتير وأقساط فقط — بلا دخل هنا" : "Bills and installments only — no income here")}</h2></>}
      actions={
        incomeFocus
          ? <button type="button" className="primary-button" onClick={() => setOpen("income")}><Banknote size={15} />{locale === "ar" ? "دخل شهري ثابت" : "Monthly income"}</button>
          : (
            <>
              <button type="button" className="secondary-button" onClick={() => setOpen("bill")}><Repeat2 size={15} />{locale === "ar" ? "فاتورة شهرية" : "Monthly bill"}</button>
              <button type="button" className="primary-button" onClick={() => setOpen("installment")}><Plus size={15} />{locale === "ar" ? "قسط / تمويل" : "Installment"}</button>
            </>
          )
      }
      foldLabel={incomeFocus ? (locale === "ar" ? "طي الدخل" : "Fold income") : (locale === "ar" ? "طي المصروف" : "Fold spend")}
    >
      <p className="modal-note">
        {incomeFocus
          ? (locale === "ar" ? "مثال: راتب 1200 يوم 1. النظام يولّد الاستحقاق كل شهر، وأنت تعتمد الدخل أو تؤجله أو تتجاهله." : "Example: salary 1200 on day 1. Wazen creates the month; you approve, defer, or skip.")
          : (locale === "ar" ? "مثال: سيارة 9000 بقسط 98 يوم 28، أو كهرباء 26 بداية الشهر. التذكير قبل يوم وفي يوم الاستحقاق." : "Example: a 9000 car at 98 on the 28th, or a 26 electricity bill at month start. Reminders the day before and on the due day.")}
      </p>
      {incomeFocus ? (
        <>
          <h3 className="personal-cashflow-heading is-income">{locale === "ar" ? "دخل شهري ثابت" : "Fixed monthly income"}</h3>
          <div className="personal-loan-list">
            {incomes.map(renderRow)}
            {!incomes.length && <p className="empty-state">{locale === "ar" ? "لا دخل شهري بعد. أضف راتباً أو دخلاً تجارياً ليظهر كل شهر للاعتماد." : "No monthly income yet. Add a salary or business income so each month waits for approval."}</p>}
          </div>
        </>
      ) : (
        <>
          <h3 className="personal-cashflow-heading is-spend">{locale === "ar" ? "أقساط وفواتير متكررة" : "Installments & recurring bills"}</h3>
          <div className="personal-loan-list">
            {expenses.map(renderRow)}
            {!expenses.length && <p className="empty-state">{locale === "ar" ? "لا أقساط أو فواتير بعد. أضف قسط سيارة أو فاتورة كهرباء من الأزرار أعلاه." : "No installments or bills yet. Add a car plan or electricity bill from the buttons above."}</p>}
          </div>
        </>
      )}
      {open && (
        <RecurringBillModal
          locale={locale}
          spaceId={spaceId}
          purpose={open}
          accounts={accounts}
          onClose={() => setOpen(null)}
          onChanged={(next) => { onChanged(next); setOpen(null); }}
        />
      )}
      {editRule && (
        <RuleModal
          locale={locale}
          spaceId={spaceId}
          kind={editRule.kind === "income" ? "income" : "expense"}
          schedule={(editRule.schedule === "once" || editRule.schedule === "unscheduled" ? editRule.schedule : "monthly")}
          amountMode={editRule.amount_mode === "variable" ? "variable" : "fixed"}
          accounts={accounts}
          existing={editRule}
          onClose={() => setEditRule(null)}
          onChanged={(next) => { onChanged(next); setEditRule(null); }}
        />
      )}
    </CollapsiblePanel>
  );
}

function RecurringBillModal({
  locale,
  spaceId,
  purpose,
  accounts,
  onClose,
  onChanged,
}: {
  locale: Locale;
  spaceId: string;
  purpose: "installment" | "bill" | "income";
  accounts: PersonalAccount[];
  onClose: () => void;
  onChanged: (next: Record<string, unknown>) => void;
}) {
  const installment = purpose === "installment";
  const income = purpose === "income";
  const kind: "income" | "expense" = income ? "income" : "expense";
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [total, setTotal] = useState("");
  const [dueDay, setDueDay] = useState(installment ? "28" : "1");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [startsAt, setStartsAt] = useState(new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState(income ? "salary" : installment ? "installments" : "other_expense");
  const [saving, setSaving] = useState(false);
  const title = income
    ? (locale === "ar" ? "دخل شهري ثابت" : "Fixed monthly income")
    : installment
      ? (locale === "ar" ? "قسط أو تمويل" : "Installment or loan")
      : (locale === "ar" ? "فاتورة شهرية متكررة" : "Recurring monthly bill");
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
        amountMode: "fixed",
        schedule: "monthly",
        amount: amount || undefined,
        total: installment ? (total || undefined) : undefined,
        dueDay: Number(dueDay) || 1,
        startsAt,
        category: category || inferPersonalCategory(kind, name),
      }),
    });
    const result = await response.json() as Record<string, unknown> & { error?: string };
    setSaving(false);
    if (!response.ok) {
      window.alert(result.error === "INVALID_AMOUNT" ? (locale === "ar" ? "أدخل مبلغاً صحيحاً." : "Enter a valid amount.") : (result.error ?? "FAILED"));
      return;
    }
    onChanged(result);
  };
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal-card" role="dialog">
        <div className="modal-header"><h2>{title}</h2><button type="button" onClick={onClose}><X size={20} /></button></div>
        <form className="modal-form" onSubmit={(event) => void submit(event)}>
          <label><span>{locale === "ar" ? "الاسم" : "Name"}</span><input required value={name} onChange={(event) => setName(event.target.value)} placeholder={income ? (locale === "ar" ? "راتب / دخل تجاري" : "Salary / business") : installment ? (locale === "ar" ? "سيارة / قسط المدرسة" : "Car / school plan") : (locale === "ar" ? "كهرباء / ماء / هاتف" : "Electricity / water / phone")} /></label>
          <CategoryField locale={locale} kind={kind} value={category} onChange={setCategory} />
          {installment && <label><span>{locale === "ar" ? "إجمالي المبلغ" : "Total amount"}</span><div className="money-input"><input required type="number" min="0.001" step="0.001" value={total} onChange={(event) => setTotal(event.target.value)} /><b className="money-currency"><OmrSymbol size={14} /></b></div></label>}
          <label><span>{income ? (locale === "ar" ? "المبلغ كل شهر" : "Amount each month") : installment ? (locale === "ar" ? "القسط الشهري" : "Monthly installment") : (locale === "ar" ? "المبلغ كل شهر" : "Amount each month")}</span><div className="money-input"><input required type="number" min="0.001" step="0.001" value={amount} onChange={(event) => setAmount(event.target.value)} /><b className="money-currency"><OmrSymbol size={14} /></b></div></label>
          <label><span>{income ? (locale === "ar" ? "يوم الاستحقاق كل شهر (1 بداية الشهر، 31 آخر يوم)" : "Due day each month (1 = start, 31 = last day)") : (locale === "ar" ? "يوم الدفع كل شهر (1 بداية الشهر، 31 آخر يوم)" : "Pay day each month (1 = start, 31 = last day)")}</span>
            <input required type="number" min="1" max="31" value={dueDay} onChange={(event) => setDueDay(event.target.value)} />
          </label>
          <label><span>{locale === "ar" ? "يبدأ من" : "Starts"}</span><DateField required value={startsAt} onChange={setStartsAt} /></label>
          <label><span>{income ? (locale === "ar" ? "يُضاف إلى الحساب" : "Credit account") : (locale === "ar" ? "يُخصم من الحساب" : "Debit account")}</span>
            <select value={accountId} onChange={(event) => setAccountId(event.target.value)}>
              <option value="">{locale === "ar" ? "بدون ربط" : "Unlinked"}</option>
              {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
            </select>
          </label>
          <p className="modal-note">{locale === "ar" ? "يظهر التذكير في المحفظة، ويُرسل بالبريد وواتساب قبل يوم وفي يوم الاستحقاق. بعد وصول المبلغ أو الدفع اضغط اعتماد الدخل أو اعتماد الخصم، أو أجّل، أو تجاهل." : "Reminders appear in the wallet and go out by email and WhatsApp the day before and on the due day. When the money arrives or you pay, approve, defer, or skip."}</p>
          <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>{locale === "ar" ? "إلغاء" : "Cancel"}</button><button className="primary-button" disabled={saving}>{saving ? "…" : (locale === "ar" ? "حفظ العملية" : "Save")}</button></div>
        </form>
      </section>
    </div>
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
  const [ruleOpen, setRuleOpen] = useState<{ kind: "income" | "expense"; schedule: "monthly" | "once" | "unscheduled"; amountMode: "fixed" | "variable"; existing?: PersonalRule } | null>(null);
  const spaceRules = rules.filter((item) => item.space_id === spaceId);
  const activeAccounts = accounts.filter((item) => item.space_id === spaceId && (item.status ?? "active") === "active");
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
          <div className={`personal-rule-row ${laneOf(rule.kind)} ${rule.status !== "active" ? "is-paused" : ""}`} key={rule.id}>
            <div>
              <strong>{rule.name} <em className={`personal-cat-chip ${laneOf(rule.kind)}`}>{personalCategoryLabel(rule.kind === "income" ? "income" : "expense", rule.category, locale, rule.name)}</em></strong>
              <span>{rule.kind === "income" ? (locale === "ar" ? "دخل" : "Income") : (locale === "ar" ? "مصروف" : "Expense")} · {(rule.schedule ?? "monthly") === "once" ? (locale === "ar" ? `مجدول ${rule.starts_at.slice(0, 7)}` : `scheduled ${rule.starts_at.slice(0, 7)}`) : (rule.schedule ?? "monthly") === "unscheduled" ? (locale === "ar" ? "بدون موعد" : "no date") : (rule.amount_mode === "variable" ? (locale === "ar" ? "متغير شهرياً" : "variable monthly") : (locale === "ar" ? "ثابت شهرياً" : "fixed monthly"))}{rule.status === "paused" ? (locale === "ar" ? " · متوقف" : " · paused") : rule.status === "archived" ? (locale === "ar" ? " · مؤرشف" : " · archived") : ""}</span>
            </div>
            <b className={`personal-lane-amount ${laneOf(rule.kind)}`}>{rule.amount_minor ? `${rule.kind === "income" ? "+" : "−"}${money(rule.amount_minor, locale)}` : (locale === "ar" ? "يُدخل عند الترحيل" : "enter when posting")}</b>
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
    </div>
  );
}

function WalletLinksPanel({
  spaceId,
  locale,
  accounts,
  spaces,
  spaceLinks,
  spaceBankLinks,
  onChanged,
}: {
  spaceId: string;
  locale: Locale;
  accounts: PersonalAccount[];
  spaces: LinkedSpace[];
  spaceLinks: SpaceLink[];
  spaceBankLinks: SpaceBankLink[];
  onChanged: (next: Record<string, unknown>) => void;
}) {
  const linkedIds = new Set(spaceLinks.filter((row) => row.hub_space_id === spaceId && row.status === "active").map((row) => row.linked_space_id));
  const linkedSpaces = spaces.filter((space) => linkedIds.has(space.id));
  const available = spaces.filter((space) => space.id !== spaceId && (space.status ?? "active") !== "archived" && !linkedIds.has(space.id));
  const [pickId, setPickId] = useState(available[0]?.id ?? "");
  const [transferSpace, setTransferSpace] = useState(linkedSpaces[0]?.id ?? "");
  const [transferAccount, setTransferAccount] = useState(accounts[0]?.id ?? "");
  const [direction, setDirection] = useState<"to_linked" | "to_hub">("to_linked");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const typeLabel = (type: string) => {
    const map: Record<string, [string, string]> = {
      personal: ["شخصية", "personal"],
      household: ["منزل", "household"],
      trip: ["سفر", "trip"],
      society: ["جمعية", "society"],
      group: ["مجموعة", "group"],
    };
    const pair = map[type] ?? [type, type];
    return locale === "ar" ? pair[0] : pair[1];
  };
  const post = async (body: Record<string, unknown>) => {
    setBusy(true);
    const response = await apiFetch("/api/dashboard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, idempotencyKey: crypto.randomUUID() }) });
    const result = await response.json() as Record<string, unknown> & { error?: string };
    setBusy(false);
    if (!response.ok) {
      const code = result.error ?? "FAILED";
      const messages: Record<string, string> = locale === "ar"
        ? { INSUFFICIENT_FUNDS: "الرصيد لا يكفي لهذا التحويل.", WALLET_NOT_LINKED: "اربط المحفظة أولاً.", WALLET_ALREADY_LINKED: "هذه المحفظة مربوطة مسبقاً.", CANNOT_LINK_SELF: "لا يمكن ربط المحفظة بنفسها." }
        : { INSUFFICIENT_FUNDS: "Not enough balance for this transfer.", WALLET_NOT_LINKED: "Link the wallet first.", WALLET_ALREADY_LINKED: "This wallet is already linked.", CANNOT_LINK_SELF: "A wallet cannot link to itself." };
      window.alert(messages[code] ?? code);
      return;
    }
    onChanged(result);
  };
  return (
    <CollapsiblePanel
      id={`${spaceId}:links`}
      heading={<><span className="section-kicker"><Link2 size={15} />{locale === "ar" ? "ربط المحافظ" : "Linked wallets"}</span><h2>{locale === "ar" ? "فصل أموالك عن أموال المحافظ والجمعيات المرتبطة" : "Keep your money separate from linked wallets and associations"}</h2></>}
      foldLabel={locale === "ar" ? "طي الربط" : "Fold links"}
    >
      <p className="modal-note">
        {locale === "ar"
          ? "اربط محفظة الأطفال أو جمعية بحسابك البنكي. التحويل يخصم من أموالك ويضيف لمحفظتهم دون خلط الرصيد. على بطاقة الحساب يظهر: أموالك، ثم كل محفظة كم لها."
          : "Link a children’s wallet or association to your bank. Transfers move from your pile to theirs without mixing. The account card shows your money, then each wallet’s share."}
      </p>
      <div className="wallet-link-row">
        <select value={pickId} onChange={(event) => setPickId(event.target.value)} disabled={!available.length}>
          {!available.length && <option value="">{locale === "ar" ? "لا توجد محافظ أخرى للربط" : "No other wallets to link"}</option>}
          {available.map((space) => (
            <option key={space.id} value={space.id}>{spaceTitle(space, locale)} · {typeLabel(space.type)}</option>
          ))}
        </select>
        <button type="button" className="primary-button" disabled={busy || !pickId} onClick={() => void post({ action: "linkWallet", hubSpaceId: spaceId, linkedSpaceId: pickId })}>
          <Link2 size={14} />{locale === "ar" ? "ربط" : "Link"}
        </button>
      </div>
      <div className="personal-loan-list">
        {linkedSpaces.map((space) => {
          const bankId = spaceBankLinks.find((row) => row.hub_space_id === spaceId && row.linked_space_id === space.id)?.account_id ?? "";
          return (
            <div className="personal-loan-row" key={space.id}>
              <div>
                <strong>{spaceTitle(space, locale)}</strong>
                <span>{typeLabel(space.type)} · {locale === "ar" ? "رصيد المحفظة" : "wallet balance"} {money(space.balance_minor, locale)}</span>
              </div>
              <select value={bankId} onChange={(event) => void post({ action: "setWalletBankLink", hubSpaceId: spaceId, linkedSpaceId: space.id, accountId: event.target.value || null })}>
                <option value="">{locale === "ar" ? "بدون حساب بنكي" : "No bank account"}</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>{account.name}</option>
                ))}
              </select>
              <button type="button" className="secondary-button compact" disabled={busy} onClick={() => void post({ action: "unlinkWallet", hubSpaceId: spaceId, linkedSpaceId: space.id })}>
                <X size={14} />{locale === "ar" ? "فصل" : "Unlink"}
              </button>
            </div>
          );
        })}
        {!linkedSpaces.length && <p className="empty-state">{locale === "ar" ? "لا محافظ مربوطة بعد. أنشئ محفظة للأطفال أو جمعية ثم اربطها هنا." : "No linked wallets yet. Create a children’s wallet or association, then link it here."}</p>}
      </div>
      {linkedSpaces.length > 0 && accounts.length > 0 && (
        <div className="wallet-transfer-box">
          <strong>{locale === "ar" ? "تحويل بين حسابك والمحفظة المرتبطة" : "Transfer between your account and a linked wallet"}</strong>
          <div className="wallet-link-row">
            <select value={transferSpace} onChange={(event) => setTransferSpace(event.target.value)}>
              {linkedSpaces.map((space) => <option key={space.id} value={space.id}>{spaceTitle(space, locale)}</option>)}
            </select>
            <select value={transferAccount} onChange={(event) => setTransferAccount(event.target.value)}>
              {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
            </select>
            <select value={direction} onChange={(event) => setDirection(event.target.value as "to_linked" | "to_hub")}>
              <option value="to_linked">{locale === "ar" ? "من أموالي إلى المحفظة" : "From mine to wallet"}</option>
              <option value="to_hub">{locale === "ar" ? "من المحفظة إلى أموالي" : "From wallet to mine"}</option>
            </select>
            <div className="money-input"><input type="number" min="0.001" step="0.001" value={amount} onChange={(event) => setAmount(event.target.value)} /><b className="money-currency"><OmrSymbol size={12} /></b></div>
            <button type="button" className="primary-button" disabled={busy || !amount || !transferSpace} onClick={() => void post({ action: "transferLinkedFunds", hubSpaceId: spaceId, linkedSpaceId: transferSpace, accountId: transferAccount, direction, amount })}>
              {locale === "ar" ? "تحويل" : "Transfer"}
            </button>
          </div>
        </div>
      )}
    </CollapsiblePanel>
  );
}

function AccountCard({ account, locale, holdings = [], onEdit, onPause, onArchive, onDelete, onPrint }: { account: PersonalAccount; locale: Locale; holdings?: Array<{ name: string; balanceMinor: number }>; onEdit: () => void; onPause: () => void; onArchive: () => void; onDelete: () => void; onPrint?: () => void }) {
  const [unlocked, setUnlocked] = useState(false);
  const status = account.status ?? "active";
  const own = Number(account.balance_minor ?? account.opening_minor);
  const split = bankCustodySplit(own, holdings.map((row, index) => ({ spaceId: String(index), accountId: account.id, balanceMinor: row.balanceMinor, name: row.name })));
  return (
    <div className={`personal-account-card ${status !== "active" ? "is-paused" : ""}`}>
      <i><Banknote size={16} /></i>
      <div>
        <small>{account.kind === "cash" ? (locale === "ar" ? "نقد" : "Cash") : account.kind === "wallet" ? (locale === "ar" ? "محفظة" : "Wallet") : (locale === "ar" ? "بنك" : "Bank")}{status === "paused" ? (locale === "ar" ? " · متوقف" : " · paused") : status === "archived" ? (locale === "ar" ? " · مؤرشف" : " · archived") : ""}</small>
        <strong>{account.name}</strong>
        {split.mixed && (
          <span className="account-custody">
            {locale === "ar" ? `أموالك ${money(split.ownMinor, locale)}` : `Yours ${money(split.ownMinor, locale)}`}
            {holdings.map((row) => ` · ${row.name} ${money(row.balanceMinor, locale)}`).join("")}
          </span>
        )}
      </div>
      <b>{money(split.totalMinor, locale)}</b>
      <div className="personal-account-guard">
        <button type="button" className={`account-lock ${unlocked ? "open" : ""}`} onClick={() => setUnlocked((current) => !current)}>
          {unlocked ? <Unlock size={14} /> : <Lock size={14} />}
          {unlocked ? (locale === "ar" ? "إخفاء" : "Hide") : (locale === "ar" ? "إدارة" : "Manage")}
        </button>
        {unlocked && (
          <div className="personal-rule-actions">
            <button type="button" title={locale === "ar" ? "كشف الحساب" : "Statement"} onClick={onPrint}><Printer size={14} /></button>
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
    <div className="personal-occ-row is-income">
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
    <div className={`personal-occ-row ${laneOf(item.rule_kind)}`}>
      <div>
        <strong>{item.rule_name} <em className={`personal-cat-chip ${laneOf(item.rule_kind)}`}>{income ? (locale === "ar" ? "دخل" : "Income") : (locale === "ar" ? "مصروف" : "Spend")}</em></strong>
        <span>{formatDue(item.due_at) || item.period_key} · {personalCategoryLabel(income ? "income" : "expense", item.rule_category, locale, item.rule_name)}{!variable && Number(item.expected_minor) > 0 ? (locale === "ar" ? ` · الالتزام ${money(Number(item.expected_minor), locale)}` : ` · due ${money(Number(item.expected_minor), locale)}`) : ""}{variable ? (locale === "ar" ? " · متغيرة — أدخل المبلغ" : " · variable — enter amount") : ""}</span>
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
  const [category, setCategory] = useState(existing?.category || inferPersonalCategory(kind, existing?.name ?? ""));
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
        category: category || inferPersonalCategory(kind, name),
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
          <CategoryField locale={locale} kind={kind} value={category} onChange={setCategory} />
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
          {resolvedSchedule === "monthly" && <p className="modal-note">{locale === "ar" ? "تذكير شخصي قبل يوم الدفع وفي نفس اليوم، عبر التطبيق والبريد وواتساب إن وُجد رقم في ملفك. بعد الوصول أو الدفع: اعتماد أو تأجيل أو تجاهل." : "You get a personal reminder the day before and on the due day, in-app plus email and WhatsApp when a phone is on your profile. Then approve, defer, or skip."}</p>}
          {schedule !== "unscheduled" && (
            <div className="form-row">
              {resolvedSchedule === "monthly" && (
                <label>
                  <span>{locale === "ar" ? "يوم الاستحقاق (1 بداية الشهر، 31 آخر يوم)" : "Due day (1 = start of month, 31 = last day)"}</span>
                  <input type="number" min="1" max="31" value={dueDay} onChange={(event) => setDueDay(event.target.value)} />
                </label>
              )}
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
