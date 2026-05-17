#!/usr/bin/env node
//
// scripts/v1_manual_qa_checklist.mjs
//
// Human-run V1 smoke checklist. The deterministic V1 smokes prove fixture and
// contract behavior; this checklist names the end-to-end app paths a person
// still needs to run before TestFlight/external review.
//
// Usage:
//   node scripts/v1_manual_qa_checklist.mjs
//   node scripts/v1_manual_qa_checklist.mjs --json
//   node scripts/v1_manual_qa_checklist.mjs --prompt
//   node scripts/v1_manual_qa_checklist.mjs --write=docs/testflight-v1-preflight.md

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const artifact = {
  title: "io.them V1 TestFlight Preflight",
  generatedBy: "scripts/v1_manual_qa_checklist.mjs",
  v1StatusCommand: "npm run v1:status",
  automatedProof: [
    {
      name: "Deterministic V1 smokes",
      command: "cd backend && npm run eval:v1-smokes",
      proves: "Prompt shape, Fountain export fixture, creative-memory recall, and realtime failover stay deterministic.",
    },
    {
      name: "Backend live talk smoke",
      command: "cd backend && BASE_URL=<hosted-or-local-api> APP_TOKEN=<token> ./smoke.sh <real-audio.wav>",
      proves: "Health/session/history/memories/talk all respond, and /talk returns non-empty audio.",
    },
    {
      name: "Current V1 status",
      command: "npm run v1:status",
      proves: "The checked and parked V1 checklist items match docs/v1-definition.md.",
    },
    {
      name: "Current app build and tests",
      command: "docs/v1-build-test-readiness.md",
      proves: "The latest local app build and `themTests` result is recorded separately from the human smoke and signed-release checks.",
    },
    {
      name: "Release preflight",
      command: "scripts/appstore_preflight.sh",
      proves: "Release settings, privacy manifest, entitlements, and macOS release build are ready for archive checks.",
    },
  ],
  manualFlows: [
    {
      pillar: "Talk Pipeline",
      goal: "record voice -> get reply -> hear reply -> saved turn",
      steps: [
        "Launch the app against the intended backend.",
        "Record a short messy screenplay impulse using the microphone.",
        "Confirm the companion reply appears in the talk surface.",
        "Play the generated audio reply or confirm the visible audio-unavailable fallback.",
        "Quit and reopen the app; confirm the turn is still present.",
      ],
      passCriteria: "Reply text is visible, audio behavior is explained, and the saved turn survives relaunch.",
    },
    {
      pillar: "Screenplay Studio",
      goal: "create project -> write scene -> save -> export -> reopen",
      steps: [
        "Create a new screenplay project from a cold app state.",
        "Write one scene heading, one action line, one character cue, and one dialogue line.",
        "Save the draft and confirm the saved state is visible.",
        "Export through the available format picker.",
        "Reopen the project and confirm the page content survives.",
      ],
      passCriteria: "The Studio produces a readable screenplay page and preserves it through save/export/reopen.",
    },
    {
      pillar: "Creative Memory",
      goal: "mention character -> later suggestion recalls them",
      steps: [
        "Mention a named character and a distinctive voice/trait in a talk or studio interaction.",
        "Refresh the memory summary in Data Controls.",
        "Ask for a later suggestion involving that character.",
        "Confirm the suggestion references the character without exposing private debug payloads.",
      ],
      passCriteria: "The app recalls useful character context and keeps support/debug surfaces plain-language.",
    },
    {
      pillar: "Realtime",
      goal: "primary mint works; forced primary failure shows fallback",
      steps: [
        "Set realtime supplier to the primary provider.",
        "Start a realtime session and confirm the primary session is minted.",
        "Force the primary provider to fail or run with a known failing primary config.",
        "Confirm the app shows the fallback/degraded state and does not strand the writer.",
      ],
      passCriteria: "Primary succeeds when healthy; fallback is visible and usable when primary fails.",
    },
  ],
  parked: [
    {
      item: "Postgres eval gate",
      prs: ["#33"],
      reason: "Needs the GitHub Actions OPENAI_API_KEY secret fixed by a human.",
    },
  ],
  outOfV1: [
    {
      item: "Creative-memory delete",
      prs: ["#99"],
      reason: "Intentionally deferred post-V1. V1 core-only export already shipped in #94; destructive delete needs explicit product semantics before release.",
      decisionPacket: "docs/memory-export-delete-decision-packet.md",
    },
  ],
};

