"use client";

import { CheckCircle2, Clock3, Mail, MessageCircle, Printer, Sparkles, X } from "lucide-react";
import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import OmrSymbol from "../brand/OmrSymbol";
import { apiFetch } from "../../lib/client-api";
import { buildMemberLedger, buildMemberLedgerHtml, filterMemberLedgerLines, type MemberLedgerFocus } from "../../lib/member-ledger";
import { printWazenHtml } from "../../lib/print-document";
import { consumePlanQuota } from "../../lib/plan-quota-client";
import {
  allocateOldestFirst,
  accruedDueMinor,
  buildInstallmentSchedule,
  remainingInstallmentMinor,
  selectByAmount,
  selectThroughOldest,
  totalRemainingMinor,
  type InstallmentLike,
} from "../../lib/installments";
import { formatMoneyMinor } from "../../lib/money";
import { openWhatsAppUrl } from "../../lib/receipt-share";

type Locale = "ar" | "en";

export type AssociationMember = {
  id: string;
  space_id: string;
  display_name: string;
  email: string | null;
  phone?: string | null;
  role: string;
  status?: string;
  due_minor: number;
  paid_minor: number;
  extra_minor: number;
  addon_minor?: number;
  avatar: string;
  joined_at?: string;
};

export function personIdentityKey(member: Pick<AssociationMember, "phone" | "email" | "display_name">) {
  const phone = String(member.phone ?? "").replace(/\D/g, "");
  const email = String(member.email ?? "").trim().toLowerCase();
  if (phone.length >= 7) return `p:${phone}`;
  if (email) return `e:${email}`;
  return `n:${member.display_name.trim().toLowerCase()}`;
}

export type AssociationInstallment = InstallmentLike & { member_id?: string; space_id?: string; due_at?: string };

export type AssociationSpace = { id: string; name_ar: string; name_en: string; type: string; currency: string };
export type AssociationPlan = { space_id?: string; amount_minor?: number; duration_months?: number; starts_at?: string };

function money(minor: number, currency: string, locale: Locale) {
  return formatMoneyMinor(minor, currency || "OMR", locale);
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal-card wide-modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-header"><h2>{title}</h2><button type="button" onClick={onClose} aria-label="Close"><X size={20} /></button></div>
        {children}
      </section>
    </div>
  );
}

export function memberInstallments(
  member: AssociationMember,
  installments: AssociationInstallment[],
  plan?: AssociationPlan | null,
): AssociationInstallment[] {
  const rows = installments.filter((row: AssociationInstallment) => (row as { member_id?: string }).member_id === member.id);
  if (rows.length) return rows.sort((a, b) => a.period_index - b.period_index);
  const monthly = Number(plan?.amount_minor ?? 0);
  const duration = Number(plan?.duration_months ?? 0);
  if (monthly <= 0 || duration <= 0) return [];
  return buildInstallmentSchedule({
    memberId: member.id,
    spaceId: member.space_id,
    startAt: plan?.starts_at || member.joined_at || new Date().toISOString(),
    durationMonths: duration,
    amountMinor: monthly,
    paidMinor: member.paid_minor,
  }).rows;
}

export function memberAccruedDueMinor(
  member: AssociationMember,
  installments: AssociationInstallment[],
  plan?: AssociationPlan | null,
  asOf?: Date,
) {
  const months = memberInstallments(member, installments, plan);
  if (!months.length) return member.due_minor;
  return accruedDueMinor(months, asOf);
}

export function memberAccruedOwedMinor(
  member: AssociationMember,
  installments: AssociationInstallment[],
  plan?: AssociationPlan | null,
  asOf?: Date,
) {
  return Math.max(0, memberAccruedDueMinor(member, installments, plan, asOf) - member.paid_minor);
}

