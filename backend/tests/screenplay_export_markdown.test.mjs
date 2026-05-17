// T-screenplay-export-markdown — pure-helper tests for the markdown
// projection used by POST /screenplay/export (format=md|markdown).
//
// The integration with the HTTP endpoint is exercised end-to-end via
// the existing screenplay export smoke; this file pins the
// line-level conversion rules in fast unit tests.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  exportScreenplayToMarkdown,
  paragraphTypeForLine,
} from "../lib/screenplay_markdown_export.js";

// ---------- paragraph typing ----------

test("[screenplay-md] paragraphTypeForLine: scene heading", () => {
  assert.equal(paragraphTypeForLine("INT. KITCHEN - NIGHT", null), "Scene Heading");
  assert.equal(paragraphTypeForLine("EXT. ROOFTOP - DAWN", null), "Scene Heading");
});

test("[screenplay-md] paragraphTypeForLine: transition", () => {
  assert.equal(paragraphTypeForLine("CUT TO:", null), "Transition");
  assert.equal(paragraphTypeForLine("FADE OUT.", null), "Transition");
});

test("[screenplay-md] paragraphTypeForLine: parenthetical", () => {
  assert.equal(paragraphTypeForLine("(softly)", null), "Parenthetical");
});

test("[screenplay-md] paragraphTypeForLine: character", () => {
  assert.equal(paragraphTypeForLine("JUNE", null), "Character");
  assert.equal(paragraphTypeForLine("DR MARCUS", null), "Character");
});

test("[screenplay-md] paragraphTypeForLine: dialogue follows character", () => {
  assert.equal(paragraphTypeForLine("You left.", "Character"), "Dialogue");
  assert.equal(paragraphTypeForLine("You left.", "Parenthetical"), "Dialogue");
  assert.equal(paragraphTypeForLine("You left.", "Dialogue"), "Dialogue");
});

test("[screenplay-md] paragraphTypeForLine: action when no prior context", () => {
  assert.equal(paragraphTypeForLine("She picks up the locket.", null), "Action");
});

// ---------- end-to-end conversion ----------

const SAMPLE = `INT. KITCHEN - NIGHT

She picks up the locket.

JUNE
(softly)
You left.

MARCUS
I came back.

CUT TO:`;

test("[screenplay-md] full conversion: H2 slug, bold char, italic paren, blockquote transition", () => {
  const out = exportScreenplayToMarkdown(SAMPLE);
  assert.match(out, /^## INT\. KITCHEN - NIGHT/m);
  assert.match(out, /^\*\*JUNE\*\*/m);
  assert.match(out, /^\*\(softly\)\*/m);
  assert.match(out, /^> CUT TO:/m);
  assert.match(out, /^You left\.$/m);
  assert.match(out, /^She picks up the locket\.$/m);
});

test("[screenplay-md] empty draft returns empty body (just newline)", () => {
  assert.equal(exportScreenplayToMarkdown(""), "\n");
});

test("[screenplay-md] non-string input returns empty string", () => {
  assert.equal(exportScreenplayToMarkdown(null), "");
  assert.equal(exportScreenplayToMarkdown(undefined), "");
  assert.equal(exportScreenplayToMarkdown(42), "");
});

test("[screenplay-md] normalizes \\r\\n line endings", () => {
  const a = exportScreenplayToMarkdown("INT. ROOM - DAY\r\n\r\nShe walks in.");
  const b = exportScreenplayToMarkdown("INT. ROOM - DAY\n\nShe walks in.");
  assert.equal(a, b);
});

test("[screenplay-md] collapses runs of blank lines to a single blank", () => {
  const out = exportScreenplayToMarkdown("INT. ROOM - DAY\n\n\n\nShe walks in.");
  // Output should have exactly one blank line between the slug and the action.
  assert.match(out, /## INT\. ROOM - DAY\n\nShe walks in\.\n$/);
});

test("[screenplay-md] determinism", () => {
  assert.equal(exportScreenplayToMarkdown(SAMPLE), exportScreenplayToMarkdown(SAMPLE));
});
