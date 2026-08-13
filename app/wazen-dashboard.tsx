"use client";

import OmrSymbol from "../components/brand/OmrSymbol";
import { WazenIcon } from "../components/brand/WazenLogo";
import WazenPageLoader from "../components/brand/WazenPageLoader";
import { ReportsPanel } from "../components/reports/ReportsPanel";
import { formatMoneyMinor } from "../lib/money";
import {
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  Bell,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  Download,
  Printer,
  Trash2,
  Pencil,
  MessageCircle,
  Globe2,
  HandCoins,
  House,
  Landmark,
  LayoutDashboard,
  Menu,
  Plane,
  Plus,
  ReceiptText,
  Repeat2,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  UserPlus,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState, startTransition } from "react";
import { apiFetch } from "../lib/client-api";

type Locale = "ar" | "en";
type ViewId = "overview" | "personal" | "household" | "groups" | "trip" | "society" | "transactions" | "reports" | "settings";

type User = { id: string; email: string; displayName: string; isDemo: boolean };
type Space = {
  id: string;
  owner_user_id: string;
  name_ar: string;
  name_en: string;
  type: string;
  currency: string;
  balance_minor: number;
  goal_minor: number;
  accent: string;
  created_at: string;
};
type Member = {
  id: string;
  space_id: string;
  display_name: string;
  email: string | null;
  role: string;
  status: string;
  due_minor: number;
  paid_minor: number;
  extra_minor: number;
  avatar: string;
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
  status: string;
  occurred_at: string;
};
type CircleTurn = { id: string; space_id: string; member_id: string; display_name: string; turn_number: number; status: string; amount_minor: number };
type TripExpense = { id: string; space_id: string; paid_by_member_id: string; paid_by_name: string; amount_minor: number; description: string; occurred_at: string };
type ExpenseSplit = { id: string; expense_id: string; member_id: string; display_name: string; share_minor: number };
type Settlement = { id: string; space_id: string; from_member_id: string; to_member_id: string; from_member_name: string | null; to_member_name: string | null; amount_minor: number; status: string };
type DashboardData = { user: User; spaces: Space[]; members: Member[]; transactions: Transaction[]; plans: Record<string, unknown>[]; circleTurns: CircleTurn[]; tripExpenses: TripExpense[]; expenseSplits: ExpenseSplit[]; settlements: Settlement[] };

const copy = {
  ar: {
    greeting: "صباح الخير",
    subtitle: "هذه صورتك المالية حتى اليوم",
    overview: "نظرة عامة",
    personal: "المحفظة الشخصية",
    household: "المنزل والعائلة",
    groups: "الأعضاء",
    trip: "محفظة السفر",
    society: "الجمعيات",
    transactions: "العمليات",
    reports: "التقارير",
    settings: "الإعدادات",
    workspace: "مساحتي المالية",
    add: "إضافة عملية",
    newWallet: "محفظة جديدة",
    totalBalance: "صافي الرصيد",
    spendableFunds: "رصيد المجموعات",
    personalReserves: "فوائض شخصية",
    monthlySpend: "مصروف أغسطس",
    versus: "عن الشهر الماضي",
    protected: "محمي ولا يدخل في الصندوق",
    wallets: "محافظك",
    viewAll: "عرض الكل",
    tripGoal: "هدف رحلة العائلة",
    collected: "تم جمعه من الهدف",
    projected: "بالمعدل الحالي تصلون للهدف في مايو 2027",
    commonFund: "الصندوق المشترك",
    membersReserves: "فوائض الأعضاء",
    cashHeld: "النقد الفعلي",
    clarity: "لا تختلط الأرصدة الشخصية بأموال المجموعة",
    recent: "أحدث العمليات",
    obligations: "الالتزامات القادمة",
    homeBudget: "توزيع مصروف المنزل",
    paid: "مدفوع",
    remaining: "متبقي",
    extra: "فائض شخصي",
    monthlyContribution: "المساهمة الشهرية",
    nextDue: "القسط القادم",
    members: "الأعضاء",
    income: "دخل",
    expense: "مصروف",
    contribution: "مساهمة",
    reimbursement: "تعويض",
    mandatory: "إلزامي",
    personalReserve: "فائض شخصي",
    general: "عام",
    amount: "المبلغ",
    description: "الوصف",
    wallet: "المحفظة",
    allocation: "تخصيص المبلغ",
    save: "حفظ العملية",
    cancel: "إلغاء",
    saving: "جارٍ الحفظ...",
    transactionAdded: "تمت إضافة العملية بنجاح",
    walletName: "اسم المحفظة",
    walletType: "نوع المحفظة",
    goal: "الهدف المالي",
    create: "إنشاء المحفظة",
    search: "ابحث في العمليات...",
    allTransactions: "جميع العمليات",
    date: "التاريخ",
    status: "الحالة",
    approved: "معتمدة",
    memberProgress: "التزام أعضاء رحلة العائلة",
    invite: "دعوة عضو",
    roleOwner: "المالك",
    roleTreasurer: "أمين الصندوق",
    roleMember: "عضو",
    householdInsight: "مصروف المنزل أقل بـ 8% من متوسط آخر ثلاثة أشهر",
    smartInsight: "ملاحظة وازن",
    privacy: "الخصوصية أولاً",
    privacyText: "لا يرى أي عضو محفظتك الشخصية. تظهر للمجموعة فقط التحويلات التي تختار مشاركتها.",
    access: "الصلاحيات",
    accessText: "المالك يدير الإعدادات، أمين الصندوق يعتمد الدفعات، والعضو يرى حسابه فقط.",
    export: "تصدير التقرير",
    categories: ["السكن", "الطعام", "المواصلات", "التعليم", "أخرى"],
    empty: "لا توجد بيانات بعد",
    error: "تعذر تحميل البيانات. حاول مرة أخرى.",
  },
  en: {
    greeting: "Good morning",
    subtitle: "Here is your financial picture today",
    overview: "Overview",
    personal: "Personal wallet",
    household: "Home & family",
    groups: "Members",
    trip: "Travel wallet",
    society: "Savings circles",
    transactions: "Transactions",
    reports: "Reports",
    settings: "Settings",
    workspace: "My money space",
    add: "Add transaction",
    newWallet: "New wallet",
    totalBalance: "Net balance",
    spendableFunds: "Group funds",
    personalReserves: "Personal reserves",
    monthlySpend: "August spending",
    versus: "vs last month",
    protected: "Protected from group spending",
    wallets: "Your wallets",
    viewAll: "View all",
    tripGoal: "Family trip goal",
    collected: "collected of the goal",
    projected: "At this pace, you will reach the goal in May 2027",
    commonFund: "Common fund",
    membersReserves: "Member reserves",
    cashHeld: "Actual cash held",
    clarity: "Personal reserves never mix with group funds",
    recent: "Recent activity",
    obligations: "Upcoming obligations",
    homeBudget: "Home spending split",
    paid: "Paid",
    remaining: "Remaining",
    extra: "Personal reserve",
    monthlyContribution: "Monthly contribution",
    nextDue: "Next due",
    members: "members",
    income: "Income",
    expense: "Expense",
    contribution: "Contribution",
    reimbursement: "Reimbursement",
    mandatory: "Mandatory",
    personalReserve: "Personal reserve",
    general: "General",
    amount: "Amount",
    description: "Description",
    wallet: "Wallet",
    allocation: "Allocation",
    save: "Save transaction",
    cancel: "Cancel",
    saving: "Saving...",
    transactionAdded: "Transaction added successfully",
    walletName: "Wallet name",
    walletType: "Wallet type",
    goal: "Financial goal",
    create: "Create wallet",
    search: "Search transactions...",
    allTransactions: "All transactions",
    date: "Date",
    status: "Status",
    approved: "Approved",
    memberProgress: "Family trip member progress",
    invite: "Invite member",
    roleOwner: "Owner",
    roleTreasurer: "Treasurer",
    roleMember: "Member",
    householdInsight: "Home spending is 8% below your three-month average",
    smartInsight: "Wazen insight",
    privacy: "Privacy first",
    privacyText: "No member can see your personal wallet. Groups only see transfers you explicitly share.",
    access: "Permissions",
    accessText: "Owners manage settings, treasurers approve payments, and members see only their own account.",
    export: "Export report",
    categories: ["Housing", "Food", "Transport", "Education", "Other"],
    empty: "No data yet",
    error: "Could not load your data. Please try again.",
  },
} as const;

const navItems: { id: ViewId; icon: typeof LayoutDashboard }[] = [
  { id: "overview", icon: LayoutDashboard },
  { id: "personal", icon: WalletCards },
  { id: "household", icon: House },
  { id: "groups", icon: Users },
  { id: "trip", icon: Plane },
  { id: "society", icon: Repeat2 },
  { id: "transactions", icon: ReceiptText },
  { id: "reports", icon: BarChart3 },
];

const typeIcons: Record<string, typeof WalletCards> = {
  personal: WalletCards,
  household: House,
  trip: Plane,
  society: Repeat2,
  group: Users,
};

const typeLabels = {
  ar: { personal: "شخصية", household: "منزلية", trip: "سفر", society: "جمعية", group: "مجموعة" },
  en: { personal: "Personal", household: "Household", trip: "Travel", society: "Circle", group: "Group" },
};

function formatMoney(minor: number, currency: string, locale: Locale, compact = false) {
  return formatMoneyMinor(minor, currency || "OMR", locale, { compact });
}

function nameOf(space: Space, locale: Locale) {
  return locale === "ar" ? space.name_ar : space.name_en;
}

function transactionName(transaction: Transaction, locale: Locale) {
  return locale === "ar" ? transaction.description_ar : transaction.description_en;
}


function currencyMajor(minor: number, currency: string) {
  const scale = currency.toUpperCase() === "OMR" || ["BHD","IQD","JOD","KWD","LYD","TND"].includes(currency.toUpperCase()) ? 3 : 2;
  return minor / (10 ** scale);
}

function memberPosition(member: Member) {
  const remainingDue = Math.max(0, member.due_minor - member.paid_minor);
  const advance = Math.max(0, member.paid_minor - member.due_minor);
  const credit = advance + Math.max(0, member.extra_minor); // له
  const debit = remainingDue; // عليه (dues)
  return { remainingDue, advance, credit, debit };
}

