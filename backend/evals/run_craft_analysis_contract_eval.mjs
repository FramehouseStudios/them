#!/usr/bin/env node

// Fresh craft-analysis contract gate.
//
// Unlike the legacy checked-in report fixtures, this eval generates every
// report through the production analyzer. Its classifier is deterministic and
// fixture-backed: semantic labels come from the fixture, while scene page
// coordinates are merely evidence metadata. Missing and drifted cases place an
// unrelated scene on the expected page so page coincidence cannot satisfy a
// required turn.

import process from "node:process";
import { readFile, writeFile } from "node:fs/promises";

import { analyzeScreenplay } from "../lib/craft_analysis.js";
import { getFrameworkById } from "../lib/craft_frameworks.js";
import { REPORT_SCHEMA, validateAgainstSchema } from "../lib/craft_schemas.js";

const FIXTURE_URL = new URL("../fixtures/craft/analysis_cases.json", import.meta.url);
const EXPECTED_FRAMEWORKS = [
  "save-the-cat",
  "three-act",
  "story-circle",
  "hero-journey",
];
const EXPECTED_STATES = ["complete", "missing", "drifted"];
const FIXED_GENERATED_AT = "2026-08-31T12:00:00.000Z";

let failures = 0;

function pass(label) {
  console.log(`PASS  ${label}`);
}

function fail(label, detail = "") {
  failures += 1;
  console.error(`FAIL  ${label}${detail ? `\n      ${detail}` : ""}`);
}

function check(label, condition, detail = "") {
  if (condition) pass(label);
  else fail(label, detail);
}

function requestedOutputPath(argv) {
  const prefix = "--write-complete-report=";
  const inline = argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = argv.indexOf("--write-complete-report");
  if (index >= 0) return argv[index + 1] || "";
  return null;
}

function pageIsInside(page, range) {
  return Number.isInteger(page)
    && Number.isInteger(range?.start)
    && Number.isInteger(range?.end)
    && page >= range.start
    && page <= range.end;
}

function evidenceSceneIds(turn) {
  return new Set((turn?.evidence || []).map((item) => item.sceneId).filter(Boolean));
}

function createFixtureClassifier(testCase) {
  const labelsBySceneId = new Map(
    testCase.scenes.map((scene) => [scene.id, scene.semanticBeatId]),
  );
  return {
    kind: "contract-fixture",
    async classifyScene({ scene }) {
      if (!labelsBySceneId.has(scene?.id)) {
        return {
          status: "unavailable",
          beatId: null,
          confidence: 0,
          rationale: "scene id was not present in the contract fixture",
          source: "contract-fixture",
        };
      }
      const beatId = labelsBySceneId.get(scene.id);
      return {
        status: "classified",
        beatId,
        confidence: beatId ? 0.99 : 0,
        rationale: beatId
          ? `fixture labels ${scene.id} as ${beatId}`
          : `fixture labels ${scene.id} as structurally unrelated`,
        source: "contract-fixture",
      };
    },
  };
}

function assertFixtureDesign(testCase) {
  const framework = getFrameworkById(testCase.frameworkId);
  check(`${testCase.id}: framework exists`, Boolean(framework));
  if (!framework) return;

  const required = new Set(framework.requiredMajorTurnIds);
  const semanticIds = new Set(
    testCase.scenes.map((scene) => scene.semanticBeatId).filter(Boolean),
  );
  const missingIds = new Set(testCase.expected.missingTurnIds || []);

  for (const turnId of required) {
    const shouldBeLabeled = !missingIds.has(turnId);
    check(
      `${testCase.id}: semantic label ${shouldBeLabeled ? "covers" : "omits"} ${turnId}`,
      semanticIds.has(turnId) === shouldBeLabeled,
    );
  }

  if (testCase.state === "missing") {
    const turnId = testCase.expected.missingTurnIds?.[0];
    const turnDef = framework.beats.find((beat) => beat.majorTurnId === turnId);
    const coincidence = testCase.scenes.find(
      (scene) => scene.id === testCase.expected.coincidenceSceneId,
    );
    check(
      `${testCase.id}: unrelated scene coincides with missing turn page`,
      coincidence?.semanticBeatId === null
        && pageIsInside(coincidence.pageStart, turnDef?.expectedPageRange),
    );
  }

  if (testCase.state === "drifted") {
    const drift = testCase.expected.drift;
    const turnDef = framework.beats.find((beat) => beat.majorTurnId === drift.turnId);
    const semanticScene = testCase.scenes.find((scene) => scene.id === drift.sceneId);
    const coincidence = testCase.scenes.find(
      (scene) => scene.id === drift.coincidenceSceneId,
    );
    check(
      `${testCase.id}: semantic evidence is outside expected page range`,
      semanticScene?.semanticBeatId === drift.turnId
        && !pageIsInside(semanticScene.pageStart, turnDef?.expectedPageRange),
    );
    check(
      `${testCase.id}: unrelated scene occupies expected page range`,
      coincidence?.semanticBeatId === null
        && pageIsInside(coincidence.pageStart, turnDef?.expectedPageRange),
    );
  }
}

