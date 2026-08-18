import assert from "node:assert/strict";
import test from "node:test";
import { printOrientationFromHtml, printPageCssPx } from "../lib/print-document.ts";

test("print orientation is landscape when the document asks for it", () => {
  const html = `<html data-orientation="landscape"><body class="page-landscape"></body></html>`;
  assert.equal(printOrientationFromHtml(html), "landscape");
  assert.equal(printPageCssPx("landscape"), 1123);
});

test("print orientation defaults to portrait", () => {
  assert.equal(printOrientationFromHtml("<html><body></body></html>"), "portrait");
  assert.equal(printPageCssPx("portrait"), 794);
});
