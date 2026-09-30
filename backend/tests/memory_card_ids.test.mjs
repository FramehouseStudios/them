import test from "node:test";
import assert from "node:assert/strict";
import { withProjectScopedCardIds } from "../lib/memories_route.js";

// 2026-09-30: NORA's bible in two scripts came back as two "character-nora"
// cards and the app crashed merging Memories by id.
test("a character in two scripts gets one card id per script", () => {
  const cards = withProjectScopedCardIds([
    { id: "character-nora", projectId: "project_10a6a88aa6ce4abb" },
    { id: "character-nora", projectId: "project_e54f3d17f7b1402a" },
    { id: "character-danny", projectId: "project_10a6a88aa6ce4abb" },
  ]);
  assert.deepEqual(cards.map((card) => card.id), [
    "character-nora--project_10a6a88aa6ce4abb",
    "character-nora--project_e54f3d17f7b1402a",
    "character-danny",
  ]);
});

test("duplicates without a project still come out unique", () => {
  const ids = withProjectScopedCardIds([
    { id: "character-nora" },
    { id: "character-nora" },
    { id: "character-nora", projectId: "p1" },
    { id: "character-nora", projectId: "p1" },
  ]).map((card) => card.id);
  assert.deepEqual(ids, ["character-nora", "character-nora-2", "character-nora--p1", "character-nora--p1-2"]);
});

test("cards are copied, not mutated, and non-arrays are empty", () => {
  const original = { id: "character-nora", projectId: "p1" };
  withProjectScopedCardIds([original, { id: "character-nora", projectId: "p2" }]);
  assert.equal(original.id, "character-nora");
  assert.deepEqual(withProjectScopedCardIds(null), []);
});
