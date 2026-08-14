"use client";

import OmrSymbol from "../components/brand/OmrSymbol";
import { WazenIcon } from "../components/brand/WazenLogo";
import WazenPageLoader from "../components/brand/WazenPageLoader";
import { ReportsPanel } from "../components/reports/ReportsPanel";
import { MemberDetailModal, MemberPersonProfile, ReceiptChannelModal, RemainingInvoiceGrid, SmartAccountantModal, memberAccruedDueMinor, memberInstallments, personIdentityKey } from "../components/members/association-members";
import { isPeriodLocked } from "../lib/accounting-periods";
import { buildReportHtml, openReportPreview } from "../lib/reports";
import { allocateOldestFirst, remainingInstallmentMinor, selectByAmount, selectThroughOldest, totalRemainingMinor } from "../lib/installments";
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
  LogOut,
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
  Unlock,
  UserPlus,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState, startTransition } from "react";
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
  addon_minor?: number;
  phone?: string | null;
  avatar: string;
  joined_at?: string;
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
type TripExpense = { id: string; space_id: string; paid_by_member_id: string; paid_by_name: string; amount_minor: number; description: string; occurred_at: string; paid_from?: string };
type ExpenseSplit = { id: string; expense_id: string; member_id: string; display_name: string; share_minor: number };
type Settlement = { id: string; space_id: string; from_member_id: string; to_member_id: string; from_member_name: string | null; to_member_name: string | null; amount_minor: number; status: string };
type DashboardData = { user: User; spaces: Space[]; members: Member[]; transactions: Transaction[]; plans: Record<string, unknown>[]; circleTurns: CircleTurn[]; tripExpenses: TripExpense[]; expenseSplits: ExpenseSplit[]; settlements: Settlement[]; installments?: Array<{ id: string; member_id: string; space_id: string; period_index: number; period_key: string; amount_minor: number; paid_minor: number; status: string; due_at?: string }>; contacts?: Array<{ id: string; display_name: string; email: string | null; phone: string | null }>; periods?: Array<{ id: string; space_id: string; label: string; starts_at: string; ends_at?: string | null; closed_at?: string | null; reopened_at?: string | null; closed_by_name?: string | null; reopened_by_name?: string | null; reopen_count?: number; status: string }>; periodEvents?: Array<{ id: string; space_id: string; period_id?: string | null; actor_name?: string | null; action: string; summary_ar?: string | null; summary_en?: string | null; created_at: string }> };

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
    logout: "تسجيل الخروج",
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
    logout: "Sign out",
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

function personGoalMinor(member: Member) {
  return Math.max(0, member.due_minor);
}

function spaceGoalMinor(space: Space, data: DashboardData) {
  const membersDue = data.members.filter((member) => member.space_id === space.id).reduce((sum, member) => sum + member.due_minor, 0);
  if (membersDue > 0) return membersDue;
  const plan = data.plans.find((item) => String(item.space_id) === space.id);
  const monthly = Number(plan?.amount_minor ?? 0);
  const duration = Number(plan?.duration_months ?? 0);
  if (monthly > 0 && duration > 0) return monthly * duration;
  return space.goal_minor;
}

function memberPosition(member: Member, data?: DashboardData) {
  const plan = data?.plans.find((item) => String(item.space_id) === member.space_id);
  const accruedDue = data ? memberAccruedDueMinor(member, data.installments ?? [], plan) : member.due_minor;
  const remainingDue = Math.max(0, accruedDue - member.paid_minor);
  const advance = Math.max(0, member.paid_minor - accruedDue);
  const credit = advance + Math.max(0, member.extra_minor); // له
  const debit = remainingDue; // عليه حتى الشهر الحالي
  return { remainingDue, advance, credit, debit };
}

function printAccountingPeriod(space: Space, period: NonNullable<DashboardData["periods"]>[number], data: DashboardData, locale: Locale) {
  const start = new Date(period.starts_at).getTime();
  const end = new Date(period.ends_at || period.closed_at || new Date().toISOString()).getTime();
  const reportSpace = { id: space.id, name_ar: space.name_ar, name_en: space.name_en, type: space.type, currency: space.currency, balance_minor: space.balance_minor, goal_minor: space.goal_minor };
  const html = buildReportHtml({
    locale,
    reportType: "period",
    logoUrl: `${window.location.origin}/brand/wazen-lockup.svg`,
    issuerName: period.label,
    titleOverride: locale === "ar" ? `كشف الفترة المحاسبية — ${period.label}` : `Accounting period — ${period.label}`,
    space: reportSpace,
    spaces: [reportSpace],
    members: data.members.filter((member) => member.space_id === space.id).map((member) => ({
      id: member.id,
      space_id: member.space_id,
      display_name: member.display_name,
      email: member.email,
      role: member.role,
      due_minor: member.due_minor,
      paid_minor: member.paid_minor,
      extra_minor: member.extra_minor + Number(member.addon_minor ?? 0),
    })),
    transactions: data.transactions.filter((txn) => {
      if (txn.space_id !== space.id) return false;
      const at = new Date(txn.occurred_at).getTime();
      return at >= start && at <= end;
    }),
  });
  if (!openReportPreview(html, true)) window.alert(locale === "ar" ? "اسمح بالنوافذ المنبثقة لطباعة الكشف." : "Allow pop-ups to print the statement.");
}

function memberExpenseNet(memberId: string, data: DashboardData, spaceId: string) {
  let net = 0;
  for (const settlement of data.settlements.filter((item) => item.space_id === spaceId && item.status === "pending")) {
    if (settlement.to_member_id === memberId) net += settlement.amount_minor;
    if (settlement.from_member_id === memberId) net -= settlement.amount_minor;
  }
  return net;
}