export function RemainingInvoiceGrid({
  months,
  selected,
  locale,
  currency,
  onSelectPeriod,
}: {
  months: AssociationInstallment[];
  selected: string[];
  locale: Locale;
  currency: string;
  onSelectPeriod: (periodIndex: number) => void;
}) {
  const unpaid = months.filter((row: AssociationInstallment) => remainingInstallmentMinor(row) > 0);
  return (
    <div>
      <p className="modal-note">{locale === "ar" ? "الفواتير المتبقية. اضغط شهراً لتصفية الأقدم حتى ذلك الشهر، أو اترك النظام يصفّي الأقدم تلقائياً حسب المبلغ." : "Remaining invoices. Tap a month to clear oldest invoices through that month, or let the amount auto-clear oldest first."}</p>
      <div className="month-grid selectable">
        {unpaid.map((row) => (
          <button type="button" key={row.id} className={`month-chip ${selected.includes(row.id) ? "selected" : row.status}`} onClick={() => onSelectPeriod(row.period_index)}>
            <small>{locale === "ar" ? `شهر ${row.period_index}` : `Month ${row.period_index}`}</small>
            <strong>{row.period_key}</strong>
            <em>{row.status === "partial" ? (locale === "ar" ? "جزئي" : "Partial") : (locale === "ar" ? "غير مدفوع" : "Unpaid")}</em>
            <span>{money(remainingInstallmentMinor(row), currency, locale)}</span>
          </button>
        ))}
        {!unpaid.length && <p className="modal-note">{locale === "ar" ? "لا توجد فواتير متبقية على هذا المساهم." : "This member has no remaining invoices."}</p>}
      </div>
    </div>
  );
}

type LedgerInputs = {
  member: AssociationMember;
  space: AssociationSpace;
  plan?: AssociationPlan | null;
  installments: AssociationInstallment[];
  locale: Locale;
  issuerName: string;
  focus?: MemberLedgerFocus;
  transactions?: Array<{
    id: string;
    space_id: string;
    member_id?: string | null;
    kind: string;
    allocation?: string;
    amount_minor: number;
    description_ar: string;
    description_en: string;
    status?: string;
    occurred_at: string;
  }>;
  settlements?: Array<{
    id: string;
    space_id: string;
    from_member_id: string;
    to_member_id: string;
    from_member_name?: string | null;
    to_member_name?: string | null;
    amount_minor: number;
    status: string;
  }>;
  tripExpenses?: Array<{
    id: string;
    space_id: string;
    paid_by_member_id: string;
    paid_by_name: string;
    amount_minor: number;
    description: string;
    occurred_at: string;
  }>;
  expenseSplits?: Array<{ expense_id: string; member_id: string; share_minor: number }>;
  onSmartPay: () => void;
  /** Called after statement share succeeds (for toast). */
  onStatementSent?: (message: string) => void;
  canWhatsapp?: boolean;
};

