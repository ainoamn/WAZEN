import { z } from "zod";
import { ensureSchema, getRawDb } from "../../../../db/runtime";
import { ApiError, errorResponse } from "../../../../lib/security";
import { sha256 } from "../../../../lib/auth";
import { applyPaymentWebhook } from "../../../../lib/payment-service";

const eventSchema = z.object({
  id: z.string().min(8).max(200), paymentId: z.string().min(1).max(120),
  status: z.enum(["succeeded", "failed", "refunded"]),
});

function hex(bytes: ArrayBuffer) { return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join(""); }
function equal(left: string, right: string) {
  if (left.length !== right.length) return false; let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

export async function POST(request: Request) {
  try {
    const secret = process.env.WAZEN_PAYMENT_WEBHOOK_SECRET;
    if (!secret || secret.length < 32) throw new ApiError(503, "WEBHOOK_NOT_CONFIGURED");
    const length = Number(request.headers.get("content-length") ?? 0);
    if (length > 262_144) throw new ApiError(413, "PAYLOAD_TOO_LARGE");
    const raw = await request.text();
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const expected = hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)));
    const supplied = request.headers.get("x-wazen-signature") ?? "";
    if (!equal(expected, supplied.toLowerCase())) throw new ApiError(401, "INVALID_SIGNATURE");
    const parsed = eventSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) throw new ApiError(400, "INVALID_EVENT");
    const db = getRawDb(); await ensureSchema(db);
    return Response.json(await applyPaymentWebhook(db, parsed.data, await sha256(raw)), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
