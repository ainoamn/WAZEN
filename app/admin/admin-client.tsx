"use client";

import { Activity, AlertTriangle, ArrowUpRight, BadgePercent, BarChart3, Bell, Building2, CheckCircle2, CreditCard, Download, FileText, Plus, Printer, Search, ShieldCheck, TrendingUp, UserCog, Users, WalletCards } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { ContentBusy, ErrorCard, money, Status, useCommerceLocale } from "../commercial-kit";
import { apiFetch } from "../../lib/client-api";
import { goToSignIn } from "../../lib/client-sign-in";
import { fetchAdminConsole, patchAdminConsole, readAdminConsole } from "../../lib/admin-session";
import { AdminConsole, AdminSwitch, EmptyRow } from "./admin-ui";
import { actionLabel, countryLabel, csvHeaderLabel, entityLabel, formatAdminDate, methodLabel, roleLabel, statusLabel } from "../../lib/admin-labels";

type Row = Record<string, unknown>;
type CustomerRow = Row & { id: string; email: string; display_name: string; created_at: string; status: string | null; country: string | null; last_seen_at: string | null; subscription_status: string | null; plan_name: string | null; current_period_start: string | null; current_period_end: string | null };
type AlertRow = { id: string; severity: "info" | "warning" | "danger"; href?: string; ar: string; en: string; count?: number };
type SubscriptionRow = Row & { id: string; status: string; plan_id: string };
type InvoiceRow = Row & { id: string; status: string; total_minor: number };
type PaymentRow = Row & { id: string; status: string; amount_minor: number; currency: string; reference: string; display_name: string | null; email: string | null; method: string; settlement_status: string };
type CouponRow = Row & { id: string; code: string; value: number; used_count: number; usage_limit: number; is_active: number };
type PlanRow = Row & { id: string; name_ar: string; name_en: string; monthly_minor: number };
type RoleRow = Row & { user_id: string; role: string; display_name: string | null; email: string | null };
type LogRow = Row & { id: string; action: string; display_name: string | null; user_id: string; entity_type: string; created_at: string };
type JobRunRow = { id: string; job: string; status: string; detail_json: string | null; created_at: string };
type ReadinessPayload = {
  ready: boolean;
  score: number;
  requiredPending: string[];
  checkoutProvider: string;
  rlsEnforce: boolean;
  items: Array<{ id: string; ok: boolean; required: boolean; labelAr: string; labelEn: string; hint?: string }>;
};
type AdminData = {
  user: Row;
  role: string;
  users: CustomerRow[];
  subscriptions: SubscriptionRow[];
  invoices: InvoiceRow[];
  payments: PaymentRow[];
  coupons: CouponRow[];
  plans: PlanRow[];
  roles: RoleRow[];
  logs: LogRow[];
  alerts?: AlertRow[];
  jobRuns?: JobRunRow[];
  readiness?: ReadinessPayload;
  platform?: { spaces: number; members: number; transactions: number; countries: number; monthlyRevenue?: Array<{ month: string; total: number }> };
};

function useAdminData() {
  const pathname = usePathname();
  const router = useRouter();
  const [data, setData] = useState<AdminData | null>(() => readAdminConsole<AdminData>());
  const [error, setError] = useState("");
  const load = useCallback(() => {
    return fetchAdminConsole()
      .then((result) => {
        setData(result as unknown as AdminData);
        setError("");
      })
      .catch((caught: Error) => {
        if (caught.message === "AUTH") {
          goToSignIn(pathname);
          return;
        }
        if (!readAdminConsole()) setError(caught.message === "FORBIDDEN" ? "FORBIDDEN" : "LOAD");
      });
  }, [pathname, router]);
  useEffect(() => { void load(); }, [load]);
  return {
    data,
    setData: (next: AdminData | null) => {
      if (next) patchAdminConsole(next as unknown as Parameters<typeof patchAdminConsole>[0]);
      setData(next);
    },
    error,
    load,
  };
}

async function adminAction(action: string, payload: Record<string, unknown> = {}): Promise<Partial<AdminData>> {
  const response = await apiFetch("/api/platform", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, idempotencyKey: crypto.randomUUID(), ...payload }),
  });
  const result = await response.json() as Partial<AdminData> & { error?: string };
  if (!response.ok) throw new Error(result.error);
  return result;
}

