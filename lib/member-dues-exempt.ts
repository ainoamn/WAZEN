/** Members that are ledger buckets (other income/expense sources), not subscription payers. */

export function isExternalLedgerMemberName(displayName: string) {
  const name = String(displayName ?? "").trim();
  if (!name) return false;
  const compact = name.replace(/\s+/g, " ");
  if (/^(أخرى|اخرى|other|others)$/i.test(compact)) return true;
  if (/مساهمات\s*أو\s*مصاريف\s*أخرى/i.test(compact)) return true;
  if (/مصادر\s*أخرى/i.test(compact)) return true;
  if (/other\s+(contributions?|income|sources?)/i.test(compact)) return true;
  return false;
}

export function memberIsDuesExempt(member: { dues_exempt?: number | boolean | null; due_minor?: number | null }) {
  if (member.dues_exempt === true || Number(member.dues_exempt) === 1) return true;
  return false;
}