function MemberLedgerBody({
  member,
  space,
  plan,
  installments,
  locale,
  issuerName,
  focus = "all",
  transactions = [],
  settlements = [],
  tripExpenses = [],
  expenseSplits = [],
  onSmartPay,
  onStatementSent,
  canWhatsapp = true,
}: LedgerInputs) {
  const [tab, setTab] = useState<MemberLedgerFocus>(focus);
  const [sending, setSending] = useState(false);
  useEffect(() => { setTab(focus); }, [focus, member.id, space.id]);
  const ledger = useMemo(() => buildMemberLedger({
    member,
    spaceNameAr: space.name_ar,
    spaceNameEn: space.name_en,
    currency: space.currency,
    plan,
    installments,
    transactions,
    settlements,
    tripExpenses,
    expenseSplits,
  }), [member, space, plan, installments, transactions, settlements, tripExpenses, expenseSplits]);
  const months = ledger.months;
  const rows = filterMemberLedgerLines(ledger.lines, tab);
  const tabs: Array<{ id: MemberLedgerFocus; ar: string; en: string; amount: number }> = [
    { id: "all", ar: "الكل", en: "All", amount: 0 },
    { id: "paid", ar: "المدفوع", en: "Paid", amount: ledger.paidMinor },
    { id: "spent", ar: "الصرف", en: "Spent", amount: ledger.addonMinor },
    { id: "owes", ar: "عليه", en: "Owes", amount: ledger.owesMinor },
    { id: "credit", ar: "له", en: "Credit", amount: ledger.creditMinor },
  ];
  const ledgerHtml = (logoUrl: string) => buildMemberLedgerHtml({
    locale,
    logoUrl,
    issuerName,
    memberName: member.display_name,
    spaceName: locale === "ar" ? space.name_ar : space.name_en,
    currency: space.currency,
    joinedAt: member.joined_at,
    phone: member.phone,
    email: member.email,
    focus: tab,
    ledger,
  });
  const printLedger = () => {
    void consumePlanQuota("print", locale, space.id);
    void printWazenHtml((logoUrl) => ledgerHtml(logoUrl), true);
  };
  const sendLedger = async () => {
    if (!canWhatsapp) {
      window.location.assign("/pricing");
      return;
    }
    if (!member.phone) {
      window.alert(locale === "ar" ? "سجّل رقم هاتف العضو أولاً لإرسال الكشف عبر واتساب." : "Add the member’s phone number first to send the statement on WhatsApp.");
      return;
    }
    if (sending) return;
    setSending(true);
    try {
      const response = await apiFetch("/api/dashboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "createMemberStatementShare",
          idempotencyKey: crypto.randomUUID(),
          memberId: member.id,
          focus: tab,
          locale,
        }),
      });
      const result = await response.json() as { error?: string; notification?: { whatsappUrl?: string | null } };
      if (!response.ok) throw new Error(result.error ?? "SHARE_FAILED");
      if (result.notification?.whatsappUrl) {
        openWhatsAppUrl(result.notification.whatsappUrl);
      }
      onStatementSent?.(locale === "ar"
        ? "تم فتح واتساب برابط كشف واضح للجوال (مثل إيصال العملية)."
        : "WhatsApp opened with a clear phone statement link (like a receipt).");
    } catch {
      window.alert(locale === "ar" ? "تعذر تجهيز رابط الكشف للإرسال." : "Could not prepare the statement link to send.");
    } finally {
      setSending(false);
    }
  };
  return (
    <>
      <div className="member-detail-meta">
        <div><span>{locale === "ar" ? "تاريخ الانضمام" : "Joined"}</span><b>{member.joined_at ? new Date(member.joined_at).toLocaleDateString(locale === "ar" ? "ar-OM" : "en-GB") : "—"}</b></div>
        <div><span>{locale === "ar" ? "الهاتف" : "Phone"}</span><b>{member.phone || "—"}</b></div>
        <div><span>{locale === "ar" ? "البريد" : "Email"}</span><b>{member.email || "—"}</b></div>
        <div><span>{locale === "ar" ? "الهدف المالي" : "Financial goal"}</span><b>{money(member.due_minor, space.currency, locale)}</b></div>
        <div><span>{locale === "ar" ? "كم دفع" : "Paid"}</span><b>{money(ledger.paidMinor, space.currency, locale)}</b></div>
        <div><span>{locale === "ar" ? "كم صرف" : "Spent"}</span><b>{money(ledger.addonMinor, space.currency, locale)}</b></div>
        <div><span>{locale === "ar" ? "كم عليه" : "Owes"}</span><b>{money(ledger.owesMinor, space.currency, locale)}</b></div>
        <div><span>{locale === "ar" ? "كم له" : "Credit"}</span><b>{money(ledger.creditMinor, space.currency, locale)}</b></div>
      </div>
      <div className="member-ledger-tabs">
        {tabs.map((item) => (
          <button type="button" key={item.id} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}>
            {locale === "ar" ? item.ar : item.en}
            {item.id !== "all" ? <small>{money(item.amount, space.currency, locale)}</small> : null}
          </button>
        ))}
      </div>
      <div className="month-grid">
        {months.map((row: AssociationInstallment) => (
          <article key={row.id} className={`month-chip ${row.status}`}>
            <small>{locale === "ar" ? `شهر ${row.period_index}` : `Month ${row.period_index}`}</small>
            <strong>{row.period_key}</strong>
            <em>{row.status === "paid" ? (locale === "ar" ? "مدفوع" : "Paid") : row.status === "partial" ? (locale === "ar" ? "جزئي" : "Partial") : (locale === "ar" ? "غير مدفوع" : "Unpaid")}</em>
            <span>{money(remainingInstallmentMinor(row), space.currency, locale)}</span>
          </article>
        ))}
      </div>
      <div className="members-table member-ledger-table">
        <div className="table-head person-head">
          <span>{locale === "ar" ? "التاريخ" : "Date"}</span>
          <span>{locale === "ar" ? "البيان" : "Description"}</span>
          <span>{locale === "ar" ? "التفصيل" : "Detail"}</span>
          <span>{locale === "ar" ? "المبلغ" : "Amount"}</span>
        </div>
        {rows.map((line, index) => (
          <div className="member-row member-ledger-row" key={`${line.at}:${line.titleAr}:${index}`}>
            <span>{new Date(line.at).toLocaleString(locale === "ar" ? "ar-OM" : "en-GB")}</span>
            <strong>{locale === "ar" ? line.titleAr : line.titleEn}</strong>
            <span className="muted-amount">{locale === "ar" ? line.detailAr : line.detailEn}</span>
            <strong className={line.direction === "out" ? "amount-negative" : line.direction === "in" ? "reserve-amount" : ""}>{money(line.amountMinor, space.currency, locale)}</strong>
          </div>
        ))}
        {!rows.length && <p className="modal-note">{locale === "ar" ? "لا توجد تفاصيل في هذا القسم." : "No detail in this section."}</p>}
      </div>
      <div className="modal-actions">
        <button type="button" className="secondary-button" onClick={printLedger}><Printer size={16} />{locale === "ar" ? "طباعة الكشف" : "Print statement"}</button>
        <button type="button" className={`secondary-button${canWhatsapp ? "" : " is-plan-locked"}`} disabled={sending} onClick={() => { void sendLedger(); }}>
          <MessageCircle size={16} />
          {sending
            ? (locale === "ar" ? "جارٍ التجهيز…" : "Preparing…")
            : (locale === "ar" ? "إرسال الكشف" : "Send statement")}
        </button>
        <button type="button" className="primary-button" onClick={onSmartPay}><Sparkles size={16} />{locale === "ar" ? "المحاسب الذكي" : "Smart accountant"}</button>
      </div>
    </>
  );
}

