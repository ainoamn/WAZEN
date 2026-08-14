"use client";

import { CheckCircle2, Clock3, Mail, MessageCircle, Printer, Sparkles, X } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import OmrSymbol from "../brand/OmrSymbol";
import { apiFetch } from "../../lib/client-api";
import {
  allocateOldestFirst,
  buildInstallmentSchedule,
  remainingInstallmentMinor,
  selectByAmount,
  selectThroughOldest,
  totalRemainingMinor,
  type InstallmentLike,
} from "../../lib/installments";
import { formatMoneyMinor } from "../../lib/money";

type Locale = "ar" | "en";

export type AssociationMember = {
  id: string;
  space_id: string;
  display_name: string;
  email: string | null;
  phone?: string | null;
  role: string;
  due_minor: number;
  paid_minor: number;
  extra_minor: number;
  avatar: string;
  joined_at?: string;
};

export type AssociationInstallment = InstallmentLike & { member_id?: string; space_id?: string; due_at?: string };

export type AssociationSpace = { id: string; name_ar: string; name_en: string; type: string; currency: string };
export type AssociationPlan = { space_id?: string; amount_minor?: number; duration_months?: number; starts_at?: string };

function money(minor: number, currency: string, locale: Locale) {
  return formatMoneyMinor(minor, currency || "OMR", locale);
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
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
) {
  const rows = installments.filter((row) => (row as { member_id?: string }).member_id === member.id);
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

export function MemberDetailModal({
  member,
  space,
  plan,
  installments,
  locale,
  onClose,
  onSmartPay,
  onSendReceipt,
}: {
  member: AssociationMember;
  space: AssociationSpace;
  plan?: AssociationPlan | null;
  installments: AssociationInstallment[];
  locale: Locale;
  onClose: () => void;
  onSmartPay: () => void;
  onSendReceipt: () => void;
}) {
  const months = memberInstallments(member, installments, plan);
  const remaining = Math.max(0, member.due_minor - member.paid_minor);
  return (
    <Modal title={member.display_name} onClose={onClose}>
      <div className="modal-form">
        <div className="member-detail-meta">
          <div><span>{locale === "ar" ? "البريد" : "Email"}</span><b>{member.email || "—"}</b></div>
          <div><span>{locale === "ar" ? "الهاتف" : "Phone"}</span><b>{member.phone || "—"}</b></div>
          <div><span>{locale === "ar" ? "المدة" : "Duration"}</span><b>{months.length} {locale === "ar" ? "شهر" : "months"}</b></div>
          <div><span>{locale === "ar" ? "الإجمالي" : "Total"}</span><b>{money(member.due_minor, space.currency, locale)}</b></div>
          <div><span>{locale === "ar" ? "المدفوع" : "Paid"}</span><b>{money(member.paid_minor, space.currency, locale)}</b></div>
          <div><span>{locale === "ar" ? "المتبقي" : "Remaining"}</span><b>{money(remaining, space.currency, locale)}</b></div>
        </div>
        <div className="month-grid">
          {months.map((row) => (
            <article key={row.id} className={`month-chip ${row.status}`}>
              <small>{locale === "ar" ? `شهر ${row.period_index}` : `Month ${row.period_index}`}</small>
              <strong>{row.period_key}</strong>
              <em>{row.status === "paid" ? (locale === "ar" ? "مدفوع" : "Paid") : row.status === "partial" ? (locale === "ar" ? "جزئي" : "Partial") : (locale === "ar" ? "غير مدفوع" : "Unpaid")}</em>
              <span>{money(remainingInstallmentMinor(row), space.currency, locale)}</span>
            </article>
          ))}
        </div>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onSendReceipt}><Printer size={16} />{locale === "ar" ? "إرسال إيصال" : "Send receipt"}</button>
          <button type="button" className="primary-button" onClick={onSmartPay}><Sparkles size={16} />{locale === "ar" ? "المحاسب الذكي" : "Smart accountant"}</button>
        </div>
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
  const months = member ? memberInstallments(member, installments, plan) : [];
  const unpaid = months.filter((row) => remainingInstallmentMinor(row) > 0);
  const [selected, setSelected] = useState<string[]>([]);
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const ids = unpaid.map((row) => row.id);
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
            <div><span>{locale === "ar" ? "عليه" : "Owes"}</span><b>{money(Math.max(0, member.due_minor - member.paid_minor), space.currency, locale)}</b></div>
            <div><span>{locale === "ar" ? "أشهر متبقية" : "Open months"}</span><b>{unpaid.length}</b></div>
          </div>
        )}
        <div className="month-grid selectable">
          {unpaid.map((row) => (
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
}: {
  member: AssociationMember;
  locale: Locale;
  transactionId?: string;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const send = async (channel: "email" | "whatsapp" | "both") => {
    setSaving(true); setError("");
    try {
      const response = await apiFetch("/api/dashboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "sendReceipt", idempotencyKey: crypto.randomUUID(), memberId: member.id, transactionId, channel }),
      });
      const result = await response.json() as { error?: string; notification?: { whatsappUrl?: string | null; emailQueued?: boolean } };
      if (!response.ok) throw new Error(result.error ?? "SEND_FAILED");
      if (result.notification?.whatsappUrl && (channel === "whatsapp" || channel === "both")) {
        window.open(result.notification.whatsappUrl, "_blank", "noopener,noreferrer");
      }
      onDone(locale === "ar" ? "تم تجهيز الإيصال حسب بيانات المساهم المسجّلة." : "Receipt prepared using the member’s saved contact details.");
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
        {error && <p className="modal-error">{error}</p>}
        <div className="receipt-channel-grid">
          <button type="button" className="primary-button" disabled={saving || !member.email} onClick={() => void send("email")}><Mail size={16} />{locale === "ar" ? "بريد فقط" : "Email only"}</button>
          <button type="button" className="primary-button" disabled={saving || !member.phone} onClick={() => void send("whatsapp")}><MessageCircle size={16} />{locale === "ar" ? "واتساب فقط" : "WhatsApp only"}</button>
          <button type="button" className="primary-button" disabled={saving || !member.email || !member.phone} onClick={() => void send("both")}><CheckCircle2 size={16} />{locale === "ar" ? "كليهما" : "Both"}</button>
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
