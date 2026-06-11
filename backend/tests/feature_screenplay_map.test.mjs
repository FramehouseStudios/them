import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEFAULT_FEATURE_TARGET_PAGES,
  FEATURE_MAP_BLOCK_CLOSE,
  FEATURE_MAP_BLOCK_OPEN,
  buildFeatureScreenplayMapBlock,
  findSequenceForPage,
} from "../lib/feature_screenplay_map.js";

test("[feature-screenplay-map] maps page position into feature sequence pressure", () => {
  const sequence = findSequenceForPage(47, DEFAULT_FEATURE_TARGET_PAGES);
  assert.equal(sequence.act, "Act II");
  assert.equal(sequence.label, "Midpoint Pressure");

  const block = buildFeatureScreenplayMapBlock({
    sessionContext: {
      pageCount: 47,
      targetPages: 110,
      act: "Act II",
    },
    screenplayTask: { intent: "finish_feature" },
  });

  assert.ok(block.startsWith(FEATURE_MAP_BLOCK_OPEN));
  assert.ok(block.endsWith(FEATURE_MAP_BLOCK_CLOSE));
  assert.ok(block.includes("current_position: p47 / 110"));
  assert.ok(block.includes("current_sequence: Act II - Midpoint Pressure"));
  assert.ok(block.includes("act_bridge_ladder:"));
  assert.ok(block.includes("Midpoint -> All Is Lost"));
  assert.ok(block.includes("feature_compass:"));
  assert.ok(block.includes("before_pages: silently lock act, sequence, scene job"));
  assert.ok(block.includes("act_to_act_causality: every page should push a choice/cost chain"));
  assert.ok(block.includes("scene_to_feature_loop: each scene must satisfy its local objective"));
  assert.ok(block.includes("page_velocity: first non-empty output line should be Fountain page text"));
  assert.ok(block.includes("page_quality_gate: no placeholder scenes"));
  assert.ok(block.includes("feature_continuity_ledger:"));
  assert.ok(block.includes("ledger_rules:"));
  assert.ok(block.includes("Spend planted setups and image echoes before inventing new solutions."));
  assert.ok(block.includes("act_exit_checklist:"));
  assert.ok(block.includes("active_handoff: write toward reversal, cost, and collapse of the false tactic."));
  assert.ok(block.includes("expert_scene_execution:"));
  assert.ok(block.includes("scene_job: make the objective, obstacle, pressure clock, and cost visible"));
  assert.ok(block.includes("speed_protocol: when the user asks for pages"));
  assert.ok(block.includes("vapor_guard: replace vague tension"));
  assert.ok(block.includes("act_sequence_runway:"));
  assert.ok(block.includes("target: Act II"));
  assert.ok(block.includes("Act II - Promise Of The Premise"));
  assert.ok(block.includes("Act II - Collapse / All Is Lost"));
  assert.ok(block.includes("next_page_moves:"));
  assert.ok(block.includes("Build to a reversal that redefines"));
  assert.ok(block.includes("coming_next:"));
  assert.ok(block.includes("Act II - Reversal Fallout"));
  assert.ok(block.includes("feature_completion_protocol:"));
});

