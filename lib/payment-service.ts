import { prepareAudit } from "./audit";
import { ApiError } from "./security";

type PaymentEvent = { id: string; paymentId: string; status: "succeeded" | "failed" | "refunded" };

export async function applyPaymentWebhook(db: D1Database, event: PaymentEvent, payloadHash: string) {
  const prior = await db.prepare("SELECT payload_hash FROM webhook_events WHERE provider='payment' AND event_id=?").bind(event.id).first<{ payload_hash: string }>();
  if (prior) {
    if (prior.payload_hash !== payloadHash) throw new ApiError(409, "WEBHOOK_EVENT_CONFLICT");
    return { received: true, replayed: true };
  }

  const payment = await db.prepare("SELECT status,invoice_id,user_id FROM payments WHERE id=?").bind(event.paymentId).first<{ status: string; invoice_id: string | null; user_id: string }>();
  if (!payment) throw new ApiError(404, "PAYMENT_NOT_FOUND");
  const transitions: Record<string, string[]> = { pending: ["succeeded", "failed"], failed: [], succeeded: ["refunded"], refunded: [] };
  if (!transitions[payment.status]?.includes(event.status)) {
    if (payment.status === event.status) {
      await db.prepare("INSERT INTO webhook_events (provider,event_id,payload_hash,processed_at) VALUES ('payment',?,?,?)").bind(event.id, payloadHash, new Date().toISOString()).run();
      return { received: true, duplicate: true };
    }
    throw new ApiError(409, "INVALID_PAYMENT_TRANSITION");
  }

  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [
    db.prepare("INSERT INTO webhook_events (provider,event_id,payload_hash,processed_at) VALUES ('payment',?,?,?)").bind(event.id, payloadHash, now),
    // The DB transition trigger makes this unconditional update the concurrency guard:
    // if another event wins first, an invalid second transition aborts the whole batch.
    db.prepare("UPDATE payments SET status=?,settlement_status=? WHERE id=?").bind(event.status, event.status === "succeeded" ? "settled" : "unsettled", event.paymentId),
    prepareAudit(db, { userId: payment.user_id, action: "payment.webhook_status_changed", entityType: "payment", entityId: event.paymentId, metadata: { eventId: event.id, status: event.status }, createdAt: now }),
  ];
  if (payment.invoice_id && event.status === "succeeded") statements.push(
    db.prepare("UPDATE invoices SET status='paid',paid_at=? WHERE id=?").bind(now, payment.invoice_id),
    db.prepare("UPDATE subscriptions SET status='active',updated_at=? WHERE id=(SELECT subscription_id FROM invoices WHERE id=?)").bind(now, payment.invoice_id),
    db.prepare("UPDATE coupons SET used_count=used_count+1 WHERE id=(SELECT coupon_id FROM coupon_redemptions WHERE invoice_id=? AND status='reserved')").bind(payment.invoice_id),
    db.prepare("UPDATE coupon_redemptions SET status='redeemed',redeemed_at=? WHERE invoice_id=? AND status='reserved'").bind(now, payment.invoice_id),
  );
  if (payment.invoice_id && event.status === "refunded") statements.push(db.prepare("UPDATE invoices SET status='refunded' WHERE id=?").bind(payment.invoice_id));

  try {
    await db.batch(statements);
  } catch (error) {
    const racedEvent = await db.prepare("SELECT payload_hash FROM webhook_events WHERE provider='payment' AND event_id=?").bind(event.id).first<{ payload_hash: string }>();
    if (racedEvent) {
      if (racedEvent.payload_hash !== payloadHash) throw new ApiError(409, "WEBHOOK_EVENT_CONFLICT");
      return { received: true, replayed: true };
    }
    const current = await db.prepare("SELECT status FROM payments WHERE id=?").bind(event.paymentId).first<{ status: string }>();
    if (current?.status === event.status) return { received: true, duplicate: true };
    throw error;
  }
  return { received: true };
}
