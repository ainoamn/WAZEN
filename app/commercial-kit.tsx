"use client";

import { BarChart3, Building2, CreditCard, FileText, Globe2, House, LayoutDashboard, LogOut, Menu, ReceiptText, ShieldCheck, UserCog, Users, WalletCards, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, ReactNode, useContext, useEffect, useMemo, useRef, useState } from "react";
import WazenLogo, { WazenIcon } from "../components/brand/WazenLogo";
import WazenPageLoader from "../components/brand/WazenPageLoader";
import { formatMoneyMinor } from "../lib/money";
import { statusLabel } from "../lib/admin-labels";
import { apiFetch } from "../lib/client-api";
import { clearAdminConsole, fetchAdminConsole, readAdminConsole } from "../lib/admin-session";
import { notifyBrowserSessionChange } from "../lib/browser-session-client";
import { clearDashboardCache } from "../lib/dashboard-session";

export type CommerceLocale = "ar" | "en";

type CommerceLocaleApi = {
  locale: CommerceLocale;
  setLocale: (locale: CommerceLocale) => void;
  l: (ar: string, en: string) => string;
};

const CommerceLocaleContext = createContext<CommerceLocaleApi | null>(null);

function useCommerceLocaleState(): CommerceLocaleApi {
  const [locale, setLocale] = useState<CommerceLocale>("ar");
  useEffect(() => {
    const saved = window.localStorage.getItem("wazen-locale");
    if (saved === "en") {
      const frame = window.requestAnimationFrame(() => setLocale("en"));
      return () => window.cancelAnimationFrame(frame);
    }
  }, []);
  useEffect(() => {
    window.localStorage.setItem("wazen-locale", locale);
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
  }, [locale]);
  return useMemo(
    () => ({ locale, setLocale, l: (ar: string, en: string) => locale === "ar" ? ar : en }),
    [locale],
  );
}

export function CommerceLocaleProvider({ children }: { children: ReactNode }) {
  const value = useCommerceLocaleState();
  return <CommerceLocaleContext.Provider value={value}>{children}</CommerceLocaleContext.Provider>;
}

export function useCommerceLocale() {
  const fromContext = useContext(CommerceLocaleContext);
  if (!fromContext) {
    throw new Error("CommerceLocaleProvider is required");
  }
  return fromContext;
}

export function Brand({
  compact = false,
}: {
  compact?: boolean;
  showArabic?: boolean;
  variant?: "light" | "dark";
}) {
  return (
    <Link className={`commerce-brand ${compact ? "compact" : ""}`} href="/">
      <WazenLogo
        iconClassName={compact ? "h-[42px] w-auto" : "h-[52px] w-auto"}
        showText
      />
    </Link>
  );
}

export function PublicHeader({ locale, setLocale }: { locale: CommerceLocale; setLocale: (locale: CommerceLocale) => void }) {
  const [open, setOpen] = useState(false);
  const l = (ar: string, en: string) => locale === "ar" ? ar : en;
  return <header className="commerce-header">
    <Brand />
    <button className="commerce-menu" onClick={() => setOpen(!open)} aria-label={l("القائمة", "Menu")} aria-expanded={open}>{open ? <X /> : <Menu />}</button>
    <nav className={open ? "open" : ""} onClick={() => setOpen(false)}>
      <Link href="/#features">{l("المزايا", "Features")}</Link>
      <Link href="/pricing">{l("الباقات", "Pricing")}</Link>
      <Link href="/about">{l("من نحن", "About")}</Link>
      <Link href="/#security">{l("الأمان", "Security")}</Link>
      <Link href="/documents">{l("المستندات", "Documents")}</Link>
    </nav>
    <div className="commerce-header-actions">
      <button onClick={() => setLocale(locale === "ar" ? "en" : "ar")}><Globe2 size={16} />{locale === "ar" ? "EN" : "عربي"}</button>
      <Link href="/login">{l("تسجيل الدخول", "Sign in")}</Link>
      <Link className="filled" href="/register">{l("ابدأ مجاناً", "Start free")}</Link>
    </div>
  </header>;
}

