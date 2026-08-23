"use client";

import OmrSymbol from "../components/brand/OmrSymbol";
import { WazenIcon } from "../components/brand/WazenLogo";
import WazenPageLoader from "../components/brand/WazenPageLoader";
import { ReportsPanel } from "../components/reports/ReportsPanel";
import { MemberDetailModal, MemberPersonProfile, ReceiptChannelModal, RemainingInvoiceGrid, SmartAccountantModal, memberAccruedDueMinor, memberInstallments, personIdentityKey } from "../components/members/association-members";
import { PersonalRulesSetup, PersonalWalletPanel, confirmResetWalletData } from "../components/personal/personal-wallet";
import { DateField } from "../components/ui/date-field";
import { FoldWrap } from "../components/ui/collapsible-panel";
import { HouseholdFamilyPanel } from "../components/household/household-family";
import { WalletForecastPanel } from "../components/forecast/wallet-forecast";
import { projectCashflow } from "../lib/wallet-forecast";
import { isPeriodLocked } from "../lib/accounting-periods";
import { buildReportHtml, printWazenHtml } from "../lib/reports";
import { wrapPrintDocument } from "../lib/print-document";
import { composeWhatsAppPhone, splitPhoneParts, toWhatsAppNumber } from "../lib/phone";
import { apiFetch } from "../lib/client-api";
import { buildAccountStatementHtml } from "../lib/account-statement";
import { allocateOldestFirst, periodKeyFromDate, remainingInstallmentMinor, selectByAmount, selectThroughOldest, totalRemainingMinor } from "../lib/installments";
import { formatMoneyMinor, currencyScale } from "../lib/money";
import { escapeHtml } from "../lib/html";
import { memberDisplayCreditMinor, netMemberClaim, pendingSettlementsWithCredit } from "../lib/finance";
import { dashboardNavLocked, formatQuota, planAllowsSpaceType, planHasFeature, PLAN_FEATURE_CATALOG, quotaRemaining, quotaWarningCopy, upgradeNoticeFor } from "../lib/plan-features";
import { userGraceWarningCopy } from "../lib/plan-retention-rules";
import { canOpenPlatformConsole } from "../lib/platform-console";
import { consumePlanQuota } from "../lib/plan-quota-client";
import { TRANSACTION_PAGE_SIZES, pageTransactions } from "../lib/transaction-page";
import { dialCodesForSelect, DEFAULT_DIAL_CODE, DEFAULT_DIAL_ISO2 } from "../lib/country-dial-codes";
import type { MemberLedgerFocus } from "../lib/member-ledger";
import { occurrenceVarianceCopy } from "../lib/personal-finance";
import {
  Archive,
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  Bell,
  CalendarDays,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  Download,
  Printer,
  Trash2,
  Palette,
  Pencil,
  MessageCircle,
  Globe2,
  HandCoins,
  House,
  Landmark,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Plane,
  Plus,
  ReceiptText,
  Repeat2,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Sun,
  Target,
  TrendingDown,
  TrendingUp,
  Unlock,
  UserPlus,
  Users,
  WalletCards,
  X,
  Lock,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState, startTransition } from "react";
import { prefetchAppRoutes, warmAppCaches } from "../lib/app-prefetch";
import { completeClientLogout } from "../lib/client-logout";
import { clientSignInPath } from "../lib/client-sign-in";
import { BhdAppSwitcher } from "../components/bhd/BhdAppSwitcher";
import { fetchDashboardSession, readDashboardCache, writeDashboardCache } from "../lib/dashboard-session";
import { notifyLiveRefresh, useLiveDashboard } from "../lib/live-sync";

type Locale = "ar" | "en";
type ThemeMode = "light" | "dark";
type AccentId = "emerald" | "teal" | "navy" | "amber" | "rose" | "purple" | "forest";
const ACCENTS: { id: AccentId; labelAr: string; labelEn: string; swatch: string }[] = [
  { id: "emerald", labelAr: "زمردي", labelEn: "Emerald", swatch: "#0d7a65" },
  { id: "teal", labelAr: "فيروزي", labelEn: "Teal", swatch: "#0e7c86" },
  { id: "navy", labelAr: "كحلي", labelEn: "Navy", swatch: "#1e5a6e" },
  { id: "amber", labelAr: "ذهبي", labelEn: "Amber", swatch: "#b6751f" },
  { id: "rose", labelAr: "وردي", labelEn: "Rose", swatch: "#a84d58" },
  { id: "purple", labelAr: "بنفسجي", labelEn: "Purple", swatch: "#7356aa" },
  { id: "forest", labelAr: "زيتي", labelEn: "Forest", swatch: "#4a6b32" },
];
function isAccentId(value: string | null | undefined): value is AccentId {
  return Boolean(value && ACCENTS.some((item) => item.id === value));
}
type ViewId = "overview" | "personal" | "household" | "groups" | "trip" | "society" | "transactions" | "reports" | "settings";
const VIEW_IDS: ViewId[] = ["overview", "personal", "household", "groups", "trip", "society", "transactions", "reports", "settings"];
function isViewId(value: string | null | undefined): value is ViewId {
  return Boolean(value && VIEW_IDS.includes(value as ViewId));
}

type User = { id: string; email: string; displayName: string; avatarUrl?: string | null; isDemo: boolean; role?: string | null };
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
  starts_at?: string | null;
  status?: string;
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
  account_id?: string | null;
  user_id?: string | null;
};
type CircleTurn = { id: string; space_id: string; member_id: string; display_name: string; turn_number: number; status: string; amount_minor: number };
type TripExpense = { id: string; space_id: string; paid_by_member_id: string; paid_by_name: string; amount_minor: number; description: string; occurred_at: string; paid_from?: string };
type ExpenseSplit = { id: string; expense_id: string; member_id: string; display_name: string; share_minor: number };
type Settlement = { id: string; space_id: string; from_member_id: string; to_member_id: string; from_member_name: string | null; to_member_name: string | null; amount_minor: number; status: string };
type DashboardData = { user: User; spaces: Space[]; members: Member[]; transactions: Transaction[]; plans: Record<string, unknown>[]; circleTurns: CircleTurn[]; tripExpenses: TripExpense[]; expenseSplits: ExpenseSplit[]; settlements: Settlement[]; entitlements?: { features: string[]; walletLimit: number; memberLimit: number; transactionLimit?: number; recordLimit?: number; userLimit?: number; dailyTransactionLimit?: number; monthlyTransactionLimit?: number; printLimit?: number; status: string; usage?: { transactionsTotal: number; transactionsToday: number; transactionsThisMonth: number; printsThisMonth: number }; warnings?: Array<{ kind: string; used: number; limit: number }>; retention?: { graceEndsAt: string; spaceCount: number; spaceTypes: string[]; userVisibleDays: number } | null }; installments?: Array<{ id: string; member_id: string; space_id: string; period_index: number; period_key: string; amount_minor: number; paid_minor: number; status: string; due_at?: string }>; contacts?: Array<{ id: string; display_name: string; email: string | null; phone: string | null }>; periods?: Array<{ id: string; space_id: string; label: string; starts_at: string; ends_at?: string | null; closed_at?: string | null; reopened_at?: string | null; closed_by_name?: string | null; reopened_by_name?: string | null; reopen_count?: number; status: string }>; periodEvents?: Array<{ id: string; space_id: string; period_id?: string | null; actor_name?: string | null; action: string; summary_ar?: string | null; summary_en?: string | null; created_at: string }>; personalAccounts?: Array<{ id: string; space_id: string; name: string; kind: string; opening_minor: number; balance_minor?: number }>; personalRules?: Array<{ id: string; space_id: string; account_id?: string | null; kind: string; name: string; amount_mode: string; schedule?: string; amount_minor: number; due_day: number; starts_at: string; ends_at?: string | null; total_minor: number; duration_months: number; paid_minor: number; status: string }>; personalOccurrences?: Array<{ id: string; rule_id: string; space_id: string; account_id?: string | null; period_key: string; due_at: string; expected_minor: number; actual_minor?: number | null; status: string; transaction_id?: string | null; rule_name?: string; rule_kind?: string; amount_mode?: string }>; payoutAccounts?: Array<{ space_id: string; label: string; account_number: string; linked_member_id?: string | null }>; familyEvents?: Array<{ id: string; space_id: string; title: string; kind: string; target_at: string; expected_minor: number; status: string; projectedMinor?: number; scheduledInflowMinor?: number; shortfallMinor?: number; needsBoost?: boolean }>; spaceLinks?: Array<{ hub_space_id: string; linked_space_id: string; status: string }>; spaceBankLinks?: Array<{ hub_space_id: string; linked_space_id: string; account_id: string }> };

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

function planFeaturesOf(data?: DashboardData | null) {
  return data?.entitlements?.features?.length ? data.entitlements.features : ["personal"];
}

function graceSpaceTypesOf(data?: DashboardData | null) {
  return data?.entitlements?.retention?.spaceTypes ?? [];
}

function planAllowsStatements(features: string[]) {
  return planHasFeature(features, "statements") || planHasFeature(features, "documents");
}

function goToPricing() {
  window.location.assign("/pricing");
}

function PlanLockBadge({ locale }: { locale: Locale }) {
  return <em className="plan-lock-badge">{locale === "ar" ? "ترقية" : "Upgrade"}</em>;
}

function UpgradeGate({ locale, title, text }: { locale: Locale; title: string; text: string }) {
  return (
    <article className="panel upgrade-gate">
      <div className="empty-state">
        <Lock size={28} />
        <strong>{title}</strong>
        <p>{text}</p>
        <div className="upgrade-gate-actions">
          <a className="primary-button" href="/pricing">{locale === "ar" ? "عرض الباقات والترقية" : "View plans and upgrade"}</a>
          <a className="secondary-button" href="/billing">{locale === "ar" ? "باقتي الحالية" : "Current plan"}</a>
        </div>
      </div>
    </article>
  );
}

function UpgradeNoticeModal({ locale, title, text, onClose }: { locale: Locale; title: string; text: string; onClose: () => void }) {
  return (
    <Modal title={title} onClose={onClose} className="upgrade-notice-modal">
      <div className="upgrade-notice">
        <Lock size={28} />
        <p>{text}</p>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>{locale === "ar" ? "إغلاق" : "Close"}</button>
          <a className="primary-button" href="/pricing">{locale === "ar" ? "ترقية الباقة" : "Upgrade plan"}</a>
        </div>
      </div>
    </Modal>
  );
}

function formatMoney(minor: number, currency: string, locale: Locale, compact = false) {
  return formatMoneyMinor(minor, currency || "OMR", locale, { compact });
}

function nameOf(space: Space, locale: Locale) {
  return locale === "ar" ? space.name_ar : space.name_en;
}

function transactionName(transaction: Transaction, locale: Locale) {
  return locale === "ar" ? transaction.description_ar : transaction.description_en;
}

function todayDateInput() {
  return new Date().toISOString().slice(0, 10);
}

