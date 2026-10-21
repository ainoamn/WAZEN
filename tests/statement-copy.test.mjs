import assert from "node:assert/strict";
import test from "node:test";
import {
  STATEMENT_COPY_MAX_LEN,
  applyStatementCopyVars,
  defaultStatementCopy,
  effectiveStatementCopy,
  parseSpaceStatementCopy,
  resolveStatementIntro,
  resolveWhatsAppAttach,
  serializeSpaceStatementCopy,
} from "../lib/statement-copy.ts";

test("default Arabic intros and WhatsApp letters are the approved society copy", () => {
  const ar = defaultStatementCopy("ar");
  assert.match(ar.introDues, /كشف المستحقات المتأخرة عن السداد/);
  assert.match(ar.introDuesPaid, /كشف الأعضاء المسدّدين/);
  assert.match(ar.introDuesOwing, /بيان الالتزامات المالية/);
  assert.match(ar.introMovements, /سجل الحركات المالية/);
  assert.match(ar.whatsappDues, /السلام عليكم ورحمة الله وبركاته/);
  assert.match(ar.whatsappDues, /إدارة \{\{spaceName\}\}/);
  assert.match(ar.whatsappMovements, /الكشف المالي الشامل/);
  assert.ok(ar.whatsappDues.length < STATEMENT_COPY_MAX_LEN);
  assert.ok(ar.whatsappMovements.length < STATEMENT_COPY_MAX_LEN);
});

test("statement copy applies spaceName placeholder", () => {
  const text = applyStatementCopyVars("بيان «{{spaceName}}»", { spaceName: "أبناء خلفان" });
  assert.equal(text, "بيان «أبناء خلفان»");
});

test("custom intro overrides default", () => {
  const saved = parseSpaceStatementCopy({
    ar: { introDues: "عبارة خاصة بـ {{spaceName}}" },
  });
  const intro = resolveStatementIntro(saved, "ar", "dues", "جمعية أبناء خلفان");
  assert.equal(intro, "عبارة خاصة بـ جمعية أبناء خلفان");
  assert.match(effectiveStatementCopy(saved, "ar").introMovements, /{{spaceName}}/);
});

test("WhatsApp letter resolves space name and keeps full greeting", () => {
  const msg = resolveWhatsAppAttach(null, "ar", "dues", "جمعية أبناء خلفان");
  assert.match(msg, /الأهل والأعضاء الكرام في جمعية أبناء خلفان/);
  assert.match(msg, /إدارة جمعية أبناء خلفان/);
  assert.doesNotMatch(msg, /\{\{spaceName\}\}/);
});

test("serialize round-trips cleaned fields", () => {
  const json = serializeSpaceStatementCopy({
    ar: { introDues: "  مرحبا {{spaceName}}  ", whatsappDues: "" },
  });
  const parsed = parseSpaceStatementCopy(json);
  assert.equal(parsed.ar?.introDues, "مرحبا {{spaceName}}");
  assert.equal(parsed.ar?.whatsappDues, undefined);
});
