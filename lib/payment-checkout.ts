/** Live checkout adapters. Falls back to manual transfer when provider env is unset. */

import { configuredAllowedHosts, validateOutboundHttpsUrl } from "./outbound.ts";
import { ApiError } from "./api-error.ts";

export type CheckoutSessionInput = {
  paymentId: string;
  invoiceId: string;
  reference: string;
  amountMinor: number;
  currency: string;
  customerEmail?: string;
  successUrl: string;
  cancelUrl: string;
};

export type CheckoutProvider = "thawani" | "omannet" | "manual_transfer";

export type CheckoutSessionResult =
  | { mode: "manual"; provider: "manual_transfer" }
  | { mode: "redirect"; provider: "thawani" | "omannet"; checkoutUrl: string; sessionId: string };

export function thawaniSecretKey() {
  return process.env.WAZEN_THAWANI_SECRET_KEY?.trim() || "";
}

export function thawaniPublishableKey() {
  return process.env.WAZEN_THAWANI_PUBLISHABLE_KEY?.trim() || "";
}

export function thawaniApiBase() {
  return process.env.WAZEN_THAWANI_API_BASE?.trim() || "https://checkout.thawani.om/api/v1";
}

export function isThawaniConfigured() {
  return Boolean(thawaniSecretKey() && thawaniPublishableKey());
}

export function omanNetApiKey() {
  return process.env.WAZEN_OMANNET_API_KEY?.trim() || "";
}

export function omanNetCheckoutUrl() {
  return process.env.WAZEN_OMANNET_CHECKOUT_URL?.trim() || "";
}

export function isOmanNetConfigured() {
  return Boolean(omanNetApiKey() && omanNetCheckoutUrl());
}

/** Prefer WAZEN_CHECKOUT_PROVIDER when set; otherwise thawani → omannet → manual. */
export function activeCheckoutProvider(): CheckoutProvider {
  const forced = (process.env.WAZEN_CHECKOUT_PROVIDER ?? "").trim().toLowerCase();
  if (forced === "manual" || forced === "manual_transfer") return "manual_transfer";
  if (forced === "thawani" && isThawaniConfigured()) return "thawani";
  if (forced === "omannet" && isOmanNetConfigured()) return "omannet";
  if (forced === "thawani" || forced === "omannet") return "manual_transfer";
  if (isThawaniConfigured()) return "thawani";
  if (isOmanNetConfigured()) return "omannet";
  return "manual_transfer";
}

