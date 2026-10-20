/** Parse society import packs (JSON / CSV templates) for one-shot roster + ledger load. */

export type SocietyImportMember = {
  displayName: string;
  phone?: string;
  email?: string;
  joinedAt?: string;
};

export type SocietyImportPayment = {
  date: string;
  memberName: string;
  phone?: string;
  amount: number | string;
  note?: string;
};

export type SocietyImportExpense = {
  date: string;
  amount: number | string;
  description: string;
  beneficiary?: string;
};

export type SocietyImportHolding = {
  date: string;
  amount: number | string;
  name: string;
  kind?: "deposit" | "investment" | "other";
  note?: string;
};

export type SocietyImportPack = {
  spaceName: string;
  type?: "society" | "group";
  currency?: string;
  monthlyContribution: number | string;
  durationMonths?: number;
  startsAt?: string;
  dueDay?: number;
  spaceId?: string;
  openingBalance?: {
    amount: number | string;
    date?: string;
    note?: string;
  };
  members: SocietyImportMember[];
  payments?: SocietyImportPayment[];
  expenses?: SocietyImportExpense[];
  holdings?: SocietyImportHolding[];
};

export function normalizePersonKey(value: string) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function cleanCell(value: unknown) {
  return String(value ?? "").replace(/^["']|["']$/g, "").replace(/\s+/g, " ").trim();
}

function parseCsvLine(line: string, delimiter = ",") {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else quoted = !quoted;
    } else if (ch === delimiter && !quoted) {
      cells.push(current.trim());
      current = "";
    } else current += ch;
  }
  cells.push(current.trim());
  return cells;
}

function detectDelimiter(headerLine: string) {
  const comma = (headerLine.match(/,/g) || []).length;
  const semi = (headerLine.match(/;/g) || []).length;
  const tab = (headerLine.match(/\t/g) || []).length;
  if (tab >= comma && tab >= semi && tab > 0) return "\t";
  if (semi > comma) return ";";
  return ",";
}

function headerMap(cells: string[]) {
  const map: Record<string, number> = {};
  cells.forEach((cell, index) => {
    const key = cleanCell(cell).toLowerCase().replace(/^\ufeff/, "");
    if (!key) return;
    if (key.includes("اسم") || key === "name" || key === "display_name") map.name = index;
    else if (key.includes("هاتف") || key.includes("جوال") || key === "phone" || key.includes("رقم")) map.phone = index;
    else if (key.includes("بريد") || key.includes("ايميل") || key.includes("إيميل") || key === "email") map.email = index;
    else if (key.includes("انضم") || key === "joined" || key === "joined_at" || key.includes("تاريخ الانضمام")) map.joined = index;
    else if (key.includes("تاريخ") || key === "date") map.date = index;
    else if (key.includes("مبلغ") || key === "amount") map.amount = index;
    else if (key.includes("ملاحظات") || key === "note" || key === "notes") map.note = index;
    else if (key.includes("وصف") || key.includes("تفاصيل") || key === "description") map.description = index;
    else if (key.includes("مستفيد") || key === "beneficiary") map.beneficiary = index;
    else if (key.includes("مساهم") && key.includes("شهر") || key === "monthly" || key.includes("اشتراك")) map.monthly = index;
  });
  return map;
}

function pick(cells: string[], map: Record<string, number>, key: string, fallback = "") {
  const index = map[key];
  if (index === undefined) return fallback;
  return cleanCell(cells[index] ?? fallback);
}

