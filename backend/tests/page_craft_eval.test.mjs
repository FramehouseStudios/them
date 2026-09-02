import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  DIMENSIONS,
  THRESHOLDS,
  scorePageHeuristic,
  scorePage,
  llmJudgeEnabled,
} from "../evals/page_craft/score_page.js";
import {
  loadFixtures,
  evaluateAgainstLabel,
  FIXTURES_DIR,
} from "../evals/page_craft/run_page_craft_eval.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(root, "../evals/page_craft/fixtures");

test("[page-craft] loads 12+ fixtures with pass/fail mix", () => {
  const fixtures = loadFixtures(fixturesDir);
  assert.ok(fixtures.length >= 12, `expected >=12, got ${fixtures.length}`);
  const pass = fixtures.filter((f) => f.label === "pass");
  const fail = fixtures.filter((f) => f.label === "fail");
  assert.ok(pass.length >= 5, `pass fixtures ${pass.length}`);
  assert.ok(fail.length >= 5, `fail fixtures ${fail.length}`);
  for (const fx of fixtures) {
    assert.equal(typeof fx.id, "string");
    assert.equal(typeof fx.text, "string");
    assert.ok(fx.text.trim().length > 0);
  }
});

test("[page-craft] heuristic scorer returns all rubric dimensions 1-5", () => {
  const sample = fs.readFileSync(
    path.join(fixturesDir, "pass_distinct_voice_01.json"),
    "utf8",
  );
  const fixture = JSON.parse(sample);
  const scored = scorePageHeuristic(fixture.text, { fixture });
  assert.equal(scored.mode, "heuristic");
  for (const dim of DIMENSIONS) {
    assert.ok(dim in scored.dimensions, `missing ${dim}`);
    assert.ok(scored.dimensions[dim] >= 1 && scored.dimensions[dim] <= 5);
  }
  assert.ok(scored.overall >= 1 && scored.overall <= 5);
  assert.ok(scored.detectors?.counts);
});

test("[page-craft] pass fixtures meet floor; fail fixtures meet ceiling", () => {
  const fixtures = loadFixtures(fixturesDir);
  for (const fixture of fixtures) {
    const scored = scorePageHeuristic(fixture.text, { fixture });
    const gate = evaluateAgainstLabel(fixture, scored.overall);
    assert.equal(
      gate.ok,
      true,
      `${fixture.id}: overall=${scored.overall} detail=${gate.detail}`,
    );
  }
});

test("[page-craft] on-the-nose fail scores low subtext; voice-clash scores low voice", () => {
  const onNose = JSON.parse(
    fs.readFileSync(path.join(fixturesDir, "fail_on_the_nose_01.json"), "utf8"),
  );
  const clash = JSON.parse(
    fs.readFileSync(path.join(fixturesDir, "fail_voice_clash_01.json"), "utf8"),
  );
  const a = scorePageHeuristic(onNose.text, { fixture: onNose });
  const b = scorePageHeuristic(clash.text, { fixture: clash });
  assert.ok(a.dimensions.subtext_density <= 2.5, `subtext=${a.dimensions.subtext_density}`);
  assert.ok(b.dimensions.distinct_character_voice <= 2.0, `voice=${b.dimensions.distinct_character_voice}`);
  assert.ok(a.overall <= THRESHOLDS.failMaxOverall);
  assert.ok(b.overall <= THRESHOLDS.failMaxOverall);
});

test("[page-craft] LLM judge fail-closed without key / flag", async () => {
  const prevFlag = process.env.PAGE_CRAFT_LLM_JUDGE;
  const prevKey = process.env.OPENAI_API_KEY;
  delete process.env.PAGE_CRAFT_LLM_JUDGE;
  delete process.env.OPENAI_API_KEY;
  try {
    const status = llmJudgeEnabled();
    assert.equal(status.enabled, false);
    const scored = await scorePage("INT. ROOM - DAY\n\nA door closes.\n", { mode: "heuristic" });
    assert.equal(scored.mode, "heuristic");
    assert.equal(scored.llm?.skipped, true);
  } finally {
    if (prevFlag === undefined) delete process.env.PAGE_CRAFT_LLM_JUDGE;
    else process.env.PAGE_CRAFT_LLM_JUDGE = prevFlag;
    if (prevKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = prevKey;
  }
});

test("[page-craft] FIXTURES_DIR resolves under evals/page_craft", () => {
  assert.ok(FIXTURES_DIR.includes(`${path.sep}page_craft${path.sep}fixtures`));
  assert.equal(fs.existsSync(FIXTURES_DIR), true);
});
