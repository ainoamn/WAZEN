import assert from "node:assert/strict";
import test from "node:test";
import {
  applyStatementCopyVars,
  defaultStatementCopy,
  effectiveStatementCopy,
  parseSpaceStatementCopy,
  resolveStatementIntro,
  serializeSpaceStatementCopy,
} from "../lib/statement-copy.ts";

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

test("serialize round-trips cleaned fields", () => {
  const json = serializeSpaceStatementCopy({
    ar: { introDues: "  مرحبا {{spaceName}}  ", whatsappDues: "" },
  });
  const parsed = parseSpaceStatementCopy(json);
  assert.equal(parsed.ar?.introDues, "مرحبا {{spaceName}}");
  assert.equal(parsed.ar?.whatsappDues, undefined);
  assert.ok(defaultStatementCopy("ar").introDues.length > 10);
});
