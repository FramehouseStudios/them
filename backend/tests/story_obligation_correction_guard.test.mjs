import assert from "node:assert/strict";
import { test } from "node:test";

import {
  evaluateStoryObligationCorrectionAdherence,
  normalizeStoryObligationCorrections,
  storyObligationCorrectionsFromContext,
  supportsObligation,
} from "../lib/story_obligation_correction_guard.js";

const corrections = [
  {
    obligation: "The red emergency flare in Mara's coat remains unspent until the harbor blackout.",
    action: "keep_open",
    correctedAt: 200,
  },
  {
    obligation: "The bronze locker key opens the customs evidence vault.",
    action: "retire",
    correctedAt: 190,
  },
];

test("[obligation-correction-guard] normalizes the newest writer action per obligation", () => {
  const normalized = normalizeStoryObligationCorrections([
    ...corrections,
    { ...corrections[0], action: "retire", correctedAt: 100 },
  ]);
  assert.equal(normalized.length, 2);
  assert.equal(normalized[0].action, "keep_open");
});

test("[obligation-correction-guard] reads authoritative corrections from the feature graph", () => {
  assert.deepEqual(
    storyObligationCorrectionsFromContext({
      screenplayFeatureStoryGraph: { storyObligationCorrections: corrections },
    }).map((item) => item.action),
    ["keep_open", "retire"],
  );
});

test("[obligation-correction-guard] retired obligation resurrection fails closed", () => {
  const result = evaluateStoryObligationCorrectionAdherence({
    text: "Mara finds the bronze locker key and opens the customs evidence vault.",
    corrections,
  });
  assert.equal(result.ok, false);
  assert.equal(result.violations[0].type, "retired_obligation_reintroduced");
  assert.match(result.repairDirectives[0], /Remove the retired story obligation/);
});

test("[obligation-correction-guard] explicit retirement guidance may name what must stay out", () => {
  const result = evaluateStoryObligationCorrectionAdherence({
    text: "Do not reintroduce the bronze locker key or use it to open the customs evidence vault.",
    corrections,
  });
  assert.equal(result.ok, true);
});

test("[obligation-correction-guard] keep-open obligation cannot be falsely closed", () => {
  const result = evaluateStoryObligationCorrectionAdherence({
    text: "The red emergency flare in Mara's coat is paid off here, resolving that setup.",
    corrections,
  });
  assert.equal(result.ok, false);
  assert.equal(result.violations[0].type, "open_obligation_closed");
});

test("[obligation-correction-guard] keep-open obligation may be pressured without resolving it", () => {
  const result = evaluateStoryObligationCorrectionAdherence({
    text: "Mara feels the red emergency flare in her coat, but it remains unspent and unresolved.",
    corrections,
  });
  assert.equal(result.ok, true);
  assert.equal(result.correctionsChecked, 2);
});

test("[obligation-correction-guard] anchor matching tolerates screenplay phrasing", () => {
  assert.equal(
    supportsObligation(
      "The RED FLARE presses against Mara's coat as she runs.",
      corrections[0].obligation,
    ),
    true,
  );
});

test("[obligation-correction-guard] nearby screenplay context cannot push obligation anchors out of the window", () => {
  const result = evaluateStoryObligationCorrectionAdherence({
    text: [
      "End when Mara opens the live microphone; the choice makes the public hearing inevitable.",
      "Mara uses the bronze locker key to open the customs evidence vault.",
    ].join("\n"),
    corrections,
  });
  assert.equal(result.ok, false);
  assert.equal(result.violations[0].type, "retired_obligation_reintroduced");
});
