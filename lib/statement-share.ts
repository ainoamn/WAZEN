/** Signed public statement links for WhatsApp (text + URL, readable on phone). */

import { createHmac, timingSafeEqual } from "node:crypto";
import type { MemberLedgerFocus } from "./member-ledger";
import type { StatementTxnFilter } from "./account-statement";

const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function statementSecret() {
  return (
    process.env.WAZEN_RECEIPT_SECRET?.trim()
    || process.env.WAZEN_JOB_SECRET?.trim()
    || process.env.WAZEN_PAYMENT_WEBHOOK_SECRET?.trim()
    || "wazen-dev-statement-share"
  );
}

function b64url(input: string | Buffer) {
  return Buffer.from(input).toString("base64url");
}

function fromB64url(input: string) {
  return Buffer.from(input, "base64url");
}

function signBody(payload: object) {
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", statementSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function verifyBody(token: string): unknown | null {
  const raw = String(token ?? "").trim();
  const [body, sig] = raw.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", statementSecret()).update(body).digest("base64url");
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    return JSON.parse(fromB64url(body).toString("utf8"));
  } catch {
    return null;
  }
}

export type MemberStatementSharePayload = {
  kind: "member_statement";
  memberId: string;
  spaceId: string;
  focus: MemberLedgerFocus;
  locale: "ar" | "en";
  exp: number;
};

export type AssociationStatementSharePayload = {
  kind: "association_statement";
  spaceId: string;
  filter: StatementTxnFilter;
  locale: "ar" | "en";
  exp: number;
};

const FOCUSES = new Set<MemberLedgerFocus>(["all", "paid", "spent", "owes", "credit"]);
const FILTERS = new Set<StatementTxnFilter>(["full", "valid", "voided", "all"]);

export function signMemberStatementToken(input: {
  memberId: string;
  spaceId: string;
  focus?: MemberLedgerFocus;
  locale?: "ar" | "en";
  ttlMs?: number;
}) {
  const focus = FOCUSES.has(input.focus as MemberLedgerFocus) ? (input.focus as MemberLedgerFocus) : "all";
  const payload: MemberStatementSharePayload = {
    kind: "member_statement",
    memberId: input.memberId,
    spaceId: input.spaceId,
    focus,
    locale: input.locale ?? "ar",
    exp: Date.now() + (input.ttlMs ?? DEFAULT_TTL_MS),
  };
  return signBody(payload);
}

export function verifyMemberStatementToken(token: string): MemberStatementSharePayload | null {
  const payload = verifyBody(token) as MemberStatementSharePayload | null;
  if (!payload || payload.kind !== "member_statement") return null;
  if (!payload.memberId || !payload.spaceId || !Number.isFinite(payload.exp)) return null;
  if (payload.exp < Date.now()) return null;
  if (!FOCUSES.has(payload.focus)) payload.focus = "all";
  if (payload.locale !== "en") payload.locale = "ar";
  return payload;
}

export function signAssociationStatementToken(input: {
  spaceId: string;
  filter?: StatementTxnFilter;
  locale?: "ar" | "en";
  ttlMs?: number;
}) {
  const filter = FILTERS.has(input.filter as StatementTxnFilter) ? (input.filter as StatementTxnFilter) : "full";
  const payload: AssociationStatementSharePayload = {
    kind: "association_statement",
    spaceId: input.spaceId,
    filter,
    locale: input.locale ?? "ar",
    exp: Date.now() + (input.ttlMs ?? DEFAULT_TTL_MS),
  };
  return signBody(payload);
}

export function verifyAssociationStatementToken(token: string): AssociationStatementSharePayload | null {
  const payload = verifyBody(token) as AssociationStatementSharePayload | null;
  if (!payload || payload.kind !== "association_statement") return null;
  if (!payload.spaceId || !Number.isFinite(payload.exp)) return null;
  if (payload.exp < Date.now()) return null;
  if (!FILTERS.has(payload.filter)) payload.filter = "full";
  if (payload.locale !== "en") payload.locale = "ar";
  return payload;
}

export function verifyAnyStatementToken(token: string): MemberStatementSharePayload | AssociationStatementSharePayload | null {
  return verifyMemberStatementToken(token) || verifyAssociationStatementToken(token);
}

export function buildMemberStatementWhatsAppMessage(input: {
  locale: "ar" | "en";
  memberName: string;
  walletName: string;
  focusLabel: string;
  owesLabel: string;
  creditLabel: string;
  paidLabel: string;
  statementUrl: string;
}) {
  const name = String(input.memberName || "").trim() || (input.locale === "ar" ? "عزيزي العضو" : "Member");
  const body = input.locale === "ar"
    ? [
        `السلام عليكم ${name}`,
        "",
        "كشف حساب وازن",
        `الجمعية: ${input.walletName}`,
        `القسم: ${input.focusLabel}`,
        `المدفوع: ${input.paidLabel}`,
        `عليه: ${input.owesLabel}`,
        `له: ${input.creditLabel}`,
        "",
        "افتح الكشف الواضح على الجوال:",
        input.statementUrl,
      ]
    : [
        `Hello ${name}`,
        "",
        "WAZEN statement",
        `Association: ${input.walletName}`,
        `Section: ${input.focusLabel}`,
        `Paid: ${input.paidLabel}`,
        `Owes: ${input.owesLabel}`,
        `Credit: ${input.creditLabel}`,
        "",
        "Open the clear statement on your phone:",
        input.statementUrl,
      ];
  return body.join("\n");
}

export function buildAssociationStatementWhatsAppMessage(input: {
  locale: "ar" | "en";
  walletName: string;
  filterLabel: string;
  balanceLabel: string;
  movementsLabel: string;
  statementUrl: string;
}) {
  const body = input.locale === "ar"
    ? [
        "السلام عليكم",
        "",
        "كشف حساب الجمعية — وازن",
        `المحفظة: ${input.walletName}`,
        `النوع: ${input.filterLabel}`,
        `الرصيد: ${input.balanceLabel}`,
        `الحركات: ${input.movementsLabel}`,
        "",
        "افتح الكشف الواضح على الجوال:",
        input.statementUrl,
      ]
    : [
        "Hello",
        "",
        "Association statement — WAZEN",
        `Wallet: ${input.walletName}`,
        `Type: ${input.filterLabel}`,
        `Balance: ${input.balanceLabel}`,
        `Movements: ${input.movementsLabel}`,
        "",
        "Open the clear statement on your phone:",
        input.statementUrl,
      ];
  return body.join("\n");
}
