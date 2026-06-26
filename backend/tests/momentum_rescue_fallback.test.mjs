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
  assert.match(reply, /Strongest next move: Father names the lie\./);
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
  assert.match(reply, /Strongest next move:/);
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
