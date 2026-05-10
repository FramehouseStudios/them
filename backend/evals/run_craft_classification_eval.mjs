#!/usr/bin/env node
//
// Eval skeleton for craft beat classification — to be extended in T21.
//
// T18 ships this skeleton so the eval slot exists and is wired into
// the gate later, but the actual LLM-driven classification + scoring
// is T21's job. For now the eval verifies that the deterministic stub
// in craft_analysis.js produces a schema-valid Report for both
// built-in frameworks. T21 will replace the stub with a real
// classifier and add accuracy assertions against a labeled fixture.

import process from "node:process";

import { analyzeScreenplay } from "../lib/craft_analysis.js";
import { REPORT_SCHEMA, validateAgainstSchema } from "../lib/craft_schemas.js";

function check({ frameworkId, pageCount, title }) {
  const report = analyzeScreenplay({
    frameworkId,
    projectId: `eval-${frameworkId}`,
    versionId: "v1",
    screenplay: { pageCount, title },
  });
  const v = validateAgainstSchema(report, REPORT_SCHEMA);
  if (!v.valid) {
    return { ok: false, frameworkId, errors: v.errors };
  }
  if (!report.coverage.complete) {
    return { ok: false, frameworkId, errors: ["coverage.complete should be true for stub analysis"] };
  }
  if (!Array.isArray(report.majorTurns) || report.majorTurns.length === 0) {
    return { ok: false, frameworkId, errors: ["majorTurns must be non-empty"] };
  }
  return { ok: true, frameworkId, majorTurnCount: report.majorTurns.length };
}

const cases = [
  { frameworkId: "save-the-cat", pageCount: 110, title: "Smoke STC" },
  { frameworkId: "three-act",    pageCount: 110, title: "Smoke 3A"  },
];

let allOK = true;
for (const c of cases) {
  const r = check(c);
  if (r.ok) {
    console.log(`PASS  ${r.frameworkId}  majorTurns=${r.majorTurnCount}`);
  } else {
    allOK = false;
    console.error(`FAIL  ${r.frameworkId}`);
    for (const e of r.errors) console.error(`  ${e}`);
  }
}

if (!allOK) process.exit(1);
console.log("craft classification eval skeleton: OK");