function occurredAtToDateInput(iso: string | undefined) {
  const day = String(iso ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : todayDateInput();
}

/** DateField stores YYYY-MM-DD; API expects ISO datetime. */
function dateInputToOccurredAt(date: string) {
  const day = String(date ?? "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return new Date().toISOString();
  return `${day}T12:00:00.000Z`;
}

function currencyMajor(minor: number, currency: string) {
  return minor / (10 ** currencyScale(currency));
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

function spaceLedger(space: Space, data: DashboardData) {
  const rows = data.transactions.filter((row) => row.space_id === space.id && isLiveTransaction(row));
  const income = rows.filter((row) => ["income", "contribution"].includes(row.kind)).reduce((sum, row) => sum + row.amount_minor, 0);
  const spend = rows.filter((row) => row.kind === "expense").reduce((sum, row) => sum + row.amount_minor, 0);
  return { income, spend, remaining: income - spend };
}

function isLiveTransaction(transaction: { status?: string }) {
  return (transaction.status ?? "approved") === "approved";
}

function transactionStatusLabel(status: string | undefined, locale: Locale) {
  const key = status ?? "approved";
  const ar: Record<string, string> = {
    approved: "معتمدة",
    voided: "ملغاة",
    superseded: "مستبدلة",
    deferred: "مؤجّلة",
    skipped: "موقوفة",
    pending: "معلّقة",
    posted: "مرحلة",
  };
  const en: Record<string, string> = {
    approved: "Posted",
    voided: "Voided",
    superseded: "Replaced",
    deferred: "Deferred",
    skipped: "Paused",
    pending: "Pending",
    posted: "Posted",
  };
  return (locale === "ar" ? ar : en)[key] ?? key;
}

function spaceMonthlyFlow(space: Space, data: DashboardData) {
  if (space.type === "personal") {
    const currentKey = periodKeyFromDate(new Date().toISOString());
    const occurrences = (data.personalOccurrences ?? []).filter((row) => row.space_id === space.id);
    const isDropped = (row: NonNullable<DashboardData["personalOccurrences"]>[number]) => ["skipped", "deferred"].includes(row.status);
    const cancelledRuleIds = new Set(occurrences.filter((row) => row.period_key === currentKey && isDropped(row)).map((row) => row.rule_id));
    const monthlyRules = (data.personalRules ?? []).filter((rule) => rule.space_id === space.id && rule.status === "active" && (rule.schedule ?? "monthly") === "monthly");
    const remaining = occurrences.filter((row) => row.period_key === currentKey && row.status === "pending" && !isDropped(row));
    const rules = monthlyRules.filter((rule) => !cancelledRuleIds.has(rule.id));
    return {
      inflow: rules.filter((rule) => rule.kind === "income").reduce((sum, rule) => sum + Number(rule.amount_minor), 0),
      outflow: rules.filter((rule) => rule.kind === "expense").reduce((sum, rule) => sum + Number(rule.amount_minor), 0),
      remainingIn: remaining.filter((row) => row.rule_kind === "income").reduce((sum, row) => sum + Number(row.actual_minor ?? row.expected_minor), 0),
      remainingOut: remaining.filter((row) => row.rule_kind !== "income").reduce((sum, row) => sum + Number(row.actual_minor ?? row.expected_minor), 0),
    };
  }
  const plan = data.plans.find((item) => String(item.space_id) === space.id);
  const monthly = Number(plan?.amount_minor ?? 0);
  const contributors = data.members.filter((member) => member.space_id === space.id && (member.status ?? "active") === "active" && Number(member.due_minor) > 0).length;
  const since = Date.now() - 90 * 24 * 60 * 60 * 1000;
  const recentSpend = data.transactions
    .filter((row) => row.space_id === space.id && row.kind === "expense" && isLiveTransaction(row) && new Date(row.occurred_at).getTime() >= since)
    .reduce((sum, row) => sum + row.amount_minor, 0);
  const inflow = monthly * contributors;
  const outflow = Math.round(recentSpend / 3);
  return { remainingIn: inflow, remainingOut: outflow, inflow, outflow };
}

function memberPosition(member: Member, data?: DashboardData, spaceId?: string) {
  const plan = data?.plans.find((item) => String(item.space_id) === member.space_id);
  const accruedDue = data ? memberAccruedDueMinor(member, data.installments ?? [], plan) : Number(member.due_minor) || 0;
  const paid = Number(member.paid_minor) || 0;
  const remainingDue = Math.max(0, accruedDue - paid);
  const advance = Math.max(0, paid - accruedDue);
  const cashCredit = memberDisplayCreditMinor(member, { accruedDueMinor: accruedDue, transactions: data?.transactions });
  let debit = remainingDue;
  let credit = cashCredit;
  const expenseSpaceId = spaceId ?? member.space_id;
  if (data && expenseSpaceId) {
    const expenseNet = memberExpenseNet(member.id, data, expenseSpaceId);
    debit += Math.max(0, -expenseNet);
    credit += Math.max(0, expenseNet);
  }
  const net = netMemberClaim(debit, credit);
  return { remainingDue, advance, cashCredit, ...net, debit: net.debitMinor, credit: net.creditMinor };
}

function printSpaceStatement(space: Space | null, data: DashboardData, locale: Locale, accountId?: string | null) {
  void consumePlanQuota("print", locale, space?.id).then((quota) => {
    if (!quota.ok) return;
    void printWazenHtml((logoUrl) => buildAccountStatementHtml({
    locale,
    logoUrl,
    issuerName: data.user.displayName,
    spaces: data.spaces,
    members: data.members,
    accounts: data.personalAccounts ?? [],
    transactions: data.transactions,
    occurrences: data.personalOccurrences ?? [],
    spaceId: space?.id ?? null,
    accountId: accountId ?? null,
  }), true).then((opened) => {
    if (!opened) window.alert(locale === "ar" ? "اسمح بالنوافذ المنبثقة أو استخدم زر الطباعة داخل المعاينة." : "Allow pop-ups or use Print inside the preview.");
  });
  });
}

function printAccountingPeriod(space: Space, period: NonNullable<DashboardData["periods"]>[number], data: DashboardData, locale: Locale) {
  const start = new Date(period.starts_at).getTime();
  const end = new Date(period.ends_at || period.closed_at || new Date().toISOString()).getTime();
  const reportSpace = { id: space.id, name_ar: space.name_ar, name_en: space.name_en, type: space.type, currency: space.currency, balance_minor: space.balance_minor, goal_minor: space.goal_minor };
  void consumePlanQuota("print", locale, space.id).then((quota) => {
    if (!quota.ok) return;
    void printWazenHtml((logoUrl) => buildReportHtml({
    locale,
    reportType: "period",
    logoUrl,
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
  }), true).then((opened) => {
    if (!opened) window.alert(locale === "ar" ? "اسمح بالنوافذ المنبثقة لطباعة الكشف." : "Allow pop-ups to print the statement.");
  });
  });
}

function memberExpenseNet(memberId: string, data: DashboardData, spaceId: string) {
  let net = 0;
  for (const settlement of data.settlements.filter((item) => item.space_id === spaceId && item.status === "pending")) {
    const amount = Number(settlement.amount_minor) || 0;
    if (settlement.to_member_id === memberId) net += amount;
    if (settlement.from_member_id === memberId) net -= amount;
  }
  return net;
}

function dashboardError(code: string, locale: Locale) {
  const table = locale === "ar"
    ? {
      INTERNAL_ERROR: "تعذر إكمال الحذف. حدّث الصفحة وحاول مرة أخرى.",
      INSUFFICIENT_FUNDS: "رصيد الصندوق لا يكفي.",
      WALLET_NOT_LINKED: "اربط المحفظة أولاً.",
      WALLET_ALREADY_LINKED: "هذه المحفظة مربوطة مسبقاً.",
      CANNOT_LINK_SELF: "لا يمكن ربط المحفظة بنفسها.",
      PERIOD_CLOSED: "الفترة مغلقة. أعد فتحها للتعديل.",
      PERIOD_UNSETTLED: "لا يمكن إغلاق الفترة قبل أن يسدّد كل الأعضاء ما عليهم (الاشتراك والتسويات المعلقة).",
      INVALID_PAYER: "اختر حساب الدفع.",
      PERIOD_NOT_CLOSED: "هذه الفترة ليست مغلقة.",
      FORBIDDEN: "لا تملك صلاحية تعديل هذه الجمعية. المالك فقط يمكنه الأرشفة أو الحذف.",
      WALLET_NOT_FOUND: "الجمعية غير موجودة.",
      INVALID_PROFILE: "تحقق من الاسم (حرفان على الأقل).",
      INVALID_PHOTO: "الصورة غير مدعومة. استخدم JPEG أو PNG أو WebP.",
      PHOTO_TOO_LARGE: "الصورة كبيرة. اختر صورة أوضح وأصغر.",
      INVALID_CREDENTIALS: "كلمة المرور الحالية غير صحيحة.",
      PASSWORD_MUST_CHANGE: "كلمة المرور الجديدة يجب أن تختلف عن الحالية.",
      PASSWORD_MISMATCH: "كلمتا المرور الجديدتان غير متطابقتين.",
      AUTHENTICATION_REQUIRED: "سجّل الدخول مرة أخرى ثم حاول.",
      PLAN_TRANSACTION_LIMIT: "وصلت إلى حد المعاملات في باقتك.",
      PLAN_DAILY_TRANSACTION_LIMIT: "وصلت إلى حد المعاملات اليومية في باقتك.",
      PLAN_MONTHLY_TRANSACTION_LIMIT: "وصلت إلى حد المعاملات الشهرية في باقتك.",
      PLAN_PRINT_LIMIT: "وصلت إلى حد المطبوعات في باقتك هذا الشهر.",
      PLAN_FEATURE_REQUIRED: "هذه الميزة تحتاج ترقية الباقة.",
      PLAN_RECORD_LIMIT: "وصلت إلى حد السجلات والمستندات في باقتك.",
      PLAN_USER_LIMIT: "وصلت إلى حد المستخدمين في باقتك.",
      PLAN_MEMBER_LIMIT: "وصلت إلى حد الأعضاء في باقتك.",
      PLAN_WALLET_LIMIT: "وصلت إلى حد المحافظ في باقتك.",
    }
    : {
      INTERNAL_ERROR: "Could not complete the delete. Refresh and try again.",
      INSUFFICIENT_FUNDS: "Insufficient fund balance.",
      WALLET_NOT_LINKED: "Link the wallet first.",
      WALLET_ALREADY_LINKED: "This wallet is already linked.",
      CANNOT_LINK_SELF: "A wallet cannot link to itself.",
      PERIOD_CLOSED: "The period is closed. Reopen it to edit.",
      PERIOD_UNSETTLED: "Close the period only after every member settles dues and pending shares.",
      INVALID_PAYER: "Choose who paid.",
      PERIOD_NOT_CLOSED: "This period is not closed.",
      FORBIDDEN: "Only the owner can archive or delete this association.",
      WALLET_NOT_FOUND: "Association not found.",
      INVALID_PROFILE: "Check the name (at least 2 characters).",
      INVALID_PHOTO: "Unsupported photo. Use JPEG, PNG, or WebP.",
      PHOTO_TOO_LARGE: "Photo is too large. Choose a smaller image.",
      INVALID_CREDENTIALS: "The current password is incorrect.",
      PASSWORD_MUST_CHANGE: "The new password must be different from the current one.",
      PASSWORD_MISMATCH: "The new passwords do not match.",
      AUTHENTICATION_REQUIRED: "Sign in again, then try.",
      PLAN_TRANSACTION_LIMIT: "You reached the transaction limit on your plan.",
      PLAN_DAILY_TRANSACTION_LIMIT: "You reached the daily transaction limit on your plan.",
      PLAN_MONTHLY_TRANSACTION_LIMIT: "You reached the monthly transaction limit on your plan.",
      PLAN_PRINT_LIMIT: "You reached this month’s print limit on your plan.",
      PLAN_FEATURE_REQUIRED: "This feature needs a plan upgrade.",
      PLAN_RECORD_LIMIT: "You reached the record limit on your plan.",
      PLAN_USER_LIMIT: "You reached the user limit on your plan.",
      PLAN_MEMBER_LIMIT: "You reached the member limit on your plan.",
      PLAN_WALLET_LIMIT: "You reached the wallet limit on your plan.",
    };
  return table[code as keyof typeof table] ?? code;
}

function buildTransactionReceiptParts(transaction: Transaction, data: DashboardData, locale: Locale) {
  const space = data.spaces.find((item) => item.id === transaction.space_id);
  const member = data.members.find((item) => item.id === transaction.member_id);
  const occurrence = (data.personalOccurrences ?? []).find((item) => item.transaction_id === transaction.id);
  const expected = Number(occurrence?.expected_minor ?? 0);
  const actual = Number(occurrence?.actual_minor ?? transaction.amount_minor);
  const delta = actual - expected;
  const title = locale === "ar" ? "إيصال وازن" : "WAZEN receipt";
  const amount = formatMoney(transaction.amount_minor, space?.currency ?? "OMR", locale);
  const extra = occurrence && expected > 0
    ? `<tr><td>${locale === "ar" ? "الالتزام" : "Commitment"}</td><td>${formatMoney(expected, space?.currency ?? "OMR", locale)}</td></tr>
    <tr><td>${locale === "ar" ? "المدفوع" : "Paid"}</td><td>${formatMoney(actual, space?.currency ?? "OMR", locale)}</td></tr>
    <tr><td>${locale === "ar" ? "الفرق" : "Variance"}</td><td>${delta === 0 ? (locale === "ar" ? "مطابق" : "Match") : `${delta > 0 ? (locale === "ar" ? "زيادة" : "Over") : (locale === "ar" ? "نقص" : "Short")} ${formatMoney(Math.abs(delta), space?.currency ?? "OMR", locale)}`}</td></tr>
    <tr><td>${locale === "ar" ? "الملخص" : "Summary"}</td><td>${escapeHtml(occurrenceVarianceCopy(expected, actual, locale))}</td></tr>`
    : `<tr><td>${locale === "ar" ? "المبلغ" : "Amount"}</td><td>${amount}</td></tr>`;
  const bodyHtml = `<section><h2>${escapeHtml(title)}</h2><table>
    <tr><td>${locale === "ar" ? "الوصف" : "Description"}</td><td>${escapeHtml(transactionName(transaction, locale))}</td></tr>
    <tr><td>${locale === "ar" ? "المحفظة" : "Wallet"}</td><td>${escapeHtml(space ? nameOf(space, locale) : "—")}</td></tr>
    <tr><td>${locale === "ar" ? "المساهم" : "Member"}</td><td>${escapeHtml(member?.display_name ?? "—")}</td></tr>
    <tr><td>${locale === "ar" ? "النوع" : "Type"}</td><td>${escapeHtml(transaction.kind)}</td></tr>
    ${extra}
    <tr><td>${locale === "ar" ? "المرجع" : "Reference"}</td><td>${transaction.id.slice(0, 8).toUpperCase()}</td></tr>
  </table></section>`;
  const text = locale === "ar"
    ? [
        "إيصال وازن",
        `الوصف: ${transactionName(transaction, locale)}`,
        `المحفظة: ${space ? nameOf(space, locale) : "—"}`,
        `المساهم: ${member?.display_name ?? "—"}`,
        `المبلغ: ${amount}`,
        `التاريخ: ${new Date(transaction.occurred_at).toLocaleDateString("ar-OM")}`,
        `المرجع: ${transaction.id.slice(0, 8).toUpperCase()}`,
      ].join("\n")
    : [
        "WAZEN receipt",
        `Description: ${transactionName(transaction, locale)}`,
        `Wallet: ${space ? nameOf(space, locale) : "—"}`,
        `Member: ${member?.display_name ?? "—"}`,
        `Amount: ${amount}`,
        `Date: ${new Date(transaction.occurred_at).toLocaleDateString("en-GB")}`,
        `Ref: ${transaction.id.slice(0, 8).toUpperCase()}`,
      ].join("\n");
  return {
    title,
    entityName: space ? nameOf(space, locale) : "WAZEN",
    subtitle: new Date(transaction.occurred_at).toLocaleString(locale === "ar" ? "ar-OM" : "en-GB"),
    bodyHtml,
    text,
    phone: member?.phone ? toWhatsAppNumber(member.phone) : "",
    filename: `wazen-receipt-${transaction.id.slice(0, 8)}`,
    spaceId: transaction.space_id,
  };
}

function openTransactionReceipt(transaction: Transaction, data: DashboardData, locale: Locale) {
  const parts = buildTransactionReceiptParts(transaction, data, locale);
  void consumePlanQuota("print", locale, parts.spaceId).then((quota) => {
    if (!quota.ok) return;
    void printWazenHtml((logoUrl) => wrapPrintDocument({
      locale,
      title: parts.title,
      entityName: parts.entityName,
      logoUrl,
      subtitle: parts.subtitle,
      bodyHtml: parts.bodyHtml,
    }), true);
  });
}

async function shareTransactionWhatsApp(transaction: Transaction, data: DashboardData, locale: Locale) {
  if (!planHasFeature(planFeaturesOf(data), "whatsapp")) {
    goToPricing();
    return;
  }
  try {
    const response = await apiFetch("/api/dashboard", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "createReceiptShare",
        idempotencyKey: crypto.randomUUID(),
        transactionId: transaction.id,
        locale,
      }),
    });
    const result = await response.json() as { error?: string; notification?: { whatsappUrl?: string | null } };
    if (!response.ok) throw new Error(result.error ?? "SHARE_FAILED");
    if (result.notification?.whatsappUrl) {
      window.open(result.notification.whatsappUrl, "_blank", "noopener,noreferrer");
    }
  } catch {
    window.alert(locale === "ar" ? "تعذر تجهيز رابط الإيصال لواتساب." : "Could not prepare the WhatsApp receipt link.");
  }
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
    for (const occurrence of (data.personalOccurrences ?? []).filter((item) => item.status === "pending")) {
      const space = data.spaces.find((item) => item.id === occurrence.space_id);
      if (!space) continue;
      rows.push({
        id: `occ:${occurrence.id}`,
        title: locale === "ar" ? `تأكيد: ${occurrence.rule_name ?? "بند"}` : `Confirm: ${occurrence.rule_name ?? "item"}`,
        detail: locale === "ar" ? `${occurrence.period_key} — اعتماد أو تأجيل أو تجاهل` : `${occurrence.period_key} — approve, defer, or skip`,
        view: "personal",
        spaceId: space.id,
      });
    }
    for (const event of (data.familyEvents ?? []).filter((item) => item.needsBoost && item.status === "planned")) {
      const space = data.spaces.find((item) => item.id === event.space_id);
      if (!space) continue;
      rows.push({
        id: `family:${event.id}`,
        title: locale === "ar" ? `عجز متوقع: ${event.title}` : `Forecast shortfall: ${event.title}`,
        detail: locale === "ar" ? `يحتاج تعزيز ${formatMoney(event.shortfallMinor ?? 0, space.currency, locale)} قبل التاريخ` : `Needs a boost of ${formatMoney(event.shortfallMinor ?? 0, space.currency, locale)} before the date`,
        view: "household",
        spaceId: space.id,
      });
    }
    for (const space of data.spaces) {
      const flow = spaceMonthlyFlow(space, data);
      const forecast = projectCashflow({ balanceMinor: space.balance_minor, monthlyInflowMinor: flow.inflow, monthlyOutflowMinor: flow.outflow, months: 3 });
      if (!forecast.needsBoost) continue;
      rows.push({
        id: `forecast:${space.id}`,
        title: locale === "ar" ? `عجز متوقع في ${nameOf(space, locale)}` : `Forecast shortfall in ${nameOf(space, locale)}`,
        detail: locale === "ar" ? `خلال 3 أشهر قد ينقص ${formatMoney(forecast.shortfallMinor, space.currency, locale)}` : `In 3 months a gap of ${formatMoney(forecast.shortfallMinor, space.currency, locale)} is likely`,
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
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [locale, setLocale] = useState<Locale>("ar");
  const [theme, setTheme] = useState<ThemeMode>("light");
  const [accent, setAccent] = useState<AccentId>("emerald");
  const [activeView, setActiveView] = useState<ViewId>(() => (isViewId(searchParams.get("view")) ? searchParams.get("view") as ViewId : "overview"));
  const [data, setDataState] = useState<DashboardData | null>(() => readDashboardCache<DashboardData>());
  const [loading, setLoading] = useState(() => !readDashboardCache());
  const [error, setError] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [modal, setModal] = useState<"transaction" | "wallet" | "editWallet" | "invite" | "tripExpense" | "circleOrder" | "withdrawSurplus" | "smartPay" | "memberDetail" | "memberProfile" | "sendReceipt" | "clonePeriod" | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [pickedSpaceId, setPickedSpaceId] = useState<Partial<Record<ViewId, string>>>({});
  const [activeMemberId, setActiveMemberId] = useState("");
  const [memberLedgerFocus, setMemberLedgerFocus] = useState<MemberLedgerFocus>("all");
  const [receiptTxnId, setReceiptTxnId] = useState<string | undefined>(undefined);
  const [withdrawMemberId, setWithdrawMemberId] = useState("");
  const [editingExpenseId, setEditingExpenseId] = useState("");
  const [toast, setToast] = useState("");
  const [upgradeNotice, setUpgradeNotice] = useState<{ title: string; text: string } | null>(null);
  const t = copy[locale];

  const setData = (next: DashboardData) => {
    writeDashboardCache(next);
    setDataState(next);
    notifyLiveRefresh();
  };

  const showUpgradeNotice = (targetKey: string, featureLabel: string) => {
    setSidebarOpen(false);
    setUpgradeNotice(upgradeNoticeFor(locale, featureLabel, targetKey));
  };

  const load = useCallback(async (force = false) => {
    try {
      setError(false);
      const result = await fetchDashboardSession<DashboardData>(force);
      if (result.data) setDataState(result.data);
    } catch (caught) {
      if ((caught as { status?: number }).status === 401) {
        window.location.replace(clientSignInPath("/dashboard"));
        return;
      }
      if (!readDashboardCache()) setError(true);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useLiveDashboard(() => { void load(true); }, !loading);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!loading || data) return;
    const timer = window.setTimeout(() => {
      setLoading(false);
      setError(true);
    }, 18_000);
    return () => window.clearTimeout(timer);
  }, [loading, data]);
  useEffect(() => {
    if (!data) return;
    prefetchAppRoutes(router, data.user.role ?? undefined);
    warmAppCaches(data.user.role ?? undefined);
  }, [router, data]);
  useEffect(() => {
    if (!data) return;
    if (dashboardNavLocked(planFeaturesOf(data), activeView, graceSpaceTypesOf(data))) {
      setActiveView("overview");
      persistPlace("overview");
    }
  }, [data, activeView]);
  useEffect(() => {
    document.documentElement.classList.toggle("nav-open", sidebarOpen);
    return () => document.documentElement.classList.remove("nav-open");
  }, [sidebarOpen]);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
  }, [locale]);
  useEffect(() => {
    try {
      const savedLocale = window.localStorage.getItem("wazen-locale");
      if (savedLocale === "ar" || savedLocale === "en") setLocale(savedLocale);
      const savedTheme = window.localStorage.getItem("wazen-theme");
      const nextTheme: ThemeMode = savedTheme === "dark" || savedTheme === "light"
        ? savedTheme
        : (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
      setTheme(nextTheme);
      document.documentElement.dataset.theme = nextTheme;
      const savedAccent = window.localStorage.getItem("wazen-accent");
      const nextAccent: AccentId = isAccentId(savedAccent) ? savedAccent : "emerald";
      setAccent(nextAccent);
      document.documentElement.dataset.accent = nextAccent;
      const urlView = new URLSearchParams(window.location.search).get("view");
      const urlSpace = new URLSearchParams(window.location.search).get("space");
      if (isViewId(urlView)) {
        setActiveView(urlView);
        if (urlSpace) setPickedSpaceId((current) => ({ ...current, [urlView]: urlSpace }));
      } else {
        const storedView = window.localStorage.getItem("wazen-view");
        const storedSpace = window.localStorage.getItem("wazen-space") ?? undefined;
        if (isViewId(storedView)) {
          setActiveView(storedView);
          if (storedSpace) setPickedSpaceId((current) => ({ ...current, [storedView]: storedSpace }));
          const params = new URLSearchParams();
          if (storedView !== "overview") params.set("view", storedView);
          if (storedSpace) params.set("space", storedSpace);
          const qs = params.toString();
          router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
        }
      }
    } catch { /* ignore */ }
  }, [pathname, router]);

  const persistPlace = (view: ViewId, spaceId?: string) => {
    try {
      window.localStorage.setItem("wazen-view", view);
      if (spaceId) window.localStorage.setItem("wazen-space", spaceId);
      else window.localStorage.removeItem("wazen-space");
    } catch { /* ignore */ }
    const params = new URLSearchParams();
    if (view !== "overview") params.set("view", view);
    if (spaceId) params.set("space", spaceId);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const toggleTheme = () => {
    const next: ThemeMode = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try { window.localStorage.setItem("wazen-theme", next); } catch { /* ignore */ }
  };
  const applyAccent = (next: AccentId) => {
    setAccent(next);
    document.documentElement.dataset.accent = next;
    try { window.localStorage.setItem("wazen-accent", next); } catch { /* ignore */ }
  };

  const viewSpaceType: Partial<Record<ViewId, Space["type"]>> = { personal: "personal", household: "household", trip: "trip", society: "society" };
  const spacesForView = (data?.spaces ?? []).filter((space) => {
    const expected = viewSpaceType[activeView];
    if (!expected) return false;
    if (activeView !== "society") return space.type === expected && (showArchived || (space.status ?? "active") !== "archived");
    if (!showArchived && (space.status ?? "active") === "archived") return false;
    if (space.type === "society" || space.type === "group") return true;
    const hasTurns = (data?.circleTurns ?? []).some((turn) => turn.space_id === space.id);
    const looksLikeCircle = /جمعي|circle|association|ros[ck]a/i.test(`${space.name_ar} ${space.name_en}`);
    return hasTurns || looksLikeCircle;
  });
  const walletDefaultType = viewSpaceType[activeView] ?? "personal";

  const totals = useMemo(() => {
    if (!data) return { net: 0, groups: 0, personal: 0, reserves: 0, spend: 0, income: 0, remaining: 0 };
    const spaces = data.spaces ?? [];
    const members = data.members ?? [];
    const transactions = data.transactions ?? [];
    const net = spaces.reduce((sum, item) => sum + item.balance_minor, 0);
    const groups = spaces.filter((item) => ["trip", "society", "group", "household"].includes(item.type)).reduce((sum, item) => sum + item.balance_minor, 0);
    const personal = spaces.filter((item) => item.type === "personal").reduce((sum, item) => sum + item.balance_minor, 0);
    const reserves = members.reduce((sum, member) => sum + member.extra_minor, 0);
    const spend = transactions.filter((item) => item.kind === "expense").reduce((sum, item) => sum + item.amount_minor, 0);
    const income = transactions.filter((item) => ["income", "contribution"].includes(item.kind)).reduce((sum, item) => sum + item.amount_minor, 0);
    return { net, groups, personal, reserves, spend, income, remaining: income - spend };
  }, [data]);

  const flash = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2800);
  };
  const logout = async () => {
    await completeClientLogout();
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

  const changeView = (view: ViewId, spaceId?: string) => {
    const features = planFeaturesOf(data);
    if (dashboardNavLocked(features, view, graceSpaceTypesOf(data))) {
      showUpgradeNotice(view, t[view]);
      return;
    }
    startTransition(() => {
      setActiveView(view);
      setSidebarOpen(false);
      if (spaceId) setPickedSpaceId((current) => ({ ...current, [view]: spaceId }));
    });
    persistPlace(view, spaceId ?? pickedSpaceId[view]);
  };

  if (loading && !data) return <LoadingScreen locale={locale} />;
  if (error || !data) return <ErrorScreen message={t.error} retry={load} />;

  const activeSpace = spacesForView.find((space) => space.id === pickedSpaceId[activeView]) ?? spacesForView[0];
  const planFeatures = planFeaturesOf(data);
  const graceTypes = graceSpaceTypesOf(data);
  const viewLocked = dashboardNavLocked(planFeatures, activeView, graceTypes);
  const canCreateCurrentType = planAllowsSpaceType(planFeatures, walletDefaultType);
  const retentionNotice = data.entitlements?.retention
    ? userGraceWarningCopy(locale, data.entitlements.retention.graceEndsAt, data.entitlements.retention.spaceCount)
    : null;
  const openNewWallet = () => {
    if (!canCreateCurrentType) {
      showUpgradeNotice(activeView === "overview" ? "personal" : activeView, t[activeView === "overview" ? "personal" : activeView]);
      return;
    }
    setModal("wallet");
  };
  const addWalletLabel = activeView === "society"
    ? (locale === "ar" ? "إضافة جمعية" : "Add circle")
    : activeView === "household"
      ? (locale === "ar" ? "إضافة محفظة منزل" : "Add household wallet")
      : activeView === "trip"
        ? (locale === "ar" ? "إضافة محفظة سفر" : "Add trip wallet")
        : (locale === "ar" ? "إضافة محفظة" : "Add wallet");

  return (
    <div className="app-shell">
      <Sidebar locale={locale} active={activeView} open={sidebarOpen} entitlements={data.entitlements} role={data.user.role} onNavigate={changeView} onLocked={(id) => showUpgradeNotice(id, id === "documents" ? (locale === "ar" ? "الإيصالات والكشوفات" : "Documents & statements") : t[id])} onClose={() => setSidebarOpen(false)} onLogout={() => void logout()} />

      <main className="main-shell">
        <header className="topbar">
          <div className="topbar-title">
            <button type="button" className="mobile-menu" onClick={() => setSidebarOpen(true)} aria-label={locale === "ar" ? "فتح القائمة" : "Open menu"} aria-expanded={sidebarOpen}><Menu size={22} /></button>
            <div>
              <p className="eyebrow">{t.greeting}، {data.user.displayName.split(" ")[0]} 👋</p>
              <h1>{t[activeView]}</h1>
            </div>
          </div>
          <div className="topbar-actions">
            <Link className="secondary-button topbar-home" href="/home">{locale === "ar" ? "الرئيسية" : "Home"}</Link>
            <button className="language-button" onClick={() => { const next = locale === "ar" ? "en" : "ar"; setLocale(next); try { window.localStorage.setItem("wazen-locale", next); } catch { /* ignore */ } }} aria-label="Change language">
              <Globe2 size={17} /><span>{locale === "ar" ? "EN" : "عربي"}</span>
            </button>
            <button type="button" className="icon-button" onClick={toggleTheme} aria-label={theme === "dark" ? (locale === "ar" ? "النهار" : "Light mode") : (locale === "ar" ? "الليل" : "Dark mode")} title={theme === "dark" ? (locale === "ar" ? "النهار" : "Day") : (locale === "ar" ? "الليل" : "Night")}>
              {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <AccentPicker locale={locale} accent={accent} onPick={applyAccent} />
            <NotificationBell data={data} locale={locale} onOpen={(view, spaceId) => {
              if (dashboardNavLocked(planFeatures, view, graceTypes)) {
                showUpgradeNotice(view, t[view]);
                return;
              }
              changeView(view, spaceId);
            }} />
            <BhdAppSwitcher
              user={{ name: data.user.displayName, email: data.user.email, picture: data.user.avatarUrl ?? null }}
              onSignOut={() => void logout()}
            />
          </div>
        </header>

        {retentionNotice ? (
          <div className="retention-warning" role="status">
            <div>
              <strong>{retentionNotice.title}</strong>
              <p>{retentionNotice.text}</p>
            </div>
            <a href="/pricing">{locale === "ar" ? "ترقية الباقة" : "Upgrade plan"}</a>
          </div>
        ) : null}

        {data.entitlements?.warnings?.length ? (
          <div className="quota-warning" role="status">
            <div>
              {data.entitlements.warnings.map((item) => (
                <p key={item.kind}>{quotaWarningCopy(item.kind, item.used, item.limit, locale)}</p>
              ))}
            </div>
            <a href="/pricing">{locale === "ar" ? "ترقية الباقة" : "Upgrade plan"}</a>
          </div>
        ) : null}

        <div className="page-content">
          {activeView === "overview" && (
            <Overview data={data} locale={locale} totals={totals} onView={changeView} onAddWallet={openNewWallet} onTxnChanged={(next) => { setData({ ...data, ...next }); flash(locale === "ar" ? "تم تحديث العملية" : "Transaction updated"); }} />
          )}
          {viewSpaceType[activeView] && viewLocked && (
            <UpgradeGate
              locale={locale}
              title={locale === "ar" ? "هذه المحفظة تستدعي ترقية الباقة" : "This wallet type needs a plan upgrade"}
              text={locale === "ar" ? "باقتك الحالية لا تشمل هذا النوع. رقِّ الباقة لتفعيله مع بقية الخصائص." : "Your current plan does not include this wallet type. Upgrade to unlock it with the rest of the features."}
            />
          )}
          {viewSpaceType[activeView] && !viewLocked && (
            <>
              <div className="space-switcher">
                {spacesForView.map((space) => (
                  <button key={space.id} type="button" className={activeSpace?.id === space.id ? "active" : ""} onClick={() => { setPickedSpaceId((current) => ({ ...current, [activeView]: space.id })); persistPlace(activeView, space.id); }}>{nameOf(space, locale)}{(space.status ?? "active") === "archived" ? (locale === "ar" ? " · مؤرشفة" : " · archived") : ""}</button>
                ))}
                <button type="button" onClick={() => setShowArchived((current) => !current)}>{showArchived ? (locale === "ar" ? "إخفاء المؤرشف" : "Hide archived") : (locale === "ar" ? "عرض المؤرشف" : "Show archived")}</button>
                <button type="button" className={!canCreateCurrentType ? "is-plan-locked" : ""} onClick={openNewWallet}>
                  {canCreateCurrentType ? <Plus size={16} /> : <Lock size={16} />}
                  {canCreateCurrentType ? addWalletLabel : (locale === "ar" ? "ترقية لإضافة محفظة" : "Upgrade to add")}
                  {!canCreateCurrentType && <PlanLockBadge locale={locale} />}
                </button>
              </div>
              {!activeSpace && (
                <article className="panel"><div className="empty-state"><WalletCards size={28} /><strong>{addWalletLabel}</strong><p>{activeView === "society" ? (locale === "ar" ? "لا توجد جمعية بعد. أنشئ جمعية جديدة لإدارة الأقساط والأدوار والأعضاء." : "No savings circle yet. Create one to manage dues, turns, and members.") : (locale === "ar" ? "لا توجد محفظة في هذا القسم بعد." : "No wallet in this section yet.")}</p><button className="primary-button" onClick={openNewWallet}>{canCreateCurrentType ? <Plus size={16} /> : <Lock size={16} />}{canCreateCurrentType ? addWalletLabel : (locale === "ar" ? "ترقية الباقة" : "Upgrade plan")}</button></div></article>
              )}
            </>
          )}
          {activeSpace && !viewLocked && (
            <SpaceDetail space={activeSpace} data={data} locale={locale} onAdd={() => setModal("transaction")} onInvite={() => setModal("invite")} onEditWallet={() => setModal("editWallet")} onArchiveWallet={() => {
              const archived = (activeSpace.status ?? "active") === "archived";
              if (!window.confirm(archived ? (locale === "ar" ? "إلغاء أرشفة هذه الجمعية وإعادتها للقائمة؟" : "Unarchive this association?") : (locale === "ar" ? "أرشفة هذه الجمعية؟ تختفي من القائمة ويمكن استعادتها من «عرض المؤرشف»." : "Archive this association? It leaves the list until you show archived wallets."))) return;
              void apiFetch("/api/dashboard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "archiveWallet", idempotencyKey: crypto.randomUUID(), spaceId: activeSpace.id, archived: !archived }) }).then(async (response) => {
                const result = await response.json() as Partial<DashboardData> & { error?: string };
                if (!response.ok) throw new Error(dashboardError(result.error ?? "ARCHIVE_FAILED", locale));
                setData({ ...data, ...result });
                flash(archived ? (locale === "ar" ? "أُعيدت الجمعية من الأرشيف" : "Association restored") : (locale === "ar" ? "أُرشفت الجمعية" : "Association archived"));
              }).catch((error: unknown) => window.alert(error instanceof Error ? error.message : "ARCHIVE_FAILED"));
            }} onTripExpense={() => { setEditingExpenseId(""); setModal("tripExpense"); }} onEditExpense={(expenseId) => { setEditingExpenseId(expenseId); setModal("tripExpense"); }} onCircleOrder={() => { if (!planHasFeature(planFeatures, "draws")) { showUpgradeNotice("draws", locale === "ar" ? "ترتيب الأدوار" : "Turn order"); return; } setModal("circleOrder"); }} onClonePeriod={() => setModal("clonePeriod")} onReopenPeriod={(periodId) => { if (window.confirm(locale === "ar" ? "إعادة فتح الفترة للتعديل؟ ستُسجَّل باسمك كل عملية فتح أو تعديل لاحقة." : "Reopen this period for corrections? Every reopen and later edit will be logged under your name.")) void apiFetch("/api/dashboard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "reopenAccountingPeriod", idempotencyKey: crypto.randomUUID(), spaceId: activeSpace.id, periodId }) }).then(async (response) => { const result = await response.json() as Partial<DashboardData> & { error?: string }; if (!response.ok) throw new Error(result.error ?? "REOPEN_FAILED"); setData({ ...data, ...result }); flash(locale === "ar" ? "أُعيد فتح الفترة. يمكنك التعديل ثم إغلاقها مجدداً." : "Period reopened. You can edit, then close it again."); }).catch((error: unknown) => window.alert(error instanceof Error ? error.message : "REOPEN_FAILED")); }} onClosePeriod={() => { if (window.confirm(locale === "ar" ? "إغلاق الفترة؟ لن يُسمح بذلك إن بقي على الأعضاء اشتراك أو تسويات غير مسدّدة." : "Close the period? This is blocked until every member settles dues and pending shares.")) void apiFetch("/api/dashboard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "closeAccountingPeriod", idempotencyKey: crypto.randomUUID(), spaceId: activeSpace.id }) }).then(async (response) => { const result = await response.json() as Partial<DashboardData> & { error?: string }; if (!response.ok) throw new Error(dashboardError(result.error ?? "CLOSE_FAILED", locale)); setData({ ...data, ...result }); flash(locale === "ar" ? "أُغلقت الفترة المحاسبية. الجمعية مستمرة حتى نهايتها." : "Accounting period closed. The association continues."); }).catch((error: unknown) => window.alert(error instanceof Error ? error.message : dashboardError("CLOSE_FAILED", locale))); }} onSettle={(settlementId) => void settleReimbursement(settlementId)} onCompleteTurn={(turnId) => void completeCircleTurn(turnId)} onOpenMember={(memberId, focus) => { setActiveMemberId(memberId); setMemberLedgerFocus(focus ?? "all"); setModal("memberDetail"); }} onTxnChanged={(next) => { setData({ ...data, ...next }); flash(locale === "ar" ? "تم تحديث العملية" : "Transaction updated"); }} />
          )}
          {activeView === "groups" && (viewLocked
            ? <UpgradeGate locale={locale} title={locale === "ar" ? "الأعضاء يستدعون ترقية الباقة" : "Members need a plan upgrade"} text={locale === "ar" ? "إدارة الأعضاء للجمعيات والمجموعات غير مضمّنة في باقتك الحالية." : "Member management for circles and groups is not included in your current plan."} />
            : <MembersView data={data} locale={locale} onInvite={() => setModal("invite")} onOpenPerson={(memberId, focus) => { setActiveMemberId(memberId); setMemberLedgerFocus(focus ?? "all"); setModal("memberProfile"); }} onSmartPay={(memberId) => { if (!planHasFeature(planFeatures, "smart_accountant")) { showUpgradeNotice("smart_accountant", locale === "ar" ? "المحاسب الذكي" : "Smart accountant"); return; } setActiveMemberId(memberId); setModal("smartPay"); }} />)}
          {activeView === "transactions" && <TransactionsView data={data} locale={locale} onChanged={(next) => { setData({ ...data, ...next }); flash(locale === "ar" ? "تم تحديث العملية" : "Transaction updated"); }} />}
          {activeView === "reports" && (viewLocked
            ? <UpgradeGate locale={locale} title={locale === "ar" ? "التقارير تستدعي ترقية الباقة" : "Reports need a plan upgrade"} text={locale === "ar" ? "التقارير التفصيلية والتصدير غير مضمّنة في باقتك. رقِّ الباقة لتفعيلها." : "Advanced reports and exports are not on your plan. Upgrade to unlock them."} />
            : <ReportsPanel data={data} locale={locale} totals={totals} />)}
          {activeView === "settings" && <SettingsView user={data.user} locale={locale} entitlements={data.entitlements} onLogout={() => void logout()} onSaved={(next) => { setData({ ...data, ...next }); flash(locale === "ar" ? "تم حفظ بيانات الحساب" : "Profile saved"); }} />}
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
      {modal === "editWallet" && activeSpace && (
        <WalletModal data={data} locale={locale} existing={activeSpace} defaultType={activeSpace.type} lockType onClose={() => setModal(null)} onLiveData={(next) => setData({ ...data, ...next })} onDeleted={(next) => { setData({ ...data, ...next }); setModal(null); flash(locale === "ar" ? "حُذفت المحفظة" : "Wallet deleted"); }} onSaved={(next) => {
          setData({ ...data, ...next });
          setModal(null);
          flash(activeSpace.type === "personal" ? (locale === "ar" ? "تم حفظ ضبط المحفظة" : "Wallet setup saved") : (locale === "ar" ? "تم تحديث بيانات الجمعية" : "Association details updated"));
        }} />
      )}
      {modal === "invite" && <InviteModal data={data} locale={locale} preferredSpaceId={activeSpace?.id} onClose={() => setModal(null)} onDone={(message) => { setModal(null); flash(message); void load(); }} />}
      {modal === "tripExpense" && <TripExpenseModal data={data} locale={locale} preferredSpaceId={activeSpace?.id} expenseId={editingExpenseId || undefined} onClose={() => { setModal(null); setEditingExpenseId(""); }} onSaved={(next) => { setData({ ...data, ...next }); setModal(null); setEditingExpenseId(""); flash(locale === "ar" ? "تم حفظ المصروف وتحديث الحصص" : "Expense saved and shares updated"); }} />}
      {modal === "circleOrder" && activeSpace && <CircleOrderModal data={data} locale={locale} spaceId={activeSpace.id} onClose={() => setModal(null)} onSaved={(next) => { setData({ ...data, ...next }); setModal(null); flash(locale === "ar" ? "تم اعتماد ترتيب الأدوار" : "Turn order saved"); }} />}
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
            issuerName={data.user.displayName}
            focus={memberLedgerFocus}
            transactions={data.transactions}
            settlements={data.settlements}
            tripExpenses={data.tripExpenses}
            expenseSplits={data.expenseSplits}
            onClose={() => setModal(null)}
            onSmartPay={() => {
              if (!planHasFeature(planFeaturesOf(data), "smart_accountant")) { goToPricing(); return; }
              setModal("smartPay");
            }}
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
            issuerName={data.user.displayName}
            focus={memberLedgerFocus}
            transactions={data.transactions}
            settlements={data.settlements}
            tripExpenses={data.tripExpenses}
            expenseSplits={data.expenseSplits}
            onClose={() => setModal(null)}
            onSmartPay={(memberId) => {
              if (!planHasFeature(planFeaturesOf(data), "smart_accountant")) { goToPricing(); return; }
              setActiveMemberId(memberId);
              setModal("smartPay");
            }}
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
            canEmail={planHasFeature(planFeaturesOf(data), "email")}
            canWhatsapp={planHasFeature(planFeaturesOf(data), "whatsapp")}
            onClose={() => setModal(null)}
            onDone={(message) => {
              setModal(null);
              flash(message);
            }}
          />
        );
      })()}
      {toast && <div className="toast"><Check size={17} />{toast}</div>}
      {upgradeNotice && (
        <UpgradeNoticeModal
          locale={locale}
          title={upgradeNotice.title}
          text={upgradeNotice.text}
          onClose={() => setUpgradeNotice(null)}
        />
      )}
      <nav className="mobile-home-dock" aria-label={locale === "ar" ? "التنقل" : "Navigation"}>
        <Link href="/home">
          <House size={20} />
          <span>{locale === "ar" ? "الرئيسية" : "Home"}</span>
        </Link>
        <button type="button" onClick={() => setSidebarOpen(true)}>
          <Menu size={20} />
          <span>{locale === "ar" ? "القائمة" : "Menu"}</span>
        </button>
      </nav>
    </div>
  );
}

