#!/usr/bin/env node
//
// T21: craft beat classification eval.
//
// Runs in two modes:
//   - Deterministic mode (default): exercises the stub classifier and
//     asserts schema-valid Reports for both built-in frameworks.
//   - LLM mode (when OPENAI_API_KEY is set): also exercises the LLM
//     classifier on a labeled per-scene fixture and reports an
//     accuracy summary. The eval does NOT block the gate on accuracy
//     yet — that comes once the labeled fixture matures.
//
// Pass `--mode=deterministic` to force deterministic mode even when a
// key is present (useful for fast local iteration).

import process from "node:process";

import {
  analyzeScreenplay,
} from "../lib/craft_analysis.js";
import { REPORT_SCHEMA, validateAgainstSchema } from "../lib/craft_schemas.js";
import {
  createDeterministicClassifier,
  createLLMClassifier,
} from "../lib/craft_classifier.js";
import { buildClassificationPromptBlock } from "../lib/craft_prompts.js";

const args = new Set(process.argv.slice(2));
const FORCE_DETERMINISTIC = args.has("--mode=deterministic");
const HAS_LLM_KEY = !!process.env.OPENAI_API_KEY && !FORCE_DETERMINISTIC;

let allOK = true;
function pass(label, detail = "") {
  console.log(`PASS  ${label}${detail ? `  ${detail}` : ""}`);
}
function fail(label, detail = "") {
  allOK = false;
  console.error(`FAIL  ${label}${detail ? `\n  ${detail}` : ""}`);
}

// ---------- Phase 1: deterministic schema-shape eval ----------

async function checkDeterministic({ frameworkId, pageCount, title }) {
  const report = await analyzeScreenplay({
    frameworkId,
    projectId: `eval-${frameworkId}`,
    versionId: "v1",
    screenplay: { pageCount, title },
  });
  const v = validateAgainstSchema(report, REPORT_SCHEMA);
  if (!v.valid) return fail(`deterministic ${frameworkId}: schema invalid`, v.errors.join("; "));
  if (report.coverage.complete) return fail(`deterministic ${frameworkId}: evidence-free coverage must not be complete`);
  if (report.coverage.detectedMajorTurnCount !== 0) {
    return fail(`deterministic ${frameworkId}: evidence-free detected count must be zero`);
  }
  if (!report.majorTurns.every((turn) => turn.status === "unavailable" && turn.detected === false)) {
    return fail(`deterministic ${frameworkId}: every unresolved turn must be unavailable`);
  }
  if (!Array.isArray(report.majorTurns) || !report.majorTurns.length) {
    return fail(`deterministic ${frameworkId}: majorTurns empty`);
  }
  pass(`deterministic ${frameworkId}`, `majorTurns=${report.majorTurns.length}`);
}

for (const c of [
  { frameworkId: "save-the-cat", pageCount: 110, title: "Smoke STC" },
  { frameworkId: "three-act",    pageCount: 110, title: "Smoke 3A"  },
]) await checkDeterministic(c);

// ---------- Phase 2: classifier interface contract ----------

const detClassifier = createDeterministicClassifier();
const detOut = await detClassifier.classifyScreenplay({
  framework: "save-the-cat",
  screenplay: { pageCount: 110, title: "Smoke STC" },
});
if (detOut.source !== "deterministic-stub") {
  fail("deterministic classifier source tag", `got ${detOut.source}`);
} else {
  pass("deterministic classifier source = deterministic-stub");
}

// ---------- Phase 3: prompt-block format ----------

const block = buildClassificationPromptBlock({
  framework: "save-the-cat",
  scene: { title: "INT. KITCHEN - NIGHT", text: "JUNE\nSomething is wrong with the house." },
});
if (!block.includes("save-the-cat")) {
  // The prompt names the framework by title, not id.
}
if (!block.includes("Save the Cat!")) fail("prompt block missing framework title");
else if (!block.includes('"beatId"')) fail("prompt block missing JSON contract");
else if (!block.includes("INT. KITCHEN - NIGHT")) fail("prompt block missing scene title");
else pass("classification prompt block well-formed");

// ---------- Phase 4: LLM mode (if key present) ----------

const LABELED_SCENES = [
  // Three-act fixtures with intended beat ids.
  {
    framework: "three-act",
    expectedBeatId: "inciting-incident",
    scene: { title: "INT. APARTMENT - MORNING", text: "She finds the eviction letter." },
  },
  {
    framework: "three-act",
    expectedBeatId: "midpoint-twist",
    scene: { title: "EXT. ROOFTOP - NIGHT", text: "He realizes the friend was the antagonist." },
  },
  {
    framework: "save-the-cat",
    expectedBeatId: "all-is-lost",
    scene: { title: "INT. CAR - DUSK", text: "The plan failed; she is alone, watching the rain." },
  },
];

if (!HAS_LLM_KEY) {
  console.log("INFO  LLM mode skipped (no OPENAI_API_KEY or --mode=deterministic).");
} else {
  const classifier = createLLMClassifier();
  let correct = 0;
  for (const { framework, expectedBeatId, scene } of LABELED_SCENES) {
    try {
      const r = await classifier.classifyScene({ framework, scene });
      if (r.beatId === expectedBeatId) {
        correct += 1;
        pass(`LLM ${framework} ${expectedBeatId}`, `confidence=${r.confidence?.toFixed(2)}`);
      } else {
        // Mismatch is informational — accuracy gating is future work.
        console.log(
          `INFO  LLM ${framework} expected=${expectedBeatId} got=${r.beatId} confidence=${r.confidence?.toFixed(2)}`,
        );
      }
    } catch (e) {
      fail(`LLM call ${framework}`, e?.message || String(e));
    }
  }
  console.log(`SUMMARY  LLM accuracy: ${correct}/${LABELED_SCENES.length}`);
  // Don't fail the gate on accuracy yet — fixture is small. Once the
  // labeled set matures, change this to require >= some threshold.
}

if (!allOK) {
  console.error("craft classification eval: FAILED");
  process.exit(1);
}
console.log("craft classification eval: OK");
