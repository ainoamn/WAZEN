/** Default transactional email catalog + branded HTML shell. */

export type EmailTemplateId =
  | "verify_email"
  | "reset_password"
  | "member_invitation"
  | "member_receipt"
  | "member_statement"
  | "dues_digest"
  | "privacy_export_ready"
  | "privacy_deletion_done";

export type EmailTemplateDefinition = {
  id: EmailTemplateId;
  labelAr: string;
  labelEn: string;
  subjectAr: string;
  subjectEn: string;
  /** HTML body fragment (inside branded shell). Placeholders: {{displayName}} {{link}} {{message}} {{messageHtml}} {{ctaLabel}} */
  bodyHtmlAr: string;
  bodyHtmlEn: string;
  textAr: string;
  textEn: string;
};

export const EMAIL_TEMPLATE_IDS: EmailTemplateId[] = [
  "verify_email",
  "reset_password",
  "member_invitation",
  "member_receipt",
  "member_statement",
  "dues_digest",
  "privacy_export_ready",
  "privacy_deletion_done",
];

export const DEFAULT_EMAIL_TEMPLATES: Record<EmailTemplateId, EmailTemplateDefinition> = {
  verify_email: {
    id: "verify_email",
    labelAr: "تأكيد البريد",
    labelEn: "Verify email",
    subjectAr: "مرحباً بك في وازون — أكّد بريدك",
    subjectEn: "Welcome to Wazen — verify your email",
    bodyHtmlAr: `<p style="margin:0 0 12px;font-size:16px;line-height:1.7;">مرحباً <strong>{{displayName}}</strong>،</p>
<p style="margin:0 0 12px;font-size:15px;line-height:1.7;">أهلاً بك في وازون. أكّد بريدك لتفعيل الحساب والبدء في إدارة محافظك بثقة.</p>
<p style="margin:0 0 8px;font-size:14px;color:#5f6e68;">إذا لم تنشئ حساباً في وازون، تجاهل هذه الرسالة بأمان.</p>`,
    bodyHtmlEn: `<p style="margin:0 0 12px;font-size:16px;line-height:1.7;">Hello <strong>{{displayName}}</strong>,</p>
<p style="margin:0 0 12px;font-size:15px;line-height:1.7;">Welcome to Wazen. Confirm your email to activate your account.</p>
<p style="margin:0 0 8px;font-size:14px;color:#5f6e68;">If you did not create a Wazen account, you can ignore this message.</p>`,
    textAr: "مرحباً {{displayName}}\n\nأهلاً بك في وازون. أكّد بريدك عبر:\n{{link}}\n\nإذا لم تنشئ الحساب تجاهل الرسالة.",
    textEn: "Hello {{displayName}}\n\nWelcome to Wazen. Verify via:\n{{link}}\n\nIf you did not sign up, ignore this email.",
  },
  reset_password: {
    id: "reset_password",
    labelAr: "استعادة كلمة المرور",
    labelEn: "Reset password",
    subjectAr: "استعادة كلمة المرور — وازون",
    subjectEn: "Password recovery — Wazen",
    bodyHtmlAr: `<p style="margin:0 0 12px;font-size:16px;line-height:1.7;">مرحباً <strong>{{displayName}}</strong>،</p>
<p style="margin:0 0 12px;font-size:15px;line-height:1.7;">وصَلنا طلب <strong>استعادة كلمة المرور</strong> لحسابك في وازون.</p>
<ul style="margin:0 0 16px;padding-inline-start:20px;font-size:15px;line-height:1.8;color:#24443c;">
  <li>إذا <strong>كنت أنت</strong> من طلب الاستعادة: اضغط الزر أدناه وعيّن كلمة مرور جديدة. الرابط صالح لفترة محدودة.</li>
  <li>إذا <strong>لم تطلب</strong> ذلك: تجاهل هذه الرسالة بأمان — لن يتغيّر شيء في حسابك.</li>
</ul>`,
    bodyHtmlEn: `<p style="margin:0 0 12px;font-size:16px;line-height:1.7;">Hello <strong>{{displayName}}</strong>,</p>
<p style="margin:0 0 12px;font-size:15px;line-height:1.7;">We received a <strong>password recovery</strong> request for your Wazen account.</p>
<ul style="margin:0 0 16px;padding-inline-start:20px;font-size:15px;line-height:1.8;color:#24443c;">
  <li>If this was <strong>you</strong>: tap the button below to set a new password. The link expires soon.</li>
  <li>If this was <strong>not you</strong>: ignore this email — your password stays unchanged.</li>
</ul>`,
    textAr: "مرحباً {{displayName}}\n\nطلب استعادة كلمة المرور.\nإذا كنت أنت: {{link}}\nإذا لم تطلب ذلك: تجاهل الرسالة بأمان.",
    textEn: "Hello {{displayName}}\n\nPassword recovery requested.\nIf this was you: {{link}}\nIf not: ignore safely.",
  },
  member_invitation: {
    id: "member_invitation",
    labelAr: "دعوة عضو",
    labelEn: "Member invite",
    subjectAr: "دعوة للانضمام إلى وازون",
    subjectEn: "You're invited to join Wazen",
    bodyHtmlAr: `<p style="margin:0 0 12px;font-size:16px;line-height:1.7;">مرحباً،</p>
<p style="margin:0 0 12px;font-size:15px;line-height:1.7;">دعاك <strong>{{displayName}}</strong> للانضمام إلى محفظة على وازون.</p>
<p style="margin:0 0 12px;font-size:15px;line-height:1.7;">عند فتح الرابط يمكنك تثبيت وازن على الشاشة الرئيسية كتطبيق، ثم تسجيل الدخول ببريدك لقبول الدعوة.</p>`,
    bodyHtmlEn: `<p style="margin:0 0 12px;font-size:16px;line-height:1.7;">Hello,</p>
<p style="margin:0 0 12px;font-size:15px;line-height:1.7;"><strong>{{displayName}}</strong> invited you to a Wazen wallet.</p>
<p style="margin:0 0 12px;font-size:15px;line-height:1.7;">When you open the link you can install Wazen on your home screen, then sign in with your email to accept.</p>`,
    textAr: "دعوة وازون من {{displayName}}\nثبّت التطبيق ثم سجّل الدخول:\n{{link}}",
    textEn: "Wazen invite from {{displayName}}\nInstall the app, then sign in:\n{{link}}",
  },
  member_receipt: {
    id: "member_receipt",
    labelAr: "إيصال دفعة",
    labelEn: "Payment receipt",
    subjectAr: "إيصال وازون — تأكيد استلام دفعتك",
    subjectEn: "Wazen receipt — payment confirmation",
    bodyHtmlAr: `<p style="margin:0 0 12px;font-size:16px;line-height:1.7;">السلام عليكم <strong>{{displayName}}</strong>،</p>
<p style="margin:0 0 12px;font-size:15px;line-height:1.7;">تم استلام دفعتك. إليك تفاصيل الإيصال:</p>
<div style="margin:0 0 16px;padding:14px 16px;border-radius:12px;background:#f4f8f6;border:1px solid #d7e5df;font-size:14px;line-height:1.75;white-space:pre-wrap;">{{messageHtml}}</div>`,
    bodyHtmlEn: `<p style="margin:0 0 12px;font-size:16px;line-height:1.7;">Hello <strong>{{displayName}}</strong>,</p>
<p style="margin:0 0 12px;font-size:15px;line-height:1.7;">We received your payment. Receipt details:</p>
<div style="margin:0 0 16px;padding:14px 16px;border-radius:12px;background:#f4f8f6;border:1px solid #d7e5df;font-size:14px;line-height:1.75;white-space:pre-wrap;">{{messageHtml}}</div>`,
    textAr: "{{message}}\n\n{{link}}",
    textEn: "{{message}}\n\n{{link}}",
  },
  member_statement: {
    id: "member_statement",
    labelAr: "كشف حساب عضو",
    labelEn: "Member statement",
    subjectAr: "كشف حساب — {{walletName}} — وازون",
    subjectEn: "Account statement — {{walletName}} — Wazen",
    bodyHtmlAr: `<p style="margin:0 0 12px;font-size:16px;line-height:1.7;">السلام عليكم <strong>{{displayName}}</strong>،</p>
<p style="margin:0 0 12px;font-size:15px;line-height:1.7;">نود إبلاغكم بتحديث حسابكم في <strong>{{walletName}}</strong>. نرفق أدناه ملخصاً واضحاً لموقفكم المالي.</p>
{{transactionNoteHtml}}
{{balanceAlertHtml}}
<p style="margin:0 0 10px;font-size:15px;line-height:1.7;color:#24443c;"><strong>ملخص الكشف:</strong></p>
<div style="margin:0 0 16px;padding:14px 16px;border-radius:12px;background:#f4f8f6;border:1px solid #d7e5df;font-size:14px;line-height:1.75;">{{messageHtml}}</div>
<p style="margin:0;font-size:14px;line-height:1.7;color:#5f6e68;">للاطلاع على الكشف التفصيلي الكامل، استخدم الزر أدناه. شكراً لالتزامكم وتعاونكم.</p>`,
    bodyHtmlEn: `<p style="margin:0 0 12px;font-size:16px;line-height:1.7;">Hello <strong>{{displayName}}</strong>,</p>
<p style="margin:0 0 12px;font-size:15px;line-height:1.7;">We’re writing to share an update on your account in <strong>{{walletName}}</strong>. Below is a clear summary of your position.</p>
{{transactionNoteHtml}}
{{balanceAlertHtml}}
<p style="margin:0 0 10px;font-size:15px;line-height:1.7;color:#24443c;"><strong>Statement summary:</strong></p>
<div style="margin:0 0 16px;padding:14px 16px;border-radius:12px;background:#f4f8f6;border:1px solid #d7e5df;font-size:14px;line-height:1.75;">{{messageHtml}}</div>
<p style="margin:0;font-size:14px;line-height:1.7;color:#5f6e68;">Tap the button below for the full detailed statement. Thank you for your cooperation.</p>`,
    textAr: "{{message}}\n\n{{link}}",
    textEn: "{{message}}\n\n{{link}}",
  },
  dues_digest: {
    id: "dues_digest",
    labelAr: "ملخص المستحقات",
    labelEn: "Dues digest",
    subjectAr: "ملخص مستحقات — وازون",
    subjectEn: "Dues summary — Wazen",
    bodyHtmlAr: `<p style="margin:0 0 12px;font-size:15px;line-height:1.7;">{{messageHtml}}</p>`,
    bodyHtmlEn: `<p style="margin:0 0 12px;font-size:15px;line-height:1.7;">{{messageHtml}}</p>`,
    textAr: "{{message}}",
    textEn: "{{message}}",
  },
  privacy_export_ready: {
    id: "privacy_export_ready",
    labelAr: "تصدير البيانات جاهز",
    labelEn: "Data export ready",
    subjectAr: "تصدير بياناتك جاهز — وازون",
    subjectEn: "Your data export is ready — Wazen",
    bodyHtmlAr: `<p style="margin:0 0 12px;font-size:15px;line-height:1.7;">{{messageHtml}}</p>`,
    bodyHtmlEn: `<p style="margin:0 0 12px;font-size:15px;line-height:1.7;">{{messageHtml}}</p>`,
    textAr: "{{message}}",
    textEn: "{{message}}",
  },
  privacy_deletion_done: {
    id: "privacy_deletion_done",
    labelAr: "تأكيد حذف البيانات",
    labelEn: "Deletion confirmed",
    subjectAr: "تم حذف بياناتك — وازون",
    subjectEn: "Your data was deleted — Wazen",
    bodyHtmlAr: `<p style="margin:0 0 12px;font-size:15px;line-height:1.7;">{{messageHtml}}</p>`,
    bodyHtmlEn: `<p style="margin:0 0 12px;font-size:15px;line-height:1.7;">{{messageHtml}}</p>`,
    textAr: "{{message}}",
    textEn: "{{message}}",
  },
};

