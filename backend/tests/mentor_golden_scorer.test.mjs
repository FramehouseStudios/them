import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CASES, CATEGORIES } from "../evals/mentor_conversation/cases.mjs";
import {
  scoreMentorReply,
  scoreRegister,
  scorePitchConcreteness,
  scoreBuildOnWriter,
  scoreStructureAccuracy,
  scoreOnTheNoseDetection,
  THRESHOLDS,
} from "../evals/mentor_conversation/score_mentor_reply.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

test("[mentor-golden] forty cases, eight per skill, each with a golden and a weak exemplar", () => {
  assert.equal(CASES.length, 40);
  for (const category of CATEGORIES) {
    assert.equal(CASES.filter((c) => c.category === category).length, 8, category);
  }
  const ids = new Set(CASES.map((c) => c.id));
  assert.equal(ids.size, 40, "ids are unique");
  for (const c of CASES) {
    assert.ok(c.writer.trim() && c.golden.trim() && c.weak.trim(), c.id);
  }
});

test("[mentor-golden] every golden exemplar passes and every weak exemplar fails the scorer", () => {
  const problems = [];
  for (const c of CASES) {
    const golden = scoreMentorReply(c.golden, c);
    const weak = scoreMentorReply(c.weak, c);
    if (golden.verdict !== "PASS") problems.push(`${c.id} golden=${golden.overall} ${JSON.stringify(golden.dimensions)}`);
    if (weak.verdict !== "FAIL") problems.push(`${c.id} weak=${weak.overall} ${JSON.stringify(weak.dimensions)}`);
  }
  assert.deepEqual(problems, []);
});

test("[mentor-golden] register catches the companion failure modes", () => {
  assert.ok(scoreRegister("How are you feeling today? What's on your mind?").score <= 2.5);
  assert.ok(scoreRegister("As an AI language model I can't say. Here are options:\n- one\n- two").score <= 2);
  assert.ok(scoreRegister("It's okay to feel overwhelmed. Take a deep breath. You are not alone!").score <= 2.5);
  const good = scoreRegister("The scene needs an obstacle. Give him the keys and let her want them. Which of them lies first?");
  assert.equal(good.score, 5);
  assert.ok(scoreRegister("Take your time.", { allowShort: true }).score >= 4.5);
});

test("[mentor-golden] the skill dimensions reward the specific thing", () => {
  const pitch = scorePitchConcreteness("A motel at dawn. Nadia wants Tomas to sign, but he has already left the key. Which of them do you want to win?");
  assert.ok(pitch.score >= 4.5, JSON.stringify(pitch));
  const vaguePitch = scorePitchConcreteness("What if we wrote something emotional about family? Let me know what you think.");
  assert.ok(vaguePitch.score <= 2, JSON.stringify(vaguePitch));

  const build = scoreBuildOnWriter("Keep Ada and the lighthouse. She reaches for his pockets before his pulse.", { writerNouns: ["Ada", "lighthouse", "body"] });
  assert.ok(build.score >= 4, JSON.stringify(build));
  const replace = scoreBuildOnWriter("Instead, what if we scrap the lighthouse and do a morgue?", { writerNouns: ["Ada", "lighthouse", "body"] });
  assert.ok(replace.score <= 2, JSON.stringify(replace));

  const structure = scoreStructureAccuracy("The midpoint near page 55 is a reversal, because the old tactic just failed.", { expectTerms: ["midpoint", "reversal"], expectPages: [{ term: "midpoint", low: 50, high: 60 }] });
  assert.equal(structure.score, 5);
  const wrongPage = scoreStructureAccuracy("The midpoint sits at page 20 and then things happen and then more happen.", { expectTerms: ["midpoint", "reversal"], expectPages: [{ term: "midpoint", low: 50, high: 60 }] });
  assert.ok(wrongPage.score <= 2, JSON.stringify(wrongPage));

  const note = scoreOnTheNoseDetection("That's on the nose. Try: “You left the porch light on.” She attacks the light instead.", { flatLine: "I'm so angry at you." });
  assert.equal(note.score, 5);
  const praise = scoreOnTheNoseDetection("Love that line, it works.", { flatLine: "I'm so angry at you." });
  assert.equal(praise.score, 1);
});

