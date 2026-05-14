// T-screenplay-markdown-export-tests — direct test coverage for
// backend/lib/screenplay_markdown_export.js.
//
// The lib pulls Fountain-style draft text → Markdown projection
// for the `POST /screenplay/export?format=md` branch. Had no
// direct test file before this PR. The rules in the lib header
// are the contract — these tests pin each one.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  exportScreenplayToMarkdown,
  paragraphTypeForLine,
  respondScreenplayMarkdown,
} from "../lib/screenplay_markdown_export.js";

// ---------- paragraphTypeForLine ----------

test("[md-export] scene heading: INT./EXT./EST. prefix returns Scene Heading", () => {
  assert.equal(paragraphTypeForLine("INT. KITCHEN - DAY", null), "Scene Heading");
  assert.equal(paragraphTypeForLine("EXT. ROOFTOP - NIGHT", null), "Scene Heading");
  assert.equal(paragraphTypeForLine("EST. CITY SKYLINE - DAY", null), "Scene Heading");
  assert.equal(paragraphTypeForLine("INT/EXT. CAR - DAY", null), "Scene Heading");
  assert.equal(paragraphTypeForLine("I/E. CAR - DAY", null), "Scene Heading");
});

test("[md-export] transition: CUT TO: / DISSOLVE TO: / FADE OUT. → Transition", () => {
  assert.equal(paragraphTypeForLine("CUT TO:", null), "Transition");
  assert.equal(paragraphTypeForLine("DISSOLVE TO:", null), "Transition");
  assert.equal(paragraphTypeForLine("FADE OUT.", null), "Transition");
  assert.equal(paragraphTypeForLine("THE END", null), "Transition");
});

test("[md-export] parenthetical: (softly) → Parenthetical", () => {
  assert.equal(paragraphTypeForLine("(softly)", null), "Parenthetical");
  assert.equal(paragraphTypeForLine("(lighting a cigarette)", null), "Parenthetical");
});

test("[md-export] character cue: short all-caps no : or . → Character", () => {
  assert.equal(paragraphTypeForLine("JUNE", null), "Character");
  assert.equal(paragraphTypeForLine("ALICE", null), "Character");
  // Length cap (32 chars).
  assert.equal(paragraphTypeForLine("A".repeat(32), null), "Character");
});

test("[md-export] character cue rejected when too long (>32 chars)", () => {
  const long = "A".repeat(33);
  // Falls through to Action since previousType is null.
  assert.equal(paragraphTypeForLine(long, null), "Action");
});

test("[md-export] dialogue: line after Character/Parenthetical/Dialogue → Dialogue", () => {
  assert.equal(paragraphTypeForLine("Hello.", "Character"), "Dialogue");
  assert.equal(paragraphTypeForLine("How are you?", "Parenthetical"), "Dialogue");
  assert.equal(paragraphTypeForLine("Goodbye.", "Dialogue"), "Dialogue");
});

test("[md-export] action: default for anything that doesn't match other rules", () => {
  assert.equal(paragraphTypeForLine("Rain falls on the city.", null), "Action");
  assert.equal(paragraphTypeForLine("Rain falls on the city.", "Scene Heading"), "Action");
  assert.equal(paragraphTypeForLine("Rain falls on the city.", "Action"), "Action");
});

test("[md-export] empty line returns null type", () => {
  assert.equal(paragraphTypeForLine("", null), null);
});

// ---------- exportScreenplayToMarkdown ----------

test("[md-export] non-string input returns empty string (defensive)", () => {
  assert.equal(exportScreenplayToMarkdown(null), "");
  assert.equal(exportScreenplayToMarkdown(undefined), "");
  assert.equal(exportScreenplayToMarkdown({}), "");
  assert.equal(exportScreenplayToMarkdown(42), "");
});

test("[md-export] empty draft returns empty string + trailing newline", () => {
  // Two empty lines → empty mdLines → join("") + "\n".
  const out = exportScreenplayToMarkdown("");
  assert.equal(out, "\n");
});

test("[md-export] scene heading + action draft renders correctly", () => {
  const draft = `INT. KITCHEN - DAY

Alice enters.`;
  const out = exportScreenplayToMarkdown(draft);
  assert.match(out, /^## INT\. KITCHEN - DAY$/m);
  assert.match(out, /^Alice enters\.$/m);
});

test("[md-export] character + dialogue renders character cue as bold + dialogue plain", () => {
  const draft = `INT. ROOM - DAY

ALICE
Hello.`;
  const out = exportScreenplayToMarkdown(draft);
  assert.match(out, /^\*\*ALICE\*\*$/m);
  assert.match(out, /^Hello\.$/m);
});

test("[md-export] parenthetical renders as italic", () => {
  const draft = `INT. ROOM - DAY

ALICE
(softly)
Hello.`;
  const out = exportScreenplayToMarkdown(draft);
  assert.match(out, /^\*\(softly\)\*$/m);
});

test("[md-export] transition renders as blockquote", () => {
  const draft = `INT. ROOM - DAY

Alice waves.

CUT TO:`;
  const out = exportScreenplayToMarkdown(draft);
  assert.match(out, /^> CUT TO:$/m);
});

test("[md-export] CRLF line endings normalize to LF", () => {
  const draft = "INT. ROOM - DAY\r\n\r\nAlice enters.\r\n";
  const out = exportScreenplayToMarkdown(draft);
  assert.match(out, /^## INT\. ROOM - DAY$/m);
  assert.match(out, /^Alice enters\.$/m);
  assert.ok(!out.includes("\r"), "CRLF should be normalized");
});

test("[md-export] collapses runs of 3+ blank lines to a single blank line", () => {
  const draft = "Line 1\n\n\n\n\nLine 2";
  const out = exportScreenplayToMarkdown(draft);
  assert.match(out, /Line 1\n\nLine 2/);
  assert.ok(!out.includes("\n\n\n"));
});

test("[md-export] ends with exactly one trailing newline", () => {
  const draft = "INT. ROOM - DAY\n\nAlice enters.";
  const out = exportScreenplayToMarkdown(draft);
  assert.ok(out.endsWith("\n"));
  assert.ok(!out.endsWith("\n\n"));
});

test("[md-export] determinism: same input → same output", () => {
  const draft = "INT. ROOM - DAY\n\nALICE\nHello.\n\nCUT TO:";
  assert.equal(exportScreenplayToMarkdown(draft), exportScreenplayToMarkdown(draft));
});

// ---------- respondScreenplayMarkdown ----------

test("[md-export] respondScreenplayMarkdown sets Content-Type + Content-Disposition + sends body", () => {
  let captured = { headers: {}, status: null, body: null };
  const fakeRes = {
    setHeader(k, v) { captured.headers[k.toLowerCase()] = v; },
    status(code) { captured.status = code; return this; },
    send(body) { captured.body = body; return this; },
  };
  respondScreenplayMarkdown(fakeRes, {
    draft: "INT. ROOM - DAY\n\nAlice enters.",
    baseName: "my_screenplay",
  });
  assert.equal(captured.headers["content-type"], "text/markdown; charset=utf-8");
  assert.equal(captured.headers["content-disposition"], 'attachment; filename="my_screenplay.md"');
  assert.equal(captured.status, 200);
  assert.match(captured.body, /^## INT\. ROOM - DAY$/m);
});