export function MemberDetailModal({
  member,
  space,
  plan,
  installments,
  locale,
  issuerName,
  focus = "all",
  transactions = [],
  settlements = [],
  tripExpenses = [],
  expenseSplits = [],
  onClose,
  onSmartPay,
  onStatementSent,
  canWhatsapp = true,
}: LedgerInputs & { onClose: () => void }) {
  return (
    <Modal title={member.display_name} onClose={onClose}>
      <div className="modal-form">
        <MemberLedgerBody
          member={member}
          space={space}
          plan={plan}
          installments={installments}
          locale={locale}
          issuerName={issuerName}
          focus={focus}
          transactions={transactions}
          settlements={settlements}
          tripExpenses={tripExpenses}
          expenseSplits={expenseSplits}
          onSmartPay={onSmartPay}
          onStatementSent={onStatementSent}
          canWhatsapp={canWhatsapp}
        />
      </div>
    </Modal>
  );
}

export function MemberPersonProfile({
  records,
  spaces,
  plans,
  installments,
  locale,
  issuerName,
  focus = "all",
  transactions = [],
  settlements = [],
  tripExpenses = [],
  expenseSplits = [],
  onClose,
  onSmartPay,
  onStatementSent,
  onContactSaved,
  canWhatsapp = true,
}: {
  records: AssociationMember[];
  spaces: AssociationSpace[];
  plans: Array<{ space_id?: string; amount_minor?: number; duration_months?: number; starts_at?: string }>;
  installments: AssociationInstallment[];
  locale: Locale;
  issuerName: string;
  focus?: MemberLedgerFocus;
  transactions?: LedgerInputs["transactions"];
  settlements?: LedgerInputs["settlements"];
  tripExpenses?: LedgerInputs["tripExpenses"];
  expenseSplits?: LedgerInputs["expenseSplits"];
  onClose: () => void;
  onSmartPay: (memberId: string) => void;
  onStatementSent?: (message: string) => void;
  onContactSaved?: (message: string) => void;
  canWhatsapp?: boolean;
}) {
  const primary = records[0];
  const preferred = records.find((row) => {
    if (focus === "owes") return memberAccruedOwedMinor(row, installments, plans.find((item) => item.space_id === row.space_id)) > 0;
    if (focus === "credit" || focus === "paid" || focus === "spent") return row.paid_minor > 0 || Number(row.addon_minor ?? 0) > 0 || row.extra_minor > 0;
    return false;
  }) ?? records[0];
  const [spaceId, setSpaceId] = useState<string | null>(preferred?.space_id ?? null);
  const [displayName, setDisplayName] = useState(primary?.display_name ?? "");
  const [email, setEmail] = useState(primary?.email ?? "");
  const [phone, setPhone] = useState(primary?.phone ?? "");
  const [savingContact, setSavingContact] = useState(false);
  const [contactError, setContactError] = useState("");
  const [editingContact, setEditingContact] = useState(!(primary?.email));
  useEffect(() => { setSpaceId(preferred?.space_id ?? null); }, [preferred?.space_id, focus]);
  useEffect(() => {
    setDisplayName(primary?.display_name ?? "");
    setEmail(primary?.email ?? "");
    setPhone(primary?.phone ?? "");
  }, [primary?.id, primary?.display_name, primary?.email, primary?.phone]);
  const selected = records.find((row) => row.space_id === spaceId) ?? null;
  const space = spaces.find((item) => item.id === selected?.space_id);
  const plan = plans.find((item) => item.space_id === selected?.space_id);
  const isActive = records.some((row) => (row.status ?? "active") === "active");
  const paid = records.reduce((sum, row) => sum + row.paid_minor, 0);
  const extra = records.reduce((sum, row) => sum + row.extra_minor + Number(row.addon_minor ?? 0), 0);
  const remaining = records.reduce((sum, row) => sum + memberAccruedOwedMinor(row, installments, plans.find((item) => item.space_id === row.space_id)), 0);
  const credit = records.reduce((sum, row) => {
    const accrued = memberAccruedDueMinor(row, installments, plans.find((item) => item.space_id === row.space_id));
    return sum + Math.max(0, row.paid_minor - accrued) + row.extra_minor + Number(row.addon_minor ?? 0);
  }, 0);
  const rates = records.map((row) => {
    const planForRow = plans.find((item) => item.space_id === row.space_id);
    const accrued = memberAccruedDueMinor(row, installments, planForRow);
    const rate = Math.round((Math.min(row.paid_minor, Math.max(accrued, 1)) / Math.max(accrued, 1)) * 100);
    const left = memberAccruedOwedMinor(row, installments, planForRow);
    let grade = "D";
    if (rate >= 95 && left === 0) grade = "A";
    else if (rate >= 75) grade = "B";
    else if (rate >= 50) grade = "C";
    return { rate, grade, left };
  });
  const avgRate = Math.round(rates.reduce((sum, row) => sum + row.rate, 0) / Math.max(rates.length, 1));
  const gradeRank = { A: 0, B: 1, C: 2, D: 3 } as Record<string, number>;
  const grade = rates.reduce((worst, row) => (gradeRank[row.grade] > gradeRank[worst] ? row.grade : worst), "A");
  const currency = space?.currency || spaces.find((item) => item.id === primary?.space_id)?.currency || "OMR";

  const saveContact = async (event: FormEvent) => {
    event.preventDefault();
    if (!primary || savingContact) return;
    setSavingContact(true);
    setContactError("");
    try {
      const response = await apiFetch("/api/dashboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "updateMemberContact",
          idempotencyKey: crypto.randomUUID(),
          memberId: primary.id,
          displayName,
          email,
          phone,
          syncLinked: true,
        }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "UPDATE_FAILED");
      setEditingContact(false);
      onContactSaved?.(locale === "ar" ? "تم حفظ بيانات التواصل" : "Contact details saved");
    } catch {
      setContactError(locale === "ar" ? "تعذر حفظ البريد أو الهاتف." : "Could not save email or phone.");
    } finally {
      setSavingContact(false);
    }
  };

  if (!primary) return null;
  return (
    <Modal title={primary.display_name} onClose={onClose}>
      <div className="modal-form">
        {editingContact ? (
          <form className="member-contact-edit" onSubmit={saveContact}>
            <label>
              <span>{locale === "ar" ? "الاسم" : "Name"}</span>
              <input required value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
            </label>
            <label>
              <span>{locale === "ar" ? "البريد" : "Email"}</span>
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" dir="ltr" />
            </label>
            <label>
              <span>{locale === "ar" ? "الهاتف" : "Phone"}</span>
              <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="9689xxxxxxx" dir="ltr" />
            </label>
            {contactError ? <p className="modal-error">{contactError}</p> : null}
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setEditingContact(false)}>{locale === "ar" ? "إلغاء" : "Cancel"}</button>
              <button type="submit" className="primary-button" disabled={savingContact}>{savingContact ? (locale === "ar" ? "جارٍ الحفظ…" : "Saving…") : (locale === "ar" ? "حفظ التواصل" : "Save contact")}</button>
            </div>
          </form>
        ) : (
          <div className="member-detail-meta">
            <div><span>{locale === "ar" ? "البريد" : "Email"}</span><b>{primary.email || "—"}</b></div>
            <div><span>{locale === "ar" ? "الهاتف" : "Phone"}</span><b>{primary.phone || "—"}</b></div>
            <div><span>{locale === "ar" ? "الحالة" : "Status"}</span><b>{isActive ? (locale === "ar" ? "نشط" : "Active") : (locale === "ar" ? "غير نشط" : "Inactive")}</b></div>
            <div><span>{locale === "ar" ? "تقييم الانضباط" : "Discipline"}</span><b>{grade} · {avgRate}%</b></div>
            <div><span>{locale === "ar" ? "عليه" : "Owes"}</span><b>{money(remaining, currency, locale)}</b></div>
            <div><span>{locale === "ar" ? "المستلم / له" : "Received / credit"}</span><b>{money(paid + extra, currency, locale)} · {money(credit, currency, locale)}</b></div>
            <div className="member-contact-actions">
              <button type="button" className="secondary-button" onClick={() => setEditingContact(true)}>
                {locale === "ar" ? "تعديل البريد والهاتف" : "Edit email & phone"}
              </button>
            </div>
          </div>
        )}
        <p className="modal-note">{locale === "ar" ? "اضغط جمعية لعرض الكشف التفصيلي داخلها." : "Tap an association to open its detailed statement."}</p>
        <div className="assoc-chip-list">
          {records.map((row) => {
            const linked = spaces.find((item) => item.id === row.space_id);
            const left = memberAccruedOwedMinor(row, installments, plans.find((item) => item.space_id === row.space_id));
            const active = (row.status ?? "active") === "active";
            const label = linked ? (locale === "ar" ? linked.name_ar : linked.name_en) : row.space_id;
            return (
              <button type="button" key={row.id} className={`assoc-chip ${spaceId === row.space_id ? "selected" : ""}`} onClick={() => setSpaceId(row.space_id)}>
                <strong>{label}</strong>
                <span>{active ? (locale === "ar" ? "نشط" : "Active") : (locale === "ar" ? "غير نشط" : "Inactive")}</span>
                <em>{left > 0 ? (locale === "ar" ? `عليه ${money(left, linked?.currency || currency, locale)}` : `Owes ${money(left, linked?.currency || currency, locale)}`) : (locale === "ar" ? "مسدد" : "Settled")}</em>
              </button>
            );
          })}
        </div>
        {selected && space && (
          <MemberLedgerBody
            member={selected}
            space={space}
            plan={plan}
            installments={installments}
            locale={locale}
            issuerName={issuerName}
            focus={focus}
            transactions={transactions}
            settlements={settlements}
            tripExpenses={tripExpenses}
            expenseSplits={expenseSplits}
            onSmartPay={() => onSmartPay(selected.id)}
            onStatementSent={onStatementSent}
            canWhatsapp={canWhatsapp}
          />
        )}
      </div>
    </Modal>
  );
}

