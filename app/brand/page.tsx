"use client";

import Link from "next/link";
import { Brand, PublicHeader, useCommerceLocale } from "../commercial-kit";

export default function BrandPage() {
  const { locale, setLocale, l } = useCommerceLocale();

  return (
    <main className="brand-doc-page">
      <PublicHeader locale={locale} setLocale={setLocale} />

      <section className="brand-doc-hero">
        <div>
          <small>{l("هوية وازن البصرية", "WAZEN brand identity")}</small>
          <h1>{l("شرح الشعار الرسمي", "Official logo documentation")}</h1>
          <p>
            {l(
              "الشعار الرسمي لـ وازن مأخوذ مباشرة من لوح الهوية المعتمد. يعكس اتزان المال الشخصي والمشترك دون ميزان تقليدي أو رموز عملة.",
              "The official Wazen mark comes directly from the approved brand board. It expresses personal and shared balance without a classic scale or currency symbols.",
            )}
          </p>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/wazen-mark.png" alt="WAZEN logo mark" className="brand-doc-mark" />
      </section>

      <section className="brand-doc-board">
        <div className="brand-doc-section-head">
          <h2>{l("لوح الهوية الكامل", "Full brand board")}</h2>
          <p>
            {l(
              "المصدر البصري الرسمي: الرمز، الخطوط، الألوان، أيقونة التطبيق، والاستخدام في الواجهة.",
              "Official visual source: mark, typography, colors, app icon, and product usage.",
            )}
          </p>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/wazen-brand-board.png"
          alt={l("لوح هوية وازن", "WAZEN brand identity board")}
          className="brand-doc-board-img"
        />
      </section>

      <section className="brand-doc-grid">
        <article>
          <h3>{l("معنى الرمز", "Meaning")}</h3>
          <ul>
            <li><b>{l("الجناح الكحلي", "Navy wing")}</b> — {l("المال الشخصي والثقة.", "Personal money and trust.")}</li>
            <li><b>{l("الجناح التركوازي", "Teal wing")}</b> — {l("المال المشترك والنمو.", "Shared money and growth.")}</li>
            <li><b>{l("الدائرة المركزية", "Center dot")}</b> — {l("نقطة الاتزان / الإنسان.", "Equilibrium / human pivot.")}</li>
            <li><b>W</b> — {l("هوية الاسم WAZEN بشكل هندسي.", "Geometric identity of WAZEN.")}</li>
          </ul>
        </article>
        <article>
          <h3>{l("الألوان", "Colors")}</h3>
          <div className="brand-swatches">
            <div><i style={{ background: "#0F172A" }} /><span>#0F172A</span><small>{l("ثقة واستقرار", "Trust & stability")}</small></div>
            <div><i style={{ background: "#10B981" }} /><span>#10B981</span><small>{l("نمو واتزان", "Growth & balance")}</small></div>
            <div><i style={{ background: "#2563EB" }} /><span>#2563EB</span><small>{l("تقنية وأمان", "Tech & safety")}</small></div>
          </div>
        </article>
        <article>
          <h3>{l("قواعد الاستخدام", "Usage rules")}</h3>
          <ul>
            <li>{l("الهيدر: الرمز + WAZEN", "Header: mark + WAZEN")}</li>
            <li>{l("«وازن» في صفحات الدخول/الهوية فقط", "Arabic «وازن» on auth/identity only")}</li>
            <li>{l("لا ميزان تقليدي ولا $ ولا حرف R", "No classic scale, $, or letter R")}</li>
            <li>{l("الاسم الرسمي WAZEN فقط (ليس ROAN)", "Official name is WAZEN only (not ROAN)")}</li>
          </ul>
        </article>
        <article>
          <h3>{l("الملفات", "Assets")}</h3>
          <ul>
            <li><code>/brand/wazen-mark.png</code> — {l("الرمز", "Mark")}</li>
            <li><code>/brand/wazen-brand-board.png</code> — {l("لوح الهوية", "Brand board")}</li>
            <li><code>/brand/wazen-app-icon.png</code> — {l("أيقونة التطبيق", "App icon")}</li>
            <li><code>/brand/wazen-lockup.png</code> — {l("رمز + اسم", "Lockup")}</li>
          </ul>
        </article>
      </section>

      <section className="brand-doc-variants">
        <div className="brand-doc-section-head">
          <h2>{l("النسخ المستخدمة في المنتج", "Product variants")}</h2>
        </div>
        <div className="brand-variant-row">
          <figure>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/wazen-mark.png" alt="Mark" />
            <figcaption>{l("رمز الهيدر", "Header mark")}</figcaption>
          </figure>
          <figure className="on-dark">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/wazen-app-icon.png" alt="App icon" />
            <figcaption>{l("أيقونة التطبيق", "App icon")}</figcaption>
          </figure>
          <figure>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/wazen-lockup.png" alt="Lockup" />
            <figcaption>{l("الشعار الأفقي", "Horizontal lockup")}</figcaption>
          </figure>
        </div>
      </section>

      <footer className="commerce-footer">
        <Brand />
        <p>{l("منصة عالمية لإدارة الأموال الشخصية والمشتركة.", "A global platform for personal and shared money.")}</p>
        <nav>
          <Link href="/">{l("الرئيسية", "Home")}</Link>
          <Link href="/pricing">{l("الباقات", "Pricing")}</Link>
          <Link href="/privacy">{l("الخصوصية", "Privacy")}</Link>
        </nav>
        <small>© 2026 WAZEN. {l("جميع الحقوق محفوظة.", "All rights reserved.")}</small>
      </footer>
    </main>
  );
}
