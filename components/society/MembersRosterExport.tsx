"use client";

import { useMemo, useState } from "react";
import { ArrowDownAZ, ArrowUpAZ, Download, Printer, Search, X } from "lucide-react";
import {
  ROSTER_COLUMNS,
  buildMemberRosterHtml,
  defaultRosterColumns,
  type RosterColumnId,
  type RosterMemberRow,
  type RosterSort,
} from "../../lib/member-roster-export";
import { downloadReportHtml, printWazenHtml, resolvePrintLogoUrl } from "../../lib/print-document";
import { consumePlanQuota } from "../../lib/plan-quota-client";
import { planHasFeature } from "../../lib/plan-features";

type Locale = "ar" | "en";

export function MembersRosterToolbar({
  locale,
  query,
  onQuery,
  sort,
  onSort,
  onOpenExport,
}: {
  locale: Locale;
  query: string;
  onQuery: (value: string) => void;
  sort: RosterSort;
  onSort: (value: RosterSort) => void;
  onOpenExport: () => void;
}) {
  return (
    <div className="section-title-actions roster-toolbar">
      <label className="search-field member-search">
        <Search size={16} />
        <input
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder={locale === "ar" ? "ابحث باسم المساهم" : "Search member name"}
        />
      </label>
      <button
        type="button"
        className={`secondary-button compact${sort === "alphaAsc" ? " is-active" : ""}`}
        title={locale === "ar" ? "فرز أبجدي أ → ي" : "Sort A → Z"}
        aria-pressed={sort === "alphaAsc"}
        onClick={() => onSort(sort === "alphaAsc" ? "asIs" : "alphaAsc")}
      >
        <ArrowDownAZ size={16} />
        <span>{locale === "ar" ? "أ→ي" : "A→Z"}</span>
      </button>
      <button
        type="button"
        className={`secondary-button compact${sort === "alphaDesc" ? " is-active" : ""}`}
        title={locale === "ar" ? "فرز أبجدي ي → أ" : "Sort Z → A"}
        aria-pressed={sort === "alphaDesc"}
        onClick={() => onSort(sort === "alphaDesc" ? "asIs" : "alphaDesc")}
      >
        <ArrowUpAZ size={16} />
        <span>{locale === "ar" ? "ي→أ" : "Z→A"}</span>
      </button>
      <button type="button" className="secondary-button compact" onClick={onOpenExport}>
        <Printer size={15} />
        {locale === "ar" ? "طباعة / تحميل الكشف" : "Print / download roster"}
      </button>
    </div>
  );
}

export function MembersRosterExportModal({
  locale,
  spaceName,
  spaceId,
  currency,
  issuerName,
  rows,
  features,
  initialSort,
  onClose,
}: {
  locale: Locale;
  spaceName: string;
  spaceId?: string;
  currency: string;
  issuerName?: string;
  rows: RosterMemberRow[];
  features?: string[];
  initialSort: RosterSort;
  onClose: () => void;
}) {
  const [columns, setColumns] = useState<RosterColumnId[]>(() => defaultRosterColumns());
  const [sort, setSort] = useState<RosterSort>(initialSort === "asIs" ? "alphaAsc" : initialSort);
  const [busy, setBusy] = useState(false);
  const canDownload = planHasFeature(features ?? [], "downloads");

  const selectedCount = columns.length;
  const previewNote = useMemo(() => {
    if (locale === "ar") return `${rows.length} عضواً · ${selectedCount} أعمدة`;
    return `${rows.length} members · ${selectedCount} columns`;
  }, [locale, rows.length, selectedCount]);

  const toggle = (id: RosterColumnId) => {
    setColumns((current) => {
      if (current.includes(id)) {
        if (id === "member") return current;
        return current.filter((item) => item !== id);
      }
      return ROSTER_COLUMNS.map((column) => column.id).filter((item) => item === id || current.includes(item));
    });
  };

  const buildHtml = (logoUrl: string) => buildMemberRosterHtml({
    locale,
    logoUrl,
    spaceName,
    currency,
    issuerName,
    columns,
    sort,
    rows,
  });

  const run = async (mode: "print" | "download") => {
    if (!columns.length || busy) return;
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
        if (!opened) window.alert(locale === "ar" ? "تعذر فتح نافذة الطباعة." : "Could not open the print window.");
        return;
      }
      const logoUrl = await resolvePrintLogoUrl();
      const stamp = new Date().toISOString().slice(0, 10);
      await downloadReportHtml(buildHtml(logoUrl), `wazen-members-${stamp}.html`);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "FAILED");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal-card" role="dialog" aria-modal="true" aria-label={locale === "ar" ? "كشف الأعضاء" : "Members roster"}>
        <div className="modal-header">
          <h2>{locale === "ar" ? "طباعة / تحميل كشف الأعضاء" : "Print / download members roster"}</h2>
          <button type="button" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </div>
        <div className="modal-form">
          <p className="modal-note">{previewNote}</p>
          <fieldset className="roster-column-picker">
            <legend>{locale === "ar" ? "الأعمدة الظاهرة في الكشف" : "Columns to include"}</legend>
            {ROSTER_COLUMNS.map((column) => (
              <label key={column.id} className="check-row">
                <input
                  type="checkbox"
                  checked={columns.includes(column.id)}
                  disabled={column.id === "member"}
                  onChange={() => toggle(column.id)}
                />
                <span>{locale === "ar" ? column.ar : column.en}</span>
              </label>
            ))}
          </fieldset>
          <label>
            <span>{locale === "ar" ? "ترتيب الأعضاء" : "Member order"}</span>
            <select value={sort} onChange={(event) => setSort(event.target.value as RosterSort)}>
              <option value="alphaAsc">{locale === "ar" ? "أبجدي أ → ي" : "Alphabetical A → Z"}</option>
              <option value="alphaDesc">{locale === "ar" ? "أبجدي ي → أ" : "Alphabetical Z → A"}</option>
              <option value="asIs">{locale === "ar" ? "ترتيب السجل الحالي" : "Current ledger order"}</option>
            </select>
          </label>
          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={onClose}>{locale === "ar" ? "إلغاء" : "Cancel"}</button>
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