export function SmartAccountantModal({
  members,
  spaces,
  plans,
  installments,
  locale,
  preferredMemberId,
  onClose,
  onSaved,
}: {
  members: AssociationMember[];
  spaces: AssociationSpace[];
  plans: AssociationPlan[];
  installments: AssociationInstallment[];
  locale: Locale;
  preferredMemberId?: string;
  onClose: () => void;
  onSaved: (next: Record<string, unknown>) => void;
}) {
  const groupMembers = members.filter((member) => spaces.some((space) => space.id === member.space_id && space.type !== "personal"));
  const [memberId, setMemberId] = useState(preferredMemberId && groupMembers.some((item) => item.id === preferredMemberId) ? preferredMemberId : (groupMembers[0]?.id ?? ""));
  const member = groupMembers.find((item) => item.id === memberId);
  const space = spaces.find((item) => item.id === member?.space_id);
  const plan = plans.find((item) => item.space_id === member?.space_id);
  const months: AssociationInstallment[] = member ? memberInstallments(member, installments, plan) : [];
  const unpaid = months.filter((row: AssociationInstallment) => remainingInstallmentMinor(row) > 0);
  const [selected, setSelected] = useState<string[]>([]);
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const ids = unpaid.map((row: AssociationInstallment) => row.id);
    setSelected(ids.slice(0, 1));
    const first = unpaid[0];
    setAmount(first ? (remainingInstallmentMinor(first) / 1000).toFixed(3) : "");
  }, [memberId]);

  const preview = useMemo(() => {
    const minor = Math.round(Number(amount || 0) * 1000);
    if (!minor || !months.length) return null;
    try { return allocateOldestFirst(months, minor, selected.length ? selected : undefined); }
    catch { return null; }
  }, [amount, months, selected]);

  const toggleMonth = (periodIndex: number) => {
    const ids = selectThroughOldest(months, periodIndex);
    setSelected(ids);
    const total = totalRemainingMinor(months, ids);
    setAmount((total / 1000).toFixed(3));
  };

  const onAmountChange = (value: string) => {
    setAmount(value);
    const minor = Math.round(Number(value || 0) * 1000);
    if (minor > 0 && months.length) {
      try { setSelected(selectByAmount(months, minor)); } catch { /* ignore */ }
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!member || !space) return;
    setSaving(true); setError("");
    try {
      const response = await apiFetch("/api/dashboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "smartPay",
          idempotencyKey: crypto.randomUUID(),
          spaceId: space.id,
          memberId: member.id,
          amount,
          selectedIds: selected,
        }),
      });
      const result = await response.json() as Record<string, unknown> & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "PAY_FAILED");
      onSaved(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "PAY_FAILED");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={locale === "ar" ? "المحاسب الذكي" : "Smart accountant"} onClose={onClose}>
      <form className="modal-form" onSubmit={submit}>
        <p className="modal-note">{locale === "ar" ? "عند اختيار المساهم تُجلب الأشهر المتبقية. التوزيع يصفّي الفواتير الأقدم أولاً ويترك الأحدث." : "Selecting a member loads remaining months. Allocation clears the oldest invoices first."}</p>
        <label>
          <span>{locale === "ar" ? "المساهم" : "Member"}</span>
          <select value={memberId} onChange={(event) => setMemberId(event.target.value)}>
            {groupMembers.map((item) => <option key={item.id} value={item.id}>{item.display_name}</option>)}
          </select>
        </label>
        {member && space && (
          <div className="member-detail-meta compact">
            <div><span>{locale === "ar" ? "عليه" : "Owes"}</span><b>{money(memberAccruedOwedMinor(member, installments, plan), space.currency, locale)}</b></div>
            <div><span>{locale === "ar" ? "أشهر متبقية" : "Open months"}</span><b>{unpaid.length}</b></div>
          </div>
        )}
        <div className="month-grid selectable">
          {unpaid.map((row: AssociationInstallment) => (
            <button type="button" key={row.id} className={`month-chip ${selected.includes(row.id) ? "selected" : row.status}`} onClick={() => toggleMonth(row.period_index)}>
              <small>{locale === "ar" ? `شهر ${row.period_index}` : `Month ${row.period_index}`}</small>
              <strong>{row.period_key}</strong>
              <span>{space ? money(remainingInstallmentMinor(row), space.currency, locale) : row.amount_minor}</span>
            </button>
          ))}
          {!unpaid.length && <p className="modal-note">{locale === "ar" ? "لا توجد أشهر متبقية على هذا المساهم." : "This member has no remaining months."}</p>}
        </div>
        <label>
          <span>{locale === "ar" ? "المبلغ المستلم" : "Amount received"}</span>
          <div className="money-input">
            <input required type="number" min="0.001" step="0.001" value={amount} onChange={(event) => onAmountChange(event.target.value)} />
            <b className="money-currency"><OmrSymbol size={14} /></b>
          </div>
        </label>
        {preview && (
          <div className="modal-note split-preview">
            <span>{locale === "ar" ? "التوزيع التلقائي (الأقدم فالأحدث)" : "Auto allocation (oldest first)"}</span>
            {preview.allocations.map((item) => (
              <strong key={item.installmentId}>{item.periodKey}: {(item.amountMinor / 1000).toFixed(3)}</strong>
            ))}
            {preview.leftoverMinor > 0 && <span>{locale === "ar" ? `مقدّم: ${(preview.leftoverMinor / 1000).toFixed(3)}` : `Advance: ${(preview.leftoverMinor / 1000).toFixed(3)}`}</span>}
          </div>
        )}
        {error && <p className="modal-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>{locale === "ar" ? "إلغاء" : "Cancel"}</button>
          <button className="primary-button" disabled={saving || !unpaid.length}>{saving ? (locale === "ar" ? "جارٍ الحفظ…" : "Saving…") : (locale === "ar" ? "تسجيل السداد" : "Post payment")}</button>
        </div>
      </form>
    </Modal>
  );
}

