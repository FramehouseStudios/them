import test from "node:test";
import assert from "node:assert/strict";
import { splitDraftByCharacter, simulateParallelDrafts, mergeCharacterDrafts } from "../lib/clementine/short_film_parallel_draft.js";

function makeProject(names) {
  return {
    id: "p1",
    characterContexts: names.map((name) => ({ name, voice: "terse", backstory: "", memory: [] })),
  };
}

const DRAFT = [
  "INT. BEDROOM",
  "",
  "The room holds its breath.",
  "",
  "JOHN",
  "We shouldn't have stayed.",
  "",
  "SALLY",
  "The bedroom remembers what we tried to forget.",
  "",
  "SAM",
  "Listen — the shadow by the door is listening too.",
  "",
  "JOHN",
  "We leave now.",
].join("\n");

test("splitDraftByCharacter splits per-character lines from project.characterContexts and draft", () => {
  const project = makeProject(["John", "Sally", "Sam"]);
  const split = splitDraftByCharacter(project, DRAFT);
  assert.equal(split.sharedHeader.includes("INT. BEDROOM"), true);
  assert.deepEqual(split.perCharacter["John"], ["We shouldn't have stayed.", "We leave now."]);
  assert.deepEqual(split.perCharacter["Sally"], ["The bedroom remembers what we tried to forget."]);
  assert.deepEqual(split.perCharacter["Sam"], ["Listen — the shadow by the door is listening too."]);
  assert.equal(split.ordered.length, 4);
  assert.equal(split.ordered[0].character, "John");
  assert.equal(split.ordered[1].character, "Sally");

  const parallel = simulateParallelDrafts(project, DRAFT);
  assert.equal(parallel.length, 3);
  assert.equal(parallel[0].name, "John");
  assert.equal(parallel[0].lines.length, 2);
  assert.ok(parallel[0].draft.includes("JOHN"));
  assert.ok(parallel[0].draft.includes("We shouldn't have stayed."));
  assert.ok(!parallel[0].draft.includes("SALLY"));
});

test("mergeCharacterDrafts reconstructs draft from split result (round-trip)", () => {
  const project = makeProject(["John", "Sally", "Sam"]);
  const split = splitDraftByCharacter(project, DRAFT);
  const merged = mergeCharacterDrafts(split);
  assert.ok(merged.includes("INT. BEDROOM"));
  assert.ok(merged.includes("JOHN\nWe shouldn't have stayed."));
  assert.ok(merged.includes("SALLY\nThe bedroom remembers"));
  assert.ok(merged.includes("SAM\nListen"));
  // order preserved
  const j1 = merged.indexOf("We shouldn't have stayed.");
  const s1 = merged.indexOf("The bedroom remembers");
  const sam1 = merged.indexOf("Listen — the shadow");
  const j2 = merged.indexOf("We leave now.");
  assert.ok(j1 < s1 && s1 < sam1 && sam1 < j2);

  // also merges array of parallel drafts
  const parallel = simulateParallelDrafts(project, DRAFT);
  const merged2 = mergeCharacterDrafts(parallel);
  assert.ok(merged2.includes("JOHN"));
  assert.ok(merged2.includes("SALLY"));
  assert.ok(merged2.includes("SAM"));
});

test("handles empty contexts and draft gracefully", () => {
  const emptyProject = { characterContexts: [] };
  const split = splitDraftByCharacter(emptyProject, DRAFT);
  assert.equal(Object.keys(split.perCharacter).length, 0);
  assert.equal(split.ordered.length, 0);
  assert.ok(split.sharedHeader.includes("INT. BEDROOM"));

  const mergedEmpty = mergeCharacterDrafts(split);
  assert.ok(mergedEmpty.includes("INT. BEDROOM"));

  const nullSplit = splitDraftByCharacter(null, "");
  assert.equal(nullSplit.sharedHeader, "");
  assert.equal(nullSplit.ordered.length, 0);
  assert.equal(mergeCharacterDrafts(null), "");
  assert.equal(mergeCharacterDrafts([]), "");
  assert.equal(mergeCharacterDrafts("hello"), "hello");

  const project = makeProject(["John"]);
  const split2 = splitDraftByCharacter(project, "");
  assert.equal(split2.sharedHeader, "");
  assert.deepEqual(split2.perCharacter["John"], []);
});