test("[feature-screenplay-map] carries feature spine, promises, and Act III payoff path", () => {
  const block = buildFeatureScreenplayMapBlock({
    sessionContext: {
      pageCount: 78,
      targetPages: 110,
      act: "Act II",
      logline: "A burned-out public defender must expose a coastal cover-up before her sister takes the fall.",
      themeArgument: "Truth is only love if it costs you something.",
      centralQuestion: "Can Mara tell the truth before it destroys the person she is protecting?",
      protagonistWant: "Win the public case.",
      protagonistNeed: "Stop mistaking control for loyalty.",
      antagonisticForce: "A town that survives by burying evidence.",
      endingImage: "The empty pool filled with rainwater at dawn.",
      currentBeat: "The false victory collapses into public betrayal.",
      emotionalContinuity: "Carry humiliation into a colder, more honest resolve.",
      characterFocus: ["Mara", "Eli"],
      unresolvedSetups: [
        "The sister's voicemail has not paid off.",
        "The opening image of the empty pool still needs its mirror.",
      ],
    },
    screenplayTask: { intent: "finish_feature" },
  });

  assert.ok(block.includes("story_spine:"));
  assert.ok(block.includes("theme_argument: Truth is only love"));
  assert.ok(block.includes("central_question: Can Mara tell the truth"));
  assert.ok(block.includes("ending_image: The empty pool filled with rainwater"));
  assert.ok(block.includes("feature_continuity_ledger:"));
  assert.ok(block.includes("logline_lock: A burned-out public defender"));
  assert.ok(block.includes("theme_argument_to_test: Truth is only love"));
  assert.ok(block.includes("central_question_to_answer: Can Mara tell the truth"));
  assert.ok(block.includes("protagonist_engine: want=Win the public case.; need=Stop mistaking control for loyalty."));
  assert.ok(block.includes("opposition_engine: A town that survives by burying evidence."));
  assert.ok(block.includes("final_image_pressure: The empty pool filled with rainwater at dawn."));
  assert.ok(block.includes("active_setups_to_carry_or_pay:"));
  assert.ok(block.includes("continuity_assets:"));
  assert.ok(block.includes("turn_engine: each scene must change leverage"));
  assert.ok(block.includes("image_system: plant, echo, and transform motifs"));
  assert.ok(block.includes("completion_output: for whole-feature requests"));
  assert.ok(block.includes("unresolved_setups_to_track:"));
  assert.ok(block.includes("sister's voicemail"));
  assert.ok(block.includes("next_page_moves:"));
  assert.ok(block.includes("Cash in the most dangerous unresolved setup."));
  assert.ok(block.includes("Act III payoff path"));
  assert.ok(block.includes("For Act I -> Act II -> Act III requests"));
});

test("[feature-screenplay-map] emits page-batch execution plan for feature page requests", () => {
  const block = buildFeatureScreenplayMapBlock({
    sessionContext: {
      pageCount: 47,
      targetPages: 110,
      act: "Act II",
      draftExcerpt: "INT. MOTEL ROOM - NIGHT\n\nJUNE folds the receipt.",
    },
    screenplayTask: {
      intent: "finish_feature",
      requestedPages: 10,
      requestedAct: "Act II",
      featureScope: "page_batch",
    },
  });

  assert.ok(block.includes("page_batch_execution_plan:"));
  assert.ok(block.includes("requested_pages: 10"));
  assert.ok(block.includes("target_act: Act II"));
  assert.ok(block.includes("starting_position: p47 / 110"));
  assert.ok(block.includes("active_sequence_pressure: Act II - Midpoint Pressure"));
  assert.ok(block.includes("structural_obligation_due_now: The midpoint must raise stakes"));
  assert.ok(block.includes("turn_budget: 2-4 escalating scene turns"));
  assert.ok(block.includes("delivery: write clean Fountain pages first"));
  assert.ok(block.includes("First useful line must be page text"));
  assert.ok(block.includes("continuity: treat the draft excerpt as the live previous page"));
  assert.ok(block.includes("scene_turn_tests:"));
  assert.ok(block.includes("launch: inherit the previous emotional residue"));
  assert.ok(block.includes("complication: add an obstacle that changes tactic"));
  assert.ok(block.includes("reversal: change leverage, information, relationship, or self-knowledge."));
  assert.ok(block.includes("exit: leave a cost, reveal, decision, or image"));
  assert.ok(block.includes("end_condition: finish the batch on a decision, reveal, cost, or image"));
  assert.ok(block.includes("For page requests, silently lock act/sequence obligations and begin with playable Fountain text."));
  assert.ok(block.includes("write playable Fountain first with no diagnosis, strategy note"));
  assert.ok(!block.includes("give one concise strategy note then write playable Fountain"));
});

