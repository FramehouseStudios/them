import assert from "node:assert/strict";
import { test } from "node:test";

import { buildMomentumRescueFallbackReply } from "../lib/momentum_rescue_fallback.js";
import { evaluateMomentumRescueQuality } from "../lib/screenplay_page_quality.js";

test("[momentum-rescue-fallback] turns Story Spine context into a passing playable rescue", () => {
  const reply = buildMomentumRescueFallbackReply({
    transcript: "I'm stuck.",
    studioMeta: {
      screenplayTarget: "voice_pin",
      screenplayAnchorSceneLabel: "Courthouse Hallway",
      screenplayAct: "Act II",
      screenplayFeatureSequence: "Midpoint trap",
      screenplayCurrentBeat: "Mara realizes the public affidavit points at the judge.",
      screenplayProtagonistWant: "expose the forged testimony",
      screenplayProtagonistNeed: "stop hiding behind observation",
      screenplayActPressureState: "The midpoint must turn private proof into public cost.",
      screenplayCharacterArcState: "Mara still believes control can keep Eli safe.",
      screenplayCharacterArcTurns: [
        "Mara: want=expose the forged testimony; need=stop hiding behind observation; false belief=truth destroys anyone who says it aloud",
      ],
      screenplayNextThreeTurns: [
        "Father names the lie.",
        "Mara chooses public exposure.",
        "The public affidavit becomes dangerous.",
      ],
      screenplayUnresolvedSetups: ["public affidavit", "missing sketchbook"],
      screenplayUnresolvedStoryThreads: ["Why Marcus protected the fixer"],
      screenplayImageMotifs: ["courthouse fluorescents"],
      screenplayCharacterFocus: ["Mara", "Father"],
      screenplayCorrectedTerms: ["sealed affidavit"],
      screenplayCorrectionReplacements: ["sealed affidavit -> public affidavit"],
      screenplayAcceptedPageContinuity: ["Mara puts the public affidavit on the record."],
      screenplayRetrievedStoryMoments: ["Mara promised Eli she would not edit the truth again."],
    },
  });

  assert.match(reply, /At Act II \/ Midpoint trap, the blockage is consequence/);
  assert.match(reply, /Story diagnosis: the middle needs a reversal/);
  assert.match(reply, /Story move library:/);
  assert.match(reply, /reversal pressure - make the current tactic appear to work/);
  assert.match(reply, /relationship pressure - make the plot solution damage/);
  assert.match(reply, /Act II rescue lens: make the old tactic fail/);
  assert.match(reply, /Memory priority: replace sealed affidavit -> public affidavit; retire sealed affidavit/);
  assert.match(reply, /Accepted page anchor: Mara puts the public affidavit on the record/);
  assert.match(reply, /Retrieved story memory: Mara promised Eli she would not edit the truth again/);
  assert.match(reply, /Character engine: Mara's want: expose the forged testimony; need: stop hiding behind observation/);
  assert.match(reply, /Best next beat:/);
  assert.match(reply, /Ranked strongest move - (?:reversal|relationship) pressure:/);
  assert.match(reply, /Grounded in: accepted_page: Mara puts the public affidavit on the record/);
  assert.match(reply, /Proof test:/);
  assert.match(reply, /Alternate fork 2/);
  assert.match(reply, /Alternate fork 3/);
  assert.match(reply, /Beat engine: because Mara realizes the public affidavit points at the judge/);
  assert.doesNotMatch(reply, /Option [A-C] -/);
  assert.match(reply, /public affidavit/);
  assert.match(reply, /INT\. COURTHOUSE HALLWAY - NIGHT/);
  assert.match(reply, /\nFATHER\n/);
  assert.match(reply, /\nMARA\n/);

  const quality = evaluateMomentumRescueQuality({
    transcript: "I'm stuck.",
    reply,
    studioMeta: { screenplayTarget: "voice_pin" },
  });
  assert.equal(quality.applicable, true);
  assert.equal(quality.ok, true);
  assert.equal(quality.reason, "ok");
});

test("[momentum-rescue-fallback] sparse block turns still get one decisive playable move", () => {
  const reply = buildMomentumRescueFallbackReply({
    transcript: "I have writer's block and no idea what happens next.",
    studioMeta: { screenplayTarget: "voice_pin" },
  });

  assert.match(reply, /The blockage is consequence, not imagination\./);
  assert.match(reply, /Story diagnosis: the middle needs a reversal|Story diagnosis: the scene has feeling/);
  assert.match(reply, /Story move library:/);
  assert.match(reply, /objective pressure - if the scene feels inactive/);
  assert.match(reply, /image pressure - if the page feels abstract/);
  assert.match(reply, /Story rescue lens: want meets obstacle/);
  assert.match(reply, /Beat engine: because I have writer's block/);
  assert.match(reply, /Best next beat:/);
  assert.match(reply, /Ranked strongest move - objective pressure:/);
  assert.match(reply, /Proof test: The protagonist can visibly succeed or fail/);
  assert.match(reply, /Alternate fork 2 - choice pressure:/);
  assert.match(reply, /Alternate fork 3 - image pressure:/);
  assert.doesNotMatch(reply, /Option [A-C] -/);
  assert.match(reply, /INT\. PRESSURE POINT - NIGHT/);
  assert.match(reply, /\nPROTAGONIST\n/);

  const quality = evaluateMomentumRescueQuality({
    transcript: "I have writer's block and no idea what happens next.",
    reply,
    studioMeta: { screenplayTarget: "voice_pin" },
  });
  assert.equal(quality.applicable, true);
  assert.equal(quality.ok, true);
  assert.equal(quality.reason, "ok");
});

test("[momentum-rescue-fallback] applies corrected creative instincts without outranking due canon", () => {
  const studioMeta = {
    screenplayTarget: "voice_pin",
    screenplayAct: "Act II",
    screenplayFeatureSequence: "Pressure closes in",
    screenplayCurrentBeat: "Mara cannot decide whether to trust Eli.",
    screenplayCharacterFocus: ["Mara", "Eli"],
    screenplayStoryMovePreferenceOverrides: [
      {
        family: "relationship_pressure",
        stance: "prefer",
        updated_at: 5_000,
      },
      {
        family: "reversal_pressure",
        stance: "avoid",
        updated_at: 5_000,
      },
    ],
  };
  const personalized = buildMomentumRescueFallbackReply({
    transcript: "I am stuck in the middle.",
    studioMeta,
  });

  assert.match(personalized, /Ranked strongest move - relationship pressure:/);
  assert.doesNotMatch(personalized, /Ranked strongest move - reversal pressure:/);

  const canonBound = buildMomentumRescueFallbackReply({
    transcript: "I am stuck in the middle.",
    studioMeta: {
      ...studioMeta,
      screenplayDueStoryThread: {
        kind: "payoff",
        setup: "Eli hid the key in Mara's coat.",
        promisedPayoff: "Mara finds the key while deciding whether Eli lied.",
        sourceAct: "Act I",
        ageInScenes: 18,
      },
    },
  });

  assert.match(canonBound, /Ranked strongest move - payoff pressure:/);
  assert.match(canonBound, /Eli hid the key in Mara's coat/);
});

test("[momentum-rescue-fallback] spends the oldest accepted-scene promise during provider fallback", () => {
  const reply = buildMomentumRescueFallbackReply({
    transcript: "I'm stuck before the hearing.",
    studioMeta: {
      screenplayTarget: "voice_pin",
      screenplayAct: "Act II",
      screenplayFeatureSequence: "Bad Guys Close In",
      screenplayCurrentBeat: "Mara reaches the hearing with no leverage.",
      screenplayCharacterFocus: ["Mara", "Judge Vale"],
      screenplayUnresolvedSetups: ["The sealed affidavit"],
      screenplayAcceptedPageContinuity: ["The locket survives the bailiff's search."],
      screenplayDueStoryThread: {
        kind: "payoff",
        setup: "The red locket hidden in the courthouse clock.",
        promisedPayoff: "Mara uses the locket to expose who altered the verdict.",
        sourceSceneHeading: "INT. COURTHOUSE CLOCK TOWER - NIGHT",
        sourceSceneOutcome: "The locket survives the bailiff's search.",
        sourceAct: "Act II",
        ageInScenes: 17,
      },
    },
  });

  assert.match(reply, /Oldest due story thread: The red locket hidden in the courthouse clock, still open after 17 accepted scenes/);
  assert.match(reply, /Promised payoff: Mara uses the locket to expose who altered the verdict/);
  assert.match(reply, /Ranked strongest move - payoff pressure:/);
  assert.match(reply, /Grounded in: due_story_thread: The red locket hidden in the courthouse clock/);
  assert.match(reply, /Mara uses the locket to expose who altered the verdict/);
  assert.match(reply, /Mara puts the red locket hidden in the courthouse clock where Judge Vale can see it/);
});

test("[momentum-rescue-fallback] preserves accepted causal canon when the provider fails", () => {
  const reply = buildMomentumRescueFallbackReply({
    transcript: "I'm blocked after Mara destroyed the proof.",
    studioMeta: {
      screenplayTarget: "voice_pin",
      screenplayAct: "Act II",
      screenplayFeatureSequence: "Reversal fallout",
      screenplayCurrentBeat: "Mara walks into the hearing with no physical evidence.",
      screenplayCharacterFocus: ["Mara", "Judge Vale"],
      screenplayAcceptedCausalFacts: [
        {
          kind: "irreversible_consequence",
          fact: "Mara burns the only copy of the affidavit.",
          sourceAct: "Act II",
          sourceSceneHeading: "INT. ARCHIVE - NIGHT",
          ageInScenes: 8,
        },
        {
          kind: "revelation",
          fact: "MARA: I forged the affidavit.",
          sourceAct: "Act II",
          ageInScenes: 9,
        },
      ],
    },
  });

  assert.match(reply, /Binding accepted irreversible consequence: Mara burns the only copy of the affidavit\. Continue its consequence; do not reset it\./);
  assert.match(reply, /Binding accepted revelation: MARA: I forged the affidavit\. Continue its consequence; do not reset it\./);
  assert.match(reply, /Grounded in: accepted_causal_fact: Mara burns the only copy of the affidavit/);
  assert.match(reply, /Do not undo it/);
  assert.doesNotMatch(reply, /finds (?:another|the) copy of the affidavit/i);
});
