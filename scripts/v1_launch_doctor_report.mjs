#!/usr/bin/env node
//
// scripts/v1_launch_doctor_report.mjs
//
// CLI companion for the in-app V1 Launch Doctor. It records explicit manual
// smoke outcomes into the same JSON/Markdown schema the app exports, so the
// launch room can consume proof without treating a chat transcript as state.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const SCHEMA_VERSION = 1;
const SOURCE = "io.them.v1_launch_doctor";
const DISTANT_PAST = "0001-01-01T00:00:00.000Z";

const flows = [
  {
    id: "talk_pipeline",
    title: "Talk Pipeline",
    pillar: "talk",
    flags: ["talk", "talk-pipeline", "talk_pipeline"],
    promptNames: ["talk pipeline"],
    goal: "Record voice, receive a useful companion reply, hear playback, and keep the turn.",
    passCriteria: "Voice -> reply -> playback -> saved turn works without a restart or manual repair.",
  },
  {
    id: "screenplay_studio",
    title: "Screenplay Studio",
    pillar: "screenplay",
    flags: ["studio", "screenplay", "screenplay-studio", "screenplay_studio"],
    promptNames: ["screenplay studio"],
    goal: "Create a project, write a properly formatted page, save it, reopen it, and export it.",
    passCriteria: "A one-page screenplay survives save/reopen and exports through the current Studio controls.",
  },
  {
    id: "creative_memory",
    title: "Creative Memory",
    pillar: "memory",
    flags: ["memory", "creative-memory", "creative_memory"],
    promptNames: ["creative memory"],
    goal: "Confirm THEM remembers safe creative context and exposes enough shape to diagnose memory.",
    passCriteria: "Memory improves continuity, diagnostics are readable, and privacy-gated export/delete behavior is understood.",
  },
  {
    id: "realtime",
    title: "Realtime",
    pillar: "realtime",
    flags: ["realtime", "real-time", "real_time"],
    promptNames: ["realtime", "real-time", "real time"],
    goal: "Mint a realtime session, confirm supplier metadata, and verify degraded-mode behavior.",
    passCriteria: "Realtime starts on the primary path, fallback is visible when triggered, and no dead-end state traps the user.",
  },
  {
    id: "release_readiness",
    title: "iOS Release Readiness",
    pillar: "ios",
    flags: ["release", "release-readiness", "release_readiness", "ios-release", "ios_release", "testflight", "testflight-readiness"],
    promptNames: ["ios release readiness", "release readiness", "testflight readiness"],
    goal: "Confirm release config, signed preflight, and Launch Doctor proof are ready before TestFlight or external review.",
    passCriteria: "Release config is real, preflight is green, Launch Doctor proof is exported, and human sign-off is recorded before TestFlight/external review.",
  },
];

const flowByFlag = new Map();
const flowByPromptName = new Map();
for (const flow of flows) {
  flowByFlag.set(flow.id, flow);
  for (const flag of flow.flags) flowByFlag.set(normalizeKey(flag), flow);
  for (const name of flow.promptNames) flowByPromptName.set(normalizePromptName(name), flow);
}

function normalizeKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
}

function normalizePromptName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[._-]/g, " ");
}

function normalizeStatus(raw) {
  const original = String(raw || "").trim();
  if (!original || original.includes("/")) return null;
  const value = original.toLowerCase().replace(/[\s-]+/g, "_");
  if (["pass", "passed"].includes(value)) return "passed";
  if (["fail", "failed"].includes(value)) return "failed";
  if (["progress", "in_progress", "inprogress"].includes(value)) return "in_progress";
  if (["not_started", "notstarted", "none", "todo", "pending"].includes(value)) return "not_started";
  return null;
}