async function createThawaniSession(input: CheckoutSessionInput): Promise<CheckoutSessionResult> {
  const apiBase = thawaniApiBase().replace(/\/$/, "");
  const endpoint = validateOutboundHttpsUrl(
    `${apiBase}/checkout/session`,
    [
      ...configuredAllowedHosts("payment"),
      "checkout.thawani.om",
      "uatcheckout.thawani.om",
    ],
  );

  const unitAmount = Math.max(1, Math.round(input.amountMinor));
  const body = {
    client_reference_id: input.paymentId,
    mode: "payment",
    products: [{ name: `WAZEN ${input.reference}`, quantity: 1, unit_amount: unitAmount }],
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    metadata: {
      invoiceId: input.invoiceId,
      paymentId: input.paymentId,
      reference: input.reference,
    },
    ...(input.customerEmail ? { customer: input.customerEmail } : {}),
  };

  const response = await fetch(endpoint, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
    headers: {
      "content-type": "application/json",
      "thawani-api-key": thawaniSecretKey(),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) throw new ApiError(502, "CHECKOUT_PROVIDER_FAILED");

  const payload = await response.json() as {
    data?: { session_id?: string; sessionId?: string };
    session_id?: string;
  };
  const sessionId = String(payload.data?.session_id ?? payload.data?.sessionId ?? payload.session_id ?? "").trim();
  if (!sessionId) throw new ApiError(502, "CHECKOUT_SESSION_INVALID");

  const publishable = thawaniPublishableKey();
  const payHost = apiBase.includes("uat") ? "https://uatcheckout.thawani.om" : "https://checkout.thawani.om";
  const checkoutUrl = `${payHost}/pay/${sessionId}?key=${encodeURIComponent(publishable)}`;
  return { mode: "redirect", provider: "thawani", checkoutUrl, sessionId };
}

/**
 * OmanNet (or bank-hosted) checkout via a merchant middleware URL.
 * Expects JSON { checkoutUrl|redirectUrl, sessionId|id } from WAZEN_OMANNET_CHECKOUT_URL.
 */
async function createOmanNetSession(input: CheckoutSessionInput): Promise<CheckoutSessionResult> {
  const endpoint = validateOutboundHttpsUrl(omanNetCheckoutUrl(), [
    ...configuredAllowedHosts("payment"),
  ]);
  const response = await fetch(endpoint, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${omanNetApiKey()}`,
    },
    body: JSON.stringify({
      clientReferenceId: input.paymentId,
      paymentId: input.paymentId,
      invoiceId: input.invoiceId,
      reference: input.reference,
      amountMinor: input.amountMinor,
      currency: input.currency,
      customerEmail: input.customerEmail ?? null,
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
    }),
  });
  if (!response.ok) throw new ApiError(502, "CHECKOUT_PROVIDER_FAILED");
  const payload = await response.json() as Record<string, unknown>;
  const checkoutUrl = String(payload.checkoutUrl ?? payload.redirectUrl ?? payload.url ?? "").trim();
  const sessionId = String(payload.sessionId ?? payload.id ?? payload.orderId ?? input.paymentId).trim();
  if (!checkoutUrl.startsWith("https://")) throw new ApiError(502, "CHECKOUT_SESSION_INVALID");
  return { mode: "redirect", provider: "omannet", checkoutUrl, sessionId };
}

/** Create a hosted checkout session, or return manual mode when not configured. */
export async function createCheckoutSession(input: CheckoutSessionInput): Promise<CheckoutSessionResult> {
  const provider = activeCheckoutProvider();
  if (provider === "thawani") return createThawaniSession(input);
  if (provider === "omannet") return createOmanNetSession(input);
  return { mode: "manual", provider: "manual_transfer" };
}

/** Map a Thawani-style webhook payload into WAZEN payment events. */
export function mapThawaniWebhook(raw: unknown): { id: string; paymentId: string; status: "succeeded" | "failed" | "refunded" } | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const data = (row.data && typeof row.data === "object" ? row.data : row) as Record<string, unknown>;
  const paymentId = String(data.client_reference_id ?? data.paymentId ?? row.client_reference_id ?? "").trim();
  const eventId = String(data.payment_id ?? data.invoice ?? data.session_id ?? row.event_id ?? row.id ?? "").trim();
  const rawStatus = String(data.payment_status ?? data.status ?? row.status ?? "").toLowerCase();
  if (!paymentId || !eventId) return null;
  let status: "succeeded" | "failed" | "refunded" | null = null;
  if (["paid", "success", "succeeded", "completed"].includes(rawStatus)) status = "succeeded";
  else if (["failed", "cancelled", "canceled", "expired"].includes(rawStatus)) status = "failed";
  else if (["refunded", "refund"].includes(rawStatus)) status = "refunded";
  if (!status) return null;
  return { id: `thawani:${eventId}`, paymentId, status };
}

/** Map OmanNet / bank middleware webhook payloads. */
export function mapOmanNetWebhook(raw: unknown): { id: string; paymentId: string; status: "succeeded" | "failed" | "refunded" } | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const data = (row.data && typeof row.data === "object" ? row.data : row) as Record<string, unknown>;
  const paymentId = String(
    data.clientReferenceId ?? data.client_reference_id ?? data.paymentId ?? row.paymentId ?? "",
  ).trim();
  const eventId = String(data.transactionId ?? data.orderId ?? data.id ?? row.eventId ?? row.id ?? "").trim();
  const rawStatus = String(data.status ?? data.paymentStatus ?? row.status ?? "").toLowerCase();
  if (!paymentId || !eventId) return null;
  let status: "succeeded" | "failed" | "refunded" | null = null;
  if (["paid", "success", "succeeded", "completed", "captured"].includes(rawStatus)) status = "succeeded";
  else if (["failed", "cancelled", "canceled", "expired", "declined"].includes(rawStatus)) status = "failed";
  else if (["refunded", "refund"].includes(rawStatus)) status = "refunded";
  if (!status) return null;
  return { id: `omannet:${eventId}`, paymentId, status };
}