function memberExpenseNet(memberId: string, data: DashboardData, spaceId: string) {
  let net = 0;
  for (const settlement of data.settlements.filter((item) => item.space_id === spaceId && item.status === "pending")) {
    if (String(settlement.to_member_id).startsWith("space:") || String(settlement.from_member_id).startsWith("space:")) continue;
    if (settlement.to_member_id === memberId) net += settlement.amount_minor;
    if (settlement.from_member_id === memberId) net -= settlement.amount_minor;
  }
  return net;
}

function openTransactionReceipt(transaction: Transaction, data: DashboardData, locale: Locale) {
  const space = data.spaces.find((item) => item.id === transaction.space_id);
  const member = data.members.find((item) => item.id === transaction.member_id);
  const title = locale === "ar" ? "إيصال وازن" : "WAZEN receipt";
  const html = `<!doctype html><html lang="${locale}" dir="${locale === "ar" ? "rtl" : "ltr"}"><head><meta charset="utf-8"/><title>${title}</title>
  <style>body{font-family:Tahoma,Arial,sans-serif;padding:32px;color:#12231f}h1{margin:0 0 8px;font-size:22px}.meta{color:#66766f;font-size:13px;margin-bottom:24px}table{width:100%;border-collapse:collapse}td{padding:10px 0;border-bottom:1px solid #e5ebe7;font-size:14px}td:last-child{text-align:end;font-weight:700}.brand{color:#0d7a65;font-weight:800;letter-spacing:.08em}</style></head><body>
  <div class="brand">WAZEN · وازن</div><h1>${title}</h1>
  <p class="meta">${new Date(transaction.occurred_at).toLocaleString(locale === "ar" ? "ar-OM" : "en-GB")}</p>
  <table>
    <tr><td>${locale === "ar" ? "الوصف" : "Description"}</td><td>${transactionName(transaction, locale)}</td></tr>
    <tr><td>${locale === "ar" ? "المحفظة" : "Wallet"}</td><td>${space ? nameOf(space, locale) : "—"}</td></tr>
    <tr><td>${locale === "ar" ? "المساهم" : "Member"}</td><td>${member?.display_name ?? "—"}</td></tr>
    <tr><td>${locale === "ar" ? "النوع" : "Type"}</td><td>${transaction.kind}</td></tr>
    <tr><td>${locale === "ar" ? "المبلغ" : "Amount"}</td><td>${formatMoney(transaction.amount_minor, space?.currency ?? "OMR", locale)}</td></tr>
    <tr><td>${locale === "ar" ? "المرجع" : "Reference"}</td><td>${transaction.id.slice(0, 8).toUpperCase()}</td></tr>
  </table>
  <script>window.print()</script></body></html>`;
  const popup = window.open("", "_blank", "noopener,noreferrer,width=720,height=900");
  if (!popup) return;
  popup.document.write(html);
  popup.document.close();
}

function shareTransactionWhatsApp(transaction: Transaction, data: DashboardData, locale: Locale) {
  const space = data.spaces.find((item) => item.id === transaction.space_id);
  const member = data.members.find((item) => item.id === transaction.member_id);
  const amount = formatMoney(transaction.amount_minor, space?.currency ?? "OMR", locale);
  const lines = locale === "ar"
    ? [
        "إيصال وازن",
        `الوصف: ${transactionName(transaction, locale)}`,
        `المحفظة: ${space ? nameOf(space, locale) : "—"}`,
        `المساهم: ${member?.display_name ?? "—"}`,
        `المبلغ: ${amount}`,
        `التاريخ: ${new Date(transaction.occurred_at).toLocaleDateString("ar-OM")}`,
        `المرجع: ${transaction.id.slice(0, 8).toUpperCase()}`,
      ]
    : [
        "WAZEN receipt",
        `Description: ${transactionName(transaction, locale)}`,
        `Wallet: ${space ? nameOf(space, locale) : "—"}`,
        `Member: ${member?.display_name ?? "—"}`,
        `Amount: ${amount}`,
        `Date: ${new Date(transaction.occurred_at).toLocaleDateString("en-GB")}`,
        `Ref: ${transaction.id.slice(0, 8).toUpperCase()}`,
      ];
  window.open(`https://wa.me/?text=${encodeURIComponent(lines.join("\n"))}`, "_blank", "noopener,noreferrer");
}