function printHelp() {
  console.log(`Usage:
  node scripts/v1_launch_doctor_report.mjs --talk=pass --studio=fail --write-docs
  node scripts/v1_launch_doctor_report.mjs --from-result-block=/tmp/v1-smoke.txt --write-docs
  node scripts/v1_launch_doctor_report.mjs --from-result-block=- --write=docs/v1-launch-doctor.latest.json

Options:
  --talk=<status>                 pass|fail|in-progress|not-started
  --studio=<status>               pass|fail|in-progress|not-started
  --memory=<status>               pass|fail|in-progress|not-started
  --realtime=<status>             pass|fail|in-progress|not-started
  --release=<status>              pass|fail|in-progress|not-started
  --<flow>-notes=<text>           Notes for a flow, e.g. --talk-notes="..."
  --<flow>-evidence=<text>        Evidence for a flow, e.g. --realtime-evidence="..."
  --from-result-block=<path|->    Parse the block printed by v1_manual_qa_checklist --prompt
  --write=<json-path>             Write JSON and sibling Markdown
  --markdown=<md-path>            Override Markdown path when --write is used
  --write-docs                    Write docs/v1-launch-doctor.latest.json and .md
  --generated-at=<iso-date>       Override report timestamp
  --json                          Print JSON to stdout (default when not writing)
`);
}

function parseArgs(argv) {
  const args = {
    flowUpdates: new Map(),
    flowNotes: new Map(),
    flowEvidence: new Map(),
    resultBlockPath: "",
    writePath: "",
    markdownPath: "",
    generatedAt: new Date().toISOString(),
    wantJson: false,
    help: false,
  };
  for (const item of argv) {
    if (item === "--help" || item === "-h") {
      args.help = true;
      continue;
    }
    if (item === "--json") {
      args.wantJson = true;
      continue;
    }
    if (item === "--write-docs") {
      args.writePath = path.join(repoRoot, "docs", "v1-launch-doctor.latest.json");
      continue;
    }
    const match = item.match(/^--([^=]+)=(.*)$/s);
    if (!match) {
      throw new Error(`unknown argument ${item}; use --help for usage`);
    }
    const key = normalizeKey(match[1]);
    const value = match[2];
    if (key === "from-result-block") {
      args.resultBlockPath = value;
    } else if (key === "write") {
      args.writePath = path.resolve(repoRoot, value);
    } else if (key === "markdown") {
      args.markdownPath = path.resolve(repoRoot, value);
    } else if (key === "generated-at") {
      args.generatedAt = new Date(value).toISOString();
    } else if (key.endsWith("-notes")) {
      const flow = flowByFlag.get(key.slice(0, -"notes".length - 1));
      if (!flow) throw new Error(`unknown flow notes argument --${match[1]}`);
      args.flowNotes.set(flow.id, value.trim());
    } else if (key.endsWith("-evidence")) {
      const flow = flowByFlag.get(key.slice(0, -"evidence".length - 1));
      if (!flow) throw new Error(`unknown flow evidence argument --${match[1]}`);
      args.flowEvidence.set(flow.id, value.trim());
    } else {
      const flow = flowByFlag.get(key);
      if (!flow) throw new Error(`unknown argument --${match[1]}; use --help for usage`);
      const status = normalizeStatus(value);
      if (!status) throw new Error(`invalid status for --${match[1]}=${value}`);
      args.flowUpdates.set(flow.id, status);
    }
  }
  return args;
}

function readResultBlock(pathArg) {
  if (!pathArg) return "";
  if (pathArg === "-") {
    return fs.readFileSync(0, "utf8");
  }
  return fs.readFileSync(path.resolve(repoRoot, pathArg), "utf8");
}

function parseResultBlock(text) {
  const parsed = new Map();
  const notes = new Map();
  const lines = String(text || "").split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*([^:]+):\s*(.*?)\s*$/);
    if (!match) continue;
    const flowName = normalizePromptName(match[1]);
    if (flowName.startsWith("overall v1 manual smoke")) continue;
    const flow = flowByPromptName.get(flowName);
    if (!flow) continue;
    const body = match[2].trim();
    const statusMatch = body.match(/^(pass(?:ed)?|fail(?:ed)?|in[\s_-]?progress|not[\s_-]?started)(?:\s*[-–—:]\s*(.*))?$/i);
    if (!statusMatch) continue;
    const status = normalizeStatus(statusMatch[1]);
    if (!status) continue;
    parsed.set(flow.id, status);
    if (statusMatch[2] && statusMatch[2].trim() && !statusMatch[2].includes("<notes>")) {
      notes.set(flow.id, statusMatch[2].trim());
    }
  }
  return { parsed, notes };
}

function makeResult(flow, status, notes, evidence, updatedAt) {
  const isDefault = status === "not_started" && !notes && !evidence;
  return {
    evidence,
    flow: flow.id,
    notes,
    status,
    updatedAt: isDefault ? DISTANT_PAST : updatedAt,
  };
}

