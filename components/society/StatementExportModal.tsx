"use client";

import { useMemo, useState } from "react";
import { Download, Printer, X } from "lucide-react";
import {
  STATEMENT_COLUMNS,
  buildAccountStatementHtml,
  defaultStatementColumns,
  type StatementColumnId,
  type StatementHolding,
  type StatementTxnFilter,
} from "../../lib/account-statement";
import {
  ROSTER_COLUMNS,
  defaultRosterColumns,
  type RosterColumnId,
  type RosterMemberRow,
  type RosterSort,
} from "../../lib/member-roster-export";
import { downloadReportHtml, printWazenHtml, resolvePrintLogoUrl } from "../../lib/print-document";
import { consumePlanQuota } from "../../lib/plan-quota-client";
import { planHasFeature } from "../../lib/plan-features";

type Locale = "ar" | "en";

const FILTERS: Array<{ id: StatementTxnFilter; ar: string; en: string }> = [
  { id: "full", ar: "الكشف الكامل", en: "Full statement" },
  { id: "valid", ar: "المعاملات الصحيحة", en: "Valid transactions" },
  { id: "voided", ar: "المعاملات المحذوفة", en: "Deleted transactions" },
  { id: "all", ar: "كل المعاملات", en: "All transactions" },
];

export function StatementExportModal({
  locale,
  spaceId,
  spaceName,
  issuerName,
  features,
  spaces,
  members,
  accounts,
  transactions,
  occurrences,
  holdings,
  memberRows,
  canShare,
  onShare,
  onClose,
}: {
  locale: Locale;
  spaceId: string;
  spaceName: string;
  issuerName: string;
  features?: string[];
  spaces: Array<{ id: string; name_ar: string; name_en: string; type: string; currency: string; balance_minor: number }>;
  members: Array<{ id: string; space_id: string; display_name: string }>;
  accounts?: Array<{ id: string; space_id: string; name: string; opening_minor: number; balance_minor?: number }>;
  transactions: Array<{
    id: string;
    space_id: string;
    member_id?: string | null;
    account_id?: string | null;
    kind: string;
    allocation?: string;
    amount_minor: number;
    description_ar: string;
    description_en: string;
    status?: string;
    occurred_at: string;
  }>;
  occurrences?: Array<{ transaction_id?: string | null; rule_name?: string; account_id?: string | null }>;
  holdings?: StatementHolding[];
  memberRows?: RosterMemberRow[];
  canShare?: boolean;
  onShare?: (filter: StatementTxnFilter) => void;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState<StatementTxnFilter>("full");
  const [columns, setColumns] = useState<StatementColumnId[]>(defaultStatementColumns());
  const [includeMembers, setIncludeMembers] = useState(Boolean(memberRows?.length));
  const [memberSort, setMemberSort] = useState<RosterSort>("alphaAsc");
  const [memberColumns, setMemberColumns] = useState<RosterColumnId[]>(defaultRosterColumns());
  const [busy, setBusy] = useState(false);
  const canDownload = planHasFeature(features ?? [], "downloads");
  const societyMembers = Boolean(memberRows?.length);

  const summary = useMemo(() => {
    if (locale === "ar") {
      return `${spaceName} · ${columns.length} أعمدة حركات${includeMembers ? ` · أعضاء (${memberSort === "alphaAsc" ? "أ→ي" : memberSort === "alphaDesc" ? "ي→أ" : "سجل"})` : ""}`;
    }
    return `${spaceName} · ${columns.length} movement columns${includeMembers ? ` · members (${memberSort})` : ""}`;
  }, [locale, spaceName, columns.length, includeMembers, memberSort]);

  const toggleColumn = (id: StatementColumnId) => {
    setColumns((current) => {
      if (current.includes(id)) {
        if (id === "description" || id === "when") return current;
        return current.filter((item) => item !== id);
      }
      return STATEMENT_COLUMNS.map((column) => column.id).filter((item) => item === id || current.includes(item));
    });
  };

  const toggleMemberColumn = (id: RosterColumnId) => {
    setMemberColumns((current) => {
      if (current.includes(id)) {
        if (id === "member") return current;
        return current.filter((item) => item !== id);
      }
      return ROSTER_COLUMNS.map((column) => column.id).filter((item) => item === id || current.includes(item));
    });
  };

  const buildHtml = (logoUrl: string) => buildAccountStatementHtml({
    locale,
    logoUrl,
    issuerName,
    spaces,
    members,
    accounts,
    transactions,
    occurrences,
    spaceId,
    txnFilter: filter,
    columns,
    holdings,
    includeMembers: includeMembers && societyMembers,
    memberRows,
    memberColumns,
    memberSort,
  });

  const run = async (mode: "print" | "download") => {
    if (busy) return;
    if (mode === "download" && !canDownload) {
      window.alert(locale === "ar" ? "التحميل غير متاح في خطتك الحالية." : "Downloads are not available on your current plan.");
      return;
    }
    setBusy(true);
    try {
      const quota = await consumePlanQuota(mode === "download" ? "download" : "print", locale, spaceId);
      if (!quota.ok) return;
      if (mode === "print") {
        const opened = await printWazenHtml((logoUrl) => buildHtml(logoUrl), true);
        if (!opened) window.alert(locale === "ar" ? "اسمح بالنوافذ المنبثقة أو استخدم زر الطباعة داخل المعاينة." : "Allow pop-ups or use Print inside the preview.");
        return;
      }
      const logoUrl = await resolvePrintLogoUrl();
      const stamp = new Date().toISOString().slice(0, 10);
      await downloadReportHtml(buildHtml(logoUrl), `wazen-statement-${stamp}.html`);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "FAILED");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal-card wide-modal" role="dialog" aria-modal="true" aria-label={locale === "ar" ? "كشف حساب" : "Account statement"}>
        <div className="modal-header">
          <h2>{locale === "ar" ? "طباعة / تحميل كشف الحساب" : "Print / download statement"}</h2>
          <button type="button" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </div>
        <div className="modal-form statement-export-form">
          <p className="modal-note">{summary}</p>
          <label>
            <span>{locale === "ar" ? "نطاق المعاملات" : "Transaction scope"}</span>
            <select value={filter} onChange={(event) => setFilter(event.target.value as StatementTxnFilter)}>
              {FILTERS.map((item) => (
                <option key={item.id} value={item.id}>{locale === "ar" ? item.ar : item.en}</option>
              ))}
            </select>
          </label>

          <fieldset className="roster-column-picker">
            <legend>{locale === "ar" ? "أعمدة الحركات في الكشف" : "Movement columns"}</legend>
            {STATEMENT_COLUMNS.map((column) => (
              <label key={column.id} className="check-row">
                <input
                  type="checkbox"
                  checked={columns.includes(column.id)}
                  disabled={column.id === "description" || column.id === "when"}
                  onChange={() => toggleColumn(column.id)}
                />
                <span>{locale === "ar" ? column.ar : column.en}</span>
              </label>
            ))}
          </fieldset>

          {societyMembers ? (
            <>
              <label className="check-row">
                <input type="checkbox" checked={includeMembers} onChange={(event) => setIncludeMembers(event.target.checked)} />
                <span>{locale === "ar" ? "إرفاق جدول الأعضاء في نفس الكشف" : "Attach members table to the same statement"}</span>
              </label>
              {includeMembers ? (
                <>
                  <label>
                    <span>{locale === "ar" ? "ترتيب الأعضاء" : "Member order"}</span>
                    <select value={memberSort} onChange={(event) => setMemberSort(event.target.value as RosterSort)}>
                      <option value="alphaAsc">{locale === "ar" ? "أبجدي أ → ي" : "Alphabetical A → Z"}</option>
                      <option value="alphaDesc">{locale === "ar" ? "أبجدي ي → أ" : "Alphabetical Z → A"}</option>
                      <option value="asIs">{locale === "ar" ? "ترتيب السجل" : "Ledger order"}</option>
                    </select>
                  </label>
                  <fieldset className="roster-column-picker">
                    <legend>{locale === "ar" ? "أعمدة الأعضاء" : "Member columns"}</legend>
                    {ROSTER_COLUMNS.map((column) => (
                      <label key={column.id} className="check-row">
                        <input
                          type="checkbox"
                          checked={memberColumns.includes(column.id)}
                          disabled={column.id === "member"}
                          onChange={() => toggleMemberColumn(column.id)}
                        />
                        <span>{locale === "ar" ? column.ar : column.en}</span>
                      </label>
                    ))}
                  </fieldset>
                </>
              ) : null}
            </>
          ) : null}

          <p className="modal-note">
            {locale === "ar"
              ? "الودائع تظهر كتحويل من النقد (ليست مصروفاً). النقد الختامي منفصل عن إجمالي الأصول."
              : "Deposits appear as cash transfers (not expenses). Closing cash is separate from total assets."}
          </p>

          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={onClose}>{locale === "ar" ? "إلغاء" : "Cancel"}</button>
            {onShare ? (
              <button
                type="button"
                className="secondary-button"
                disabled={busy || canShare === false}
                onClick={() => {
                  if (canShare === false) return;
                  onShare(filter);
                  onClose();
                }}
              >
                {locale === "ar" ? "واتساب" : "WhatsApp"}
              </button>
            ) : null}
            <button type="button" className="secondary-button" disabled={busy} onClick={() => void run("download")}>
              <Download size={15} />{locale === "ar" ? "تحميل" : "Download"}
            </button>
            <button type="button" className="primary-button" disabled={busy} onClick={() => void run("print")}>
              <Printer size={15} />{locale === "ar" ? "طباعة" : "Print"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
