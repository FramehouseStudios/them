import assert from "node:assert/strict";
import { test } from "node:test";

import {
  evaluateScreenplayCanonContinuity,
  isExplicitCanonCorrectionRequest,
  normalizeAcceptedCausalFacts,
} from "../lib/screenplay_canon_guard.js";

test("[screenplay-canon-guard] normalizes only supported accepted causal facts", () => {
  assert.deepEqual(normalizeAcceptedCausalFacts([
    { kind: "Revelation", fact: "MARA: I forged the affidavit.", age_in_scenes: 4 },
    { kind: "revelation", fact: "MARA: I forged the affidavit." },
    { kind: "theme", fact: "Truth costs love." },
  ]), [{
    kind: "revelation",
    fact: "MARA: I forged the affidavit.",
    sourceSceneHeading: "",
    sourceAct: "",
    ageInScenes: 4,
  }]);
});

test("[screenplay-canon-guard] preserves explicit writer replacement canon for live checks", () => {
  assert.deepEqual(normalizeAcceptedCausalFacts([{
    kind: "writer_correction",
    fact: "Mara never burns the affidavit. It survives in Eli's ferry locker.",
    authority: "writer_correction",
  }]), [{
    kind: "writer_correction",
    fact: "Mara never burns the affidavit. It survives in Eli's ferry locker.",
    sourceSceneHeading: "",
    sourceAct: "",
    ageInScenes: 0,
  }]);
});

test("[screenplay-canon-guard] catches a repeated first-time revelation but ignores unrelated uncertainty", () => {
  const fact = [{
    kind: "revelation",
    fact: "MARA: I forged the affidavit.",
    sourceSceneHeading: "INT. ARCHIVE - NIGHT",
  }];
  const contradicted = evaluateScreenplayCanonContinuity({
    text: "INT. HALLWAY - NIGHT\n\nELI\nI had no idea you forged the affidavit.",
    acceptedCausalFacts: fact,
  });
  assert.equal(contradicted.ok, false);
  assert.equal(contradicted.reason, "accepted_canon_contradiction");
  assert.equal(contradicted.violations[0].type, "revelation_reset");
  assert.match(contradicted.repairDirectives[0], /knowledge already changed/i);

  const unrelated = evaluateScreenplayCanonContinuity({
    text: "INT. HALLWAY - NIGHT\n\nELI\nI had no idea the judge moved the hearing.",
    acceptedCausalFacts: fact,
  });
  assert.equal(unrelated.ok, true);
});

test("[screenplay-canon-guard] catches restoration of an artifact destroyed in accepted pages", () => {
  const result = evaluateScreenplayCanonContinuity({
    text: [
      "INT. HEARING ROOM - DAY",
      "",
      "Mara opens her bag. The original affidavit lies inside, intact.",
      "",
      "MARA",
      "We still have the only copy.",
    ].join("\n"),
    acceptedCausalFacts: [{
      kind: "irreversible_consequence",
      fact: "Mara burns the only copy of the affidavit.",
    }],
  });
  assert.equal(result.ok, false);
  assert.equal(result.violations[0].type, "irreversible_undo");
  assert.match(result.repairDirectives[0], /irreversible loss/i);
});

test("[screenplay-canon-guard] catches present-day resurrection but permits an explicit flashback", () => {
  const facts = [{
    kind: "irreversible_consequence",
    fact: "Eli dies in Mara's arms.",
  }];
  const present = evaluateScreenplayCanonContinuity({
    text: "INT. MARA'S KITCHEN - DAY\n\nELI\nWe need to leave.",
    acceptedCausalFacts: facts,
  });
  assert.equal(present.ok, false);
  assert.equal(present.violations[0].type, "irreversible_undo");

  const flashback = evaluateScreenplayCanonContinuity({
    text: "FLASHBACK - INT. MARA'S KITCHEN - DAY\n\nELI\nWe need to leave.",
    acceptedCausalFacts: facts,
  });
  assert.equal(flashback.ok, true);
});

test("[screenplay-canon-guard] catches relationship and decision erasure without blocking earned change", () => {
  const relationship = evaluateScreenplayCanonContinuity({
    text: "INT. COURTHOUSE - DAY\n\nEli chooses the case. By lunch, they are back to normal.",
    acceptedCausalFacts: [{
      kind: "relationship_change",
      fact: "ELI: I choose the case over us.",
    }],
  });
  assert.equal(relationship.ok, false);
  assert.equal(relationship.violations[0].type, "relationship_reset");

  const decision = evaluateScreenplayCanonContinuity({
    text: "INT. COURTROOM - DAY\n\nMara says the plea decision doesn't count. She accepts the deal.",
    acceptedCausalFacts: [{
      kind: "decision",
      fact: "Mara refuses the plea deal.",
    }],
  });
  assert.equal(decision.ok, false);
  assert.equal(decision.violations[0].type, "decision_erasure");

  const earned = evaluateScreenplayCanonContinuity({
    text: "INT. COURTROOM - DAY\n\nMara refuses the plea deal. The judge revokes bail, making the cost immediate.",
    acceptedCausalFacts: [{
      kind: "decision",
      fact: "Mara refuses the plea deal.",
    }],
  });
  assert.equal(earned.ok, true);
});

test("[screenplay-canon-guard] an explicit writer retcon overrides the automatic guard", () => {
  assert.equal(isExplicitCanonCorrectionRequest("Retcon this and change what happened to the affidavit."), true);
  const result = evaluateScreenplayCanonContinuity({
    text: "INT. HEARING ROOM - DAY\n\nMara finds the original affidavit intact.",
    acceptedCausalFacts: [{
      kind: "irreversible_consequence",
      fact: "Mara burns the only copy of the affidavit.",
    }],
    writerRequest: "Retcon this and change what happened to the affidavit.",
  });
  assert.equal(result.ok, true);
  assert.equal(result.reason, "writer_correction_override");
  assert.equal(result.correctionOverride, true);
});
