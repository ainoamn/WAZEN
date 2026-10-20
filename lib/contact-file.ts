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

function detectDelimiter(headerLine: string) {
  const comma = (headerLine.match(/,/g) || []).length;
  const semi = (headerLine.match(/;/g) || []).length;
  const tab = (headerLine.match(/\t/g) || []).length;
  if (tab >= comma && tab >= semi && tab > 0) return "\t";
  if (semi > comma) return ";";
  return ",";
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
      } else {
        quoted = !quoted;
      }
    } else if (ch === delimiter && !quoted) {
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
  if (!normalized) return "";
  if (
    /^(name|display_name|full.?name|الاسم|اسم)$/i.test(normalized)
    || normalized.includes("الاسم")
    || normalized === "اسم المساهم"
  ) {
    return "name";
  }
  if (
    /^(email|e-mail|mail)$/i.test(normalized)
    || normalized.includes("بريد")
    || normalized.includes("ايميل")
    || normalized.includes("إيميل")
  ) {
    return "email";
  }
  if (
    /^(phone|mobile|tel|telephone|whatsapp)$/i.test(normalized)
    || normalized.includes("هاتف")
    || normalized.includes("جوال")
    || normalized.includes("واتس")
    || normalized.includes("رقم")
  ) {
    return "phone";
  }
  return "";
}

function looksLikePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15 && !value.includes("@");
}

function looksLikeEmail(value: string) {
  return value.includes("@") && value.includes(".");
}

function arabicCharScore(text: string) {
  let score = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 0x0600 && code <= 0x06ff) score += 3;
    else if (code === 0xfffd) score -= 8;
    else if (code < 32 && code !== 9 && code !== 10 && code !== 13) score -= 4;
  }
  return score;
}

/** Decode uploaded bytes: UTF-8 / UTF-16 / Windows-1256 (common Excel Arabic CSV). */
export function decodeContactFileBytes(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes);
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(bytes);
  }
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(bytes);
  }
  // Excel .xlsx is a ZIP — refuse early so the UI can show a clear message.
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07)) {
    throw new Error("XLSX_NOT_SUPPORTED");
  }

  // Prefer real UTF-8 when the bytes are valid — Windows-1256 can "score" on
  // mis-decoded UTF-8 and produce mojibake that still contains Arabic letters.
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    /* fall through to legacy Arabic encodings */
  }

  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  let best = utf8;
  let bestScore = arabicCharScore(utf8);

  for (const label of ["windows-1256", "iso-8859-6"] as const) {
    try {
      const text = new TextDecoder(label).decode(bytes);
      const score = arabicCharScore(text);
      if (score > bestScore) {
        best = text;
        bestScore = score;
      }
    } catch {
      /* Encoding not available in this runtime */
    }
  }
  return best;
}

export function parseCsvContacts(source: string): ImportedContact[] {
  const lines = source.replace(/^\ufeff/, "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return [];
  const delimiter = detectDelimiter(lines[0]);
  const headerCells = parseCsvLine(lines[0], delimiter).map(headerKey);
  const hasHeader = headerCells.some(Boolean);
  const contacts: ImportedContact[] = [];
  const rows = hasHeader ? lines.slice(1) : lines;
  for (const line of rows) {
    const cells = parseCsvLine(line, delimiter);
    const pick = (key: "name" | "email" | "phone") => {
      const index = headerCells.indexOf(key);
      if (index < 0) return "";
      return cleanName(cells[index] ?? "");
    };
    let displayName = hasHeader ? pick("name") : cleanName(cells[0] ?? "");
    let email = hasHeader ? pick("email") : cleanName(cells[1] ?? "");
    let phone = hasHeader ? pick("phone") : cleanName(cells[2] ?? "");

    // Society exports: name | phone | email (no header match for phone/email).
    if (hasHeader && !phone && !email) {
      const c1 = cleanName(cells[1] ?? "");
      const c2 = cleanName(cells[2] ?? "");
      if (looksLikePhone(c1)) phone = c1;
      else if (looksLikeEmail(c1)) email = c1;
      if (looksLikePhone(c2)) phone = phone || c2;
      else if (looksLikeEmail(c2)) email = email || c2;
    }

    // Swap mis-mapped phone sitting in the email column.
    if (!phone && looksLikePhone(email)) {
      phone = email;
      email = "";
    }
    if (phone && looksLikeEmail(phone) && !email) {
      email = phone;
      phone = "";
    }

    if (!displayName && !email && !phone) continue;
    // Skip Excel summary / id-only rows mistaken for contacts.
    if (/^\d+$/.test(displayName) && !phone && !email) continue;

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
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    throw new Error("XLSX_NOT_SUPPORTED");
  }
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
  // BOM so Excel on Windows opens Arabic correctly.
  return `\ufeff${[header, ...rows].join("\r\n")}`;
}

export function isContactPickerSupported() {
  if (typeof navigator === "undefined") return false;
  return "contacts" in navigator && typeof (navigator as Navigator & { contacts?: { select?: unknown } }).contacts?.select === "function";
}
