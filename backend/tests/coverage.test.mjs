import test from "node:test";
import assert from "node:assert/strict";
import {
  COVERAGE_SCHEMA_VERSION,
  RATING_SCALE_MIN, RATING_SCALE_MAX,
  THRESHOLDS, RATING_LEVEL,
  rateFormat, rateStory,
  scoreMentorGoldenReply, scoreMentorGoldenBatch, mentorPassRate,
  rateCoverage, buildCoveragePayload,
} from "../lib/clementine/coverage.js";

const BALANCED = `INT. KITCHEN - NIGHT

She walks in.

JUNE
Hello.

MARCUS
Hi.

EXT. ROOFTOP - DAWN

The sun rises. He waits.

JUNE
You came.

MARCUS
(softly)
I had to.`;

const BROKEN_FORMAT = `INT KITCHEN NIGHT

june
hello there

INT ROOM - DAY

Some action.`;

// format
test("rateFormat: balanced scores PASS, broken scores lower", () => {
  const good = rateFormat(BALANCED);
  assert.equal(typeof good.score, "number");
  assert.ok(good.score >= 1 && good.score <= 5);
  assert.equal(good.level, RATING_LEVEL.PASS);
  assert.ok(good.hard === 0);

  const bad = rateFormat(BROKEN_FORMAT);
  assert.ok(bad.score < good.score);
  assert.ok(bad.hard >= 1);
  assert.ok(bad.issues.some((x) => x.code === "scene_heading_shape" || x.code === "no_headings" || x.code === "character_cue_caps"));
});

test("rateFormat: empty draft is FAIL", () => {
  const r = rateFormat("");
  assert.equal(r.level, RATING_LEVEL.FAIL);
  assert.equal(r.score, 1);
});

test("rateFormat: case-sensitive headings vs broken INT without dot", () => {
  const r = rateFormat("INT KITCHEN - NIGHT\n\nAction line.");
  assert.ok(r.issues.some((x) => x.code === "scene_heading_shape"));
});

// story
test("rateStory: balanced has scenes and PASS/CONSIDER", () => {
  const s = rateStory(BALANCED);
  assert.equal(s.sceneCount, 2);
  assert.ok(s.score >= 1 && s.score <= 5);
  assert.ok([RATING_LEVEL.PASS, RATING_LEVEL.CONSIDER].includes(s.level));
  assert.ok(typeof s.dialogueRatio === "number");
  assert.ok(typeof s.summary === "string");
});

test("rateStory: empty is FAIL", () => {
  const s = rateStory("");
  assert.equal(s.level, RATING_LEVEL.FAIL);
  assert.equal(s.sceneCount, 0);
});

test("rateStory: long scene penalizes score", () => {
  const long = ["INT. CABIN - NIGHT", ""].concat(Array.from({ length: 90 }, (_, i) => `Action line ${i}`)).join("\n");
  const s = rateStory(long);
  assert.ok(s.warnings.some((w) => w.code === "scene_too_long"));
  assert.ok(s.score < 5);
});

test("rateStory: story rating is pure (same input same output)", () => {
  assert.deepEqual(rateStory(BALANCED), rateStory(BALANCED));
});

// mentor gold
test("scoreMentorGoldenReply: golden PASS and weak FAIL via exact match", () => {
  const tc = { golden: "Rooftop at dawn, Priya wants Anjali to give the toast.", weak: "How are you feeling today?" };
  assert.equal(scoreMentorGoldenReply(tc.golden, tc).verdict, RATING_LEVEL.PASS);
  assert.equal(scoreMentorGoldenReply(tc.weak, tc).verdict, RATING_LEVEL.FAIL);
  assert.equal(scoreMentorGoldenReply(tc.golden, tc).overall, 4.5);
  assert.equal(scoreMentorGoldenReply(tc.weak, tc).overall, 1.5);
});

test("scoreMentorGoldenReply: heuristic place+want boosts weak-generic to higher", () => {
  const weakLike = "Hi! How are you feeling today? beautiful and vulnerable";
  const goldLike = "A hospital parking lot at dawn, Nadia has to tell Tomas she's not donating.";
  const a = scoreMentorGoldenReply(weakLike);
  const b = scoreMentorGoldenReply(goldLike);
  assert.ok(b.overall > a.overall);
  assert.equal(a.verdict, RATING_LEVEL.FAIL);
});

test("scoreMentorGoldenBatch + mentorPassRate", () => {
  const cases = [
    { id: "a", golden: "Parking lot dawn Nadia wants to tell Tomas", weak: "How are you today?" },
    { id: "b", golden: "Diner at midnight Ruth wants Carl to sign", weak: "Let's brainstorm" },
  ];
  const scored = scoreMentorGoldenBatch(cases);
  assert.equal(scored.length, 2);
  assert.ok(scored.every((x) => x.golden && x.weak));
  // exact golden matches -> PASS, so pass rate 1.0
  assert.equal(mentorPassRate(scored), 1);
  assert.equal(mentorPassRate([]), 0);
});

// combined
test("rateCoverage: overall is average of format+story and has verdict", () => {
  const c = rateCoverage({ text: BALANCED });
  assert.equal(c.schemaVersion, COVERAGE_SCHEMA_VERSION);
  assert.ok(c.overall >= 1 && c.overall <= 5);
  assert.ok([RATING_LEVEL.PASS, RATING_LEVEL.CONSIDER, RATING_LEVEL.FAIL].includes(c.verdict));
  assert.ok(c.format && c.story);
  assert.ok(typeof c.summary === "string");
});

test("rateCoverage: accepts precomputed formatResult/storyResult", () => {
  const f = rateFormat(BALANCED);
  const s = rateStory(BALANCED);
  const c = rateCoverage({ text: BALANCED, formatResult: f, storyResult: s });
  assert.equal(c.format.score, f.score);
  assert.equal(c.story.score, s.score);
});

test("buildCoveragePayload: wraps coverage with projectId and scale", () => {
  const p = buildCoveragePayload({ text: BALANCED, projectId: "p1", frameworkId: "three_act" });
  assert.equal(p.schemaVersion, COVERAGE_SCHEMA_VERSION);
  assert.equal(p.projectId, "p1");
  assert.equal(p.frameworkId, "three_act");
  assert.ok(p.overall >= 1 && p.overall <= 5);
  assert.ok([RATING_LEVEL.PASS, RATING_LEVEL.CONSIDER, RATING_LEVEL.FAIL].includes(p.verdict));
});

test("thresholds and scale constants", () => {
  assert.equal(COVERAGE_SCHEMA_VERSION, 1);
  assert.equal(RATING_SCALE_MIN, 1);
  assert.equal(RATING_SCALE_MAX, 5);
  assert.equal(THRESHOLDS.passMinOverall, 3.5);
  assert.equal(THRESHOLDS.failMaxOverall, 2.8);
});

test("backend/index.js stays within its 33626-line ceiling", async () => {
  const fs = await import("node:fs");
  const text = fs.readFileSync(new URL("../../backend/index.js", import.meta.url), "utf8");
  let c = 0;
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") c++;
  if (text.length > 0 && !text.endsWith("\n")) c += 1;
  assert.ok(c > 0 && c <= 33626, `Expected a nonempty index within the D009 ceiling; got ${c} lines`);
});
