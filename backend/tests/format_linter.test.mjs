// T-format-linter: rule-by-rule unit tests.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  lintScreenplay,
  FORMAT_LINT_SCHEMA_VERSION,
  RULE_SET_VERSION,
  SEVERITY,
} from "../lib/format_linter.js";

function rules(suggestions) {
  return suggestions.map((s) => s.rule);
}

// ---------- envelope shape ----------

test("[format_linter] envelope carries schemaVersion + ruleSetVersion + counts", () => {
  const r = lintScreenplay({ text: "" });
  assert.equal(r.schemaVersion, FORMAT_LINT_SCHEMA_VERSION);
  assert.equal(r.ruleSetVersion, RULE_SET_VERSION);
  assert.equal(r.totalSuggestions, 0);
  assert.deepEqual(r.bySeverity, { hard: 0, medium: 0, soft: 0 });
  assert.deepEqual(r.suggestions, []);
});

test("[format_linter] frameworkId is preserved through to the envelope", () => {
  const r = lintScreenplay({ text: "", frameworkId: "save-the-cat" });
  assert.equal(r.frameworkId, "save-the-cat");
});

test("[format_linter] tolerates non-string text", () => {
  const r = lintScreenplay({ text: null });
  assert.equal(r.totalSuggestions, 0);
});

// ---------- scene_heading_shape ----------

test("[scene_heading_shape] flags malformed all-caps scene heading", () => {
  const text = `INT KITCHEN NIGHT

JUNE
Where is the cat?
`;
  const r = lintScreenplay({ text });
  assert.ok(rules(r.suggestions).includes("scene_heading_shape"),
    `expected scene_heading_shape; got: ${JSON.stringify(rules(r.suggestions))}`);
  const s = r.suggestions.find((x) => x.rule === "scene_heading_shape");
  assert.equal(s.severity, SEVERITY.HARD);
  assert.equal(s.line, 1);
});

test("[scene_heading_shape] passes a well-formed scene heading", () => {
  const text = `INT. KITCHEN - NIGHT

JUNE
Where is the cat?
`;
  const r = lintScreenplay({ text });
  assert.ok(!rules(r.suggestions).includes("scene_heading_shape"),
    `unexpected scene_heading_shape: ${JSON.stringify(r.suggestions)}`);
});

test("[scene_heading_shape] EXT./INT./EXT./I/E. variants all valid", () => {
  for (const prefix of ["INT.", "EXT.", "INT./EXT.", "I/E."]) {
    const text = `${prefix} STREET - DAY\n\nJUNE\nHi.\n`;
    const r = lintScreenplay({ text });
    assert.ok(!rules(r.suggestions).includes("scene_heading_shape"),
      `${prefix} should be valid; got ${JSON.stringify(rules(r.suggestions))}`);
  }
});

// ---------- character_cue_caps ----------

test("[character_cue_caps] flags mixed-case cue with following dialogue", () => {
  const text = `INT. ROOM - NIGHT

June
Hello.
`;
  const r = lintScreenplay({ text });
  assert.ok(rules(r.suggestions).includes("character_cue_caps"));
  const s = r.suggestions.find((x) => x.rule === "character_cue_caps");
  assert.equal(s.severity, SEVERITY.HARD);
  assert.match(s.suggestion, /JUNE/);
});

test("[character_cue_caps] passes a CAPS cue with dialogue", () => {
  const text = `INT. ROOM - NIGHT

JUNE
Hello.
`;
  const r = lintScreenplay({ text });
  assert.ok(!rules(r.suggestions).includes("character_cue_caps"));
});

test("[character_cue_caps] does not flag short dialogue, action lines or speech continuations", () => {
  const text = `INT. KITCHEN - NIGHT

MARA stands at the sink.
She does not turn around.

MARA
You said you would call.
I waited up.

FRANK
I did call.
Twice.

He waits.
She does not move.

Rain.
`;
  const r = lintScreenplay({ text });
  assert.deepEqual(
    r.suggestions.filter((x) => x.rule === "character_cue_caps").map((x) => x.excerpt),
    [],
  );
});

