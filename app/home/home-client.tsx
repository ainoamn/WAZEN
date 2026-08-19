"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell,
  Globe2,
  Landmark,
  Plus,
  Settings2,
  TrendingDown,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import OmrSymbol from "../../components/brand/OmrSymbol";
import WazenLogo from "../../components/brand/WazenLogo";
import WazenPageLoader from "../../components/brand/WazenPageLoader";
import { BhdAppSwitcher } from "../../components/bhd/BhdAppSwitcher";
import { apiFetch } from "../../lib/client-api";
import { prefetchAppRoutes, warmAppCaches } from "../../lib/app-prefetch";
import { completeClientLogout } from "../../lib/client-logout";
import { clientSignInPath } from "../../lib/client-sign-in";
import { fetchDashboardSession, readDashboardCache, writeDashboardCache } from "../../lib/dashboard-session";
import { useLiveDashboard } from "../../lib/live-sync";
import { formatMoneyMinor, currencyScale } from "../../lib/money";
import { memberDisplayCreditMinor, pendingSettlementsWithCredit } from "../../lib/finance";
import { memberAccruedDueMinor } from "../../components/members/association-members";
type Locale = "ar" | "en";

type Space = {
  id: string;
  name_ar: string;
  name_en: string;
  type: string;
  currency: string;
  balance_minor: number;
  status?: string;
};

type Member = { id: string; space_id: string; display_name: string; due_minor?: number; paid_minor?: number; extra_minor?: number };
type Plan = { space_id?: string; amount_minor?: number; duration_months?: number; starts_at?: string };
type Installment = {
  id: string;
  member_id: string;
  space_id: string;
  period_index: number;
  period_key: string;
  due_at: string;
  amount_minor: number;
  paid_minor: number;
  status: string;
};
type Transaction = { kind: string; amount_minor: number; occurred_at: string; status?: string; member_id?: string | null; space_id?: string; allocation?: string };
type Settlement = {
  id: string;
  space_id: string;
  from_member_id: string;
  to_member_id: string;
  from_member_name: string | null;
  to_member_name: string | null;
  amount_minor: number;
  status: string;
};
type Occurrence = {
  id: string;
  space_id: string;
  account_id?: string | null;
  period_key: string;
  due_at?: string;
  expected_minor: number;
  status: string;
  rule_name?: string;
  rule_kind?: string;
  amount_mode?: string;
};
type PersonalAccount = { id: string; space_id: string; name: string };

type HomeData = {
  user: { displayName: string; email: string; avatarUrl?: string | null; role?: string };
  spaces: Space[];
  members: Member[];
  transactions: Transaction[];
  settlements?: Settlement[];
  personalOccurrences?: Occurrence[];
  personalAccounts?: PersonalAccount[];
  plans?: Plan[];
  installments?: Installment[];
};

function money(minor: number, currency: string, locale: Locale) {
  return formatMoneyMinor(minor, currency || "OMR", locale);
}

function spaceName(space: Space, locale: Locale) {
  return locale === "ar" ? space.name_ar : space.name_en;
}

