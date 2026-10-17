// Canonical internal CLI contract. Historical command names delegate here;
// none may assign work to a retired assistant or infer readiness from old rows.
import fs from "node:fs";

function explicitLaunchDoctorReport(reportPath) {
  if (!reportPath) return {status: "not_requested"};
  if (!fs.existsSync(reportPath)) return {status: "missing"};
  try {
    const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    const passed = report.summary?.passed;
    const total = report.summary?.total;
    if (report.source !== "io.them.v1_launch_doctor" || !["passed", "failed", "in_progress", "not_started"].includes(report.overallStatus) || !Number.isInteger(passed) || !Number.isInteger(total) || passed < 0 || total < passed) {
      return {status: "invalid"};
    }
    return {status: "found", overallStatus: report.overallStatus, passed, total,
      evidenceScope: "Explicit stored report only; not current build or shipping readiness."};
  } catch {
    return {status: "invalid"}; // Never echo malformed file contents.
  }
}

export function workflowState() {
  return {
    schemaVersion: 2,
    mode: "codex-only",
    implementationOwner: "codex",
    productAuthority: "human",
    taskSource: "TASKS.md",
    readOrder: ["AGENTS.md", "DECISIONS.md", "TASKS.md"],
    readiness: "UNVERIFIED",
    launchDoctor: explicitLaunchDoctorReport(process.env.V1_LAUNCH_DOCTOR_REPORT),
    historicalSources: ["docs/coordination.json", "docs/live-handoff.md", "docs/codex-inbox.md", "docs/claude-inbox.md"],
    protections: ["independent non-author review", "required checks", "no direct main push", "no protection bypass", "preserve original commits and PR heads"],
    next: "Read the current task ledger and inspect the worktree, GitHub heads, approvals, checks and deployment before acting. Fix the weakest verified writer-loop failure; preserve useful existing work.",
    proof: "Prove speech or typing → reply → formatted screenplay → save → offline edit → relaunch → exact restore → external export. A fixture, checklist or old green head does not prove the shipping phone journey or a generated 120-page screenplay.",
    humanRequired: "Ask only for genuinely human-required review, credentials, spending or physical-device actions. Never impersonate an independent reviewer. App Store work is deferred.",
  };
}

export function runWorkflowCli(argv = process.argv.slice(2)) {
  let json = false;
  for (const arg of argv) {
    if (arg === "--json" || arg === "--format=json") json = true;
    else if (arg === "--format=text" || arg === "--no-events") continue;
    else if (arg.startsWith("--role=")) {
      const role = arg.slice(7);
      if (!["all", "codex", "human", "support"].includes(role)) {
        console.error(`codex-workflow: invalid --role=${role}`);
        process.exitCode = 2;
        return;
      }
      // support/all are compatibility aliases, never separate work owners.
    } else {
      console.error(`codex-workflow: unsupported option ${arg}; historical queue options are retired. Use TASKS.md and verify current state.`);
      process.exitCode = 2;
      return;
    }
  }
  const state = workflowState();
  console.log(json ? JSON.stringify(state, null, 2) : [
    "THEM — Codex-owned workflow",
    `Read: ${state.readOrder.join(" → ")}. The human's newest request comes first.`,
    "Codex owns implementation, review, integration and verification; the human retains product and approval authority.",
    "No second-assistant handoffs or waiting for a retired lane. Historical coordination/inboxes are evidence only, not current assignments.",
    state.next,
    `Keep: ${state.protections.join("; ")}.`,
    state.proof,
    state.humanRequired,
    "Readiness: UNVERIFIED by this workflow command. Report exact fresh proof and remaining gaps; do not invent a completion percentage.",
  ].join("\n"));
}
