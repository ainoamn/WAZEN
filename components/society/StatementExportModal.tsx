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
  duesRosterColumns,
  owingRosterColumns,
  paidRosterColumns,
  type RosterColumnId,
  type RosterMemberRow,
  type RosterSort,
} from "../../lib/member-roster-export";
import {
  buildReceiptQrDataUrl,
  downloadReportHtml,
  printWazenHtml,
  resolvePrintLogoUrl,
} from "../../lib/print-document";
import { consumePlanQuota } from "../../lib/plan-quota-client";
import { planHasFeature } from "../../lib/plan-features";
import { apiFetch } from "../../lib/client-api";
import { buildAssociationStatementWhatsAppMessage } from "../../lib/statement-share";
import { openWhatsAppUrl, whatsappShareUrl } from "../../lib/receipt-share";
type Locale = "ar" | "en";
/** Member sheets: all dues, payers only, or owing only. */
type ReportKind = "movements" | "dues" | "dues_paid" | "dues_owing";

const FILTERS: Array<{ id: StatementTxnFilter; ar: string; en: string }> = [
  { id: "full", ar: "الكشف الكامل", en: "Full statement" },
  { id: "valid", ar: "المعاملات الصحيحة", en: "Valid transactions" },
  { id: "voided", ar: "المعاملات المحذوفة", en: "Deleted transactions" },
  { id: "all", ar: "كل المعاملات", en: "All transactions" },
];

function isMemberSheet(kind: ReportKind) {
  return kind === "dues" || kind === "dues_paid" || kind === "dues_owing";
}

function filterMemberRows(kind: ReportKind, rows: RosterMemberRow[] | undefined) {
  const list = rows ?? [];
  if (kind === "dues_paid") return list.filter((row) => row.paid_minor > 0);
  if (kind === "dues_owing") return list.filter((row) => row.owes_minor > 0);
  return list;
}

