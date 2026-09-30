import assert from "node:assert/strict";
import test from "node:test";

import { isElevatedBrief, writerWordsFromTurn } from "../lib/writer_words.js";

test("[writer-words] the elevated brief's planner text is not the writer speaking", () => {
  const brief = [
    "Continue the feature as feature-film screenplay pages.",
    "Write one page in Fountain format only. Continue directly from the current draft position; do not summarize, do not ask permission, and do not include notes.",
    "- Sequence page moves: Write tests that force different tactics instead of repeating the premise.",
    "",
    "Feature workflow context:",
    "- Writer's immediate direction: Write the next page of Act II.",
    "- Current feature position: Act I (p35 / 110).",
  ].join("\n");
  assert.equal(isElevatedBrief(brief), true);
  assert.equal(writerWordsFromTurn(brief), "Write the next page of Act II.");
  assert.equal(writerWordsFromTurn("PROJECT POSITION ... Writer request: Actually, make Mae the driver's sister."), "Actually, make Mae the driver's sister.");
  assert.equal(writerWordsFromTurn("Actually, not the bus. Make it a train."), "Actually, not the bus. Make it a train.");
});

test("a flattened brief gives back only the writer's direction", async () => {
  // 2026-09-30: memory stored "Correction to honor: Write the next page. - Current
  // feature position: Act I (Scene 22/22); 26 pages drafted. - Latest accepted page batch: ..."
  const { writerWordsFromTurn } = await import("../lib/writer_words.js");
  const flat = "Feature workflow context: - Writer's immediate direction: Write the next page. - Current feature position: Act II (Scene 65/65); 74 pages drafted. - Latest accepted page batch: Latest: L3010";
  assert.equal(writerWordsFromTurn(flat), "Write the next page.");
  assert.equal(writerWordsFromTurn("- Writer's immediate direction: Actually, no - Decker lies: he read it. - Current feature position: Act III"), "Actually, no - Decker lies: he read it.");
  assert.equal(writerWordsFromTurn("- Writer's immediate direction: Make Nora carry the badge.\n- Current feature position: Act I"), "Make Nora carry the badge.");
});
