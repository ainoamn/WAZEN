export function splitSqlStatements(source) {
  const sql = source.replace(/-->\s*statement-breakpoint/g, "\n");
  const statements = []; let buffer = ""; let quote = ""; let lineComment = false; let blockComment = false; let trigger = false;
  for (let index = 0; index < sql.length; index += 1) {
    const character = sql[index]; const next = sql[index + 1] ?? ""; buffer += character;
    if (lineComment) { if (character === "\n") lineComment = false; continue; }
    if (blockComment) { if (character === "*" && next === "/") { buffer += next; index += 1; blockComment = false; } continue; }
    if (!quote && character === "-" && next === "-") { buffer += next; index += 1; lineComment = true; continue; }
    if (!quote && character === "/" && next === "*") { buffer += next; index += 1; blockComment = true; continue; }
    if (quote) {
      if (character === quote && next === quote) { buffer += next; index += 1; continue; }
      if (character === quote) quote = "";
      continue;
    }
    if (character === "'" || character === '"' || character === "`") { quote = character; continue; }
    if (!trigger && /^\s*(?:--[^\n]*\n\s*)*CREATE\s+TRIGGER\b/i.test(buffer)) trigger = true;
    if (character === ";" && (!trigger || /\bEND\s*;\s*$/i.test(buffer))) {
      const statement = buffer.trim(); if (statement) statements.push(statement); buffer = ""; trigger = false;
    }
  }
  if (buffer.trim()) statements.push(buffer.trim());
  return statements;
}
