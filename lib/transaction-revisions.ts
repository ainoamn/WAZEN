/** Snapshot of a transaction before an in-place edit. */
export type TransactionRevisionSnapshot = {
  kind: string;
  allocation: string;
  amount_minor: number;
  member_id: string | null;
  description_ar: string;
  description_en: string;
  occurred_at: string;
  status: string;
};

export function snapshotFromTransaction(row: TransactionRevisionSnapshot): TransactionRevisionSnapshot {
  return {
    kind: row.kind,
    allocation: row.allocation,
    amount_minor: Number(row.amount_minor),
    member_id: row.member_id ?? null,
    description_ar: row.description_ar,
    description_en: row.description_en,
    occurred_at: row.occurred_at,
    status: row.status,
  };
}

export function revisionChangeLines(
  before: TransactionRevisionSnapshot,
  after: Partial<TransactionRevisionSnapshot>,
  locale: "ar" | "en",
  formatAmount: (minor: number) => string,
  memberName: (id: string | null) => string,
) {
  const lines: Array<{ label: string; from: string; to: string }> = [];
  const push = (label: string, from: string, to: string) => {
    if (from !== to) lines.push({ label, from, to });
  };
  push(locale === "ar" ? "الوصف" : "Description", before.description_ar, after.description_ar ?? before.description_ar);
  push(locale === "ar" ? "المبلغ" : "Amount", formatAmount(before.amount_minor), formatAmount(Number(after.amount_minor ?? before.amount_minor)));
  push(locale === "ar" ? "النوع" : "Type", before.kind, after.kind ?? before.kind);
  push(locale === "ar" ? "التخصيص" : "Allocation", before.allocation, after.allocation ?? before.allocation);
  push(locale === "ar" ? "العضو" : "Member", memberName(before.member_id), memberName(after.member_id === undefined ? before.member_id : after.member_id));
  push(
    locale === "ar" ? "التاريخ" : "Date",
    before.occurred_at,
    after.occurred_at ?? before.occurred_at,
  );
  return lines;
}