export function HomeClient() {
  const router = useRouter();
  const [locale, setLocale] = useState<Locale>("ar");
  const [data, setData] = useState<HomeData | null>(() => readDashboardCache<HomeData>());
  const [loading, setLoading] = useState(() => !readDashboardCache());
  const [error, setError] = useState(false);
  const [sessionUser, setSessionUser] = useState<HomeData["user"] | null>(() => {
    const cached = readDashboardCache<HomeData>();
    return cached?.user ?? null;
  });
  const [addOpen, setAddOpen] = useState(false);
  const [pendingOpen, setPendingOpen] = useState(false);
  const [toast, setToast] = useState("");

  const load = useCallback(async (force = false) => {
    try {
      setError(false);
      const result = await fetchDashboardSession<HomeData>(force);
      if (result.data) {
        writeDashboardCache(result.data);
        setData(result.data);
        setSessionUser(result.data.user);
      }
    } catch (caught) {
      if ((caught as { status?: number }).status === 401) {
        window.location.replace(clientSignInPath("/home"));
        return;
      }
      if (!readDashboardCache()) setError(true);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { void load(); }, [load]);
  // Load lightweight session info for the app switcher.
  // This prevents showing an auth/login UI when /api/dashboard is slow or times out.
  useEffect(() => {
    if (data || sessionUser) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 4_000);

    void fetch("/api/auth", {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return;
        const result = (await response.json()) as { authenticated?: boolean; user?: HomeData["user"] };
        if (result?.authenticated && result?.user) setSessionUser(result.user);
      })
      .catch(() => { /* ignore */ })
      .finally(() => window.clearTimeout(timer));

    return () => controller.abort();
  }, [data, sessionUser]);
  useEffect(() => {
    if (!loading || data) return;
    const timer = window.setTimeout(() => {
      setLoading(false);
      setError(true);
    }, 18_000);
    return () => window.clearTimeout(timer);
  }, [loading, data]);
  useLiveDashboard(() => { void load(true); }, !loading);
  useEffect(() => {
    if (!data) return;
    prefetchAppRoutes(router);
    warmAppCaches();
  }, [router, data]);
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("wazen-locale");
      if (saved === "ar" || saved === "en") setLocale(saved);
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
    try { window.localStorage.setItem("wazen-locale", locale); } catch { /* ignore */ }
  }, [locale]);

  const stats = useMemo(() => {
    if (!data) {
      return { available: 0, spend: 0, income: 0, wallets: 0, associations: 0, currency: "OMR", pending: 0 };
    }
    const spaces = data.spaces ?? [];
    const transactions = data.transactions ?? [];
    const active = spaces.filter((space) => (space.status ?? "active") !== "archived");
    const monthKey = new Date().toISOString().slice(0, 7);
    const posted = transactions.filter((row) => (row.status ?? "approved") !== "voided" && String(row.occurred_at ?? "").slice(0, 7) === monthKey);
    const spend = posted.filter((row) => ["expense", "reimbursement"].includes(row.kind)).reduce((sum, row) => sum + row.amount_minor, 0);
    const income = posted.filter((row) => ["income", "contribution"].includes(row.kind)).reduce((sum, row) => sum + row.amount_minor, 0);
    const available = active.reduce((sum, space) => sum + space.balance_minor, 0);
    const wallets = active.length;
    const associations = active.filter((space) => space.type === "society" || space.type === "group").length;
    const pending =
      (data.settlements ?? []).filter((item) => item.status === "pending").length
      + (data.personalOccurrences ?? []).filter((item) => item.status === "pending").length;
    return { available, spend, income, wallets, associations, currency: active[0]?.currency ?? "OMR", pending };
  }, [data]);

  const logout = async () => {
    await completeClientLogout();
  };

  const flash = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  };

  const switcherUser = data?.user ?? sessionUser;

  if (loading && !data) {
    return (
      <div className="home-shell">
        {switcherUser && (
          <header className="home-top">
            <WazenLogo showText iconClassName="home-logo-img" />
            <div className="home-top-actions">
              <button
                type="button"
                className="language-button"
                onClick={() => setLocale(locale === "ar" ? "en" : "ar")}
              >
                <Globe2 size={16} />
                {locale === "ar" ? "EN" : "عربي"}
              </button>
              <BhdAppSwitcher
                user={{
                  name: switcherUser.displayName,
                  email: switcherUser.email,
                  picture: switcherUser.avatarUrl ?? null,
                }}
                onSignOut={() => void logout()}
              />
            </div>
          </header>
        )}
        <WazenPageLoader label={locale === "ar" ? "جاري التحميل…" : "Loading…"} />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="home-shell">
        {switcherUser && (
          <header className="home-top">
            <WazenLogo showText iconClassName="home-logo-img" />
            <div className="home-top-actions">
              <button
                type="button"
                className="language-button"
                onClick={() => setLocale(locale === "ar" ? "en" : "ar")}
              >
                <Globe2 size={16} />
                {locale === "ar" ? "EN" : "عربي"}
              </button>
              <BhdAppSwitcher
                user={{
                  name: switcherUser.displayName,
                  email: switcherUser.email,
                  picture: switcherUser.avatarUrl ?? null,
                }}
                onSignOut={() => void logout()}
              />
            </div>
          </header>
        )}
        <p className="home-error">{locale === "ar" ? "تعذر تحميل البيانات." : "Could not load data."}</p>
        <button type="button" className="primary-button" onClick={() => { setLoading(true); void load(); }}>
          {locale === "ar" ? "إعادة المحاولة" : "Try again"}
        </button>
        <a className="secondary-button" href={clientSignInPath("/home")}>
          {locale === "ar" ? "تسجيل الدخول" : "Sign in"}
        </a>
      </div>
    );
  }

  const firstName = (data.user?.displayName ?? "").split(" ")[0] || data.user?.displayName || "";

  return (
    <div className="home-shell">
      <header className="home-top">
        <WazenLogo showText iconClassName="home-logo-img" />
        <div className="home-top-actions">
          <button
            type="button"
            className="language-button"
            onClick={() => setLocale(locale === "ar" ? "en" : "ar")}
          >
            <Globe2 size={16} />
            {locale === "ar" ? "EN" : "عربي"}
          </button>
          <BhdAppSwitcher
            user={{ name: data.user.displayName, email: data.user.email, picture: data.user.avatarUrl ?? null }}
            onSignOut={() => void logout()}
          />
        </div>
      </header>

      <main className="home-main">
        <p className="home-hello">
          {locale === "ar" ? `مرحباً ${firstName}` : `Hello ${firstName}`}
        </p>
        <h1 className="home-title">
          {locale === "ar" ? "صورتك المالية في لمحة" : "Your money at a glance"}
        </h1>
        <p className="home-lead">
          {locale === "ar"
            ? "أضف عملية بسرعة، أو ادخل للتحكم لضبط المحافظ والاعتمادات."
            : "Add a transaction quickly, or open Control to manage wallets and approvals."}
        </p>

        <section className="home-stats" aria-label={locale === "ar" ? "الإحصائيات" : "Statistics"}>
          <article className="tone-teal">
            <WalletCards size={18} />
            <span>{locale === "ar" ? "المتوفر" : "Available"}</span>
            <strong>{money(stats.available, stats.currency, locale)}</strong>
          </article>
          <article className="tone-rose">
            <TrendingDown size={18} />
            <span>{locale === "ar" ? "مصروف هذا الشهر" : "Spend this month"}</span>
            <strong>{money(stats.spend, stats.currency, locale)}</strong>
          </article>
          <article className="tone-green">
            <TrendingUp size={18} />
            <span>{locale === "ar" ? "دخل هذا الشهر" : "Income this month"}</span>
            <strong>{money(stats.income, stats.currency, locale)}</strong>
          </article>
          <article className="tone-navy">
            <Landmark size={18} />
            <span>{locale === "ar" ? "المحافظ" : "Wallets"}</span>
            <strong>{stats.wallets}</strong>
          </article>
          <article className="tone-amber">
            <Landmark size={18} />
            <span>{locale === "ar" ? "الجمعيات" : "Associations"}</span>
            <strong>{stats.associations}</strong>
          </article>
        </section>

        {stats.pending > 0 && (
          <button type="button" className="home-pending" onClick={() => setPendingOpen(true)}>
            <Bell size={18} />
            <span>
              {locale === "ar"
                ? `${stats.pending} بند بانتظار الاعتماد أو التسوية — اعرض البنود`
                : `${stats.pending} items waiting for approval or settlement — view items`}
            </span>
          </button>
        )}

        <div className="home-actions">
          <button type="button" className="home-action primary" onClick={() => setAddOpen(true)}>
            <Plus size={18} />
            <b>{locale === "ar" ? "إضافة عملية" : "Add transaction"}</b>
          </button>
          <Link className="home-action" href="/dashboard">
            <Settings2 size={18} />
            <b>{locale === "ar" ? "التحكم" : "Control"}</b>
          </Link>
        </div>
      </main>

      {pendingOpen && (
        <PendingInbox
          data={data}
          locale={locale}
          onClose={() => setPendingOpen(false)}
          onChanged={() => { void load(); flash(locale === "ar" ? "تم اعتماد البند" : "Item approved"); }}
        />
      )}

      {addOpen && (
        <QuickAddModal
          data={data}
          locale={locale}
          onClose={() => setAddOpen(false)}
          onSaved={() => {
            setAddOpen(false);
            void load();
            flash(locale === "ar" ? "تم تسجيل العملية" : "Transaction saved");
          }}
        />
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

function PendingInbox({
  data,
  locale,
  onClose,
  onChanged,
}: {
  data: HomeData;
  locale: Locale;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const settlements = pendingSettlementsWithCredit(
    (data.settlements ?? []).filter((item) => item.status === "pending"),
    new Map((data.members ?? []).map((member) => {
      const plan = (data.plans ?? []).find((item) => String(item.space_id) === member.space_id);
      const accruedDue = memberAccruedDueMinor(
        {
          id: member.id,
          space_id: member.space_id,
          display_name: member.display_name,
          email: null,
          role: "member",
          due_minor: Number(member.due_minor) || 0,
          paid_minor: Number(member.paid_minor) || 0,
          extra_minor: Number(member.extra_minor) || 0,
          avatar: "",
        },
        data.installments ?? [],
        plan,
      );
      return [member.id, memberDisplayCreditMinor(member, { accruedDueMinor: accruedDue, transactions: data.transactions })] as const;
    })),
  );
  const occurrences = (data.personalOccurrences ?? []).filter((item) => item.status === "pending");

  const settle = async (settlementId: string) => {
    setBusyId(`settle:${settlementId}`);
    setError("");
    try {
      const response = await apiFetch("/api/dashboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "settleReimbursement", idempotencyKey: crypto.randomUUID(), settlementId }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "SETTLE_FAILED");
      onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "SETTLE_FAILED");
    } finally {
      setBusyId("");
    }
  };

  const confirmOccurrence = async (item: Occurrence) => {
    setBusyId(`occ:${item.id}`);
    setError("");
    try {
      const accountId = item.account_id || data.personalAccounts?.find((account) => account.space_id === item.space_id)?.id;
      const space = data.spaces.find((row) => row.id === item.space_id);
      const scale = currencyScale(space?.currency ?? "OMR");
      const amount = item.expected_minor ? String(item.expected_minor / (10 ** scale)) : undefined;
      const response = await apiFetch("/api/dashboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "confirmPersonalOccurrence",
          idempotencyKey: crypto.randomUUID(),
          occurrenceId: item.id,
          amount,
          accountId: accountId || undefined,
        }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "CONFIRM_FAILED");
      onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "CONFIRM_FAILED");
    } finally {
      setBusyId("");
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal-card add-txn-modal" role="dialog" aria-modal="true" aria-label={locale === "ar" ? "بنود بانتظار الاعتماد" : "Pending approvals"}>
        <div className="modal-header">
          <h2>{locale === "ar" ? "بنود بانتظار الاعتماد" : "Pending approvals"}</h2>
          <button type="button" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="modal-form">
          {settlements.length === 0 && occurrences.length === 0 ? (
            <p className="modal-note">{locale === "ar" ? "لا توجد بنود معلّقة." : "No pending items."}</p>
          ) : (
            <div className="home-pending-list">
              {settlements.map((item) => {
                const space = data.spaces.find((row) => row.id === item.space_id);
                const toFund = String(item.to_member_id).startsWith("space:");
                const fromFund = String(item.from_member_id).startsWith("space:");
                const title = toFund
                  ? (locale === "ar" ? `${item.from_member_name ?? "عضو"} عليه للصندوق` : `${item.from_member_name ?? "Member"} owes the fund`)
                  : fromFund
                    ? (locale === "ar" ? `الصندوق مدين لـ ${item.to_member_name ?? "عضو"}` : `Fund owes ${item.to_member_name ?? "a member"}`)
                    : (locale === "ar" ? `${item.from_member_name ?? "عضو"} → ${item.to_member_name ?? "عضو"}` : `${item.from_member_name ?? "Member"} → ${item.to_member_name ?? "member"}`);
                return (
                  <article className="home-pending-row" key={item.id}>
                    <div>
                      <strong>{title}</strong>
                      <span>
                        {space ? spaceName(space, locale) : ""} · {item.reservedMinor > 0 ? <><s>{money(item.amountMinor, space?.currency ?? "OMR", locale)}</s> {money(item.payableMinor, space?.currency ?? "OMR", locale)}</> : money(item.payableMinor, space?.currency ?? "OMR", locale)}
                        {item.reservedMinor > 0 ? (locale === "ar" ? ` بعد حجز ${money(item.reservedMinor, space?.currency ?? "OMR", locale)}` : ` after reserving ${money(item.reservedMinor, space?.currency ?? "OMR", locale)}`) : ""}
                      </span>
                    </div>
                    <div className="home-pending-actions">
                      <button type="button" className="primary-button" disabled={busyId === `settle:${item.id}`} onClick={() => void settle(item.id)}>
                        {busyId === `settle:${item.id}` ? (locale === "ar" ? "جارٍ…" : "…") : (locale === "ar" ? "اعتماد التسوية" : "Settle")}
                      </button>
                    </div>
                  </article>
                );
              })}
              {occurrences.map((item) => {
                const space = data.spaces.find((row) => row.id === item.space_id);
                return (
                  <article className="home-pending-row" key={item.id}>
                    <div>
                      <strong>{locale === "ar" ? `تأكيد: ${item.rule_name ?? "بند"}` : `Confirm: ${item.rule_name ?? "item"}`}</strong>
                      <span>{space ? spaceName(space, locale) : ""} · {item.period_key} · {money(item.expected_minor, space?.currency ?? "OMR", locale)}</span>
                    </div>
                    <div className="home-pending-actions">
                      <button type="button" className="primary-button" disabled={busyId === `occ:${item.id}`} onClick={() => void confirmOccurrence(item)}>
                        {busyId === `occ:${item.id}` ? (locale === "ar" ? "جارٍ…" : "…") : (locale === "ar" ? "اعتماد" : "Approve")}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
          {error && <p className="modal-error">{error}</p>}
          <p className="modal-note">{locale === "ar" ? "نفس رقم التحكم: يُحجز رصيد العضو من الاشتراك المستحق حتى اليوم (وليس الهدف الكامل). عمود «عليه» في الجدول قد يزيد إذا بقي اشتراك غير مسدّد فوق حصة المصروف." : "Same number as Control: credit uses dues accrued to date, not the full goal. The members table Owes column can still be higher if unpaid subscription remains."}</p>
          <Link className="secondary-button home-pending-foot" href="/dashboard">
            {locale === "ar" ? "فتح لوحة التحكم" : "Open Control"}
          </Link>
        </div>
      </section>
    </div>
  );
}

function QuickAddModal({
  data,
  locale,
  onClose,
  onSaved,
}: {
  data: HomeData;
  locale: Locale;
  onClose: () => void;
  onSaved: () => void;
}) {
  const spaces = (data.spaces ?? []).filter((space) => (space.status ?? "active") !== "archived");
  const initial = spaces.find((space) => space.type === "personal")?.id ?? spaces[0]?.id ?? "";
  const [spaceId, setSpaceId] = useState(initial);
  const space = spaces.find((item) => item.id === spaceId);
  const isGroup = Boolean(space && space.type !== "personal");
  const [kind, setKind] = useState(isGroup ? "contribution" : "expense");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [memberId, setMemberId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const members = (data.members ?? []).filter((member) => member.space_id === spaceId);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      if (kind === "contribution" && !memberId) {
        throw new Error(locale === "ar" ? "اختر العضو" : "Choose a member");
      }
      const useContribution = kind === "contribution" && memberId;
      const response = await apiFetch("/api/dashboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(useContribution
          ? {
              action: "recordContributionPayment",
              idempotencyKey: crypto.randomUUID(),
              spaceId,
              memberId,
              amount,
              description: description || undefined,
              extraPolicy: "advance_credit",
            }
          : {
              action: "addTransaction",
              idempotencyKey: crypto.randomUUID(),
              kind,
              spaceId,
              amount,
              description: description || (locale === "ar" ? "عملية مالية" : "Transaction"),
              allocation: "general",
              memberId: memberId || undefined,
            }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "SAVE_FAILED");
      onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "SAVE_FAILED");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal-card add-txn-modal" role="dialog" aria-modal="true" aria-label={locale === "ar" ? "إضافة عملية" : "Add transaction"}>
        <div className="modal-header">
          <h2>{locale === "ar" ? "إضافة عملية" : "Add transaction"}</h2>
          <button type="button" onClick={onClose} aria-label="Close">×</button>
        </div>
        <form className="modal-form" onSubmit={submit}>
          <div className="segmented-control">
            {["expense", "income", ...(isGroup ? ["contribution"] : [])].map((item) => (
              <button type="button" key={item} className={kind === item ? "active" : ""} onClick={() => setKind(item)}>
                {item === "expense" ? (locale === "ar" ? "مصروف" : "Expense") : item === "income" ? (locale === "ar" ? "دخل" : "Income") : (locale === "ar" ? "مساهمة" : "Contribution")}
              </button>
            ))}
          </div>
          <label>
            <span>{locale === "ar" ? "المحفظة" : "Wallet"}</span>
            <select
              value={spaceId}
              onChange={(event) => {
                const next = event.target.value;
                setSpaceId(next);
                setMemberId("");
                const meta = spaces.find((item) => item.id === next);
                setKind(meta && meta.type !== "personal" ? "contribution" : "expense");
              }}
            >
              {spaces.map((item) => <option key={item.id} value={item.id}>{spaceName(item, locale)}</option>)}
            </select>
          </label>
          <label>
            <span>{locale === "ar" ? "المبلغ" : "Amount"}</span>
            <div className="money-input">
              <input required min="0.01" step="0.001" type="number" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.000" />
              <b className="money-currency"><OmrSymbol size={14} /></b>
            </div>
          </label>
          {members.length > 0 && (
            <label>
              <span>{kind === "contribution" ? (locale === "ar" ? "العضو" : "Member") : (locale === "ar" ? "العضو (اختياري)" : "Member (optional)")}</span>
              <select required={kind === "contribution"} value={memberId} onChange={(event) => setMemberId(event.target.value)}>
                <option value="">—</option>
                {members.map((member) => <option key={member.id} value={member.id}>{member.display_name}</option>)}
              </select>
            </label>
          )}
          <label>
            <span>{locale === "ar" ? "الوصف" : "Description"}</span>
            <input required={kind !== "contribution"} value={description} onChange={(event) => setDescription(event.target.value)} placeholder={locale === "ar" ? "مثال: وقود" : "e.g. Fuel"} />
          </label>
          {error && <p className="modal-error">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={onClose}>{locale === "ar" ? "إلغاء" : "Cancel"}</button>
            <button className="primary-button" disabled={saving}>{saving ? (locale === "ar" ? "جارٍ الحفظ…" : "Saving…") : (locale === "ar" ? "حفظ" : "Save")}</button>
          </div>
        </form>
      </section>
    </div>
  );
}
