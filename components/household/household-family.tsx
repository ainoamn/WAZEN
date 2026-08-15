"use client";

import { FormEvent, useState } from "react";
import { AlertTriangle, CalendarDays, Landmark, Plus, X } from "lucide-react";
import { apiFetch } from "../../lib/client-api";
import { formatMoneyMinor } from "../../lib/money";
import OmrSymbol from "../brand/OmrSymbol";
import { DateField } from "../ui/date-field";
import { CollapsiblePanel, FoldWrap } from "../ui/collapsible-panel";

type Locale = "ar" | "en";
type Member = { id: string; display_name: string; role: string };
type PayoutAccount = { space_id: string; label: string; account_number: string; linked_member_id?: string | null };
type FamilyEvent = {
  id: string;
  space_id: string;
  title: string;
  kind: string;
  target_at: string;
  expected_minor: number;
  status: string;
  projectedMinor?: number;
  scheduledInflowMinor?: number;
  shortfallMinor?: number;
  needsBoost?: boolean;
  monthsUntil?: number;
};

const kinds: Record<string, { ar: string; en: string }> = {
  outing: { ar: "طلعة عائلية", en: "Family outing" },
  treatment: { ar: "علاج", en: "Treatment" },
  aid: { ar: "مساعدة شخص", en: "Aid" },
  person_payment: { ar: "دفع لشخص مقابل عمل", en: "Payment to a person" },
  other: { ar: "أخرى", en: "Other" },
};

function money(minor: number, locale: Locale) {
  return formatMoneyMinor(minor, "OMR", locale);
}