test("[feature-screenplay-map] gives act-targeted page batches a sequence runway without page count", () => {
  const block = buildFeatureScreenplayMapBlock({
    sessionContext: {
      targetPages: 110,
      act: "Act III",
      draftExcerpt: "INT. COURTHOUSE - NIGHT\n\nMARA hears the verdict before anyone says it.",
    },
    screenplayTask: {
      intent: "finish_feature",
      requestedPages: 8,
      requestedAct: "Act III",
      featureScope: "page_batch",
    },
  });

  assert.ok(block.includes("act_sequence_runway:"));
  assert.ok(block.includes("target: Act III"));
  assert.ok(block.includes("Act III - Break Into Three / Final Plan"));
  assert.ok(block.includes("Act III - Climax / Final Image"));
  assert.ok(block.includes("page_batch_execution_plan:"));
  assert.ok(block.includes("requested_pages: 8"));
  assert.ok(block.includes("active_sequence_pressure: Act III - Break Into Three / Final Plan"));
  assert.ok(block.includes("structural_obligation_due_now: The final plan must express change"));
  assert.ok(block.includes("Let the final plan be born from the character's need"));
});

test("[feature-screenplay-map] trusts explicit Act II over a tiny restored draft estimate", () => {
  const block = buildFeatureScreenplayMapBlock({
    sessionContext: {
      pageCount: 1,
      targetPages: 110,
      act: "Act II",
      draftExcerpt: "INT. MOTEL ROOM - NIGHT\n\nJUNE folds the receipt.",
    },
    screenplayTask: { intent: "finish_feature" },
  });

  assert.ok(block.includes("active_act_label: Act II"));
  assert.ok(block.includes("position_basis: outline act label overrides low draft-page estimate."));
  assert.ok(block.includes("Act II must escalate tactics, reversals, midpoint pressure"));
  assert.ok(block.includes("inferred_sequence_lane: Act II - Promise Of The Premise"));
  assert.ok(block.includes("Each scene should make the protagonist try a visible strategy and pay a price."));
  assert.ok(block.includes("Write tests that force different tactics instead of repeating the premise."));
  assert.ok(block.includes("coming_next:"));
  assert.ok(block.includes("Act II - Midpoint Pressure"));
  assert.ok(block.includes("next_page_moves:"));
  assert.ok(!block.includes("current_sequence: Act I - Opening Image / Ordinary World"));
});

test("[feature-screenplay-map] maps whole-feature targets across all act lanes", () => {
  const block = buildFeatureScreenplayMapBlock({
    sessionContext: {
      targetPages: 110,
      act: "Act I -> Act II -> Act III",
      logline: "A grief-struck projectionist finds a lost film that edits her own memories.",
    },
    screenplayTask: {
      intent: "finish_feature",
      requestedAct: "Act I -> Act II -> Act III",
      featureScope: "whole_feature",
    },
  });

  assert.ok(block.includes("act_sequence_runway:"));
  assert.ok(block.includes("target: Act I -> Act II -> Act III"));
  assert.ok(block.includes("Act I - Opening Image / Ordinary World"));
  assert.ok(block.includes("Act II - Midpoint Pressure"));
  assert.ok(block.includes("Act III - Climax / Final Image"));
  assert.ok(block.includes("act_exit_checklist:"));
  assert.ok(block.includes("Act I exit: protagonist makes an irreversible choice"));
  assert.ok(block.includes("Act II exit: old tactic collapses"));
  assert.ok(block.includes("Act III exit: changed behavior resolves the central question"));
  assert.ok(block.includes("next_three_turns:"));
  assert.ok(block.includes("Opening Image / Ordinary World: Open on behavior"));
  assert.ok(block.includes("act_handoff: every local scene must push the next sequence obligation"));
});

test("[feature-screenplay-map] stays silent without screenplay intent or feature context", () => {
  assert.equal(buildFeatureScreenplayMapBlock({ screenplayTask: { intent: "dialogue_punchup" } }), "");
});