function AccentPicker({ locale, accent, onPick }: { locale: Locale; accent: AccentId; onPick: (id: AccentId) => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  return (
    <div className="accent-picker" ref={root}>
      <button type="button" className="icon-button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((current) => !current)} title={locale === "ar" ? "لون الموقع" : "Site color"} aria-label={locale === "ar" ? "اختيار لون الموقع" : "Choose site color"}>
        <Palette size={17} />
      </button>
      {open && (
        <div className="accent-picker-panel" role="menu">
          <strong>{locale === "ar" ? "لون الواجهة" : "Interface color"}</strong>
          <div className="accent-swatches">
            {ACCENTS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="menuitemradio"
                aria-checked={accent === item.id}
                className={accent === item.id ? "active" : ""}
                style={{ background: item.swatch }}
                title={locale === "ar" ? item.labelAr : item.labelEn}
                onClick={() => { onPick(item.id); setOpen(false); }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Sidebar({ locale, active, open, entitlements, role, onNavigate, onLocked, onClose, onLogout }: { locale: Locale; active: ViewId; open: boolean; entitlements?: DashboardData["entitlements"]; role?: string | null; onNavigate: (id: ViewId) => void; onLocked: (id: ViewId | "documents") => void; onClose: () => void; onLogout: () => void }) {
  const t = copy[locale];
  const features = entitlements?.features?.length ? entitlements.features : ["personal"];
  const graceTypes = entitlements?.retention?.spaceTypes ?? [];
  const documentsLocked = !planHasFeature(features, "documents");
  return (
    <>
      {open && <button type="button" className="sidebar-backdrop" onClick={onClose} aria-label={locale === "ar" ? "إغلاق القائمة" : "Close menu"} />}
      <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
        <div className="brand-row">
          <div className="brand-mark"><WazenIcon className="h-10 w-12" /></div>
          <div className="brand-name"><strong>وازن</strong><small>WAZEN</small></div>
          <button className="sidebar-close" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </div>
        <div className="workspace-pill"><div className="workspace-icon"><Landmark size={17} /></div><div><small>{t.workspace}</small><strong>{locale === "ar" ? "الحساب الرئيسي" : "Main account"}</strong></div><ChevronDown size={15} /></div>
        <nav className="sidebar-nav">
          {navItems.map(({ id, icon: Icon }) => {
            const locked = dashboardNavLocked(features, id, graceTypes);
            return (
              <button
                key={id}
                type="button"
                className={`${active === id ? "active" : ""}${locked ? " is-plan-locked" : ""}`}
                aria-label={locked ? `${t[id]} — ${locale === "ar" ? "يحتاج ترقية" : "needs upgrade"}` : t[id]}
                onClick={() => {
                  if (locked) {
                    onLocked(id);
                    return;
                  }
                  onNavigate(id);
                }}
              >
                <Icon size={19} strokeWidth={active === id ? 2.2 : 1.8} /><span>{t[id]}</span>
                {locked && <PlanLockBadge locale={locale} />}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-external">
          <small>{locale === "ar" ? "إدارة الحساب" : "Account management"}</small>
          <Link href="/home" prefetch><House size={18} /><span>{locale === "ar" ? "الرئيسية" : "Home"}</span></Link>
          <Link
            href={documentsLocked ? "/pricing" : "/documents"}
            prefetch
            className={documentsLocked ? "is-plan-locked" : ""}
            onClick={(event) => {
              if (!documentsLocked) return;
              event.preventDefault();
              onLocked("documents");
            }}
          >
            <ReceiptText size={18} /><span>{locale === "ar" ? "الإيصالات والكشوفات" : "Documents & statements"}</span>
            {documentsLocked && <PlanLockBadge locale={locale} />}
          </Link>
          <Link href="/billing" prefetch><CircleDollarSign size={18} /><span>{locale === "ar" ? "الباقة والفوترة" : "Plan & billing"}</span></Link>
          {canOpenPlatformConsole(role) ? <Link href="/admin" prefetch><ShieldCheck size={18} /><span>{locale === "ar" ? "إدارة المنصة" : "Platform admin"}</span></Link> : null}
        </div>
        <div className="sidebar-spacer" />
        <button className={`sidebar-setting ${active === "settings" ? "active" : ""}`} onClick={() => onNavigate("settings")}><Settings size={19} /><span>{t.settings}</span></button>
        <button type="button" className="sidebar-setting sidebar-logout" onClick={onLogout}><LogOut size={19} /><span>{t.logout}</span></button>
        <div className="security-card"><ShieldCheck size={20} /><div><strong>{locale === "ar" ? "بياناتك محمية" : "Your data is protected"}</strong><small>{locale === "ar" ? "تشفير وسجل تدقيق لكل عملية" : "Encryption and an audit trail"}</small></div></div>
      </aside>
    </>
  );
}

function Overview({ data, locale, totals, onView, onAddWallet, onTxnChanged }: { data: DashboardData; locale: Locale; totals: { net: number; groups: number; personal: number; reserves: number; spend: number; income: number; remaining: number }; onView: (id: ViewId) => void; onAddWallet: () => void; onTxnChanged: (next: Partial<DashboardData>) => void }) {
  const t = copy[locale];

  return (
    <div className="dashboard-stack">
      <div className="welcome-line">
        <p>{t.subtitle}</p>
        <div className="date-chip"><CalendarDays size={16} />{new Intl.DateTimeFormat(locale === "ar" ? "ar-AE" : "en-GB", { day: "numeric", month: "long", year: "numeric" }).format(new Date())}</div>
      </div>
      <section className="stat-grid">
        <StatCard icon={<CircleDollarSign />} label={locale === "ar" ? "مجموع الأرصدة (عرض فقط)" : "Sum of balances (display only)"} value={formatMoney(totals.net, "OMR", locale)} accent="navy" note={locale === "ar" ? "كل محفظة منفصلة — لا خلط" : "Each wallet is separate — not pooled"} negative={totals.net < 0} />
        <StatCard icon={<WalletCards />} label={locale === "ar" ? "المحفظة الشخصية" : "Personal wallet"} value={formatMoney(totals.personal, "OMR", locale)} accent="green" note={locale === "ar" ? "بنوكك ونقدك" : "your banks and cash"} negative={totals.personal < 0} />
        <StatCard icon={<Landmark />} label={locale === "ar" ? "أرصدة الجمعيات والسفر" : "Circles and trips"} value={formatMoney(totals.groups, "OMR", locale)} accent="amber" note={locale === "ar" ? "كل جمعية بحسابها" : "each group on its own books"} negative={totals.groups < 0} />
        <StatCard icon={<TrendingDown />} label={locale === "ar" ? "المصروف المسجّل" : "Recorded spend"} value={formatMoney(totals.spend, "OMR", locale)} accent="rose" note={locale === "ar" ? "من القيود المرحلة فقط" : "posted entries only"} />
      </section>

      <section className="wallet-section">
        <div className="section-title"><div><h2>{t.wallets}</h2><p>{locale === "ar" ? "كل محفظة مستقلة: دخلها، مصروفها، والمتبقي فيها" : "Each wallet is independent: its income, spend, and remaining"}</p></div><button className="secondary-button" onClick={onAddWallet}><Plus size={16} />{t.newWallet}</button></div>
        {data.spaces.length ? (
          <div className="wallet-grid">
            {data.spaces.map((space) => <WalletCard key={space.id} space={space} data={data} locale={locale} onOpen={() => onView(space.type === "group" || space.type === "society" || /جمعي|circle|association/i.test(`${space.name_ar} ${space.name_en}`) ? "society" : space.type as ViewId)} />)}
          </div>
        ) : (
          <article className="panel"><div className="empty-state"><WalletCards size={22} /><span>{locale === "ar" ? "ابدأ بإنشاء محفظتك الأولى." : "Start by creating your first wallet."}</span><button className="primary-button" onClick={onAddWallet}><Plus size={16} />{t.newWallet}</button></div></article>
        )}
      </section>

      <section className="lower-grid">
        <RecentTransactions data={data} locale={locale} onView={() => onView("transactions")} onChanged={onTxnChanged} />
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
  const members = data.members.filter((member) => member.space_id === space.id && (member.status ?? "active") === "active").length;
  const ledger = spaceLedger(space, data);
  const flow = spaceMonthlyFlow(space, data);
  const forecast = projectCashflow({ balanceMinor: space.balance_minor, monthlyInflowMinor: flow.inflow, monthlyOutflowMinor: flow.outflow, months: 3 });
  return <button className={`wallet-card accent-${space.accent}`} onClick={onOpen}>
    <div className="wallet-card-top"><span className="wallet-icon"><Icon size={19} /></span><ArrowUpRight size={17} /></div>
    <span className="wallet-type">{typeLabels[locale][space.type as keyof typeof typeLabels.ar] ?? space.type}</span>
    <h3>{nameOf(space, locale)}</h3>
    <strong className={space.balance_minor < 0 ? "amount-negative" : ""}>{formatMoney(space.balance_minor, space.currency, locale)}</strong>
    <div className="wallet-card-metrics">
      <span><small>{locale === "ar" ? "الدخل" : "Income"}</small><b>{formatMoney(ledger.income, space.currency, locale)}</b></span>
      <span><small>{locale === "ar" ? "المصروف" : "Spend"}</small><b className={ledger.spend ? "amount-negative" : ""}>{formatMoney(ledger.spend, space.currency, locale)}</b></span>
      <span><small>{locale === "ar" ? "المتبقي" : "Left"}</small><b className={ledger.remaining < 0 ? "amount-negative" : ""}>{formatMoney(ledger.remaining, space.currency, locale)}</b></span>
    </div>
    <small>{locale === "ar" ? `أعضاء ${space.type === "personal" ? 1 : members} · بعد 3 أشهر ${formatMoney(forecast.endProjectedMinor, space.currency, locale)}${forecast.needsBoost ? " · عجز متوقع" : ""}` : `Members ${space.type === "personal" ? 1 : members} · in 3 months ${formatMoney(forecast.endProjectedMinor, space.currency, locale)}${forecast.needsBoost ? " · shortfall" : ""}`}</small>
  </button>;
}

function TransactionPager({ locale, page, pages, size, total, truncated, onPage, onSize }: { locale: Locale; page: number; pages: number; size: number; total: number; truncated?: boolean; onPage: (page: number) => void; onSize: (size: number) => void }) {
  if (total === 0) return null;
  return (
    <div className="txn-pager">
      <div className="txn-pager-sizes" role="group" aria-label={locale === "ar" ? "عدد العمليات المعروضة" : "Transactions per page"}>
        {TRANSACTION_PAGE_SIZES.map((count) => (
          <button type="button" key={count} className={size === count ? "active" : ""} onClick={() => onSize(count)}>
            {locale === "ar" ? `عرض ${count}` : `Show ${count}`}
          </button>
        ))}
      </div>
      {pages > 1 && (
        <div className="txn-pager-nav">
          <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>{locale === "ar" ? "السابق" : "Previous"}</button>
          <span>{locale === "ar" ? `صفحة ${page} من ${pages}` : `Page ${page} of ${pages}`}</span>
          <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)}>{locale === "ar" ? "التالي" : "Next"}</button>
        </div>
      )}
      {truncated && <small>{locale === "ar" ? "يُعرض أحدث 100 عملية فقط حتى لا يبطؤ النظام." : "Only the latest 100 transactions are loaded so the page stays fast."}</small>}
    </div>
  );
}

function sortTransactionsNewest(rows: Transaction[]) {
  return [...rows].sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime());
}

function RecentTransactions({ data, locale, onView, onChanged }: { data: DashboardData; locale: Locale; onView: () => void; onChanged: (next: Partial<DashboardData>) => void }) {
  const t = copy[locale];
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [working, setWorking] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const paged = useMemo(() => pageTransactions(sortTransactionsNewest(data.transactions), page, pageSize), [data.transactions, page, pageSize]);
  const voidTxn = async (transaction: Transaction) => {
    if (working) return;
    if (!window.confirm(locale === "ar" ? "إلغاء هذه العملية؟ تبقى في السجل بحالة ملغاة ويُعكس أثرها على الرصيد." : "Void this transaction? It stays in the ledger as voided and its balance effect is reversed.")) return;
    setWorking(true);
    try {
      const response = await apiFetch("/api/dashboard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "voidTransaction", idempotencyKey: crypto.randomUUID(), transactionId: transaction.id }) });
      const result = await response.json() as Partial<DashboardData> & { error?: string };
      if (!response.ok) { window.alert(dashboardError(result.error ?? "VOID_FAILED", locale)); return; }
      onChanged(result.spaces ? result : { transactions: data.transactions.map((row) => row.id === transaction.id ? { ...row, status: "voided" } : row) });
    } finally {
      setWorking(false);
    }
  };
  return <FoldWrap id="overview:recent" label={locale === "ar" ? "طي أحدث العمليات" : "Fold recent"}>
    <article className="panel list-panel"><div className="panel-heading"><h2>{t.recent}</h2><button className="text-button" onClick={onView}>{t.viewAll}<ArrowUpRight size={15} /></button></div>
    <div className="transaction-list">{paged.rows.length ? paged.rows.map((transaction) => <TransactionRow key={transaction.id} transaction={transaction} data={data} locale={locale} onEdit={setEditing} onVoid={(txn) => void voidTxn(txn)} />) : <Empty locale={locale} />}</div>
    <TransactionPager locale={locale} page={paged.page} pages={paged.pages} size={paged.size} total={paged.total} truncated={paged.truncated} onPage={setPage} onSize={(next) => { setPageSize(next); setPage(1); }} />
    {editing && <EditTransactionModal data={data} locale={locale} transaction={editing} onClose={() => setEditing(null)} onSaved={(next) => { onChanged(next); setEditing(null); }} />}
  </article></FoldWrap>;
}

function TransactionRow({ transaction, data, locale, onEdit, onVoid }: { transaction: Transaction; data: DashboardData; locale: Locale; onEdit?: (txn: Transaction) => void; onVoid?: (txn: Transaction) => void }) {
  const positive = ["income", "contribution"].includes(transaction.kind);
  const Icon = transaction.kind === "expense" ? ArrowUpRight : transaction.kind === "reimbursement" ? HandCoins : ArrowDownLeft;
  const space = data.spaces.find((item) => item.id === transaction.space_id);
  const member = data.members.find((item) => item.id === transaction.member_id);
  const locked = isPeriodLocked((data.periods ?? []).filter((period) => period.space_id === transaction.space_id), transaction.occurred_at);
  return <div className={`transaction-row${isLiveTransaction(transaction) ? "" : " is-inactive"}`}>
    <div className={`transaction-icon ${transaction.kind}`}><Icon size={17} /></div>
    <div className="transaction-main">
      <strong>{transactionName(transaction, locale)}</strong>
      <span>{space ? nameOf(space, locale) : "—"}{member ? ` · ${member.display_name}` : ""} · {new Intl.DateTimeFormat(locale === "ar" ? "ar-OM" : "en-GB", { day: "numeric", month: "short" }).format(new Date(transaction.occurred_at))} · {transactionStatusLabel(transaction.status, locale)}{locked ? (locale === "ar" ? " · الفترة مغلقة" : " · period closed") : ""}</span>
    </div>
    <strong className={positive ? "amount-positive" : "amount-negative"}>{positive ? "+" : "−"}{formatMoney(transaction.amount_minor, space?.currency ?? "OMR", locale)}</strong>
    <div className="transaction-actions">
      <button type="button" title={locale === "ar" ? "إيصال" : "Receipt"} onClick={() => openTransactionReceipt(transaction, data, locale)}><Printer size={15} /></button>
      <button type="button" className={planHasFeature(planFeaturesOf(data), "whatsapp") ? "" : "is-plan-locked"} title="WhatsApp" onClick={() => { void shareTransactionWhatsApp(transaction, data, locale); }}><MessageCircle size={15} />{planHasFeature(planFeaturesOf(data), "whatsapp") ? null : <PlanLockBadge locale={locale} />}</button>
      {onEdit && !locked && isLiveTransaction(transaction) && <button type="button" title={locale === "ar" ? "تعديل" : "Edit"} onClick={() => onEdit(transaction)}><Pencil size={15} /></button>}
      {onVoid && !locked && isLiveTransaction(transaction) && <button type="button" className="danger" title={locale === "ar" ? "إلغاء" : "Void"} onClick={() => onVoid(transaction)}><Trash2 size={15} /></button>}
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
    <FoldWrap id="overview:obligations" label={locale === "ar" ? "طي الالتزامات" : "Fold obligations"}>
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
    </FoldWrap>
  );
}

function SpaceDetail({ space, data, locale, onAdd, onInvite, onEditWallet, onArchiveWallet, onTripExpense, onEditExpense, onCircleOrder, onClonePeriod, onClosePeriod, onReopenPeriod, onSettle, onCompleteTurn, onTxnChanged, onOpenMember }: { space: Space; data: DashboardData; locale: Locale; onAdd: () => void; onInvite: () => void; onEditWallet: () => void; onArchiveWallet: () => void; onTripExpense: () => void; onEditExpense: (expenseId: string) => void; onCircleOrder: () => void; onClonePeriod: () => void; onClosePeriod: () => void; onReopenPeriod: (periodId: string) => void; onSettle: (settlementId: string) => void; onCompleteTurn: (turnId: string) => void; onTxnChanged: (next: Partial<DashboardData>) => void; onOpenMember: (memberId: string, focus?: MemberLedgerFocus) => void }) {
  const t = copy[locale];
  const members = data.members.filter((member) => member.space_id === space.id);
  const transactions = data.transactions.filter((transaction) => transaction.space_id === space.id);
  const goal = spaceGoalMinor(space, data);
  const progress = goal ? Math.max(0, Math.min(100, Math.round((space.balance_minor / goal) * 100))) : 0;
  const nextCircleTurn = data.circleTurns.find((turn) => turn.space_id === space.id && turn.status === "scheduled");
  const paidTotal = members.reduce((sum, member) => sum + member.paid_minor, 0);
  const liveTransactions = transactions.filter(isLiveTransaction);
  const spentTotal = liveTransactions.filter((txn) => txn.kind === "expense").reduce((sum, txn) => sum + txn.amount_minor, 0);
  const incomeTotal = liveTransactions.filter((txn) => ["income", "contribution"].includes(txn.kind)).reduce((sum, txn) => sum + txn.amount_minor, 0);
  const remainingTotal = incomeTotal - spentTotal;
  const closedBudgets = (data.periods ?? []).filter((period) => period.space_id === space.id && period.status === "closed").length;
  const pendingSettlements = data.settlements.filter((item) => item.space_id === space.id && item.status === "pending").length;
  const currentPeriod = (data.periods ?? []).filter((period) => period.space_id === space.id).sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime())[0];
  const dateLocale = locale === "ar" ? "ar-OM" : "en-GB";
  const formatDay = (value?: string | null) => {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString(dateLocale);
  };
  const periodLabel = !currentPeriod
    ? (locale === "ar" ? "لا فترة" : "None")
    : currentPeriod.status === "closed"
      ? (locale === "ar" ? "مغلقة" : "Closed")
      : currentPeriod.status === "reopened"
        ? (locale === "ar" ? "مفتوحة للتعديل" : "Reopened")
        : (locale === "ar" ? "مفتوحة" : "Open");
  return <div className="dashboard-stack">
    <div className="space-toolbar">
      <button
        type="button"
        className={planAllowsStatements(planFeaturesOf(data)) ? "" : "is-plan-locked"}
        onClick={() => {
          if (!planAllowsStatements(planFeaturesOf(data))) { goToPricing(); return; }
          printSpaceStatement(space, data, locale);
        }}
      >
        <Printer size={16} />{locale === "ar" ? "كشف حساب" : "Statement"}
        {planAllowsStatements(planFeaturesOf(data)) ? null : <PlanLockBadge locale={locale} />}
      </button>
      <button type="button" onClick={onAdd}><Plus size={16} />{t.add}</button>
      {["trip", "society", "group"].includes(space.type) && <button type="button" onClick={onInvite}><UserPlus size={16} />{t.invite}</button>}
      <button type="button" onClick={onEditWallet}><Pencil size={16} />{locale === "ar" ? "ضبط المحفظة" : "Wallet setup"}</button>
      <button type="button" onClick={onArchiveWallet}><Archive size={16} />{(space.status ?? "active") === "archived" ? (locale === "ar" ? "استعادة" : "Restore") : (locale === "ar" ? "أرشفة" : "Archive")}</button>
    </div>
    <FoldWrap id={`${space.id}:hero`} label={locale === "ar" ? "طي رأس المحفظة" : "Fold wallet header"}>
    <section className={`space-hero accent-${space.accent}`}>
      <div className="space-hero-top">
        <div>
          <span className="space-hero-kicker">{typeLabels[locale][space.type as keyof typeof typeLabels.ar]}{(space.status ?? "active") === "archived" ? (locale === "ar" ? " · مؤرشفة" : " · archived") : ""}</span>
          <h2>{nameOf(space, locale)}</h2>
          <p>{space.type === "personal" ? (locale === "ar" ? "دخل، مصروف، ميزانيات وأهداف في مكان واحد" : "Income, spending, budgets and goals in one place") : (locale === "ar" ? "حسابات واضحة ومفصولة لكل فرد" : "Clear, separated balances for every member")}</p>
        </div>
        <div className="space-hero-balance"><span>{locale === "ar" ? "الرصيد المتاح" : "Available balance"}</span><strong className={space.balance_minor < 0 ? "amount-negative" : ""}>{formatMoney(space.balance_minor, space.currency, locale)}</strong></div>
      </div>
      <div className="space-hero-facts">
        <div className="space-hero-facts-row">
          <div className="hero-fact-sky"><i><CalendarDays size={16} /></i><div><small>{locale === "ar" ? "تاريخ الإنشاء" : "Created"}</small><b>{formatDay(space.created_at)}</b></div></div>
          <div className="hero-fact-mint"><i><CalendarDays size={16} /></i><div><small>{locale === "ar" ? "تاريخ البداية" : "Start date"}</small><b>{formatDay(space.starts_at)}</b></div></div>
          <div className="hero-fact-violet"><i><Users size={16} /></i><div><small>{locale === "ar" ? "عدد الأعضاء" : "Members"}</small><b>{members.filter((member) => (member.status ?? "active") === "active").length}</b></div></div>
          <div className="hero-fact-gold"><i><HandCoins size={16} /></i><div><small>{locale === "ar" ? "إجمالي المدفوع" : "Total paid"}</small><b>{formatMoney(paidTotal, space.currency, locale)}</b></div></div>
          <div className="hero-fact-rose"><i><TrendingDown size={16} /></i><div><small>{locale === "ar" ? "المبلغ المصروف" : "Spent"}</small><b>{formatMoney(spentTotal, space.currency, locale)}</b></div></div>
        </div>
        <div className="space-hero-facts-row">
          <div className="hero-fact-navy"><i><Landmark size={16} /></i><div><small>{locale === "ar" ? "إغلاق الميزانية" : "Budget closures"}</small><b>{closedBudgets}</b></div></div>
          <div className="hero-fact-lime"><i><Target size={16} /></i><div><small>{locale === "ar" ? "الهدف المالي" : "Goal"}</small><b>{goal ? formatMoney(goal, space.currency, locale) : "—"}</b></div></div>
          <div className="hero-fact-coral"><i><CircleDollarSign size={16} /></i><div><small>{locale === "ar" ? "تسويات معلّقة" : "Pending settlements"}</small><b>{pendingSettlements}</b></div></div>
          <div className="hero-fact-teal"><i><Clock3 size={16} /></i><div><small>{locale === "ar" ? "الفترة الحالية" : "Current period"}</small><b>{periodLabel}</b></div></div>
        </div>
      </div>
    </section>
    </FoldWrap>
    <FoldWrap id={`${space.id}:stats`} title={locale === "ar" ? "ملخص المحفظة" : "Wallet summary"} label={locale === "ar" ? "طي الملخص" : "Fold summary"}>
    <section className="stat-grid compact">
      <StatCard icon={<TrendingUp />} label={locale === "ar" ? "إجمالي الدخل" : "Total income"} value={formatMoney(incomeTotal, space.currency, locale)} accent="green" note={locale === "ar" ? "رواتب ومساهمات مرحلة" : "posted income and contributions"} />
      <StatCard icon={<TrendingDown />} label={locale === "ar" ? "إجمالي المصروف" : "Total spend"} value={formatMoney(spentTotal, space.currency, locale)} accent="rose" note={locale === "ar" ? "مصروفات مرحلة فقط" : "posted expenses only"} />
      <StatCard icon={<CircleDollarSign />} label={locale === "ar" ? "المتبقي في هذه المحفظة" : "Remaining in this wallet"} value={formatMoney(remainingTotal, space.currency, locale)} accent="navy" note={locale === "ar" ? "دخل هذه المحفظة − صرفها" : "this wallet’s income − spend"} negative={remainingTotal < 0} positive={remainingTotal > 0} />
      <StatCard icon={<WalletCards />} label={locale === "ar" ? "الرصيد المتاح" : "Available"} value={formatMoney(space.balance_minor, space.currency, locale)} accent="amber" note={locale === "ar" ? "نقد هذه المحفظة فقط" : "this wallet’s cash only"} negative={space.balance_minor < 0} />
    </section>
    </FoldWrap>
    {(() => {
      const flow = spaceMonthlyFlow(space, data);
      return <WalletForecastPanel locale={locale} currency={space.currency} balanceMinor={space.balance_minor} monthlyInflowMinor={flow.inflow} monthlyOutflowMinor={flow.outflow} remainingInflowMinor={flow.remainingIn} remainingOutflowMinor={flow.remainingOut} foldId={`${space.id}:forecast`} />;
    })()}
    {space.type === "personal" && (
      <PersonalWalletPanel
        spaceId={space.id}
        locale={locale}
        accounts={data.personalAccounts ?? []}
        rules={data.personalRules ?? []}
        occurrences={data.personalOccurrences ?? []}
        transactions={data.transactions}
        spaces={data.spaces}
        spaceLinks={data.spaceLinks ?? []}
        spaceBankLinks={data.spaceBankLinks ?? []}
        members={data.members}
        issuerName={data.user.displayName}
        onChanged={(next) => onTxnChanged(next as Partial<DashboardData>)}
      />
    )}
    {space.type === "household" && (
      <HouseholdFamilyPanel
        spaceId={space.id}
        locale={locale}
        currency={space.currency}
        balanceMinor={space.balance_minor}
        incomeMinor={transactions.filter((txn) => ["income", "contribution"].includes(txn.kind)).reduce((sum, txn) => sum + txn.amount_minor, 0)}
        spendMinor={spentTotal}
        members={members}
        payout={(data.payoutAccounts ?? []).find((item) => item.space_id === space.id)}
        events={data.familyEvents ?? []}
        onChanged={(next) => onTxnChanged(next as Partial<DashboardData>)}
      />
    )}
    {goal > 0 && space.type !== "personal" && <FoldWrap id={`${space.id}:goal`}><article className="panel goal-wide"><div className="panel-heading"><div><span className="section-kicker"><Target size={15} />{locale === "ar" ? "تقدم الهدف" : "Goal progress"}</span><h2>{nameOf(space, locale)}</h2></div><strong>{progress}%</strong></div><div className="progress-track tall"><span style={{ width: `${progress}%` }} /></div><div className="goal-wide-values"><span className={space.balance_minor < 0 ? "amount-negative" : ""}>{formatMoney(space.balance_minor, space.currency, locale)}</span><span>{formatMoney(goal, space.currency, locale)}</span></div></article></FoldWrap>}
    {members.length > 0 && space.type !== "personal" && <FoldWrap id={`${space.id}:members`}><MembersTable members={members} locale={locale} currency={space.currency} data={data} spaceId={space.id} onOpenMember={onOpenMember} /></FoldWrap>}
    {["household", "trip", "society", "group"].includes(space.type) && <FoldWrap id={`${space.id}:expenses`}><article className="panel workflow-panel"><div className="panel-heading"><div><span className="section-kicker"><Plane size={15} />{locale === "ar" ? "المصروفات والتسويات" : "Expenses & settlements"}</span><h2>{locale === "ar" ? "من أي حساب دُفع؟ وما له / عليه" : "Paid-from account and balances"}</h2></div><div className="section-title-actions"><button type="button" className="secondary-button" onClick={() => { if (window.confirm(locale === "ar" ? "إعادة تقسيم كل المصروفات بالتساوي على الأعضاء الحاليين بمن فيهم الجدد؟" : "Re-split every expense equally across current members, including new ones?")) void apiFetch("/api/dashboard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "resplitTripExpenses", idempotencyKey: crypto.randomUUID(), spaceId: space.id }) }).then(async (response) => { const result = await response.json() as Partial<DashboardData> & { error?: string }; if (!response.ok) throw new Error(result.error ?? "RESPLIT_FAILED"); onTxnChanged(result); }).catch((error: unknown) => window.alert(error instanceof Error ? error.message : "RESPLIT_FAILED")); }}><Users size={15} />{locale === "ar" ? "تقسيم الكل بالتساوي" : "Split all equally"}</button><button className="primary-button" onClick={onTripExpense}><Plus size={15} />{locale === "ar" ? "مصروف جماعي" : "Group expense"}</button></div></div><div className="transaction-list">{data.tripExpenses.filter((expense) => expense.space_id === space.id).map((expense) => <div className="trip-expense-row" key={expense.id}><div className="transaction-row"><div className="transaction-icon reimbursement"><HandCoins size={17} /></div><div className="transaction-main"><strong>{expense.description}</strong><span>{locale === "ar" ? (expense.paid_from === "common_fund" ? "دُفع من صندوق الجمعية" : `دفع بواسطة ${expense.paid_by_name}`) : (expense.paid_from === "common_fund" ? "Paid from association fund" : `Paid by ${expense.paid_by_name}`)}</span></div><strong className="amount-negative">{formatMoney(expense.amount_minor, space.currency, locale)}</strong><div className="transaction-actions"><button type="button" title={locale === "ar" ? "تعديل المصروف" : "Edit expense"} aria-label={locale === "ar" ? "تعديل المصروف" : "Edit expense"} onClick={() => onEditExpense(expense.id)}><Pencil size={15} /></button><button type="button" title={locale === "ar" ? "تقسيم بالتساوي على كل الأعضاء" : "Split equally among all members"} aria-label={locale === "ar" ? "تقسيم بالتساوي" : "Split equally"} onClick={() => { if (window.confirm(locale === "ar" ? "تقسيم هذا المصروف بالتساوي على الأعضاء الحاليين بمن فيهم الجدد؟" : "Split this expense equally among current members, including new ones?")) void apiFetch("/api/dashboard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "resplitTripExpenses", idempotencyKey: crypto.randomUUID(), spaceId: space.id, expenseId: expense.id }) }).then(async (response) => { const result = await response.json() as Partial<DashboardData> & { error?: string }; if (!response.ok) throw new Error(result.error ?? "RESPLIT_FAILED"); onTxnChanged(result); }).catch((error: unknown) => window.alert(error instanceof Error ? error.message : "RESPLIT_FAILED")); }}><Users size={15} /></button><button type="button" className="danger" title={locale === "ar" ? "حذف المصروف" : "Delete expense"} aria-label={locale === "ar" ? "حذف المصروف" : "Delete expense"} onClick={() => { if (window.confirm(locale === "ar" ? "حذف هذا المصروف والتسويات المرتبطة به؟" : "Delete this group expense and its settlements?")) void apiFetch("/api/dashboard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "voidTripExpense", idempotencyKey: crypto.randomUUID(), expenseId: expense.id }) }).then(async (response) => { const result = await response.json() as Partial<DashboardData> & { error?: string }; if (!response.ok) throw new Error(result.error ?? "VOID_FAILED"); onTxnChanged(result); }).catch((error: unknown) => window.alert(error instanceof Error ? error.message : "VOID_FAILED")); }}><Trash2 size={15} /></button></div></div><div className="split-chips">{data.expenseSplits.filter((split) => split.expense_id === expense.id).map((split) => <span key={split.id} className={expense.paid_from !== "common_fund" && split.member_id === expense.paid_by_member_id ? "payer-share" : ""}>{split.display_name}: {formatMoney(split.share_minor, space.currency, locale)}{expense.paid_from !== "common_fund" && split.member_id === expense.paid_by_member_id ? (locale === "ar" ? " · حصته" : " · share") : ""}</span>)}</div><p className="expense-split-note">{(() => { const splits = data.expenseSplits.filter((split) => split.expense_id === expense.id); const payerShare = splits.find((split) => split.member_id === expense.paid_by_member_id)?.share_minor ?? 0; const owedToPayer = Math.max(0, expense.amount_minor - payerShare); if (expense.paid_from === "common_fund") return locale === "ar" ? `المبلغ خُصم من صندوق الجمعية. إن صار الرصيد سالباً يُقسَّم العجز مباشرة على الأعضاء المساهمين ويظهر في عمود «عليه».` : `This amount came from the association fund. If the balance goes negative, the deficit is split among contributing members and shown under Owes.`; return locale === "ar" ? `${expense.paid_by_name} دفع ${formatMoney(expense.amount_minor, space.currency, locale)} بالكامل. حصة كل عضو ظاهرة أعلاه. عمود «له» لـ ${expense.paid_by_name} = ما دفعه عن الآخرين (${formatMoney(owedToPayer, space.currency, locale)}) وليس حصته.` : `${expense.paid_by_name} paid ${formatMoney(expense.amount_minor, space.currency, locale)} in full. Each member’s share is shown above. The payer’s credit is what others still owe (${formatMoney(owedToPayer, space.currency, locale)}), not a double share.`; })()}</p></div>)}{!data.tripExpenses.some((expense) => expense.space_id === space.id) && <Empty locale={locale} />}</div>{pendingSettlementsWithCredit(
      data.settlements.filter((item) => item.space_id === space.id && item.status === "pending"),
      new Map(members.map((member) => [member.id, memberPosition(member, data, space.id).cashCredit])),
    ).map((settlement) => {
      const fromFund = String(settlement.from_member_id).startsWith("space:");
      const toFund = String(settlement.to_member_id).startsWith("space:");
      const label = toFund
        ? (locale === "ar" ? `على ${settlement.from_member_name ?? "العضو"} دفع إلى صندوق الجمعية` : `${settlement.from_member_name ?? "Member"} owes the association fund`)
        : fromFund
        ? (locale === "ar" ? `على الصندوق رد مبلغ إلى ${settlement.to_member_name ?? "العضو"}` : `The fund owes ${settlement.to_member_name ?? "the member"}`)
        : (locale === "ar"
          ? `على ${settlement.from_member_name ?? "العضو"} دفع إلى ${settlement.to_member_name ?? "العضو"}`
          : `${settlement.from_member_name ?? "Member"} owes ${settlement.to_member_name ?? "member"}`);
      return <div className="settlement-alert" key={settlement.id}><ShieldCheck size={17} /><span>{label}{settlement.reservedMinor > 0 ? (locale === "ar" ? ` · حُجز ${formatMoney(settlement.reservedMinor, space.currency, locale)} من رصيده` : ` · reserved ${formatMoney(settlement.reservedMinor, space.currency, locale)} from credit`) : ""}</span><b className="claim-stack">{settlement.reservedMinor > 0 && <s className="claim-struck">{formatMoney(settlement.amountMinor, space.currency, locale)}</s>}{formatMoney(settlement.payableMinor, space.currency, locale)}</b><button onClick={() => onSettle(settlement.id)}>{locale === "ar" ? "تم التسوية" : "Mark settled"}</button><button type="button" className="secondary-button compact" onClick={() => { if (window.confirm(locale === "ar" ? "إلغاء هذه التسوية؟" : "Cancel this settlement?")) void apiFetch("/api/dashboard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "voidSettlement", idempotencyKey: crypto.randomUUID(), settlementId: settlement.id }) }).then(async (response) => { const result = await response.json() as Partial<DashboardData> & { error?: string }; if (!response.ok) throw new Error(result.error ?? "VOID_FAILED"); onTxnChanged(result); }).catch((error: unknown) => window.alert(error instanceof Error ? error.message : "VOID_FAILED")); }}>{locale === "ar" ? "حذف" : "Delete"}</button></div>;
    })}</article></FoldWrap>}
    <SpaceTransactionsPanel space={space} data={data} locale={locale} onAdd={onAdd} onTxnChanged={onTxnChanged} />
    {["society", "group"].includes(space.type) && <FoldWrap id={`${space.id}:periods`}><article className="panel workflow-panel"><div className="panel-heading"><div><span className="section-kicker"><Repeat2 size={15} />{locale === "ar" ? "الفترة المحاسبية والأدوار" : "Accounting period & turns"}</span><h2>{locale === "ar" ? "إغلاق الفترة أو فتح سنة جديدة" : "Close the period or open a new year"}</h2></div><div className="section-title-actions"><button type="button" className="secondary-button" onClick={onClosePeriod}>{locale === "ar" ? "إغلاق الفترة" : "Close period"}</button><button type="button" className="primary-button" onClick={onClonePeriod}>{locale === "ar" ? "فتح فترة جديدة / استنساخ" : "New period / clone"}</button><button className="primary-button" onClick={onCircleOrder}><Repeat2 size={15} />{locale === "ar" ? "إعداد الأدوار" : "Configure turns"}{planHasFeature(planFeaturesOf(data), "draws") ? null : <PlanLockBadge locale={locale} />}</button></div></div><p className="modal-note">{locale === "ar" ? "لا تُغلق الفترة حتى يسدّد كل الأعضاء ما عليهم من اشتراك وتسويات. بعد الإغلاق يمكن إعادة الفتح للتعديل مع تسجيل من فتح وما عُدّل." : "Do not close the period until every member has settled dues and pending shares. After closing you can reopen for corrections; who reopened and what changed are logged."}</p><div className="circle-order-list">{(data.periods ?? []).filter((period) => period.space_id === space.id).map((period) => {
      const statusLabel = period.status === "open" ? (locale === "ar" ? "مفتوحة" : "Open") : period.status === "reopened" ? (locale === "ar" ? "مفتوحة للتعديل" : "Reopened") : (locale === "ar" ? "مغلقة" : "Closed");
      const actor = period.status === "closed"
        ? (period.closed_by_name ? (locale === "ar" ? `أغلقها ${period.closed_by_name}` : `Closed by ${period.closed_by_name}`) : "")
        : period.status === "reopened" && period.reopened_by_name
          ? (locale === "ar" ? `فتحها ${period.reopened_by_name}` : `Reopened by ${period.reopened_by_name}`)
          : "";
      return <div key={period.id} className="period-row"><b>{statusLabel}</b><span>{period.label}{actor ? ` · ${actor}` : ""}</span><strong>{new Date(period.starts_at).toLocaleDateString(locale === "ar" ? "ar-OM" : "en-GB")}</strong>{period.status !== "open" && <button type="button" className="period-print" onClick={() => printAccountingPeriod(space, period, data, locale)}><Printer size={14} />{locale === "ar" ? "طباعة" : "Print"}</button>}{period.status === "closed" && <button type="button" className="period-reopen" onClick={() => onReopenPeriod(period.id)}><Unlock size={14} />{locale === "ar" ? "إعادة فتح" : "Reopen"}</button>}</div>;
    })}{data.circleTurns.filter((turn) => turn.space_id === space.id).map((turn) => <div key={turn.id}><b>{turn.turn_number}</b><span>{turn.display_name}</span><strong>{formatMoney(turn.amount_minor, space.currency, locale)}</strong><em>{turn.status}</em>{turn.status === "scheduled" && <button disabled={turn.id !== nextCircleTurn?.id} onClick={() => onCompleteTurn(turn.id)}>{locale === "ar" ? "صرف الدور" : "Pay turn"}</button>}</div>)}{!data.circleTurns.some((turn) => turn.space_id === space.id) && !(data.periods ?? []).some((period) => period.space_id === space.id) && <Empty locale={locale} />}</div>
      {(data.periodEvents ?? []).filter((event) => event.space_id === space.id).length > 0 && <div className="period-event-list"><h3>{locale === "ar" ? "سجل الفتح والتعديلات" : "Reopen and correction log"}</h3>{(data.periodEvents ?? []).filter((event) => event.space_id === space.id).slice(0, 40).map((event) => <p key={event.id}><strong>{event.actor_name || "—"}</strong><span>{new Date(event.created_at).toLocaleString(locale === "ar" ? "ar-OM" : "en-GB")}</span><em>{locale === "ar" ? (event.summary_ar || event.action) : (event.summary_en || event.action)}</em></p>)}</div>}
    </article></FoldWrap>}
  </div>;
}

function MembersView({ data, locale, onInvite, onOpenPerson, onSmartPay }: { data: DashboardData; locale: Locale; onInvite: () => void; onOpenPerson: (memberId: string, focus?: MemberLedgerFocus) => void; onSmartPay: (memberId: string) => void }) {
  const societies = data.spaces.filter((space) => space.type !== "personal");
  const groupMembers = data.members.filter((member) => societies.some((space) => space.id === member.space_id));
  const people = Array.from(new Map(groupMembers.map((member) => {
    const key = personIdentityKey(member);
    return [key, groupMembers.filter((row) => personIdentityKey(row) === key)];
  })).values());
  const t = copy[locale];
  const [query, setQuery] = useState("");
  const visible = people.filter((records) => `${records[0].display_name} ${records[0].email ?? ""} ${records[0].phone ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="dashboard-stack"><div className="section-title"><div><h2>{t.memberProgress}</h2><p>{locale === "ar" ? "اضغط اسم العضو لفتح ملفه: حالته، الجمعيات المرتبطة، تقييم الانضباط، وما عليه وما استلمه." : "Open a member file: status, linked associations, discipline rating, amounts owed and received."}</p></div><div className="section-title-actions"><button className="secondary-button" onClick={() => onSmartPay(groupMembers[0]?.id ?? "")}><Sparkles size={16} />{locale === "ar" ? "المحاسب الذكي" : "Smart accountant"}{planHasFeature(planFeaturesOf(data), "smart_accountant") ? null : <PlanLockBadge locale={locale} />}</button><button className="primary-button" onClick={onInvite}><UserPlus size={17} />{t.invite}</button></div></div>
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
    return <div className="member-row person-row" key={personIdentityKey(person)}><button type="button" className="member-name-hit" onClick={() => onOpenPerson(person.id, "all")}><div className="member-name"><i style={{ background: person.avatar }}>{person.display_name.slice(0, 1)}</i><div><strong>{person.display_name}</strong><span>{person.phone || person.email || (person.role === "owner" ? t.roleOwner : t.roleMember)}</span></div></div></button><span className={`status-pill ${active ? "complete" : "pending"}`}>{active ? <CheckCircle2 size={13} /> : <Clock3 size={13} />}{active ? (locale === "ar" ? "نشط" : "Active") : (locale === "ar" ? "غير نشط" : "Inactive")}</span><strong>{records.length}</strong><strong>{grade} · {rate}%</strong><button type="button" className={`amount-hit ${remaining ? "amount-negative" : "muted-amount"}`} onClick={() => onOpenPerson(person.id, "owes")}>{formatMoney(remaining, currency, locale)}</button><button type="button" className="amount-hit reserve-amount" onClick={() => onOpenPerson(person.id, "credit")}>{formatMoney(paid + extra, currency, locale)}</button></div>;
  })}</div></article>
    <section className="settings-grid"><InfoPanel icon={<ShieldCheck />} title={t.privacy} text={t.privacyText} /><InfoPanel icon={<Users />} title={t.access} text={t.accessText} /></section></div>;
}

function MembersTable({ members, locale, currency, data, spaceId, onWithdraw, onOpenMember }: { members: Member[]; locale: Locale; currency: string; data?: DashboardData; spaceId?: string; onWithdraw?: (memberId: string) => void; onOpenMember?: (memberId: string, focus?: MemberLedgerFocus) => void }) {
  const t = copy[locale];
  const [query, setQuery] = useState(""); const visible = members.filter((member) => `${member.display_name} ${member.email ?? ""} ${member.phone ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  return <article className="panel members-panel"><div className="panel-heading"><h2>{t.members} <span className="count-badge">{members.length}</span></h2><label className="search-field member-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={locale === "ar" ? "ابحث باسم المساهم" : "Search member name"} /></label></div><div className="members-table"><div className="table-head"><span>{locale === "ar" ? "العضو" : "Member"}</span><span>{t.goal}</span><span>{t.paid}</span><span>{locale === "ar" ? "إضافي" : "Extra"}</span><span>{locale === "ar" ? "عليه" : "Owes"}</span><span>{locale === "ar" ? "له" : "Owed"}</span><span>{t.status}</span><span>{locale === "ar" ? "إجراء" : "Action"}</span></div>{visible.map((member) => {
    const pos = memberPosition(member, data, spaceId);
    const debit = pos.debit;
    const credit = pos.credit;
    const open = (focus: MemberLedgerFocus) => onOpenMember?.(member.id, focus);
    return <div className="member-row" key={member.id}><button type="button" className="member-name-hit" onClick={() => open("all")}><div className="member-name"><i style={{ background: member.avatar }}>{member.display_name.slice(0, 1)}</i><div><strong>{member.display_name}</strong><span>{member.phone || member.email || (member.role === "owner" ? t.roleOwner : member.role === "treasurer" ? t.roleTreasurer : t.roleMember)}</span></div></div></button><strong>{formatMoney(personGoalMinor(member), currency, locale)}</strong><button type="button" className="amount-hit" onClick={() => open("paid")}><strong>{formatMoney(member.paid_minor, currency, locale)}</strong></button><button type="button" className="amount-hit" onClick={() => open("spent")}><strong>{formatMoney(Number(member.addon_minor ?? 0), currency, locale)}</strong></button><button type="button" className={`amount-hit ${debit ? "amount-negative" : "muted-amount"}`} onClick={() => open("owes")}><span className="claim-stack"><span>{formatMoney(debit, currency, locale)}</span>{pos.reservedMinor > 0 && <small>{locale === "ar" ? `بعد حجز ${formatMoney(pos.reservedMinor, currency, locale)}` : `after ${formatMoney(pos.reservedMinor, currency, locale)} reserved`}</small>}</span></button><button type="button" className={`amount-hit ${credit ? "reserve-amount" : "muted-amount"}`} onClick={() => open("credit")}><span className="claim-stack"><span>{formatMoney(credit, currency, locale)}</span>{pos.reservedMinor > 0 && <small>{locale === "ar" ? "رصيده محجوز" : "Credit reserved"}</small>}</span></button><span className={`status-pill ${debit ? "pending" : "complete"}`}>{debit ? <Clock3 size={13} /> : <CheckCircle2 size={13} />}{debit ? (locale === "ar" ? "عليه مطالبات" : "Owes") : (credit ? (locale === "ar" ? "له رصيد" : "Credit") : t.paid)}</span><span>{member.extra_minor > 0 && onWithdraw ? <button type="button" className="secondary-button compact" onClick={() => onWithdraw(member.id)}>{locale === "ar" ? "صرف فائض" : "Withdraw"}</button> : "—"}</span></div>;
  })}</div></article>;
}

function TransactionsView({ data, locale, onChanged }: { data: DashboardData; locale: Locale; onChanged: (next: Partial<DashboardData>) => void }) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [working, setWorking] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const t = copy[locale];
  const canExport = planHasFeature(planFeaturesOf(data), "exports");
  const rows = useMemo(() => {
    const filtered = data.transactions.filter((transaction) => transactionName(transaction, locale).toLowerCase().includes(query.toLowerCase()));
    return sortTransactionsNewest(filtered);
  }, [data.transactions, locale, query]);
  const paged = pageTransactions(rows, page, pageSize);
  useEffect(() => { setPage(1); }, [query, pageSize]);
  const voidTxn = async (transaction: Transaction) => {
    if (!window.confirm(locale === "ar" ? "إلغاء هذه العملية؟ تبقى في السجل بحالة ملغاة ويُعكس أثرها على الرصيد." : "Void this transaction? It stays in the ledger as voided and its balance effect is reversed.")) return;
    setWorking(true);
    try {
      const response = await apiFetch("/api/dashboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "voidTransaction", idempotencyKey: crypto.randomUUID(), transactionId: transaction.id }),
      });
      const result = await response.json() as Partial<DashboardData> & { error?: string };
      if (!response.ok) throw new Error(dashboardError(result.error ?? "VOID_FAILED", locale));
      onChanged(result.spaces ? result : { transactions: data.transactions.map((row) => row.id === transaction.id ? { ...row, status: "voided" } : row) });
    } catch (caught) {
      window.alert(caught instanceof Error ? caught.message : "VOID_FAILED");
    } finally {
      setWorking(false);
    }
  };
  return <div className="dashboard-stack">
    <div className="section-title"><div><h2>{t.allTransactions}</h2><p>{locale === "ar" ? "عدّل أو احذف أو أرسل إيصالاً عبر واتساب" : "Edit, void, or share a receipt on WhatsApp"}</p></div>
      <button className={`secondary-button${canExport ? "" : " is-plan-locked"}`} onClick={() => {
        if (!canExport) { goToPricing(); return; }
        const csv = [["date", "description", "kind", "amount_minor"], ...data.transactions.map((row) => [row.occurred_at, transactionName(row, locale), row.kind, String(row.amount_minor)])]
          .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
          .join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "wazen-transactions.csv"; link.click(); URL.revokeObjectURL(link.href);
      }}><Download size={16} />{t.export}{canExport ? null : <PlanLockBadge locale={locale} />}</button>
    </div>
    <article className="panel transaction-table-panel">
      <label className="search-field"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.search} /></label>
      <div className="transaction-list dense">
        {paged.rows.map((transaction) => (
          <TransactionRow key={transaction.id} transaction={transaction} data={data} locale={locale} onEdit={setEditing} onVoid={(txn) => { if (!working) void voidTxn(txn); }} />
        ))}
        {!paged.rows.length && <Empty locale={locale} />}
      </div>
      <TransactionPager locale={locale} page={paged.page} pages={paged.pages} size={paged.size} total={paged.total} truncated={paged.truncated} onPage={setPage} onSize={(next) => { setPageSize(next); setPage(1); }} />
    </article>
    {editing && <EditTransactionModal data={data} locale={locale} transaction={editing} onClose={() => setEditing(null)} onSaved={(next) => { onChanged(next); setEditing(null); }} />}
  </div>;
}

function compressAvatar(file: File) {
  return new Promise<string>((resolve, reject) => {
    if (!/^image\/(jpeg|jpg|png|webp)$/i.test(file.type)) {
      reject(new Error("INVALID_PHOTO"));
      return;
    }
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const max = 320;
      const scale = Math.min(1, max / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("INVALID_PHOTO"));
        return;
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      let quality = 0.82;
      let dataUrl = canvas.toDataURL("image/jpeg", quality);
      while (dataUrl.length > 280_000 && quality > 0.4) {
        quality -= 0.12;
        dataUrl = canvas.toDataURL("image/jpeg", quality);
      }
      if (dataUrl.length > 350_000) reject(new Error("PHOTO_TOO_LARGE"));
      else resolve(dataUrl);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("INVALID_PHOTO"));
    };
    image.src = objectUrl;
  });
}

function PasswordChangeCard({ locale }: { locale: Locale }) {
  const t = copy[locale];
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNext] = useState("");
  const [confirmPassword, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setOk("");
    if (newPassword !== confirmPassword) {
      setError(dashboardError("PASSWORD_MISMATCH", locale));
      return;
    }
    setSaving(true);
    try {
      const response = await apiFetch("/api/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "changePassword", currentPassword, newPassword }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "INVALID_CREDENTIALS");
      setCurrent("");
      setNext("");
      setConfirm("");
      setOk(locale === "ar" ? "تم تغيير كلمة المرور. الجلسات الأخرى أُلغيت." : "Password changed. Other sessions were signed out.");
    } catch (caught) {
      setError(dashboardError(caught instanceof Error ? caught.message : "INVALID_CREDENTIALS", locale));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="panel profile-card" onSubmit={(event) => void submit(event)}>
      <div className="profile-photo">
        <div>
          <strong>{locale === "ar" ? "تغيير كلمة المرور" : "Change password"}</strong>
          <small>{locale === "ar" ? "12 حرفاً على الأقل. التغيير يلغي الجلسات على الأجهزة الأخرى." : "At least 12 characters. This signs out other devices."}</small>
        </div>
      </div>
      <label>
        <span>{locale === "ar" ? "كلمة المرور الحالية" : "Current password"}</span>
        <input type="password" autoComplete="current-password" minLength={12} maxLength={128} required value={currentPassword} onChange={(event) => setCurrent(event.target.value)} />
      </label>
      <label>
        <span>{locale === "ar" ? "كلمة المرور الجديدة" : "New password"}</span>
        <input type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={newPassword} onChange={(event) => setNext(event.target.value)} />
      </label>
      <label>
        <span>{locale === "ar" ? "تأكيد كلمة المرور الجديدة" : "Confirm new password"}</span>
        <input type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={confirmPassword} onChange={(event) => setConfirm(event.target.value)} />
      </label>
      {error ? <p className="modal-error">{error}</p> : null}
      {ok ? <p className="modal-note" role="status">{ok}</p> : null}
      <div className="modal-actions">
        <button className="primary-button" disabled={saving}>{saving ? t.saving : (locale === "ar" ? "تغيير كلمة المرور" : "Change password")}</button>
      </div>
    </form>
  );
}

function SettingsView({ user, locale, entitlements, onLogout, onSaved }: { user: User; locale: Locale; entitlements?: DashboardData["entitlements"]; onLogout: () => void; onSaved: (next: Partial<DashboardData>) => void }) {
  const router = useRouter();
  const t = copy[locale];
  const [displayName, setDisplayName] = useState(user.displayName);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user.avatarUrl ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const features = entitlements?.features?.length ? entitlements.features : ["personal"];
  const canExport = planHasFeature(features, "exports");
  useEffect(() => {
    setDisplayName(user.displayName);
    setAvatarUrl(user.avatarUrl ?? null);
  }, [user.displayName, user.avatarUrl]);
  const exportData = async () => {
    if (!canExport) { goToPricing(); return; }
    const response = await fetch("/api/platform?view=export", { cache: "no-store" });
    if (response.status === 403) { goToPricing(); return; }
    if (!response.ok) return;
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "wazen-data.json";
    link.click();
    URL.revokeObjectURL(url);
  };
  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    try {
      setAvatarUrl(await compressAvatar(file));
    } catch (caught) {
      setError(dashboardError(caught instanceof Error ? caught.message : "INVALID_PHOTO", locale));
    }
  };
  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await apiFetch("/api/dashboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "updateUserProfile", idempotencyKey: crypto.randomUUID(), displayName, avatarUrl }),
      });
      const result = await response.json() as Partial<DashboardData> & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "INVALID_PROFILE");
      onSaved(result);
    } catch (caught) {
      setError(dashboardError(caught instanceof Error ? caught.message : "INVALID_PROFILE", locale));
    } finally {
      setSaving(false);
    }
  };
  return <div className="dashboard-stack">
    <div className="section-title"><div><h2>{t.settings}</h2><p>{locale === "ar" ? "عدّل اسمك وصورتك وكلمة المرور، ثم الخصوصية والصلاحيات" : "Edit your name, photo and password, then privacy and permissions"}</p></div><button className="secondary-button" onClick={onLogout}><LogOut size={16} />{t.logout}</button></div>
    <form className="panel profile-card" onSubmit={saveProfile}>
      <div className="profile-photo">
        <button type="button" className="user-avatar profile-avatar" onClick={() => fileRef.current?.click()} title={locale === "ar" ? "تغيير الصورة" : "Change photo"}>
          {avatarUrl ? <img src={avatarUrl} alt="" /> : displayName.slice(0, 1)}
          <span className="profile-camera"><Camera size={14} /></span>
        </button>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => { void pickPhoto(event.target.files?.[0]); event.target.value = ""; }} />
        <div>
          <strong>{locale === "ar" ? "بيانات الحساب" : "Account profile"}</strong>
          <small>{locale === "ar" ? "الاسم يظهر في التحية والإيصالات. الصورة اختيارية." : "Your name appears in greetings and receipts. Photo is optional."}</small>
          {avatarUrl && <button type="button" className="text-link" onClick={() => setAvatarUrl(null)}>{locale === "ar" ? "إزالة الصورة" : "Remove photo"}</button>}
        </div>
      </div>
      <label><span>{locale === "ar" ? "الاسم" : "Name"}</span><input required minLength={2} maxLength={80} value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
      <label><span>{locale === "ar" ? "البريد" : "Email"}</span><input value={user.email} readOnly disabled /></label>
      {error && <p className="modal-error">{error}</p>}
      <div className="modal-actions"><button className="primary-button" disabled={saving}>{saving ? t.saving : (locale === "ar" ? "حفظ البيانات" : "Save profile")}</button></div>
    </form>
    <PasswordChangeCard locale={locale} />
    <PlanFeaturesPanel locale={locale} entitlements={entitlements} />
    <section className="settings-grid"><InfoPanel locale={locale} icon={<Download />} title={locale === "ar" ? "تنزيل بياناتي" : "Export my data"} text={canExport ? (locale === "ar" ? "نسخة JSON كاملة من محافظك وحركاتك ومستنداتك." : "A complete JSON copy of your wallets, entries and documents.") : (locale === "ar" ? "التصدير يحتاج ترقية الباقة." : "Data export needs a plan upgrade.")} onClick={() => void exportData()} locked={!canExport} /><InfoPanel locale={locale} icon={<ShieldCheck />} title={locale === "ar" ? "أمان الحساب" : "Account security"} text={locale === "ar" ? "كلمة المرور والمصادقة الثنائية ومفاتيح API." : "Password, two-factor authentication and API keys."} onClick={() => router.push("/account/security")} /><InfoPanel locale={locale} icon={<ShieldCheck />} title={t.privacy} text={t.privacyText} onClick={() => router.push("/privacy")} /><InfoPanel locale={locale} icon={<Users />} title={t.access} text={t.accessText} /><InfoPanel locale={locale} icon={<Globe2 />} title={locale === "ar" ? "اللغة والمنطقة" : "Language & region"} text={locale === "ar" ? "العربية، الريال العماني، والمنطقة الزمنية لمسقط." : "English, Omani rial and Muscat time zone."} /><InfoPanel locale={locale} icon={<Bell />} title={locale === "ar" ? "التنبيهات" : "Notifications"} text={locale === "ar" ? "تذكير قبل الاستحقاق، إشعارات الدفع وطلبات الاسترداد." : "Due reminders, payment updates and withdrawal requests."} /></section>
  </div>;
}