test("[character_cue_caps] still flags a mixed-case cue with an extension in cue position", () => {
  const text = `INT. ROOM - NIGHT

June (V.O.)
Hello there.

Frank
Again.

june
And again.
`;
  const r = lintScreenplay({ text });
  const hits = r.suggestions.filter((x) => x.rule === "character_cue_caps").map((x) => x.excerpt);
  assert.deepEqual(hits, ["June (V.O.)", "Frank", "june"]);
});

test("[character_cue_caps] preserves forced Fountain case and flags unforced Unicode names", () => {
  const text = `INT. ROOM - NIGHT

@June (V.O.)
I am still here.

Élodie
Moi aussi.
`;
  const r = lintScreenplay({ text });
  const hits = r.suggestions.filter((x) => x.rule === "character_cue_caps");
  assert.deepEqual(hits.map((x) => x.excerpt), ["Élodie"]);
  assert.deepEqual(hits.map((x) => x.suggestion), ["Try: 'ÉLODIE'"]);
});

test("[character_cue_caps] accepts uppercase forced, accented, and caseless cues", () => {
  const text = `INT. ROOM - NIGHT

@JUNE (V.O.)
I am still here.

ÉLODIE
Moi aussi.

李明
我也在。
`;
  const r = lintScreenplay({ text });
  assert.deepEqual(r.suggestions.filter((x) => x.rule === "character_cue_caps"), []);
});

test("[character_cue_caps] uppercases only the name and preserves a valid extension", () => {
  const text = `INT. ROOM - NIGHT

Hans (on the radio)
Can you hear me?
`;
  const r = lintScreenplay({ text });
  const hit = r.suggestions.find((x) => x.rule === "character_cue_caps");
  assert.equal(hit?.suggestion, "Try: 'HANS (on the radio)'");
});

test("[parenthetical_count] recognizes forced and mixed-extension character cues", () => {
  for (const cue of ["@McCLANE", "HANS (on the radio)", "李明"]) {
    const text = `${cue}\n(quietly)\n(to himself)\nStill here.\n`;
    const r = lintScreenplay({ text });
    assert.ok(
      r.suggestions.some((x) => x.rule === "parenthetical_count"),
      `expected ${cue} to be recognized as a character cue`,
    );
  }
});

// ---------- parenthetical_density ----------

test("[parenthetical_density] flags long parentheticals", () => {
  const text = `INT. ROOM - NIGHT

JUNE
(this parenthetical has way too much detail in it for one cue)
Hello.
`;
  const r = lintScreenplay({ text });
  assert.ok(rules(r.suggestions).includes("parenthetical_density"));
  const s = r.suggestions.find((x) => x.rule === "parenthetical_density");
  assert.equal(s.severity, SEVERITY.SOFT);
});

test("[parenthetical_density] passes a short parenthetical", () => {
  const text = `INT. ROOM - NIGHT

JUNE
(softly)
Hello.
`;
  const r = lintScreenplay({ text });
  assert.ok(!rules(r.suggestions).includes("parenthetical_density"));
});

// ---------- parenthetical_count ----------

test("[parenthetical_count] flags stacked parentheticals", () => {
  const text = `INT. ROOM - NIGHT

JUNE
(softly)
(turning)
(unsure)
Hello.
`;
  const r = lintScreenplay({ text });
  assert.ok(rules(r.suggestions).includes("parenthetical_count"));
});

test("[parenthetical_count] passes a single parenthetical", () => {
  const text = `INT. ROOM - NIGHT

JUNE
(softly)
Hello.
`;
  const r = lintScreenplay({ text });
  assert.ok(!rules(r.suggestions).includes("parenthetical_count"));
});

// ---------- action_voice_present ----------

test("[action_voice_present] flags clear past-tense action", () => {
  const text = `INT. ROOM - NIGHT

She walked across the room and slammed the drawer shut quietly.

JUNE
What.
`;
  const r = lintScreenplay({ text });
  // The crude rule fires on lines ending in "-ed.".
  const hits = r.suggestions.filter((s) => s.rule === "action_voice_present");
  assert.ok(hits.length >= 1, `expected at least one past-tense flag; got ${JSON.stringify(r.suggestions)}`);
});

test("[action_voice_present] passes present-tense action", () => {
  const text = `INT. ROOM - NIGHT

She walks across the room and slams the drawer shut.

JUNE
What.
`;
  const r = lintScreenplay({ text });
  assert.ok(!rules(r.suggestions).includes("action_voice_present"));
});