function AdminAccessError({ locale, forbidden, retry }: { locale: "ar" | "en"; forbidden: boolean; retry: () => void }) {
  return (
    <ErrorCard
      message={forbidden
        ? (locale === "ar" ? "لا تملك صلاحية دخول الإدارة" : "You do not have admin access")
        : (locale === "ar" ? "تعذر تحميل بيانات الإدارة" : "Could not load admin data")}
      retry={retry}
    />
  );
}

function PageHead({ eyebrow, title, text, actions }: { eyebrow: string; title: string; text: string; actions?: React.ReactNode }) {
  return (
    <div className="admin-page-head">
      <div>
        <small>{eyebrow}</small>
        <h1>{title}</h1>
        <p>{text}</p>
      </div>
      {actions ? <div className="plan-matrix-toolbar">{actions}</div> : null}
    </div>
  );
}

function Kpi({ icon, label, value, note }: { icon: React.ReactNode; label: string; value: string; note: string }) {
  return (
    <article>
      <i>{icon}</i>
      <span>{label}</span>
      <b>{value}</b>
      <small>{note}</small>
    </article>
  );
}

function downloadCsv(filename: string, rows: Row[], locale: "ar" | "en") {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]).filter((key) => !key.includes("json"));
  const header = keys.map((key) => `"${csvHeaderLabel(key, locale).replaceAll('"', '""')}"`).join(",");
  const csv = [header, ...rows.map((row) => keys.map((key) => `"${String(row[key] ?? "").replaceAll('"', '""')}"`).join(","))].join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function isInactiveUser(user: CustomerRow) {
  if (user.status === "suspended" || user.status === "closed") return true;
  const sub = user.subscription_status;
  if (!sub || sub === "cancelled" || sub === "suspended") return true;
  return false;
}

function AdminAlerts({ alerts, locale, l }: { alerts: AlertRow[]; locale: "ar" | "en"; l: (ar: string, en: string) => string }) {
  if (!alerts.length) return null;
  return (
    <section className="admin-panel admin-alerts">
      <div className="admin-panel-head">
        <div>
          <h2>{l("تنبيهات الإدارة", "Admin alerts")}</h2>
          <p>{l("باقات، مدفوعات، حسابات، ومراسلات تحتاج متابعة", "Plans, payments, accounts, and mail needing attention")}</p>
        </div>
        <Bell />
      </div>
      <div className="admin-alert-list">
        {alerts.map((alert) => {
          const body = (
            <>
              <AlertTriangle />
              <span>{locale === "ar" ? alert.ar : alert.en}</span>
              {alert.count ? <b>{alert.count}</b> : null}
            </>
          );
          return alert.href
            ? <Link key={alert.id} href={alert.href} className={`admin-alert is-${alert.severity}`}>{body}</Link>
            : <div key={alert.id} className={`admin-alert is-${alert.severity}`}>{body}</div>;
        })}
      </div>
    </section>
  );
}

