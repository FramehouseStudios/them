import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
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

test("[page-craft] heuristic scoring is deterministic without mutating fixtures", () => {
  for (const fixture of loadFixtures(fixturesDir)) {
    const before = structuredClone(fixture);
    const first = scorePageHeuristic(fixture.text, { fixture });
    const second = scorePageHeuristic(fixture.text, { fixture });
    assert.deepEqual(second, first, fixture.id);
    assert.deepEqual(fixture, before, `${fixture.id}: input must not change`);
  }
});

test("[page-craft] heuristic CLI summaries are repeatable except generated_at", (t) => {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "io-them-page-craft-")));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const summaries = [];
  for (const name of ["first", "second"]) {
    const out = path.join(tmp, `${name}.json`);
    const result = spawnSync(process.execPath, [
      path.join(root, "../evals/page_craft/run_page_craft_eval.mjs"),
      "--mode=heuristic",
      `--out=${out}`,
    ], {
      encoding: "utf8",
      env: { ...process.env, PAGE_CRAFT_LLM_JUDGE: "0", OPENAI_API_KEY: "" },
    });
    assert.equal(result.status, 0, result.stderr);
    const { generated_at, ...summary } = JSON.parse(fs.readFileSync(out, "utf8"));
    assert.ok(Number.isFinite(Date.parse(generated_at)));
    assert.equal(summary.llm_judge.used, false);
    assert.equal(summary.gate_failures, 0);
    assert.ok(summary.fixture_count >= 12);
    summaries.push(summary);
  }
  assert.deepEqual(summaries[1], summaries[0]);
});

test("[page-craft] eval exits nonzero when heuristic scores are not deterministic", (t) => {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "io-them-page-craft-")));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const runner = path.join(tmp, "run_page_craft_eval.mjs");
  fs.copyFileSync(path.join(root, "../evals/page_craft/run_page_craft_eval.mjs"), runner);
  fs.writeFileSync(path.join(tmp, "package.json"), JSON.stringify({ type: "module" }));
  fs.writeFileSync(path.join(tmp, "score_page.js"), `
export const DIMENSIONS = ["subtext_density"];
export const THRESHOLDS = { passMinOverall: 3.5, failMaxOverall: 2.8 };
export const llmJudgeEnabled = () => ({ enabled: false, key: "" });
let calls = 0;
export function scorePageHeuristic() {
  const score = ++calls % 2 ? 4 : 5;
  return { overall: score, dimensions: { subtext_density: score }, mode: "heuristic" };
}
export const scorePage = scorePageHeuristic;
`);
  fs.mkdirSync(path.join(tmp, "fixtures"));
  fs.writeFileSync(path.join(tmp, "fixtures", "sample.json"), JSON.stringify({
    id: "unstable", label: "pass", text: "INT. ROOM - DAY\n\nA door closes.",
  }));
  const result = spawnSync(process.execPath, [runner, "--mode=heuristic"], { encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /heuristic scoring must be deterministic for the same input/);
  assert.equal(fs.existsSync(path.join(tmp, "last_page_craft_summary.json")), false);
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
