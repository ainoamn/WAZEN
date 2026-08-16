"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell,
  Globe2,
  Landmark,
  LogOut,
  Plus,
  Settings2,
  TrendingDown,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import OmrSymbol from "../../components/brand/OmrSymbol";
import WazenLogo from "../../components/brand/WazenLogo";
import WazenPageLoader from "../../components/brand/WazenPageLoader";
import { apiFetch } from "../../lib/client-api";
import { formatMoneyMinor } from "../../lib/money";

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

type Member = { id: string; space_id: string; display_name: string };
type Transaction = { kind: string; amount_minor: number; occurred_at: string; status?: string };
type Settlement = { status: string };
type Occurrence = { status: string };

type HomeData = {
  user: { displayName: string; email: string };
  spaces: Space[];
  members: Member[];
  transactions: Transaction[];
  settlements?: Settlement[];
  personalOccurrences?: Occurrence[];
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
  const [data, setData] = useState<HomeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    try {
      setError(false);
      const response = await fetch("/api/dashboard", { cache: "no-store" });
      if (response.status === 401) {
        router.push("/login?next=/home");
        return;
      }
      if (!response.ok) throw new Error("load failed");
      setData(await response.json() as HomeData);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { void load(); }, [load]);
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
    const active = data.spaces.filter((space) => (space.status ?? "active") !== "archived");
    const monthKey = new Date().toISOString().slice(0, 7);
    const posted = data.transactions.filter((row) => (row.status ?? "approved") !== "voided" && row.occurred_at.slice(0, 7) === monthKey);
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
    await apiFetch("/api/auth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "logout" }) });
    router.push("/login");
    router.refresh();
  };

  const flash = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  };

  if (loading) return <WazenPageLoader label={locale === "ar" ? "جاري التحميل…" : "Loading…"} />;
  if (error || !data) {
    return (
      <div className="home-shell">
        <p className="home-error">{locale === "ar" ? "تعذر تحميل البيانات." : "Could not load data."}</p>
        <button type="button" className="primary-button" onClick={() => { setLoading(true); void load(); }}>
          {locale === "ar" ? "إعادة المحاولة" : "Try again"}
        </button>
      </div>
    );
  }

  const firstName = data.user.displayName.split(" ")[0] || data.user.displayName;

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
          <button type="button" className="icon-button" onClick={() => void logout()} aria-label={locale === "ar" ? "خروج" : "Sign out"}>
            <LogOut size={18} />
          </button>
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
          <Link className="home-pending" href="/dashboard">
            <Bell size={18} />
            <span>
              {locale === "ar"
                ? `${stats.pending} بند بانتظار الاعتماد أو التسوية — افتح التحكم`
                : `${stats.pending} items waiting for approval or settlement — open Control`}
            </span>
          </Link>
        )}

        <div className="home-actions">
          <button type="button" className="home-action primary" onClick={() => setAddOpen(true)}>
            <Plus size={22} />
            <b>{locale === "ar" ? "إضافة عملية" : "Add transaction"}</b>
            <small>{locale === "ar" ? "دخل أو مصروف في ثوانٍ" : "Income or expense in seconds"}</small>
          </button>
          <Link className="home-action" href="/dashboard">
            <Settings2 size={22} />
            <b>{locale === "ar" ? "التحكم" : "Control"}</b>
            <small>{locale === "ar" ? "ضبط المحافظ والاعتمادات" : "Wallets, setup, and approvals"}</small>
          </Link>
        </div>
      </main>

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
  const spaces = data.spaces.filter((space) => (space.status ?? "active") !== "archived");
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
  const members = data.members.filter((member) => member.space_id === spaceId);

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
