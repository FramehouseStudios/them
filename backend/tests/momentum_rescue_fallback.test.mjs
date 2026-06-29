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
      screenplayCurrentBeat: "Mara realizes the sealed affidavit points at the judge.",
      screenplayActPressureState: "The midpoint must turn private proof into public cost.",
      screenplayCharacterArcState: "Mara still believes control can keep Eli safe.",
      screenplayNextThreeTurns: [
        "Father names the lie.",
        "Mara chooses public exposure.",
        "The sealed affidavit becomes dangerous.",
      ],
      screenplayUnresolvedSetups: ["sealed affidavit", "missing sketchbook"],
      screenplayUnresolvedStoryThreads: ["Why Marcus protected the fixer"],
      screenplayImageMotifs: ["courthouse fluorescents"],
      screenplayCharacterFocus: ["Mara", "Father"],
    },
  });

  assert.match(reply, /At Act II \/ Midpoint trap, the blockage is consequence/);
  assert.match(reply, /Story diagnosis: the middle needs a reversal/);
  assert.match(reply, /Story move library:/);
  assert.match(reply, /reversal pressure - make the current tactic appear to work/);
  assert.match(reply, /relationship pressure - make the plot solution damage/);
  assert.match(reply, /Act II rescue lens: make the old tactic fail/);
  assert.match(reply, /Beat engine: because Mara realizes the sealed affidavit points at the judge/);
  assert.match(reply, /Strongest next move: Father names the lie\./);
  assert.match(reply, /Three clean ways forward:/);
  assert.match(reply, /Option A - pressure engine: Father names the lie\./);
  assert.match(reply, /Option B - exposure engine: make Why Marcus protected the fixer public/);
  assert.match(reply, /Option C - character engine: make Mara still believes control can keep Eli safe/);
  assert.match(reply, /Pick the one that changes story state fastest/);
  assert.match(reply, /sealed affidavit/);
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
  assert.match(reply, /Strongest next move:/);
  assert.match(reply, /Three clean ways forward:/);
  assert.match(reply, /Option A - pressure engine:/);
  assert.match(reply, /Option B - exposure engine:/);
  assert.match(reply, /Option C - choice engine:/);
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
