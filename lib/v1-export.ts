/** Business API v1 — CSV export for a wallet. */

import { transactionsToCsv, membersToCsv, type CsvLocale } from "./ledger-csv";

export async function exportV1SpaceCsv(
  db: D1Database,
  space: { id: string; name_ar?: string; name_en?: string; currency?: string },
  options: { kind: "transactions" | "members"; locale?: CsvLocale; limit?: number },
) {
  const locale = options.locale === "en" ? "en" : "ar";
  const limit = Math.min(5000, Math.max(1, options.limit ?? 1000));
  const spaceRow = await db.prepare("SELECT id, name_ar, name_en, currency FROM spaces WHERE id=?")
    .bind(space.id).first<{ id: string; name_ar: string; name_en: string; currency: string }>();
  const spaces = [{
    id: space.id,
    name_ar: spaceRow?.name_ar ?? space.name_ar ?? space.id,
    name_en: spaceRow?.name_en ?? space.name_en ?? space.id,
    currency: spaceRow?.currency ?? space.currency ?? "OMR",
  }];

  if (options.kind === "members") {
    const members = await db.prepare(`
      SELECT id, space_id, display_name, email, phone, role, due_minor, paid_minor, extra_minor, status
      FROM members WHERE space_id=? ORDER BY display_name LIMIT ?
    `).bind(space.id, limit).all<{
      id: string; space_id: string; display_name: string; email: string | null; phone: string | null;
      role: string; due_minor: number; paid_minor: number; extra_minor: number; status: string | null;
    }>();
    return {
      filename: `wazen-${space.id}-members.csv`,
      body: membersToCsv({ locale, spaces, members: members.results ?? [] }),
    };
  }

  const members = await db.prepare("SELECT id, display_name FROM members WHERE space_id=?")
    .bind(space.id).all<{ id: string; display_name: string }>();
  const transactions = await db.prepare(`
    SELECT id, space_id, member_id, kind, allocation, amount_minor, description_ar, description_en, status, occurred_at
    FROM transactions WHERE space_id=? AND COALESCE(status,'approved')<>'superseded'
    ORDER BY occurred_at DESC LIMIT ?
  `).bind(space.id, limit).all<{
    id: string; space_id: string; member_id: string | null; kind: string; allocation: string;
    amount_minor: number; description_ar: string; description_en: string; status: string | null; occurred_at: string;
  }>();

  return {
    filename: `wazen-${space.id}-transactions.csv`,
    body: transactionsToCsv({
      locale,
      spaces,
      members: members.results ?? [],
      transactions: (transactions.results ?? []).map((txn) => ({
        ...txn,
        status: txn.status ?? "approved",
      })),
    }),
  };
}
