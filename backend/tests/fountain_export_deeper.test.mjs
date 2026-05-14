// T-fountain-export-deeper — deeper fountain_export coverage
// beyond backend/tests/fountain_export.test.mjs.
//
// Smoke covers: title page, scene heading uppercase, action,
// character/parenthetical/dialogue, transitions, sections/
// synopses, blank-line collapse, determinism, route shape.
//
// This file exercises gaps the smoke skipped:
//   - dialogue as array vs string
//   - character cue with parenthetical but no dialogue
//   - section levels (1/2/3) emit correct # prefix
//   - synopsis emits = prefix
//   - blank kind emits a blank line
//   - unknown line kind is silently dropped (defensive)
//   - title page with only some fields
//   - multi-scene output preserves scene order
//   - trim normalizes leading/trailing whitespace

import assert from "node:assert/strict";
import { test } from "node:test";

import { exportToFountain } from "../lib/fountain_export.js";

// ---------- dialogue shapes ----------

test("[fountain-deeper] character dialogue accepts string or array of lines", () => {
  const screenplay = {
    scenes: [{
      heading: "INT. ROOM - DAY",
      lines: [
        { kind: "character", name: "ALICE", dialogue: "Hello." },
        { kind: "character", name: "BOB", dialogue: ["Hi.", "How are you?"] },
      ],
    }],
  };
  const out = exportToFountain(screenplay);
  assert.ok(out.includes("Hello."));
  assert.ok(out.includes("Hi."));
  assert.ok(out.includes("How are you?"));
});

test("[fountain-deeper] character cue with parenthetical but empty dialogue is dropped", () => {
  const screenplay = {
    scenes: [{
      heading: "INT. ROOM - DAY",
      lines: [
        { kind: "character", name: "ALICE", parenthetical: "softly", dialogue: "" },
        { kind: "character", name: "BOB", dialogue: "OK." },
      ],
    }],
  };
  const out = exportToFountain(screenplay);
  // ALICE block should be dropped because dialogue is empty.
  assert.ok(!out.includes("ALICE"), "empty-dialogue cue must be dropped");
  assert.ok(out.includes("BOB"));
});

// ---------- section levels ----------

test("[fountain-deeper] section level 1 emits single #", () => {
  const out = exportToFountain({
    scenes: [{ lines: [{ kind: "section", level: 1, text: "Act One" }] }],
  });
  assert.ok(out.includes("# Act One"));
});

test("[fountain-deeper] section level 2 emits ##", () => {
  const out = exportToFountain({
    scenes: [{ lines: [{ kind: "section", level: 2, text: "Sequence A" }] }],
  });
  assert.ok(out.includes("## Sequence A"));
});

test("[fountain-deeper] section level 3 emits ###", () => {
  const out = exportToFountain({
    scenes: [{ lines: [{ kind: "section", level: 3, text: "Beat 1" }] }],
  });
  assert.ok(out.includes("### Beat 1"));
});

test("[fountain-deeper] section without level defaults to single #", () => {
  const out = exportToFountain({
    scenes: [{ lines: [{ kind: "section", text: "Unleveled" }] }],
  });
  assert.match(out, /^# Unleveled$/m);
});

// ---------- synopsis + blank + unknown ----------

test("[fountain-deeper] synopsis emits = prefix", () => {
  const out = exportToFountain({
    scenes: [{ lines: [{ kind: "synopsis", text: "She decides." }] }],
  });
  assert.ok(out.includes("= She decides."));
});

test("[fountain-deeper] blank kind emits a blank line", () => {
  const out = exportToFountain({
    scenes: [{
      heading: "INT. ROOM - DAY",
      lines: [
        { kind: "action", text: "First." },
        { kind: "blank" },
        { kind: "action", text: "Second." },
      ],
    }],
  });
  // There should be at least one blank line between First. and Second.
  assert.match(out, /First\.\s*\n\s*\n\s*Second\./);
});

test("[fountain-deeper] unknown line kind is silently dropped (defensive)", () => {
  const out = exportToFountain({
    scenes: [{
      heading: "INT. ROOM - DAY",
      lines: [
        { kind: "action", text: "Real." },
        { kind: "mystery_kind", text: "Should not appear" },
        { kind: "action", text: "Also real." },
      ],
    }],
  });
  assert.ok(!out.includes("Should not appear"));
  assert.ok(out.includes("Real."));
  assert.ok(out.includes("Also real."));
});

// ---------- title page partials ----------

test("[fountain-deeper] title page with only some fields skips empties", () => {
  const out = exportToFountain({
    title: { title: "My Movie", contact: "writer@example.com" }, // no credit/author
  });
  assert.ok(out.includes("Title: My Movie"));
  assert.ok(out.includes("Contact: writer@example.com"));
  assert.ok(!out.includes("Credit:"));
  assert.ok(!out.includes("Author:"));
});

test("[fountain-deeper] title page treats whitespace-only fields as empty", () => {
  const out = exportToFountain({
    title: { title: "Real", author: "   " },
  });
  assert.ok(out.includes("Title: Real"));
  assert.ok(!out.includes("Author:"));
});

// ---------- multi-scene ordering ----------

test("[fountain-deeper] multi-scene output preserves scene order", () => {
  const out = exportToFountain({
    scenes: [
      { heading: "INT. FIRST - DAY", lines: [{ kind: "action", text: "Alpha." }] },
      { heading: "INT. SECOND - DAY", lines: [{ kind: "action", text: "Beta." }] },
      { heading: "INT. THIRD - DAY", lines: [{ kind: "action", text: "Gamma." }] },
    ],
  });
  const alphaIdx = out.indexOf("Alpha.");
  const betaIdx = out.indexOf("Beta.");
  const gammaIdx = out.indexOf("Gamma.");
  assert.ok(alphaIdx < betaIdx && betaIdx < gammaIdx, "scenes must preserve order");
});

// ---------- defensive shape ----------

test("[fountain-deeper] exportToFountain tolerates missing scenes array", () => {
  assert.doesNotThrow(() => exportToFountain({ title: { title: "X" } }));
});

test("[fountain-deeper] exportToFountain tolerates null and empty input", () => {
  assert.doesNotThrow(() => exportToFountain(null));
  assert.doesNotThrow(() => exportToFountain({}));
});