function PlanFeaturesPanel({ locale, entitlements }: { locale: Locale; entitlements?: DashboardData["entitlements"] }) {
  const features = entitlements?.features?.length ? entitlements.features : ["personal"];
  const quotas = [
    { ar: "المحافظ", en: "Wallets", value: entitlements?.walletLimit ?? 1 },
    { ar: "الأعضاء لكل محفظة", en: "Members per wallet", value: entitlements?.memberLimit ?? 2 },
    { ar: "المستخدمون", en: "Users", value: entitlements?.userLimit ?? 1 },
    { ar: "المعاملات الإجمالية", en: "Transactions", value: entitlements?.transactionLimit ?? 0 },
    { ar: "المعاملات اليومية", en: "Daily transactions", value: entitlements?.dailyTransactionLimit ?? 0 },
    { ar: "المعاملات الشهرية", en: "Monthly transactions", value: entitlements?.monthlyTransactionLimit ?? 0 },
    { ar: "السجلات", en: "Records", value: entitlements?.recordLimit ?? 0 },
    { ar: "المطبوعات شهرياً", en: "Prints / month", value: entitlements?.printLimit ?? 0 },
  ];
  return (
    <article className="panel">
      <h2>{locale === "ar" ? "ميزات باقتك" : "Your plan features"}</h2>
      <p className="modal-note">
        {locale === "ar"
          ? "الأزرار تظهر لكل الميزات. ما ليس مشمولاً يحمل شارة ترقية ويفتح صفحة الباقات. واجهة البرمجة ترفض الإنشاء إن لم تكن الباقة تسمح به."
          : "Every feature stays visible. Locked items show an upgrade badge and open the plans page. The API still rejects create/use when the plan does not include the feature."}
      </p>
      <dl className="plan-quota-summary">
        {quotas.map((item) => (
          <div key={item.en}>
            <dt>{locale === "ar" ? item.ar : item.en}</dt>
            <dd>{formatQuota(item.value, locale)}</dd>
          </div>
        ))}
      </dl>
      <ul className="plan-feature-list">
        {PLAN_FEATURE_CATALOG.map((item) => {
          const included = planHasFeature(features, item.id);
          return (
            <li key={item.id} className={included ? "is-included" : "is-locked"}>
              <span>
                {locale === "ar" ? item.ar : item.en}
                {included ? null : <PlanLockBadge locale={locale} />}
              </span>
              {included ? (
                <span className="muted">{locale === "ar" ? "مشمولة" : "Included"}</span>
              ) : (
                <a className="text-link" href="/pricing">{locale === "ar" ? "ترقية" : "Upgrade"}</a>
              )}
            </li>
          );
        })}
      </ul>
    </article>
  );
}