export function WazenDashboard() {
  const router = useRouter();
  const [locale, setLocale] = useState<Locale>("ar");
  const [activeView, setActiveView] = useState<ViewId>("overview");
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [modal, setModal] = useState<"transaction" | "wallet" | "invite" | "tripExpense" | "circleOrder" | "withdrawSurplus" | null>(null);
  const [withdrawMemberId, setWithdrawMemberId] = useState<string>("");
  const [toast, setToast] = useState("");
  const t = copy[locale];

  const load = useCallback(async () => {
    try {
      setError(false);
      const response = await fetch("/api/dashboard", { cache: "no-store" });
      if (response.status === 401) { router.push("/login?next=/dashboard"); return; }
      if (!response.ok) throw new Error("load failed");
      setData(await response.json());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
  }, [locale]);

  const spacesByType = useMemo(() => {
    const result: Record<string, Space | undefined> = {};
    data?.spaces.forEach((space) => { if (!result[space.type]) result[space.type] = space; });
    return result;
  }, [data]);

  const totals = useMemo(() => {
    if (!data) return { net: 0, groups: 0, reserves: 0, spend: 0 };
    const net = data.spaces.reduce((sum, item) => sum + item.balance_minor, 0);
    const groups = data.spaces.filter((item) => ["trip", "society", "group"].includes(item.type)).reduce((sum, item) => sum + item.balance_minor, 0);
    const reserves = data.members.reduce((sum, member) => sum + member.extra_minor, 0);
    const spend = data.transactions.filter((item) => item.kind === "expense").reduce((sum, item) => sum + item.amount_minor, 0);
    return { net, groups, reserves, spend };
  }, [data]);

  const flash = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2800);
  };
  const settleReimbursement = async (settlementId: string) => {
    const response = await apiFetch("/api/dashboard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "settleReimbursement", idempotencyKey: crypto.randomUUID(), settlementId }) });
    if (!response.ok) { flash(locale === "ar" ? "تعذر اعتماد التسوية" : "Could not settle reimbursement"); return; }
    setData({ ...data!, ...(await response.json()) }); flash(locale === "ar" ? "تم اعتماد رد المبلغ" : "Reimbursement settled");
  };
  const completeCircleTurn = async (turnId: string) => {
    const response = await apiFetch("/api/dashboard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "completeCircleTurn", idempotencyKey: crypto.randomUUID(), turnId }) });
    if (!response.ok) { flash(locale === "ar" ? "تعذر صرف الدور؛ تحقق من الرصيد والترتيب" : "Could not pay this turn; check balance and order"); return; }
    setData({ ...data!, ...(await response.json()) }); flash(locale === "ar" ? "تم صرف الدور وتسجيل القيد" : "Turn paid and journaled");
  };

  const changeView = (view: ViewId) => {
    startTransition(() => {
      setActiveView(view);
      setSidebarOpen(false);
    });
  };

  if (loading) return <LoadingScreen locale={locale} />;
  if (error || !data) return <ErrorScreen message={t.error} retry={load} />;

  const activeSpace = activeView === "personal" ? spacesByType.personal
    : activeView === "household" ? spacesByType.household
      : activeView === "trip" ? spacesByType.trip
        : activeView === "society" ? spacesByType.society : undefined;

  return (
    <div className="app-shell">
      <Sidebar locale={locale} active={activeView} open={sidebarOpen} onNavigate={changeView} onClose={() => setSidebarOpen(false)} />

      <main className="main-shell">
        <header className="topbar">
          <div className="topbar-title">
            <button className="mobile-menu" onClick={() => setSidebarOpen(true)} aria-label="Open menu"><Menu size={22} /></button>
            <div>
              <p className="eyebrow">{t.greeting}، {data.user.displayName.split(" ")[0]} 👋</p>
              <h1>{t[activeView]}</h1>
            </div>
          </div>
          <div className="topbar-actions">
            <button className="language-button" onClick={() => setLocale(locale === "ar" ? "en" : "ar")} aria-label="Change language">
              <Globe2 size={17} /><span>{locale === "ar" ? "EN" : "عربي"}</span>
            </button>
            <button className="icon-button notification-button" aria-label="Notifications"><Bell size={19} /><i /></button>
            <button className="primary-button" onClick={() => setModal("transaction")}><Plus size={18} />{t.add}</button>
            <div className="user-avatar" title={data.user.email}>{data.user.displayName.slice(0, 1)}</div>
          </div>
        </header>

        <div className="page-content">
          {activeView === "overview" && (
            <Overview data={data} locale={locale} totals={totals} onView={changeView} onAddWallet={() => setModal("wallet")} />
          )}
          {activeSpace && (
            <SpaceDetail space={activeSpace} data={data} locale={locale} onAdd={() => setModal("transaction")} onInvite={() => setModal("invite")} onTripExpense={() => setModal("tripExpense")} onCircleOrder={() => setModal("circleOrder")} onSettle={(settlementId) => void settleReimbursement(settlementId)} onCompleteTurn={(turnId) => void completeCircleTurn(turnId)} onTxnChanged={(next) => { setData({ ...data, ...next }); flash(locale === "ar" ? "تم تحديث العملية" : "Transaction updated"); }} />
          )}
          {activeView === "groups" && <MembersView data={data} locale={locale} onInvite={() => setModal("invite")} onWithdraw={(memberId) => { setWithdrawMemberId(memberId); setModal("withdrawSurplus"); }} />}
          {activeView === "transactions" && <TransactionsView data={data} locale={locale} onChanged={(next) => { setData({ ...data, ...next }); flash(locale === "ar" ? "تم تحديث العملية" : "Transaction updated"); }} />}
          {activeView === "reports" && <ReportsPanel data={data} locale={locale} totals={totals} />}
          {activeView === "settings" && <SettingsView locale={locale} />}
        </div>
      </main>

      {modal === "transaction" && (
        <TransactionModal data={data} locale={locale} preferredSpaceId={activeSpace?.id} onClose={() => setModal(null)} onSaved={(next) => {
          setData({ ...data, ...next });
          setModal(null);
          flash(locale === "ar" ? "تم تسجيل العملية وتحديث بيانات العضو" : "Transaction saved and member ledger updated");
        }} />
      )}
      {modal === "wallet" && (
        <WalletModal data={data} locale={locale} onClose={() => setModal(null)} onSaved={(next) => {
          setData({ ...data, ...next });
          setModal(null);
          flash(locale === "ar" ? "تم إنشاء المحفظة" : "Wallet created");
        }} />
      )}
      {modal === "invite" && <InviteModal data={data} locale={locale} preferredSpaceId={activeSpace?.id} onClose={() => setModal(null)} onDone={(message) => { setModal(null); flash(message); void load(); }} />}
      {modal === "tripExpense" && <TripExpenseModal data={data} locale={locale} preferredSpaceId={activeSpace?.id} onClose={() => setModal(null)} onSaved={(next) => { setData({ ...data, ...next }); setModal(null); flash(locale === "ar" ? "تم تسجيل المصروف وتحديث له/عليه" : "Expense recorded and balances updated"); }} />}
      {modal === "circleOrder" && <CircleOrderModal data={data} locale={locale} onClose={() => setModal(null)} onSaved={(next) => { setData({ ...data, ...next }); setModal(null); flash(locale === "ar" ? "تم اعتماد ترتيب الأدوار" : "Turn order saved"); }} />}
      {modal === "withdrawSurplus" && <SurplusWithdrawModal data={data} locale={locale} memberId={withdrawMemberId} onClose={() => setModal(null)} onSaved={(next) => { setData({ ...data, ...next }); setModal(null); flash(locale === "ar" ? "تم صرف الفائض الشخصي" : "Personal surplus withdrawn"); }} />}
      {toast && <div className="toast"><Check size={17} />{toast}</div>}
    </div>
  );
}

function Sidebar({ locale, active, open, onNavigate, onClose }: { locale: Locale; active: ViewId; open: boolean; onNavigate: (id: ViewId) => void; onClose: () => void }) {
  const t = copy[locale];
  return (
    <>
      {open && <button className="sidebar-backdrop" onClick={onClose} aria-label="Close menu" />}
      <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
        <div className="brand-row">
          <div className="brand-mark"><WazenIcon className="h-10 w-12" /></div>
          <div className="brand-name"><strong>وازن</strong><small>WAZEN</small></div>
          <button className="sidebar-close" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </div>
        <div className="workspace-pill"><div className="workspace-icon"><Landmark size={17} /></div><div><small>{t.workspace}</small><strong>{locale === "ar" ? "الحساب الرئيسي" : "Main account"}</strong></div><ChevronDown size={15} /></div>
        <nav className="sidebar-nav">
          {navItems.map(({ id, icon: Icon }) => (
            <button key={id} className={active === id ? "active" : ""} onClick={() => onNavigate(id)}>
              <Icon size={19} strokeWidth={active === id ? 2.2 : 1.8} /><span>{t[id]}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-external">
          <small>{locale === "ar" ? "إدارة الحساب" : "Account management"}</small>
          <a href="/documents"><ReceiptText size={18} /><span>{locale === "ar" ? "الإيصالات والكشوفات" : "Documents & statements"}</span></a>
          <a href="/billing"><CircleDollarSign size={18} /><span>{locale === "ar" ? "الباقة والفوترة" : "Plan & billing"}</span></a>
          <a href="/admin"><ShieldCheck size={18} /><span>{locale === "ar" ? "إدارة المنصة" : "Platform admin"}</span></a>
        </div>
        <div className="sidebar-spacer" />
        <button className={`sidebar-setting ${active === "settings" ? "active" : ""}`} onClick={() => onNavigate("settings")}><Settings size={19} /><span>{t.settings}</span></button>
        <div className="security-card"><ShieldCheck size={20} /><div><strong>{locale === "ar" ? "بياناتك محمية" : "Your data is protected"}</strong><small>{locale === "ar" ? "تشفير وسجل تدقيق لكل عملية" : "Encryption and an audit trail"}</small></div></div>
      </aside>
    </>
  );
}

function Overview({ data, locale, totals, onView, onAddWallet }: { data: DashboardData; locale: Locale; totals: { net: number; groups: number; reserves: number; spend: number }; onView: (id: ViewId) => void; onAddWallet: () => void }) {
  const t = copy[locale];
  const trip = data.spaces.find((space) => space.type === "trip");
  const household = data.spaces.find((space) => space.type === "household");
  const tripMembers = trip ? data.members.filter((member) => member.space_id === trip.id) : [];
  const reserveTotal = tripMembers.reduce((sum, member) => sum + member.extra_minor, 0);
  const goalProgress = trip && trip.goal_minor > 0 ? Math.min(100, Math.round((trip.balance_minor / trip.goal_minor) * 100)) : 0;
  const householdExpenses = household
    ? data.transactions.filter((row) => row.space_id === household.id && row.kind === "expense")
    : [];
  const householdSpend = householdExpenses.reduce((sum, row) => sum + row.amount_minor, 0);
  const walletCount = data.spaces.length;

  return (
    <div className="dashboard-stack">
      <div className="welcome-line">
        <p>{t.subtitle}</p>
        <div className="date-chip"><CalendarDays size={16} />{new Intl.DateTimeFormat(locale === "ar" ? "ar-AE" : "en-GB", { day: "numeric", month: "long", year: "numeric" }).format(new Date())}</div>
      </div>
      <section className="stat-grid">
        <StatCard icon={<CircleDollarSign />} label={t.totalBalance} value={formatMoney(totals.net + totals.reserves, "OMR", locale)} accent="navy" note={walletCount ? (locale === "ar" ? `${walletCount} محافظ` : `${walletCount} wallets`) : (locale === "ar" ? "لا محافظ بعد" : "no wallets yet")} />
        <StatCard icon={<HandCoins />} label={t.spendableFunds} value={formatMoney(totals.groups, "OMR", locale)} accent="green" note={locale === "ar" ? "أرصدة المجموعات" : "group balances"} />
        <StatCard icon={<ShieldCheck />} label={t.personalReserves} value={formatMoney(totals.reserves, "OMR", locale)} accent="amber" note={t.protected} />
        <StatCard icon={<TrendingDown />} label={t.monthlySpend} value={formatMoney(totals.spend, "OMR", locale)} accent="rose" note={locale === "ar" ? "من السجل الفعلي" : "from recorded entries"} />
      </section>

      <section className="overview-grid">
        <article className="goal-card panel">
          <div className="panel-heading">
            <div><span className="section-kicker"><Plane size={15} />{locale === "ar" ? "هدف جماعي" : "Group goal"}</span><h2>{trip ? nameOf(trip, locale) : t.tripGoal}</h2></div>
            <button className="ghost-icon" onClick={() => onView("trip")} aria-label="Open trip"><ArrowUpRight size={18} /></button>
          </div>
          {trip ? (
            <>
              <div className="goal-number">
                <strong>{formatMoney(trip.balance_minor, trip.currency, locale)}</strong>
                <span>{t.collected} {trip.goal_minor > 0 ? formatMoney(trip.goal_minor, trip.currency, locale) : "—"}</span>
              </div>
              <div className="progress-track tall"><span style={{ width: `${goalProgress}%` }} /></div>
              <div className="progress-labels">
                <b>{goalProgress}%</b>
                <span>{trip.goal_minor > 0 && trip.balance_minor > 0 ? (locale === "ar" ? "التقدم من الرصيد الفعلي" : "Progress from actual balance") : (locale === "ar" ? "أضف مساهمات لبدء التقدم" : "Add contributions to start progress")}</span>
              </div>
              <div className="money-separation">
                <div><i className="dot common" /><span>{t.commonFund}</span><strong>{formatMoney(trip.balance_minor, trip.currency, locale)}</strong></div>
                <div><i className="dot reserve" /><span>{t.membersReserves}</span><strong>{formatMoney(reserveTotal, trip.currency, locale)}</strong></div>
                <div className="cash-held"><i className="dot cash" /><span>{t.cashHeld}</span><strong>{formatMoney(trip.balance_minor + reserveTotal, trip.currency, locale)}</strong></div>
              </div>
              <p className="clarity-note"><ShieldCheck size={15} />{t.clarity}</p>
            </>
          ) : (
            <div className="empty-state"><Plane size={22} /><span>{locale === "ar" ? "لا توجد محفظة رحلة بعد. أنشئ محفظة لتظهر الأهداف الحقيقية." : "No trip wallet yet. Create one to see real goals."}</span></div>
          )}
        </article>

        <article className="budget-card panel">
          <div className="panel-heading"><div><span className="section-kicker"><Sparkles size={15} />{t.smartInsight}</span><h2>{t.homeBudget}</h2></div></div>
          {householdSpend > 0 ? (
            <>
              <div className="donut-wrap">
                <div className="donut" style={{ background: `conic-gradient(var(--green) 0 100%)` }}>
                  <div><strong>{formatMoney(householdSpend, household?.currency ?? "OMR", locale)}</strong><span>{locale === "ar" ? "مصروف المنزل" : "home spend"}</span></div>
                </div>
                <div className="budget-legend">
                  <div><i className="budget-dot c1" /><span>{locale === "ar" ? "عمليات مسجلة" : "Recorded entries"}</span><strong>{householdExpenses.length}</strong></div>
                  <div><i className="budget-dot c2" /><span>{locale === "ar" ? "المحفظة" : "Wallet"}</span><strong>{household ? nameOf(household, locale) : "—"}</strong></div>
                </div>
              </div>
              <p className="insight-note"><TrendingDown size={16} />{locale === "ar" ? "هذه الأرقام من عملياتك المسجلة فقط." : "These figures come only from your recorded transactions."}</p>
            </>
          ) : (
            <div className="empty-state"><Sparkles size={22} /><span>{locale === "ar" ? "لا توجد إحصاءات بعد. ستظهر ملاحظات وازن بعد تسجيل مصروفات منزل حقيقية." : "No insights yet. Wazen notes appear after real household expenses are recorded."}</span></div>
          )}
        </article>
      </section>

      <section className="wallet-section">
        <div className="section-title"><div><h2>{t.wallets}</h2><p>{locale === "ar" ? "أرصدة مستقلة لحياة مالية أوضح" : "Separate balances for a clearer financial life"}</p></div><button className="secondary-button" onClick={onAddWallet}><Plus size={16} />{t.newWallet}</button></div>
        {data.spaces.length ? (
          <div className="wallet-grid">
            {data.spaces.map((space) => <WalletCard key={space.id} space={space} locale={locale} onOpen={() => onView(space.type === "group" ? "groups" : space.type as ViewId)} />)}
          </div>
        ) : (
          <article className="panel"><div className="empty-state"><WalletCards size={22} /><span>{locale === "ar" ? "ابدأ بإنشاء محفظتك الأولى." : "Start by creating your first wallet."}</span><button className="primary-button" onClick={onAddWallet}><Plus size={16} />{t.newWallet}</button></div></article>
        )}
      </section>

      <section className="lower-grid">
        <RecentTransactions data={data} locale={locale} onView={() => onView("transactions")} />
        <Obligations data={data} locale={locale} onView={onView} />
      </section>
    </div>
  );
}

function StatCard({ icon, label, value, trend, note, accent, positive = false }: { icon: ReactNode; label: string; value: string; trend?: string; note: string; accent: string; positive?: boolean }) {
  return <article className="stat-card"><div className={`stat-icon ${accent}`}>{icon}</div><div className="stat-copy"><span>{label}</span><strong>{value}</strong><small className={positive ? "positive" : ""}>{trend && <b>{trend}</b>} {note}</small></div></article>;
}

function WalletCard({ space, locale, onOpen }: { space: Space; locale: Locale; onOpen: () => void }) {
  const Icon = typeIcons[space.type] ?? WalletCards;
  const progress = space.goal_minor ? Math.min(100, Math.round((space.balance_minor / space.goal_minor) * 100)) : 0;
  return <button className={`wallet-card accent-${space.accent}`} onClick={onOpen}>
    <div className="wallet-card-top"><span className="wallet-icon"><Icon size={19} /></span><ArrowUpRight size={17} /></div>
    <span className="wallet-type">{typeLabels[locale][space.type as keyof typeof typeLabels.ar] ?? space.type}</span>
    <h3>{nameOf(space, locale)}</h3><strong>{formatMoney(space.balance_minor, space.currency, locale)}</strong>
    {space.goal_minor > 0 && <><div className="progress-track"><span style={{ width: `${progress}%` }} /></div><small>{progress}% {locale === "ar" ? "من الهدف" : "of goal"}</small></>}
  </button>;
}

function RecentTransactions({ data, locale, onView }: { data: DashboardData; locale: Locale; onView: () => void }) {
  const t = copy[locale];
  return <article className="panel list-panel"><div className="panel-heading"><h2>{t.recent}</h2><button className="text-button" onClick={onView}>{t.viewAll}<ArrowUpRight size={15} /></button></div>
    <div className="transaction-list">{data.transactions.length ? data.transactions.slice(0, 5).map((transaction) => <TransactionRow key={transaction.id} transaction={transaction} data={data} locale={locale} />) : <Empty locale={locale} />}</div>
  </article>;
}

function TransactionRow({ transaction, data, locale, onEdit, onVoid }: { transaction: Transaction; data: DashboardData; locale: Locale; onEdit?: (txn: Transaction) => void; onVoid?: (txn: Transaction) => void }) {
  const positive = ["income", "contribution"].includes(transaction.kind);
  const Icon = transaction.kind === "expense" ? ArrowUpRight : transaction.kind === "reimbursement" ? HandCoins : ArrowDownLeft;
  const space = data.spaces.find((item) => item.id === transaction.space_id);
  const member = data.members.find((item) => item.id === transaction.member_id);
  return <div className="transaction-row">
    <div className={`transaction-icon ${transaction.kind}`}><Icon size={17} /></div>
    <div className="transaction-main">
      <strong>{transactionName(transaction, locale)}</strong>
      <span>{space ? nameOf(space, locale) : "—"}{member ? ` · ${member.display_name}` : ""} · {new Intl.DateTimeFormat(locale === "ar" ? "ar-OM" : "en-GB", { day: "numeric", month: "short" }).format(new Date(transaction.occurred_at))}</span>
    </div>
    <strong className={positive ? "amount-positive" : "amount-negative"}>{positive ? "+" : "−"}{formatMoney(transaction.amount_minor, space?.currency ?? "OMR", locale)}</strong>
    <div className="transaction-actions">
      <button type="button" title={locale === "ar" ? "إيصال" : "Receipt"} onClick={() => openTransactionReceipt(transaction, data, locale)}><Printer size={15} /></button>
      <button type="button" title="WhatsApp" onClick={() => shareTransactionWhatsApp(transaction, data, locale)}><MessageCircle size={15} /></button>
      {onEdit && <button type="button" title={locale === "ar" ? "تعديل" : "Edit"} onClick={() => onEdit(transaction)}><Pencil size={15} /></button>}
      {onVoid && <button type="button" className="danger" title={locale === "ar" ? "حذف" : "Delete"} onClick={() => onVoid(transaction)}><Trash2 size={15} /></button>}
    </div>
  </div>;
}

function Obligations({ data, locale, onView }: { data: DashboardData; locale: Locale; onView: (view: ViewId) => void }) {
  const t = copy[locale];
  const rows = data.plans
    .map((plan) => {
      const space = data.spaces.find((item) => item.id === String(plan.space_id));
      if (!space) return null;
      const dueDay = Number(plan.due_day ?? 1);
      const amount = Number(plan.amount_minor ?? 0);
      if (amount <= 0) return null;
      const view = space.type === "group" ? "groups" : (space.type as ViewId);
      return { space, dueDay, amount, view };
    })
    .filter(Boolean) as Array<{ space: Space; dueDay: number; amount: number; view: ViewId }>;

  return (
    <article className="panel obligation-panel">
      <div className="panel-heading"><h2>{t.obligations}</h2><CalendarDays size={18} /></div>
      {rows.length ? rows.map((row) => (
        <button className="obligation-row" key={row.space.id} onClick={() => onView(row.view)}>
          <div className={`obligation-date${row.space.type === "society" ? " purple" : ""}`}><b>{row.dueDay}</b><span>{locale === "ar" ? "كل شهر" : "MONTHLY"}</span></div>
          <div><strong>{nameOf(row.space, locale)}</strong><span>{t.monthlyContribution}</span></div>
          <b>{formatMoney(row.amount, row.space.currency, locale)}</b>
        </button>
      )) : (
        <div className="empty-state"><CalendarDays size={20} /><span>{locale === "ar" ? "لا التزامات قادمة حتى تضيف خطط مساهمة." : "No upcoming obligations until contribution plans exist."}</span></div>
      )}
    </article>
  );
}

function SpaceDetail({ space, data, locale, onAdd, onInvite, onTripExpense, onCircleOrder, onSettle, onCompleteTurn, onTxnChanged }: { space: Space; data: DashboardData; locale: Locale; onAdd: () => void; onInvite: () => void; onTripExpense: () => void; onCircleOrder: () => void; onSettle: (settlementId: string) => void; onCompleteTurn: (turnId: string) => void; onTxnChanged: (next: Partial<DashboardData>) => void }) {
  const t = copy[locale];
  const members = data.members.filter((member) => member.space_id === space.id);
  const transactions = data.transactions.filter((transaction) => transaction.space_id === space.id);
  const reserves = members.reduce((sum, member) => sum + member.extra_minor, 0);
  const progress = space.goal_minor ? Math.min(100, Math.round((space.balance_minor / space.goal_minor) * 100)) : 0;
  const nextCircleTurn = data.circleTurns.find((turn) => turn.space_id === space.id && turn.status === "scheduled");
  return <div className="dashboard-stack">
    <section className={`space-hero accent-${space.accent}`}><div><span>{typeLabels[locale][space.type as keyof typeof typeLabels.ar]}</span><h2>{nameOf(space, locale)}</h2><p>{space.type === "personal" ? (locale === "ar" ? "دخل، مصروف، ميزانيات وأهداف في مكان واحد" : "Income, spending, budgets and goals in one place") : (locale === "ar" ? "حسابات واضحة ومفصولة لكل فرد" : "Clear, separated balances for every member")}</p></div><div className="space-hero-balance"><span>{locale === "ar" ? "الرصيد المتاح" : "Available balance"}</span><strong>{formatMoney(space.balance_minor, space.currency, locale)}</strong><button onClick={onAdd}><Plus size={16} />{t.add}</button>{["trip", "society", "group"].includes(space.type) && <button onClick={onInvite}><UserPlus size={16} />{t.invite}</button>}</div></section>
    <section className="stat-grid compact">
      <StatCard icon={<WalletCards />} label={locale === "ar" ? "الرصيد المتاح" : "Available"} value={formatMoney(space.balance_minor, space.currency, locale)} accent="navy" note={locale === "ar" ? "محدّث الآن" : "updated now"} />
      <StatCard icon={<Target />} label={locale === "ar" ? "الهدف" : "Goal"} value={space.goal_minor ? formatMoney(space.goal_minor, space.currency, locale) : "—"} accent="green" note={`${progress}%`} />
      <StatCard icon={<ShieldCheck />} label={t.personalReserves} value={formatMoney(reserves, space.currency, locale)} accent="amber" note={t.protected} />
      <StatCard icon={<ReceiptText />} label={t.transactions} value={String(transactions.length)} accent="rose" note={locale === "ar" ? "عملية مسجلة" : "recorded entries"} />
    </section>
    {space.goal_minor > 0 && <article className="panel goal-wide"><div className="panel-heading"><div><span className="section-kicker"><Target size={15} />{locale === "ar" ? "تقدم الهدف" : "Goal progress"}</span><h2>{nameOf(space, locale)}</h2></div><strong>{progress}%</strong></div><div className="progress-track tall"><span style={{ width: `${progress}%` }} /></div><div className="goal-wide-values"><span>{formatMoney(space.balance_minor, space.currency, locale)}</span><span>{formatMoney(space.goal_minor, space.currency, locale)}</span></div></article>}
    {members.length > 0 && <MembersTable members={members} locale={locale} currency={space.currency} data={data} spaceId={space.id} />}
    {["household", "trip", "society", "group"].includes(space.type) && <article className="panel workflow-panel"><div className="panel-heading"><div><span className="section-kicker"><Plane size={15} />{locale === "ar" ? "المصروفات والتسويات" : "Expenses & settlements"}</span><h2>{locale === "ar" ? "من أي حساب دُفع؟ وما له / عليه" : "Paid-from account and balances"}</h2></div><button className="primary-button" onClick={onTripExpense}><Plus size={15} />{locale === "ar" ? "مصروف جماعي" : "Group expense"}</button></div><div className="transaction-list">{data.tripExpenses.filter((expense) => expense.space_id === space.id).map((expense) => <div className="trip-expense-row" key={expense.id}><div className="transaction-row"><div className="transaction-icon reimbursement"><HandCoins size={17} /></div><div className="transaction-main"><strong>{expense.description}</strong><span>{locale === "ar" ? "دفع بواسطة" : "Paid by"} {expense.paid_by_name}</span></div><strong className="amount-negative">{formatMoney(expense.amount_minor, space.currency, locale)}</strong></div><div className="split-chips">{data.expenseSplits.filter((split) => split.expense_id === expense.id).map((split) => <span key={split.id}>{split.display_name}: {formatMoney(split.share_minor, space.currency, locale)}</span>)}</div></div>)}{!data.tripExpenses.some((expense) => expense.space_id === space.id) && <Empty locale={locale} />}</div>{data.settlements.filter((settlement) => settlement.space_id === space.id && settlement.status === "pending").map((settlement) => {
      const fromFund = String(settlement.from_member_id).startsWith("space:");
      const label = fromFund
        ? (locale === "ar" ? `على الصندوق رد مبلغ إلى ${settlement.to_member_name ?? "العضو"}` : `The fund owes ${settlement.to_member_name ?? "the member"}`)
        : (locale === "ar"
          ? `على ${settlement.from_member_name ?? "العضو"} دفع إلى ${settlement.to_member_name ?? "العضو"}`
          : `${settlement.from_member_name ?? "Member"} owes ${settlement.to_member_name ?? "member"}`);
      return <div className="settlement-alert" key={settlement.id}><ShieldCheck size={17} /><span>{label}</span><b>{formatMoney(settlement.amount_minor, space.currency, locale)}</b><button onClick={() => onSettle(settlement.id)}>{locale === "ar" ? "تم التسوية" : "Mark settled"}</button></div>;
    })}</article>}
    {space.type === "society" && <article className="panel workflow-panel"><div className="panel-heading"><div><span className="section-kicker"><Repeat2 size={15} />{locale === "ar" ? "نظام الأدوار" : "Turn system"}</span><h2>{locale === "ar" ? "ترتيب الاستلام" : "Payout order"}</h2></div><button className="primary-button" onClick={onCircleOrder}><Repeat2 size={15} />{locale === "ar" ? "إعداد الأدوار" : "Configure turns"}</button></div><div className="circle-order-list">{data.circleTurns.filter((turn) => turn.space_id === space.id).map((turn) => <div key={turn.id}><b>{turn.turn_number}</b><span>{turn.display_name}</span><strong>{formatMoney(turn.amount_minor, space.currency, locale)}</strong><em>{turn.status}</em>{turn.status === "scheduled" && <button disabled={turn.id !== nextCircleTurn?.id} onClick={() => onCompleteTurn(turn.id)}>{locale === "ar" ? "صرف الدور" : "Pay turn"}</button>}</div>)}{!data.circleTurns.some((turn) => turn.space_id === space.id) && <Empty locale={locale} />}</div></article>}
    <SpaceTransactionsPanel space={space} data={data} locale={locale} onAdd={onAdd} onTxnChanged={onTxnChanged} />
  </div>;
}

function MembersView({ data, locale, onInvite, onWithdraw }: { data: DashboardData; locale: Locale; onInvite: () => void; onWithdraw: (memberId: string) => void }) {
  const trip = data.spaces.find((space) => space.type === "trip") ?? data.spaces.find((space) => space.type !== "personal");
  const members = trip ? data.members.filter((member) => member.space_id === trip.id) : data.members.filter((member) => member.space_id !== data.spaces.find((space) => space.type === "personal")?.id);
  const t = copy[locale];
  return <div className="dashboard-stack"><div className="section-title"><div><h2>{t.memberProgress}</h2><p>{locale === "ar" ? "المستحق يخصم أولاً، وأي زيادة تُسجَّل مقدّماً (له). المصروفات تُظهر له/عليه حسب من دفع." : "Dues are applied first; any surplus is booked as advance. Expenses show who is owed or owes."}</p></div><button className="primary-button" onClick={onInvite}><UserPlus size={17} />{t.invite}</button></div><MembersTable members={members} locale={locale} currency={trip?.currency ?? "OMR"} data={data} spaceId={trip?.id} onWithdraw={onWithdraw} /><section className="settings-grid"><InfoPanel icon={<ShieldCheck />} title={t.privacy} text={t.privacyText} /><InfoPanel icon={<Users />} title={t.access} text={t.accessText} /></section></div>;
}

function MembersTable({ members, locale, currency, data, spaceId, onWithdraw }: { members: Member[]; locale: Locale; currency: string; data?: DashboardData; spaceId?: string; onWithdraw?: (memberId: string) => void }) {
  const t = copy[locale];
  const [query, setQuery] = useState(""); const visible = members.filter((member) => `${member.display_name} ${member.email ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  return <article className="panel members-panel"><div className="panel-heading"><h2>{t.members} <span className="count-badge">{members.length}</span></h2><label className="search-field member-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={locale === "ar" ? "ابحث باسم المساهم" : "Search member name"} /></label></div><div className="members-table"><div className="table-head"><span>{locale === "ar" ? "العضو" : "Member"}</span><span>{t.paid}</span><span>{locale === "ar" ? "عليه" : "Owes"}</span><span>{locale === "ar" ? "له" : "Owed"}</span><span>{t.status}</span><span>{locale === "ar" ? "إجراء" : "Action"}</span></div>{visible.map((member) => {
    const pos = memberPosition(member);
    const expenseNet = data && spaceId ? memberExpenseNet(member.id, data, spaceId) : 0;
    const debit = pos.debit + Math.max(0, -expenseNet);
    const credit = pos.credit + Math.max(0, expenseNet);
    return <div className="member-row" key={member.id}><div className="member-name"><i style={{ background: member.avatar }}>{member.display_name.slice(0, 1)}</i><div><strong>{member.display_name}</strong><span>{member.role === "owner" ? t.roleOwner : member.role === "treasurer" ? t.roleTreasurer : t.roleMember}</span></div></div><strong>{formatMoney(member.paid_minor, currency, locale)}</strong><strong className={debit ? "amount-negative" : "muted-amount"}>{formatMoney(debit, currency, locale)}</strong><strong className={credit ? "reserve-amount" : "muted-amount"}>{formatMoney(credit, currency, locale)}</strong><span className={`status-pill ${debit ? "pending" : "complete"}`}>{debit ? <Clock3 size={13} /> : <CheckCircle2 size={13} />}{debit ? (locale === "ar" ? "عليه مطالبات" : "Owes") : (credit ? (locale === "ar" ? "له رصيد" : "Credit") : t.paid)}</span><span>{member.extra_minor > 0 && onWithdraw ? <button type="button" className="secondary-button compact" onClick={() => onWithdraw(member.id)}>{locale === "ar" ? "صرف فائض" : "Withdraw"}</button> : "—"}</span></div>;
  })}</div></article>;
}

function TransactionsView({ data, locale, onChanged }: { data: DashboardData; locale: Locale; onChanged: (next: Partial<DashboardData>) => void }) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [working, setWorking] = useState(false);
  const t = copy[locale];
  const rows = data.transactions.filter((transaction) => transactionName(transaction, locale).toLowerCase().includes(query.toLowerCase()));
  const voidTxn = async (transaction: Transaction) => {
    if (!window.confirm(locale === "ar" ? "حذف هذه العملية وإلغاء أثرها على الرصيد والعضو؟" : "Void this transaction and reverse its balance/member effect?")) return;
    setWorking(true);
    try {
      const response = await apiFetch("/api/dashboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "voidTransaction", idempotencyKey: crypto.randomUUID(), transactionId: transaction.id }),
      });
      const result = await response.json() as Partial<DashboardData> & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "VOID_FAILED");
      onChanged(result);
    } catch (caught) {
      window.alert(caught instanceof Error ? caught.message : "VOID_FAILED");
    } finally {
      setWorking(false);
    }
  };
  return <div className="dashboard-stack">
    <div className="section-title"><div><h2>{t.allTransactions}</h2><p>{locale === "ar" ? "عدّل أو احذف أو أرسل إيصالاً عبر واتساب" : "Edit, void, or share a receipt on WhatsApp"}</p></div>
      <button className="secondary-button" onClick={() => {
        const csv = [["date", "description", "kind", "amount_minor"], ...data.transactions.map((row) => [row.occurred_at, transactionName(row, locale), row.kind, String(row.amount_minor)])]
          .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
          .join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "wazen-transactions.csv"; link.click(); URL.revokeObjectURL(link.href);
      }}><Download size={16} />{t.export}</button>
    </div>
    <article className="panel transaction-table-panel">
      <label className="search-field"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.search} /></label>
      <div className="transaction-list dense">
        {rows.map((transaction) => (
          <TransactionRow key={transaction.id} transaction={transaction} data={data} locale={locale} onEdit={setEditing} onVoid={(txn) => { if (!working) void voidTxn(txn); }} />
        ))}
        {!rows.length && <Empty locale={locale} />}
      </div>
    </article>
    {editing && <EditTransactionModal data={data} locale={locale} transaction={editing} onClose={() => setEditing(null)} onSaved={(next) => { onChanged(next); setEditing(null); }} />}
  </div>;
}

function SettingsView({ locale }: { locale: Locale }) {
  const router = useRouter();
  const t = copy[locale];
  const logout = async () => { await apiFetch("/api/auth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "logout" }) }); router.push("/login"); router.refresh(); };
  const exportData = async () => { const response = await fetch("/api/platform?view=export", { cache: "no-store" }); if (!response.ok) return; const blob = await response.blob(); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "wazen-data.json"; link.click(); URL.revokeObjectURL(url); };
  return <div className="dashboard-stack"><div className="section-title"><div><h2>{t.settings}</h2><p>{locale === "ar" ? "تحكم في الخصوصية واللغة والصلاحيات" : "Control privacy, language and permissions"}</p></div><button className="secondary-button" onClick={() => void logout()}>{locale === "ar" ? "تسجيل الخروج" : "Sign out"}</button></div><section className="settings-grid"><InfoPanel icon={<Download />} title={locale === "ar" ? "تنزيل بياناتي" : "Export my data"} text={locale === "ar" ? "نسخة JSON كاملة من محافظك وحركاتك ومستنداتك." : "A complete JSON copy of your wallets, entries and documents."} onClick={() => void exportData()} /><InfoPanel icon={<ShieldCheck />} title={locale === "ar" ? "أمان الحساب" : "Account security"} text={locale === "ar" ? "كلمة المرور والمصادقة الثنائية ومفاتيح API." : "Password, two-factor authentication and API keys."} onClick={() => router.push("/account/security")} /><InfoPanel icon={<ShieldCheck />} title={t.privacy} text={t.privacyText} onClick={() => router.push("/privacy")} /><InfoPanel icon={<Users />} title={t.access} text={t.accessText} /><InfoPanel icon={<Globe2 />} title={locale === "ar" ? "اللغة والمنطقة" : "Language & region"} text={locale === "ar" ? "العربية، الريال العماني، والمنطقة الزمنية لمسقط." : "English, Omani rial and Muscat time zone."} /><InfoPanel icon={<Bell />} title={locale === "ar" ? "التنبيهات" : "Notifications"} text={locale === "ar" ? "تذكير قبل الاستحقاق، إشعارات الدفع وطلبات الاسترداد." : "Due reminders, payment updates and withdrawal requests."} /></section></div>;
}

function InfoPanel({ icon, title, text, onClick }: { icon: ReactNode; title: string; text: string; onClick?: () => void }) {
  return <article className="panel info-panel"><div>{icon}</div><h3>{title}</h3><p>{text}</p><button onClick={onClick} disabled={!onClick}><ArrowUpRight size={16} /></button></article>;
}


function SpaceTransactionsPanel({ space, data, locale, onAdd, onTxnChanged }: { space: Space; data: DashboardData; locale: Locale; onAdd: () => void; onTxnChanged: (next: Partial<DashboardData>) => void }) {
  const t = copy[locale];
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [working, setWorking] = useState(false);
  const transactions = data.transactions.filter((transaction) => transaction.space_id === space.id);
  const voidTxn = async (transaction: Transaction) => {
    if (!window.confirm(locale === "ar" ? "حذف هذه العملية وإلغاء أثرها على الرصيد والعضو؟" : "Void this transaction and reverse its balance/member effect?")) return;
    setWorking(true);
    try {
      const response = await apiFetch("/api/dashboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "voidTransaction", idempotencyKey: crypto.randomUUID(), transactionId: transaction.id }),
      });
      const result = await response.json() as Partial<DashboardData> & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "VOID_FAILED");
      onTxnChanged(result);
    } catch (caught) {
      window.alert(caught instanceof Error ? caught.message : "VOID_FAILED");
    } finally {
      setWorking(false);
    }
  };
  return <>
    <article className="panel list-panel">
      <div className="panel-heading"><h2>{t.recent}</h2><button className="secondary-button" onClick={onAdd}><Plus size={15} />{t.add}</button></div>
      <div className="transaction-list">
        {transactions.length ? transactions.map((transaction) => (
          <TransactionRow key={transaction.id} transaction={transaction} data={data} locale={locale} onEdit={setEditing} onVoid={(txn) => { if (!working) void voidTxn(txn); }} />
        )) : <Empty locale={locale} />}
      </div>
    </article>
    {editing && <EditTransactionModal data={data} locale={locale} transaction={editing} onClose={() => setEditing(null)} onSaved={(next) => { onTxnChanged(next); setEditing(null); }} />}
  </>;
}

function EditTransactionModal({ data, locale, transaction, onClose, onSaved }: { data: DashboardData; locale: Locale; transaction: Transaction; onClose: () => void; onSaved: (next: Partial<DashboardData>) => void }) {
  const t = copy[locale];
  const space = data.spaces.find((item) => item.id === transaction.space_id);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [amount, setAmount] = useState(String(currencyMajor(transaction.amount_minor, space?.currency ?? "OMR")));
  const [description, setDescription] = useState(transactionName(transaction, locale));
  const [kind, setKind] = useState(transaction.kind);
  const [allocation, setAllocation] = useState(transaction.allocation === "voluntary" ? "general" : transaction.allocation);
  const [memberId, setMemberId] = useState(transaction.member_id ?? "");
  const members = data.members.filter((member) => member.space_id === transaction.space_id);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await apiFetch("/api/dashboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "updateTransaction",
          idempotencyKey: crypto.randomUUID(),
          transactionId: transaction.id,
          amount,
          description,
          kind,
          allocation,
          memberId: memberId || null,
        }),
      });
      const result = await response.json() as Partial<DashboardData> & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "SAVE_FAILED");
      onSaved(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "SAVE_FAILED");
    } finally {
      setSaving(false);
    }
  };
  return <Modal title={locale === "ar" ? "تعديل العملية" : "Edit transaction"} onClose={onClose}>
    <form className="modal-form" onSubmit={submit}>
      <div className="segmented-control">{["expense", "income", "contribution", "reimbursement"].map((item) => <button type="button" key={item} className={kind === item ? "active" : ""} onClick={() => setKind(item)}>{t[item as keyof typeof t] as string}</button>)}</div>
      <label><span>{t.amount}</span><div className="money-input"><input required min="0.01" step="0.001" type="number" value={amount} onChange={(event) => setAmount(event.target.value)} /><b className="money-currency"><OmrSymbol size={14} /></b></div></label>
      {members.length > 0 && <label><span>{locale === "ar" ? "العضو" : "Member"}</span><select value={memberId} onChange={(event) => setMemberId(event.target.value)}><option value="">—</option>{members.map((member) => <option key={member.id} value={member.id}>{member.display_name}</option>)}</select></label>}
      <label><span>{t.allocation}</span><select value={allocation} onChange={(event) => setAllocation(event.target.value)}><option value="general">{t.general}</option><option value="mandatory">{t.mandatory}</option><option value="personal_reserve">{t.personalReserve}</option></select></label>
      <label><span>{t.description}</span><input required value={description} onChange={(event) => setDescription(event.target.value)} /></label>
      {error && <p className="modal-error">{error}</p>}
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>{t.cancel}</button><button className="primary-button" disabled={saving}>{saving ? t.saving : t.save}</button></div>
    </form>
  </Modal>;
}

function TransactionModal({ data, locale, preferredSpaceId, onClose, onSaved }: { data: DashboardData; locale: Locale; preferredSpaceId?: string; onClose: () => void; onSaved: (next: Partial<DashboardData>) => void }) {
  const t = copy[locale];
  const initialSpace = preferredSpaceId && data.spaces.some((space) => space.id === preferredSpaceId)
    ? preferredSpaceId
    : (data.spaces.find((space) => space.type !== "personal")?.id ?? data.spaces[0]?.id ?? "");
  const initialSpaceMeta = data.spaces.find((space) => space.id === initialSpace);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [kind, setKind] = useState(initialSpaceMeta && initialSpaceMeta.type !== "personal" ? "contribution" : "expense");
  const [spaceId, setSpaceId] = useState(initialSpace);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [allocation, setAllocation] = useState("mandatory");
  const [memberId, setMemberId] = useState("");
  const [extraPolicy, setExtraPolicy] = useState("advance_credit");
  const [paidFrom, setPaidFrom] = useState<"common_fund" | "member">("common_fund");
  const members = data.members.filter((member) => member.space_id === spaceId);
  const space = data.spaces.find((item) => item.id === spaceId);
  const plan = data.plans.find((item) => String(item.space_id) === spaceId);
  const monthlyPlan = Number(plan?.amount_minor ?? 0);
  const selectedMember = members.find((member) => member.id === memberId);
  const amountNumber = Number(amount || 0);
  const remainingDue = selectedMember ? Math.max(0, selectedMember.due_minor - selectedMember.paid_minor) : 0;
  const remainingMajor = currencyMajor(remainingDue, space?.currency ?? "OMR");
  const isGroupMemberPayment = Boolean(memberId) && space && space.type !== "personal" && (kind === "contribution" || kind === "income");
  const previewMandatory = isGroupMemberPayment && amountNumber > 0
    ? Math.min(amountNumber, remainingMajor)
    : 0;
  const previewSurplus = isGroupMemberPayment && amountNumber > previewMandatory
    ? amountNumber - previewMandatory
    : 0;
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError("");
    try {
      if (kind === "contribution" && !memberId) throw new Error(locale === "ar" ? "اختر العضو المساهم" : "Choose the contributing member");
      if (kind === "expense" && space && space.type !== "personal" && paidFrom === "member" && !memberId) {
        throw new Error(locale === "ar" ? "اختر الحساب/العضو الذي دفع المصروف" : "Choose which member paid the expense");
      }
      const useSmartSplit = Boolean(isGroupMemberPayment && monthlyPlan > 0);
      const useGroupExpense = kind === "expense" && space && space.type !== "personal";
      const response = await apiFetch("/api/dashboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(useGroupExpense
          ? {
              action: "addTripExpense",
              idempotencyKey: crypto.randomUUID(),
              spaceId,
              paidFrom,
              paidByMemberId: paidFrom === "member" ? memberId : undefined,
              amount,
              description: description || (locale === "ar" ? "مصروف جماعي" : "Group expense"),
            }
          : useSmartSplit
          ? {
              action: "recordContributionPayment",
              idempotencyKey: crypto.randomUUID(),
              spaceId,
              memberId,
              amount,
              description: description || undefined,
              extraPolicy,
            }
          : {
              action: "addTransaction",
              idempotencyKey: crypto.randomUUID(),
              kind,
              spaceId,
              amount,
              description: description || (locale === "ar" ? "عملية مالية" : "Transaction"),
              allocation: kind === "contribution" ? "mandatory" : allocation,
              memberId: memberId || undefined,
            }),
      });
      const result = await response.json() as Partial<DashboardData> & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "save failed");
      onSaved(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "SAVE_FAILED");
    } finally { setSaving(false); }
  };
  return <Modal title={t.add} onClose={onClose}><form className="modal-form" onSubmit={submit}><div className="segmented-control">{["expense", "income", "contribution", "reimbursement"].map((item) => <button type="button" key={item} className={kind === item ? "active" : ""} onClick={() => setKind(item)}>{t[item as keyof typeof t] as string}</button>)}</div><label><span>{t.wallet}</span><select value={spaceId} onChange={(event) => { const next = event.target.value; setSpaceId(next); setMemberId(""); const meta = data.spaces.find((item) => item.id === next); if (meta && meta.type !== "personal") setKind("contribution"); }}>{data.spaces.map((item) => <option key={item.id} value={item.id}>{nameOf(item, locale)}</option>)}</select></label><div className="form-row"><label><span>{t.amount}</span><div className="money-input"><input required min="0.01" step="0.001" type="number" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.000" /><b className="money-currency"><OmrSymbol size={14} /></b></div></label>{kind !== "contribution" && kind !== "expense" && <label><span>{t.allocation}</span><select value={allocation} onChange={(event) => setAllocation(event.target.value)}><option value="general">{t.general}</option><option value="mandatory">{t.mandatory}</option><option value="personal_reserve">{t.personalReserve}</option></select></label>}{kind === "contribution" && <label><span>{locale === "ar" ? "سياسة الزيادة" : "Surplus policy"}</span><select value={extraPolicy} onChange={(event) => setExtraPolicy(event.target.value)}><option value="advance_credit">{locale === "ar" ? "مقدّم (افتراضي)" : "Advance (default)"}</option><option value="personal_reserve">{locale === "ar" ? "فائض شخصي محمي" : "Protected personal reserve"}</option><option value="voluntary_to_fund">{locale === "ar" ? "تطوع للصندوق" : "Voluntary to common fund"}</option></select></label>}{kind === "expense" && space && space.type !== "personal" && <label><span>{locale === "ar" ? "دُفع من" : "Paid from"}</span><select value={paidFrom} onChange={(event) => setPaidFrom(event.target.value as "common_fund" | "member")}><option value="common_fund">{locale === "ar" ? "صندوق المجموعة" : "Group fund"}</option><option value="member">{locale === "ar" ? "حساب عضو" : "Member account"}</option></select></label>}</div>{members.length > 0 && <label><span>{kind === "contribution" || (kind === "expense" && paidFrom === "member") ? (locale === "ar" ? "العضو (مطلوب)" : "Member (required)") : (locale === "ar" ? "العضو (اختياري — للدخل يخصم من المستحق)" : "Member (optional — income applies to dues)")}</span><select required={kind === "contribution" || (kind === "expense" && paidFrom === "member")} value={memberId} onChange={(event) => setMemberId(event.target.value)}><option value="">—</option>{members.map((member) => <option key={member.id} value={member.id}>{member.display_name}{member.due_minor > member.paid_minor ? (locale === "ar" ? ` · عليه ${currencyMajor(member.due_minor - member.paid_minor, space?.currency ?? "OMR").toFixed(3)}` : ` · owes ${currencyMajor(member.due_minor - member.paid_minor, space?.currency ?? "OMR").toFixed(3)}`) : (member.paid_minor > member.due_minor ? (locale === "ar" ? ` · له مقدّم` : ` · advance`) : "")}</option>)}</select></label>}{isGroupMemberPayment && amountNumber > 0 && <div className="modal-note split-preview"><span>{locale === "ar" ? "القاعدة: خصم المطالبات المتراكمة أولاً ثم أي زيادة كمقدّم" : "Rule: apply to outstanding dues first; surplus becomes advance"}</span><strong>{locale === "ar" ? `سداد مطالبة: ${previewMandatory.toFixed(3)}` : `Toward dues: ${previewMandatory.toFixed(3)}`}</strong><strong>{locale === "ar" ? `مقدّم: ${previewSurplus.toFixed(3)}` : `Advance: ${previewSurplus.toFixed(3)}`}</strong>{remainingMajor > 0 && <span>{locale === "ar" ? `المتبقي عليه قبل العملية: ${remainingMajor.toFixed(3)}` : `Outstanding before: ${remainingMajor.toFixed(3)}`}</span>}</div>}<label><span>{t.description}</span><input required={kind !== "contribution"} value={description} onChange={(event) => setDescription(event.target.value)} placeholder={locale === "ar" ? "مثال: مساهمة أغسطس" : "e.g. August contribution"} /></label>{error && <p className="modal-error">{error}</p>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>{t.cancel}</button><button className="primary-button" disabled={saving}>{saving ? t.saving : t.save}</button></div></form></Modal>;
}

function WalletModal({ locale, onClose, onSaved }: { data: DashboardData; locale: Locale; onClose: () => void; onSaved: (next: Partial<DashboardData>) => void }) {
  const t = copy[locale];
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState("trip");
  const [goal, setGoal] = useState("");
  const [monthlyContribution, setMonthlyContribution] = useState("20");
  const [durationMonths, setDurationMonths] = useState("12");
  const isGroup = ["household", "trip", "society", "group"].includes(type);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const response = await apiFetch("/api/dashboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "addWallet",
          idempotencyKey: crypto.randomUUID(),
          name,
          type,
          goal: goal || "0",
          ...(isGroup && monthlyContribution
            ? { monthlyContribution, durationMonths: Number(durationMonths) || 12, dueDay: 1 }
            : {}),
        }),
      });
      const result = await response.json() as Partial<DashboardData> & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "save failed");
      onSaved(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "SAVE_FAILED");
    } finally { setSaving(false); }
  };
  return <Modal title={t.newWallet} onClose={onClose}><form className="modal-form" onSubmit={submit}><label><span>{t.walletName}</span><input required value={name} onChange={(event) => setName(event.target.value)} placeholder={locale === "ar" ? "مثال: سفرة الإخوة 2027" : "e.g. Siblings trip 2027"} /></label><label><span>{t.walletType}</span><select value={type} onChange={(event) => setType(event.target.value)}>{Object.entries(typeLabels[locale]).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label><span>{t.goal}</span><div className="money-input"><input min="0" step="1" type="number" value={goal} onChange={(event) => setGoal(event.target.value)} placeholder="0" /><b className="money-currency"><OmrSymbol size={14} /></b></div></label>{isGroup && <div className="form-row"><label><span>{locale === "ar" ? "المساهمة الشهرية الإلزامية" : "Mandatory monthly contribution"}</span><div className="money-input"><input required min="0.01" step="0.001" type="number" value={monthlyContribution} onChange={(event) => setMonthlyContribution(event.target.value)} /><b className="money-currency"><OmrSymbol size={14} /></b></div></label><label><span>{locale === "ar" ? "مدة الخطة (أشهر)" : "Plan duration (months)"}</span><input required type="number" min="1" max="120" value={durationMonths} onChange={(event) => setDurationMonths(event.target.value)} /></label></div>}{isGroup && <p className="modal-note">{locale === "ar" ? "عند استلام مبلغ من عضو: يُخصم أولاً من المطالبات المتراكمة عليه، وأي زيادة تُسجَّل مقدّماً (له)." : "When a member pays: outstanding dues are cleared first, and any surplus is booked as advance credit."}</p>}{error && <p className="modal-error">{error}</p>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>{t.cancel}</button><button className="primary-button" disabled={saving}>{saving ? t.saving : t.create}</button></div></form></Modal>;
}

function InviteModal({ data, locale, preferredSpaceId, onClose, onDone }: { data: DashboardData; locale: Locale; preferredSpaceId?: string; onClose: () => void; onDone: (message: string) => void }) {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [recordOnly, setRecordOnly] = useState(false);
  const [role, setRole] = useState("member");
  const [spaceId, setSpaceId] = useState(preferredSpaceId ?? data.spaces.find((space) => space.type === "trip")?.id ?? data.spaces.find((space) => space.type !== "personal")?.id ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await apiFetch(recordOnly ? "/api/dashboard" : "/api/platform", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: recordOnly ? "addMember" : "inviteMember", idempotencyKey: crypto.randomUUID(), email, displayName, role, spaceId }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to create invitation");
      onDone(recordOnly ? (locale === "ar" ? `تمت إضافة ${displayName} إلى سجل المساهمين` : `${displayName} was added to the member ledger`) : (locale === "ar" ? `تم إنشاء دعوة آمنة لـ ${email}` : `A secure invitation was created for ${email}`));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create invitation");
    } finally {
      setSaving(false);
    }
  };
  const roles = locale === "ar"
    ? { member: "عضو", treasurer: "أمين صندوق", manager: "مدير", auditor: "مدقق", viewer: "مشاهدة فقط" }
    : { member: "Member", treasurer: "Treasurer", manager: "Manager", auditor: "Auditor", viewer: "View only" };
  const groupSpaces = data.spaces.filter((space) => space.type !== "personal");
  return <Modal title={locale === "ar" ? "دعوة عضو" : "Invite a member"} onClose={onClose}>
    <form className="modal-form" onSubmit={submit}>
      <div className="segmented-control"><button type="button" className={!recordOnly ? "active" : ""} onClick={() => setRecordOnly(false)}>{locale === "ar" ? "دعوة إلكترونية" : "Email invite"}</button><button type="button" className={recordOnly ? "active" : ""} onClick={() => setRecordOnly(true)}>{locale === "ar" ? "إضافة للسجل" : "Ledger member"}</button></div>
      {recordOnly && <label><span>{locale === "ar" ? "اسم المساهم" : "Member name"}</span><input required minLength={2} maxLength={80} value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>}
      <label><span>{locale === "ar" ? `البريد الإلكتروني${recordOnly ? " (اختياري)" : ""}` : `Email address${recordOnly ? " (optional)" : ""}`}</span><input required={!recordOnly} type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="member@example.com" /></label>
      <label><span>{locale === "ar" ? "المحفظة الجماعية" : "Group wallet"}</span><select required value={spaceId} onChange={(event) => setSpaceId(event.target.value)}>{groupSpaces.map((space) => <option key={space.id} value={space.id}>{nameOf(space, locale)}</option>)}</select></label>
      <label><span>{locale === "ar" ? "الصلاحية" : "Access role"}</span><select value={role} onChange={(event) => setRole(event.target.value)}>{Object.entries(roles).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      {error && <p className="modal-error">{error}</p>}
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>{copy[locale].cancel}</button><button className="primary-button" disabled={saving || groupSpaces.length === 0}>{saving ? copy[locale].saving : copy[locale].invite}</button></div>
    </form>
  </Modal>;
}

function TripExpenseModal({ data, locale, preferredSpaceId, onClose, onSaved }: { data: DashboardData; locale: Locale; preferredSpaceId?: string; onClose: () => void; onSaved: (next: Partial<DashboardData>) => void }) {
  const groupSpaces = data.spaces.filter((space) => ["household", "trip", "society", "group"].includes(space.type));
  const initialSpaceId = preferredSpaceId && groupSpaces.some((space) => space.id === preferredSpaceId)
    ? preferredSpaceId
    : (groupSpaces[0]?.id ?? "");
  const [spaceId, setSpaceId] = useState(initialSpaceId);
  const members = data.members.filter((member) => member.space_id === spaceId);
  const [paidFrom, setPaidFrom] = useState<"common_fund" | "member">("member");
  const [paidByMemberId, setPayer] = useState(members[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!spaceId) return;
    setSaving(true);
    setError("");
    try {
      const response = await apiFetch("/api/dashboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "addTripExpense",
          idempotencyKey: crypto.randomUUID(),
          spaceId,
          paidFrom,
          paidByMemberId: paidFrom === "member" ? paidByMemberId : undefined,
          amount,
          description,
        }),
      });
      const result = await response.json() as Partial<DashboardData> & { error?: string };
      if (!response.ok) throw new Error(result.error);
      onSaved(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "SAVE_FAILED");
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal title={locale === "ar" ? "إضافة مصروف جماعي" : "Add group expense"} onClose={onClose}>
      <form className="modal-form" onSubmit={submit}>
        <label><span>{locale === "ar" ? "المحفظة" : "Wallet"}</span><select required value={spaceId} onChange={(event) => { setSpaceId(event.target.value); const nextMembers = data.members.filter((member) => member.space_id === event.target.value); setPayer(nextMembers[0]?.id ?? ""); }}>{groupSpaces.map((space) => <option key={space.id} value={space.id}>{nameOf(space, locale)}</option>)}</select></label>
        <label><span>{locale === "ar" ? "دُفع من" : "Paid from"}</span><select value={paidFrom} onChange={(event) => setPaidFrom(event.target.value as "common_fund" | "member")}><option value="common_fund">{locale === "ar" ? "صندوق المجموعة" : "Group fund"}</option><option value="member">{locale === "ar" ? "حساب عضو" : "Member account"}</option></select></label>
        {paidFrom === "member" && <label><span>{locale === "ar" ? "العضو الذي دفع" : "Member who paid"}</span><select required value={paidByMemberId} onChange={(event) => setPayer(event.target.value)}>{members.map((member) => <option key={member.id} value={member.id}>{member.display_name}</option>)}</select></label>}
        <label><span>{locale === "ar" ? "المبلغ" : "Amount"}</span><div className="money-input"><input required type="number" min="0.01" step="0.001" value={amount} onChange={(event) => setAmount(event.target.value)} /><b className="money-currency"><OmrSymbol size={14} /></b></div></label>
        <label><span>{locale === "ar" ? "الوصف" : "Description"}</span><input required minLength={2} maxLength={300} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
        <p className="modal-note">{paidFrom === "common_fund"
          ? (locale === "ar" ? "يُخصم من رصيد الصندوق مباشرة، ويُقسَّم للعرض بين الأعضاء." : "Deducted from the group fund and split for reporting.")
          : (locale === "ar" ? "يُقسَّم المصروف بالتساوي: الدافع يصبح له، وباقي الأعضاء عليهم حصصهم." : "Split equally: the payer is owed (credit), others owe their shares.")}</p>
        {error && <p className="modal-error">{error}</p>}
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>{copy[locale].cancel}</button><button className="primary-button" disabled={saving || !spaceId || !members.length}>{saving ? copy[locale].saving : copy[locale].save}</button></div>
      </form>
    </Modal>
  );
}

function SurplusWithdrawModal({ data, locale, memberId, onClose, onSaved }: { data: DashboardData; locale: Locale; memberId: string; onClose: () => void; onSaved: (next: Partial<DashboardData>) => void }) {
  const member = data.members.find((item) => item.id === memberId);
  const space = data.spaces.find((item) => item.id === member?.space_id);
  const maxMajor = currencyMajor(member?.extra_minor ?? 0, space?.currency ?? "OMR").toFixed(3);
  const [amount, setAmount] = useState(maxMajor);
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!member || !space) return;
    setSaving(true);
    setError("");
    try {
      const response = await apiFetch("/api/dashboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "withdrawSurplus",
          idempotencyKey: crypto.randomUUID(),
          spaceId: space.id,
          memberId: member.id,
          amount,
          ...(description.trim() ? { description: description.trim() } : {}),
        }),
      });
      const result = await response.json() as Partial<DashboardData> & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "WITHDRAW_FAILED");
      onSaved(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "WITHDRAW_FAILED");
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal title={locale === "ar" ? "صرف فائض شخصي" : "Withdraw personal surplus"} onClose={onClose}>
      <form className="modal-form" onSubmit={submit}>
        <p className="modal-note">
          {locale === "ar"
            ? `الفائض ملك لـ ${member?.display_name ?? "العضو"} ولا يُخصم من رصيد الصندوق المشترك.`
            : `Surplus belongs to ${member?.display_name ?? "the member"} and never debits the shared fund balance.`}
        </p>
        <label>
          <span>{locale === "ar" ? "المبلغ المتاح" : "Available reserve"}</span>
          <strong className="reserve-amount">{formatMoney(member?.extra_minor ?? 0, space?.currency ?? "OMR", locale)}</strong>
        </label>
        <label>
          <span>{locale === "ar" ? "مبلغ الصرف" : "Withdrawal amount"}</span>
          <div className="money-input">
            <input required type="number" min="0.01" step="0.001" max={maxMajor} value={amount} onChange={(event) => setAmount(event.target.value)} />
            <b className="money-currency"><OmrSymbol size={14} /></b>
          </div>
        </label>
        <label>
          <span>{locale === "ar" ? "ملاحظة (اختياري)" : "Note (optional)"}</span>
          <input maxLength={300} value={description} onChange={(event) => setDescription(event.target.value)} placeholder={locale === "ar" ? "مثال: استرداد فائض نقدي" : "e.g. Cash surplus refund"} />
        </label>
        {error && <p className="modal-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>{copy[locale].cancel}</button>
          <button className="primary-button" disabled={saving || !member || !space || !(member?.extra_minor > 0)}>{saving ? copy[locale].saving : (locale === "ar" ? "صرف" : "Withdraw")}</button>
        </div>
      </form>
    </Modal>
  );
}

function CircleOrderModal({ data, locale, onClose, onSaved }: { data: DashboardData; locale: Locale; onClose: () => void; onSaved: (next: Partial<DashboardData>) => void }) {
  const society = data.spaces.find((space) => space.type === "society"); const members = data.members.filter((member) => member.space_id === society?.id);
  const [mode, setMode] = useState("manual"); const [amount, setAmount] = useState(""); const [monthlyContribution, setMonthlyContribution] = useState(""); const [durationMonths, setDurationMonths] = useState("60"); const [dueDay, setDueDay] = useState("1"); const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  const labels = locale === "ar" ? { manual: "ترتيب المدير", round_robin: "بالدور", draw: "قرعة إلكترونية", alphabetical: "أبجدي", hierarchical: "هرمي" } : { manual: "Manager order", round_robin: "Round robin", draw: "Electronic draw", alphabetical: "Alphabetical", hierarchical: "Hierarchical" };
  const submit = async (event: FormEvent) => { event.preventDefault(); if (!society) return; setSaving(true); setError(""); try {
    const response = await apiFetch("/api/dashboard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "setCircleOrder", idempotencyKey: crypto.randomUUID(), spaceId: society.id, mode, amount, monthlyContribution, durationMonths: Number(durationMonths), dueDay: Number(dueDay), memberIds: members.map((member) => member.id) }) });
    const result = await response.json() as Partial<DashboardData> & { error?: string }; if (!response.ok) throw new Error(result.error); onSaved(result);
  } catch (caught) { setError(caught instanceof Error ? caught.message : "SAVE_FAILED"); } finally { setSaving(false); } };
  return <Modal title={locale === "ar" ? "إعداد أدوار الجمعية" : "Configure circle turns"} onClose={onClose}><form className="modal-form" onSubmit={submit}><label><span>{locale === "ar" ? "نظام الترتيب" : "Ordering method"}</span><select value={mode} onChange={(event) => setMode(event.target.value)}>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><div className="form-row"><label><span>{locale === "ar" ? "المساهمة الشهرية" : "Monthly contribution"}</span><div className="money-input"><input required type="number" min="0.01" step="0.001" value={monthlyContribution} onChange={(event) => setMonthlyContribution(event.target.value)} /><b className="money-currency"><OmrSymbol size={14} /></b></div></label><label><span>{locale === "ar" ? "مدة الخطة بالأشهر" : "Duration in months"}</span><input required type="number" min="1" max="120" value={durationMonths} onChange={(event) => setDurationMonths(event.target.value)} /></label></div><div className="form-row"><label><span>{locale === "ar" ? "يوم الاستحقاق" : "Due day"}</span><input required type="number" min="1" max="28" value={dueDay} onChange={(event) => setDueDay(event.target.value)} /></label><label><span>{locale === "ar" ? "مبلغ الاستلام لكل دور" : "Payout per turn"}</span><div className="money-input"><input required type="number" min="0.01" step="0.001" value={amount} onChange={(event) => setAmount(event.target.value)} /><b className="money-currency"><OmrSymbol size={14} /></b></div></label></div><div className="modal-note">{members.map((member, index) => <span key={member.id}>{index + 1}. {member.display_name}</span>)}</div>{error && <p className="modal-error">{error}</p>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>{copy[locale].cancel}</button><button className="primary-button" disabled={saving || !society || !members.length}>{saving ? copy[locale].saving : copy[locale].save}</button></div></form></Modal>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="modal-card" role="dialog" aria-modal="true" aria-label={title}><div className="modal-header"><h2>{title}</h2><button onClick={onClose} aria-label="Close"><X size={20} /></button></div>{children}</section></div>;
}

function Empty({ locale }: { locale: Locale }) { return <div className="empty-state"><ReceiptText size={24} /><span>{copy[locale].empty}</span></div>; }
function LoadingScreen({ locale }: { locale: Locale }) {
  return (
    <WazenPageLoader
      label={locale === "ar" ? "جاري تحميل لوحة وازن…" : "Loading Wazen…"}
    />
  );
}
function ErrorScreen({ message, retry }: { message: string; retry: () => void }) { return <div className="error-screen"><CircleDollarSign size={40} /><h1>وازن</h1><p>{message}</p><button className="primary-button" onClick={retry}>Try again</button></div>; }
