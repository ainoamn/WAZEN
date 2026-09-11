/** Who a member should pay, from already-netted pending settlements. */

import { formatMoneyMinor } from "./money.ts";

export type SettlementPayRow = {
  id?: string;
  from_member_id: string;
  to_member_id: string;
  to_member_name?: string | null;
  amount_minor?: unknown;
  status?: string;
};

export type PayInstruction = {
  settlementId: string;
  toMemberId: string;
  toName: string;
  amountMinor: number;
  toFund: boolean;
};

export function pendingPayInstructions(
  memberId: string,
  settlements: SettlementPayRow[],
  options?: { locale?: "ar" | "en"; nameById?: Map<string, string>; fundName?: string },
): PayInstruction[] {
  const locale = options?.locale ?? "ar";
  const fundName = options?.fundName ?? (locale === "ar" ? "صندوق الجمعية" : "the association fund");
  const names = options?.nameById;
  const out: PayInstruction[] = [];
  for (const row of settlements) {
    if ((row.status ?? "pending") !== "pending") continue;
    if (row.from_member_id !== memberId) continue;
    if (String(row.from_member_id).startsWith("space:")) continue;
    const amountMinor = Math.max(0, Math.round(Number(row.amount_minor) || 0));
    if (amountMinor <= 0) continue;
    const toFund = String(row.to_member_id).startsWith("space:");
    const named = String(row.to_member_name ?? "").trim() || names?.get(row.to_member_id) || "";
    out.push({
      settlementId: String(row.id ?? `${row.to_member_id}:${amountMinor}`),
      toMemberId: row.to_member_id,
      toName: toFund ? fundName : (named || (locale === "ar" ? "عضو" : "member")),
      amountMinor,
      toFund,
    });
  }
  return out.sort((a, b) => a.toName.localeCompare(b.toName, locale === "ar" ? "ar" : "en"));
}

export function formatPayInstructionLine(
  item: Pick<PayInstruction, "toName" | "amountMinor">,
  currency: string,
  locale: "ar" | "en" = "ar",
) {
  const amount = formatMoneyMinor(item.amountMinor, currency, locale);
  return locale === "ar" ? `حول إلى ${item.toName} ${amount}` : `Transfer ${amount} to ${item.toName}`;
}

/** One sentence: حول إلى حارث ١٠ ر.ع. وإلى علي ٣ ر.ع. */
export function formatPayInstructionSentence(
  items: Array<Pick<PayInstruction, "toName" | "amountMinor">>,
  currency: string,
  locale: "ar" | "en" = "ar",
) {
  if (!items.length) return "";
  if (locale === "ar") {
    return items.map((item, index) => {
      const amount = formatMoneyMinor(item.amountMinor, currency, locale);
      return index === 0 ? `حول إلى ${item.toName} ${amount}` : `إلى ${item.toName} ${amount}`;
    }).join(" و");
  }
  return items.map((item, index) => {
    const amount = formatMoneyMinor(item.amountMinor, currency, locale);
    return index === 0 ? `Transfer ${amount} to ${item.toName}` : `${amount} to ${item.toName}`;
  }).join(", ");
}

export type SettlementConfirmAs = "manager" | "treasurer" | "payee";

export function canConfirmSettlement(input: {
  actorRole?: string | null;
  actorUserId: string;
  toMemberId: string;
  toMemberUserId?: string | null;
}): { ok: boolean; as: SettlementConfirmAs | null } {
  const role = String(input.actorRole ?? "");
  if (role === "owner" || role === "manager" || role === "supervisor") return { ok: true, as: "manager" };
  if (role === "treasurer") return { ok: true, as: "treasurer" };
  if (
    !String(input.toMemberId).startsWith("space:")
    && input.toMemberUserId
    && input.toMemberUserId === input.actorUserId
  ) {
    return { ok: true, as: "payee" };
  }
  return { ok: false, as: null };
}

export function settlementConfirmLabel(as: SettlementConfirmAs | null, locale: "ar" | "en") {
  if (as === "payee") return locale === "ar" ? "تأكيد الاستلام" : "Confirm received";
  if (as === "treasurer") return locale === "ar" ? "اعتماد الصندوق" : "Fund approve";
  return locale === "ar" ? "اعتماد الدفع" : "Approve payment";
}