function InfoPanel({ icon, title, text, onClick, locked, locale = "ar" }: { icon: ReactNode; title: string; text: string; onClick?: () => void; locked?: boolean; locale?: Locale }) {
  return <article className={`panel info-panel${locked ? " is-plan-locked" : ""}`}><div>{icon}</div><h3>{title}{locked ? <PlanLockBadge locale={locale} /> : null}</h3><p>{text}</p><button onClick={onClick} disabled={!onClick}><ArrowUpRight size={16} /></button></article>;
}


function SpaceTransactionsPanel({ space, data, locale, onAdd, onTxnChanged }: { space: Space; data: DashboardData; locale: Locale; onAdd: () => void; onTxnChanged: (next: Partial<DashboardData>) => void }) {
  const t = copy[locale];
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [working, setWorking] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const canPrint = planAllowsStatements(planFeaturesOf(data)) && quotaRemaining(data.entitlements?.usage?.printsThisMonth ?? 0, data.entitlements?.printLimit ?? 0) > 0;
  const transactions = useMemo(
    () => sortTransactionsNewest(data.transactions.filter((transaction) => transaction.space_id === space.id)),
    [data.transactions, space.id],
  );
  const paged = pageTransactions(transactions, page, pageSize);
  useEffect(() => { setPage(1); }, [space.id, pageSize]);
  const voidTxn = async (transaction: Transaction) => {
    if (!window.confirm(locale === "ar" ? "إلغاء هذه العملية؟ تبقى في السجل بحالة ملغاة ويُعكس أثرها على الرصيد." : "Void this transaction? It stays in the ledger as voided and its balance effect is reversed.")) return;
    setWorking(true);
    try {
      const response = await apiFetch("/api/dashboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "voidTransaction", idempotencyKey: crypto.randomUUID(), transactionId: transaction.id }),
      });
      const result = await response.json() as Partial<DashboardData> & { error?: string };
      if (!response.ok) throw new Error(dashboardError(result.error ?? "VOID_FAILED", locale));
      onTxnChanged(result.spaces ? result : { transactions: data.transactions.map((row) => row.id === transaction.id ? { ...row, status: "voided" } : row) });
    } catch (caught) {
      window.alert(caught instanceof Error ? caught.message : "VOID_FAILED");
    } finally {
      setWorking(false);
    }
  };
  return <>
    <FoldWrap id={`${space.id}:transactions`} label={locale === "ar" ? "طي العمليات" : "Fold transactions"}>
    <article className="panel list-panel">
      <div className="panel-heading"><h2>{t.recent}</h2><div className="section-title-actions"><button type="button" className={`secondary-button${canPrint ? "" : " is-plan-locked"}`} onClick={() => { if (!canPrint) { goToPricing(); return; } printSpaceStatement(space, data, locale); }}><Printer size={15} />{locale === "ar" ? "كشف الحركات" : "Statement"}{canPrint ? null : <PlanLockBadge locale={locale} />}</button><button className="secondary-button" onClick={onAdd}><Plus size={15} />{t.add}</button></div></div>
      <div className="transaction-list">
        {paged.rows.length ? paged.rows.map((transaction) => (
          <TransactionRow key={transaction.id} transaction={transaction} data={data} locale={locale} onEdit={setEditing} onVoid={(txn) => { if (!working) void voidTxn(txn); }} />
        )) : <Empty locale={locale} />}
      </div>
      <TransactionPager locale={locale} page={paged.page} pages={paged.pages} size={paged.size} total={paged.total} truncated={paged.truncated} onPage={setPage} onSize={(next) => { setPageSize(next); setPage(1); }} />
    </article>
    </FoldWrap>
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
  const [occurredOn, setOccurredOn] = useState(occurredAtToDateInput(transaction.occurred_at));
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
          occurredAt: dateInputToOccurredAt(occurredOn),
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
      <div className="form-row">
        <label><span>{t.amount}</span><div className="money-input"><input required min="0.01" step="0.001" type="number" value={amount} onChange={(event) => setAmount(event.target.value)} /><b className="money-currency"><OmrSymbol size={14} /></b></div></label>
        <label><span>{locale === "ar" ? "تاريخ العملية" : "Transaction date"}</span><DateField required value={occurredOn} onChange={setOccurredOn} /></label>
      </div>
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
  const [occurredOn, setOccurredOn] = useState(todayDateInput());
  const members = data.members.filter((member) => member.space_id === spaceId);
  const space = data.spaces.find((item) => item.id === spaceId);
  const plan = data.plans.find((item) => String(item.space_id) === spaceId);
  const monthlyPlan = Number(plan?.amount_minor ?? 0);
  const selectedMember = members.find((member) => member.id === memberId);
  const invoiceMonths: Array<{ id: string; period_index: number; period_key: string; amount_minor: number; paid_minor: number; status: string; due_at?: string }> = selectedMember
    ? memberInstallments(selectedMember, data.installments ?? [], plan as { space_id?: string; amount_minor?: number; duration_months?: number; starts_at?: string } | undefined)
    : [];
  const amountNumber = Number(amount || 0);
  const remainingDue = selectedMember ? memberPosition(selectedMember, data, spaceId).remainingDue : 0;
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
      const occurredAt = dateInputToOccurredAt(occurredOn);
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
              occurredAt,
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
              occurredAt,
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
              occurredAt,
            }),
      });
      const result = await response.json() as Partial<DashboardData> & { error?: string };
      if (!response.ok) throw new Error(dashboardError(result.error ?? "save failed", locale));
      onSaved(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "SAVE_FAILED");
    } finally { setSaving(false); }
  };
  return <Modal title={t.add} wide={Boolean(isGroupMemberPayment)} className="add-txn-modal" onClose={onClose}><form className="modal-form" onSubmit={submit}><div className="segmented-control">{["expense", "income", "contribution", "reimbursement"].map((item) => <button type="button" key={item} className={kind === item ? "active" : ""} onClick={() => setKind(item)}>{t[item as keyof typeof t] as string}</button>)}</div><label><span>{t.wallet}</span><select value={spaceId} onChange={(event) => { const next = event.target.value; setSpaceId(next); setMemberId(""); const meta = data.spaces.find((item) => item.id === next); if (meta && meta.type !== "personal") setKind("contribution"); }}>{data.spaces.map((item) => <option key={item.id} value={item.id}>{nameOf(item, locale)}</option>)}</select></label><div className="form-row"><label><span>{t.amount}</span><div className="money-input"><input required min="0.01" step="0.001" type="number" value={amount} onChange={(event) => onAmountChange(event.target.value)} placeholder="0.000" /><b className="money-currency"><OmrSymbol size={14} /></b></div></label>{kind !== "contribution" && kind !== "expense" && <label><span>{t.allocation}</span><select value={allocation} onChange={(event) => setAllocation(event.target.value)}><option value="general">{t.general}</option><option value="mandatory">{t.mandatory}</option><option value="personal_reserve">{t.personalReserve}</option></select></label>}{kind === "contribution" && <label><span>{locale === "ar" ? "سياسة الزيادة" : "Surplus policy"}</span><select value={extraPolicy} onChange={(event) => setExtraPolicy(event.target.value)}><option value="advance_credit">{locale === "ar" ? "مقدّم (افتراضي)" : "Advance (default)"}</option><option value="personal_reserve">{locale === "ar" ? "فائض شخصي محمي" : "Protected personal reserve"}</option><option value="voluntary_to_fund">{locale === "ar" ? "تطوع للصندوق" : "Voluntary to common fund"}</option></select></label>}{kind === "expense" && space && space.type !== "personal" && <label><span>{locale === "ar" ? "دُفع من" : "Paid from"}</span><select value={paidFrom} onChange={(event) => { setPaidFrom(event.target.value as "common_fund" | "member"); if (event.target.value === "common_fund") setMemberId(""); }}><option value="common_fund">{locale === "ar" ? "صندوق الجمعية" : "Association fund"}</option><option value="member">{locale === "ar" ? "حساب عضو" : "Member account"}</option></select></label>}</div>{members.length > 0 && !(kind === "expense" && paidFrom === "common_fund") && <label><span>{kind === "contribution" || (kind === "expense" && paidFrom === "member") ? (locale === "ar" ? "العضو (مطلوب)" : "Member (required)") : (locale === "ar" ? "العضو (اختياري — للدخل يخصم من المستحق)" : "Member (optional — income applies to dues)")}</span><select required={kind === "contribution" || (kind === "expense" && paidFrom === "member")} value={memberId} onChange={(event) => setMemberId(event.target.value)}><option value="">—</option>{members.map((member) => <option key={member.id} value={member.id}>{member.display_name}{member.due_minor > member.paid_minor ? (locale === "ar" ? ` · عليه ${currencyMajor(member.due_minor - member.paid_minor, space?.currency ?? "OMR").toFixed(3)}` : ` · owes ${currencyMajor(member.due_minor - member.paid_minor, space?.currency ?? "OMR").toFixed(3)}`) : (member.paid_minor > member.due_minor ? (locale === "ar" ? ` · له مقدّم` : ` · advance`) : "")}</option>)}</select></label>}{isGroupMemberPayment && selectedMember && <RemainingInvoiceGrid months={invoiceMonths} selected={selectedInvoiceIds} locale={locale} currency={space?.currency ?? "OMR"} onSelectPeriod={onSelectInvoice} />}{isGroupMemberPayment && amountNumber > 0 && <div className="modal-note split-preview"><span>{locale === "ar" ? "القاعدة: خصم الفواتير الأقدم أولاً ثم أي زيادة كمقدّم" : "Rule: clear oldest invoices first; surplus becomes advance"}</span>{allocationPreview?.allocations.map((item) => <strong key={item.installmentId}>{item.periodKey}: {(item.amountMinor / 1000).toFixed(3)}</strong>)}<strong>{locale === "ar" ? `سداد مطالبة: ${previewMandatory.toFixed(3)}` : `Toward dues: ${previewMandatory.toFixed(3)}`}</strong><strong>{locale === "ar" ? `مقدّم: ${previewSurplus.toFixed(3)}` : `Advance: ${previewSurplus.toFixed(3)}`}</strong>{remainingMajor > 0 && <span>{locale === "ar" ? `المتبقي عليه قبل العملية: ${remainingMajor.toFixed(3)}` : `Outstanding before: ${remainingMajor.toFixed(3)}`}</span>}</div>}<label><span>{locale === "ar" ? "تاريخ العملية" : "Transaction date"}</span><DateField required value={occurredOn} onChange={setOccurredOn} /></label><label><span>{t.description}</span><input required={kind !== "contribution"} value={description} onChange={(event) => setDescription(event.target.value)} placeholder={locale === "ar" ? "مثال: مساهمة أغسطس" : "e.g. August contribution"} /></label>{error && <p className="modal-error">{error}</p>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>{t.cancel}</button><button className="primary-button" disabled={saving}>{saving ? t.saving : t.save}</button></div></form></Modal>;
}