export function HouseholdFamilyPanel({
  spaceId,
  locale,
  currency,
  balanceMinor,
  incomeMinor,
  spendMinor,
  members,
  payout,
  events,
  onChanged,
}: {
  spaceId: string;
  locale: Locale;
  currency: string;
  balanceMinor: number;
  incomeMinor: number;
  spendMinor: number;
  members: Member[];
  payout?: PayoutAccount;
  events: FamilyEvent[];
  onChanged: (next: Record<string, unknown>) => void;
}) {
  const [bankOpen, setBankOpen] = useState(false);
  const [eventOpen, setEventOpen] = useState(false);
  const alerts = events.filter((item) => item.space_id === spaceId && item.status === "planned" && item.needsBoost);
  return (
    <>
      <FoldWrap id={`${spaceId}:fund-stats`} title={locale === "ar" ? "ملخص الصندوق" : "Fund summary"} label={locale === "ar" ? "طي الملخص" : "Fold summary"}>
      <section className="stat-grid compact">
        <article className="stat-card"><div className="stat-icon navy"><Landmark size={18} /></div><div className="stat-copy"><span>{locale === "ar" ? "دخل الصندوق" : "Fund income"}</span><strong>{money(incomeMinor, locale)}</strong><small>{locale === "ar" ? "مساهمات مرحلة" : "posted contributions"}</small></div></article>
        <article className="stat-card"><div className="stat-icon rose"><AlertTriangle size={18} /></div><div className="stat-copy"><span>{locale === "ar" ? "مصروف الصندوق" : "Fund spend"}</span><strong className={spendMinor ? "amount-negative" : ""}>{money(spendMinor, locale)}</strong><small>{locale === "ar" ? "من الصندوق نفسه" : "from the family fund"}</small></div></article>
        <article className="stat-card"><div className="stat-icon green"><CalendarDays size={18} /></div><div className="stat-copy"><span>{locale === "ar" ? "صافي الصندوق" : "Fund net"}</span><strong className={balanceMinor < 0 ? "amount-negative" : ""}>{money(balanceMinor, locale)}</strong><small>{locale === "ar" ? `${alerts.length} تنبيه عجز` : `${alerts.length} deficit alerts`}</small></div></article>
      </section>
      </FoldWrap>
      <CollapsiblePanel
        id={`${spaceId}:fund-account`}
        heading={<><span className="section-kicker"><Landmark size={15} />{locale === "ar" ? "حساب الصندوق" : "Fund account"}</span><h2>{locale === "ar" ? "رقم الحساب أو ربط حساب المدير / أمين السر" : "IBAN or manager / secretary bank"}</h2></>}
        actions={<button type="button" className="secondary-button" onClick={() => setBankOpen(true)}>{locale === "ar" ? "حفظ الحساب" : "Save account"}</button>}
        foldLabel={locale === "ar" ? "طي حساب الصندوق" : "Fold fund account"}
      >
        {payout
          ? <p className="modal-note">{payout.label}: {payout.account_number}{payout.linked_member_id ? ` · ${members.find((item) => item.id === payout.linked_member_id)?.display_name ?? ""}` : ""}</p>
          : <p className="modal-note">{locale === "ar" ? "خصم المصروف من صندوق المنزل نفسه. سجّل رقم الحساب البنكي للصندوق أو اربطه بحساب المدير." : "Expenses debit this family fund. Record the fund IBAN or link the manager’s bank."}</p>}
      </CollapsiblePanel>
      <CollapsiblePanel
        id={`${spaceId}:family-events`}
        heading={<><span className="section-kicker"><CalendarDays size={15} />{locale === "ar" ? "تذكير وطلعات" : "Reminders and outings"}</span><h2>{locale === "ar" ? "المبلغ المتوقع مقابل الصندوق والدخل حتى ذلك التاريخ" : "Expected cost vs cash and inflows to that date"}</h2></>}
        actions={<button type="button" className="primary-button" onClick={() => setEventOpen(true)}><Plus size={15} />{locale === "ar" ? "تذكير / طلعة" : "Reminder / outing"}</button>}
        foldLabel={locale === "ar" ? "طي التذكيرات" : "Fold reminders"}
      >
        <div className="personal-loan-list">
          {events.filter((item) => item.space_id === spaceId).map((event) => (
            <div className={`personal-loan-row ${event.needsBoost ? "family-alert" : ""}`} key={event.id}>
              <div>
                <strong>{event.title}</strong>
                <span>{(kinds[event.kind] ?? kinds.other)[locale]} · {new Date(event.target_at).toLocaleDateString(locale === "ar" ? "ar-OM" : "en-GB")} · {locale === "ar" ? "متوقع" : "expected"} {money(event.expected_minor, locale)}</span>
                <span>{locale === "ar"
                  ? `المتوفر الآن ${money(balanceMinor, locale)} + دخل متوقع ${money(event.scheduledInflowMinor ?? 0, locale)} = ${money(event.projectedMinor ?? 0, locale)}`
                  : `On hand ${money(balanceMinor, locale)} + expected inflows ${money(event.scheduledInflowMinor ?? 0, locale)} = ${money(event.projectedMinor ?? 0, locale)}`}</span>
              </div>
              {event.needsBoost
                ? <b className="amount-negative">{locale === "ar" ? `عجز ${money(event.shortfallMinor ?? 0, locale)} — يحتاج تعزيز` : `Shortfall ${money(event.shortfallMinor ?? 0, locale)} — needs boost`}</b>
                : <b>{locale === "ar" ? "الغطاء كافٍ" : "Covered"}</b>}
            </div>
          ))}
          {!events.some((item) => item.space_id === spaceId) && <p className="empty-state">{locale === "ar" ? "أضف طلعة أو علاجاً بتاريخ ومبلغ متوقع ليحسب النظام العجز." : "Add an outing or treatment with a date and expected cost to forecast a shortfall."}</p>}
        </div>
      </CollapsiblePanel>
      {bankOpen && <BankModal locale={locale} spaceId={spaceId} members={members} payout={payout} onClose={() => setBankOpen(false)} onChanged={(next) => { onChanged(next); setBankOpen(false); }} />}
      {eventOpen && <EventModal locale={locale} spaceId={spaceId} currency={currency} onClose={() => setEventOpen(false)} onChanged={(next) => { onChanged(next); setEventOpen(false); }} />}
    </>
  );
}