function reportCopy(kind: ReportKind, locale: Locale, spaceName: string) {
  if (kind === "dues_paid") {
    return locale === "ar"
      ? {
          title: "كشف المسدّدين",
          intro: `هذا كشف بأسماء الأشخاص الذين سددوا مبالغاً فقط، مرتبط بجمعية «${spaceName}».`,
          sheetLabel: "المسدّدون (دفعوا مبالغاً)",
          summary: `${spaceName} · كشف المسدّدين فقط`,
          empty: "لا يوجد أعضاء مسدّدون (بمبالغ مدفوعة) في هذه الجمعية.",
          file: "wazen-paid",
          whatsapp: "المسدّدون فقط",
        }
      : {
          title: "Payers statement",
          intro: `This sheet lists only members who have paid amounts, for association “${spaceName}”.`,
          sheetLabel: "Payers (paid amounts)",
          summary: `${spaceName} · payers only`,
          empty: "No members with paid amounts in this association.",
          file: "wazen-paid",
          whatsapp: "Payers only",
        };
  }
  if (kind === "dues_owing") {
    return locale === "ar"
      ? {
          title: "كشف المترتبة عليهم مبالغ",
          intro: `هذا كشف بأسماء الأشخاص المترتبة عليهم مبالغ فقط، مرتبط بجمعية «${spaceName}».`,
          sheetLabel: "المترتبة عليهم مبالغ",
          summary: `${spaceName} · كشف المتأخرين فقط`,
          empty: "لا يوجد أعضاء مترتبة عليهم مبالغ في هذه الجمعية.",
          file: "wazen-owing",
          whatsapp: "المترتبة عليهم مبالغ فقط",
        }
      : {
          title: "Arrears-only statement",
          intro: `This sheet lists only members who still owe amounts, for association “${spaceName}”.`,
          sheetLabel: "Members who owe",
          summary: `${spaceName} · owing members only`,
          empty: "No members with outstanding amounts in this association.",
          file: "wazen-owing",
          whatsapp: "Owing members only",
        };
  }
  if (kind === "dues") {
    return locale === "ar"
      ? {
          title: "كشف المتأخرات حتى الشهر الحالي",
          intro: `هذا كشف متأخرات الأعضاء (الاسم والمدفوع والمتأخر حتى الشهر الحالي)، مرتبط بجمعية «${spaceName}».`,
          sheetLabel: "متأخرات الأعضاء حتى الشهر الحالي",
          summary: `${spaceName} · كشف متأخرات: الاسم + المدفوع + المتأخر حتى الشهر الحالي`,
          empty: "لا يوجد أعضاء لهذا الكشف.",
          file: "wazen-dues",
          whatsapp: "متأخرات الأعضاء حتى الشهر الحالي",
        }
      : {
          title: "Arrears statement to current month",
          intro: `This is the member dues sheet (name, paid, and arrears through the current month) for association “${spaceName}”.`,
          sheetLabel: "Member arrears to current month",
          summary: `${spaceName} · dues sheet: name + paid + arrears to current month`,
          empty: "No members available for this statement.",
          file: "wazen-dues",
          whatsapp: "Member arrears to current month",
        };
  }
  return locale === "ar"
    ? {
        title: "",
        intro: `هذا كشف حركات حساب الجمعية، مرتبط بجمعية «${spaceName}».`,
        sheetLabel: "",
        summary: "",
        empty: "",
        file: "wazen-statement",
        whatsapp: "",
      }
    : {
        title: "",
        intro: `This is the association account movements statement for “${spaceName}”.`,
        sheetLabel: "",
        summary: "",
        empty: "",
        file: "wazen-statement",
        whatsapp: "",
      };
}

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
  const memberSheet = isMemberSheet(reportKind);
  const copy = reportCopy(reportKind, locale, spaceName);
  const selectedMembers = useMemo(
    () => filterMemberRows(reportKind, memberRows),
    [reportKind, memberRows],
  );

  const summary = useMemo(() => {
    if (memberSheet) return copy.summary;
    if (locale === "ar") {
      return `${spaceName} · ${columns.length} أعمدة حركات${includeMembers ? ` · أعضاء (${memberSort === "alphaAsc" ? "أ→ي" : memberSort === "alphaDesc" ? "ي→أ" : "سجل"})` : ""}`;
    }
    return `${spaceName} · ${columns.length} movement columns${includeMembers ? ` · members (${memberSort})` : ""}`;
  }, [locale, spaceName, columns.length, includeMembers, memberSort, memberSheet, copy.summary]);

  const applyReportKind = (kind: ReportKind) => {
    setReportKind(kind);
    if (kind === "dues") {
      setIncludeMembers(true);
      setMemberColumns(duesRosterColumns());
      setMemberSort("alphaAsc");
      setColumns([]);
      return;
    }
    if (kind === "dues_paid") {
      setIncludeMembers(true);
      setMemberColumns(paidRosterColumns());
      setMemberSort("alphaAsc");
      setColumns([]);
      return;
    }
    if (kind === "dues_owing") {
      setIncludeMembers(true);
      setMemberColumns(owingRosterColumns());
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

  const movementsIntro = locale === "ar"
    ? `هذا كشف حركات حساب الجمعية، مرتبط بجمعية «${spaceName}».`
    : `This is the association account movements statement for “${spaceName}”.`;

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
    columns: memberSheet ? [] : columns,
    holdings,
    includeMovements: !memberSheet,
    includeHoldings: !memberSheet,
    includeMembers: memberSheet ? selectedMembers.length > 0 : (includeMembers && societyMembers),
    memberRows: memberSheet ? selectedMembers : memberRows,
    memberColumns,
    memberSort,
    verifyUrl: extras?.verifyUrl,
    qrDataUrl: extras?.qrDataUrl,
    titleOverride: memberSheet ? copy.title : undefined,
    subtitleOverride: memberSheet ? copy.intro : movementsIntro,
    memberSheetLabel: memberSheet ? copy.sheetLabel : undefined,
  });

  const ensureVerifyLink = async () => {
    const response = await apiFetch("/api/dashboard", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "createAssociationStatementShare",
        idempotencyKey: crypto.randomUUID(),
        spaceId,
        filter: memberSheet ? "full" : filter,
        locale,
      }),
    });
    const result = await response.json() as { error?: string; notification?: { receiptUrl?: string | null } };
    if (!response.ok) throw new Error(result.error ?? "SHARE_FAILED");
    return String(result.notification?.receiptUrl ?? "").trim();
  };

  const buildSummaryMessage = (statementUrl: string) => {
    const filterLabel = memberSheet
      ? copy.whatsapp
      : (FILTERS.find((item) => item.id === filter)?.[locale] ?? filter);
    return buildAssociationStatementWhatsAppMessage({
      locale,
      walletName: spaceName,
      filterLabel,
      balanceLabel: "",
      movementsLabel: "",
      statementUrl,
      kind: memberSheet ? "dues" : "movements",
    });
  };

  const run = async (mode: "print" | "download" | "whatsapp") => {
    if (busy) return;
    if (memberSheet && !societyMembers) {
      window.alert(locale === "ar" ? "لا يوجد أعضاء لهذا الكشف." : "No members available for this statement.");
      return;
    }
    if (memberSheet && !selectedMembers.length) {
      window.alert(copy.empty);
      return;
    }
    if (!memberSheet && !columns.length && !(includeMembers && societyMembers)) {
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
      // WhatsApp: only mint a short link — no QR / heavy HTML (avoids 30s+ freezes on phones).
      if (mode === "whatsapp") {
        const verifyUrl = await ensureVerifyLink();
        if (!verifyUrl) throw new Error(locale === "ar" ? "تعذر تجهيز رابط الكشف." : "Could not prepare statement link.");
        const text = buildSummaryMessage(verifyUrl);
        openWhatsAppUrl(whatsappShareUrl(null, text));
        onClose();
        return;
      }

      const quota = await consumePlanQuota(
        mode === "download" ? "download" : "print",
        locale,
        spaceId,
      );
      if (!quota.ok) return;

      let verifyUrl = "";
      let qrDataUrl = "";
      if (canShare !== false) {
        try {
          verifyUrl = await ensureVerifyLink();
          if (verifyUrl) qrDataUrl = await buildReceiptQrDataUrl(verifyUrl);
        } catch {
          /* print/download still work without QR */
        }
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
        `${copy.file}-${stamp}.html`,
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
                <option value="dues">
                  {locale === "ar"
                    ? "متأخرات الأعضاء (اسم · مدفوع · متأخر حتى الشهر الحالي)"
                    : "Member dues (name · paid · arrears to current month)"}
                </option>
                <option value="dues_paid">
                  {locale === "ar"
                    ? "كشف المسدّدين فقط (من دفعوا مبالغاً)"
                    : "Payers only (who paid amounts)"}
                </option>
                <option value="dues_owing">
                  {locale === "ar"
                    ? "كشف المترتبة عليهم مبالغ فقط"
                    : "Owing members only"}
                </option>
                <option value="movements">
                  {locale === "ar" ? "كشف الحركات / الحساب" : "Movements / account statement"}
                </option>
              </select>
            </label>
          ) : null}

          {memberSheet ? (
            <p className="modal-note">
              {copy.intro}
              {" · "}
              {locale === "ar" ? "عدد الأسماء:" : "Names:"} {selectedMembers.length}
            </p>
          ) : null}

          {!memberSheet ? (
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

          {(memberSheet || includeMembers) && societyMembers ? (
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
            {locale === "ar"
              ? "التحميل والطباعة بنفس الوضوح. واتساب يرسل شرحاً للكشف + رابط فتح/تنزيل من الموقع (مثل الإيصالات)."
              : "Download and print stay crisp. WhatsApp sends an explanation plus an open/download link (same as receipts)."}
          </p>

          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={onClose}>{locale === "ar" ? "إلغاء" : "Cancel"}</button>
            <button
              type="button"
              className="secondary-button"
              disabled={busy || canShare === false}
              onClick={() => void run("whatsapp")}
            >
              {locale === "ar" ? "واتساب" : "WhatsApp"}
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
