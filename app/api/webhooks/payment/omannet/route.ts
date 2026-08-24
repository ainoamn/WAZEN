import { ensureSchema, getRawDb } from "../../../../../db/runtime";
import { ApiError, errorResponse } from "../../../../../lib/security";
import { sha256 } from "../../../../../lib/auth";
import { applyPaymentWebhook } from "../../../../../lib/payment-service";
import { mapOmanNetWebhook } from "../../../../../lib/payment-checkout";

function hex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
function equal(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

export async function POST(request: Request) {
  try {
    const secret = process.env.WAZEN_OMANNET_WEBHOOK_SECRET?.trim()
      || process.env.WAZEN_PAYMENT_WEBHOOK_SECRET?.trim()
      || "";
    if (!secret || secret.length < 16) throw new ApiError(503, "WEBHOOK_NOT_CONFIGURED");
    const length = Number(request.headers.get("content-length") ?? 0);
    if (length > 262_144) throw new ApiError(413, "PAYLOAD_TOO_LARGE");
    const raw = await request.text();
    const supplied = (request.headers.get("x-wazen-signature")
      || request.headers.get("x-omannet-signature")
      || "").toLowerCase();
    if (supplied) {
      const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
      const expected = hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)));
      if (!equal(expected, supplied)) throw new ApiError(401, "INVALID_SIGNATURE");
    } else if (process.env.WAZEN_OMANNET_ALLOW_UNSIGNED !== "1") {
      throw new ApiError(401, "INVALID_SIGNATURE");
    }

    const parsed = mapOmanNetWebhook(JSON.parse(raw));
    if (!parsed) throw new ApiError(400, "INVALID_EVENT");
    const db = getRawDb();
    await ensureSchema(db);
    return Response.json(await applyPaymentWebhook(db, parsed, await sha256(raw)), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