function BankModal({ locale, spaceId, members, payout, onClose, onChanged }: { locale: Locale; spaceId: string; members: Member[]; payout?: PayoutAccount; onClose: () => void; onChanged: (next: Record<string, unknown>) => void }) {
  const [label, setLabel] = useState(payout?.label ?? (locale === "ar" ? "حساب صندوق المنزل" : "Family fund account"));
  const [accountNumber, setAccountNumber] = useState(payout?.account_number ?? "");
  const [linkedMemberId, setLinkedMemberId] = useState(payout?.linked_member_id ?? "");
  const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    const response = await apiFetch("/api/dashboard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "saveSpacePayoutAccount", idempotencyKey: crypto.randomUUID(), spaceId, label, accountNumber, linkedMemberId: linkedMemberId || undefined }) });
    const result = await response.json() as Record<string, unknown> & { error?: string };
    setSaving(false);
    if (!response.ok) { window.alert(result.error ?? "FAILED"); return; }
    onChanged(result);
  };
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal-card">
        <div className="modal-header"><h2>{locale === "ar" ? "حساب الصندوق" : "Fund account"}</h2><button type="button" onClick={onClose}><X size={20} /></button></div>
        <form className="modal-form" onSubmit={(event) => void submit(event)}>
          <label><span>{locale === "ar" ? "اسم الحساب" : "Account label"}</span><input required value={label} onChange={(event) => setLabel(event.target.value)} /></label>
          <label><span>{locale === "ar" ? "رقم الحساب / الآيبان" : "Account number / IBAN"}</span><input required value={accountNumber} onChange={(event) => setAccountNumber(event.target.value)} /></label>
          <label><span>{locale === "ar" ? "ربط بحساب عضو (مدير / أمين سر)" : "Link a member (manager / secretary)"}</span>
            <select value={linkedMemberId} onChange={(event) => setLinkedMemberId(event.target.value)}>
              <option value="">{locale === "ar" ? "حساب الصندوق مباشرة" : "Fund account directly"}</option>
              {members.map((member) => <option key={member.id} value={member.id}>{member.display_name} · {member.role}</option>)}
            </select>
          </label>
          <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>{locale === "ar" ? "إلغاء" : "Cancel"}</button><button className="primary-button" disabled={saving}>{saving ? "…" : (locale === "ar" ? "حفظ" : "Save")}</button></div>
        </form>
      </section>
    </div>
  );
}

function EventModal({ locale, spaceId, onClose, onChanged }: { locale: Locale; spaceId: string; currency: string; onClose: () => void; onChanged: (next: Record<string, unknown>) => void }) {
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("outing");
  const [targetAt, setTargetAt] = useState("");
  const [expected, setExpected] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    const response = await apiFetch("/api/dashboard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "addFamilyEvent", idempotencyKey: crypto.randomUUID(), spaceId, title, kind, targetAt, expected, notes }) });
    const result = await response.json() as Record<string, unknown> & { error?: string };
    setSaving(false);
    if (!response.ok) { window.alert(result.error ?? "FAILED"); return; }
    onChanged(result);
  };
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal-card">
        <div className="modal-header"><h2>{locale === "ar" ? "تذكير بطلعة أو التزام" : "Outing or commitment reminder"}</h2><button type="button" onClick={onClose}><X size={20} /></button></div>
        <form className="modal-form" onSubmit={(event) => void submit(event)}>
          <label><span>{locale === "ar" ? "العنوان" : "Title"}</span><input required value={title} onChange={(event) => setTitle(event.target.value)} placeholder={locale === "ar" ? "طلعة العيد / علاج خالد" : "Eid outing / Khalid treatment"} /></label>
          <label><span>{locale === "ar" ? "التخصيص" : "Purpose"}</span>
            <select value={kind} onChange={(event) => setKind(event.target.value)}>
              {Object.entries(kinds).map(([value, label]) => <option key={value} value={value}>{label[locale]}</option>)}
            </select>
          </label>
          <div className="form-row">
            <label><span>{locale === "ar" ? "التاريخ" : "Date"}</span><DateField required value={targetAt} onChange={setTargetAt} /></label>
            <label><span>{locale === "ar" ? "المبلغ المتوقع" : "Expected amount"}</span><div className="money-input"><input required type="number" min="0.01" step="0.001" value={expected} onChange={(event) => setExpected(event.target.value)} /><b className="money-currency"><OmrSymbol size={14} /></b></div></label>
          </div>
          <label><span>{locale === "ar" ? "ملاحظة" : "Notes"}</span><input value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
          <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>{locale === "ar" ? "إلغاء" : "Cancel"}</button><button className="primary-button" disabled={saving}>{saving ? "…" : (locale === "ar" ? "حفظ" : "Save")}</button></div>
        </form>
      </section>
    </div>
  );
}
