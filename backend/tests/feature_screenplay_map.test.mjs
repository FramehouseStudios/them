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
  assert.ok(block.includes("coming_next:"));
  assert.ok(block.includes("Act II - Reversal Fallout"));
  assert.ok(block.includes("feature_completion_protocol:"));
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
  assert.ok(!block.includes("current_sequence: Act I - Opening Image / Ordinary World"));
});

test("[feature-screenplay-map] stays silent without screenplay intent or feature context", () => {
  assert.equal(buildFeatureScreenplayMapBlock({ screenplayTask: { intent: "dialogue_punchup" } }), "");
});