export function parseMembersCsv(source: string): SocietyImportMember[] {
  const lines = source.replace(/^\ufeff/, "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const delimiter = detectDelimiter(lines[0]);
  const map = headerMap(parseCsvLine(lines[0], delimiter));
  const members: SocietyImportMember[] = [];
  for (const line of lines.slice(1)) {
    const cells = parseCsvLine(line, delimiter);
    const displayName = pick(cells, map, "name", cleanCell(cells[0]));
    if (!displayName || /^\d+$/.test(displayName)) continue;
    members.push({
      displayName,
      phone: pick(cells, map, "phone", cleanCell(cells[2] || cells[1])),
      email: pick(cells, map, "email"),
      joinedAt: pick(cells, map, "joined") || undefined,
    });
  }
  return members;
}

export function parsePaymentsCsv(source: string): SocietyImportPayment[] {
  const lines = source.replace(/^\ufeff/, "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const delimiter = detectDelimiter(lines[0]);
  const map = headerMap(parseCsvLine(lines[0], delimiter));
  const payments: SocietyImportPayment[] = [];
  for (const line of lines.slice(1)) {
    const cells = parseCsvLine(line, delimiter);
    const memberName = pick(cells, map, "name", cleanCell(cells[2] || cells[1]));
    const amount = pick(cells, map, "amount", cleanCell(cells[4] || cells[3]));
    const date = pick(cells, map, "date", cleanCell(cells[1] || cells[0]));
    if (!memberName || !amount || !date) continue;
    payments.push({
      date,
      memberName,
      phone: pick(cells, map, "phone") || undefined,
      amount,
      note: pick(cells, map, "note") || undefined,
    });
  }
  return payments;
}

export function parseExpensesCsv(source: string): SocietyImportExpense[] {
  const lines = source.replace(/^\ufeff/, "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const delimiter = detectDelimiter(lines[0]);
  const map = headerMap(parseCsvLine(lines[0], delimiter));
  const expenses: SocietyImportExpense[] = [];
  for (const line of lines.slice(1)) {
    const cells = parseCsvLine(line, delimiter);
    const amount = pick(cells, map, "amount", cleanCell(cells[2] || cells[1]));
    const date = pick(cells, map, "date", cleanCell(cells[1] || cells[0]));
    const description = pick(cells, map, "description", cleanCell(cells[4] || cells[3]));
    if (!amount || !date || !description) continue;
    expenses.push({
      date,
      amount,
      description,
      beneficiary: pick(cells, map, "beneficiary") || undefined,
    });
  }
  return expenses;
}

export function parseSocietyImportPack(raw: unknown): SocietyImportPack {
  const data = (typeof raw === "string" ? JSON.parse(raw) : raw) as SocietyImportPack;
  if (!data || typeof data !== "object") throw new Error("INVALID_PACK");
  const spaceName = cleanCell(data.spaceName);
  if (spaceName.length < 2) throw new Error("INVALID_SPACE_NAME");
  if (!Array.isArray(data.members) || data.members.length < 1) throw new Error("INVALID_MEMBERS");
  if (data.members.length > 200) throw new Error("TOO_MANY_MEMBERS");
  if ((data.payments?.length ?? 0) > 2000) throw new Error("TOO_MANY_PAYMENTS");
  if ((data.expenses?.length ?? 0) > 500) throw new Error("TOO_MANY_EXPENSES");
  if ((data.holdings?.length ?? 0) > 200) throw new Error("TOO_MANY_HOLDINGS");
  return {
    spaceName,
    type: data.type === "group" ? "group" : "society",
    currency: cleanCell(data.currency || "OMR") || "OMR",
    monthlyContribution: data.monthlyContribution ?? 0,
    durationMonths: Number(data.durationMonths ?? 12) || 12,
    startsAt: data.startsAt ? cleanCell(data.startsAt) : undefined,
    dueDay: Number(data.dueDay ?? 1) || 1,
    spaceId: data.spaceId ? cleanCell(data.spaceId) : undefined,
    openingBalance: data.openingBalance,
    members: data.members.map((member) => ({
      displayName: cleanCell(member.displayName),
      phone: member.phone ? cleanCell(member.phone) : undefined,
      email: member.email ? cleanCell(member.email).toLowerCase() : undefined,
      joinedAt: member.joinedAt ? cleanCell(member.joinedAt) : undefined,
    })).filter((member) => member.displayName.length >= 2),
    payments: (data.payments ?? []).map((payment) => ({
      date: cleanCell(payment.date),
      memberName: cleanCell(payment.memberName),
      phone: payment.phone ? cleanCell(payment.phone) : undefined,
      amount: payment.amount,
      note: payment.note ? cleanCell(payment.note) : undefined,
    })),
    expenses: (data.expenses ?? []).map((expense) => ({
      date: cleanCell(expense.date),
      amount: expense.amount,
      description: cleanCell(expense.description),
      beneficiary: expense.beneficiary ? cleanCell(expense.beneficiary) : undefined,
    })),
    holdings: (data.holdings ?? []).map((holding) => ({
      date: cleanCell(holding.date),
      amount: holding.amount,
      name: cleanCell(holding.name),
      kind: holding.kind === "investment" || holding.kind === "other" ? holding.kind : "deposit",
      note: holding.note ? cleanCell(holding.note) : undefined,
    })).filter((holding) => holding.name.length >= 2),
  };
}

export function societyMembersTemplateCsv() {
  return `\ufeffالاسم,رقم الهاتف,البريد,تاريخ الانضمام\r\nإبراهيم بن سعيد,91100096,,2026-04-01\r\n`;
}

export function societyPaymentsTemplateCsv() {
  return `\ufeffالتاريخ,الاسم,رقم الهاتف,المبلغ,ملاحظات\r\n2026-04-15,إبراهيم بن سعيد,91100096,12,مساهمة\r\n`;
}

export function societyExpensesTemplateCsv() {
  return `\ufeffالتاريخ,المبلغ,الوصف,المستفيد\r\n2026-04-25,1.050,طباعة بطاقة,أيوب بن سعيد\r\n`;
}

export function societyPackExampleJson() {
  return `${JSON.stringify({
    spaceName: "جمعية تجريبية",
    type: "society",
    currency: "OMR",
    monthlyContribution: 2,
    durationMonths: 12,
    startsAt: "2026-04-01",
    dueDay: 1,
    openingBalance: { amount: 100, date: "2026-04-01", note: "رصيد افتتاحي" },
    members: [
      { displayName: "عضو تجريبي", phone: "91100000", joinedAt: "2026-04-01" },
    ],
    payments: [
      { date: "2026-04-15", memberName: "عضو تجريبي", amount: 4, note: "شهرين" },
    ],
    expenses: [
      { date: "2026-04-20", amount: 1.05, description: "رسوم بنكية" },
    ],
  }, null, 2)}\n`;
}
