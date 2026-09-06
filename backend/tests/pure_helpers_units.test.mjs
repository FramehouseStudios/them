// D009 — direct unit tests for helpers that moved out of index.js. Until now
// they were exercised only through the routes; these pin their contracts so
// future edits to the modules do not need a full-suite run to be trusted.

import assert from "node:assert/strict";
import { test } from "node:test";

import { parseBoundedInt, parseBoundedFloat } from "../lib/parsers.js";
import { countWords } from "../lib/counters.js";
import { isTalkSceneHeadingLine, isTalkTransitionLine, isTalkMarkdownFenceLine } from "../lib/predicates.js";
import { extractJsonObject } from "../lib/extractors.js";
import { computeThemeStalenessDays } from "../lib/computations.js";

test("[helpers] parseBoundedInt clamps, trims, and rejects non-numbers", () => {
  const cases = [
    [" 7 ", 0, 10, 7],
    ["42", 0, 10, 10],
    ["-3", 0, 10, 0],
    ["12abc", 0, 100, 12],
    ["abc", 0, 10, null],
    ["", 0, 10, null],
    [undefined, 0, 10, null],
    [null, 0, 10, null],
    [3.9, 0, 10, 3],
  ];
  for (const [value, min, max, expected] of cases) {
    assert.equal(parseBoundedInt(value, min, max), expected, `parseBoundedInt(${JSON.stringify(value)})`);
  }
});

test("[helpers] parseBoundedFloat keeps fractions and clamps", () => {
  assert.equal(parseBoundedFloat("0.25", 0, 1), 0.25);
  assert.equal(parseBoundedFloat("1.5", 0, 1), 1);
  assert.equal(parseBoundedFloat("-0.5", 0, 1), 0);
  assert.equal(parseBoundedFloat("nope", 0, 1), null);
  assert.equal(parseBoundedFloat("Infinity", 0, 1), null);
});

test("[helpers] countWords counts whitespace-separated tokens only", () => {
  assert.equal(countWords("She lights a cigarette."), 4);
  assert.equal(countWords("  leading   and\ttabs\nand newlines  "), 5);
  assert.equal(countWords(""), 0);
  assert.equal(countWords("   "), 0);
  assert.equal(countWords(null), 0);
  assert.equal(countWords(undefined), 0);
});

test("[helpers] scene-heading predicate accepts the Fountain slug prefixes and nothing else", () => {
  for (const line of ["INT. KITCHEN - NIGHT", "ext. street - day", "EST. CITY", "INT/EXT. CAR", "I/E. TRAIN", "INT KITCHEN", "  INT.  "]) {
    assert.equal(isTalkSceneHeadingLine(line), true, line);
  }
  for (const line of ["INTERIOR KITCHEN", "INTO THE NIGHT", "Maya crosses.", "", "int.erior", null]) {
    assert.equal(isTalkSceneHeadingLine(line), false, String(line));
  }
});

test("[helpers] transition predicate accepts TO: lines and the fade/cut-to-black forms", () => {
  for (const line of ["CUT TO:", "SMASH CUT TO:", "DISSOLVE TO:", "FADE IN", "FADE OUT.", "cut to black", "MATCH CUT TO:"]) {
    assert.equal(isTalkTransitionLine(line), true, line);
  }
  for (const line of ["cut to:", "CUT TO", "FADE", "We fade to black.", "", null]) {
    assert.equal(isTalkTransitionLine(line), false, String(line));
  }
});

test("[helpers] markdown fence predicate matches only bare fences", () => {
  for (const line of ["```", "```fountain", "  ```js  ", "```a-b_c"]) assert.equal(isTalkMarkdownFenceLine(line), true, line);
  for (const line of ["``` not a fence", "text ```", "``", "", null]) assert.equal(isTalkMarkdownFenceLine(line), false, String(line));
});

test("[helpers] extractJsonObject parses clean JSON and salvages an embedded object", () => {
  assert.deepEqual(extractJsonObject('{"a":1}'), { a: 1 });
  assert.deepEqual(extractJsonObject('Sure — here you go: {"beat":"June lies"} hope that helps'), { beat: "June lies" });
  assert.deepEqual(extractJsonObject('prefix {"outer":{"inner":true}} suffix'), { outer: { inner: true } });
  assert.equal(extractJsonObject("no braces here"), null);
  assert.equal(extractJsonObject("{ not json }"), null);
  assert.equal(extractJsonObject(""), null);
  assert.equal(extractJsonObject(null), null);
});

test("[helpers] computeThemeStalenessDays measures whole days since the newest anchor", () => {
  const day = 24 * 60 * 60 * 1000;
  const now = 20 * day;
  assert.equal(computeThemeStalenessDays({ lastUsedAt: 15 * day }, now), 5);
  assert.equal(computeThemeStalenessDays({ lastUsedAt: 10 * day, lastMentionedAt: 18 * day }, now), 2, "newest anchor wins");
  assert.equal(computeThemeStalenessDays({ qualityLastFeedbackAt: now - day + 1 }, now), 0, "partial days floor to 0");
  assert.equal(computeThemeStalenessDays({ lastUsedAt: now + day }, now), 0, "future anchors are not negative");
  assert.equal(computeThemeStalenessDays({}, now), 0);
  assert.equal(computeThemeStalenessDays(null, now), 0);
});
