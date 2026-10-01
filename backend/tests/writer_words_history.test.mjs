import test from "node:test";
import assert from "node:assert/strict";
import { writerWordsForHistory } from "../lib/writer_words.js";

// 2026-09-30: History listed the app's briefs as what the writer said.
test("History shows the writer's words, not the app's brief", () => {
  assert.equal(
    writerWordsForHistory("Write the first page of a screenplay scene for Aaron. Scene impulse: A clerk stops the clock. Write only the page content in clean Fountain/Hollywood screenplay format: no notes."),
    "First page: A clerk stops the clock.",
  );
  assert.equal(
    writerWordsForHistory("Continue the feature as feature-film screenplay pages.\nWriter's immediate direction: Write the next page.\n- Current feature position: Act II"),
    "Write the next page.",
  );
  assert.equal(
    writerWordsForHistory("Continue the feature as feature-film screenplay pages. Write one page in Fountain format only. Continue directly from the"),
    "Continue the script",
    "a stored turn cut before the direction",
  );
  assert.equal(writerWordsForHistory("Make DANNY quieter."), "Make DANNY quieter.");
  assert.equal(writerWordsForHistory(""), "");
});

test("a saved recap that quoted the app's brief quotes the writer instead", async () => {
  const { recapWithWriterWords } = await import("../lib/writer_words.js");
  assert.equal(
    recapWithWriterWords("Creative Momentum: You shared “Write the first page of a screenplay scene for Aaron. Scene impulse: A clerk stops the clock Write only the page content in clean Fountai…”. Clementine responded “FADE IN: EXT”."),
    "Creative Momentum: You shared “First page: A clerk stops the clock”. Clementine responded “FADE IN: EXT”.",
  );
  const own = "You shared “I miss the old draft”. Clementine responded “Let's find it”.";
  assert.equal(recapWithWriterWords(own), own);
});