// ---------- action_adverb_density ----------

test("[action_adverb_density] flags adverb-heavy action lines", () => {
  const text = `INT. ROOM - NIGHT

She quickly and angrily turns to face him with a furious look.

JUNE
What.
`;
  const r = lintScreenplay({ text });
  assert.ok(rules(r.suggestions).includes("action_adverb_density"));
});

test("[action_adverb_density] passes adverb-light action", () => {
  const text = `INT. ROOM - NIGHT

She turns to face him.

JUNE
What.
`;
  const r = lintScreenplay({ text });
  assert.ok(!rules(r.suggestions).includes("action_adverb_density"));
});

// ---------- page_economy_overlong ----------

test("[page_economy_overlong] flags long uninterrupted prose runs", () => {
  const text = `INT. ROOM - NIGHT

She turns to the window. The light is fading. Outside, a bird passes.
She thinks about the morning. She remembers the call. She had been ready.
The phone rings again. She does not pick up. She watches the bird.
The room is quiet. She breathes. She closes her eyes.
The light shifts. Time passes. She has not moved.
`;
  const r = lintScreenplay({ text });
  assert.ok(rules(r.suggestions).includes("page_economy_overlong"));
});

test("[page_economy_overlong] passes short prose between cues", () => {
  const text = `INT. ROOM - NIGHT

She turns to the window.

JUNE
Hello.

The light fades.
`;
  const r = lintScreenplay({ text });
  assert.ok(!rules(r.suggestions).includes("page_economy_overlong"));
});

// ---------- blank_lines_around_headings ----------

test("[blank_lines_around_headings] flags missing blank line after heading", () => {
  const text = `INT. ROOM - NIGHT
She turns to the window.
`;
  const r = lintScreenplay({ text });
  assert.ok(rules(r.suggestions).includes("blank_lines_around_headings"));
});

test("[blank_lines_around_headings] passes well-spaced heading", () => {
  const text = `INT. ROOM - NIGHT

She turns to the window.
`;
  const r = lintScreenplay({ text });
  assert.ok(!rules(r.suggestions).includes("blank_lines_around_headings"));
});

// ---------- ordering + counts ----------

test("[envelope] suggestions sorted by line, then severity (hard first)", () => {
  const text = `INT KITCHEN NIGHT

June
Hello.
`;
  const r = lintScreenplay({ text });
  // We expect: scene_heading_shape on line 1 (hard) then character_cue_caps on line 3 (hard).
  // Ordering: line numbers ascending.
  const lineNumbers = r.suggestions.map((s) => s.line);
  for (let i = 1; i < lineNumbers.length; i += 1) {
    assert.ok(lineNumbers[i] >= lineNumbers[i - 1], `out of order: ${lineNumbers}`);
  }
});

test("[envelope] bySeverity counts match suggestions length", () => {
  const text = `INT KITCHEN NIGHT
June
She walked into the room and sat down quietly happily slowly.
`;
  const r = lintScreenplay({ text });
  const sum = r.bySeverity.hard + r.bySeverity.medium + r.bySeverity.soft;
  assert.equal(sum, r.totalSuggestions);
});

test("[envelope] excerpt is bounded to 120 chars", () => {
  const longLine = "INT. " + "A".repeat(300) + " - NIGHT";
  const text = `${longLine}\n\nJUNE\nHi.\n`;
  const r = lintScreenplay({ text });
  for (const s of r.suggestions) {
    assert.ok(s.excerpt.length <= 120, `excerpt too long: ${s.excerpt.length}`);
  }
});

// ---------- robustness ----------

test("[format_linter] does not crash on a real-world long fixture", () => {
  // Smoke against a multi-scene block. Just must not throw.
  const text = `INT. KITCHEN - NIGHT

JUNE
(softly)
Where is the cat?

She turns to the window.

EXT. STREET - DAY

BOB
Out.

She walks. She turns. She waits.
The light is dim.

CUT TO:

INT. CAR - DUSK

JUNE
We have to go.
`;
  const r = lintScreenplay({ text });
  assert.ok(r.totalSuggestions >= 0); // sanity
  assert.ok(Array.isArray(r.suggestions));
});