function makeReport(args) {
  const block = parseResultBlock(readResultBlock(args.resultBlockPath));
  const updates = new Map(block.parsed);
  const notes = new Map(block.notes);
  for (const [id, status] of args.flowUpdates.entries()) updates.set(id, status);
  for (const [id, value] of args.flowNotes.entries()) notes.set(id, value);
  const explicitCount = updates.size + args.flowNotes.size + args.flowEvidence.size + block.parsed.size;
  if (explicitCount === 0) {
    throw new Error("no Launch Doctor results supplied; pass explicit --talk/--studio/--memory/--realtime/--release statuses or --from-result-block");
  }

  const results = flows.map((flow) => makeResult(
    flow,
    updates.get(flow.id) || "not_started",
    notes.get(flow.id) || "",
    args.flowEvidence.get(flow.id) || "",
    args.generatedAt
  ));
  const summary = {
    total: results.length,
    passed: results.filter((result) => result.status === "passed").length,
    failed: results.filter((result) => result.status === "failed").length,
    inProgress: results.filter((result) => result.status === "in_progress").length,
    notStarted: results.filter((result) => result.status === "not_started").length,
  };
  let overallStatus = "not_started";
  if (summary.failed > 0) {
    overallStatus = "failed";
  } else if (summary.passed === summary.total) {
    overallStatus = "passed";
  } else if (summary.inProgress > 0 || summary.passed > 0) {
    overallStatus = "in_progress";
  }
  return {
    generatedAt: args.generatedAt,
    overallStatus,
    results,
    schemaVersion: SCHEMA_VERSION,
    source: SOURCE,
    summary,
  };
}

function markdown(report) {
  const lines = [];
  lines.push("# THEM V1 Launch Doctor");
  lines.push("");
  lines.push(`- Generated: ${report.generatedAt}`);
  lines.push(`- Overall: ${report.overallStatus}`);
  lines.push(`- Passed: ${report.summary.passed}/${report.summary.total}`);
  lines.push(`- Failed: ${report.summary.failed}`);
  lines.push("");
  for (const result of report.results) {
    const flow = flows.find((candidate) => candidate.id === result.flow);
    lines.push(`## ${flow.title}`);
    lines.push("");
    lines.push(`- Pillar: ${flow.pillar}`);
    lines.push(`- Status: ${result.status}`);
    lines.push(`- Goal: ${flow.goal}`);
    lines.push(`- Pass criteria: ${flow.passCriteria}`);
    if (result.evidence.trim()) lines.push(`- Evidence: ${result.evidence}`);
    if (result.notes.trim()) {
      lines.push("");
      lines.push(result.notes);
    }
    lines.push("");
  }
  return `${lines.join("\n").trim()}\n`;
}

function siblingMarkdownPath(jsonPath) {
  return jsonPath.endsWith(".json")
    ? `${jsonPath.slice(0, -".json".length)}.md`
    : `${jsonPath}.md`;
}

function writeReport(report, jsonPath, markdownPath) {
  fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  const mdPath = markdownPath || siblingMarkdownPath(jsonPath);
  fs.mkdirSync(path.dirname(mdPath), { recursive: true });
  fs.writeFileSync(mdPath, markdown(report), "utf8");
  return { jsonPath, markdownPath: mdPath };
}

function displayPath(fullPath) {
  const relativeToRepo = path.relative(repoRoot, fullPath);
  if (relativeToRepo && !relativeToRepo.startsWith("..") && !path.isAbsolute(relativeToRepo)) {
    return relativeToRepo;
  }
  const relativeToHome = path.relative(os.homedir(), fullPath);
  if (relativeToHome && !relativeToHome.startsWith("..") && !path.isAbsolute(relativeToHome)) {
    return `~/${relativeToHome}`;
  }
  return fullPath;
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    process.exit(0);
  }
  const report = makeReport(args);
  if (args.writePath) {
    const written = writeReport(report, args.writePath, args.markdownPath);
    console.log(`wrote ${displayPath(written.jsonPath)}`);
    console.log(`wrote ${displayPath(written.markdownPath)}`);
  } else {
    console.log(JSON.stringify(report, null, 2));
  }
} catch (error) {
  console.error(`v1-launch-doctor-report: ${error.message}`);
  process.exit(1);
}
