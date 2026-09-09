/** Parse and export address-book contacts from vCard / CSV files. */

export type ImportedContact = {
  displayName: string;
  email: string;
  phone: string;
};

function cleanName(value: string) {
  return value.replace(/^["']|["']$/g, "").replace(/\s+/g, " ").trim();
}

function unfoldVcard(source: string) {
  return source.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
}

export function parseVcardContacts(source: string): ImportedContact[] {
  const blocks = unfoldVcard(source).split(/BEGIN:VCARD/i).slice(1);
  const contacts: ImportedContact[] = [];
  for (const block of blocks) {
    const body = block.split(/END:VCARD/i)[0] ?? "";
    const fn = body.match(/^FN(?:;[^:\n]*)*:(.+)$/im)?.[1]?.trim() ?? "";
    const n = body.match(/^N(?:;[^:\n]*)*:(.+)$/im)?.[1]?.trim() ?? "";
    const email = body.match(/^EMAIL(?:;[^:\n]*)*:(.+)$/im)?.[1]?.trim() ?? "";
    const tel = body.match(/^TEL(?:;[^:\n]*)*:(.+)$/im)?.[1]?.trim() ?? "";
    const fromN = n.split(";").filter(Boolean).reverse().join(" ");
    const displayName = cleanName(fn || fromN);
    if (!displayName && !email && !tel) continue;
    contacts.push({
      displayName: displayName || email || tel,
      email: email.toLowerCase(),
      phone: tel,
    });
  }
  return contacts;
}

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (ch === "," && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

function headerKey(value: string) {
  const normalized = value.trim().toLowerCase().replace(/^\ufeff/, "");
  if (["name", "display_name", "full name", "الاسم", "اسم"].includes(normalized)) return "name";
  if (["email", "e-mail", "mail", "البريد", "الايميل", "إيميل"].includes(normalized)) return "email";
  if (["phone", "mobile", "tel", "telephone", "الهاتف", "الجوال", "رقم"].includes(normalized)) return "phone";
  return "";
}

export function parseCsvContacts(source: string): ImportedContact[] {
  const lines = source.replace(/^\ufeff/, "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return [];
  const headerCells = parseCsvLine(lines[0]).map(headerKey);
  const hasHeader = headerCells.some(Boolean);
  const contacts: ImportedContact[] = [];
  const rows = hasHeader ? lines.slice(1) : lines;
  for (const line of rows) {
    const cells = parseCsvLine(line);
    const pick = (key: string, fallbackIndex: number) => {
      const index = headerCells.indexOf(key);
      return cleanName(cells[index >= 0 ? index : fallbackIndex] ?? "");
    };
    const displayName = hasHeader ? pick("name", 0) : cleanName(cells[0] ?? "");
    const email = hasHeader ? pick("email", 1) : cleanName(cells[1] ?? "");
    const phone = hasHeader ? pick("phone", 2) : cleanName(cells[2] ?? "");
    if (!displayName && !email && !phone) continue;
    contacts.push({
      displayName: displayName || email || phone,
      email: email.toLowerCase(),
      phone,
    });
  }
  return contacts;
}

export function parseContactFile(filename: string, source: string): ImportedContact[] {
  const name = filename.toLowerCase();
  if (name.endsWith(".vcf") || name.endsWith(".vcard") || /BEGIN:VCARD/i.test(source)) {
    return parseVcardContacts(source);
  }
  return parseCsvContacts(source);
}

export function contactsToVcard(contacts: ImportedContact[]) {
  return contacts.map((contact) => {
    const lines = ["BEGIN:VCARD", "VERSION:3.0", `FN:${contact.displayName || "Contact"}`];
    if (contact.phone) lines.push(`TEL;TYPE=CELL:${contact.phone}`);
    if (contact.email) lines.push(`EMAIL:${contact.email}`);
    lines.push("END:VCARD");
    return lines.join("\r\n");
  }).join("\r\n");
}

export function contactsToCsv(contacts: ImportedContact[]) {
  const header = "name,email,phone";
  const rows = contacts.map((contact) => {
    const cells = [contact.displayName, contact.email, contact.phone].map((value) => {
      const text = String(value ?? "");
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    });
    return cells.join(",");
  });
  return [header, ...rows].join("\r\n");
}

export function isContactPickerSupported() {
  if (typeof navigator === "undefined") return false;
  return "contacts" in navigator && typeof (navigator as Navigator & { contacts?: { select?: unknown } }).contacts?.select === "function";
}