export function ReceiptChannelModal({
  member,
  locale,
  transactionId,
  onClose,
  onDone,
  canEmail = true,
  canWhatsapp = true,
}: {
  member: AssociationMember;
  locale: Locale;
  transactionId?: string;
  onClose: () => void;
  onDone: (message: string) => void;
  canEmail?: boolean;
  canWhatsapp?: boolean;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const send = async (channel: "email" | "whatsapp" | "both") => {
    setSaving(true); setError("");
    try {
      const response = await apiFetch("/api/dashboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "sendReceipt", idempotencyKey: crypto.randomUUID(), memberId: member.id, transactionId, channel, locale }),
      });
      const result = await response.json() as { error?: string; notification?: { whatsappUrl?: string | null; emailQueued?: boolean; receiptUrl?: string | null } };
      if (!response.ok) throw new Error(result.error ?? "SEND_FAILED");
      if (result.notification?.whatsappUrl && (channel === "whatsapp" || channel === "both")) {
        openWhatsAppUrl(result.notification.whatsappUrl);
      }
      onDone(locale === "ar"
        ? (channel === "email"
          ? "تم إرسال الإيصال إلى بريد المساهم المسجّل."
          : channel === "both"
            ? "تم إرسال البريد وفُتح واتساب برابط الإيصال."
            : "تم فتح واتساب بالنص ورابط الإيصال.")
        : (channel === "email"
          ? "Receipt emailed to the member’s saved address."
          : channel === "both"
            ? "Email sent and WhatsApp opened with the receipt link."
            : "WhatsApp opened with the receipt text and link."));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "SEND_FAILED");
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal title={locale === "ar" ? "إرسال الإيصال" : "Send receipt"} onClose={onClose}>
      <div className="modal-form">
        <p className="modal-note">{locale === "ar" ? `إلى ${member.display_name} — البريد: ${member.email || "غير مسجّل"} — الهاتف: ${member.phone || "غير مسجّل"}` : `To ${member.display_name} — email: ${member.email || "missing"} — phone: ${member.phone || "missing"}`}</p>
        <p className="modal-note">{locale === "ar" ? "واتساب يرسل النص مع رابط يفتح صفحة الإيصال للتنزيل أو الطباعة — بدون مرفق ملف." : "WhatsApp sends the text plus a link that opens the receipt page to download or print — no file attachment."}</p>
        {error && <p className="modal-error">{error}</p>}
        <div className="receipt-channel-grid">
          <button type="button" className={`primary-button${canEmail ? "" : " is-plan-locked"}`} disabled={saving || !member.email || !canEmail} onClick={() => { if (!canEmail) { window.location.assign("/pricing"); return; } void send("email"); }}><Mail size={16} />{locale === "ar" ? "بريد فقط" : "Email only"}{canEmail ? null : <em className="plan-lock-badge">{locale === "ar" ? "ترقية" : "Upgrade"}</em>}</button>
          <button type="button" className={`primary-button${canWhatsapp ? "" : " is-plan-locked"}`} disabled={saving || !member.phone || !canWhatsapp} onClick={() => { if (!canWhatsapp) { window.location.assign("/pricing"); return; } void send("whatsapp"); }}><MessageCircle size={16} />{locale === "ar" ? "واتساب فقط" : "WhatsApp only"}{canWhatsapp ? null : <em className="plan-lock-badge">{locale === "ar" ? "ترقية" : "Upgrade"}</em>}</button>
          <button type="button" className={`primary-button${canEmail && canWhatsapp ? "" : " is-plan-locked"}`} disabled={saving || !member.email || !member.phone || !canEmail || !canWhatsapp} onClick={() => { if (!canEmail || !canWhatsapp) { window.location.assign("/pricing"); return; } void send("both"); }}><CheckCircle2 size={16} />{locale === "ar" ? "كليهما" : "Both"}</button>
        </div>
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>{locale === "ar" ? "إغلاق" : "Close"}</button></div>
      </div>
    </Modal>
  );
}

export function MemberStatusIcon({ owes, locale }: { owes: boolean; locale: Locale }) {
  return owes
    ? <><Clock3 size={13} />{locale === "ar" ? "عليه مطالبات" : "Owes"}</>
    : <><CheckCircle2 size={13} />{locale === "ar" ? "منتظم" : "Current"}</>;
}