function dashboardError(code: string, locale: Locale) {
  const table = locale === "ar"
    ? {
      INSUFFICIENT_FUNDS: "رصيد الصندوق لا يكفي.",
      PERIOD_CLOSED: "الفترة مغلقة. أعد فتحها للتعديل.",
      PERIOD_UNSETTLED: "لا يمكن إغلاق الفترة قبل أن يسدّد كل الأعضاء ما عليهم (الاشتراك والتسويات المعلقة).",
      INVALID_PAYER: "اختر حساب الدفع.",
      PERIOD_NOT_CLOSED: "هذه الفترة ليست مغلقة.",
    }
    : {
      INSUFFICIENT_FUNDS: "Insufficient fund balance.",
      PERIOD_CLOSED: "The period is closed. Reopen it to edit.",
      PERIOD_UNSETTLED: "Close the period only after every member settles dues and pending shares.",
      INVALID_PAYER: "Choose who paid.",
      PERIOD_NOT_CLOSED: "This period is not closed.",
    };
  return table[code as keyof typeof table] ?? code;
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


function viewForSpaceType(type: string): ViewId {
  if (type === "personal") return "personal";
  if (type === "household") return "household";
  if (type === "trip") return "trip";
  return "society";
}

function NotificationBell({ data, locale, onOpen }: { data: DashboardData; locale: Locale; onOpen: (view: ViewId, spaceId: string) => void }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const items = useMemo(() => {
    const rows: Array<{ id: string; title: string; detail: string; view: ViewId; spaceId: string }> = [];
    for (const space of data.spaces) {
      if (space.balance_minor >= 0) continue;
      rows.push({
        id: `deficit:${space.id}`,
        title: locale === "ar" ? `عجز في ${nameOf(space, locale)}` : `Deficit in ${nameOf(space, locale)}`,
        detail: locale === "ar"
          ? `الرصيد ${formatMoney(space.balance_minor, space.currency, locale)} — قُسّم على المساهمين`
          : `Balance ${formatMoney(space.balance_minor, space.currency, locale)} — split among contributors`,
        view: viewForSpaceType(space.type),
        spaceId: space.id,
      });
    }
    for (const settlement of data.settlements.filter((item) => item.status === "pending")) {
      const space = data.spaces.find((item) => item.id === settlement.space_id);
      if (!space) continue;
      const toFund = String(settlement.to_member_id).startsWith("space:");
      const fromFund = String(settlement.from_member_id).startsWith("space:");
      const title = toFund
        ? (locale === "ar" ? `${settlement.from_member_name ?? "عضو"} عليه للصندوق` : `${settlement.from_member_name ?? "Member"} owes the fund`)
        : fromFund
          ? (locale === "ar" ? `الصندوق مدين لـ ${settlement.to_member_name ?? "عضو"}` : `Fund owes ${settlement.to_member_name ?? "a member"}`)
          : (locale === "ar" ? `${settlement.from_member_name ?? "عضو"} → ${settlement.to_member_name ?? "عضو"}` : `${settlement.from_member_name ?? "Member"} → ${settlement.to_member_name ?? "member"}`);
      rows.push({
        id: `settle:${settlement.id}`,
        title,
        detail: formatMoney(settlement.amount_minor, space.currency, locale),
        view: viewForSpaceType(space.type),
        spaceId: space.id,
      });
    }
    return rows;
  }, [data, locale]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="notification-wrap" ref={wrapRef}>
      <button type="button" className="icon-button notification-button" aria-label={locale === "ar" ? "التنبيهات" : "Notifications"} onClick={() => setOpen((current) => !current)}>
        <Bell size={19} />
        {items.length > 0 && <i />}
      </button>
      {open && (
        <div className="notification-panel" role="menu">
          <h3>{locale === "ar" ? "التنبيهات" : "Notifications"}</h3>
          {items.length === 0 && <p className="notification-empty">{locale === "ar" ? "لا توجد تنبيهات حالياً." : "No alerts right now."}</p>}
          {items.map((item) => (
            <button
              type="button"
              className="notification-item"
              key={item.id}
              onClick={() => {
                onOpen(item.view, item.spaceId);
                setOpen(false);
              }}
            >
              <strong>{item.title}</strong>
              <span>{item.detail}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function WazenDashboard() {
  const router = useRouter();
  const [locale, setLocale] = useState<Locale>("ar");
  const [activeView, setActiveView] = useState<ViewId>("overview");
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [modal, setModal] = useState<"transaction" | "wallet" | "invite" | "tripExpense" | "circleOrder" | "withdrawSurplus" | "smartPay" | "memberDetail" | "memberProfile" | "sendReceipt" | "clonePeriod" | null>(null);
  const [pickedSpaceId, setPickedSpaceId] = useState<Partial<Record<ViewId, string>>>({});
  const [activeMemberId, setActiveMemberId] = useState("");
  const [receiptTxnId, setReceiptTxnId] = useState<string | undefined>(undefined);
  const [withdrawMemberId, setWithdrawMemberId] = useState("");
  const [editingExpenseId, setEditingExpenseId] = useState("");
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

  const viewSpaceType: Partial<Record<ViewId, Space["type"]>> = { personal: "personal", household: "household", trip: "trip", society: "society" };
  const spacesForView = (data?.spaces ?? []).filter((space) => {
    const expected = viewSpaceType[activeView];
    if (!expected) return false;
    if (activeView !== "society") return space.type === expected;
    if (space.type === "society" || space.type === "group") return true;
    const hasTurns = (data?.circleTurns ?? []).some((turn) => turn.space_id === space.id);
    const looksLikeCircle = /جمعي|circle|association|ros[ck]a/i.test(`${space.name_ar} ${space.name_en}`);
    return hasTurns || looksLikeCircle;
  });
  const walletDefaultType = viewSpaceType[activeView] ?? "trip";

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
  const logout = async () => {
    await apiFetch("/api/auth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "logout" }) });
    router.push("/login");
    router.refresh();
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

  const activeSpace = spacesForView.find((space) => space.id === pickedSpaceId[activeView]) ?? spacesForView[0];
  const openNewWallet = () => setModal("wallet");
  const addWalletLabel = activeView === "society"
    ? (locale === "ar" ? "إضافة جمعية" : "Add circle")
    : activeView === "household"
      ? (locale === "ar" ? "إضافة محفظة منزل" : "Add household wallet")
      : activeView === "trip"
        ? (locale === "ar" ? "إضافة محفظة سفر" : "Add trip wallet")
        : (locale === "ar" ? "إضافة محفظة" : "Add wallet");

  return (
    <div className="app-shell">
      <Sidebar locale={locale} active={activeView} open={sidebarOpen} onNavigate={changeView} onClose={() => setSidebarOpen(false)} onLogout={() => void logout()} />

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
            <NotificationBell data={data} locale={locale} onOpen={(view, spaceId) => {
              setPickedSpaceId((current) => ({ ...current, [view]: spaceId }));
              changeView(view);
            }} />
            <button className="primary-button" onClick={() => setModal("transaction")}><Plus size={18} />{t.add}</button>
            <UserMenu locale={locale} name={data.user.displayName} email={data.user.email} onSettings={() => changeView("settings")} onLogout={() => void logout()} />
          </div>
        </header>

        <div className="page-content">
          {activeView === "overview" && (
            <Overview data={data} locale={locale} totals={totals} onView={changeView} onAddWallet={openNewWallet} />
          )}
          {viewSpaceType[activeView] && (
            <>
              <div className="space-switcher">
                {spacesForView.map((space) => (
                  <button key={space.id} type="button" className={activeSpace?.id === space.id ? "active" : ""} onClick={() => setPickedSpaceId((current) => ({ ...current, [activeView]: space.id }))}>{nameOf(space, locale)}</button>
                ))}
                <button type="button" className="primary-button" onClick={openNewWallet}><Plus size={16} />{addWalletLabel}</button>
              </div>
              {!activeSpace && (
                <article className="panel"><div className="empty-state"><WalletCards size={28} /><strong>{addWalletLabel}</strong><p>{activeView === "society" ? (locale === "ar" ? "لا توجد جمعية بعد. أنشئ جمعية جديدة لإدارة الأقساط والأدوار والأعضاء." : "No savings circle yet. Create one to manage dues, turns, and members.") : (locale === "ar" ? "لا توجد محفظة في هذا القسم بعد." : "No wallet in this section yet.")}</p><button className="primary-button" onClick={openNewWallet}><Plus size={16} />{addWalletLabel}</button></div></article>
              )}
            </>
          )}
          {activeSpace && (
            <SpaceDetail space={activeSpace} data={data} locale={locale} onAdd={() => setModal("transaction")} onInvite={() => setModal("invite")} onTripExpense={() => { setEditingExpenseId(""); setModal("tripExpense"); }} onEditExpense={(expenseId) => { setEditingExpenseId(expenseId); setModal("tripExpense"); }} onCircleOrder={() => setModal("circleOrder")} onClonePeriod={() => setModal("clonePeriod")} onReopenPeriod={(periodId) => { if (window.confirm(locale === "ar" ? "إعادة فتح الفترة للتعديل؟ ستُسجَّل باسمك كل عملية فتح أو تعديل لاحقة." : "Reopen this period for corrections? Every reopen and later edit will be logged under your name.")) void apiFetch("/api/dashboard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "reopenAccountingPeriod", idempotencyKey: crypto.randomUUID(), spaceId: activeSpace.id, periodId }) }).then(async (response) => { const result = await response.json() as Partial<DashboardData> & { error?: string }; if (!response.ok) throw new Error(result.error ?? "REOPEN_FAILED"); setData({ ...data, ...result }); flash(locale === "ar" ? "أُعيد فتح الفترة. يمكنك التعديل ثم إغلاقها مجدداً." : "Period reopened. You can edit, then close it again."); }).catch((error: unknown) => window.alert(error instanceof Error ? error.message : "REOPEN_FAILED")); }} onClosePeriod={() => { if (window.confirm(locale === "ar" ? "إغلاق الفترة؟ لن يُسمح بذلك إن بقي على الأعضاء اشتراك أو تسويات غير مسدّدة." : "Close the period? This is blocked until every member settles dues and pending shares.")) void apiFetch("/api/dashboard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "closeAccountingPeriod", idempotencyKey: crypto.randomUUID(), spaceId: activeSpace.id }) }).then(async (response) => { const result = await response.json() as Partial<DashboardData> & { error?: string }; if (!response.ok) throw new Error(dashboardError(result.error ?? "CLOSE_FAILED", locale)); setData({ ...data, ...result }); flash(locale === "ar" ? "أُغلقت الفترة المحاسبية. الجمعية مستمرة حتى نهايتها." : "Accounting period closed. The association continues."); }).catch((error: unknown) => window.alert(error instanceof Error ? error.message : dashboardError("CLOSE_FAILED", locale))); }} onSettle={(settlementId) => void settleReimbursement(settlementId)} onCompleteTurn={(turnId) => void completeCircleTurn(turnId)} onOpenMember={(memberId) => { setActiveMemberId(memberId); setModal("memberDetail"); }} onTxnChanged={(next) => { setData({ ...data, ...next }); flash(locale === "ar" ? "تم تحديث العملية" : "Transaction updated"); }} />
          )}
          {activeView === "groups" && <MembersView data={data} locale={locale} onInvite={() => setModal("invite")} onOpenPerson={(memberId) => { setActiveMemberId(memberId); setModal("memberProfile"); }} onSmartPay={(memberId) => { setActiveMemberId(memberId); setModal("smartPay"); }} />}
          {activeView === "transactions" && <TransactionsView data={data} locale={locale} onChanged={(next) => { setData({ ...data, ...next }); flash(locale === "ar" ? "تم تحديث العملية" : "Transaction updated"); }} />}
          {activeView === "reports" && <ReportsPanel data={data} locale={locale} totals={totals} />}
          {activeView === "settings" && <SettingsView locale={locale} onLogout={() => void logout()} />}
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
        <WalletModal data={data} locale={locale} defaultType={walletDefaultType} lockType={activeView === "society"} onClose={() => setModal(null)} onSaved={(next) => {
          const created = (next.spaces ?? []).find((space) => !data.spaces.some((existing) => existing.id === space.id));
          if (created) {
            const view = created.type === "society" || created.type === "group" ? "society" : (created.type as ViewId);
            setPickedSpaceId((current) => ({ ...current, [view]: created.id, society: created.id }));
            if (view !== activeView && (created.type === "society" || created.type === "group")) setActiveView("society");
          }
          setData({ ...data, ...next });
          setModal(null);
          flash(locale === "ar" ? "تم إنشاء المحفظة" : "Wallet created");
        }} />
      )}
      {modal === "invite" && <InviteModal data={data} locale={locale} preferredSpaceId={activeSpace?.id} onClose={() => setModal(null)} onDone={(message) => { setModal(null); flash(message); void load(); }} />}
      {modal === "tripExpense" && <TripExpenseModal data={data} locale={locale} preferredSpaceId={activeSpace?.id} expenseId={editingExpenseId || undefined} onClose={() => { setModal(null); setEditingExpenseId(""); }} onSaved={(next) => { setData({ ...data, ...next }); setModal(null); setEditingExpenseId(""); flash(locale === "ar" ? "تم حفظ المصروف وتحديث الحصص" : "Expense saved and shares updated"); }} />}
      {modal === "circleOrder" && <CircleOrderModal data={data} locale={locale} onClose={() => setModal(null)} onSaved={(next) => { setData({ ...data, ...next }); setModal(null); flash(locale === "ar" ? "تم اعتماد ترتيب الأدوار" : "Turn order saved"); }} />}
      {modal === "clonePeriod" && activeSpace && <ClonePeriodModal data={data} locale={locale} space={activeSpace} onClose={() => setModal(null)} onSaved={(next) => { setData({ ...data, ...next }); setModal(null); flash(locale === "ar" ? "فُتحت فترة / جمعية جديدة بنفس الشروط" : "A new period was opened with the same terms"); }} />}
      {modal === "withdrawSurplus" && <SurplusWithdrawModal data={data} locale={locale} memberId={withdrawMemberId} onClose={() => setModal(null)} onSaved={(next) => { setData({ ...data, ...next }); setModal(null); flash(locale === "ar" ? "تم صرف الفائض الشخصي" : "Personal surplus withdrawn"); }} />}
      {modal === "smartPay" && (
        <SmartAccountantModal
          members={data.members}
          spaces={data.spaces}
          plans={data.plans}
          installments={data.installments ?? []}
          locale={locale}
          preferredMemberId={activeMemberId}
          onClose={() => setModal(null)}
          onSaved={(next) => { setData({ ...data, ...next }); setModal(null); flash(locale === "ar" ? "تم توزيع السداد على الأشهر الأقدم" : "Payment applied to the oldest months"); }}
        />
      )}
      {modal === "memberDetail" && (() => {
        const member = data.members.find((item) => item.id === activeMemberId);
        const space = member ? data.spaces.find((item) => item.id === member.space_id) : undefined;
        if (!member || !space) return null;
        return (
          <MemberDetailModal
            member={member}
            space={space}
            plan={data.plans.find((plan) => plan.space_id === member.space_id)}
            installments={data.installments ?? []}
            locale={locale}
            onClose={() => setModal(null)}
            onSmartPay={() => setModal("smartPay")}
            onSendReceipt={() => { setReceiptTxnId(undefined); setModal("sendReceipt"); }}
          />
        );
      })()}
      {modal === "memberProfile" && (() => {
        const seed = data.members.find((item) => item.id === activeMemberId);
        if (!seed) return null;
        const key = personIdentityKey(seed);
        const records = data.members.filter((item) => personIdentityKey(item) === key && data.spaces.some((space) => space.id === item.space_id && space.type !== "personal"));
        return (
          <MemberPersonProfile
            records={records.length ? records : [seed]}
            spaces={data.spaces}
            plans={data.plans}
            installments={data.installments ?? []}
            locale={locale}
            onClose={() => setModal(null)}
            onSmartPay={(memberId) => { setActiveMemberId(memberId); setModal("smartPay"); }}
            onSendReceipt={(memberId) => { setActiveMemberId(memberId); setReceiptTxnId(undefined); setModal("sendReceipt"); }}
          />
        );
      })()}
      {modal === "sendReceipt" && (() => {
        const member = data.members.find((item) => item.id === activeMemberId);
        if (!member) return null;
        return (
          <ReceiptChannelModal
            member={member}
            locale={locale}
            transactionId={receiptTxnId}
            onClose={() => setModal(null)}
            onDone={(message) => { setModal(null); flash(message); }}
          />
        );
      })()}
      {toast && <div className="toast"><Check size={17} />{toast}</div>}
    </div>
  );
}

function UserMenu({ locale, name, email, onSettings, onLogout }: { locale: Locale; name: string; email: string; onSettings: () => void; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const t = copy[locale];
  return (
    <div className="user-menu" ref={root}>
      <button type="button" className="user-avatar" title={email} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
        {name.slice(0, 1)}
      </button>
      {open && (
        <div className="user-menu-panel" role="menu">
          <div className="user-menu-identity">
            <strong>{name}</strong>
            <small>{email}</small>
          </div>
          <a href="/account/security" role="menuitem" onClick={() => setOpen(false)}><ShieldCheck size={16} />{locale === "ar" ? "صفحة الحساب" : "Account page"}</a>
          <button type="button" role="menuitem" onClick={() => { setOpen(false); onSettings(); }}><Settings size={16} />{t.settings}</button>
          <button type="button" role="menuitem" className="user-menu-logout" onClick={() => { setOpen(false); onLogout(); }}><LogOut size={16} />{t.logout}</button>
        </div>
      )}
    </div>
  );
}

function Sidebar({ locale, active, open, onNavigate, onClose, onLogout }: { locale: Locale; active: ViewId; open: boolean; onNavigate: (id: ViewId) => void; onClose: () => void; onLogout: () => void }) {
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
        <button type="button" className="sidebar-setting sidebar-logout" onClick={onLogout}><LogOut size={19} /><span>{t.logout}</span></button>
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
  const tripGoal = trip ? spaceGoalMinor(trip, data) : 0;
  const goalProgress = trip && tripGoal > 0 ? Math.max(0, Math.min(100, Math.round((trip.balance_minor / tripGoal) * 100))) : 0;
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
        <StatCard icon={<CircleDollarSign />} label={t.totalBalance} value={formatMoney(totals.net + totals.reserves, "OMR", locale)} accent="navy" note={walletCount ? (locale === "ar" ? `${walletCount} محافظ` : `${walletCount} wallets`) : (locale === "ar" ? "لا محافظ بعد" : "no wallets yet")} negative={totals.net + totals.reserves < 0} />
        <StatCard icon={<HandCoins />} label={t.spendableFunds} value={formatMoney(totals.groups, "OMR", locale)} accent="green" note={locale === "ar" ? "أرصدة المجموعات" : "group balances"} negative={totals.groups < 0} />
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
                <strong className={trip.balance_minor < 0 ? "amount-negative" : ""}>{formatMoney(trip.balance_minor, trip.currency, locale)}</strong>
                <span>{t.collected} {tripGoal > 0 ? formatMoney(tripGoal, trip.currency, locale) : "—"}</span>
              </div>
              <div className="progress-track tall"><span style={{ width: `${goalProgress}%` }} /></div>
              <div className="progress-labels">
                <b>{goalProgress}%</b>
                <span>{tripGoal > 0 && trip.balance_minor > 0 ? (locale === "ar" ? "التقدم من الرصيد الفعلي" : "Progress from actual balance") : (locale === "ar" ? "أضف مساهمات لبدء التقدم" : "Add contributions to start progress")}</span>
              </div>
              <div className="money-separation">
                <div><i className="dot common" /><span>{t.commonFund}</span><strong className={trip.balance_minor < 0 ? "amount-negative" : ""}>{formatMoney(trip.balance_minor, trip.currency, locale)}</strong></div>
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
            {data.spaces.map((space) => <WalletCard key={space.id} space={space} data={data} locale={locale} onOpen={() => onView(space.type === "group" || space.type === "society" || /جمعي|circle|association/i.test(`${space.name_ar} ${space.name_en}`) ? "society" : space.type as ViewId)} />)}
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

function StatCard({ icon, label, value, trend, note, accent, positive = false, negative = false }: { icon: ReactNode; label: string; value: string; trend?: string; note: string; accent: string; positive?: boolean; negative?: boolean }) {
  return <article className="stat-card"><div className={`stat-icon ${accent}`}>{icon}</div><div className="stat-copy"><span>{label}</span><strong className={negative ? "amount-negative" : ""}>{value}</strong><small className={positive ? "positive" : ""}>{trend && <b>{trend}</b>} {note}</small></div></article>;
}

function WalletCard({ space, data, locale, onOpen }: { space: Space; data: DashboardData; locale: Locale; onOpen: () => void }) {
  const Icon = typeIcons[space.type] ?? WalletCards;
  const goal = spaceGoalMinor(space, data);
  const progress = goal ? Math.max(0, Math.min(100, Math.round((space.balance_minor / goal) * 100))) : 0;
  return <button className={`wallet-card accent-${space.accent}`} onClick={onOpen}>
    <div className="wallet-card-top"><span className="wallet-icon"><Icon size={19} /></span><ArrowUpRight size={17} /></div>
    <span className="wallet-type">{typeLabels[locale][space.type as keyof typeof typeLabels.ar] ?? space.type}</span>
    <h3>{nameOf(space, locale)}</h3><strong className={space.balance_minor < 0 ? "amount-negative" : ""}>{formatMoney(space.balance_minor, space.currency, locale)}</strong>
    {goal > 0 && <><div className="progress-track"><span style={{ width: `${progress}%` }} /></div><small>{progress}% {locale === "ar" ? "من الهدف" : "of goal"}</small></>}
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
  const locked = isPeriodLocked((data.periods ?? []).filter((period) => period.space_id === transaction.space_id), transaction.occurred_at);
  return <div className="transaction-row">
    <div className={`transaction-icon ${transaction.kind}`}><Icon size={17} /></div>
    <div className="transaction-main">
      <strong>{transactionName(transaction, locale)}</strong>
      <span>{space ? nameOf(space, locale) : "—"}{member ? ` · ${member.display_name}` : ""} · {new Intl.DateTimeFormat(locale === "ar" ? "ar-OM" : "en-GB", { day: "numeric", month: "short" }).format(new Date(transaction.occurred_at))}{locked ? (locale === "ar" ? " · الفترة مغلقة" : " · period closed") : ""}</span>
    </div>
    <strong className={positive ? "amount-positive" : "amount-negative"}>{positive ? "+" : "−"}{formatMoney(transaction.amount_minor, space?.currency ?? "OMR", locale)}</strong>
    <div className="transaction-actions">
      <button type="button" title={locale === "ar" ? "إيصال" : "Receipt"} onClick={() => openTransactionReceipt(transaction, data, locale)}><Printer size={15} /></button>
      <button type="button" title="WhatsApp" onClick={() => shareTransactionWhatsApp(transaction, data, locale)}><MessageCircle size={15} /></button>
      {onEdit && !locked && <button type="button" title={locale === "ar" ? "تعديل" : "Edit"} onClick={() => onEdit(transaction)}><Pencil size={15} /></button>}
      {onVoid && !locked && <button type="button" className="danger" title={locale === "ar" ? "حذف" : "Delete"} onClick={() => onVoid(transaction)}><Trash2 size={15} /></button>}
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

function SpaceDetail({ space, data, locale, onAdd, onInvite, onTripExpense, onEditExpense, onCircleOrder, onClonePeriod, onClosePeriod, onReopenPeriod, onSettle, onCompleteTurn, onTxnChanged, onOpenMember }: { space: Space; data: DashboardData; locale: Locale; onAdd: () => void; onInvite: () => void; onTripExpense: () => void; onEditExpense: (expenseId: string) => void; onCircleOrder: () => void; onClonePeriod: () => void; onClosePeriod: () => void; onReopenPeriod: (periodId: string) => void; onSettle: (settlementId: string) => void; onCompleteTurn: (turnId: string) => void; onTxnChanged: (next: Partial<DashboardData>) => void; onOpenMember: (memberId: string) => void }) {
  const t = copy[locale];
  const members = data.members.filter((member) => member.space_id === space.id);
  const transactions = data.transactions.filter((transaction) => transaction.space_id === space.id);
  const reserves = members.reduce((sum, member) => sum + member.extra_minor, 0);
  const goal = spaceGoalMinor(space, data);
  const progress = goal ? Math.max(0, Math.min(100, Math.round((space.balance_minor / goal) * 100))) : 0;
  const nextCircleTurn = data.circleTurns.find((turn) => turn.space_id === space.id && turn.status === "scheduled");
  return <div className="dashboard-stack">
    <section className={`space-hero accent-${space.accent}`}><div><span>{typeLabels[locale][space.type as keyof typeof typeLabels.ar]}</span><h2>{nameOf(space, locale)}</h2><p>{space.type === "personal" ? (locale === "ar" ? "دخل، مصروف، ميزانيات وأهداف في مكان واحد" : "Income, spending, budgets and goals in one place") : (locale === "ar" ? "حسابات واضحة ومفصولة لكل فرد" : "Clear, separated balances for every member")}</p></div><div className="space-hero-balance"><span>{locale === "ar" ? "الرصيد المتاح" : "Available balance"}</span><strong className={space.balance_minor < 0 ? "amount-negative" : ""}>{formatMoney(space.balance_minor, space.currency, locale)}</strong><button onClick={onAdd}><Plus size={16} />{t.add}</button>{["trip", "society", "group"].includes(space.type) && <button onClick={onInvite}><UserPlus size={16} />{t.invite}</button>}</div></section>
    <section className="stat-grid compact">
      <StatCard icon={<WalletCards />} label={locale === "ar" ? "الرصيد المتاح" : "Available"} value={formatMoney(space.balance_minor, space.currency, locale)} accent="navy" note={locale === "ar" ? "محدّث الآن" : "updated now"} negative={space.balance_minor < 0} />
      <StatCard icon={<Target />} label={t.goal} value={goal ? formatMoney(goal, space.currency, locale) : "—"} accent="green" note={`${progress}%`} />
      <StatCard icon={<ShieldCheck />} label={t.personalReserves} value={formatMoney(reserves, space.currency, locale)} accent="amber" note={t.protected} />
      <StatCard icon={<ReceiptText />} label={t.transactions} value={String(transactions.length)} accent="rose" note={locale === "ar" ? "عملية مسجلة" : "recorded entries"} />
    </section>
    {goal > 0 && <article className="panel goal-wide"><div className="panel-heading"><div><span className="section-kicker"><Target size={15} />{locale === "ar" ? "تقدم الهدف" : "Goal progress"}</span><h2>{nameOf(space, locale)}</h2></div><strong>{progress}%</strong></div><div className="progress-track tall"><span style={{ width: `${progress}%` }} /></div><div className="goal-wide-values"><span className={space.balance_minor < 0 ? "amount-negative" : ""}>{formatMoney(space.balance_minor, space.currency, locale)}</span><span>{formatMoney(goal, space.currency, locale)}</span></div></article>}
    {members.length > 0 && <MembersTable members={members} locale={locale} currency={space.currency} data={data} spaceId={space.id} onOpenMember={onOpenMember} />}
    {["household", "trip", "society", "group"].includes(space.type) && <article className="panel workflow-panel"><div className="panel-heading"><div><span className="section-kicker"><Plane size={15} />{locale === "ar" ? "المصروفات والتسويات" : "Expenses & settlements"}</span><h2>{locale === "ar" ? "من أي حساب دُفع؟ وما له / عليه" : "Paid-from account and balances"}</h2></div><div className="section-title-actions"><button type="button" className="secondary-button" onClick={() => { if (window.confirm(locale === "ar" ? "إعادة تقسيم كل المصروفات بالتساوي على الأعضاء الحاليين بمن فيهم الجدد؟" : "Re-split every expense equally across current members, including new ones?")) void apiFetch("/api/dashboard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "resplitTripExpenses", idempotencyKey: crypto.randomUUID(), spaceId: space.id }) }).then(async (response) => { const result = await response.json() as Partial<DashboardData> & { error?: string }; if (!response.ok) throw new Error(result.error ?? "RESPLIT_FAILED"); onTxnChanged(result); }).catch((error: unknown) => window.alert(error instanceof Error ? error.message : "RESPLIT_FAILED")); }}><Users size={15} />{locale === "ar" ? "تقسيم الكل بالتساوي" : "Split all equally"}</button><button className="primary-button" onClick={onTripExpense}><Plus size={15} />{locale === "ar" ? "مصروف جماعي" : "Group expense"}</button></div></div><div className="transaction-list">{data.tripExpenses.filter((expense) => expense.space_id === space.id).map((expense) => <div className="trip-expense-row" key={expense.id}><div className="transaction-row"><div className="transaction-icon reimbursement"><HandCoins size={17} /></div><div className="transaction-main"><strong>{expense.description}</strong><span>{locale === "ar" ? (expense.paid_from === "common_fund" ? "دُفع من صندوق الجمعية" : `دفع بواسطة ${expense.paid_by_name}`) : (expense.paid_from === "common_fund" ? "Paid from association fund" : `Paid by ${expense.paid_by_name}`)}</span></div><strong className="amount-negative">{formatMoney(expense.amount_minor, space.currency, locale)}</strong><div className="transaction-actions"><button type="button" title={locale === "ar" ? "تعديل المصروف" : "Edit expense"} aria-label={locale === "ar" ? "تعديل المصروف" : "Edit expense"} onClick={() => onEditExpense(expense.id)}><Pencil size={15} /></button><button type="button" title={locale === "ar" ? "تقسيم بالتساوي على كل الأعضاء" : "Split equally among all members"} aria-label={locale === "ar" ? "تقسيم بالتساوي" : "Split equally"} onClick={() => { if (window.confirm(locale === "ar" ? "تقسيم هذا المصروف بالتساوي على الأعضاء الحاليين بمن فيهم الجدد؟" : "Split this expense equally among current members, including new ones?")) void apiFetch("/api/dashboard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "resplitTripExpenses", idempotencyKey: crypto.randomUUID(), spaceId: space.id, expenseId: expense.id }) }).then(async (response) => { const result = await response.json() as Partial<DashboardData> & { error?: string }; if (!response.ok) throw new Error(result.error ?? "RESPLIT_FAILED"); onTxnChanged(result); }).catch((error: unknown) => window.alert(error instanceof Error ? error.message : "RESPLIT_FAILED")); }}><Users size={15} /></button><button type="button" className="danger" title={locale === "ar" ? "حذف المصروف" : "Delete expense"} aria-label={locale === "ar" ? "حذف المصروف" : "Delete expense"} onClick={() => { if (window.confirm(locale === "ar" ? "حذف هذا المصروف والتسويات المرتبطة به؟" : "Delete this group expense and its settlements?")) void apiFetch("/api/dashboard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "voidTripExpense", idempotencyKey: crypto.randomUUID(), expenseId: expense.id }) }).then(async (response) => { const result = await response.json() as Partial<DashboardData> & { error?: string }; if (!response.ok) throw new Error(result.error ?? "VOID_FAILED"); onTxnChanged(result); }).catch((error: unknown) => window.alert(error instanceof Error ? error.message : "VOID_FAILED")); }}><Trash2 size={15} /></button></div></div><div className="split-chips">{data.expenseSplits.filter((split) => split.expense_id === expense.id).map((split) => <span key={split.id} className={expense.paid_from !== "common_fund" && split.member_id === expense.paid_by_member_id ? "payer-share" : ""}>{split.display_name}: {formatMoney(split.share_minor, space.currency, locale)}{expense.paid_from !== "common_fund" && split.member_id === expense.paid_by_member_id ? (locale === "ar" ? " · حصته" : " · share") : ""}</span>)}</div><p className="expense-split-note">{(() => { const splits = data.expenseSplits.filter((split) => split.expense_id === expense.id); const payerShare = splits.find((split) => split.member_id === expense.paid_by_member_id)?.share_minor ?? 0; const owedToPayer = Math.max(0, expense.amount_minor - payerShare); if (expense.paid_from === "common_fund") return locale === "ar" ? `المبلغ خُصم من صندوق الجمعية. إن صار الرصيد سالباً يُقسَّم العجز مباشرة على الأعضاء المساهمين ويظهر في عمود «عليه».` : `This amount came from the association fund. If the balance goes negative, the deficit is split among contributing members and shown under Owes.`; return locale === "ar" ? `${expense.paid_by_name} دفع ${formatMoney(expense.amount_minor, space.currency, locale)} بالكامل. حصة كل عضو ظاهرة أعلاه. عمود «له» لـ ${expense.paid_by_name} = ما دفعه عن الآخرين (${formatMoney(owedToPayer, space.currency, locale)}) وليس حصته.` : `${expense.paid_by_name} paid ${formatMoney(expense.amount_minor, space.currency, locale)} in full. Each member’s share is shown above. The payer’s credit is what others still owe (${formatMoney(owedToPayer, space.currency, locale)}), not a double share.`; })()}</p></div>)}{!data.tripExpenses.some((expense) => expense.space_id === space.id) && <Empty locale={locale} />}</div>{data.settlements.filter((settlement) => settlement.space_id === space.id && settlement.status === "pending").map((settlement) => {
      const fromFund = String(settlement.from_member_id).startsWith("space:");
      const toFund = String(settlement.to_member_id).startsWith("space:");
      const label = toFund
        ? (locale === "ar" ? `على ${settlement.from_member_name ?? "العضو"} دفع إلى صندوق الجمعية` : `${settlement.from_member_name ?? "Member"} owes the association fund`)
        : fromFund
        ? (locale === "ar" ? `على الصندوق رد مبلغ إلى ${settlement.to_member_name ?? "العضو"}` : `The fund owes ${settlement.to_member_name ?? "the member"}`)
        : (locale === "ar"
          ? `على ${settlement.from_member_name ?? "العضو"} دفع إلى ${settlement.to_member_name ?? "العضو"}`
          : `${settlement.from_member_name ?? "Member"} owes ${settlement.to_member_name ?? "member"}`);
      return <div className="settlement-alert" key={settlement.id}><ShieldCheck size={17} /><span>{label}</span><b>{formatMoney(settlement.amount_minor, space.currency, locale)}</b><button onClick={() => onSettle(settlement.id)}>{locale === "ar" ? "تم التسوية" : "Mark settled"}</button><button type="button" className="secondary-button compact" onClick={() => { if (window.confirm(locale === "ar" ? "إلغاء هذه التسوية؟" : "Cancel this settlement?")) void apiFetch("/api/dashboard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "voidSettlement", idempotencyKey: crypto.randomUUID(), settlementId: settlement.id }) }).then(async (response) => { const result = await response.json() as Partial<DashboardData> & { error?: string }; if (!response.ok) throw new Error(result.error ?? "VOID_FAILED"); onTxnChanged(result); }).catch((error: unknown) => window.alert(error instanceof Error ? error.message : "VOID_FAILED")); }}>{locale === "ar" ? "حذف" : "Delete"}</button></div>;
    })}</article>}
    <SpaceTransactionsPanel space={space} data={data} locale={locale} onAdd={onAdd} onTxnChanged={onTxnChanged} />
    {(["society", "group"].includes(space.type) || /جمعي|circle|association/i.test(`${space.name_ar} ${space.name_en}`)) && <article className="panel workflow-panel"><div className="panel-heading"><div><span className="section-kicker"><Repeat2 size={15} />{locale === "ar" ? "الفترة المحاسبية والأدوار" : "Accounting period & turns"}</span><h2>{locale === "ar" ? "إغلاق الفترة أو فتح سنة جديدة" : "Close the period or open a new year"}</h2></div><div className="section-title-actions"><button type="button" className="secondary-button" onClick={onClosePeriod}>{locale === "ar" ? "إغلاق الفترة" : "Close period"}</button><button type="button" className="primary-button" onClick={onClonePeriod}>{locale === "ar" ? "فتح فترة جديدة / استنساخ" : "New period / clone"}</button><button className="primary-button" onClick={onCircleOrder}><Repeat2 size={15} />{locale === "ar" ? "إعداد الأدوار" : "Configure turns"}</button></div></div><p className="modal-note">{locale === "ar" ? "لا تُغلق الفترة حتى يسدّد كل الأعضاء ما عليهم من اشتراك وتسويات. بعد الإغلاق يمكن إعادة الفتح للتعديل مع تسجيل من فتح وما عُدّل." : "Do not close the period until every member has settled dues and pending shares. After closing you can reopen for corrections; who reopened and what changed are logged."}</p><div className="circle-order-list">{(data.periods ?? []).filter((period) => period.space_id === space.id).map((period) => {
      const statusLabel = period.status === "open" ? (locale === "ar" ? "مفتوحة" : "Open") : period.status === "reopened" ? (locale === "ar" ? "مفتوحة للتعديل" : "Reopened") : (locale === "ar" ? "مغلقة" : "Closed");
      const actor = period.status === "closed"
        ? (period.closed_by_name ? (locale === "ar" ? `أغلقها ${period.closed_by_name}` : `Closed by ${period.closed_by_name}`) : "")
        : period.status === "reopened" && period.reopened_by_name
          ? (locale === "ar" ? `فتحها ${period.reopened_by_name}` : `Reopened by ${period.reopened_by_name}`)
          : "";
      return <div key={period.id} className="period-row"><b>{statusLabel}</b><span>{period.label}{actor ? ` · ${actor}` : ""}</span><strong>{new Date(period.starts_at).toLocaleDateString(locale === "ar" ? "ar-OM" : "en-GB")}</strong>{period.status !== "open" && <button type="button" className="period-print" onClick={() => printAccountingPeriod(space, period, data, locale)}><Printer size={14} />{locale === "ar" ? "طباعة" : "Print"}</button>}{period.status === "closed" && <button type="button" className="period-reopen" onClick={() => onReopenPeriod(period.id)}><Unlock size={14} />{locale === "ar" ? "إعادة فتح" : "Reopen"}</button>}</div>;
    })}{data.circleTurns.filter((turn) => turn.space_id === space.id).map((turn) => <div key={turn.id}><b>{turn.turn_number}</b><span>{turn.display_name}</span><strong>{formatMoney(turn.amount_minor, space.currency, locale)}</strong><em>{turn.status}</em>{turn.status === "scheduled" && <button disabled={turn.id !== nextCircleTurn?.id} onClick={() => onCompleteTurn(turn.id)}>{locale === "ar" ? "صرف الدور" : "Pay turn"}</button>}</div>)}{!data.circleTurns.some((turn) => turn.space_id === space.id) && !(data.periods ?? []).some((period) => period.space_id === space.id) && <Empty locale={locale} />}</div>
      {(data.periodEvents ?? []).filter((event) => event.space_id === space.id).length > 0 && <div className="period-event-list"><h3>{locale === "ar" ? "سجل الفتح والتعديلات" : "Reopen and correction log"}</h3>{(data.periodEvents ?? []).filter((event) => event.space_id === space.id).slice(0, 40).map((event) => <p key={event.id}><strong>{event.actor_name || "—"}</strong><span>{new Date(event.created_at).toLocaleString(locale === "ar" ? "ar-OM" : "en-GB")}</span><em>{locale === "ar" ? (event.summary_ar || event.action) : (event.summary_en || event.action)}</em></p>)}</div>}
    </article>}
  </div>;
}

function MembersView({ data, locale, onInvite, onOpenPerson, onSmartPay }: { data: DashboardData; locale: Locale; onInvite: () => void; onOpenPerson: (memberId: string) => void; onSmartPay: (memberId: string) => void }) {
  const societies = data.spaces.filter((space) => space.type !== "personal");
  const groupMembers = data.members.filter((member) => societies.some((space) => space.id === member.space_id));
  const people = Array.from(new Map(groupMembers.map((member) => {
    const key = personIdentityKey(member);
    return [key, groupMembers.filter((row) => personIdentityKey(row) === key)];
  })).values());
  const t = copy[locale];
  const [query, setQuery] = useState("");
  const visible = people.filter((records) => `${records[0].display_name} ${records[0].email ?? ""} ${records[0].phone ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="dashboard-stack"><div className="section-title"><div><h2>{t.memberProgress}</h2><p>{locale === "ar" ? "اضغط اسم العضو لفتح ملفه: حالته، الجمعيات المرتبطة، تقييم الانضباط، وما عليه وما استلمه." : "Open a member file: status, linked associations, discipline rating, amounts owed and received."}</p></div><div className="section-title-actions"><button className="secondary-button" onClick={() => onSmartPay(groupMembers[0]?.id ?? "")}><Sparkles size={16} />{locale === "ar" ? "المحاسب الذكي" : "Smart accountant"}</button><button className="primary-button" onClick={onInvite}><UserPlus size={17} />{t.invite}</button></div></div>
    <article className="panel members-panel person-table"><div className="panel-heading"><h2>{t.members} <span className="count-badge">{people.length}</span></h2><label className="search-field member-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={locale === "ar" ? "ابحث باسم العضو" : "Search member name"} /></label></div><div className="members-table"><div className="table-head person-head"><span>{locale === "ar" ? "العضو" : "Member"}</span><span>{locale === "ar" ? "الحالة" : "Status"}</span><span>{locale === "ar" ? "الجمعيات" : "Associations"}</span><span>{locale === "ar" ? "الانضباط" : "Discipline"}</span><span>{locale === "ar" ? "عليه" : "Owes"}</span><span>{locale === "ar" ? "المستلم" : "Received"}</span></div>{visible.map((records) => {
    const person = records[0];
    const active = records.some((row) => (row.status ?? "active") === "active");
    const due = records.reduce((sum, row) => sum + row.due_minor, 0);
    const paid = records.reduce((sum, row) => sum + row.paid_minor, 0);
    const extra = records.reduce((sum, row) => sum + row.extra_minor + Number(row.addon_minor ?? 0), 0);
    const rate = Math.round((Math.min(paid, Math.max(due, 1)) / Math.max(due, 1)) * 100);
    const remaining = records.reduce((sum, row) => {
      const plan = data.plans.find((item) => String(item.space_id) === row.space_id);
      return sum + Math.max(0, memberAccruedDueMinor(row, data.installments ?? [], plan) - row.paid_minor);
    }, 0);
    let grade = "D";
    if (rate >= 95 && remaining === 0) grade = "A";
    else if (rate >= 75) grade = "B";
    else if (rate >= 50) grade = "C";
    const currency = societies.find((space) => space.id === person.space_id)?.currency ?? "OMR";
    return <button type="button" className="member-row member-row-button person-row" key={personIdentityKey(person)} onClick={() => onOpenPerson(person.id)}><div className="member-name"><i style={{ background: person.avatar }}>{person.display_name.slice(0, 1)}</i><div><strong>{person.display_name}</strong><span>{person.phone || person.email || (person.role === "owner" ? t.roleOwner : t.roleMember)}</span></div></div><span className={`status-pill ${active ? "complete" : "pending"}`}>{active ? <CheckCircle2 size={13} /> : <Clock3 size={13} />}{active ? (locale === "ar" ? "نشط" : "Active") : (locale === "ar" ? "غير نشط" : "Inactive")}</span><strong>{records.length}</strong><strong>{grade} · {rate}%</strong><strong className={remaining ? "amount-negative" : "muted-amount"}>{formatMoney(remaining, currency, locale)}</strong><strong className="reserve-amount">{formatMoney(paid + extra, currency, locale)}</strong></button>;
  })}</div></article>
    <section className="settings-grid"><InfoPanel icon={<ShieldCheck />} title={t.privacy} text={t.privacyText} /><InfoPanel icon={<Users />} title={t.access} text={t.accessText} /></section></div>;
}

function MembersTable({ members, locale, currency, data, spaceId, onWithdraw, onOpenMember }: { members: Member[]; locale: Locale; currency: string; data?: DashboardData; spaceId?: string; onWithdraw?: (memberId: string) => void; onOpenMember?: (memberId: string) => void }) {
  const t = copy[locale];
  const [query, setQuery] = useState(""); const visible = members.filter((member) => `${member.display_name} ${member.email ?? ""} ${member.phone ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  return <article className="panel members-panel"><div className="panel-heading"><h2>{t.members} <span className="count-badge">{members.length}</span></h2><label className="search-field member-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={locale === "ar" ? "ابحث باسم المساهم" : "Search member name"} /></label></div><div className="members-table"><div className="table-head"><span>{locale === "ar" ? "العضو" : "Member"}</span><span>{t.goal}</span><span>{t.paid}</span><span>{locale === "ar" ? "إضافي" : "Extra"}</span><span>{locale === "ar" ? "عليه" : "Owes"}</span><span>{locale === "ar" ? "له" : "Owed"}</span><span>{t.status}</span><span>{locale === "ar" ? "إجراء" : "Action"}</span></div>{visible.map((member) => {
    const pos = memberPosition(member, data);
    const expenseNet = data && spaceId ? memberExpenseNet(member.id, data, spaceId) : 0;
    const debit = pos.debit + Math.max(0, -expenseNet);
    const credit = pos.credit + Math.max(0, expenseNet);
    return <button type="button" className="member-row member-row-button" key={member.id} onClick={() => onOpenMember?.(member.id)}><div className="member-name"><i style={{ background: member.avatar }}>{member.display_name.slice(0, 1)}</i><div><strong>{member.display_name}</strong><span>{member.phone || member.email || (member.role === "owner" ? t.roleOwner : member.role === "treasurer" ? t.roleTreasurer : t.roleMember)}</span></div></div><strong>{formatMoney(personGoalMinor(member), currency, locale)}</strong><strong>{formatMoney(member.paid_minor, currency, locale)}</strong><strong>{formatMoney(Number(member.addon_minor ?? 0), currency, locale)}</strong><strong className={debit ? "amount-negative" : "muted-amount"}>{formatMoney(debit, currency, locale)}</strong><strong className={credit ? "reserve-amount" : "muted-amount"}>{formatMoney(credit, currency, locale)}</strong><span className={`status-pill ${debit ? "pending" : "complete"}`}>{debit ? <Clock3 size={13} /> : <CheckCircle2 size={13} />}{debit ? (locale === "ar" ? "عليه مطالبات" : "Owes") : (credit ? (locale === "ar" ? "له رصيد" : "Credit") : t.paid)}</span><span onClick={(event) => event.stopPropagation()}>{member.extra_minor > 0 && onWithdraw ? <button type="button" className="secondary-button compact" onClick={() => onWithdraw(member.id)}>{locale === "ar" ? "صرف فائض" : "Withdraw"}</button> : "—"}</span></button>;
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

function SettingsView({ locale, onLogout }: { locale: Locale; onLogout: () => void }) {
  const router = useRouter();
  const t = copy[locale];
  const exportData = async () => { const response = await fetch("/api/platform?view=export", { cache: "no-store" }); if (!response.ok) return; const blob = await response.blob(); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "wazen-data.json"; link.click(); URL.revokeObjectURL(url); };
  return <div className="dashboard-stack"><div className="section-title"><div><h2>{t.settings}</h2><p>{locale === "ar" ? "تحكم في الخصوصية واللغة والصلاحيات" : "Control privacy, language and permissions"}</p></div><button className="secondary-button" onClick={onLogout}><LogOut size={16} />{t.logout}</button></div><section className="settings-grid"><InfoPanel icon={<Download />} title={locale === "ar" ? "تنزيل بياناتي" : "Export my data"} text={locale === "ar" ? "نسخة JSON كاملة من محافظك وحركاتك ومستنداتك." : "A complete JSON copy of your wallets, entries and documents."} onClick={() => void exportData()} /><InfoPanel icon={<ShieldCheck />} title={locale === "ar" ? "أمان الحساب" : "Account security"} text={locale === "ar" ? "كلمة المرور والمصادقة الثنائية ومفاتيح API." : "Password, two-factor authentication and API keys."} onClick={() => router.push("/account/security")} /><InfoPanel icon={<ShieldCheck />} title={t.privacy} text={t.privacyText} onClick={() => router.push("/privacy")} /><InfoPanel icon={<Users />} title={t.access} text={t.accessText} /><InfoPanel icon={<Globe2 />} title={locale === "ar" ? "اللغة والمنطقة" : "Language & region"} text={locale === "ar" ? "العربية، الريال العماني، والمنطقة الزمنية لمسقط." : "English, Omani rial and Muscat time zone."} /><InfoPanel icon={<Bell />} title={locale === "ar" ? "التنبيهات" : "Notifications"} text={locale === "ar" ? "تذكير قبل الاستحقاق، إشعارات الدفع وطلبات الاسترداد." : "Due reminders, payment updates and withdrawal requests."} /></section></div>;
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
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<string[]>([]);
  const members = data.members.filter((member) => member.space_id === spaceId);
  const space = data.spaces.find((item) => item.id === spaceId);
  const plan = data.plans.find((item) => String(item.space_id) === spaceId);
  const monthlyPlan = Number(plan?.amount_minor ?? 0);
  const selectedMember = members.find((member) => member.id === memberId);
  const invoiceMonths: Array<{ id: string; period_index: number; period_key: string; amount_minor: number; paid_minor: number; status: string; due_at?: string }> = selectedMember
    ? memberInstallments(selectedMember, data.installments ?? [], plan as { space_id?: string; amount_minor?: number; duration_months?: number; starts_at?: string } | undefined)
    : [];
  const amountNumber = Number(amount || 0);
  const remainingDue = selectedMember ? Math.max(0, selectedMember.due_minor - selectedMember.paid_minor) : 0;
  const remainingMajor = currencyMajor(remainingDue, space?.currency ?? "OMR");
  const isGroupMemberPayment = Boolean(memberId) && space && space.type !== "personal" && (kind === "contribution" || kind === "income");
  const allocationPreview = useMemo(() => {
    const minor = Math.round(amountNumber * 1000);
    if (!isGroupMemberPayment || minor <= 0 || !invoiceMonths.length) return null;
    try { return allocateOldestFirst(invoiceMonths, minor, selectedInvoiceIds.length ? selectedInvoiceIds : undefined); }
    catch { return null; }
  }, [amountNumber, invoiceMonths, isGroupMemberPayment, selectedInvoiceIds]);
  const previewMandatory = isGroupMemberPayment && amountNumber > 0
    ? Math.min(amountNumber, remainingMajor)
    : 0;
  const previewSurplus = isGroupMemberPayment && amountNumber > previewMandatory
    ? amountNumber - previewMandatory
    : 0;

  useEffect(() => {
    const unpaid = invoiceMonths.filter((row: { amount_minor: number; paid_minor: number; id: string }) => remainingInstallmentMinor(row) > 0);
    setSelectedInvoiceIds(unpaid.slice(0, 1).map((row: { id: string }) => row.id));
  }, [memberId]);

  const onAmountChange = (value: string) => {
    setAmount(value);
    const minor = Math.round(Number(value || 0) * 1000);
    if (minor > 0 && invoiceMonths.length) {
      try { setSelectedInvoiceIds(selectByAmount(invoiceMonths, minor)); } catch { /* ignore */ }
    }
  };
  const onSelectInvoice = (periodIndex: number) => {
    const ids = selectThroughOldest(invoiceMonths, periodIndex);
    setSelectedInvoiceIds(ids);
    setAmount((totalRemainingMinor(invoiceMonths, ids) / 1000).toFixed(3));
  };

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
              selectedIds: selectedInvoiceIds,
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
              selectedIds: selectedInvoiceIds,
            }),
      });
      const result = await response.json() as Partial<DashboardData> & { error?: string };
      if (!response.ok) throw new Error(dashboardError(result.error ?? "save failed", locale));
      onSaved(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "SAVE_FAILED");
    } finally { setSaving(false); }
  };
  return <Modal title={t.add} wide={Boolean(isGroupMemberPayment)} onClose={onClose}><form className="modal-form" onSubmit={submit}><div className="segmented-control">{["expense", "income", "contribution", "reimbursement"].map((item) => <button type="button" key={item} className={kind === item ? "active" : ""} onClick={() => setKind(item)}>{t[item as keyof typeof t] as string}</button>)}</div><label><span>{t.wallet}</span><select value={spaceId} onChange={(event) => { const next = event.target.value; setSpaceId(next); setMemberId(""); const meta = data.spaces.find((item) => item.id === next); if (meta && meta.type !== "personal") setKind("contribution"); }}>{data.spaces.map((item) => <option key={item.id} value={item.id}>{nameOf(item, locale)}</option>)}</select></label><div className="form-row"><label><span>{t.amount}</span><div className="money-input"><input required min="0.01" step="0.001" type="number" value={amount} onChange={(event) => onAmountChange(event.target.value)} placeholder="0.000" /><b className="money-currency"><OmrSymbol size={14} /></b></div></label>{kind !== "contribution" && kind !== "expense" && <label><span>{t.allocation}</span><select value={allocation} onChange={(event) => setAllocation(event.target.value)}><option value="general">{t.general}</option><option value="mandatory">{t.mandatory}</option><option value="personal_reserve">{t.personalReserve}</option></select></label>}{kind === "contribution" && <label><span>{locale === "ar" ? "سياسة الزيادة" : "Surplus policy"}</span><select value={extraPolicy} onChange={(event) => setExtraPolicy(event.target.value)}><option value="advance_credit">{locale === "ar" ? "مقدّم (افتراضي)" : "Advance (default)"}</option><option value="personal_reserve">{locale === "ar" ? "فائض شخصي محمي" : "Protected personal reserve"}</option><option value="voluntary_to_fund">{locale === "ar" ? "تطوع للصندوق" : "Voluntary to common fund"}</option></select></label>}{kind === "expense" && space && space.type !== "personal" && <label><span>{locale === "ar" ? "دُفع من" : "Paid from"}</span><select value={paidFrom} onChange={(event) => { setPaidFrom(event.target.value as "common_fund" | "member"); if (event.target.value === "common_fund") setMemberId(""); }}><option value="common_fund">{locale === "ar" ? "صندوق الجمعية" : "Association fund"}</option><option value="member">{locale === "ar" ? "حساب عضو" : "Member account"}</option></select></label>}</div>{members.length > 0 && !(kind === "expense" && paidFrom === "common_fund") && <label><span>{kind === "contribution" || (kind === "expense" && paidFrom === "member") ? (locale === "ar" ? "العضو (مطلوب)" : "Member (required)") : (locale === "ar" ? "العضو (اختياري — للدخل يخصم من المستحق)" : "Member (optional — income applies to dues)")}</span><select required={kind === "contribution" || (kind === "expense" && paidFrom === "member")} value={memberId} onChange={(event) => setMemberId(event.target.value)}><option value="">—</option>{members.map((member) => <option key={member.id} value={member.id}>{member.display_name}{member.due_minor > member.paid_minor ? (locale === "ar" ? ` · عليه ${currencyMajor(member.due_minor - member.paid_minor, space?.currency ?? "OMR").toFixed(3)}` : ` · owes ${currencyMajor(member.due_minor - member.paid_minor, space?.currency ?? "OMR").toFixed(3)}`) : (member.paid_minor > member.due_minor ? (locale === "ar" ? ` · له مقدّم` : ` · advance`) : "")}</option>)}</select></label>}{isGroupMemberPayment && selectedMember && <RemainingInvoiceGrid months={invoiceMonths} selected={selectedInvoiceIds} locale={locale} currency={space?.currency ?? "OMR"} onSelectPeriod={onSelectInvoice} />}{isGroupMemberPayment && amountNumber > 0 && <div className="modal-note split-preview"><span>{locale === "ar" ? "القاعدة: خصم الفواتير الأقدم أولاً ثم أي زيادة كمقدّم" : "Rule: clear oldest invoices first; surplus becomes advance"}</span>{allocationPreview?.allocations.map((item) => <strong key={item.installmentId}>{item.periodKey}: {(item.amountMinor / 1000).toFixed(3)}</strong>)}<strong>{locale === "ar" ? `سداد مطالبة: ${previewMandatory.toFixed(3)}` : `Toward dues: ${previewMandatory.toFixed(3)}`}</strong><strong>{locale === "ar" ? `مقدّم: ${previewSurplus.toFixed(3)}` : `Advance: ${previewSurplus.toFixed(3)}`}</strong>{remainingMajor > 0 && <span>{locale === "ar" ? `المتبقي عليه قبل العملية: ${remainingMajor.toFixed(3)}` : `Outstanding before: ${remainingMajor.toFixed(3)}`}</span>}</div>}<label><span>{t.description}</span><input required={kind !== "contribution"} value={description} onChange={(event) => setDescription(event.target.value)} placeholder={locale === "ar" ? "مثال: مساهمة أغسطس" : "e.g. August contribution"} /></label>{error && <p className="modal-error">{error}</p>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>{t.cancel}</button><button className="primary-button" disabled={saving}>{saving ? t.saving : t.save}</button></div></form></Modal>;
}

function WalletModal({ locale, defaultType = "trip", lockType = false, onClose, onSaved }: { data: DashboardData; locale: Locale; defaultType?: string; lockType?: boolean; onClose: () => void; onSaved: (next: Partial<DashboardData>) => void }) {
  const t = copy[locale];
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState(lockType ? defaultType : defaultType);
  const [monthlyContribution, setMonthlyContribution] = useState("20");
  const [durationMonths, setDurationMonths] = useState("12");
  const [startsAt, setStartsAt] = useState(new Date().toISOString().slice(0, 10));
  const isGroup = ["household", "trip", "society", "group"].includes(type);
  const liveGoalMinor = Math.round(Number(monthlyContribution || 0) * 1000) * Math.max(1, Number(durationMonths) || 1);
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
          type: lockType ? defaultType : type,
          goal: isGroup ? String((liveGoalMinor / 1000).toFixed(3)) : "0",
          ...(isGroup && monthlyContribution
            ? { monthlyContribution, durationMonths: Number(durationMonths) || 12, dueDay: 1, startsAt }
            : { startsAt }),
        }),
      });
      const result = await response.json() as Partial<DashboardData> & { error?: string };
      if (!response.ok) {
        const code = result.error ?? "save failed";
        const messages: Record<string, string> = locale === "ar"
          ? { PLAN_FEATURE_REQUIRED: "باقتك الحالية لا تسمح بإنشاء هذا النوع من المحافظ.", PLAN_WALLET_LIMIT: "وصلت إلى حد المحافظ في باقتك.", INVALID_WALLET: "بيانات المحفظة غير مكتملة." }
          : { PLAN_FEATURE_REQUIRED: "Your current plan does not allow this wallet type.", PLAN_WALLET_LIMIT: "You reached the wallet limit on your plan.", INVALID_WALLET: "Wallet details are incomplete." };
        throw new Error(messages[code] ?? code);
      }
      onSaved(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "SAVE_FAILED");
    } finally { setSaving(false); }
  };
  return <Modal title={t.newWallet} onClose={onClose}><form className="modal-form" onSubmit={submit}><label><span>{t.walletName}</span><input required value={name} onChange={(event) => setName(event.target.value)} placeholder={locale === "ar" ? "مثال: سفرة الإخوة 2027" : "e.g. Siblings trip 2027"} /></label>{!lockType && <label><span>{t.walletType}</span><select value={type} onChange={(event) => setType(event.target.value)}>{Object.entries(typeLabels[locale]).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}{isGroup && <div className="form-row"><label><span>{locale === "ar" ? "المساهمة الشهرية الإلزامية" : "Mandatory monthly contribution"}</span><div className="money-input"><input required min="0.01" step="0.001" type="number" value={monthlyContribution} onChange={(event) => setMonthlyContribution(event.target.value)} /><b className="money-currency"><OmrSymbol size={14} /></b></div></label><label><span>{locale === "ar" ? "مدة الخطة (أشهر)" : "Plan duration (months)"}</span><input required type="number" min="1" max="120" value={durationMonths} onChange={(event) => setDurationMonths(event.target.value)} /></label></div>}<label><span>{locale === "ar" ? "تاريخ بداية الجمعية / المحفظة" : "Association / wallet start date"}</span><input required type="date" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /></label>{isGroup && <div className="modal-note split-preview"><span>{locale === "ar" ? "الهدف المالي للشخص = المساهمة × عدد الأشهر" : "Personal financial goal = contribution × months"}</span><strong>{formatMoney(Number.isFinite(liveGoalMinor) ? liveGoalMinor : 0, "OMR", locale)}</strong></div>}{isGroup && <p className="modal-note">{locale === "ar" ? "عند استلام مبلغ من عضو: يُخصم أولاً من المطالبات المتراكمة عليه، وأي زيادة تُسجَّل مقدّماً (له)." : "When a member pays: outstanding dues are cleared first, and any surplus is booked as advance credit."}</p>}{error && <p className="modal-error">{error}</p>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>{t.cancel}</button><button className="primary-button" disabled={saving}>{saving ? t.saving : t.create}</button></div></form></Modal>;
}

function InviteModal({ data, locale, preferredSpaceId, onClose, onDone }: { data: DashboardData; locale: Locale; preferredSpaceId?: string; onClose: () => void; onDone: (message: string) => void }) {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [recordOnly, setRecordOnly] = useState(true);
  const [role, setRole] = useState("member");
  const [spaceId, setSpaceId] = useState(preferredSpaceId ?? data.spaces.find((space) => space.type === "society")?.id ?? data.spaces.find((space) => space.type !== "personal")?.id ?? "");
  const plan = data.plans.find((item) => item.space_id === spaceId);
  const [monthlyContribution, setMonthlyContribution] = useState(plan?.amount_minor ? String(Number(plan.amount_minor) / 1000) : "20");
  const [durationMonths, setDurationMonths] = useState(String(plan?.duration_months ?? 12));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const totalMinor = Math.round(Number(monthlyContribution || 0) * 1000) * Math.max(1, Number(durationMonths) || 1);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await apiFetch(recordOnly ? "/api/dashboard" : "/api/platform", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: recordOnly ? "addMember" : "inviteMember",
          idempotencyKey: crypto.randomUUID(),
          email,
          phone,
          displayName,
          role,
          spaceId,
          monthlyContribution,
          durationMonths: Number(durationMonths) || 12,
        }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to create invitation");
      onDone(recordOnly ? (locale === "ar" ? `تمت إضافة ${displayName} — الإجمالي ${formatMoney(totalMinor, "OMR", locale)}` : `${displayName} added — total ${formatMoney(totalMinor, "OMR", locale)}`) : (locale === "ar" ? `تم إنشاء دعوة آمنة لـ ${email}` : `A secure invitation was created for ${email}`));
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : "Unable to create invitation";
      const messages: Record<string, string> = locale === "ar"
        ? { INVALID_PHONE: "رقم الهاتف غير مكتمل. أدخل 7 أرقام على الأقل، مثل 9904406 أو 9689904406.", INVALID_MEMBER: "تعذر إضافة المساهم.", PLAN_MEMBER_LIMIT: "تم بلوغ حد الأعضاء في الخطة." }
        : { INVALID_PHONE: "Phone number is too short. Enter at least 7 digits.", INVALID_MEMBER: "Could not add this member.", PLAN_MEMBER_LIMIT: "Member limit reached for this plan." };
      setError(messages[code] ?? code);
    } finally {
      setSaving(false);
    }
  };
  const roles = locale === "ar"
    ? { member: "عضو", treasurer: "أمين صندوق", manager: "مدير", auditor: "مدقق", viewer: "مشاهدة فقط" }
    : { member: "Member", treasurer: "Treasurer", manager: "Manager", auditor: "Auditor", viewer: "View only" };
  const groupSpaces = data.spaces.filter((space) => space.type !== "personal");
  return <Modal title={locale === "ar" ? "إضافة مساهم" : "Add member"} onClose={onClose}>
    <form className="modal-form" onSubmit={submit}>
      <div className="segmented-control"><button type="button" className={!recordOnly ? "active" : ""} onClick={() => setRecordOnly(false)}>{locale === "ar" ? "دعوة إلكترونية" : "Email invite"}</button><button type="button" className={recordOnly ? "active" : ""} onClick={() => setRecordOnly(true)}>{locale === "ar" ? "إضافة للسجل" : "Ledger member"}</button></div>
      <label><span>{locale === "ar" ? "من سجل العناوين" : "From address book"}</span>
        <select value="" onChange={(event) => {
          const contact = (data.contacts ?? []).find((item) => item.id === event.target.value);
          if (!contact) return;
          setDisplayName(contact.display_name);
          setEmail(contact.email ?? "");
          setPhone(contact.phone ?? "");
        }}>
          <option value="">{locale === "ar" ? "اختر عضواً محفوظاً (اختياري)" : "Pick a saved member (optional)"}</option>
          {(data.contacts ?? []).map((contact) => <option key={contact.id} value={contact.id}>{contact.display_name}{contact.phone ? ` · ${contact.phone}` : ""}</option>)}
        </select>
      </label>
      <label><span>{locale === "ar" ? "اسم المساهم" : "Member name"}</span><input required minLength={2} maxLength={80} value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
      <div className="form-row">
        <label><span>{locale === "ar" ? `البريد${recordOnly ? " (اختياري)" : ""}` : `Email${recordOnly ? " (optional)" : ""}`}</span><input required={!recordOnly} type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="member@example.com" /></label>
        <label><span>{locale === "ar" ? "رقم الهاتف" : "Phone"}</span><input required={recordOnly} value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="9904406" inputMode="tel" /></label>
      </div>
      <label><span>{locale === "ar" ? "الجمعية / المحفظة" : "Circle / wallet"}</span><select required value={spaceId} onChange={(event) => setSpaceId(event.target.value)}>{groupSpaces.map((space) => <option key={space.id} value={space.id}>{nameOf(space, locale)}</option>)}</select></label>
      {recordOnly && <div className="form-row">
        <label><span>{locale === "ar" ? "قيمة الاشتراك الشهري" : "Monthly subscription"}</span><div className="money-input"><input required min="0.001" step="0.001" type="number" value={monthlyContribution} onChange={(event) => setMonthlyContribution(event.target.value)} /><b className="money-currency"><OmrSymbol size={14} /></b></div></label>
        <label><span>{locale === "ar" ? "مدة الجمعية (أشهر)" : "Duration (months)"}</span><input required type="number" min="1" max="120" value={durationMonths} onChange={(event) => setDurationMonths(event.target.value)} /></label>
      </div>}
      {recordOnly && <div className="modal-note split-preview"><span>{locale === "ar" ? "الهدف المالي للشخص = الاشتراك × المدة" : "Personal financial goal = subscription × duration"}</span><strong>{formatMoney(Number.isFinite(totalMinor) ? totalMinor : 0, data.spaces.find((space) => space.id === spaceId)?.currency ?? "OMR", locale)}</strong></div>}
      <label><span>{locale === "ar" ? "الصلاحية" : "Access role"}</span><select value={role} onChange={(event) => setRole(event.target.value)}>{Object.entries(roles).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      {error && <p className="modal-error">{error}</p>}
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>{copy[locale].cancel}</button><button className="primary-button" disabled={saving || groupSpaces.length === 0}>{saving ? copy[locale].saving : (recordOnly ? (locale === "ar" ? "إضافة المساهم" : "Add member") : copy[locale].invite)}</button></div>
    </form>
  </Modal>;
}

function TripExpenseModal({ data, locale, preferredSpaceId, expenseId, onClose, onSaved }: { data: DashboardData; locale: Locale; preferredSpaceId?: string; expenseId?: string; onClose: () => void; onSaved: (next: Partial<DashboardData>) => void }) {
  const groupSpaces = data.spaces.filter((space) => ["household", "trip", "society", "group"].includes(space.type));
  const existing = expenseId ? data.tripExpenses.find((item) => item.id === expenseId) : undefined;
  const initialSpaceId = existing?.space_id
    ?? (preferredSpaceId && groupSpaces.some((space) => space.id === preferredSpaceId) ? preferredSpaceId : (groupSpaces[0]?.id ?? ""));
  const [spaceId, setSpaceId] = useState(initialSpaceId);
  const members = data.members.filter((member) => member.space_id === spaceId);
  const [paidFrom, setPaidFrom] = useState<"common_fund" | "member">(existing ? "member" : "common_fund");
  const [paidByMemberId, setPayer] = useState(existing?.paid_by_member_id ?? members[0]?.id ?? "");
  const [amount, setAmount] = useState(existing ? currencyMajor(existing.amount_minor, data.spaces.find((item) => item.id === existing.space_id)?.currency ?? "OMR").toFixed(3) : "");
  const [description, setDescription] = useState(existing?.description ?? "");
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
        body: JSON.stringify(existing
          ? {
              action: "updateTripExpense",
              idempotencyKey: crypto.randomUUID(),
              expenseId: existing.id,
              paidFrom,
              paidByMemberId: paidFrom === "member" ? paidByMemberId : undefined,
              amount,
              description,
            }
          : {
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
      const code = caught instanceof Error ? caught.message : "SAVE_FAILED";
      const messages: Record<string, string> = locale === "ar"
        ? { EXPENSE_ALREADY_SETTLED: "لا يمكن تعديل مصروف سُوّيت حصصه. احذف التسوية أولاً أو سجّل مصروفاً جديداً.", INSUFFICIENT_FUNDS: "رصيد الصندوق لا يكفي.", INVALID_AMOUNT: "المبلغ غير صالح." }
        : { EXPENSE_ALREADY_SETTLED: "This expense already has settled shares.", INSUFFICIENT_FUNDS: "Insufficient fund balance.", INVALID_AMOUNT: "Invalid amount." };
      setError(messages[code] ?? code);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal title={existing ? (locale === "ar" ? "تعديل مصروف جماعي" : "Edit group expense") : (locale === "ar" ? "إضافة مصروف جماعي" : "Add group expense")} onClose={onClose}>
      <form className="modal-form" onSubmit={submit}>
        <label><span>{locale === "ar" ? "المحفظة" : "Wallet"}</span><select required disabled={Boolean(existing)} value={spaceId} onChange={(event) => { setSpaceId(event.target.value); const nextMembers = data.members.filter((member) => member.space_id === event.target.value); setPayer(nextMembers[0]?.id ?? ""); }}>{groupSpaces.map((space) => <option key={space.id} value={space.id}>{nameOf(space, locale)}</option>)}</select></label>
        {!existing && <label><span>{locale === "ar" ? "دُفع من" : "Paid from"}</span><select value={paidFrom} onChange={(event) => setPaidFrom(event.target.value as "common_fund" | "member")}><option value="common_fund">{locale === "ar" ? "صندوق الجمعية" : "Association fund"}</option><option value="member">{locale === "ar" ? "حساب عضو" : "Member account"}</option></select></label>}
        {paidFrom === "member" && <label><span>{locale === "ar" ? "العضو الذي دفع" : "Member who paid"}</span><select required value={paidByMemberId} onChange={(event) => setPayer(event.target.value)}>{members.map((member) => <option key={member.id} value={member.id}>{member.display_name}</option>)}</select></label>}
        <label><span>{locale === "ar" ? "المبلغ" : "Amount"}</span><div className="money-input"><input required type="number" min="0.01" step="0.001" value={amount} onChange={(event) => setAmount(event.target.value)} /><b className="money-currency"><OmrSymbol size={14} /></b></div></label>
        <label><span>{locale === "ar" ? "الوصف" : "Description"}</span><input required minLength={2} maxLength={300} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
        <p className="modal-note">{existing
          ? (locale === "ar" ? "عند الحفظ يُعاد تقسيم المبلغ بالتساوي على كل الأعضاء الحاليين، بمن فيهم من أُضيفوا بعد الصرف." : "Saving re-splits the amount equally across all current members, including anyone added after the expense.")
          : (paidFrom === "common_fund"
          ? (locale === "ar" ? "يُخصم من صندوق الجمعية. إن صار الرصيد سالباً يُقسَّم العجز فوراً على الأعضاء المساهمين." : "Deducted from the association fund. If the balance goes negative, the deficit is split among contributing members immediately.")
          : (locale === "ar" ? "يُقسَّم المصروف بالتساوي: الدافع يصبح له، وباقي الأعضاء عليهم حصصهم." : "Split equally: the payer is owed (credit), others owe their shares."))}</p>
        {error && <p className="modal-error">{error}</p>}
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>{copy[locale].cancel}</button><button className="primary-button" disabled={saving || !spaceId || !members.length}>{saving ? copy[locale].saving : copy[locale].save}</button></div>
      </form>
    </Modal>
  );
}

function ClonePeriodModal({ data, locale, space, onClose, onSaved }: { data: DashboardData; locale: Locale; space: Space; onClose: () => void; onSaved: (next: Partial<DashboardData>) => void }) {
  const members = data.members.filter((member) => member.space_id === space.id && member.status === "active");
  const plan = data.plans.find((item) => String(item.space_id) === space.id);
  const [name, setName] = useState(`${space.name_ar} · ${new Date().getFullYear() + 1}`);
  const [startsAt, setStartsAt] = useState(new Date().toISOString().slice(0, 10));
  const [selected, setSelected] = useState<string[]>(members.map((member) => member.id));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const monthly = plan?.amount_minor ? String(Number(plan.amount_minor) / 1000) : "20";
  const duration = String(plan?.duration_months ?? 12);
  const toggle = (id: string) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true); setError("");
    try {
      const response = await apiFetch("/api/dashboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "addWallet",
          idempotencyKey: crypto.randomUUID(),
          name,
          type: space.type === "trip" ? "society" : space.type,
          monthlyContribution: monthly,
          durationMonths: Number(duration) || 12,
          dueDay: 1,
          startsAt,
          cloneFromSpaceId: space.id,
          cloneMemberIds: selected,
          goal: "0",
        }),
      });
      const result = await response.json() as Partial<DashboardData> & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "CLONE_FAILED");
      onSaved(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "CLONE_FAILED");
    } finally { setSaving(false); }
  };
  return (
    <Modal title={locale === "ar" ? "فتح فترة جديدة / استنساخ الجمعية" : "Open new period / clone association"} wide onClose={onClose}>
      <form className="modal-form" onSubmit={submit}>
        <p className="modal-note">{locale === "ar" ? "تُنشأ جمعية جديدة بنفس الاشتراك والمدة. ألغِ تحديد من لن يشارك، أو أضف لاحقاً من سجل العناوين." : "Creates a new association with the same dues. Uncheck anyone who will not join; add others later from the address book."}</p>
        <label><span>{locale === "ar" ? "اسم الفترة / الجمعية الجديدة" : "New period / association name"}</span><input required minLength={2} value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label><span>{locale === "ar" ? "تاريخ البداية" : "Start date"}</span><input required type="date" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /></label>
        <div className="month-grid selectable">
          {members.map((member) => (
            <button type="button" key={member.id} className={`month-chip ${selected.includes(member.id) ? "selected" : ""}`} onClick={() => toggle(member.id)}>
              <strong>{member.display_name}</strong>
              <span>{selected.includes(member.id) ? (locale === "ar" ? "سيُنقل" : "Included") : (locale === "ar" ? "مستبعد" : "Excluded")}</span>
            </button>
          ))}
        </div>
        {error && <p className="modal-error">{error}</p>}
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>{copy[locale].cancel}</button><button className="primary-button" disabled={saving || !selected.length}>{saving ? copy[locale].saving : (locale === "ar" ? "فتح الفترة الجديدة" : "Open new period")}</button></div>
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

function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className={`modal-card${wide ? " wide-modal" : ""}`} role="dialog" aria-modal="true" aria-label={title}><div className="modal-header"><h2>{title}</h2><button onClick={onClose} aria-label="Close"><X size={20} /></button></div>{children}</section></div>;
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
