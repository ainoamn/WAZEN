"use client";

import { useMemo, useState } from "react";
import {
  BarChart3,
  Download,
  FileBarChart,
  Printer,
  TrendingDown,
  TrendingUp,
  WalletCards,
  ShieldCheck,
} from "lucide-react";
import {
  REPORT_CATALOG,
  buildReportHtml,
  downloadReportHtml,
  printWazenHtml,
  type ReportTypeId,
} from "../../lib/reports";
import { buildAccountStatementHtml } from "../../lib/account-statement";
import { formatMoneyMinor } from "../../lib/money";
import { resolvePrintLogoUrl } from "../../lib/print-document";
import { planHasFeature } from "../../lib/plan-features";
import { consumePlanQuota } from "../../lib/plan-quota-client";

type Locale = "ar" | "en";

type Space = {
  id: string;
  name_ar: string;
  name_en: string;
  type: string;
  currency: string;
  balance_minor: number;
  goal_minor: number;
};

type Member = {
  id: string;
  space_id: string;
  display_name: string;
  email: string | null;
  role: string;
  due_minor: number;
  paid_minor: number;
  extra_minor: number;
};

type Transaction = {
  id: string;
  space_id: string;
  member_id: string | null;
  kind: string;
  allocation: string;
  amount_minor: number;
  description_ar: string;
  description_en: string;
  occurred_at: string;
  account_id?: string | null;
  status?: string;
};

type DashboardData = {
  user: { displayName: string };
  spaces: Space[];
  members: Member[];
  transactions: Transaction[];
  plans: Record<string, unknown>[];
  personalAccounts?: Array<{ id: string; space_id: string; name: string; opening_minor: number; balance_minor?: number }>;
  personalOccurrences?: Array<{ transaction_id?: string | null; rule_name?: string; account_id?: string | null }>;
  entitlements?: { features: string[] };
};

function money(minor: number, currency: string, locale: Locale) {
  return formatMoneyMinor(minor, currency || "OMR", locale);
}

function nameOf(space: Space, locale: Locale) {
  return locale === "ar" ? space.name_ar : space.name_en;
}

