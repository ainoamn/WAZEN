/** Signed public member-statement links for WhatsApp (text + URL, readable on phone). */

import { createHmac, timingSafeEqual } from "node:crypto";
import type { MemberLedgerFocus } from "./member-ledger";

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

export type MemberStatementSharePayload = {
  kind: "member_statement";
  memberId: string;
  spaceId: string;
  focus: MemberLedgerFocus;
  locale: "ar" | "en";
  exp: number;
};

const FOCUSES = new Set<MemberLedgerFocus>(["all", "paid", "spent", "owes", "credit"]);

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
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", statementSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyMemberStatementToken(token: string): MemberStatementSharePayload | null {
  const raw = String(token ?? "").trim();
  const [body, sig] = raw.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", statementSecret()).update(body).digest("base64url");
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const payload = JSON.parse(fromB64url(body).toString("utf8")) as MemberStatementSharePayload;
    if (payload?.kind !== "member_statement") return null;
    if (!payload.memberId || !payload.spaceId || !Number.isFinite(payload.exp)) return null;
    if (payload.exp < Date.now()) return null;
    if (!FOCUSES.has(payload.focus)) payload.focus = "all";
    if (payload.locale !== "en") payload.locale = "ar";
    return payload;
  } catch {
    return null;
  }
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
