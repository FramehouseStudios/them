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
  assert.ok(block.includes("page_quality_gate: no placeholder scenes"));
  assert.ok(block.includes("expert_scene_execution:"));
  assert.ok(block.includes("scene_job: make the objective, obstacle, pressure clock, and cost visible"));
  assert.ok(block.includes("speed_protocol: when the user asks for pages"));
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
  assert.ok(block.includes("continuity: treat the draft excerpt as the live previous page"));
  assert.ok(block.includes("end_condition: finish the batch on a decision, reveal, cost, or image"));
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
  assert.ok(block.includes("next_page_moves:"));
  assert.ok(block.includes("Name the active structural obligation before writing."));
  assert.ok(!block.includes("current_sequence: Act I - Opening Image / Ordinary World"));
});

test("[feature-screenplay-map] stays silent without screenplay intent or feature context", () => {
  assert.equal(buildFeatureScreenplayMapBlock({ screenplayTask: { intent: "dialogue_punchup" } }), "");
});
