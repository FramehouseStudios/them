#!/usr/bin/env node
//
// Page craft eval v1 (F1) — load golden fixtures, score, write JSON summary.
// CI path: heuristic-only (no live LLM required).
//
// Thresholds (see RUBRIC.md):
//   PASS fixtures must score overall >= 3.5
//   FAIL fixtures must score overall <= 2.8
// Exit non-zero if any threshold is violated or fixtures are missing.
//

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  DIMENSIONS,
  THRESHOLDS,
  scorePage,
  scorePageHeuristic,
  llmJudgeEnabled,
} from "./score_page.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, "fixtures");
const DEFAULT_OUT = path.join(__dirname, "last_page_craft_summary.json");

function parseArgs(argv) {
  const out = {
    outPath: DEFAULT_OUT,
    mode: "heuristic",
    fixturesDir: FIXTURES_DIR,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--out" && argv[i + 1]) {
      out.outPath = path.resolve(argv[++i]);
    } else if (a.startsWith("--out=")) {
      out.outPath = path.resolve(a.slice("--out=".length));
    } else if (a === "--mode" && argv[i + 1]) {
      out.mode = String(argv[++i]).trim();
    } else if (a.startsWith("--mode=")) {
      out.mode = String(a.slice("--mode=".length)).trim();
    } else if (a === "--fixtures" && argv[i + 1]) {
      out.fixturesDir = path.resolve(argv[++i]);
    }
  }
  return out;
}

function loadFixtures(dir) {
  if (!fs.existsSync(dir)) {
    throw new Error(`fixtures dir missing: ${dir}`);
  }
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  const fixtures = [];
  for (const file of files) {
    const full = path.join(dir, file);
    const raw = JSON.parse(fs.readFileSync(full, "utf8"));
    if (!raw.id || !raw.label || typeof raw.text !== "string") {
      throw new Error(`${file}: requires id, label, text`);
    }
    if (!["pass", "fail"].includes(raw.label)) {
      throw new Error(`${file}: label must be pass|fail`);
    }
    fixtures.push({ ...raw, _file: file });
  }
  return fixtures;
}

function evaluateAgainstLabel(fixture, overall) {
  if (fixture.label === "pass") {
    const ok = overall >= THRESHOLDS.passMinOverall;
    return {
      ok,
      detail: ok
        ? `pass overall ${overall} >= ${THRESHOLDS.passMinOverall}`
        : `PASS fixture scored too low: ${overall} < ${THRESHOLDS.passMinOverall}`,
    };
  }
  const ok = overall <= THRESHOLDS.failMaxOverall;
  return {
    ok,
    detail: ok
      ? `fail overall ${overall} <= ${THRESHOLDS.failMaxOverall}`
      : `FAIL fixture scored too high: ${overall} > ${THRESHOLDS.failMaxOverall}`,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const fixtures = loadFixtures(args.fixturesDir);
  const judge = llmJudgeEnabled();
  const useLlm = args.mode === "llm" || args.mode === "heuristic+llm";

  if (useLlm && (!judge.enabled || !judge.key)) {
    console.log("INFO  LLM mode requested but unavailable; staying heuristic (fail closed).");
  }

  const results = [];
  let failed = 0;

  for (const fixture of fixtures) {
    const scored = useLlm
      ? await scorePage(fixture.text, { fixture, mode: args.mode })
      : scorePageHeuristic(fixture.text, { fixture });
    const gate = evaluateAgainstLabel(fixture, scored.overall);
    if (!gate.ok) failed += 1;
    const row = {
      id: fixture.id,
      label: fixture.label,
      fail_modes: fixture.fail_modes || [],
      overall: scored.overall,
      dimensions: scored.dimensions,
      mode: scored.mode,
      gate_ok: gate.ok,
      gate_detail: gate.detail,
      notes: scored.notes || [],
    };
    results.push(row);
    const tag = gate.ok ? "PASS" : "FAIL";
    console.log(
      `${tag}  ${fixture.id}  label=${fixture.label}  overall=${scored.overall}  [${DIMENSIONS.map((d) => `${d}=${scored.dimensions[d]}`).join(", ")}]`,
    );
    if (!gate.ok) console.error(`  - ${gate.detail}`);
  }

  const passCount = fixtures.filter((f) => f.label === "pass").length;
  const failCount = fixtures.filter((f) => f.label === "fail").length;
  const summary = {
    version: 1,
    generated_at: new Date().toISOString(),
    mode: useLlm ? args.mode : "heuristic",
    thresholds: THRESHOLDS,
    fixture_count: fixtures.length,
    pass_fixtures: passCount,
    fail_fixtures: failCount,
    gate_failures: failed,
    llm_judge: {
      flag: judge.enabled,
      key_present: Boolean(judge.key),
      used: results.some((r) => r.mode === "llm" || r.mode === "heuristic+llm"),
    },
    results,
  };

  fs.writeFileSync(args.outPath, JSON.stringify(summary, null, 2) + "\n");
  console.log("");
  console.log(
    `page_craft_eval: fixtures=${fixtures.length} pass=${passCount} fail_label=${failCount} gate_failures=${failed}`,
  );
  console.log(`summary: ${args.outPath}`);
  console.log(
    `thresholds: PASS>=${THRESHOLDS.passMinOverall} FAIL<=${THRESHOLDS.failMaxOverall}`,
  );

  if (fixtures.length < 12) {
    console.error(`FAIL  expected >= 12 fixtures, got ${fixtures.length}`);
    process.exit(1);
  }
  if (passCount < 5 || failCount < 5) {
    console.error(`FAIL  expected >=5 pass and >=5 fail fixtures (pass=${passCount} fail=${failCount})`);
    process.exit(1);
  }
  process.exit(failed === 0 ? 0 : 1);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error(`page_craft_eval crashed: ${err?.stack || err}`);
    process.exit(1);
  });
}

export { loadFixtures, evaluateAgainstLabel, FIXTURES_DIR, THRESHOLDS };
