import test from "node:test";
import assert from "node:assert/strict";
import {
  applyCharacterDialogueMemories,
  extractCharacterDialogueMemories,
  MAX_DIALOGUE_CHARS,
  MAX_LINES_PER_CHARACTER,
} from "../lib/clementine/short_film_dialogue_memory.js";

test("extracts capped immediate dialogue from exact known cues only", () => {
  const longLine = "x".repeat(MAX_DIALOGUE_CHARS + 50);
  const draft = [
    "TITLE: A FALSE HEADER",
    "JOHN SMITH",
    "First line.",
    "",
    "JOHN SMITH",
    "",
    "Skipped after a blank.",
    "JOHN SMITH (V.O.)",
    "Second line.",
    "JOHN SMITH",
    "INT. CELLAR - NIGHT",
    "JOHN SMITH",
    "MONTAGE",
    "JOHN SMITH",
    "KITCHEN - NIGHT",
    "JOHN SMITH",
    longLine,
    "JOHN SMITH",
    "Fourth line must be capped out.",
    "UNKNOWN",
    "Never captured.",
  ].join("\n");
  const memories = extractCharacterDialogueMemories({ draft, characters: ["John Smith"] });
  assert.equal(memories.length, MAX_LINES_PER_CHARACTER);
  assert.deepEqual(memories.slice(0, 2).map((memory) => memory.text), ["First line.", "Second line."]);
  assert.equal(memories[2].text.length, MAX_DIALOGUE_CHARS);
  assert.ok(memories.every((memory) => memory.name === "John Smith"));
  assert.ok(memories.every((memory) => !memory.text.includes("CELLAR")));
});

test("applying extracted dialogue is idempotent for owner mutation retries", () => {
  const project = {
    characterContexts: [{
      name: "John Smith",
      memory: [],
      arcState: { pressure: 0 },
    }],
  };
  const memories = [{ name: "John Smith", text: "First line.", page: 1, role: "dialogue" }];
  assert.equal(applyCharacterDialogueMemories(project, memories), 1);
  assert.equal(applyCharacterDialogueMemories(project, memories), 0);
  assert.equal(project.characterContexts[0].memory.length, 1);
  assert.equal(project.characterContexts[0].arcState.pressure, 1);
});
