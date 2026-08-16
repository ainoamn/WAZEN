"use client";

import { BarChart3, Building2, CreditCard, FileText, Globe2, LayoutDashboard, Menu, ReceiptText, UserCog, Users, WalletCards, X } from "lucide-react";
import Link from "next/link";
import { ReactNode, useEffect, useState } from "react";
import WazenLogo, { WazenIcon } from "../components/brand/WazenLogo";
import WazenPageLoader from "../components/brand/WazenPageLoader";
import { formatMoneyMinor } from "../lib/money";

export type CommerceLocale = "ar" | "en";

export function useCommerceLocale() {
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
  return { locale, setLocale, l: (ar: string, en: string) => locale === "ar" ? ar : en };
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
    <button className="commerce-menu" onClick={() => setOpen(!open)} aria-label="Menu" aria-expanded={open}>{open ? <X /> : <Menu />}</button>
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

const adminLinks = [
  ["/admin", "overview", LayoutDashboard, "نظرة عامة", "Overview"],
  ["/admin/users", "users", Users, "المستخدمون والعملاء", "Customers"],
  ["/admin/tenants", "tenants", Building2, "الشركات والمستأجرون", "Tenants"],
  ["/admin/staff", "staff", UserCog, "فريق الإدارة", "Staff"],
  ["/admin/plans", "plans", WalletCards, "الباقات والاشتراكات", "Plans"],
  ["/admin/gateways", "gateways", CreditCard, "بوابات الدفع", "Payment gateways"],
  ["/admin/payments", "payments", ReceiptText, "المدفوعات والفواتير", "Payments"],
  ["/admin/reports", "reports", BarChart3, "التقارير والإيرادات", "Reports"],
  ["/documents", "documents", FileText, "الإيصالات والكشوفات", "Documents"],
] as const;

export function AdminShell({ active, locale, setLocale, children }: { active: string; locale: CommerceLocale; setLocale: (locale: CommerceLocale) => void; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const l = (ar: string, en: string) => locale === "ar" ? ar : en;
  return <main className="admin-app">
    {open && <button className="admin-backdrop" onClick={() => setOpen(false)} aria-label="Close" />}
    <aside className={open ? "open" : ""}>
      <Brand compact />
      <div className="admin-workspace"><WazenIcon className="h-7 w-[2.1rem]" /><div><small>{l("مساحة العمل", "Workspace")}</small><b>{l("إدارة وازن", "Wazen admin")}</b></div></div>
      <nav>{adminLinks.map(([href, id, Icon, ar, en]) => <Link key={id} href={href} prefetch className={active === id ? "active" : ""}><Icon size={18} strokeWidth={2} /><span>{l(ar, en)}</span></Link>)}</nav>
      <div className="admin-side-foot"><Link href="/home"><FileText size={17} />{l("العودة للرئيسية", "Back to home")}</Link><small>{l("نسخة الإدارة التجارية", "Commercial admin")}</small></div>
    </aside>
    <section className="admin-main">
      <header><button className="admin-mobile-menu" onClick={() => setOpen(true)}><Menu size={20} /></button><div><small>{l("مركز إدارة المنصة", "Platform administration")}</small><b>{l("مرحباً بك في وازن", "Welcome to Wazen")}</b></div><div className="admin-head-actions"><button onClick={() => setLocale(locale === "ar" ? "en" : "ar")}><Globe2 size={16} />{locale === "ar" ? "EN" : "عربي"}</button><Link href="/documents"><FileText size={17} /></Link><span>أ</span></div></header>
      <div className="admin-content">{children}</div>
    </section>
  </main>;
}

export function PageLoader({ label = "جاري التحميل…" }: { label?: string }) {
  return <WazenPageLoader label={label} />;
}

export function ErrorCard({ message, retry }: { message: string; retry?: () => void }) {
  return <div className="commerce-error"><X size={24} /><b>{message}</b>{retry && <button onClick={retry}>Try again</button>}</div>;
}

export function money(minor: number, locale: CommerceLocale, currency = "OMR") {
  return formatMoneyMinor(minor ?? 0, currency, locale);
}

export function Status({ value, locale }: { value: string; locale: CommerceLocale }) {
  const labels: Record<string, [string, string]> = {
    active: ["نشط", "Active"], trialing: ["تجريبي", "Trial"], suspended: ["موقوف", "Suspended"], closed: ["مغلق", "Closed"],
    cancelled: ["ملغى", "Cancelled"], paid: ["مدفوعة", "Paid"], pending: ["معلقة", "Pending"], pending_payment: ["بانتظار الدفع", "Awaiting payment"],
    succeeded: ["ناجحة", "Succeeded"], failed: ["فاشلة", "Failed"], refunded: ["مستردة", "Refunded"], issued: ["صادر", "Issued"],
  };
  const text = labels[value]?.[locale === "ar" ? 0 : 1] ?? value;
  return <span className={`commerce-status ${value}`}>{text}</span>;
}
