export type AdminAlert = {
  id: string;
  severity: "info" | "warning" | "danger";
  href?: string;
  ar: string;
  en: string;
  count?: number;
};

export async function computeAdminAlerts(db: D1Database): Promise<AdminAlert[]> {
  const [
    pendingPayments,
    pendingInvoices,
    pendingSubs,
    planChanges,
    unverified,
    suspended,
    queuedMail,
    graceSpaces,
  ] = await Promise.all([
    db.prepare("SELECT COUNT(*) AS count FROM payments WHERE status='pending'").first<{ count: number }>(),
    db.prepare("SELECT COUNT(*) AS count FROM invoices WHERE status='pending'").first<{ count: number }>(),
    db.prepare("SELECT COUNT(*) AS count FROM subscriptions WHERE status IN ('pending_payment','paused')").first<{ count: number }>(),
    db.prepare("SELECT COUNT(*) AS count FROM subscriptions WHERE pending_plan_id IS NOT NULL").first<{ count: number }>(),
    db.prepare(`SELECT COUNT(*) AS count FROM users u
      JOIN auth_credentials c ON c.user_id=u.id WHERE c.email_verified_at IS NULL`).first<{ count: number }>(),
    db.prepare("SELECT COUNT(*) AS count FROM customer_profiles WHERE status='suspended'").first<{ count: number }>(),
    db.prepare("SELECT COUNT(*) AS count FROM email_outbox WHERE status='pending'").first<{ count: number }>(),
    db.prepare("SELECT COUNT(*) AS count FROM spaces WHERE grace_until IS NOT NULL AND grace_until>?").bind(new Date().toISOString()).first<{ count: number }>(),
  ]);

  const alerts: AdminAlert[] = [];
  const payCount = Number(pendingPayments?.count ?? 0);
  if (payCount > 0) {
    alerts.push({
      id: "pending-payments",
      severity: "warning",
      href: "/admin/payments",
      count: payCount,
      ar: `${payCount} مدفوعات بانتظار التسوية أو الاعتماد`,
      en: `${payCount} payment(s) awaiting settlement or approval`,
    });
  }
  const invCount = Number(pendingInvoices?.count ?? 0);
  if (invCount > 0) {
    alerts.push({
      id: "pending-invoices",
      severity: "warning",
      href: "/admin/payments",
      count: invCount,
      ar: `${invCount} فاتورة معلّقة`,
      en: `${invCount} pending invoice(s)`,
    });
  }
  const subCount = Number(pendingSubs?.count ?? 0);
  if (subCount > 0) {
    alerts.push({
      id: "pending-subscriptions",
      severity: "warning",
      href: "/admin/users",
      count: subCount,
      ar: `${subCount} اشتراك يحتاج اعتماد أو دفع`,
      en: `${subCount} subscription(s) need payment or approval`,
    });
  }
  const planCount = Number(planChanges?.count ?? 0);
  if (planCount > 0) {
    alerts.push({
      id: "plan-changes",
      severity: "info",
      href: "/admin/users",
      count: planCount,
      ar: `${planCount} باقة مجدولة للتغيير`,
      en: `${planCount} scheduled plan change(s)`,
    });
  }
  const unverifiedCount = Number(unverified?.count ?? 0);
  if (unverifiedCount > 0) {
    alerts.push({
      id: "unverified-email",
      severity: "info",
      href: "/admin/users",
      count: unverifiedCount,
      ar: `${unverifiedCount} حساب بريد غير مُفعّل`,
      en: `${unverifiedCount} unverified email account(s)`,
    });
  }
  const suspendedCount = Number(suspended?.count ?? 0);
  if (suspendedCount > 0) {
    alerts.push({
      id: "suspended-users",
      severity: "danger",
      href: "/admin/users",
      count: suspendedCount,
      ar: `${suspendedCount} حساب موقوف — مراجعة مطلوبة`,
      en: `${suspendedCount} suspended account(s) — review needed`,
    });
  }
  const mailCount = Number(queuedMail?.count ?? 0);
  if (mailCount > 0) {
    alerts.push({
      id: "queued-mail",
      severity: "info",
      count: mailCount,
      ar: `${mailCount} رسالة بريد في قائمة الإرسال`,
      en: `${mailCount} queued email message(s)`,
    });
  }
  const graceCount = Number(graceSpaces?.count ?? 0);
  if (graceCount > 0) {
    alerts.push({
      id: "grace-wallets",
      severity: "warning",
      href: "/admin/users",
      count: graceCount,
      ar: `${graceCount} محفظة في مهلة الاحتفاظ`,
      en: `${graceCount} wallet(s) in retention grace`,
    });
  }
  return alerts;
}
