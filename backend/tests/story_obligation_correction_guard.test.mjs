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

test("[obligation-correction-guard] screenplay action may pressure a setup without explanatory prose", () => {
  const result = evaluateStoryObligationCorrectionAdherence({
    text: [
      "Mara finds the red emergency flare in her coat.",
      "She pushes it back beneath the lining and gives Eli the coat.",
    ].join("\n"),
    corrections,
  });
  assert.equal(result.ok, true);
});

test("[obligation-correction-guard] using a corrected-open setup fails even without closure language", () => {
  const result = evaluateStoryObligationCorrectionAdherence({
    text: "Mara pulls the red emergency flare from her coat and ignites it in the terminal.",
    corrections,
  });
  assert.equal(result.ok, false);
  assert.equal(result.violations[0].type, "open_obligation_closed");
});

test("[obligation-correction-guard] a keep-open-until setup may resolve when its named event arrives", () => {
  const result = evaluateStoryObligationCorrectionAdherence({
    text: "During the harbor blackout, Mara pulls the red emergency flare from her coat and ignites it.",
    corrections,
  });
  assert.equal(result.ok, true);
});

test("[obligation-correction-guard] naming a future release event does not permit premature use", () => {
  const result = evaluateStoryObligationCorrectionAdherence({
    text: "Before the harbor blackout, Mara pulls the red emergency flare from her coat and ignites it.",
    corrections,
  });
  assert.equal(result.ok, false);
  assert.equal(result.violations[0].type, "open_obligation_closed");
});

test("[obligation-correction-guard] explicit non-use remains correction-safe", () => {
  const result = evaluateStoryObligationCorrectionAdherence({
    text: "Mara grips the red emergency flare without igniting it, then returns it to her coat.",
    corrections,
  });
  assert.equal(result.ok, true);
});

test("[obligation-correction-guard] consuming another prop does not close the corrected setup", () => {
  const result = evaluateStoryObligationCorrectionAdherence({
    text: "Mara burns the ferry ledger while the red emergency flare presses against her coat.",
    corrections,
  });
  assert.equal(result.ok, true);
});

test("[obligation-correction-guard] dialogue warning about use is not mistaken for stage action", () => {
  const result = evaluateStoryObligationCorrectionAdherence({
    text: [
      "Her hand finds the RED FLARE inside her coat.",
      "ELI",
      "Light that, everyone on the harbor sees us.",
      "Mara reseals the flare and pockets it.",
    ].join("\n"),
    corrections,
  });
  assert.equal(result.ok, true);
});

test("[obligation-correction-guard] dialogue imperative stays separate from the nearby flare action", () => {
  const result = evaluateStoryObligationCorrectionAdherence({
    text: [
      "Mara's hand dives into her coat. Finds the RED FLARE.",
      "ELI",
      "Light that now, June has nothing when the harbor goes black.",
      "Mara zips the flare inside her coat.",
    ].join("\n"),
    corrections,
  });
  assert.equal(result.ok, true);
});

test("[obligation-correction-guard] physical hand closure does not close a story obligation", () => {
  const result = evaluateStoryObligationCorrectionAdherence({
    text: [
      "Mara's hand closes inside her coat.",
      "The hard cylinder of the flare presses against her ribs.",
      "She lets go of it.",
    ].join("\n"),
    corrections,
  });
  assert.equal(result.ok, true);
});

test("[obligation-correction-guard] harbor escape language does not close the flare setup", () => {
  const result = evaluateStoryObligationCorrectionAdherence({
    text: [
      "The flare remains unspent for the harbor blackout.",
      "Voss releases the ferry into the dark channel and leaves Mara facing her old reflex.",
      "The token payoff forces Mara to trust June with the wheel.",
    ].join("\n"),
    corrections,
  });
  assert.equal(result.ok, true);
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

test("[obligation-correction-guard] long feature plans still find obligations introduced after early acts", () => {
  const earlyArchitecture = Array.from(
    { length: 180 },
    (_, index) => `distinctivebeat${index} forces consequence${index}`,
  ).join(" ");
  assert.equal(
    supportsObligation(
      `${earlyArchitecture}\nDuring the harbor blackout, Mara ignites the red emergency flare from her coat.`,
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
