"use client";

import Link from "next/link";
import { Brand, PublicHeader, useCommerceLocale } from "../commercial-kit";

export default function AboutPage() {
  const { locale, setLocale, l } = useCommerceLocale();

  return (
    <main className="brand-doc-page">
      <PublicHeader locale={locale} setLocale={setLocale} />

      <section className="brand-doc-hero">
        <div>
          <small>{l("من نحن", "About us")}</small>
          <h1>{l("وازن — أموالك الشخصية والمشتركة، متوازنة بوضوح", "WAZEN — personal and shared money, clearly balanced")}</h1>
          <p>
            {l(
              "وازن منصة مالية لإدارة المحافظ الشخصية والأموال المشتركة والجمعيات ومصاريف المنزل والرحلات، مع فصل حقوق كل شخص بوضوح.",
              "WAZEN is a finance platform for personal wallets, shared funds, savings circles, household spending and trips — with clear separation of every person’s rights.",
            )}
          </p>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/wazen-lockup.png" alt="WAZEN · وازن" className="brand-doc-mark" />
      </section>

      <section className="brand-doc-board" id="logo">
        <div className="brand-doc-section-head">
          <h2>{l("شرح الشعار", "Logo meaning")}</h2>
          <p>
            {l(
              "شعار وازن يدمج حرف W مع فكرة الاتزان وفصل الحقوق بين المال الشخصي والمشترك — بهوية بصرية واحدة واضحة.",
              "The WAZEN logo merges the letter W with equilibrium and the separation of personal vs shared rights — one clear visual identity.",
            )}
          </p>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/wazen-brand-board.png"
          alt={l("هوية وازن البصرية", "WAZEN visual identity")}
          className="brand-doc-board-img"
        />
      </section>

      <section className="brand-doc-story">
        <div className="brand-doc-section-head">
          <h2>{l("كيف بُني الشعار؟", "How the logo was built")}</h2>
          <p>{l("معادلة بصرية واحدة تجمع ثلاثة مفاهيم:", "One visual equation combining three ideas:")}</p>
        </div>
        <div className="brand-equation">
          <article>
            <b>W</b>
            <span>{l("حرف الهوية", "Identity letter")}</span>
            <p>{l("يرمز لاسم WAZEN بشكل هندسي حديث يناسب منصات Fintech.", "Represents WAZEN as a modern geometric mark for fintech.")}</p>
          </article>
          <em>+</em>
          <article>
            <b>{l("اتزان", "Balance")}</b>
            <span>{l("محور التوازن", "Equilibrium pivot")}</span>
            <p>{l("الدائرة المركزية تشبه رأساً / نقطة اتزان — بدون ميزان تقليدي.", "The center dot acts as a head / pivot — not a classic scale.")}</p>
          </article>
          <em>+</em>
          <article>
            <b>{l("فصل الحقوق", "Rights split")}</b>
            <span>{l("شخصي + مشترك", "Personal + shared")}</span>
            <p>{l("جناحان منفصلان لونياً: كحلي للمال الشخصي، تركوازي للمال المشترك.", "Two color-separated wings: navy for personal, teal for shared funds.")}</p>
          </article>
          <em>=</em>
          <article className="result">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/wazen-lockup.png" alt="" />
            <span>WAZEN</span>
          </article>
        </div>
      </section>

      <section className="brand-doc-grid">
        <article>
          <h3>{l("معنى كل جزء", "Element meanings")}</h3>
          <ul>
            <li><b>{l("الجناح الكحلي #0F172A", "Navy wing #0F172A")}</b> — {l("المال الشخصي، الثقة، الاستقرار.", "Personal money, trust, stability.")}</li>
            <li><b>{l("الجناح التركوازي #10B981", "Teal wing #10B981")}</b> — {l("المال المشترك، النمو، الجمعيات والمنزل والرحلات.", "Shared money, growth, circles/home/trips.")}</li>
            <li><b>{l("الدائرة المركزية", "Center circle")}</b> — {l("نقطة الاتزان والوضوح؛ الإنسان في المنتصف.", "Equilibrium and clarity; the human at the center.")}</li>
            <li><b>{l("الطيّة / العمق", "Ribbon depth")}</b> — {l("إحساس تقني حديث دون تعقيد زائد.", "Modern tech depth without clutter.")}</li>
          </ul>
        </article>
        <article>
          <h3>{l("ماذا نقدّم؟", "What we offer")}</h3>
          <ul>
            <li>{l("محافظ شخصية وميزانيات", "Personal wallets and budgets")}</li>
            <li>{l("أموال مشتركة للمنزل والعائلة", "Shared household and family funds")}</li>
            <li>{l("جمعيات وأدوار", "Savings circles and turns")}</li>
            <li>{l("رحلات وتسويات", "Trips and settlements")}</li>
            <li>{l("إيصالات وكشوفات موثّقة", "Documented receipts and statements")}</li>
          </ul>
        </article>
        <article>
          <h3>{l("قيمنا", "Our values")}</h3>
          <ul>
            <li>{l("خصوصية البيانات وحمايتها", "Privacy and data protection")}</li>
            <li>{l("فصل حقوق كل شخص", "Separating each person’s rights")}</li>
            <li>{l("اتزان ووضوح في كل عملية", "Balance and clarity in every transaction")}</li>
            <li>{l("تقارير وكشوفات جاهزة", "Ready reports and statements")}</li>
            <li>{l("نمو وقرارات أفضل", "Growth and better decisions")}</li>
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
      </section>

      <section className="brand-doc-variants">
        <div className="brand-doc-section-head">
          <h2>{l("نسخ الشعار", "Logo variants")}</h2>
        </div>
        <div className="brand-variant-row">
          <figure>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/wazen-lockup.png" alt="Lockup" />
            <figcaption>{l("شعار الموقع (Lockup)", "Site logo (Lockup)")}</figcaption>
          </figure>
          <figure>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/wazen-mark.png" alt="Mark" />
            <figcaption>{l("الرمز فقط", "Mark only")}</figcaption>
          </figure>
          <figure className="on-dark">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/wazen-app-icon.png" alt="App icon" />
            <figcaption>{l("أيقونة التطبيق", "App icon")}</figcaption>
          </figure>
        </div>
      </section>

      <footer className="commerce-footer">
        <Brand />
        <p>{l("منصة عالمية لإدارة الأموال الشخصية والمشتركة.", "A global platform for personal and shared money.")}</p>
        <nav>
          <Link href="/">{l("الرئيسية", "Home")}</Link>
          <Link href="/about">{l("من نحن", "About")}</Link>
          <Link href="/pricing">{l("الباقات", "Pricing")}</Link>
          <Link href="/privacy">{l("الخصوصية", "Privacy")}</Link>
        </nav>
        <small>© 2026 WAZEN. {l("جميع الحقوق محفوظة.", "All rights reserved.")}</small>
      </footer>
    </main>
  );
}
