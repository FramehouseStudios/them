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
