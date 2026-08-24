"use client";

import Link from "next/link";
import { Brand, useCommerceLocale } from "../commercial-kit";

const endpoints = [
  { method: "GET", path: "/api/v1/me", ar: "هوية المفتاح الحالي", en: "Current API principal" },
  { method: "GET", path: "/api/v1/notifications", ar: "إشعارات الحساب", en: "In-app notifications" },
  { method: "POST", path: "/api/v1/notifications/read", ar: "تعليم الإشعارات كمقروءة", en: "Mark notifications read" },
  { method: "GET", path: "/api/v1/webhooks?deliveries=1", ar: "قائمة webhooks والتسليمات", en: "List webhooks and deliveries" },
  { method: "POST", path: "/api/v1/webhooks", ar: "إنشاء webhook تكامل", en: "Create integration webhook" },
  { method: "DELETE", path: "/api/v1/webhooks/{webhookId}", ar: "إلغاء webhook", en: "Revoke webhook" },
  { method: "POST", path: "/api/v1/webhooks/{webhookId}/test", ar: "اختبار webhook", en: "Test webhook delivery" },
  { method: "GET", path: "/api/v1/spaces", ar: "قائمة المحافظ المتاحة للمفتاح", en: "List wallets visible to the key" },
  { method: "POST", path: "/api/v1/spaces", ar: "إنشاء محفظة", en: "Create a wallet" },
  { method: "GET", path: "/api/v1/spaces/{spaceId}", ar: "تفاصيل محفظة واحدة", en: "Single wallet summary" },
  { method: "PATCH", path: "/api/v1/spaces/{spaceId}", ar: "تحديث محفظة", en: "Update a wallet" },
  { method: "POST", path: "/api/v1/spaces/{spaceId}/archive", ar: "أرشفة/استعادة محفظة", en: "Archive or restore wallet" },
  { method: "GET", path: "/api/v1/spaces/{spaceId}/links", ar: "المحافظ المرتبطة", en: "Linked wallets" },
  { method: "POST", path: "/api/v1/spaces/{spaceId}/links", ar: "ربط محفظة بالشخصية", en: "Link wallet to personal hub" },
  { method: "DELETE", path: "/api/v1/spaces/{spaceId}/links", ar: "فك ربط محفظة", en: "Unlink wallet from hub" },
  { method: "PUT", path: "/api/v1/spaces/{spaceId}/links/bank", ar: "ربط حساب بنكي لمحفظة مرتبطة", en: "Set bank account for linked wallet" },
  { method: "POST", path: "/api/v1/spaces/{spaceId}/links/transfer", ar: "تحويل بين الشخصية والمرتبطة", en: "Transfer between hub and linked wallet" },
  { method: "GET", path: "/api/v1/spaces/{spaceId}/accounts", ar: "حسابات المحفظة الشخصية", en: "Personal wallet accounts" },
  { method: "POST", path: "/api/v1/spaces/{spaceId}/accounts", ar: "إنشاء حساب بنكي/نقدي", en: "Create personal account" },
  { method: "GET", path: "/api/v1/spaces/{spaceId}/export?kind=transactions", ar: "تصدير CSV للحركات/الأعضاء", en: "Export transactions/members CSV" },
  { method: "GET", path: "/api/v1/spaces/{spaceId}/circle", ar: "دورة الجمعية والأدوار", en: "Circle config and turns" },
  { method: "POST", path: "/api/v1/spaces/{spaceId}/circle/order", ar: "تعيين ترتيب أدوار الجمعية", en: "Set circle payout order" },
  { method: "POST", path: "/api/v1/spaces/{spaceId}/circle/turns/{turnId}/complete", ar: "صرف دور الجمعية الحالي", en: "Complete current circle turn" },
  { method: "POST", path: "/api/v1/spaces/{spaceId}/shares/receipt", ar: "رابط مشاركة إيصال", en: "Create receipt share link" },
  { method: "POST", path: "/api/v1/spaces/{spaceId}/shares/member-statement", ar: "مشاركة كشف عضو", en: "Share member statement" },
  { method: "POST", path: "/api/v1/spaces/{spaceId}/shares/statement", ar: "مشاركة كشف الجمعية", en: "Share association statement" },
  { method: "GET", path: "/api/v1/spaces/{spaceId}/transactions?limit=50", ar: "حركات المحفظة", en: "Wallet transactions" },
  { method: "POST", path: "/api/v1/spaces/{spaceId}/transactions", ar: "إنشاء دخل/مصروف/مساهمة", en: "Create income/expense/contribution" },
  { method: "GET", path: "/api/v1/spaces/{spaceId}/transactions/{transactionId}", ar: "تفاصيل حركة", en: "Get transaction" },
  { method: "PATCH", path: "/api/v1/spaces/{spaceId}/transactions/{transactionId}", ar: "تعديل حركة", en: "Update transaction" },
  { method: "GET", path: "/api/v1/spaces/{spaceId}/transactions/{transactionId}/revisions", ar: "سجل تعديلات الحركة", en: "Transaction revisions" },
  { method: "GET", path: "/api/v1/spaces/{spaceId}/members", ar: "أعضاء الجمعية/المحفظة", en: "Wallet members" },
  { method: "POST", path: "/api/v1/spaces/{spaceId}/members", ar: "إضافة عضو", en: "Create a member" },
  { method: "POST", path: "/api/v1/spaces/{spaceId}/invites", ar: "دعوة عضو بالبريد", en: "Invite a member by email" },
  { method: "POST", path: "/api/v1/spaces/{spaceId}/transactions/{transactionId}/void", ar: "إلغاء حركة معتمدة", en: "Void an approved transaction" },
  { method: "GET", path: "/api/v1/spaces/{spaceId}/audit?limit=40", ar: "سجل تدقيق المحفظة", en: "Wallet audit log" },
  { method: "POST", path: "/api/v1/spaces/{spaceId}/surplus/withdraw", ar: "سحب فائض عضو", en: "Withdraw member surplus" },
  { method: "GET", path: "/api/v1/spaces/{spaceId}/summary", ar: "ملخص أرصدة ومستحقات", en: "Balances and dues summary" },
  { method: "POST", path: "/api/v1/spaces/{spaceId}/contributions", ar: "تسجيل مساهمة مع تقسيم فائض", en: "Record contribution with surplus split" },
  { method: "GET", path: "/api/v1/spaces/{spaceId}/contribution-plan", ar: "خطة المساهمة", en: "Contribution plan" },
  { method: "PUT", path: "/api/v1/spaces/{spaceId}/contribution-plan", ar: "تحديث خطة المساهمة", en: "Update contribution plan" },
  { method: "GET", path: "/api/v1/spaces/{spaceId}/installments", ar: "جدول الأقساط", en: "Installment schedule" },
  { method: "GET", path: "/api/v1/spaces/{spaceId}/expenses", ar: "مصروفات الرحلة/المجموعة", en: "Trip/group expenses" },
  { method: "POST", path: "/api/v1/spaces/{spaceId}/expenses", ar: "إنشاء مصروف جماعي", en: "Create trip/group expense" },
  { method: "PATCH", path: "/api/v1/spaces/{spaceId}/expenses/{expenseId}", ar: "تعديل مصروف جماعي", en: "Update trip/group expense" },
  { method: "POST", path: "/api/v1/spaces/{spaceId}/expenses/resplit", ar: "إعادة تقسيم المصروفات", en: "Resplit unsettled expenses" },
  { method: "POST", path: "/api/v1/spaces/{spaceId}/expenses/{expenseId}/void", ar: "إلغاء مصروف جماعي", en: "Void trip/group expense" },
  { method: "PATCH", path: "/api/v1/spaces/{spaceId}/members/{memberId}", ar: "تحديث دور/حالة عضو", en: "Update member role/status" },
  { method: "GET", path: "/api/v1/documents", ar: "قائمة المستندات", en: "List documents" },
  { method: "POST", path: "/api/v1/documents", ar: "إنشاء مستند", en: "Create a document" },
  { method: "GET", path: "/api/v1/spaces/{spaceId}/settlements", ar: "قائمة التسويات", en: "List settlements" },
  { method: "POST", path: "/api/v1/spaces/{spaceId}/settlements/{settlementId}/settle", ar: "تنفيذ تسوية", en: "Settle a settlement" },
  { method: "POST", path: "/api/v1/spaces/{spaceId}/settlements/{settlementId}/void", ar: "إلغاء تسوية معلّقة", en: "Void pending settlement" },
  { method: "GET", path: "/api/v1/spaces/{spaceId}/periods", ar: "الفترات المحاسبية", en: "Accounting periods" },
  { method: "POST", path: "/api/v1/spaces/{spaceId}/periods", ar: "إغلاق الفترة المحاسبية", en: "Close accounting period" },
  { method: "POST", path: "/api/v1/spaces/{spaceId}/periods/{periodId}/reopen", ar: "إعادة فتح فترة مغلقة", en: "Reopen closed period" },
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
        <small>WAZEN API · v1 · 2026-08-24 · phase 21</small>
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
              ? "النطاقات الشائعة: wallets:read للقراءة. الكتابة تحتاج wallets:write أو members:write أو settlements:write أو circles:write. إدارة Webhooks تحتاج webhooks:read / webhooks:write."
              : "Common scopes: wallets:read for reads. Writes need wallets:write, members:write, settlements:write, or circles:write. Webhook management needs webhooks:read / webhooks:write."}
          </p>
        </section>

        <section>
          <h2>{ar ? "المسارات" : "Endpoints"}</h2>
          <ul className="developers-endpoints">
            {endpoints.map((item) => (
              <li key={`${item.method} ${item.path}`}>
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
