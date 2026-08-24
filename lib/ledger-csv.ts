/** Accounting CSV helpers (UTF-8 with BOM for Excel). */

export type CsvLocale = "ar" | "en";

function escapeCell(value: unknown) {
  const text = value == null ? "" : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

export function toCsv(rows: Array<Array<unknown>>) {
  const body = rows.map((row) => row.map(escapeCell).join(",")).join("\r\n");
  return `\uFEFF${body}\r\n`;
}

export function transactionsToCsv(input: {
  locale: CsvLocale;
  spaces: Array<{ id: string; name_ar: string; name_en: string; currency?: string }>;
  members: Array<{ id: string; display_name: string }>;
  transactions: Array<{
    id: string;
    space_id: string;
    member_id?: string | null;
    kind: string;
    allocation?: string;
    amount_minor: number;
    description_ar: string;
    description_en: string;
    status?: string;
    occurred_at: string;
  }>;
}) {
  const spaceName = (id: string) => {
    const space = input.spaces.find((item) => item.id === id);
    if (!space) return id;
    return input.locale === "ar" ? space.name_ar : space.name_en;
  };
  const memberName = (id?: string | null) => {
    if (!id) return "";
    return input.members.find((item) => item.id === id)?.display_name ?? id;
  };
  const head = input.locale === "ar"
    ? ["التاريخ", "المرجع", "المحفظة", "العضو", "النوع", "التخصيص", "المبلغ (أجزاء)", "البيان", "الحالة"]
    : ["Date", "Ref", "Wallet", "Member", "Kind", "Allocation", "Amount (minor)", "Description", "Status"];
  const rows = input.transactions.map((txn) => [
    txn.occurred_at,
    txn.id,
    spaceName(txn.space_id),
    memberName(txn.member_id),
    txn.kind,
    txn.allocation ?? "",
    txn.amount_minor,
    input.locale === "ar" ? txn.description_ar : txn.description_en,
    txn.status ?? "approved",
  ]);
  return toCsv([head, ...rows]);
}

export function membersToCsv(input: {
  locale: CsvLocale;
  spaces: Array<{ id: string; name_ar: string; name_en: string }>;
  members: Array<{
    id: string;
    space_id: string;
    display_name: string;
    email?: string | null;
    phone?: string | null;
    role?: string;
    due_minor?: number;
    paid_minor?: number;
    extra_minor?: number;
    status?: string | null;
  }>;
}) {
  const spaceName = (id: string) => {
    const space = input.spaces.find((item) => item.id === id);
    if (!space) return id;
    return input.locale === "ar" ? space.name_ar : space.name_en;
  };
  const head = input.locale === "ar"
    ? ["المحفظة", "العضو", "البريد", "الهاتف", "الدور", "المستحق", "المدفوع", "الفائض", "الحالة"]
    : ["Wallet", "Member", "Email", "Phone", "Role", "Due", "Paid", "Extra", "Status"];
  const rows = input.members.map((member) => [
    spaceName(member.space_id),
    member.display_name,
    member.email ?? "",
    member.phone ?? "",
    member.role ?? "",
    member.due_minor ?? 0,
    member.paid_minor ?? 0,
    member.extra_minor ?? 0,
    member.status ?? "active",
  ]);
  return toCsv([head, ...rows]);
}

/** Parse a simple bank/ledger CSV (header row required). */
export function parseBankCsv(text: string) {
  const normalized = text.replace(/^\uFEFF/, "").trim();
  if (!normalized) return { headers: [] as string[], rows: [] as Array<Record<string, string>> };
  const lines = normalized.split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return { headers: [] as string[], rows: [] as Array<Record<string, string>> };

  const split = (line: string) => {
    const cells: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else inQuotes = !inQuotes;
        continue;
      }
      if (ch === "," && !inQuotes) {
        cells.push(current.trim());
        current = "";
        continue;
      }
      current += ch;
    }
    cells.push(current.trim());
    return cells;
  };

  const headers = split(lines[0]!).map((cell) => cell.toLowerCase());
  const rows = lines.slice(1).map((line) => {
    const cells = split(line);
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] ?? "";
    });
    return row;
  });
  return { headers, rows };
}

export function mapBankCsvRow(row: Record<string, string>) {
  const pick = (...keys: string[]) => {
    for (const key of keys) {
      const found = Object.entries(row).find(([header]) => header.includes(key));
      if (found?.[1]) return found[1];
    }
    return "";
  };
  const dateRaw = pick("date", "تاريخ", "posted", "value");
  const amountRaw = pick("amount", "مبلغ", "debit", "credit", "value");
  const desc = pick("description", "بيان", "narration", "details", "memo", "reference") || "Imported";
  const credit = pick("credit", "إيداع", "deposit");
  const debit = pick("debit", "سحب", "withdrawal");

  let amount = Number(String(amountRaw).replace(/,/g, "").replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(amount) || amount === 0) {
    const c = Number(String(credit).replace(/,/g, "").replace(/[^\d.-]/g, ""));
    const d = Number(String(debit).replace(/,/g, "").replace(/[^\d.-]/g, ""));
    if (Number.isFinite(c) && c) amount = Math.abs(c);
    else if (Number.isFinite(d) && d) amount = -Math.abs(d);
  }
  const kind = amount < 0 ? "expense" : "income";
  const abs = Math.abs(amount);
  let occurredAt = new Date().toISOString();
  const parsed = Date.parse(dateRaw);
  if (Number.isFinite(parsed)) occurredAt = new Date(parsed).toISOString();

  return {
    kind: kind as "income" | "expense",
    description: desc.slice(0, 300),
    amountMajor: abs,
    occurredAt,
    rawDate: dateRaw,
  };
}
