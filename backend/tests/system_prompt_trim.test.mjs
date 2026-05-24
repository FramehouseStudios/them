import assert from "node:assert/strict";
import { test } from "node:test";

import {
  extractTaggedBlocks,
  fitSystemPromptForTurnLatency,
} from "../lib/system_prompt_trim.js";

test("[system-prompt-trim] extracts screenplay-critical tagged blocks in source order", () => {
  const prompt = [
    "PERSONA",
    "<session>",
    "  project: p1",
    "</session>",
    "MIDDLE",
    "<screenplay_task>",
    "intent: continue_script",
    "</screenplay_task>",
  ].join("\n");

  const blocks = extractTaggedBlocks(prompt);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].tag, "session");
  assert.equal(blocks[1].tag, "screenplay_task");
});

test("[system-prompt-trim] preserves session and screenplay task when trimming large prompts", () => {
  const persona = `PERSONA\n${"A cinematic system line. ".repeat(160)}`;
  const draft = [
    "INT. DINER - NIGHT",
    "",
    "JUNE waits with her coat still on.",
    "",
    "MARA",
    "We keep going until the ending tells the truth.",
  ].join("\n");
  const session = [
    "<session>",
    "  project: proj-7",
    "  version: v3",
    "  phase: scene_draft",
    "  pack: Feature Sprint",
    "  draft_excerpt:",
    ...draft.split("\n").map((line) => `    ${line}`),
    "</session>",
  ].join("\n");
  const task = [
    "<screenplay_task>",
    "intent: continue_script",
    "label: Continue Script",
    "output: Continue from the current draft in screenplay/Fountain style.",
    "</screenplay_task>",
  ].join("\n");
  const backendAddenda = `DIRECTOR\n${"Backend behavior guidance. ".repeat(180)}`;
  const prompt = [persona, session, task, backendAddenda].join("\n\n");

  const out = fitSystemPromptForTurnLatency(prompt, {
    routingLane: "normal_rotation",
    chatModelPlan: { tier: "fast" },
    fastMaxChars: 1_600,
    richMaxChars: 2_200,
  });

  assert.ok(out.length <= 1_600);
  assert.ok(out.includes("<session>"));
  assert.ok(out.includes("project: proj-7"));
  assert.ok(out.includes("draft_excerpt:"));
  assert.ok(out.includes("INT. DINER - NIGHT"));
  assert.ok(out.includes("<screenplay_task>"));
  assert.ok(out.includes("intent: continue_script"));
});

test("[system-prompt-trim] preserves prior head-tail behavior when no protected tags exist", () => {
  const prompt = `${"HEAD ".repeat(400)}\nMIDDLE\n${"TAIL ".repeat(400)}`;
  const out = fitSystemPromptForTurnLatency(prompt, {
    chatModelPlan: { tier: "fast" },
    fastMaxChars: 1_200,
    richMaxChars: 1_600,
  });

  assert.ok(out.length <= 1_200);
  assert.ok(out.includes("HEAD"));
  assert.ok(out.includes("TAIL"));
  assert.ok(out.includes("..."));
  assert.ok(!out.includes("<session>"));
});