export function AdminOverview() {
  const { locale, l } = useCommerceLocale();
  const { data, setData, error, load } = useAdminData();
  const [coupon, setCoupon] = useState("");
  const [value, setValue] = useState("20");
  const [working, setWorking] = useState(false);
  if (error) return <AdminAccessError locale={locale} forbidden={error === "FORBIDDEN"} retry={load} />;
  if (!data) return <ContentBusy />;

  const paid = data.payments.filter((payment) => payment.status === "succeeded").reduce((sum, payment) => sum + payment.amount_minor, 0);
  const active = data.subscriptions.filter((subscription) => ["active", "trialing"].includes(subscription.status)).length;
  const pending = data.invoices.filter((invoice) => invoice.status === "pending").reduce((sum, invoice) => sum + invoice.total_minor, 0);
  const plat = data.platform ?? { spaces: 0, members: 0, transactions: 0, countries: 0, monthlyRevenue: [] };
  const months = plat.monthlyRevenue ?? [];
  const maxMonth = Math.max(1, ...months.map((month) => Number(month.total) || 0));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setWorking(true);
    try {
      const next = await adminAction("createCoupon", { code: coupon, value: Number(value) });
      setData({ ...data, ...next });
      setCoupon("");
    } finally {
      setWorking(false);
    }
  };

  const modules = [
    { href: "/admin/users", icon: <Users size={18} />, ar: "المستخدمون والعملاء", en: "Users & customers", value: String(data.users.length) },
    { href: "/admin/tenants", icon: <Building2 size={18} />, ar: "الشركات والمستأجرون", en: "Tenants", value: String(plat.spaces) },
    { href: "/admin/plans", icon: <WalletCards size={18} />, ar: "مصفوفة الباقات (إدارة)", en: "Plan matrix (admin)", value: String(data.plans.length) },
    { href: "/admin/gateways", icon: <CreditCard size={18} />, ar: "بوابات الدفع", en: "Payment gateways", value: l("محلي / عالمي", "Local / global") },
    { href: "/admin/payments", icon: <FileText size={18} />, ar: "فواتير معلّقة", en: "Pending invoices", value: money(pending, locale) },
    { href: "/admin/reports", icon: <BarChart3 size={18} />, ar: "التقارير والإيرادات", en: "Reports & revenue", value: money(paid, locale) },
  ];

  return (
    <AdminConsole>
      <PageHead
        eyebrow={l("الإدارة / نظرة عامة", "Admin / Overview")}
        title={l("نظرة عامة", "Overview")}
        text={l("مؤشرات المنصة ومفاصل التحكم في أعمدة واضحة: حسابات، محافظ، تحصيل، ثم الكوبونات والتدقيق.", "Platform metrics and controls in clear columns: accounts, wallets, collections, then coupons and audit.")}
      />
      {data.alerts?.length ? <AdminAlerts alerts={data.alerts} locale={locale} l={l} /> : null}
      {data.readiness ? (
        <section className="admin-panel admin-alerts">
          <div className="admin-panel-head">
            <div>
              <h2>{l("جاهزية الإطلاق", "Launch readiness")}</h2>
              <p>
                {l("درجة", "Score")} {data.readiness.score}%
                {" · "}
                {data.readiness.ready ? l("المتطلبات الأساسية مكتملة", "Required items complete") : l("ينقص إعداد مطلوب", "Required setup pending")}
                {" · "}
                {data.readiness.checkoutProvider}
                {data.readiness.rlsEnforce ? " · RLS" : ""}
              </p>
            </div>
            <ShieldCheck />
          </div>
          <div className="admin-alert-list">
            {data.readiness.items.filter((item) => !item.ok).slice(0, 8).map((item) => (
              <div key={item.id} className={`admin-alert is-${item.required ? "warning" : "info"}`}>
                <AlertTriangle />
                <span>{locale === "ar" ? item.labelAr : item.labelEn}{item.hint ? ` — ${item.hint}` : ""}</span>
              </div>
            ))}
            {!data.readiness.items.some((item) => !item.ok) ? (
              <div className="admin-alert is-info">
                <CheckCircle2 />
                <span>{l("لا توجد فجوات ظاهرة في قائمة الجاهزية", "No gaps on the readiness checklist")}</span>
              </div>
            ) : null}
          </div>
          {data.jobRuns?.length ? (
            <div className="admin-table-wrap" style={{ marginTop: "1rem" }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>{l("مهمة", "Job")}</th>
                    <th>{l("الحالة", "Status")}</th>
                    <th>{l("الوقت", "When")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.jobRuns.slice(0, 8).map((run) => (
                    <tr key={run.id}>
                      <td>{run.job}</td>
                      <td><Status value={run.status === "ok" ? "active" : run.status === "skipped" ? "pending" : "closed"} locale={locale} /></td>
                      <td>{formatAdminDate(run.created_at, locale)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      ) : null}
      <div className="admin-kpis">
        <Kpi icon={<Users />} label={l("الحسابات", "Accounts")} value={String(data.users.length)} note={`${active} ${l("اشتراك نشط", "active plans")}`} />
        <Kpi icon={<WalletCards />} label={l("المحافظ", "Wallets")} value={String(plat.spaces)} note={`${plat.members} ${l("عضو نشط", "active members")}`} />
        <Kpi icon={<Activity />} label={l("الحركات المعتمدة", "Posted movements")} value={String(plat.transactions)} note={l("بعد الإلغاء لا تُحتسب", "voids excluded")} />
        <Kpi icon={<TrendingUp />} label={l("الإيراد المحصل", "Collected")} value={money(paid, locale)} note={`${plat.countries} ${l("دولة", "countries")}`} />
      </div>

      <div className="admin-overview-grid">
        <section className="admin-panel admin-revenue">
          <div className="admin-panel-head">
            <div>
              <h2>{l("التحصيل الشهري", "Monthly collections")}</h2>
              <p>{l("من المدفوعات الناجحة", "Successful payments")}</p>
            </div>
            <span><TrendingUp size={16} />{money(pending, locale)}</span>
          </div>
          <div className="admin-bars">
            {(months.length ? months : [{ month: "—", total: 0 }]).map((row, index) => (
              <i key={row.month + index} style={{ height: `${Math.max(8, Math.round((Number(row.total) || 0) / maxMonth * 100))}%` }} title={`${row.month} ${money(Number(row.total) || 0, locale)}`}>
                <em />
              </i>
            ))}
          </div>
        </section>
        <section className="admin-panel">
          <div className="admin-panel-head">
            <div>
              <h2>{l("مفاصل المنصة", "Platform modules")}</h2>
              <p>{l("افتح الصفحة للمقارنة والتعديل", "Open a page to compare and edit")}</p>
            </div>
          </div>
          <div className="admin-module-grid">
            {modules.map((item) => (
              <Link key={item.href} href={item.href}>
                <i>{item.icon}</i>
                <span>{locale === "ar" ? item.ar : item.en}</span>
                <b>{item.value}</b>
              </Link>
            ))}
          </div>
        </section>
      </div>

      <div className="admin-overview-grid bottom">
        <section className="admin-panel">
          <div className="admin-panel-head">
            <div>
              <h2>{l("الكوبونات والخصومات", "Coupons & discounts")}</h2>
              <p>{l("رموز نشطة ومحكومة بحدود استخدام", "Active codes with usage limits")}</p>
            </div>
          </div>
          <form className="coupon-create" onSubmit={(event) => void submit(event)}>
            <input required value={coupon} onChange={(event) => setCoupon(event.target.value.toUpperCase())} placeholder="WAZEN25" aria-label={l("رمز الكوبون", "Coupon code")} />
            <input type="number" min={1} max={100} value={value} onChange={(event) => setValue(event.target.value)} aria-label={l("نسبة الخصم", "Discount percent")} />
            <button disabled={working}><Plus size={16} />{l("إنشاء", "Create")}</button>
          </form>
          <div className="coupon-list">
            {data.coupons.map((row) => (
              <div key={row.id}>
                <BadgePercent />
                <code>{row.code}</code>
                <b>{row.value}%</b>
                <span>{row.used_count}/{row.usage_limit} {l("استخدام", "uses")}</span>
                <Status value={row.is_active ? "active" : "closed"} locale={locale} />
              </div>
            ))}
            {!data.coupons.length ? <p>{l("لا كوبونات بعد.", "No coupons yet.")}</p> : null}
          </div>
        </section>
        <section className="admin-panel">
          <div className="admin-panel-head">
            <div>
              <h2>{l("فريق الإدارة", "Admin team")}</h2>
              <p>{l("الأدوار المطبقة من جهة الخادم", "Server-enforced roles")}</p>
            </div>
          </div>
          <div className="role-list">
            {data.roles.filter((row) => row.role !== "customer").map((row) => (
              <div key={row.user_id}>
                <i><UserCog /></i>
                <span><b>{row.display_name}</b><small>{row.email}</small></span>
                <code>{roleLabel(row.role, locale)}</code>
              </div>
            ))}
            {!data.roles.some((row) => row.role !== "customer") ? <p>{l("حسابك هو مدير المنصة الأول.", "Your account is the first platform administrator.")}</p> : null}
          </div>
        </section>
      </div>

      <section className="admin-panel">
        <div className="admin-panel-head">
          <div>
            <h2>{l("سجل التدقيق", "Audit log")}</h2>
            <p>{l("آخر العمليات الإدارية الحساسة", "Recent sensitive administrative actions")}</p>
          </div>
          <Activity />
        </div>
        <div className="audit-list">
          {data.logs.length
            ? data.logs.map((row) => (
              <div key={row.id}>
                <CheckCircle2 />
                <span><b>{actionLabel(row.action, locale)}</b><small>{row.display_name ?? row.user_id} · {entityLabel(row.entity_type, locale)}</small></span>
                <time>{formatAdminDate(row.created_at, locale, true)}</time>
              </div>
            ))
            : <p>{l("ستظهر الإجراءات هنا فور تنفيذها.", "Administrative actions will appear here.")}</p>}
        </div>
      </section>
    </AdminConsole>
  );
}

export function AdminUsers() {
  const { locale, l } = useCommerceLocale();
  const { data, setData, error, load } = useAdminData();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [working, setWorking] = useState("");
  if (error) return <AdminAccessError locale={locale} forbidden={error === "FORBIDDEN"} retry={load} />;
  if (!data) return <ContentBusy />;

  const rows = data.users.filter((user) =>
    (filter === "all" || user.status === filter)
    && `${user.display_name} ${user.email}`.toLowerCase().includes(query.toLowerCase()),
  );

  const change = async (userId: string, status: string) => {
    setWorking(userId);
    const next = await adminAction("setUserStatus", { userId, status });
    setData({ ...data, ...next });
    setWorking("");
  };

  return (
    <AdminConsole>
      <PageHead
        eyebrow={l("الإدارة / العملاء", "Admin / Customers")}
        title={l("المستخدمون والعملاء", "Users & customers")}
        text={l("صف العناوين ثم رأس كل عميل. فعّل أو أوقف الحساب من العمود مباشرة.", "Title row, then each customer. Activate or suspend from the column.")}
        actions={<button type="button" onClick={() => downloadCsv("wazen-customers.csv", rows, locale)}><Download size={16} />{l("تصدير", "Export")}</button>}
      />
      <div className="admin-kpis">
        <Kpi icon={<Users />} label={l("إجمالي الحسابات", "Total accounts")} value={String(data.users.length)} note={l("كل العملاء", "all customers")} />
        <Kpi icon={<CheckCircle2 />} label={l("نشطون", "Active")} value={String(data.users.filter((user) => user.status === "active").length)} note={l("يمكنهم الدخول", "can sign in")} />
        <Kpi icon={<CreditCard />} label={l("تجربة مجانية", "Trialing")} value={String(data.users.filter((user) => user.subscription_status === "trialing").length)} note={l("قيد التجربة", "in trial")} />
        <Kpi icon={<ShieldCheck />} label={l("موقوفون", "Suspended")} value={String(data.users.filter((user) => user.status === "suspended").length)} note={l("مراجعة مطلوبة", "review needed")} />
      </div>
      <div className="admin-filters">
        <label><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={l("بحث بالاسم أو البريد...", "Search name or email...")} /></label>
        <select value={filter} onChange={(event) => setFilter(event.target.value)}>
          <option value="all">{l("كل الحالات", "All statuses")}</option>
          <option value="active">{l("نشط", "Active")}</option>
          <option value="suspended">{l("موقوف", "Suspended")}</option>
        </select>
      </div>
      <div className="plan-matrix-shell">
        <table className="plan-matrix admin-data-table">
          <thead>
            <tr>
              <th className="plan-matrix-titles" scope="col">{l("العناوين", "Titles")}</th>
              <th scope="col">{l("الدولة", "Country")}</th>
              <th scope="col">{l("الباقة", "Plan")}</th>
              <th scope="col">{l("حالة الباقة", "Plan status")}</th>
              <th scope="col">{l("بداية الباقة", "Plan start")}</th>
              <th scope="col">{l("نهاية الباقة", "Plan end")}</th>
              <th scope="col">{l("آخر نشاط", "Last seen")}</th>
              <th scope="col">{l("الحالة", "Status")}</th>
              <th scope="col">{l("الوصول", "Access")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((user) => {
              const active = user.status !== "suspended";
              const inactive = isInactiveUser(user);
              return (
                <tr key={user.id} className={inactive ? "is-inactive" : undefined}>
                  <th className="plan-matrix-label" scope="row">
                    <div>
                      <span>
                        <b><Link href={`/admin/users/${encodeURIComponent(user.id)}`}>{user.display_name}</Link></b>
                        <small>{user.email}</small>
                      </span>
                    </div>
                  </th>
                  <td>{user.country ? countryLabel(String(user.country), locale) : "—"}</td>
                  <td>{user.plan_name ?? "—"}</td>
                  <td><Status value={user.subscription_status ?? "pending"} locale={locale} /></td>
                  <td>{formatAdminDate(user.current_period_start, locale)}</td>
                  <td>{formatAdminDate(user.current_period_end, locale)}</td>
                  <td>{formatAdminDate(user.last_seen_at, locale)}</td>
                  <td><Status value={user.status ?? "active"} locale={locale} /></td>
                  <td className="plan-matrix-switch">
                    <AdminSwitch
                      on={active}
                      disabled={working === user.id}
                      label={active ? l("إيقاف", "Suspend") : l("تفعيل", "Activate")}
                      onToggle={() => void change(user.id, active ? "suspended" : "active")}
                    />
                  </td>
                </tr>
              );
            })}
            {!rows.length ? <EmptyRow cols={9} message={l("لا عملاء مطابقون.", "No matching customers.")} /> : null}
          </tbody>
        </table>
      </div>
    </AdminConsole>
  );
}

export function AdminPayments() {
  const { locale, l } = useCommerceLocale();
  const { data, setData, error, load } = useAdminData();
  const [filter, setFilter] = useState("all");
  const [working, setWorking] = useState("");
  if (error) return <AdminAccessError locale={locale} forbidden={error === "FORBIDDEN"} retry={load} />;
  if (!data) return <ContentBusy />;

  const rows = data.payments.filter((payment) => filter === "all" || payment.status === filter);
  const total = (status: string) => data.payments.filter((payment) => payment.status === status).reduce((sum, payment) => sum + payment.amount_minor, 0);
  const change = async (paymentId: string, status: string) => {
    setWorking(paymentId);
    const next = await adminAction("setPaymentStatus", { paymentId, status });
    setData({ ...data, ...next });
    setWorking("");
  };

  const tabs = [
    ["all", l("الكل", "All")],
    ["succeeded", l("ناجح", "Succeeded")],
    ["pending", l("معلّق", "Pending")],
    ["failed", l("فاشل", "Failed")],
    ["refunded", l("مسترد", "Refunded")],
  ] as const;

  return (
    <AdminConsole>
      <PageHead
        eyebrow={l("الإدارة / المالية", "Admin / Finance")}
        title={l("المدفوعات والفواتير", "Payments & invoices")}
        text={l("كل عملية عمود مقارنة: المرجع، العميل، المبلغ، ثم حالة التحصيل من الصف.", "Each payment is a comparable row: reference, customer, amount, then settlement status.")}
        actions={<button type="button" onClick={() => downloadCsv("wazen-payments.csv", rows, locale)}><Download size={16} />{l("تنزيل الكشف", "Download statement")}</button>}
      />
      <div className="admin-kpis">
        <Kpi icon={<TrendingUp />} label={l("المحصل", "Collected")} value={money(total("succeeded"), locale)} note={l("مدفوعات ناجحة", "successful payments")} />
        <Kpi icon={<CreditCard />} label={l("بانتظار التسوية", "Pending settlement")} value={money(total("pending"), locale)} note={`${data.payments.filter((payment) => payment.status === "pending").length} ${l("عملية", "transactions")}`} />
        <Kpi icon={<Activity />} label={l("مدفوعات فاشلة", "Failed payments")} value={money(total("failed"), locale)} note={l("تحتاج متابعة", "needs attention")} />
        <Kpi icon={<FileText />} label={l("مبالغ مستردة", "Refunded")} value={money(total("refunded"), locale)} note={l("موثقة في السجل", "logged")} />
      </div>
      <div className="admin-filters">
        <div className="filter-tabs">
          {tabs.map(([value, label]) => (
            <button type="button" className={filter === value ? "active" : ""} onClick={() => setFilter(value)} key={value}>{label}</button>
          ))}
        </div>
      </div>
      <div className="plan-matrix-shell">
        <table className="plan-matrix admin-data-table">
          <thead>
            <tr>
              <th className="plan-matrix-titles" scope="col">{l("العناوين", "Titles")}</th>
              <th scope="col">{l("العميل", "Customer")}</th>
              <th scope="col">{l("المبلغ", "Amount")}</th>
              <th scope="col">{l("الطريقة", "Method")}</th>
              <th scope="col">{l("التسوية", "Settlement")}</th>
              <th scope="col">{l("الحالة", "Status")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((payment) => (
              <tr key={payment.id}>
                <th className="plan-matrix-label" scope="row">
                  <div>
                    <span>
                      <b><code>{payment.reference}</code></b>
                      <small>{payment.id}</small>
                    </span>
                  </div>
                </th>
                <td><b>{payment.display_name}</b><small>{payment.email}</small></td>
                <td><b>{money(payment.amount_minor, locale, payment.currency)}</b></td>
                <td>{methodLabel(payment.method, locale)}</td>
                <td>{statusLabel(payment.settlement_status, locale)}</td>
                <td>
                  <select disabled={working === payment.id} value={payment.status} onChange={(event) => void change(payment.id, event.target.value)}>
                    <option value="pending">{l("معلّق", "Pending")}</option>
                    <option value="succeeded">{l("ناجح", "Succeeded")}</option>
                    <option value="failed">{l("فاشل", "Failed")}</option>
                    <option value="refunded">{l("مسترد", "Refunded")}</option>
                  </select>
                </td>
              </tr>
            ))}
            {!rows.length ? <EmptyRow cols={6} message={l("لا مدفوعات في هذا التبويب.", "No payments in this tab.")} /> : null}
          </tbody>
        </table>
      </div>
    </AdminConsole>
  );
}

export function AdminReports() {
  const { locale, l } = useCommerceLocale();
  const { data, error, load } = useAdminData();
  if (error) return <AdminAccessError locale={locale} forbidden={error === "FORBIDDEN"} retry={load} />;
  if (!data) return <ContentBusy />;

  const active = data.subscriptions.filter((subscription) => ["active", "trialing"].includes(subscription.status));
  const mrr = active.reduce((sum, subscription) => sum + (data.plans.find((plan) => plan.id === subscription.plan_id)?.monthly_minor ?? 0), 0);
  const paid = data.payments.filter((payment) => payment.status === "succeeded").reduce((sum, payment) => sum + payment.amount_minor, 0);
  const arpu = Math.round(mrr / Math.max(1, active.length));
  const churn = Math.round(data.users.filter((user) => user.status === "suspended").length / Math.max(1, data.users.length) * 1000) / 10;
  const maxPlan = Math.max(1, ...data.plans.map((plan) => data.subscriptions.filter((subscription) => subscription.plan_id === plan.id).length));

  return (
    <AdminConsole>
      <PageHead
        eyebrow={l("الإدارة / التقارير", "Admin / Reports")}
        title={l("التقارير والإيرادات", "Reports & revenue")}
        text={l("الباقات أعمدة مقارنة: الإيراد المتوقع، عدد الاشتراكات، ونسبة كل باقة من المحفظة.", "Plans as comparison columns: expected revenue, subscriber count, and share of the book.")}
        actions={
          <>
            <button type="button" onClick={() => window.print()}><Printer size={16} />{l("طباعة", "Print")}</button>
            <button type="button" onClick={() => downloadCsv("wazen-reports.csv", data.invoices, locale)}><Download size={16} />{l("تنزيل Excel", "Download Excel")}</button>
          </>
        }
      />
      <div className="admin-kpis">
        <Kpi icon={<TrendingUp />} label={l("الإيراد السنوي المتوقع", "Annual recurring revenue")} value={money(mrr * 12, locale)} note={l("سنوي متكرر", "ARR")} />
        <Kpi icon={<BarChart3 />} label={l("الإيراد الشهري المتكرر", "Monthly recurring revenue")} value={money(mrr, locale)} note={l("شهري متكرر", "MRR")} />
        <Kpi icon={<Users />} label={l("متوسط دخل العميل", "Revenue per customer")} value={money(arpu, locale)} note={l("متوسط العميل", "ARPU")} />
        <Kpi icon={<Activity />} label={l("معدل الإلغاء/الإيقاف", "Churn / suspension")} value={`${churn}%`} note={l("من الحسابات", "of accounts")} />
      </div>

      <div className="plan-matrix-shell">
        <table className="plan-matrix">
          <thead>
            <tr>
              <th className="plan-matrix-titles" scope="col">{l("العناوين", "Titles")}</th>
              {data.plans.map((plan) => (
                <th key={plan.id} className="plan-matrix-head" scope="col">
                  <span>{plan.id}</span>
                  <strong>{locale === "ar" ? plan.name_ar : plan.name_en}</strong>
                  <b>{money(plan.monthly_minor, locale)}</b>
                  <small>{l("شهرياً", "per month")}</small>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th className="plan-matrix-label" scope="row"><div><span><b>{l("الاشتراكات", "Subscriptions")}</b></span></div></th>
              {data.plans.map((plan) => {
                const count = data.subscriptions.filter((subscription) => subscription.plan_id === plan.id).length;
                return <td key={plan.id}><b>{count}</b></td>;
              })}
            </tr>
            <tr>
              <th className="plan-matrix-label" scope="row"><div><span><b>{l("حصة المحفظة", "Share")}</b></span></div></th>
              {data.plans.map((plan) => {
                const count = data.subscriptions.filter((subscription) => subscription.plan_id === plan.id).length;
                return (
                  <td key={plan.id}>
                    <div className="admin-share">
                      <i><em style={{ width: `${Math.round(count / maxPlan * 100)}%` }} /></i>
                      <small>{Math.round(count / maxPlan * 100)}%</small>
                    </div>
                  </td>
                );
              })}
            </tr>
            <tr>
              <th className="plan-matrix-label" scope="row"><div><span><b>{l("إيراد شهري تقديري", "Estimated MRR")}</b></span></div></th>
              {data.plans.map((plan) => {
                const count = data.subscriptions.filter((subscription) => subscription.plan_id === plan.id).length;
                return <td key={plan.id}><b>{money(plan.monthly_minor * count, locale)}</b></td>;
              })}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="admin-report-grid">
        <section className="admin-panel">
          <div className="admin-panel-head"><h2>{l("مؤشرات الاشتراك", "Subscription metrics")}</h2></div>
          <dl className="report-metrics">
            <div><dt>{l("نشطة وتجريبية", "Active & trial")}</dt><dd>{active.length}</dd></div>
            <div><dt>{l("بانتظار الدفع", "Awaiting payment")}</dt><dd>{data.subscriptions.filter((subscription) => subscription.status === "pending_payment").length}</dd></div>
            <div><dt>{l("فواتير مدفوعة", "Paid invoices")}</dt><dd>{data.invoices.filter((invoice) => invoice.status === "paid").length}</dd></div>
            <div><dt>{l("إجمالي التحصيل", "Total collected")}</dt><dd>{money(paid, locale)}</dd></div>
          </dl>
        </section>
        <section className="admin-panel">
          <div className="admin-panel-head"><h2>{l("تقارير جاهزة", "Ready reports")}</h2></div>
          <div className="report-buttons">
            {[l("تقرير الإيراد الشهري", "Monthly revenue"), l("تقرير الضريبة", "Tax report"), l("تقرير الاشتراكات", "Subscriptions"), l("تقرير الكوبونات", "Coupon usage"), l("تقرير التحصيل", "Collections"), l("سجل التدقيق", "Audit log")].map((label) => (
              <button type="button" onClick={() => window.print()} key={label}><FileText size={16} />{label}<ArrowUpRight size={16} /></button>
            ))}
          </div>
        </section>
      </div>
    </AdminConsole>
  );
}
