"use client";

import Link from "next/link";
import { Brand, useCommerceLocale } from "../commercial-kit";

const endpoints = [
  { method: "GET", path: "/api/v1/spaces", ar: "قائمة المحافظ المتاحة للمفتاح", en: "List wallets visible to the key" },
  { method: "GET", path: "/api/v1/spaces/{spaceId}", ar: "تفاصيل محفظة واحدة", en: "Single wallet summary" },
  { method: "GET", path: "/api/v1/spaces/{spaceId}/transactions?limit=50", ar: "حركات المحفظة", en: "Wallet transactions" },
  { method: "POST", path: "/api/v1/spaces/{spaceId}/transactions", ar: "إنشاء دخل/مصروف/مساهمة", en: "Create income/expense/contribution" },
  { method: "GET", path: "/api/v1/spaces/{spaceId}/members", ar: "أعضاء الجمعية/المحفظة", en: "Wallet members" },
  { method: "POST", path: "/api/v1/spaces/{spaceId}/members", ar: "إضافة عضو", en: "Create a member" },
  { method: "POST", path: "/api/v1/spaces/{spaceId}/invites", ar: "دعوة عضو بالبريد", en: "Invite a member by email" },
  { method: "POST", path: "/api/v1/spaces/{spaceId}/transactions/{transactionId}/void", ar: "إلغاء حركة معتمدة", en: "Void an approved transaction" },
  { method: "GET", path: "/api/v1/spaces/{spaceId}/audit?limit=40", ar: "سجل تدقيق المحفظة", en: "Wallet audit log" },
  { method: "POST", path: "/api/v1/spaces/{spaceId}/surplus/withdraw", ar: "سحب فائض عضو", en: "Withdraw member surplus" },
  { method: "GET", path: "/api/v1/spaces/{spaceId}/summary", ar: "ملخص أرصدة ومستحقات", en: "Balances and dues summary" },
  { method: "POST", path: "/api/v1/spaces/{spaceId}/contributions", ar: "تسجيل مساهمة مع تقسيم فائض", en: "Record contribution with surplus split" },
  { method: "GET", path: "/api/v1/spaces/{spaceId}/installments", ar: "جدول الأقساط", en: "Installment schedule" },
  { method: "PATCH", path: "/api/v1/spaces/{spaceId}/members/{memberId}", ar: "تحديث دور/حالة عضو", en: "Update member role/status" },
  { method: "GET", path: "/api/v1/documents", ar: "قائمة المستندات", en: "List documents" },
  { method: "GET", path: "/api/v1/openapi", ar: "مواصفات OpenAPI", en: "OpenAPI snapshot" },
] as const;

export default function DevelopersPage() {
  const { locale, setLocale } = useCommerceLocale();
  const ar = locale === "ar";
  return (
    <main className="legal-page developers-page">
      <header>
        <Brand />
        <nav>
          <Link href="/security">{ar ? "الأمان" : "Security"}</Link>
          <Link href="/account/security">{ar ? "مفاتيح API" : "API keys"}</Link>
          <Link href="/dashboard">{ar ? "اللوحة" : "Dashboard"}</Link>
        </nav>
        <button type="button" onClick={() => setLocale(ar ? "en" : "ar")}>{ar ? "EN" : "عربي"}</button>
      </header>
      <article>
        <small>WAZEN API · v1 · 2026-08-24 · phase 13</small>
        <h1>{ar ? "واجهة برمجة المؤسسات" : "Business API"}</h1>
        <p className="lead">
          {ar
            ? "ادمج وازن مع أنظمتك عبر مفتاح API محدود الصلاحية. أنشئ المفتاح من أمان الحساب ثم أرسله كـ Bearer."
            : "Integrate Wazen with your systems using a scoped API key. Create it under Account security, then send it as a Bearer token."}
        </p>

        <section>
          <h2>{ar ? "المصادقة" : "Authentication"}</h2>
          <pre className="developers-code">{`Authorization: Bearer wzn_...`}</pre>
          <p>
            {ar
              ? "النطاقات الشائعة: wallets:read للقراءة. الكتابة تحتاج wallets:write أو members:write أو settlements:write. Webhooks من أمان الحساب."
              : "Common scopes: wallets:read for reads. Writes need wallets:write, members:write, or settlements:write. Configure webhooks under Account security."}
          </p>
        </section>

        <section>
          <h2>{ar ? "المسارات" : "Endpoints"}</h2>
          <ul className="developers-endpoints">
            {endpoints.map((item) => (
              <li key={item.path}>
                <code>{item.method}</code>
                <strong>{item.path}</strong>
                <span>{ar ? item.ar : item.en}</span>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2>{ar ? "مثال" : "Example"}</h2>
          <pre className="developers-code">{`curl -X POST -H "Authorization: Bearer wzn_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: $(uuidgen)" \\
  -d '{"kind":"expense","amount":"1.500","description":"قرطاسية"}' \\
  https://wazen.bhd-om.com/api/v1/spaces/SPACE_ID/transactions`}</pre>
        </section>

        <section>
          <h2>{ar ? "ملاحظات" : "Notes"}</h2>
          <p>
            {ar
              ? "الردود JSON مع X-Wazen-Api: v1. لا تُخزَّن المفاتيح في الواجهة بعد الإنشاء. للباقة Business فعّل ميزة التصدير/التكامل حسب اشتراكك."
              : "Responses are JSON with X-Wazen-Api: v1. Keys are shown once at creation. Business plan unlocks export/integration features per your subscription."}
          </p>
        </section>
      </article>
    </main>
  );
}