/** Signed-in header for customer commerce pages — never links to /admin/plans. */
export function AccountHeader({
  locale,
  setLocale,
  active,
}: {
  locale: CommerceLocale;
  setLocale: (locale: CommerceLocale) => void;
  active?: "dashboard" | "pricing" | "billing" | "documents";
}) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const l = (ar: string, en: string) => (locale === "ar" ? ar : en);
  const logout = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await apiFetch("/api/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "logout" }),
      });
    } finally {
      clearAdminConsole();
      clearDashboardCache();
      notifyBrowserSessionChange(null);
      router.push("/login");
      router.refresh();
    }
  };
  const linkClass = (id: typeof active) => (active === id ? "is-active" : undefined);
  return (
    <header className="documents-header account-header">
      <Brand />
      <nav>
        <Link href="/dashboard" className={linkClass("dashboard")}>{l("لوحة المستخدم", "Dashboard")}</Link>
        <Link href="/pricing" className={linkClass("pricing")}>{l("الباقات", "Plans")}</Link>
        <Link href="/billing" className={linkClass("billing")}>{l("الفوترة", "Billing")}</Link>
        <Link href="/documents" className={linkClass("documents")}>{l("المستندات", "Documents")}</Link>
      </nav>
      <button type="button" onClick={() => setLocale(locale === "ar" ? "en" : "ar")}>
        <Globe2 size={16} />{locale === "ar" ? "EN" : "عربي"}
      </button>
      <button type="button" className="admin-logout" disabled={signingOut} onClick={() => void logout()}>
        <LogOut size={16} />
        {signingOut ? l("جارٍ الخروج...", "Signing out...") : l("تسجيل الخروج", "Sign out")}
      </button>
    </header>
  );
}

const adminLinks = [
  ["/admin", "overview", LayoutDashboard, "نظرة عامة", "Overview"],
  ["/admin/users", "users", Users, "المستخدمون والعملاء", "Customers"],
  ["/admin/tenants", "tenants", Building2, "الشركات والمستأجرون", "Tenants"],
  ["/admin/staff", "staff", UserCog, "فريق الإدارة", "Staff"],
  ["/admin/plans", "plans", WalletCards, "مصفوفة الباقات", "Plan matrix"],
  ["/admin/gateways", "gateways", CreditCard, "بوابات الدفع", "Payment gateways"],
  ["/admin/payments", "payments", ReceiptText, "المدفوعات والفواتير", "Payments"],
  ["/admin/reports", "reports", BarChart3, "التقارير والإيرادات", "Reports"],
  ["/documents", "documents", FileText, "الإيصالات والكشوفات", "Documents"],
] as const;

export function adminNavId(pathname: string) {
  if (pathname.startsWith("/documents")) return "documents";
  if (pathname.startsWith("/admin/users")) return "users";
  if (pathname.startsWith("/admin/tenants")) return "tenants";
  if (pathname.startsWith("/admin/staff")) return "staff";
  if (pathname.startsWith("/admin/plans")) return "plans";
  if (pathname.startsWith("/admin/gateways")) return "gateways";
  if (pathname.startsWith("/admin/payments")) return "payments";
  if (pathname.startsWith("/admin/reports")) return "reports";
  return "overview";
}

