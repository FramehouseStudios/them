#!/usr/bin/env node
//
// T23: craft completeness RC release gate.
//
// Reads a craft report (from a file path OR the persistence adapter
// when DATABASE_URL is set) and exits 0 iff `coverage.complete === true`
// (including overrides). Exits 1 with actionable diagnostics otherwise.
//
// Usage:
//   node scripts/check_craft_completeness.mjs --file <path>
//   node scripts/check_craft_completeness.mjs --project <id> --version <id>
//
// In release-preflight CI, the gate runs automatically against a
// fixture report; when DATABASE_URL is set, it can also check a real
// stored report by project/version.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { createPersistence } from "../backend/lib/persistence_adapter.js";
import { getFrameworkById } from "../backend/lib/craft_frameworks.js";
import { REPORT_SCHEMA, validateAgainstSchema } from "../backend/lib/craft_schemas.js";

const REPORT_LIST_PAGE_SIZE = 1000;

function parseArgs(argv) {
  const out = { file: null, project: null, version: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--file" && argv[i + 1]) { out.file = argv[++i]; continue; }
    if (arg === "--project" && argv[i + 1]) { out.project = argv[++i]; continue; }
    if (arg === "--version" && argv[i + 1]) { out.version = argv[++i]; continue; }
  }
  return out;
}

function reportFromFile(filePath) {
  const abs = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(abs)) {
    throw new Error(`fixture not found: ${abs}`);
  }
  const text = fs.readFileSync(abs, "utf8");
  return JSON.parse(text);
}

async function reportFromAdapter({ project, version }) {
  if (!process.env.DATABASE_URL && !process.env.PERSISTENCE_JSON_ROOT) {
    throw new Error("--project requires DATABASE_URL or PERSISTENCE_JSON_ROOT");
  }
  const persistence = createPersistence();
  const expectedProject = String(project || "").trim();
  const expectedVersion = String(version || "").trim();
  try {
    // Preserve the direct lookup for legacy/non-owner-scoped report keys.
    const direct = await persistence.get({
      domain: "craft_reports",
      key: `${expectedProject}:${expectedVersion}`,
    });
    if (direct) return direct;

    // Authenticated routes key reports by an opaque owner namespace. The
    // public project id remains in the report payload, so use the adapter's
    // supported paginated list operation instead of decoding internal keys.
    const matches = [];
    let afterKey = "";
    while (true) {
      const page = await persistence.list({
        domain: "craft_reports",
        afterKey,
        limit: REPORT_LIST_PAGE_SIZE,
      });
      for (const row of page) {
        const report = row?.value;
        if (
          report?.projectId === expectedProject
          && String(report?.versionId || "") === expectedVersion
        ) matches.push(report);
      }
      if (page.length < REPORT_LIST_PAGE_SIZE) break;
      afterKey = page[page.length - 1]?.key || "";
      if (!afterKey) break;
    }
    if (matches.length > 1) {
      throw new Error(
        `multiple craft reports found for project="${expectedProject}" version="${expectedVersion}"`,
      );
    }
    if (matches.length === 1) return matches[0];
  } finally {
    if (typeof persistence.close === "function") await persistence.close();
  }
  throw new Error(`craft report not found for project="${expectedProject}" version="${expectedVersion}"`);
}

function diagnoseIncomplete(report) {
  const lines = [];
  const cov = report?.coverage || {};
  lines.push(`coverage: complete=${cov.complete} required=${cov.requiredMajorTurnCount} detected=${cov.detectedMajorTurnCount} overridden=${cov.overriddenMajorTurnCount} missing=${cov.missingMajorTurnCount} unavailable=${cov.unavailableMajorTurnCount || 0}`);
  if (Array.isArray(report?.majorTurns)) {
    const missing = report.majorTurns.filter((t) => t && t.required && t.status === "missing");
    if (missing.length) {
      lines.push("Missing required major turns:");
      for (const t of missing) {
        const at = t.expectedPage
          ? `p${t.expectedPage}`
          : (t.expectedPageRange ? `p${t.expectedPageRange.start}-${t.expectedPageRange.end}` : "?");
        lines.push(`  - ${t.turnId} (${t.label}) expected @ ${at}`);
      }
      lines.push("");
      lines.push("Resolve by either landing the missing beat in the screenplay or recording an explicit override via POST /craft/overrides.");
    }
    const unavailable = report.majorTurns.filter((t) => t && t.required && t.status === "unavailable");
    if (unavailable.length) {
      lines.push("Analysis unavailable for required major turns:");
      for (const t of unavailable) lines.push(`  - ${t.turnId} (${t.label})`);
      lines.push("Run semantic scene classification before treating these turns as missing or complete.");
    }
  }
  if (report?.drift?.status && report.drift.status !== "on-target" && report.drift.status !== "on-target-with-overrides") {
    lines.push(`drift: ${report.drift.status}`);
    if (Array.isArray(report?.drift?.timeline)) {
      const drifts = report.drift.timeline.filter((t) => t && (t.status === "late" || t.status === "early"));
      for (const t of drifts.slice(0, 5)) {
        lines.push(`  - ${t.turnId} (${t.label}) ${t.status} by ${t.driftPages || 0} pages`);
      }
    }
  }
  return lines.join("\n");
}

