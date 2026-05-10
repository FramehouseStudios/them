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
  const key = version ? `${project}:${version}` : `${project}:`;
  const report = await persistence.get({ domain: "craft_reports", key });
  if (typeof persistence.close === "function") await persistence.close();
  if (!report) {
    throw new Error(`craft report not found for project="${project}" version="${version || ""}"`);
  }
  return report;
}

function diagnoseIncomplete(report) {
  const lines = [];
  const cov = report?.coverage || {};
  lines.push(`coverage: complete=${cov.complete} required=${cov.requiredMajorTurnCount} detected=${cov.detectedMajorTurnCount} overridden=${cov.overriddenMajorTurnCount} missing=${cov.missingMajorTurnCount}`);
  if (Array.isArray(report?.majorTurns)) {
    const missing = report.majorTurns.filter((t) => t && t.required && !t.detected
      && t.status !== "overridden" && t.status !== "manually_present" && t.status !== "accepted");
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