function AdminAccountMenu({
  locale,
  signingOut,
  onLogout,
}: {
  locale: CommerceLocale;
  signingOut: boolean;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [identity, setIdentity] = useState(() => readAdminConsole()?.user ?? null);
  const root = useRef<HTMLDivElement>(null);
  const l = (ar: string, en: string) => locale === "ar" ? ar : en;
  useEffect(() => {
    void fetchAdminConsole().then((data) => setIdentity(data.user)).catch(() => {});
  }, []);
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, []);
  const name = String(identity?.displayName ?? identity?.display_name ?? "").trim() || l("حسابك", "Your account");
  const email = String(identity?.email ?? "");
  return (
    <div className="admin-account-menu user-menu" ref={root}>
      <button
        type="button"
        className="admin-account-mark"
        title={email || name}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={l("قائمة الحساب", "Account menu")}
        onClick={() => setOpen((current) => !current)}
      >
        {locale === "ar" ? "و" : "W"}
      </button>
      {open ? (
        <div className="user-menu-panel" role="menu">
          <div className="user-menu-identity">
            <strong>{name}</strong>
            {email ? <small>{email}</small> : null}
          </div>
          <Link href="/home" role="menuitem" onClick={() => setOpen(false)}><House size={16} />{l("الرئيسية", "Home")}</Link>
          <Link href="/account/security" role="menuitem" onClick={() => setOpen(false)}><ShieldCheck size={16} />{l("أمان الحساب", "Account security")}</Link>
          <button type="button" role="menuitem" className="user-menu-logout" disabled={signingOut} onClick={() => { setOpen(false); onLogout(); }}>
            <LogOut size={16} />
            {signingOut ? l("جارٍ الخروج...", "Signing out...") : l("تسجيل الخروج", "Sign out")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function AdminShell({ active, locale, setLocale, children }: { active?: string; locale: CommerceLocale; setLocale: (locale: CommerceLocale) => void; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const current = active ?? adminNavId(pathname);
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const l = (ar: string, en: string) => locale === "ar" ? ar : en;
  const logout = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await apiFetch("/api/auth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "logout" }) });
    } finally {
      clearAdminConsole();
      clearDashboardCache();
      notifyBrowserSessionChange(null);
      router.push("/login");
      router.refresh();
    }
  };
  const logoutLabel = signingOut ? l("جارٍ الخروج...", "Signing out...") : l("تسجيل الخروج", "Sign out");
  return <main className="admin-app">
    {open && <button className="admin-backdrop" onClick={() => setOpen(false)} aria-label={l("إغلاق القائمة", "Close menu")} />}
    <aside className={open ? "open" : ""}>
      <Brand compact />
      <div className="admin-workspace"><WazenIcon className="h-7 w-[2.1rem]" /><div><small>{l("مساحة العمل", "Workspace")}</small><b>{l("إدارة وازن", "Wazen admin")}</b></div></div>
      <nav>{adminLinks.map(([href, id, Icon, ar, en]) => <Link key={id} href={href} prefetch className={current === id ? "active" : ""} onClick={() => setOpen(false)}><Icon size={18} strokeWidth={2} /><span>{l(ar, en)}</span></Link>)}</nav>
      <div className="admin-side-foot">
        <Link href="/home"><FileText size={17} />{l("العودة للرئيسية", "Back to home")}</Link>
        <button type="button" className="admin-logout" disabled={signingOut} onClick={() => void logout()}>
          <LogOut size={17} />
          {logoutLabel}
        </button>
        <small>{l("لوحة عالمية", "Global console")}</small>
      </div>
    </aside>
    <section className="admin-main">
      <header>
        <button className="admin-mobile-menu" onClick={() => setOpen(true)} aria-label={l("فتح القائمة", "Open menu")}><Menu size={20} /></button>
        <div><small>{l("مركز إدارة المنصة العالمية", "Global platform administration")}</small><b>{l("مرحباً بك في وازن", "Welcome to Wazen")}</b></div>
        <div className="admin-head-actions">
          <button type="button" onClick={() => setLocale(locale === "ar" ? "en" : "ar")}><Globe2 size={16} />{locale === "ar" ? "EN" : "عربي"}</button>
          <Link href="/documents" aria-label={l("الإيصالات والكشوفات", "Receipts & statements")}><FileText size={17} /></Link>
          <button type="button" className="admin-logout" disabled={signingOut} onClick={() => void logout()}>
            <LogOut size={16} />
            {logoutLabel}
          </button>
          <AdminAccountMenu locale={locale} signingOut={signingOut} onLogout={() => void logout()} />
        </div>
      </header>
      <div className="admin-content">{children}</div>
    </section>
  </main>;
}

export function PageLoader({ label }: { label?: string }) {
  const { l } = useCommerceLocale();
  return <WazenPageLoader label={label ?? l("جاري التحميل…", "Loading…")} />;
}

/** In-page wait state — no full-screen logo (that looked like a site reload). */
export function ContentBusy({ label }: { label?: string }) {
  const { l } = useCommerceLocale();
  return (
    <div className="admin-content-busy" role="status" aria-live="polite">
      <i />
      <span>{label ?? l("جاري التحميل…", "Loading…")}</span>
    </div>
  );
}

export function ErrorCard({ message, retry }: { message: string; retry?: () => void }) {
  const { l } = useCommerceLocale();
  return <div className="commerce-error"><X size={24} /><b>{message}</b>{retry && <button onClick={retry}>{l("إعادة المحاولة", "Try again")}</button>}</div>;
}

export function money(minor: number, locale: CommerceLocale, currency = "OMR") {
  return formatMoneyMinor(minor ?? 0, currency, locale);
}

export function Status({ value, locale }: { value: string; locale: CommerceLocale }) {
  return <span className={`commerce-status ${value}`}>{statusLabel(value, locale)}</span>;
}