function WalletModal({ data, locale, existing, defaultType = "trip", lockType = false, onClose, onSaved, onLiveData, onDeleted }: { data: DashboardData; locale: Locale; existing?: Space; defaultType?: string; lockType?: boolean; onClose: () => void; onSaved: (next: Partial<DashboardData>) => void; onLiveData?: (next: Partial<DashboardData>) => void; onDeleted?: (next: Partial<DashboardData>) => void }) {
  const t = copy[locale];
  const plan = existing ? data.plans.find((item) => String(item.space_id) === existing.id) : undefined;
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState(existing ? (locale === "ar" ? existing.name_ar : existing.name_en) : "");
  const [type, setType] = useState(lockType ? defaultType : defaultType);
  const [monthlyContribution, setMonthlyContribution] = useState(plan?.amount_minor ? String(Number(plan.amount_minor) / 1000) : "20");
  const [durationMonths, setDurationMonths] = useState(String(plan?.duration_months ?? 12));
  const [startsAt, setStartsAt] = useState((existing?.starts_at || plan?.starts_at || new Date().toISOString()).toString().slice(0, 10));
  const isGroup = ["household", "trip", "society", "group"].includes(existing?.type ?? type);
  const isPersonal = (existing?.type ?? type) === "personal";
  const liveGoalMinor = Math.round(Number(monthlyContribution || 0) * 1000) * Math.max(1, Number(durationMonths) || 1);
  const features = planFeaturesOf(data);
  const resetExisting = async () => {
    if (!existing) return;
    setResetting(true);
    try {
      await confirmResetWalletData(
        locale,
        existing.id,
        (next) => {
          onLiveData?.(next as Partial<DashboardData>);
          onSaved(next as Partial<DashboardData>);
          onClose();
        },
        { kind: isPersonal ? "personal" : "group" },
      );
    } finally {
      setResetting(false);
    }
  };
  const deleteExisting = async () => {
    if (!existing) return;
    const confirmed = window.confirm(locale === "ar"
      ? (isPersonal
        ? "حذف المحفظة نهائياً مع كل الحسابات والعمليات؟ لا يمكن التراجع."
        : "حذف الجمعية/المحفظة نهائياً مع كل الأعضاء والعمليات؟ لا يمكن التراجع.")
      : (isPersonal
        ? "Permanently delete this wallet and all accounts and transactions? This cannot be undone."
        : "Permanently delete this association and all members and transactions? This cannot be undone."));
    if (!confirmed) return;
    setDeleting(true);
    try {
      const response = await apiFetch("/api/dashboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "deleteWallet", idempotencyKey: crypto.randomUUID(), spaceId: existing.id }),
      });
      const result = await response.json() as Partial<DashboardData> & { error?: string };
      if (!response.ok) {
        window.alert(dashboardError(result.error ?? "DELETE_FAILED", locale));
        return;
      }
      onDeleted?.(result);
      onClose();
    } catch (caught) {
      window.alert(caught instanceof Error ? caught.message : "DELETE_FAILED");
    } finally {
      setDeleting(false);
    }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const nextType = existing ? existing.type : (lockType ? defaultType : type);
      if (!existing && !planAllowsSpaceType(features, nextType)) {
        throw new Error(locale === "ar" ? "هذه المحفظة تحتاج ترقية الباقة." : "This wallet type needs a plan upgrade.");
      }
      const response = await apiFetch("/api/dashboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: existing ? "updateWallet" : "addWallet",
          idempotencyKey: crypto.randomUUID(),
          ...(existing ? { spaceId: existing.id } : {}),
          name,
          type: existing ? existing.type : (lockType ? defaultType : type),
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
          ? { PLAN_FEATURE_REQUIRED: "باقتك الحالية لا تسمح بإنشاء هذا النوع من المحافظ.", PLAN_WALLET_LIMIT: "وصلت إلى حد المحافظ في باقتك.", INVALID_WALLET: "بيانات المحفظة غير مكتملة.", INTERNAL_ERROR: "تعذر حفظ المحفظة. حدّث الصفحة وتحقق إن ظهرت، أو حاول مرة أخرى." }
          : { PLAN_FEATURE_REQUIRED: "Your current plan does not allow this wallet type.", PLAN_WALLET_LIMIT: "You reached the wallet limit on your plan.", INVALID_WALLET: "Wallet details are incomplete.", INTERNAL_ERROR: "Could not save the wallet. Refresh to check if it appeared, or try again." };
        throw new Error(messages[code] ?? code);
      }
      onSaved(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "SAVE_FAILED");
    } finally { setSaving(false); }
  };
  return <Modal title={existing ? (locale === "ar" ? "ضبط المحفظة" : "Wallet setup") : t.newWallet} wide={Boolean(existing && isPersonal)} xl={Boolean(existing && isPersonal)} onClose={onClose}><form className={`modal-form${existing && isPersonal ? " wallet-setup-form" : ""}`} onSubmit={submit}><label><span>{t.walletName}</span><input required value={name} onChange={(event) => setName(event.target.value)} placeholder={locale === "ar" ? "مثال: سفرة الإخوة 2027" : "e.g. Siblings trip 2027"} /></label>{!lockType && !existing && <label><span>{t.walletType}</span><select value={type} onChange={(event) => setType(event.target.value)}>{Object.entries(typeLabels[locale]).map(([value, label]) => <option key={value} value={value} disabled={!planAllowsSpaceType(features, value)}>{label}{planAllowsSpaceType(features, value) ? "" : (locale === "ar" ? " — ترقية" : " — Upgrade")}</option>)}</select></label>}{isGroup && <div className="form-row"><label><span>{locale === "ar" ? "المساهمة الشهرية الإلزامية" : "Mandatory monthly contribution"}</span><div className="money-input"><input required min="0.01" step="0.001" type="number" value={monthlyContribution} onChange={(event) => setMonthlyContribution(event.target.value)} /><b className="money-currency"><OmrSymbol size={14} /></b></div></label><label><span>{locale === "ar" ? "مدة الخطة (أشهر)" : "Plan duration (months)"}</span><input required type="number" min="1" max="120" value={durationMonths} onChange={(event) => setDurationMonths(event.target.value)} /></label></div>}<label><span>{locale === "ar" ? "تاريخ بداية الجمعية / المحفظة" : "Association / wallet start date"}</span><DateField required value={startsAt} onChange={setStartsAt} /></label>{isGroup && <div className="modal-note split-preview"><span>{locale === "ar" ? "الهدف المالي للشخص = المساهمة × عدد الأشهر" : "Personal financial goal = contribution × months"}</span><strong>{formatMoney(Number.isFinite(liveGoalMinor) ? liveGoalMinor : 0, "OMR", locale)}</strong></div>}{isGroup && <p className="modal-note">{locale === "ar" ? "عند استلام مبلغ من عضو: يُخصم أولاً من المطالبات المتراكمة عليه، وأي زيادة تُسجَّل مقدّماً (له)." : "When a member pays: outstanding dues are cleared first, and any surplus is booked as advance credit."}</p>}{error && <p className="modal-error">{error}</p>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>{t.cancel}</button><button className="primary-button" disabled={saving}>{saving ? t.saving : (existing ? t.save : t.create)}</button></div></form>{existing && isPersonal && <PersonalRulesSetup spaceId={existing.id} locale={locale} accounts={data.personalAccounts ?? []} rules={data.personalRules ?? []} onChanged={(next) => onLiveData?.(next as Partial<DashboardData>)} />}{existing && <div className="personal-reset-box wallet-danger-zone"><div><strong>{locale === "ar" ? "منطقة الخطر" : "Danger zone"}</strong><p>{isPersonal ? (locale === "ar" ? "تصفية البيانات تبقي اسم المحفظة وتحذف الحسابات والعمليات. الحذف يزيل المحفظة بالكامل." : "Wipe keeps the wallet name and deletes accounts and transactions. Delete removes the wallet entirely.") : (locale === "ar" ? "تصفية البيانات تبقي الأعضاء وخطة المساهمة واسم المحفظة. الحذف يزيل الجمعية بالكامل مع الأعضاء." : "Wipe keeps members, the contribution plan, and the wallet name. Delete removes the association and its members entirely.")}</p></div><div className="wallet-danger-actions"><button type="button" className="danger-button" disabled={resetting || deleting} onClick={() => void resetExisting()}><Trash2 size={14} />{resetting ? "…" : (locale === "ar" ? "تصفية وتصفير" : "Wipe & reset")}</button><button type="button" className="danger-button" disabled={resetting || deleting} onClick={() => void deleteExisting()}><Trash2 size={14} />{deleting ? "…" : (locale === "ar" ? "حذف المحفظة" : "Delete wallet")}</button></div></div>}</Modal>;
}