export function applyTemplatePlaceholders(source: string, vars: Record<string, string>) {
  return source.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? "");
}

export function brandedEmailShell(input: {
  title: string;
  bodyHtml: string;
  logoUrl: string;
  appOrigin: string;
  locale?: "ar" | "en";
  ctaUrl?: string;
  ctaLabel?: string;
  footerNote?: string;
}) {
  const locale = input.locale ?? "ar";
  const dir = locale === "ar" ? "rtl" : "ltr";
  const align = locale === "ar" ? "right" : "left";
  const footer = input.footerNote
    ?? (locale === "ar"
      ? "وازون · إدارة مالية أوضح للمجموعات والعائلات. هذه رسالة آلية؛ يُرجى عدم الرد عليها مباشرة."
      : "Wazen · clearer group & family money. This is an automated message; please do not reply directly.");
  const cta = input.ctaUrl && input.ctaLabel
    ? `<p style="margin:22px 0 10px;text-align:center;"><a href="${escapeAttr(input.ctaUrl)}" style="display:inline-block;padding:13px 22px;border-radius:12px;background:#0f766e;color:#ffffff;text-decoration:none;font-weight:800;font-size:15px;">${escapeHtml(input.ctaLabel)}</a></p>
<p style="margin:0 0 8px;font-size:12px;color:#6d7b75;word-break:break-all;text-align:${align};">${escapeHtml(input.ctaUrl)}</p>`
    : "";

  return `<!doctype html>
<html lang="${locale}" dir="${dir}">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${escapeHtml(input.title)}</title></head>
<body style="margin:0;padding:0;background:#eef2ef;font-family:Tahoma,'Segoe UI',Arial,sans-serif;color:#17332d;">
  <div style="max-width:580px;margin:0 auto;padding:28px 14px;">
    <div style="background:#ffffff;border:1px solid #d7e2dc;border-radius:18px;overflow:hidden;box-shadow:0 10px 28px rgba(17,49,41,.06);">
      <div style="padding:22px 24px 10px;text-align:center;background:linear-gradient(180deg,#f7fbf9 0%,#ffffff 100%);border-bottom:1px solid #e7eee9;">
        <img src="${escapeAttr(input.logoUrl)}" alt="Wazen" width="168" height="48" style="display:inline-block;max-width:168px;height:auto;border:0;"/>
      </div>
      <div style="padding:22px 24px 8px;text-align:${align};">
        <h1 style="margin:0 0 16px;font-size:20px;line-height:1.35;letter-spacing:-0.02em;color:#0f3d34;">${escapeHtml(input.title)}</h1>
        ${input.bodyHtml}
        ${cta}
      </div>
      <div style="padding:16px 24px 22px;border-top:1px solid #eef2ef;text-align:${align};">
        <p style="margin:0;font-size:12px;line-height:1.6;color:#8a9690;">${escapeHtml(footer)}</p>
        <p style="margin:10px 0 0;font-size:12px;"><a href="${escapeAttr(input.appOrigin)}" style="color:#0f766e;text-decoration:none;font-weight:700;">${escapeHtml(input.appOrigin.replace(/^https?:\/\//, ""))}</a></p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttr(value: string) {
  return escapeHtml(value).replaceAll("'", "&#39;");
}