test("[mentor-golden] the shared mentor core file exists and carries the identity", () => {
  const text = fs.readFileSync(path.join(repoRoot, "docs", "persona", "mentor-core.txt"), "utf8");
  assert.match(text, /MENTOR CORE \(identity, every turn\):/);
  assert.match(text, /intention and obstacle/);
  assert.match(text, /verdict first/);
  assert.equal(THRESHOLDS.passMinOverall, 3.5);
});

test("[mentor-golden] conversational structure terms retain their dramatic meaning", () => {
  for (const [reply, term] of [
    ["He flips a coin because he cannot decide.", "reversal"],
    ["The committee meets because the hearing starts today.", "commitment"],
    ["She stands in for her father because he is ill.", "obstacle"],
  ]) {
    const result = scoreStructureAccuracy(reply, {expectTerms: [term]});
    assert.ok(result.score <= 2, `${term}: ${JSON.stringify(result)}`);
  }
  const reversal = scoreStructureAccuracy("At the mid-point on page 55, a false win flips the tactic because the plan costs her an ally.", {
    expectTerms: ["midpoint", "reversal"], expectPages: [{term: "midpoint", low: 50, high: 60}],
  });
  assert.equal(reversal.score, 5, JSON.stringify(reversal));
});

test("[mentor-golden] page evidence is required and checked for spoken aliases", () => {
  const spec = {expectTerms: ["midpoint", "reversal"], expectPages: [{term: "midpoint", low: 50, high: 60}]};
  for (const reply of [
    "The mid-point on page 20 is a false win because the plan costs her an ally.",
    "The midpoint is a reversal because the plan costs her an ally.",
  ]) {
    const result = scoreStructureAccuracy(reply, spec);
    assert.ok(result.score < 3.5, JSON.stringify(result));
    assert.ok(result.notes.some(note => /page/.test(note)), JSON.stringify(result));
  }
});

test("[mentor-golden] register counts external questions, not dialogue punctuation", () => {
  for (const quote of ['"Where were you? Why did you leave?"', "'Where were you? Why did you leave?'", '“Where were you? Why did you leave?”']) {
    const one = scoreRegister(`Try ${quote} What changes now?`);
    assert.equal(one.notes.some(note => /questions/.test(note)), false, JSON.stringify(one));
    const two = scoreRegister(`Try ${quote} What changes now? Why today?`);
    assert.ok(two.notes.includes("2 questions"), JSON.stringify(two));
  }
});

test("[mentor-golden] pitch scoring detects the supported unquoted heading forms", () => {
  for (const heading of ["INT KITCHEN - NIGHT.", "I/E. TRAIN CAR - NIGHT.", "INT./EXT. TRAIN CAR - NIGHT."]) {
    assert.ok(scorePitchConcreteness(`Picture this: ${heading} Mara wants a key but John blocks her. What changes?`).notes.includes("writes sluglines instead of pitching"), heading);
  }
  assert.equal(scorePitchConcreteness('You wrote "INT. KITCHEN - NIGHT." Mara wants a key but John blocks her. What changes?').notes.includes("writes sluglines instead of pitching"), false);
});

test("[mentor-golden] a quoted line rewrite cannot excuse replacing the writer's idea", () => {
  const base = 'Keep Ada and the lighthouse. Ada pockets the key. Instead of saying afraid, try: "Leave the light on."';
  const spec = {writerNouns: ["Ada", "lighthouse"]};
  const good = scoreBuildOnWriter(base, spec);
  assert.ok(good.score >= 4);
  for (const replacement of [" Scrap the lighthouse and use a morgue.", " Instead, let's try a city morgue."]) {
    assert.ok(scoreBuildOnWriter(base + replacement, spec).score <= good.score - 3);
  }
});
