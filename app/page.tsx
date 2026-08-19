"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, BarChart3, Check, FileText, Globe2, House, LockKeyhole, Plane, ReceiptText, Repeat2, ShieldCheck, Sparkles, Users, WalletCards } from "lucide-react";
import { BhdAppIcon } from "../components/bhd/BhdAppIcon";
import { OmrAmount } from "../components/brand/OmrSymbol";
import { WazenIcon } from "../components/brand/WazenLogo";
import { BHD_APPS } from "../lib/bhd/apps";
import { AccountHeader, Brand, PublicHeader, useCommerceLocale } from "./commercial-kit";

export default function LandingPage() {
  const { locale, setLocale, l } = useCommerceLocale();
  const Arrow = locale === "ar" ? ArrowLeft : ArrowRight;
  const [signedInUser, setSignedInUser] = useState<{ name: string; email: string; picture: string | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/auth", { cache: "no-store", credentials: "same-origin" })
      .then(async (response) => {
        if (!response.ok || cancelled) return;
        const result = await response.json() as { authenticated?: boolean; user?: { displayName?: string; email?: string; avatarUrl?: string | null } };
        if (!cancelled && result.authenticated && result.user) {
          setSignedInUser({
            name: result.user.displayName ?? "",
            email: result.user.email ?? "",
            picture: result.user.avatarUrl ?? null,
          });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const footerApps = BHD_APPS.filter((app) => app.enabled && app.id !== "account");
  return <main className="commerce-landing">
    {signedInUser
      ? <AccountHeader locale={locale} setLocale={setLocale} user={signedInUser} />
      : <PublicHeader locale={locale} setLocale={setLocale} />}
    <section className="commerce-hero">
      <div className="commerce-hero-copy">
        <span className="commerce-pill"><Sparkles size={15} />{l("منصة مالية واحدة لحياتك كلها", "One financial platform for your whole life")}</span>
        <h1>{l("أموالك الشخصية والمشتركة،", "Personal and shared money,")}<br/><em>{l("متوازنة بوضوح.", "balanced with clarity.")}</em></h1>
        <p>{l("أدر دخلك ومصاريف المنزل والجمعيات والرحلات من نظام واحد يفصل حقوق كل شخص ويوثّق كل عملية.", "Manage income, household spending, savings circles and trips in one system that protects every member’s balance and records every movement.")}</p>
        <div className="commerce-hero-actions"><Link href="/home" prefetch={false}>{l("ابدأ مجاناً", "Start free")}<Arrow size={18} /></Link><Link className="secondary" href="/pricing">{l("استعرض الباقات", "View pricing")}</Link></div>
        <small><Check size={14} />{l("لا تحتاج بطاقة للبدء", "No card required")}<Check size={14} />{l("بياناتك خاصة ومشفرة", "Private, protected data")}</small>
      </div>
      <div className="commerce-hero-visual">
        <div className="hero-ledger" aria-hidden="true">
          <div className="hero-ledger-spine" aria-hidden="true">
            <i /><i /><i /><i /><i />
          </div>
          <div className="hero-ledger-page">
            <header className="hero-ledger-head">
              <Brand compact />
              <span>{l("أغسطس 2026", "August 2026")}</span>
            </header>
            <div className="hero-ledger-balance">
              <div>
                <span>{l("صافي الرصيد", "Net balance")}</span>
                <b><OmrAmount>1,416.700</OmrAmount></b>
              </div>
              <div className="hero-ledger-meta">
                <em>+6.4%</em>
                <small>{l("4 محافظ نشطة", "4 active wallets")}</small>
              </div>
            </div>
            <div className="hero-ledger-rule" aria-hidden="true" />
            <section className="hero-ledger-lines">
              <div className="hero-ledger-cols" aria-hidden="true">
                <span>{l("الحساب", "Account")}</span>
                <span>{l("المصروف", "Expense")}</span>
                <span>{l("المتبقي", "Remaining")}</span>
              </div>
              {([
                [Plane, l("رحلة العائلة", "Family trip"), "72.300", "386.000"],
                [House, l("ميزانية المنزل", "Home budget"), "41.200", "124.700"],
                [Repeat2, l("جمعية الإخوة", "Siblings circle"), "30.000", "210.000"],
              ] as const).map(([Icon, name, expense, remaining]) => (
                <div className="hero-ledger-row" key={String(name)}>
                  <i><Icon size={18} /></i>
                  <b className="hero-ledger-account">{name}</b>
                  <div className="hero-ledger-amounts">
                    <strong className="hero-ledger-debit">
                      <small>{l("مصروف", "Out")}</small>
                      <OmrAmount>{expense}</OmrAmount>
                    </strong>
                    <strong className="hero-ledger-remain">
                      <small>{l("متبقي", "Left")}</small>
                      <OmrAmount>{remaining}</OmrAmount>
                    </strong>
                  </div>
                </div>
              ))}
            </section>
            <div className="hero-ledger-footer">
              <ShieldCheck size={18} />
              <span>{l("الفوائض الشخصية محمية", "Personal reserves protected")}</span>
              <b><OmrAmount>6.400</OmrAmount></b>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section className="commerce-trust"><span>{l("مصمم للأفراد والعائلات والمجموعات", "Built for people, families and groups")}</span><div><b>RTL / LTR</b><b>Multi-currency</b><b>Audit trail</b><b>PDF-ready</b><b>Secure roles</b></div></section>

    <section className="commerce-features" id="features">
      <div className="commerce-section-head"><span>{l("كل ما تحتاجه", "Everything you need")}</span><h2>{l("من المحفظة الشخصية إلى إدارة مؤسسة", "From a personal wallet to a full organization")}</h2><p>{l("نواة مالية واحدة، ومساحات منفصلة تناسب كل استخدام.", "One financial engine with separate spaces for every use case.")}</p></div>
      <div className="commerce-feature-grid">
        <Feature icon={<WalletCards/>} title={l("المال الشخصي", "Personal finance")} text={l("الدخل والمصروف والميزانيات والأهداف والديون.", "Income, expenses, budgets, goals and debts.")} />
        <Feature icon={<House/>} title={l("المنزل والعائلة", "Home & family")} text={l("فواتير مشتركة ومساهمات وصلاحيات تراعي الخصوصية.", "Shared bills, contributions and privacy-aware permissions.")} />
        <Feature icon={<Plane/>} title={l("الرحلات والتسويات", "Trips & settlements")} text={l("تقسيم المصروفات وتعويض من دفع بأقل عدد تحويلات.", "Split costs and reimburse payers with fewer transfers.")} />
        <Feature icon={<Repeat2/>} title={l("الجمعيات والأدوار", "Savings circles")} text={l("أقساط وأدوار وقرعة وترتيب يدوي أو هرمي.", "Contributions, turns, draws and configurable ordering.")} />
        <Feature icon={<ReceiptText/>} title={l("الإيصالات والكشوفات", "Receipts & statements")} text={l("مستندات مرقمة وتوقيعات وطباعة وتنزيل.", "Numbered documents, signatures, print and download.")} />
        <Feature icon={<BarChart3/>} title={l("إدارة تجارية", "Commercial admin")} text={l("عملاء وباقات واشتراكات وفواتير وإيرادات.", "Customers, plans, subscriptions, invoices and revenue.")} />
      </div>
    </section>

    <section className="commerce-product-row">
      <div><span>{l("شفافية بلا خلط", "Clarity without mixing")}</span><h2>{l("كل ريال في حسابه الصحيح", "Every amount in the right balance")}</h2><p>{l("المساهمة الإلزامية تدخل الصندوق المشترك، أما الزيادة فتبقى رصيداً شخصياً لصاحبها حتى يقرر استخدامها أو استردادها.", "Mandatory contributions enter the shared fund, while extra deposits remain the member’s own reserve until they use or withdraw them.")}</p><ul><li><Check/> {l("صندوق مشترك قابل للصرف", "Spendable common fund")}</li><li><Check/> {l("فائض شخصي محمي", "Protected personal reserve")}</li><li><Check/> {l("سجل اعتماد وتعديل", "Approval and audit history")}</li></ul><a href="/dashboard">{l("جرّب لوحة المستخدم", "Explore the dashboard")}<Arrow size={17}/></a></div>
      <div className="separation-demo"><article><i className="shared"/><span>{l("الصندوق المشترك", "Common fund")}</span><b><OmrAmount>386.000</OmrAmount></b><small>{l("متاح للمصروفات", "Available to spend")}</small></article><article><i className="reserve"/><span>{l("فوائض الأعضاء", "Member reserves")}</span><b><OmrAmount>6.400</OmrAmount></b><small>{l("غير قابلة للصرف الجماعي", "Not group-spendable")}</small></article><article className="total"><i/><span>{l("النقد الفعلي", "Actual cash")}</span><b><OmrAmount>392.400</OmrAmount></b><small>{l("متطابق مع السجل", "Reconciled")}</small></article></div>
    </section>

    <section className="commerce-security" id="security"><div><LockKeyhole size={28}/><h2>{l("الأمان والصلاحيات من البداية", "Security and permissions by design")}</h2><p>{l("تسجيل دخول محمي، عزل بيانات المستخدمين، صلاحيات على مستوى الخادم وسجل تدقيق لكل عملية حساسة.", "Protected sign-in, isolated user data, server-side authorization and an audit trail for every sensitive action.")}</p></div><div><ShieldCheck/><b>{l("تشفير وحماية", "Encryption & protection")}</b></div><div><Users/><b>{l("صلاحيات دقيقة", "Granular roles")}</b></div><div><FileText/><b>{l("سجل تدقيق", "Audit trail")}</b></div><div><Globe2/><b>{l("عالمي وثنائي اللغة", "Global & bilingual")}</b></div></section>

    <section className="commerce-cta"><span className="brand-glyph"><WazenIcon className="h-9 w-auto" /></span><h2>{l("ابدأ بناء صورتك المالية الواضحة اليوم", "Build a clearer financial life today")}</h2><p>{l("ابدأ مجاناً، ثم اختر الباقة المناسبة عندما تنمو احتياجاتك.", "Start free and upgrade when your needs grow.")}</p><div className="commerce-hero-actions" style={{justifyContent:"center"}}><Link href="/home" prefetch={false}>{l("إنشاء حساب مجاني", "Create free account")}<Arrow size={18}/></Link><a className="secondary" href="/about">{l("من نحن", "About us")}</a></div></section>
    <footer className="commerce-footer">
      <div className="commerce-footer-top">
        <div className="commerce-footer-title">
          <small>{l("كل التطبيقات ومنتجاتها", "All BHD apps and products")}</small>
        </div>
        <div className="commerce-footer-heading">
          <strong>{l("برامجنا", "Our apps")}</strong>
        </div>
      </div>
      <div className="commerce-app-links" aria-label={l("تطبيقات BHD", "BHD apps")}>
        {footerApps.map((app) => (
          <a
            key={app.id}
            className="commerce-app-link"
            href={app.mode === "sso" && app.startUrl ? app.startUrl : `${app.origin}/`}
          >
            <BhdAppIcon id={app.id} title={locale === "ar" ? app.nameAr : app.nameEn} />
            <span>{locale === "ar" ? app.nameAr : app.nameEn}</span>
          </a>
        ))}
      </div>
      <div className="commerce-footer-bottom">
        <nav>
          <a href="/about">{l("من نحن", "About")}</a>
          <a href="/pricing">{l("الباقات", "Pricing")}</a>
          <a href="/privacy">{l("الخصوصية", "Privacy")}</a>
          <a href="/terms">{l("الشروط", "Terms")}</a>
          <a href="/security">{l("الأمان", "Security")}</a>
        </nav>
        <div className="commerce-footer-brand">
          <p>{l("منصة عالمية لإدارة الأموال الشخصية والمشتركة.", "A global platform for personal and shared money.")}</p>
          <Brand />
        </div>
      </div>
      <small>© 2026 WAZEN. {l("جميع الحقوق محفوظة.", "All rights reserved.")}</small>
    </footer>
  </main>;
}

function Feature({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return <article><i>{icon}</i><h3>{title}</h3><p>{text}</p><a href="/dashboard"><ArrowLeft size={15}/></a></article>;
}
