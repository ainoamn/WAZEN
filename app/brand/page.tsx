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
          <small>{l("وثيقة الهوية البصرية الرسمية", "Official brand identity document")}</small>
          <h1>{l("شعار وازن — المعنى والتصميم", "WAZEN logo — meaning & design")}</h1>
          <p>
            {l(
              "هذه الصفحة تشرح الشعار الرسمي المأخوذ مباشرة من لوح الهوية المعتمد (ChatGPT Brand Board). الرمز يدمج حرف W مع فكرة الاتزان وفصل الحقوق بين المال الشخصي والمشترك.",
              "This page documents the official mark taken directly from the approved ChatGPT brand board. The symbol merges the letter W with equilibrium and the separation of personal vs shared rights.",
            )}
          </p>
          <a className="brand-doc-cta" href="#board">{l("عرض لوح الهوية الكامل", "View full brand board")}</a>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/wazen-mark.png" alt="WAZEN logo mark" className="brand-doc-mark" />
      </section>

      <section className="brand-doc-board" id="board">
        <div className="brand-doc-section-head">
          <h2>{l("لوح الهوية الكامل (المصدر الرسمي)", "Full brand board (official source)")}</h2>
          <p>
            {l(
              "الصورة أدناه هي ملف الهوية الأصلي: الرمز، الخطوط، الألوان، أيقونة التطبيق، شرح المعنى، واستخدام الشعار في الواجهة.",
              "The image below is the original identity file: mark, typography, colors, app icon, meaning breakdown, and product usage.",
            )}
          </p>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/wazen-brand-board.png"
          alt={l("لوح هوية وازن الرسمي", "Official WAZEN brand identity board")}
          className="brand-doc-board-img"
        />
        <p className="brand-doc-caption">
          {l(
            "المصدر: ChatGPT Image — لوح هوية وازن (أغسطس 2026)",
            "Source: ChatGPT Image — WAZEN brand board (August 2026)",
          )}
        </p>
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
            <img src="/brand/wazen-mark.png" alt="" />
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
          <h3>{l("الشعار النصي", "Wordmark")}</h3>
          <ul>
            <li><b>WAZEN</b> — {l("الاسم الرسمي اللاتيني (حروف متباعدة).", "Official Latin name with tracking.")}</li>
            <li><b>وازن</b> — {l("الاسم العربي؛ يُستخدم في صفحات الدخول والهوية.", "Arabic name; used on auth/identity screens.")}</li>
            <li><b>{l("الشعار", "Tagline")}</b> — {l("أموالك الشخصية والمشتركة، متوازنة بوضوح.", "Your personal and shared money, clearly balanced.")}</li>
          </ul>
        </article>
        <article>
          <h3>{l("قيم المنتج التي يعكسها الشعار", "Product values reflected")}</h3>
          <ul>
            <li>{l("خصوصية البيانات وحمايتها", "Privacy and data protection")}</li>
            <li>{l("فصل حقوق كل شخص", "Separating each person’s rights")}</li>
            <li>{l("اتزان ووضوح في كل عملية", "Balance and clarity in every transaction")}</li>
            <li>{l("تقارير وكشوفات جاهزة", "Ready reports and statements")}</li>
            <li>{l("نمو وقرارات أفضل", "Growth and better decisions")}</li>
          </ul>
        </article>
        <article>
          <h3>{l("قواعد الاستخدام", "Usage rules")}</h3>
          <ul>
            <li>{l("الهيدر: الرمز + WAZEN فقط", "Header: mark + WAZEN only")}</li>
            <li>{l("لا تستخدم اسم WAZEN ROAN", "Never use WAZEN ROAN")}</li>
            <li>{l("لا تضف $ أو ميزاناً تقليدياً أو حرف R", "No $, classic scale, or letter R")}</li>
            <li>{l("أيقونة التطبيق على خلفية #0F172A", "App icon on #0F172A background")}</li>
          </ul>
        </article>
      </section>

      <section className="brand-doc-colors">
        <div className="brand-doc-section-head">
          <h2>{l("لوحة الألوان", "Color palette")}</h2>
        </div>
        <div className="brand-swatches-row">
          <div><i style={{ background: "#0F172A" }} /><b>#0F172A</b><span>{l("ثقة واستقرار", "Trust & stability")}</span></div>
          <div><i style={{ background: "#10B981" }} /><b>#10B981</b><span>{l("نمو واتزان", "Growth & balance")}</span></div>
          <div><i style={{ background: "#2563EB" }} /><b>#2563EB</b><span>{l("تقنية وأمان", "Tech & safety")}</span></div>
          <div><i style={{ background: "#F8FAFC", border: "1px solid #e2e8f0" }} /><b>#F8FAFC</b><span>{l("خلفية فاتحة", "Light surface")}</span></div>
        </div>
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

      <section className="brand-doc-files">
        <div className="brand-doc-section-head">
          <h2>{l("ملفات الشعار في المشروع", "Logo files in the repo")}</h2>
        </div>
        <ul>
          <li><code>/brand/wazen-brand-board.png</code> — {l("لوح الهوية الكامل (الصورة الرسمية)", "Full brand board (official image)")}</li>
          <li><code>/brand/wazen-mark.png</code> — {l("الرمز المستخدم في الهيدر", "Mark used in header")}</li>
          <li><code>/brand/wazen-app-icon.png</code> — {l("أيقونة التطبيق", "App icon")}</li>
          <li><code>/brand/wazen-lockup.png</code> — {l("رمز + اسم", "Lockup")}</li>
          <li><code>components/brand/WazenLogo.tsx</code> — {l("مكوّن React", "React component")}</li>
        </ul>
      </section>

      <footer className="commerce-footer">
        <Brand />
        <p>{l("منصة عالمية لإدارة الأموال الشخصية والمشتركة.", "A global platform for personal and shared money.")}</p>
        <nav>
          <Link href="/">{l("الرئيسية", "Home")}</Link>
          <Link href="/brand">{l("الهوية", "Brand")}</Link>
          <Link href="/pricing">{l("الباقات", "Pricing")}</Link>
          <Link href="/privacy">{l("الخصوصية", "Privacy")}</Link>
        </nav>
        <small>© 2026 WAZEN. {l("جميع الحقوق محفوظة.", "All rights reserved.")}</small>
      </footer>
    </main>
  );
}