function markdown(data) {
  const lines = [];
  lines.push(`# ${data.title}`);
  lines.push("");
  lines.push("This artifact names the V1 proof a human should run before TestFlight or external review. It does not claim human signoff; it makes the signoff path explicit.");
  lines.push("");
  lines.push("## Automated Proof");
  lines.push("");
  for (const item of data.automatedProof) {
    lines.push(`### ${item.name}`);
    lines.push("");
    lines.push(`\`${item.command}\``);
    lines.push("");
    lines.push(item.proves);
    lines.push("");
  }
  lines.push("## Manual App Flows");
  lines.push("");
  for (const flow of data.manualFlows) {
    lines.push(`### ${flow.pillar}`);
    lines.push("");
    lines.push(`Goal: ${flow.goal}`);
    lines.push("");
    for (let i = 0; i < flow.steps.length; i += 1) {
      lines.push(`${i + 1}. ${flow.steps[i]}`);
    }
    lines.push("");
    lines.push(`Pass: ${flow.passCriteria}`);
    lines.push("");
  }
  lines.push("## Parked Before V1 External Review");
  lines.push("");
  for (const item of data.parked) {
    const suffix = item.decisionPacket ? ` Decision packet: \`${item.decisionPacket}\`.` : "";
    lines.push(`- ${item.item} (${item.prs.join(", ")}): ${item.reason}${suffix}`);
  }
  lines.push("");
  if (data.outOfV1.length) {
    lines.push("## Explicitly Out of V1");
    lines.push("");
    for (const item of data.outOfV1) {
      const suffix = item.decisionPacket ? ` Decision record: \`${item.decisionPacket}\`.` : "";
      lines.push(`- ${item.item} (${item.prs.join(", ")}): ${item.reason}${suffix}`);
    }
    lines.push("");
  }
  lines.push("## Status Command");
  lines.push("");
  lines.push(`Run \`${data.v1StatusCommand}\` after updating docs/v1-definition.md.`);
  lines.push("");
  lines.push(`<sub>Generated from \`${data.generatedBy}\`.</sub>`);
  lines.push("");
  return lines.join("\n");
}

function prompt(data) {
  const lines = [];
  lines.push("V1 human smoke prompt");
  lines.push("");
  lines.push("Run these app flows against the intended backend, then paste the result block back to Codex.");
  lines.push("Codex can save the pasted block with: node scripts/v1_launch_doctor_report.mjs --from-result-block=<file> --write-docs");
  lines.push("");
  for (const flow of data.manualFlows) {
    lines.push(`- ${flow.pillar}: ${flow.goal}`);
  }
  lines.push("");
  lines.push("Parked before external review:");
  for (const item of data.parked) {
    const suffix = item.decisionPacket ? ` Decision packet: ${item.decisionPacket}.` : "";
    lines.push(`- ${item.item} (${item.prs.join(", ")}): ${item.reason}${suffix}`);
  }
  if (data.outOfV1.length) {
    lines.push("");
    lines.push("Explicitly out of V1:");
    for (const item of data.outOfV1) {
      const suffix = item.decisionPacket ? ` Decision record: ${item.decisionPacket}.` : "";
      lines.push(`- ${item.item} (${item.prs.join(", ")}): ${item.reason}${suffix}`);
    }
  }
  lines.push("");
  lines.push("Result block to paste back:");
  for (const flow of data.manualFlows) {
    lines.push(`${flow.pillar}: PASS/FAIL - <notes>`);
  }
  lines.push("Overall V1 manual smoke: PASS/FAIL - <notes>");
  lines.push("");
  lines.push(`Status command: ${data.v1StatusCommand}`);
  return lines.join("\n");
}

function parseArgs(argv) {
  const out = {};
  for (const arg of argv) {
    if (arg === "--json") out.json = true;
    if (arg === "--prompt") out.prompt = true;
    const writePrefix = "--write=";
    if (arg.startsWith(writePrefix)) out.write = arg.slice(writePrefix.length);
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
if (args.json) {
  console.log(JSON.stringify(artifact, null, 2));
} else if (args.prompt) {
  console.log(prompt(artifact));
} else {
  const body = markdown(artifact);
  if (args.write) {
    const target = path.resolve(repoRoot, args.write);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, body);
    console.log(`wrote ${path.relative(repoRoot, target)}`);
  } else {
    console.log(body);
  }
}
