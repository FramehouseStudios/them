import test from "node:test";
import assert from "node:assert/strict";
import { splitScreenplayLines, buildDraftExcerpt } from "../lib/draft_text.js";

test("[draft-text] splitScreenplayLines normalizes CRLF and keeps interior blanks", () => {
  assert.deepEqual(splitScreenplayLines(""), []);
  assert.deepEqual(splitScreenplayLines(null), []);
  assert.deepEqual(splitScreenplayLines("A\r\n\r\nB"), ["A", "", "B"]);
});

test("[draft-text] buildDraftExcerpt collapses whitespace with a 32-char floor", () => {
  assert.equal(buildDraftExcerpt("  INT.   KITCHEN\n\nNIGHT  "), "INT. KITCHEN NIGHT");
  assert.equal(buildDraftExcerpt("x".repeat(100), 10).length, 32);
  assert.equal(buildDraftExcerpt("x".repeat(100), 50).length, 50);
});