async function generateReport(testCase, overrides = []) {
  return analyzeScreenplay({
    screenplay: {
      pageCount: 110,
      title: `Craft contract: ${testCase.id}`,
      scenes: testCase.scenes.map((scene) => ({
        id: scene.id,
        title: scene.title,
        pageStart: scene.pageStart,
        pageEnd: scene.pageEnd,
        text: scene.text,
      })),
    },
    frameworkId: testCase.frameworkId,
    projectId: `craft-contract-${testCase.frameworkId}`,
    versionId: "v-contract-1",
    generatedAt: FIXED_GENERATED_AT,
    classifier: createFixtureClassifier(testCase),
    overrides,
  });
}

function assertSchemaValid(testCase, report, suffix = "") {
  const validation = validateAgainstSchema(report, REPORT_SCHEMA);
  check(
    `${testCase.id}${suffix}: generated report validates against REPORT_SCHEMA`,
    validation.valid,
    validation.errors?.join("; ") || "",
  );
}

function assertSemanticEvidence(testCase, report) {
  const sceneById = new Map(testCase.scenes.map((scene) => [scene.id, scene]));
  for (const turn of report.majorTurns || []) {
    if (!turn.detected) continue;
    check(
      `${testCase.id}: detected ${turn.turnId} has evidence`,
      Array.isArray(turn.evidence) && turn.evidence.length > 0,
    );
    for (const evidence of turn.evidence || []) {
      const sourceScene = sceneById.get(evidence.sceneId);
      check(
        `${testCase.id}: ${turn.turnId} evidence is semantically labeled`,
        sourceScene?.semanticBeatId === turn.turnId,
        `scene=${evidence.sceneId || "<none>"} semanticBeatId=${sourceScene?.semanticBeatId ?? "null"}`,
      );
    }
  }
}

function assertReportContract(testCase, report) {
  const expected = testCase.expected;
  const turns = new Map((report.majorTurns || []).map((turn) => [turn.turnId, turn]));
  const framework = getFrameworkById(testCase.frameworkId);

  check(
    `${testCase.id}: framework/project/version echo request`,
    report?.framework?.id === testCase.frameworkId
      && report?.projectId === `craft-contract-${testCase.frameworkId}`
      && report?.versionId === "v-contract-1",
  );
  check(
    `${testCase.id}: all required turns emitted`,
    turns.size === framework.requiredMajorTurnIds.length
      && framework.requiredMajorTurnIds.every((turnId) => turns.has(turnId)),
  );
  check(
    `${testCase.id}: coverage.complete=${expected.complete}`,
    report?.coverage?.complete === expected.complete,
    `got ${report?.coverage?.complete}`,
  );
  check(
    `${testCase.id}: detected count=${expected.detectedCount}`,
    report?.coverage?.detectedMajorTurnCount === expected.detectedCount,
    `got ${report?.coverage?.detectedMajorTurnCount}`,
  );
  check(
    `${testCase.id}: missing count=${expected.missingTurnIds.length}`,
    report?.coverage?.missingMajorTurnCount === expected.missingTurnIds.length,
    `got ${report?.coverage?.missingMajorTurnCount}`,
  );

  for (const turnId of expected.missingTurnIds) {
    const turn = turns.get(turnId);
    const timelineTurn = report?.drift?.timeline?.find((item) => item.turnId === turnId);
    check(
      `${testCase.id}: ${turnId} is truthfully missing`,
      turn?.status === "missing"
        && turn?.detected === false
        && (turn?.evidence || []).length === 0
        && turn?.actualPage === undefined
        && turn?.driftPages === undefined,
    );
    check(
      `${testCase.id}: expected-page coincidence does not prove ${turnId}`,
      !evidenceSceneIds(turn).has(expected.coincidenceSceneId),
    );
    check(
      `${testCase.id}: drift timeline preserves missing semantics`,
      timelineTurn?.status === "missing"
        && report?.drift?.status === "incomplete"
        && /missing/i.test(report?.drift?.summary || "")
        && !/analysis unavailable/i.test(report?.drift?.summary || ""),
      `timeline=${timelineTurn?.status} aggregate=${report?.drift?.status} summary=${report?.drift?.summary}`,
    );
  }

  if (expected.drift) {
    const turn = turns.get(expected.drift.turnId);
    const ids = evidenceSceneIds(turn);
    check(
      `${testCase.id}: drift follows semantic scene, not expected-page coincidence`,
      turn?.detected === true
        && turn?.actualPage === testCase.scenes.find((scene) => scene.id === expected.drift.sceneId)?.pageStart
        && turn?.driftPages === expected.drift.pages
        && ids.has(expected.drift.sceneId)
        && !ids.has(expected.drift.coincidenceSceneId),
      `actualPage=${turn?.actualPage} driftPages=${turn?.driftPages}`,
    );
    check(
      `${testCase.id}: aggregate drift is not on-target`,
      report?.drift?.status === "drifted",
      `got ${report?.drift?.status}`,
    );
  } else if (testCase.state === "complete") {
    check(
      `${testCase.id}: fully timed semantic evidence is on-target`,
      report?.drift?.status === "on-target",
      `got ${report?.drift?.status}`,
    );
  }

  assertSemanticEvidence(testCase, report);
}