function validateCompletenessIntegrity(report) {
  const errors = [];
  const schema = validateAgainstSchema(report, REPORT_SCHEMA);
  if (!schema.valid) errors.push(...schema.errors);
  if (!report || typeof report !== "object") return errors;

  const framework = getFrameworkById(report.framework?.id);
  if (!framework) errors.push(`unknown framework: ${report.framework?.id || "<missing>"}`);
  const turns = Array.isArray(report.majorTurns) ? report.majorTurns.filter((turn) => turn?.required) : [];
  const requiredIds = new Set(framework?.requiredMajorTurnIds || []);
  const emittedIds = new Set(turns.map((turn) => turn.turnId));
  if (requiredIds.size !== emittedIds.size || [...requiredIds].some((id) => !emittedIds.has(id))) {
    errors.push("required major turns do not exactly match the selected framework");
  }

  const detected = turns.filter((turn) => turn.detected === true);
  const overridden = turns.filter((turn) => turn.detected === false && turn.status === "manually_present");
  const missing = turns.filter((turn) => turn.detected === false && turn.status === "missing");
  const unavailable = turns.filter((turn) => turn.detected === false && turn.status === "unavailable");
  for (const turn of detected) {
    if (turn.status !== "present") errors.push(`${turn.turnId}: detected turn must have status=present`);
    if (!Array.isArray(turn.evidence) || turn.evidence.length === 0) {
      errors.push(`${turn.turnId}: detected turn has no semantic evidence`);
    }
  }
  for (const turn of overridden) {
    const override = turn.override;
    if (
      !override
      || override.action !== "mark-present"
      || override.turnId !== turn.turnId
      || override.projectId !== report.projectId
      || String(override.versionId || "") !== String(report.versionId || "")
      || override.frameworkId !== report.framework?.id
    ) errors.push(`${turn.turnId}: writer override is missing valid project/version/framework scope`);
  }
  const declaredOverrides = new Map((report.overrides || []).map((override) => [override.id, override]));
  for (const turn of overridden) {
    if (!declaredOverrides.has(turn.override?.id)) errors.push(`${turn.turnId}: applied override is absent from report.overrides`);
  }

  const cov = report.coverage || {};
  const expected = {
    requiredMajorTurnCount: turns.length,
    detectedMajorTurnCount: detected.length,
    overriddenMajorTurnCount: overridden.length,
    missingMajorTurnCount: missing.length,
    unavailableMajorTurnCount: unavailable.length,
  };
  for (const [field, value] of Object.entries(expected)) {
    const declared = field === "unavailableMajorTurnCount" && cov[field] === undefined ? 0 : cov[field];
    if (declared !== value) errors.push(`coverage.${field}=${declared} does not match derived value ${value}`);
  }
  const derivedComplete = turns.length === detected.length + overridden.length
    && missing.length === 0
    && unavailable.length === 0;
  if (cov.complete !== derivedComplete) {
    errors.push(`coverage.complete=${cov.complete} does not match derived value ${derivedComplete}`);
  }
  return errors;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  let report;
  try {
    if (args.file) {
      report = reportFromFile(args.file);
    } else if (args.project) {
      report = await reportFromAdapter({ project: args.project, version: args.version });
    } else {
      console.error("error: pass --file <path> or --project <id> [--version <id>]");
      process.exit(2);
    }
  } catch (e) {
    console.error(`error: ${e.message}`);
    process.exit(2);
  }

  const integrityErrors = validateCompletenessIntegrity(report);
  if (integrityErrors.length) {
    console.error("craft completeness gate: INVALID REPORT");
    for (const error of integrityErrors) console.error(`  - ${error}`);
    process.exit(2);
  }

  const complete = report?.coverage?.complete === true;
  if (complete) {
    console.log(
      `craft completeness gate: PASS  ` +
      `project=${report.projectId || "?"}  version=${report.versionId || "?"}  ` +
      `framework=${report.framework?.id || "?"}  ` +
      `required=${report.coverage.requiredMajorTurnCount}  ` +
      `detected=${report.coverage.detectedMajorTurnCount}  ` +
      `overridden=${report.coverage.overriddenMajorTurnCount}`
    );
    return;
  }

  console.error("craft completeness gate: FAIL");
  console.error("");
  console.error(diagnoseIncomplete(report));
  process.exit(1);
}

main().catch((e) => {
  console.error(`craft completeness gate: ERROR\n${e?.stack || e?.message || e}`);
  process.exit(2);
});