export function ReportsPanel({
  data,
  locale,
  totals,
}: {
  data: DashboardData;
  locale: Locale;
  totals: { net: number; groups: number; personal?: number; reserves?: number; spend: number };
}) {
  const groupSpaces = data.spaces.filter((space) => space.type !== "personal");
  const [reportType, setReportType] = useState<ReportTypeId>("general");
  const [spaceId, setSpaceId] = useState(groupSpaces[0]?.id ?? data.spaces[0]?.id ?? "");
  const [memberId, setMemberId] = useState("");
  const [accountId, setAccountId] = useState("");
  const personalAccounts = data.personalAccounts ?? [];
  const catalog = REPORT_CATALOG;
  const selectedMeta = catalog.find((item) => item.id === reportType) ?? catalog[0];
  const space = data.spaces.find((item) => item.id === spaceId) ?? null;
  const members = data.members.filter((member) => !spaceId || member.space_id === spaceId);
  const member = members.find((item) => item.id === memberId) ?? null;

  const months = useMemo(() => {
    return Array.from({ length: 12 }, (_, index) => {
      const date = new Date();
      date.setUTCDate(1);
      date.setUTCMonth(date.getUTCMonth() - (11 - index));
      return date;
    });
  }, []);

  const flow = months.map((date) => {
    const key = date.toISOString().slice(0, 7);
    const rows = data.transactions.filter((transaction) => transaction.occurred_at.slice(0, 7) === key);
    return {
      date,
      income: rows.filter((row) => ["income", "contribution"].includes(row.kind)).reduce((sum, row) => sum + row.amount_minor, 0),
      expense: rows.filter((row) => ["expense", "reimbursement"].includes(row.kind)).reduce((sum, row) => sum + row.amount_minor, 0),
    };
  });
  const income = data.transactions
    .filter((row) => ["income", "contribution"].includes(row.kind))
    .reduce((sum, row) => sum + row.amount_minor, 0);
  const maximum = Math.max(0, ...flow.flatMap((row) => [row.income, row.expense]));

  const buildHtml = (logoUrl: string) => {
    return buildReportHtml({
      locale,
      reportType,
      logoUrl,
      issuerName: data.user.displayName,
      space: spaceId ? space : null,
      member: selectedMeta.needsMember || memberId ? member : null,
      spaces: data.spaces,
      members: data.members,
      transactions: data.transactions,
      plans: data.plans as { space_id?: string; amount_minor?: number; duration_months?: number; extra_policy?: string }[],
    });
  };

  const statementHtml = (logoUrl: string) => buildAccountStatementHtml({
    locale,
    logoUrl,
    issuerName: data.user.displayName,
    spaces: data.spaces,
    members: data.members,
    accounts: personalAccounts,
    transactions: data.transactions,
    occurrences: data.personalOccurrences,
    spaceId: spaceId || null,
    accountId: accountId || null,
  });

  const canGenerate = !selectedMeta.needsMember || Boolean(member);
  const entityLabel = space ? nameOf(space, locale) : locale === "ar" ? "كل المحافظ" : "All wallets";
  const scopedAccounts = personalAccounts.filter((account) => !spaceId || account.space_id === spaceId);

  const canDownload = planHasFeature(data.entitlements?.features ?? [], "downloads");

  const download = () => {
    if (!canGenerate) return;
    if (!canDownload) { window.location.assign("/pricing"); return; }
    void consumePlanQuota("download", locale, spaceId || undefined).then((quota) => {
      if (!quota.ok) return;
      void resolvePrintLogoUrl().then((logoUrl) => {
        downloadReportHtml(buildHtml(logoUrl), `wazen-report-${reportType}-${space?.id ?? "all"}.pdf`);
      });
    });
  };

  const printReport = () => {
    if (!canGenerate) return;
    void consumePlanQuota("print", locale, spaceId || undefined).then((quota) => {
      if (!quota.ok) return;
      void printWazenHtml((logoUrl) => buildHtml(logoUrl), true).then((opened) => {
        if (!opened) {
          void printWazenHtml((logoUrl) => {
            const html = buildHtml(logoUrl);
            downloadReportHtml(html, `wazen-report-${space?.id ?? "all"}.pdf`);
            return html;
          }, false);
          window.alert(locale === "ar" ? "تم تنزيل التقرير لأن النافذة المنبثقة محظورة. افتح الملف ثم اضغط طباعة." : "Report downloaded because pop-ups are blocked. Open the file and print.");
        }
      });
    });
  };

  const printStatement = () => {
    void consumePlanQuota("print", locale, spaceId || undefined).then((quota) => {
      if (!quota.ok) return;
      void printWazenHtml((logoUrl) => statementHtml(logoUrl), true);
    });
  };

  return (
    <div className="dashboard-stack">
      <div className="section-title">
        <div>
          <h2>{locale === "ar" ? "التقارير" : "Reports"}</h2>
          <p>
            {locale === "ar"
              ? "كل تقرير يحمل شعار وازن واسم الجمعية أو المحفظة والبيانات المرتبطة"
              : "Every report includes the Wazen logo, wallet/association name, and linked data"}
          </p>
        </div>
        <div className="report-actions">
          <button type="button" className="secondary-button" onClick={printStatement}>
            <Printer size={16} />
            {locale === "ar" ? "كشف حساب بنكي" : "Bank statement"}
          </button>
          <button type="button" className="secondary-button" disabled={!canGenerate} onClick={printReport}>
            <Printer size={16} />
            {locale === "ar" ? "معاينة / طباعة PDF" : "Preview / Print PDF"}
          </button>
          <button type="button" className={`primary-button${canDownload ? "" : " is-plan-locked"}`} disabled={!canGenerate} onClick={download}>
            <Download size={16} />
            {locale === "ar" ? "تنزيل التقرير" : "Download report"}
          </button>
        </div>
      </div>

      <section className="stat-grid compact">
        <article className="stat-card"><div className="stat-icon green"><TrendingUp size={18} /></div><div className="stat-copy"><span>{locale === "ar" ? "الدخل" : "Income"}</span><strong>{money(income, "OMR", locale)}</strong><small>{locale === "ar" ? "إجمالي مسجل" : "recorded total"}</small></div></article>
        <article className="stat-card"><div className="stat-icon rose"><TrendingDown size={18} /></div><div className="stat-copy"><span>{locale === "ar" ? "المصروف" : "Expense"}</span><strong>{money(totals.spend, "OMR", locale)}</strong><small>{locale === "ar" ? "إجمالي مسجل" : "recorded total"}</small></div></article>
        <article className="stat-card"><div className="stat-icon navy"><WalletCards size={18} /></div><div className="stat-copy"><span>{locale === "ar" ? "صافي الرصيد" : "Net balance"}</span><strong>{money(totals.net, "OMR", locale)}</strong><small>{locale === "ar" ? "عبر كل المحافظ" : "across wallets"}</small></div></article>
        <article className="stat-card"><div className="stat-icon amber"><ShieldCheck size={18} /></div><div className="stat-copy"><span>{locale === "ar" ? "فوائض شخصية" : "Reserves"}</span><strong>{money(totals.reserves ?? 0, "OMR", locale)}</strong><small>{locale === "ar" ? "محمي" : "protected"}</small></div></article>
      </section>

      <article className="panel report-builder">
        <div className="panel-heading">
          <div>
            <span className="section-kicker"><FileBarChart size={15} />{locale === "ar" ? "منشئ التقارير" : "Report builder"}</span>
            <h2>{locale === "ar" ? selectedMeta.titleAr : selectedMeta.titleEn}</h2>
          </div>
          <strong className="report-entity">{entityLabel}</strong>
        </div>

        <div className="report-filters">
          <label>
            <span>{locale === "ar" ? "نوع التقرير" : "Report type"}</span>
            <select value={reportType} onChange={(event) => setReportType(event.target.value as ReportTypeId)}>
              {catalog.map((item) => (
                <option key={item.id} value={item.id}>{locale === "ar" ? item.titleAr : item.titleEn}</option>
              ))}
            </select>
          </label>
          <label>
            <span>{locale === "ar" ? "الجمعية / المحفظة" : "Association / wallet"}</span>
            <select value={spaceId} onChange={(event) => { setSpaceId(event.target.value); setMemberId(""); setAccountId(""); }}>
              <option value="">{locale === "ar" ? "كل المحافظ" : "All wallets"}</option>
              {data.spaces.map((item) => (
                <option key={item.id} value={item.id}>{nameOf(item, locale)}</option>
              ))}
            </select>
          </label>
          <label>
            <span>{locale === "ar" ? "العضو / العميل (إن لزم)" : "Member / client (if needed)"}</span>
            <select value={memberId} onChange={(event) => setMemberId(event.target.value)}>
              <option value="">—</option>
              {members.map((item) => (
                <option key={item.id} value={item.id}>{item.display_name}</option>
              ))}
            </select>
          </label>
          <label>
            <span>{locale === "ar" ? "حساب فرعي (للكشف)" : "Sub-account (statement)"}</span>
            <select value={accountId} onChange={(event) => setAccountId(event.target.value)}>
              <option value="">{locale === "ar" ? "كل الحسابات في النطاق" : "All accounts in scope"}</option>
              {scopedAccounts.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </label>
        </div>

        <p className="modal-note">
          {locale === "ar" ? selectedMeta.blurbAr : selectedMeta.blurbEn}
          {" · "}
          {locale === "ar"
            ? "التنزيل يتضمن شعار الموقع ثم اسم الجمعية/المحفظة ثم الجداول."
            : "Downloads include the site logo, then wallet/association name, then tables."}
        </p>
        {selectedMeta.needsMember && !member && (
          <p className="modal-error">{locale === "ar" ? "اختر عضواً/عميلاً لإنشاء هذا التقرير." : "Choose a member/client to generate this report."}</p>
        )}

        <div className="report-type-grid">
          {catalog.map((item) => (
            <button
              type="button"
              key={item.id}
              className={item.id === reportType ? "active" : ""}
              onClick={() => setReportType(item.id)}
            >
              <FileBarChart size={16} />
              <strong>{locale === "ar" ? item.titleAr : item.titleEn}</strong>
              <span>{locale === "ar" ? item.blurbAr : item.blurbEn}</span>
            </button>
          ))}
        </div>
      </article>

      <article className="panel report-chart">
        <div className="panel-heading">
          <div>
            <span className="section-kicker">{locale === "ar" ? "آخر 12 شهراً" : "Last 12 months"}</span>
            <h2>{locale === "ar" ? "التدفق المالي" : "Cash flow"}</h2>
          </div>
        </div>
        {maximum > 0 ? (
          <div className="bars-chart">
            {flow.map((row) => (
              <div className="bar-column" key={row.date.toISOString()}>
                <div className="bar-pair">
                  <i style={{ height: `${(row.income / maximum) * 100}%` }} />
                  <b style={{ height: `${(row.expense / maximum) * 100}%` }} />
                </div>
                <span>{new Intl.DateTimeFormat(locale === "ar" ? "ar-OM" : "en-US", { month: "short" }).format(row.date)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <BarChart3 size={22} />
            <span>{locale === "ar" ? "لا بيانات كافية لرسم التدفق بعد." : "Not enough data to chart cash flow yet."}</span>
          </div>
        )}
      </article>
    </div>
  );
}