function InviteModal({ data, locale, preferredSpaceId, onClose, onDone }: { data: DashboardData; locale: Locale; preferredSpaceId?: string; onClose: () => void; onDone: (message: string) => void }) {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [dialIso2, setDialIso2] = useState(DEFAULT_DIAL_ISO2);
  const [dialCode, setDialCode] = useState(DEFAULT_DIAL_CODE);
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
  const dialOptions = dialCodesForSelect(locale);
  const applyStoredPhone = (raw: string) => {
    const parts = splitPhoneParts(raw, DEFAULT_DIAL_CODE);
    setDialCode(parts.dial);
    setDialIso2(parts.iso2);
    setPhone(parts.national);
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const fullPhone = phone.trim() ? composeWhatsAppPhone(dialCode, phone) : "";
      const response = await apiFetch(recordOnly ? "/api/dashboard" : "/api/platform", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: recordOnly ? "addMember" : "inviteMember",
          idempotencyKey: crypto.randomUUID(),
          email,
          phone: fullPhone,
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
        ? { INVALID_PHONE: "رقم الهاتف غير مكتمل. اختر مفتاح الدولة وأدخل الرقم المحلي (مثال عمان: 9904406).", INVALID_MEMBER: "تعذر إضافة المساهم.", PLAN_MEMBER_LIMIT: "تم بلوغ حد الأعضاء في الخطة." }
        : { INVALID_PHONE: "Phone number is incomplete. Choose a country code and enter the local number.", INVALID_MEMBER: "Could not add this member.", PLAN_MEMBER_LIMIT: "Member limit reached for this plan." };
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
          applyStoredPhone(contact.phone ?? "");
        }}>
          <option value="">{locale === "ar" ? "اختر عضواً محفوظاً (اختياري)" : "Pick a saved member (optional)"}</option>
          {(data.contacts ?? []).map((contact) => <option key={contact.id} value={contact.id}>{contact.display_name}{contact.phone ? ` · ${contact.phone}` : ""}</option>)}
        </select>
      </label>
      <label><span>{locale === "ar" ? "اسم المساهم" : "Member name"}</span><input required minLength={2} maxLength={80} value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
      <label><span>{locale === "ar" ? `البريد${recordOnly ? " (اختياري)" : ""}` : `Email${recordOnly ? " (optional)" : ""}`}</span><input required={!recordOnly} type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="member@example.com" /></label>
      <label><span>{locale === "ar" ? "رقم الهاتف (واتساب)" : "Phone (WhatsApp)"}</span>
        <div className="phone-with-dial">
          <select
            aria-label={locale === "ar" ? "مفتاح الدولة" : "Country dial code"}
            value={dialIso2}
            onChange={(event) => {
              const next = dialOptions.find((item) => item.iso2 === event.target.value);
              if (!next) return;
              setDialIso2(next.iso2);
              setDialCode(next.dial);
            }}
          >
            {dialOptions.map((item) => (
              <option key={item.iso2} value={item.iso2}>
                {locale === "ar" ? item.nameAr : item.nameEn} (+{item.dial})
              </option>
            ))}
          </select>
          <input required={recordOnly} value={phone} onChange={(event) => setPhone(event.target.value)} placeholder={dialCode === "968" ? "9904406" : "501234567"} inputMode="tel" autoComplete="tel-national" />
        </div>
        <small className="field-hint">{locale === "ar" ? `المفتاح الافتراضي: سلطنة عمان (+${DEFAULT_DIAL_CODE}). يُحفظ الرقم مع المفتاح لإرسال واتساب مباشرة.` : `Default: Oman (+${DEFAULT_DIAL_CODE}). The dial code is stored so WhatsApp opens directly.`}</small>
      </label>
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
  const [occurredOn, setOccurredOn] = useState(occurredAtToDateInput(existing?.occurred_at));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!spaceId) return;
    setSaving(true);
    setError("");
    try {
      const occurredAt = dateInputToOccurredAt(occurredOn);
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
              occurredAt,
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
        {!existing && <label><span>{locale === "ar" ? "تاريخ المصروف" : "Expense date"}</span><DateField required value={occurredOn} onChange={setOccurredOn} /></label>}
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
        <label><span>{locale === "ar" ? "تاريخ البداية" : "Start date"}</span><DateField required value={startsAt} onChange={setStartsAt} /></label>
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

function CircleOrderModal({ data, locale, spaceId, onClose, onSaved }: { data: DashboardData; locale: Locale; spaceId: string; onClose: () => void; onSaved: (next: Partial<DashboardData>) => void }) {
  const society = data.spaces.find((space) => space.id === spaceId && ["society", "group"].includes(space.type)); const members = data.members.filter((member) => member.space_id === society?.id);
  const [mode, setMode] = useState("manual"); const [amount, setAmount] = useState(""); const [monthlyContribution, setMonthlyContribution] = useState(""); const [durationMonths, setDurationMonths] = useState("60"); const [dueDay, setDueDay] = useState("1"); const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  const labels = locale === "ar" ? { manual: "ترتيب المدير", round_robin: "بالدور", draw: "قرعة إلكترونية", alphabetical: "أبجدي", hierarchical: "هرمي" } : { manual: "Manager order", round_robin: "Round robin", draw: "Electronic draw", alphabetical: "Alphabetical", hierarchical: "Hierarchical" };
  const submit = async (event: FormEvent) => { event.preventDefault(); if (!society) return; setSaving(true); setError(""); try {
    const response = await apiFetch("/api/dashboard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "setCircleOrder", idempotencyKey: crypto.randomUUID(), spaceId: society.id, mode, amount, monthlyContribution, durationMonths: Number(durationMonths), dueDay: Number(dueDay), memberIds: members.map((member) => member.id) }) });
    const result = await response.json() as Partial<DashboardData> & { error?: string }; if (!response.ok) throw new Error(result.error); onSaved(result);
  } catch (caught) { setError(caught instanceof Error ? caught.message : "SAVE_FAILED"); } finally { setSaving(false); } };
  return <Modal title={locale === "ar" ? "إعداد أدوار الجمعية" : "Configure circle turns"} onClose={onClose}><form className="modal-form" onSubmit={submit}><label><span>{locale === "ar" ? "نظام الترتيب" : "Ordering method"}</span><select value={mode} onChange={(event) => setMode(event.target.value)}>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><div className="form-row"><label><span>{locale === "ar" ? "المساهمة الشهرية" : "Monthly contribution"}</span><div className="money-input"><input required type="number" min="0.01" step="0.001" value={monthlyContribution} onChange={(event) => setMonthlyContribution(event.target.value)} /><b className="money-currency"><OmrSymbol size={14} /></b></div></label><label><span>{locale === "ar" ? "مدة الخطة بالأشهر" : "Duration in months"}</span><input required type="number" min="1" max="120" value={durationMonths} onChange={(event) => setDurationMonths(event.target.value)} /></label></div><div className="form-row"><label><span>{locale === "ar" ? "يوم الاستحقاق" : "Due day"}</span><input required type="number" min="1" max="28" value={dueDay} onChange={(event) => setDueDay(event.target.value)} /></label><label><span>{locale === "ar" ? "مبلغ الاستلام لكل دور" : "Payout per turn"}</span><div className="money-input"><input required type="number" min="0.01" step="0.001" value={amount} onChange={(event) => setAmount(event.target.value)} /><b className="money-currency"><OmrSymbol size={14} /></b></div></label></div><div className="modal-note">{members.map((member, index) => <span key={member.id}>{index + 1}. {member.display_name}</span>)}</div>{error && <p className="modal-error">{error}</p>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>{copy[locale].cancel}</button><button className="primary-button" disabled={saving || !society || !members.length}>{saving ? copy[locale].saving : copy[locale].save}</button></div></form></Modal>;
}

function Modal({ title, onClose, children, wide = false, xl = false, className = "" }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; xl?: boolean; className?: string }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className={`modal-card${wide || xl ? " wide-modal" : ""}${xl ? " xl-modal" : ""}${className ? ` ${className}` : ""}`} role="dialog" aria-modal="true" aria-label={title}><div className="modal-header"><h2>{title}</h2><button onClick={onClose} aria-label="Close"><X size={20} /></button></div>{children}</section></div>;
}

function Empty({ locale }: { locale: Locale }) { return <div className="empty-state"><ReceiptText size={24} /><span>{copy[locale].empty}</span></div>; }
function LoadingScreen({ locale }: { locale: Locale }) {
  return <WazenPageLoader label={locale === "ar" ? "جاري تحميل لوحة وازن…" : "Loading Wazen…"} />;
}
function ErrorScreen({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div className="error-screen">
      <CircleDollarSign size={40} />
      <h1>وازن</h1>
      <p>{message}</p>
      <button className="primary-button" onClick={retry}>Try again</button>
      <a className="secondary-button" href={clientSignInPath("/dashboard")}>Sign in</a>
    </div>
  );
}
