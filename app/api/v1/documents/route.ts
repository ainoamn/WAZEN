import { z } from "zod";
import { ensureSchema, getRawDb } from "../../../../db/runtime";
import { authenticateRequest } from "../../../../lib/auth";
import { assertApiScope } from "../../../../lib/authorization";
import { runWithDbUser } from "../../../../lib/db-request-context";
import { errorResponse, ApiError, claimIdempotency, completeIdempotency, enforceWriteRequest, releaseIdempotency } from "../../../../lib/security";
import { listV1Documents } from "../../../../lib/v1-documents";
import { createV1Document, V1_DOCUMENT_TYPES } from "../../../../lib/v1-create-document";
import { enqueueIntegrationEvent } from "../../../../lib/integration-webhooks";
import { enforceV1RateLimit } from "../../../../lib/v1-rate-limit";
import { withRequestTiming } from "../../../../lib/request-timing";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return withRequestTiming("v1.documents.get", async () => {
    try {
      const db = getRawDb();
      await ensureSchema(db);
      const user = await authenticateRequest(db, request);
      if (!user) throw new ApiError(401, "AUTHENTICATION_REQUIRED");
      return await runWithDbUser(user.id, async () => {
        await enforceV1RateLimit(db, request, user, "read");
        assertApiScope(user, "documents:read");
        const result = await listV1Documents(db, user.id);
        return Response.json({
          api: "wazen.v1",
          ...result,
        }, { headers: { "Cache-Control": "no-store", "X-Wazen-Api": "v1" } });
      });
    } catch (error) {
      return errorResponse(error);
    }
  });
}

export async function POST(request: Request) {
  return withRequestTiming("v1.documents.post", async () => {
    const claimRef: { current: { db: D1Database; userId: string; key: string } | null } = { current: null };
    try {
      enforceWriteRequest(request);
      const db = getRawDb();
      await ensureSchema(db);
      const user = await authenticateRequest(db, request);
      if (!user) throw new ApiError(401, "AUTHENTICATION_REQUIRED");
      const payload = (await request.json()) as Record<string, unknown>;
      const idempotencyKey = String(payload.idempotencyKey ?? request.headers.get("idempotency-key") ?? "");
      return await runWithDbUser(user.id, async () => {
        await enforceV1RateLimit(db, request, user, "write");
        assertApiScope(user, "documents:write");
        const parsed = z.object({
          type: z.enum(V1_DOCUMENT_TYPES),
          personName: z.string().trim().min(2).max(120),
          description: z.string().trim().min(2).max(500),
          amount: z.union([z.string(), z.number()]),
          spaceId: z.string().max(120).optional().nullable(),
          paymentMethod: z.enum(["bank_transfer", "cash", "card", "other"]).optional(),
        }).safeParse(payload);
        if (!parsed.success) throw new ApiError(400, "INVALID_DOCUMENT");

        const replay = await claimIdempotency(db, user.id, "v1.createDocument", idempotencyKey);
        if (replay) {
          const body = replay && typeof replay === "object" ? replay : { ok: true };
          return Response.json({ ok: true, ...body }, { headers: { "Cache-Control": "no-store", "X-Wazen-Api": "v1" } });
        }
        claimRef.current = { db, userId: user.id, key: idempotencyKey };

        const document = await createV1Document(db, user, {
          type: parsed.data.type,
          personName: parsed.data.personName,
          description: parsed.data.description,
          amount: parsed.data.amount,
          spaceId: parsed.data.spaceId,
          paymentMethod: parsed.data.paymentMethod,
        });
        const response = { api: "wazen.v1", ok: true, document };
        await enqueueIntegrationEvent(db, user.id, "document.created", {
          documentId: document.id,
          type: document.type,
          reference: document.reference,
          spaceId: document.spaceId,
          amountMinor: document.amountMinor,
        }).catch(() => {});
        await completeIdempotency(db, user.id, idempotencyKey, response);
        claimRef.current = null;
        return Response.json(response, { headers: { "Cache-Control": "no-store", "X-Wazen-Api": "v1" } });
      });
    } catch (error) {
      if (claimRef.current) {
        try { await releaseIdempotency(claimRef.current.db, claimRef.current.userId, claimRef.current.key); } catch { /* ignore */ }
      }
      return errorResponse(error);
    }
  });
}
