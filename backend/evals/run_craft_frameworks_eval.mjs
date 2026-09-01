#!/usr/bin/env node
//
// T-craft-frameworks-eval — regression eval that runs the canonical
// screenplay analyzer against every shipped craft framework and
// asserts the shape of the report.
//
// The four frameworks (Save the Cat, Three-Act, Story Circle, Hero's
// Journey) each declare their own required major-turn IDs and beat
// counts. A single analyzer change can quietly break one framework
// while another stays green; iOS Studio surfaces would catch it
// first. This eval catches it at the backend.
//
// What's checked per framework:
//   - report.coverage is honestly incomplete/unavailable when the offline
//     classifier has no semantic evidence
//   - report.majorTurns.length matches the framework's
//     requiredMajorTurnIds length
//   - every majorTurn carries id + turnId + label + status + detected
//   - report.framework.id / report.projectId / report.versionId echo
//     the request
//   - report.id is well-formed (`report_<proj>_<ver>_<base36>`)
//
// Exits non-zero on first failure. Designed to be runnable from
// `npm run eval:craft-frameworks` and bundleable into `eval:gate`
// as a follow-up.
//
// Determinism: this eval is deterministic — it reads only frozen
// canon constants / pure functions and asserts the same output
// shape on every run. Same input always produces the same output
// set; no clocks, no random ids, no network.
//

import { analyzeScreenplay } from "../lib/craft_analysis.js";
import { listFrameworkReferences, getFrameworkById } from "../lib/craft_frameworks.js";

let failures = 0;
const FIXTURE_PAGE_COUNT = 110;

function check(label, cond, detail = "") {
  if (cond) {
    console.log(`  ok    ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${label}${detail ? "  — " + detail : ""}`);
  }
}

async function analyzeFor(frameworkId, projectId) {
  return analyzeScreenplay({
    screenplay: { pageCount: FIXTURE_PAGE_COUNT, title: "Eval Fixture" },
    frameworkId,
    projectId,
    versionId: "v-eval-1",
  });
}

console.log("[craft-frameworks-eval] starting");
const refs = listFrameworkReferences();
console.log(`  loaded ${refs.length} framework reference(s): ${refs.map((r) => r.id).join(", ")}`);

for (const ref of refs) {
  console.log(`\n[framework] ${ref.id}`);
  const framework = getFrameworkById(ref.id);
  check(
    `framework definition resolves for id=${ref.id}`,
    framework && framework.id === ref.id && Array.isArray(framework.requiredMajorTurnIds),
    `got: ${framework ? JSON.stringify(framework.id) : "null"}`,
  );

  const projectId = `eval-${ref.id.replace(/[^a-z0-9-]/gi, "")}`;
  let report;
  try {
    report = await analyzeFor(ref.id, projectId);
  } catch (e) {
    check(`analyzeScreenplay(${ref.id}) does not throw`, false, e?.message || "threw");
    continue;
  }

  check(
    `report.framework.id echoes the request (${ref.id})`,
    report && report.framework && report.framework.id === ref.id,
  );
  check(
    `report.projectId echoes the request (${projectId})`,
    report && report.projectId === projectId,
  );
  check(
    `report.versionId echoes the request`,
    report && report.versionId === "v-eval-1",
  );
  check(
    `report.id well-formed`,
    typeof report.id === "string" && report.id.startsWith(`report_${projectId}_v-eval-1_`),
    report?.id,
  );
  check(
    `report.coverage.complete is a boolean`,
    typeof report?.coverage?.complete === "boolean",
  );
  check(
    `evidence-free report is incomplete with zero detected turns`,
    report?.coverage?.complete === false && report?.coverage?.detectedMajorTurnCount === 0,
  );
  check(
    `report.majorTurns.length matches requiredMajorTurnIds.length (${framework.requiredMajorTurnIds.length})`,
    Array.isArray(report.majorTurns) && report.majorTurns.length === framework.requiredMajorTurnIds.length,
    `got ${report?.majorTurns?.length}`,
  );
  // Every required turnId from the framework must appear in the report.
  const turnIdsInReport = new Set((report.majorTurns || []).map((t) => t.turnId));
  for (const required of framework.requiredMajorTurnIds) {
    check(
      `majorTurn covers required turnId="${required}"`,
      turnIdsInReport.has(required),
    );
  }
  for (const turn of report.majorTurns || []) {
    check(
      `majorTurn has id+turnId+label+status+detected (turnId=${turn.turnId})`,
      typeof turn.id === "string"
        && typeof turn.turnId === "string"
        && typeof turn.label === "string"
        && typeof turn.status === "string"
        && typeof turn.detected === "boolean",
    );
    check(
      `evidence-free majorTurn is unavailable without an actual page (turnId=${turn.turnId})`,
      turn.status === "unavailable" && turn.detected === false && !("actualPage" in turn),
    );
  }
}

console.log("");
if (failures === 0) {
  console.log("[craft-frameworks-eval] PASS");
  process.exit(0);
} else {
  console.log(`[craft-frameworks-eval] FAIL — ${failures} failure(s)`);
  process.exit(1);
}
