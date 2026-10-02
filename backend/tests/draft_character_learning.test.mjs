import test from "node:test";
import assert from "node:assert/strict";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  characterNameFromCue,
  createDraftCharacterLearner,
  extractDraftCharacterDialogue,
} from "../lib/draft_character_learning.js";
import { createCreativeMemoryStore } from "../lib/creative_memory_store.js";
import { createJsonPersistence } from "../lib/persistence_json.js";
import { extractTraits } from "../lib/trait_library.js";

const SCENE = [
  "INT. DOCK - DAY",
  "",
  "Rain hammers the boards.",
  "",
  "NORA",
  "(whispering)",
  "Who's there? I told you not to follow me.",
  "",
  "MARCUS (V.O.)",
  "You never listen. Never.",
  "",
  "BOOM.",
  "",
  "NORA (CONT'D)",
  "Go home, Marcus.",
  "",
  "CUT TO:",
  "",
  "EXT. HARBOR - NIGHT",
].join("\n");

test("[draft-character-learning] reads speakers and their dialogue from Fountain", () => {
  const speakers = extractDraftCharacterDialogue(SCENE);
  assert.deepEqual(speakers, [
    { name: "NORA", lines: ["Who's there? I told you not to follow me.", "Go home, Marcus."] },
    { name: "MARCUS", lines: ["You never listen. Never."] },
  ]);
});

test("[draft-character-learning] headings, transitions and shouted action are not speakers", () => {
  const speakers = extractDraftCharacterDialogue("INT. ROOM - DAY\n\nBOOM.\nGlass everywhere.\n\nFADE OUT.");
  assert.deepEqual(speakers, []);
});

test("[draft-character-learning] a forced @cue keeps its mixed case", () => {
  assert.deepEqual(extractDraftCharacterDialogue("@McCLANE\nYippee."), [{ name: "McCLANE", lines: ["Yippee."] }]);
});

test("[draft-character-learning] speakers and lines are bounded", () => {
  const many = Array.from({ length: 12 }, (_, i) => `CHAR${String.fromCharCode(65 + i)}\nLine ${i}.`).join("\n\n");
  assert.equal(extractDraftCharacterDialogue(many).length, 8);
  const chatty = `NORA\n${Array.from({ length: 60 }, (_, i) => `Line ${i}.`).join("\n")}`;
  assert.equal(extractDraftCharacterDialogue(chatty)[0].lines.length, 40);
});

test("[draft-character-learning] records project-scoped traits and skips an unchanged page", async () => {
  const recorded = [];
  const learner = createDraftCharacterLearner({
    recordCharacterMention: async (input) => recorded.push(input),
    extractTraits,
    logger: null,
  });
  const first = await learner.learnFromDraft({ userId: "u1", projectId: "p1", projectTitle: "Dock", draft: SCENE });
  assert.ok(first.learned >= 1);
  assert.ok(recorded.every((item) => item.userId === "u1" && item.metadata.projectId === "p1" && item.source === "draft_save"));
  assert.ok(recorded.some((item) => item.characterName === "Nora"));

  const again = await learner.learnFromDraft({ userId: "u1", projectId: "p1", draft: SCENE });
  assert.deepEqual(again, { learned: 0, skipped: "unchanged" });

  const otherProject = await learner.learnFromDraft({ userId: "u1", projectId: "p2", draft: SCENE });
  assert.ok(otherProject.learned >= 1, "the unchanged check is per project");
});

test("[draft-character-learning] guests and pages without dialogue are skipped", async () => {
  const learner = createDraftCharacterLearner({ recordCharacterMention: async () => assert.fail("must not record"), extractTraits, logger: null });
  assert.deepEqual(await learner.learnFromDraft({ userId: "", projectId: "p1", draft: SCENE }), { learned: 0, skipped: "missing_scope" });
  assert.deepEqual(await learner.learnFromDraft({ userId: "u1", projectId: "p1", draft: "INT. ROOM - DAY\n\nQuiet." }), { learned: 0, skipped: "no_dialogue" });
});

test("[draft-character-learning] onVersionSaved resolves the memory user from the request and never throws", async () => {
  const recorded = [];
  const learner = createDraftCharacterLearner({
    recordCharacterMention: async (input) => { recorded.push(input); throw new Error("store down"); },
    extractTraits,
    logger: null,
  });
  learner.onVersionSaved({ req: { authUser: { id: "u9" } }, project: { id: "p9", title: "Pier" }, draft: SCENE });
  learner.onVersionSaved({ req: {}, project: { id: "p9" }, draft: SCENE });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(recorded.length >= 1);
  assert.ok(recorded.every((item) => item.userId === "u9"));
});

test("[draft-character-learning] a cue is stored as the character's name", () => {
  assert.deepEqual(
    ["MARA", "DR. CHEN", "O'BRIEN", "MARY-KATE"].map(characterNameFromCue),
    ["Mara", "Dr. Chen", "O'Brien", "Mary-Kate"],
  );
});

test("[draft-character-learning] a page-learned character answers to the writer's spelling", async () => {
  // 2026-10-01: a saved page stored "MARA"; the writer's confirmed want for
  // "Mara" then landed on that record, still named in caps, and a lookup for
  // "Mara" found nothing (cross-platform learned-memory eval).
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-cue-name-"));
  const store = createCreativeMemoryStore({ persistence: createJsonPersistence({ jsonRoot: root }) });
  const metadata = { projectId: "project_mara", projectTitle: "Mara" };
  await store.recordCharacterMention({ userId: "u1", characterName: "MARA", source: "draft_save", metadata });
  await store.recordCharacterMention({ userId: "u1", characterName: "Mara", source: "screenplay_learning_confirmation", metadata });
  const memory = await store.getCreativeMemoryForPrompt({ userId: "u1", projectId: "project_mara", projectTitle: "Mara", query: "Mara" });
  assert.deepEqual((memory?.characters || []).map((character) => character.name), ["Mara"]);
});
