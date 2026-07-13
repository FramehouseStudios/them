import assert from "node:assert/strict";
import { test } from "node:test";

import {
  extractTaggedBlocks,
  fitSystemPromptForTurnLatency,
} from "../lib/system_prompt_trim.js";

test("[system-prompt-trim] extracts screenplay-critical tagged blocks in source order", () => {
  const prompt = [
    "PERSONA",
    "<clementine_core>",
    "identity: CLEMENTINE",
    "</clementine_core>",
    "<session>",
    "  project: p1",
    "</session>",
    "MIDDLE",
    "<screenplay_task>",
    "intent: continue_script",
    "</screenplay_task>",
  ].join("\n");

  const blocks = extractTaggedBlocks(prompt);
  assert.equal(blocks.length, 3);
  assert.equal(blocks[0].tag, "clementine_core");
  assert.equal(blocks[1].tag, "session");
  assert.equal(blocks[2].tag, "screenplay_task");
});

test("[system-prompt-trim] preserves session and screenplay task when trimming large prompts", () => {
  const persona = [
    "PERSONA",
    "<clementine_core>",
    "identity: CLEMENTINE protects truth, memory, feature continuity, and direct page writing.",
    "</clementine_core>",
    "<clementine_safety_contract>",
    "truthfulness: never fabricate memory or certainty.",
    "</clementine_safety_contract>",
    "<creative_memory>",
    "project-continuity:",
    "  project_id: rain-docket",
    "  authoritative_corrections: cassette -> VHS tape",
    "  current_beat: Mara finds the sealed affidavit.",
    "  unresolved_setups: The sister's voicemail",
    "recurring-characters:",
    "  - JUNE - sparse, wounded, dry",
    "</creative_memory>",
    "A cinematic system line. ".repeat(160),
  ].join("\n");
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
  assert.ok(out.includes("<clementine_core>"));
  assert.ok(out.includes("feature continuity"));
  assert.ok(out.includes("<clementine_safety_contract>"));
  assert.ok(out.includes("never fabricate"));
  assert.ok(out.includes("<creative_memory>"));
  assert.ok(out.includes("authoritative_corrections: cassette -> VHS tape"));
  assert.ok(out.includes("current_beat: Mara finds the sealed affidavit."));
  assert.ok(out.includes("unresolved_setups: The sister's voicemail"));
  assert.ok(out.includes("JUNE"));
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

test("[system-prompt-trim] does not slice through protected correction memory blocks", () => {
  const protectedBlocks = [
    ["clementine_core", `identity: Clementine\n${"core voice. ".repeat(80)}`],
    ["clementine_safety_contract", `truthfulness: never invent memory.\n${"safety. ".repeat(80)}`],
    ["creative_memory", `episodic-memory:\n  directive: treat CORRECTION items as overriding older conflicting memory.\n  - CORRECTION: Mara: Correction for Mara: VHS tape, not cassette.\n${"memory. ".repeat(80)}`],
    ["session", `project: rain-docket\n${"session. ".repeat(80)}`],
    ["feature_film_map", `act: II\n${"feature. ".repeat(80)}`],
    ["accepted_twists", `twist: Mara burns the false evidence.\n${"twist. ".repeat(80)}`],
    ["writer_block_memory", [
      "directive: use accepted continuity before inventing.",
      "accepted_page_anchor: Mara puts the affidavit on the record.",
      "rank_1: engine=reversal_pressure; score=88; evidence=accepted_page: Mara puts the affidavit on the record. | remembered_next_turn: The judge turns it against her; move=Turn the apparent win into a public trap that forces Mara to risk Eli's trust.; success_check=The gain becomes a cost and Mara changes tactic.",
      "selection_rule: execute rank_1 unless a writer correction conflicts.",
      "rescue detail. ".repeat(80),
    ].join("\n")],
    ["screenplay_task", `intent: continue_script\n${"task. ".repeat(80)}`],
    ["block_signal", `level: low\n${"block. ".repeat(80)}`],
  ].map(([tag, body]) => `<${tag}>\n${body}\n</${tag}>`);
  const prompt = [
    "PERSONA ".repeat(300),
    ...protectedBlocks,
    "DIRECTOR ".repeat(300),
  ].join("\n\n");

  const out = fitSystemPromptForTurnLatency(prompt, {
    chatModelPlan: { tier: "fast" },
    fastMaxChars: 1_500,
    richMaxChars: 2_000,
  });

  assert.ok(out.length <= 1_500);
  for (const tag of [
    "clementine_core",
    "clementine_safety_contract",
    "creative_memory",
    "session",
    "feature_film_map",
    "accepted_twists",
    "writer_block_memory",
    "screenplay_task",
    "block_signal",
  ]) {
    assert.ok(out.includes(`<${tag}>`), `missing <${tag}>`);
    assert.ok(out.includes(`</${tag}>`), `missing </${tag}>`);
  }
  assert.ok(out.includes("CORRECTION: Mara"));
  assert.ok(out.includes("VHS"));
  assert.ok(out.includes("rank_1: engine=reversal_pressure"));
});

test("[system-prompt-trim] keeps ranked rescue authority inside the live rich-turn budget", () => {
  const writerBlock = [
    "<writer_block_memory>",
    "directive: use project memory before invention.",
    "position: Act II / Midpoint trap",
    "current_beat: Mara puts the affidavit on the record.",
    "accepted_page_anchor: Mara puts the affidavit on the record.",
    "correction_contract: public affidavit, not sealed affidavit.",
    "ranked_rescue_moves:",
    `  rank_1: engine=reversal_pressure; score=91; evidence=accepted_page: Mara puts the affidavit on the record. | remembered_next_turn: The judge turns it against Mara; move=Use the accepted affidavit beat as an apparent win, then make the judge turn it into public cost so Mara must risk Eli's trust.; success_check=The gain becomes a cost and Mara changes tactic.`,
    "  rank_2: engine=relationship_pressure; score=82; evidence=Eli distrusts Mara; move=Make exposure cost the bond.; success_check=Trust changes.",
    "  selection_rule: execute rank_1 unless it conflicts with a writer correction.",
    "response_contract:",
    "  - Lead with rank_1.",
    "  - Include a playable micro-beat.",
    "detail: " + "story pressure. ".repeat(300),
    "</writer_block_memory>",
  ].join("\n");
  const prompt = [
    "PERSONA " + "companion voice. ".repeat(500),
    writerBlock,
    "DIRECTOR " + "behavior note. ".repeat(500),
  ].join("\n\n");

  const out = fitSystemPromptForTurnLatency(prompt, {
    routingLane: "creative",
    chatModelPlan: { tier: "rich" },
    fastMaxChars: 3_800,
    richMaxChars: 6_200,
  });

  assert.ok(out.length <= 6_200);
  assert.ok(out.includes("<writer_block_memory>"));
  assert.ok(out.includes("</writer_block_memory>"));
  assert.ok(out.includes("rank_1: engine=reversal_pressure"));
  assert.ok(out.includes("evidence=accepted_page: Mara puts the affidavit"));
  assert.ok(out.includes("rule: execute rank_1 unless a writer correction conflicts."));
});