function scopedOverrideFor(testCase) {
  const turnId = testCase.expected.missingTurnIds[0];
  return {
    id: `ov-contract-${testCase.frameworkId}`,
    projectId: `craft-contract-${testCase.frameworkId}`,
    versionId: "v-contract-1",
    frameworkId: testCase.frameworkId,
    turnId,
    action: "mark-present",
    reason: "Writer confirmed this structural turn.",
    userId: "craft-contract-user",
    createdAt: FIXED_GENERATED_AT,
  };
}

async function main() {
  const fixture = JSON.parse(await readFile(FIXTURE_URL, "utf8"));
  const cases = fixture.cases || [];

  check("fixture schemaVersion=1", fixture.schemaVersion === 1);
  check("fixture contains exactly 12 cases", cases.length === 12, `got ${cases.length}`);
  check("fixture case ids are unique", new Set(cases.map((item) => item.id)).size === cases.length);
  for (const frameworkId of EXPECTED_FRAMEWORKS) {
    for (const state of EXPECTED_STATES) {
      check(
        `fixture has one ${frameworkId}/${state} case`,
        cases.filter((item) => item.frameworkId === frameworkId && item.state === state).length === 1,
      );
    }
  }

  let completeReport = null;
  for (const testCase of cases) {
    assertFixtureDesign(testCase);
    let report;
    try {
      report = await generateReport(testCase);
    } catch (error) {
      fail(`${testCase.id}: analyzer does not throw`, error?.stack || String(error));
      continue;
    }
    assertSchemaValid(testCase, report);
    assertReportContract(testCase, report);
    if (!completeReport && testCase.state === "complete") completeReport = report;

    if (testCase.state === "missing") {
      const override = scopedOverrideFor(testCase);
      let overriddenReport;
      try {
        overriddenReport = await generateReport(testCase, [override]);
      } catch (error) {
        fail(`${testCase.id}: scoped override analysis does not throw`, error?.stack || String(error));
        continue;
      }
      assertSchemaValid(testCase, overriddenReport, " + override");
      const turn = overriddenReport.majorTurns?.find((item) => item.turnId === override.turnId);
      const timelineTurn = overriddenReport.drift?.timeline?.find((item) => item.turnId === override.turnId);
      check(
        `${testCase.id}: scoped mark-present override completes coverage without forging detection`,
        overriddenReport.coverage?.complete === true
          && overriddenReport.coverage?.detectedMajorTurnCount === testCase.expected.detectedCount
          && overriddenReport.coverage?.overriddenMajorTurnCount === 1
          && overriddenReport.coverage?.missingMajorTurnCount === 0
          && turn?.detected === false
          && turn?.override?.id === override.id,
      );
      check(
        `${testCase.id}: untimed override remains writer-confirmed, not missing or unavailable`,
        timelineTurn?.status === "overridden"
          && overriddenReport.drift?.status === "partial"
          && /writer-confirmed/i.test(overriddenReport.drift?.summary || "")
          && !/missing/i.test(overriddenReport.drift?.summary || "")
          && !/analysis unavailable/i.test(overriddenReport.drift?.summary || ""),
        `timeline=${timelineTurn?.status} aggregate=${overriddenReport.drift?.status} summary=${overriddenReport.drift?.summary}`,
      );
    }
  }

  const outputPath = requestedOutputPath(process.argv.slice(2));
  if (outputPath !== null) {
    if (!outputPath) {
      fail("--write-complete-report requires a path");
    } else if (!completeReport) {
      fail("no complete report was generated to write");
    } else {
      await writeFile(outputPath, `${JSON.stringify(completeReport, null, 2)}\n`, "utf8");
      pass(`wrote fresh complete report to ${outputPath}`);
    }
  }

  if (failures > 0) {
    console.error(`\ncraft analysis contract eval: FAILED (${failures} failure(s))`);
    process.exitCode = 1;
    return;
  }
  console.log("\ncraft analysis contract eval: OK");
}

await main();
