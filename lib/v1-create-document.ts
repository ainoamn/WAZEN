/** Business API v1 — create a document. */

import type { RequestUser } from "../db/runtime";
import { prepareAudit } from "./audit";
import { ApiError } from "./security";
import { parseNonNegativeMoneyToMinor, formatMoneyMinor } from "./money";
import { nextReference } from "./reference";
import { planHasFeature } from "../services/admin/billing-service";
import { authorizeSpace, ensureDefaultTenant } from "./authorization";

export const V1_DOCUMENT_TYPES = [
  "receipt",
  "disbursement",
  "handover",
  "member_statement",
  "society_statement",
  "trip_statement",
  "household_statement",
  "personal_report",
] as const;

export type V1DocumentType = (typeof V1_DOCUMENT_TYPES)[number];

const documentPrefixes: Record<string, string> = {
  receipt: "RCV",
  disbursement: "PAY",
  handover: "HND",
  member_statement: "MEM",
  society_statement: "SOC",
  trip_statement: "TRP",
  household_statement: "HOM",
  personal_report: "PER",
};

export type V1CreateDocumentInput = {
  type: V1DocumentType;
  personName: string;
  description: string;
  amount: string | number;
  spaceId?: string | null;
  paymentMethod?: "bank_transfer" | "cash" | "card" | "other";
};

export async function createV1Document(
  db: D1Database,
  user: RequestUser,
  input: V1CreateDocumentInput,
) {
  const { getActivePlanEntitlements, assertOwnerPlanQuota } = await import("../services/admin/billing-service");
  const entitlements = await getActivePlanEntitlements(db, user.id, { skipSideEffects: true, skipUsage: true });

  const personName = input.personName.trim();
  const description = input.description.trim();
  if (personName.length < 2 || personName.length > 120) throw new ApiError(400, "INVALID_DOCUMENT");
  if (description.length < 2 || description.length > 500) throw new ApiError(400, "INVALID_DOCUMENT");

  const space = input.spaceId
    ? await authorizeSpace(db, user, input.spaceId, "documents:issue")
    : null;
  if (!space) {
    if (!planHasFeature(entitlements.features, "documents")) throw new ApiError(403, "PLAN_FEATURE_REQUIRED");
  }
  await assertOwnerPlanQuota(db, user.id, "record", 1);

  const ownCurrency = await db.prepare("SELECT currency FROM users WHERE id=?").bind(user.id).first<{ currency: string }>();
  const currency = space?.currency ?? ownCurrency?.currency ?? "OMR";
  let amountMinor: number;
  try {
    amountMinor = parseNonNegativeMoneyToMinor(input.amount, currency);
  } catch {
    throw new ApiError(400, "INVALID_AMOUNT");
  }

  const type = input.type;
  const paymentMethod = input.paymentMethod ?? "bank_transfer";
  const reference = await nextReference(db, type, documentPrefixes[type] ?? "DOC");
  const documentId = crypto.randomUUID();
  const now = new Date().toISOString();
  const tenantId = await ensureDefaultTenant(db, user);

  await db.batch([
    db.prepare("INSERT INTO documents VALUES (?,?,?,?,?,?,?,?,?,'issued',?,?,?,?)")
      .bind(
        documentId,
        user.id,
        input.spaceId ?? null,
        type,
        reference,
        personName,
        description,
        amountMinor,
        currency,
        paymentMethod,
        user.displayName,
        now,
        now,
      ),
    db.prepare("INSERT INTO tenant_resources (tenant_id,resource_type,resource_id,created_at) VALUES (?,?,?,?)")
      .bind(tenantId, "document", documentId, now),
    prepareAudit(db, {
      userId: user.id,
      action: "document.created",
      entityType: "document",
      entityId: documentId,
      metadata: { reference, type, via: "api.v1" },
      createdAt: now,
    }),
  ]);

  return {
    id: documentId,
    type,
    reference,
    personName,
    description,
    amountMinor,
    amountLabel: formatMoneyMinor(amountMinor, currency, "en"),
    currency,
    status: "issued" as const,
    spaceId: input.spaceId ?? null,
    issuedAt: now,
  };
}
