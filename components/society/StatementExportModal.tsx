"use client";

import { useMemo, useState } from "react";
import { Download, Printer, X } from "lucide-react";
import {
  STATEMENT_COLUMNS,
  buildAccountStatementHtml,
  buildAccountStatementModel,
  defaultStatementColumns,
  type StatementColumnId,
  type StatementHolding,
  type StatementTxnFilter,
} from "../../lib/account-statement";
import {
  ROSTER_COLUMNS,
  defaultRosterColumns,
  duesRosterColumns,
  type RosterColumnId,
  type RosterMemberRow,
  type RosterSort,
} from "../../lib/member-roster-export";
import {
  buildReceiptQrDataUrl,
  downloadReportHtml,
  printWazenHtml,
  resolvePrintLogoUrl,
  shareWazenPdfWithText,
} from "../../lib/print-document";
import { consumePlanQuota } from "../../lib/plan-quota-client";
import { planHasFeature } from "../../lib/plan-features";
import { apiFetch } from "../../lib/client-api";
import { buildAssociationStatementWhatsAppMessage } from "../../lib/statement-share";
import { formatDebitMoneyMinor, formatMoneyMinor } from "../../lib/money";

type Locale = "ar" | "en";
type ReportKind = "movements" | "dues";

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
  const societyMembers = Boolean(memberRows?.length);
  const [reportKind, setReportKind] = useState<ReportKind>(societyMembers ? "dues" : "movements");
  const [filter, setFilter] = useState<StatementTxnFilter>("full");
  const [columns, setColumns] = useState<StatementColumnId[]>(defaultStatementColumns());
  const [includeMembers, setIncludeMembers] = useState(Boolean(memberRows?.length));
  const [memberSort, setMemberSort] = useState<RosterSort>("alphaAsc");
  const [memberColumns, setMemberColumns] = useState<RosterColumnId[]>(
    societyMembers ? duesRosterColumns() : defaultRosterColumns(),
  );
  const [busy, setBusy] = useState(false);
  const canDownload = planHasFeature(features ?? [], "downloads");
  const duesOnly = reportKind === "dues";
  const currency = spaces.find((space) => space.id === spaceId)?.currency || "OMR";

  const summary = useMemo(() => {
    if (duesOnly) {
      return locale === "ar"
        ? `${spaceName} · كشف متأخرات: الاسم + المدفوع + المتأخر حتى الشهر الحالي`
        : `${spaceName} · dues sheet: name + paid + arrears to current month`;
    }
    if (locale === "ar") {
      return `${spaceName} · ${columns.length} أعمدة حركات${includeMembers ? ` · أعضاء (${memberSort === "alphaAsc" ? "أ→ي" : memberSort === "alphaDesc" ? "ي→أ" : "سجل"})` : ""}`;
    }
    return `${spaceName} · ${columns.length} movement columns${includeMembers ? ` · members (${memberSort})` : ""}`;
  }, [locale, spaceName, columns.length, includeMembers, memberSort, duesOnly]);

  const applyReportKind = (kind: ReportKind) => {
    setReportKind(kind);
    if (kind === "dues") {
      setIncludeMembers(true);
      setMemberColumns(duesRosterColumns());
      setMemberSort("alphaAsc");
      setColumns([]);
      return;
    }
    setColumns(defaultStatementColumns());
    setIncludeMembers(false);
    setMemberColumns(defaultRosterColumns());
  };

  const toggleColumn = (id: StatementColumnId) => {
    setColumns((current) => {
      if (current.includes(id)) {
        if (current.length <= 1) return current;
        return current.filter((item) => item !== id);
      }
      return STATEMENT_COLUMNS.map((column) => column.id).filter((item) => item === id || current.includes(item));
    });
  };

  const toggleMemberColumn = (id: RosterColumnId) => {
    setMemberColumns((current) => {
      if (current.includes(id)) {
        if (id === "member") return current;
        if (current.length <= 1) return current;
        return current.filter((item) => item !== id);
      }
      return ROSTER_COLUMNS.map((column) => column.id).filter((item) => item === id || current.includes(item));
    });
  };

  const buildHtml = (logoUrl: string, extras?: { verifyUrl?: string; qrDataUrl?: string }) => buildAccountStatementHtml({
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
    columns: duesOnly ? [] : columns,
    holdings,
    includeMovements: !duesOnly,
    includeHoldings: !duesOnly,
    includeMembers: duesOnly ? societyMembers : (includeMembers && societyMembers),
    memberRows,
    memberColumns,
    memberSort,
    verifyUrl: extras?.verifyUrl,
    qrDataUrl: extras?.qrDataUrl,
    titleOverride: duesOnly
      ? (locale === "ar" ? "كشف المتأخرات حتى الشهر الحالي" : "Arrears statement to current month")
      : undefined,
    subtitleOverride: duesOnly
      ? (locale === "ar"
        ? "أسماء الأعضاء مع المدفوع والمتأخر المستحق حتى نهاية الشهر الحالي. الهدف والتفاصيل اختياريان."
        : "Member names with paid and arrears through the current month. Goal and details are optional.")
      : undefined,
  });

  const ensureVerifyLink = async () => {
    const response = await apiFetch("/api/dashboard", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "createAssociationStatementShare",
        idempotencyKey: crypto.randomUUID(),
        spaceId,
        filter: duesOnly ? "full" : filter,
        locale,
      }),
    });
    const result = await response.json() as { error?: string; notification?: { receiptUrl?: string | null } };
    if (!response.ok) throw new Error(result.error ?? "SHARE_FAILED");
    return String(result.notification?.receiptUrl ?? "").trim();
  };

  const buildSummaryMessage = (statementUrl: string) => {
    const model = buildAccountStatementModel({
      locale,
      issuerName,
      spaces,
      members,
      accounts,
      transactions,
      occurrences,
      spaceId,
      txnFilter: filter,
      holdings,
    });
    const paid = (memberRows ?? []).reduce((sum, row) => sum + row.paid_minor, 0);
    const arrears = (memberRows ?? []).reduce((sum, row) => sum + Math.max(0, row.owes_minor), 0);
    const late = (memberRows ?? []).filter((row) => row.owes_minor > 0).length;
    const filterLabel = duesOnly
      ? (locale === "ar" ? "متأخرات الأعضاء حتى الشهر الحالي" : "Member arrears to current month")
      : (FILTERS.find((item) => item.id === filter)?.[locale] ?? filter);
    return buildAssociationStatementWhatsAppMessage({
      locale,
      walletName: spaceName,
      filterLabel,
      balanceLabel: formatMoneyMinor(model.closingMinor, currency, locale),
      movementsLabel: String(model.movementCount),
      statementUrl,
      kind: duesOnly ? "dues" : "movements",
      availableLabel: formatMoneyMinor(model.availableMinor, currency, locale),
      expensesLabel: formatMoneyMinor(model.expenseMinor, currency, locale),
      paidLabel: formatMoneyMinor(paid, currency, locale),
      arrearsLabel: arrears > 0
        ? formatDebitMoneyMinor(arrears, currency, locale)
        : formatMoneyMinor(0, currency, locale),
      lateMembersLabel: String(late),
    });
  };

  const run = async (mode: "print" | "download" | "whatsapp") => {
    if (busy) return;
    if (duesOnly && !societyMembers) {
      window.alert(locale === "ar" ? "لا يوجد أعضاء لهذا الكشف." : "No members available for this statement.");
      return;
    }
    if (!duesOnly && !columns.length && !(includeMembers && societyMembers)) {
      window.alert(locale === "ar" ? "اختر عموداً واحداً على الأقل أو أرفق الأعضاء." : "Pick at least one column or attach members.");
      return;
    }
    if (mode === "download" && !canDownload) {
      window.alert(locale === "ar" ? "التحميل غير متاح في خطتك الحالية." : "Downloads are not available on your current plan.");
      return;
    }
    if (mode === "whatsapp" && canShare === false) {
      window.alert(locale === "ar" ? "المشاركة عبر واتساب غير متاحة في خطتك." : "WhatsApp sharing is not available on your plan.");
      return;
    }
    setBusy(true);
    try {
      const quota = await consumePlanQuota(
        mode === "download" ? "download" : "print",
        locale,
        spaceId,
      );
      if (!quota.ok) return;

      let verifyUrl = "";
      let qrDataUrl = "";
      if (mode === "whatsapp" || canShare !== false) {
        try {
          verifyUrl = await ensureVerifyLink();
          if (verifyUrl) qrDataUrl = await buildReceiptQrDataUrl(verifyUrl);
        } catch {
          if (mode === "whatsapp") throw new Error(locale === "ar" ? "تعذر تجهيز رابط الكشف." : "Could not prepare statement link.");
        }
      }

      if (mode === "whatsapp") {
        const text = buildSummaryMessage(verifyUrl);
        const stamp = new Date().toISOString().slice(0, 10);
        const result = await shareWazenPdfWithText({
          buildHtml: (logoUrl) => buildHtml(logoUrl, { verifyUrl, qrDataUrl }),
          text,
          filename: duesOnly ? `wazen-dues-${stamp}.pdf` : `wazen-statement-${stamp}.pdf`,
          title: spaceName,
        });
        if (result === "failed" && onShare && !duesOnly) {
          onShare(filter);
        } else if (result === "downloaded") {
          window.alert(locale === "ar"
            ? "تم تنزيل ملف PDF. أكمل الإرسال من واتساب مع الملخص الظاهر."
            : "PDF downloaded. Finish sending from WhatsApp with the summary text.");
        }
        onClose();
        return;
      }

      if (mode === "print") {
        const opened = await printWazenHtml((logoUrl) => buildHtml(logoUrl, { verifyUrl, qrDataUrl }), true);
        if (!opened) window.alert(locale === "ar" ? "اسمح بالنوافذ المنبثقة أو استخدم زر الطباعة داخل المعاينة." : "Allow pop-ups or use Print inside the preview.");
        return;
      }
      const logoUrl = await resolvePrintLogoUrl();
      const stamp = new Date().toISOString().slice(0, 10);
      await downloadReportHtml(
        buildHtml(logoUrl, { verifyUrl, qrDataUrl }),
        duesOnly ? `wazen-dues-${stamp}.pdf` : `wazen-statement-${stamp}.pdf`,
      );
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

          {societyMembers ? (
            <label>
              <span>{locale === "ar" ? "نوع الكشف" : "Statement type"}</span>
              <select value={reportKind} onChange={(event) => applyReportKind(event.target.value as ReportKind)}>
                <option value="dues">{locale === "ar" ? "متأخرات الأعضاء (اسم · مدفوع · متأخر حتى الشهر الحالي)" : "Member dues (name · paid · arrears to current month)"}</option>
                <option value="movements">{locale === "ar" ? "كشف الحركات / الحساب" : "Movements / account statement"}</option>
              </select>
            </label>
          ) : null}

          {!duesOnly ? (
            <>
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
                      onChange={() => toggleColumn(column.id)}
                    />
                    <span>{locale === "ar" ? column.ar : column.en}</span>
                  </label>
                ))}
              </fieldset>

              {societyMembers ? (
                <label className="check-row">
                  <input type="checkbox" checked={includeMembers} onChange={(event) => setIncludeMembers(event.target.checked)} />
                  <span>{locale === "ar" ? "إرفاق جدول الأعضاء في نفس الكشف" : "Attach members table to the same statement"}</span>
                </label>
              ) : null}
            </>
          ) : null}

          {(duesOnly || includeMembers) && societyMembers ? (
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
                <legend>{locale === "ar" ? "أعمدة الأعضاء (الهدف والتفاصيل اختياريان)" : "Member columns (goal & details optional)"}</legend>
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

          <p className="modal-note">
            {duesOnly
              ? (locale === "ar"
                ? "المتأخر بالأحمر. المتوفر = نقد + ودائع. فعّل «التفاصيل / ملاحظات الدفع» لطباعة آخر دفعة والملاحظات."
                : "Arrears print in red. Available = cash + holdings. Enable “Details / payment notes” to print last payment notes.")
              : (locale === "ar"
                ? "واتساب يرسل ملخصاً + ملف PDF فيه رمز للتحقق. المتأخرات تظهر بالأحمر."
                : "WhatsApp sends a summary + PDF with a verification QR. Arrears appear in red.")}
          </p>

          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={onClose}>{locale === "ar" ? "إلغاء" : "Cancel"}</button>
            <button
              type="button"
              className="secondary-button"
              disabled={busy || canShare === false}
              onClick={() => void run("whatsapp")}
            >
              {locale === "ar" ? "واتساب (PDF)" : "WhatsApp (PDF)"}
            </button>
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
