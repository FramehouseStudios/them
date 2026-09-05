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
      proves: "Prompt shape, Fountain export, creative-memory recall, realtime failover, and learned-answer voice continuity stay deterministic across the owned backend paths.",
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
      proves: "The latest local app build and themTests result is recorded separately from the human smoke and signed-release checks.",
    },
    {
      name: "iOS V1 UI smoke",
      command: "scripts/run_v1_ui_smoke.sh",
      proves: "The sequential XCUITest suite covers the connected V1 app, including locally signed Keychain relaunch, Creative Partner routing, talk-to-screenplay, export/restore, memory, realtime, and recovery states. Fixture-gated skips remain explicit and do not count as human signoff.",
    },
    {
      name: "Release preflight",
      command: "scripts/run_release_preflight.sh",
      proves: "Release settings, private signing/token inputs, live backend and shipped privacy-policy URLs, privacy manifest, AppIcon, iPhone-only TestFlight posture, and the Release iPhone build are ready for signed archive checks.",
    },
  ],
  currentLocalProof: "Current local proof, 2026-08-30 America/Los_Angeles: all five deterministic V1 smokes passed on current `main`; the focused release-config/wrapper contract suite passed 25/25; the unsigned iPhone App Store preflight built successfully and ended at `fail=2 warn=0`, with only DEVELOPMENT_TEAM_ID and APP_TOKEN_RELEASE absent; and the release-config status now also blocks on a missing OPENAI_API_KEY instead of falsely reporting ready. Live release remains red because api.them.io and the shipped privacy URL redirect to unrelated parked-domain content. The latest signed simulator UI and full iOS-unit results remain recorded in `docs/v1-build-test-readiness.md`; they were not rerun for this script-and-documentation-only refresh and do not constitute human TestFlight signoff.",
  platformPosture: [
    "iPhone TestFlight remains the App Store release lane.",
    "The Mac Studio scaffold is outside V1 and is available only as an explicit opt-in diagnostic lane.",
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
      goal: "primary mint works; failures surface as local fallback or production degraded state",
      steps: [
        "Set realtime supplier to the primary provider.",
        "Start a realtime session and confirm the primary session is minted.",
        "Force the primary provider to fail or run with a known failing primary config.",
        "In local/test, confirm deterministic stub fallback is visible and usable.",
        "In production, confirm the app shows degraded/unavailable state with no synthetic client secret.",
      ],
      passCriteria: "Primary succeeds when healthy; local/test fallback remains visible; production failures never report stub as a successful realtime session.",
    },
    {
      pillar: "iPhone Release Readiness",
      goal: "real release config -> live public surfaces -> signed iPhone archive -> exported Launch Doctor proof -> human signoff",
      steps: [
        "Create the ignored Release.local.env from the checked-in template.",
        "Fill in DEVELOPMENT_TEAM_ID, production APP_TOKEN_RELEASE, and OPENAI_API_KEY; keep the file mode 600.",
        "Deploy the production backend with Postgres, every migration, the canonical auth-store marker, one V1 backend instance, and real DATABASE_URL, JWT_SECRET, OPENAI_API_KEY, APP_TOKEN, AUTH_APPLE_AUDIENCE, APP_STORE_ISSUER_ID, APP_STORE_KEY_ID, APP_STORE_PRIVATE_KEY, and APP_STORE_BUNDLE_ID; APP_TOKEN must match APP_TOKEN_RELEASE. App Store secrets are set in the Render dashboard, not in them/Release.local.env.",
        "Publish https://api.them.io and the exact privacy URL shipped in Info-Release.plist, then confirm both return direct HTTP 200 io.them content without redirects or parked-domain material.",
        "Review the checked-in dedicated iOS entitlement containing com.apple.developer.applesignin = [Default], enable Sign in with Apple for io.them.them in the Apple portal, regenerate provisioning, and verify iphoneos Release still resolves to them/them-iOS.entitlements.",
        "Review and approve the Email Address declaration in PrivacyInfo.xcprivacy, approve or replace the generated AppIcon, and complete App Store privacy/export-compliance metadata.",
        "Add GitHub Actions secrets APP_TOKEN_RELEASE and DEVELOPMENT_TEAM_ID, verify OPENAI_API_KEY, then run scripts/run_release_preflight.sh without disabling any gate and require the rc-* workflow to pass.",
        "Archive and Validate the distribution-signed iPhone app, upload it to TestFlight, and install the build on a physical iPhone.",
        "Verify real Sign in with Apple using an actual Apple ID, server-backed email signup/sign-in, session restoration, Remember Me/Keychain opt-in and opt-out, sign-out, and account deletion. The DEBUG .invalid demo account is not an Apple or production account.",
        "Run all five manual flows on the TestFlight build, export Launch Doctor JSON/Markdown, and record final human signoff before external review.",
      ],
      passCriteria: "Public surfaces, signed archive validation, physical-device flows, Launch Doctor proof, metadata, and human sign-off are all green before TestFlight/external review.",
    },
  ],
  parked: [
    {
      item: "Creative-memory delete implementation",
      prs: ["#99"],
      reason: "The privacy decision and core export work are merged; destructive memory delete remains post-V1 unless Codex assigns it.",
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
  if (data.currentLocalProof) {
    lines.push(data.currentLocalProof);
    lines.push("");
  }
  lines.push("## Platform Posture");
  lines.push("");
  for (const line of data.platformPosture) {
    lines.push(`- ${line}`);
  }
  lines.push("");
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
    lines.push(`- ${item.item} (${item.prs.join(", ")}): ${item.reason}`);
  }
  lines.push("");
  lines.push("## Status Command");
  lines.push("");
  lines.push(`Run \`${data.v1StatusCommand}\` after updating docs/v1-definition.md.`);
  lines.push("");
  lines.push(`<sub>Generated from \`${data.generatedBy}\`.</sub>`);
  lines.push("");
  return lines.join("\n");
}

function promptBlock(data) {
  const flowNames = data.manualFlows.map((flow) => flow.pillar);
  const lines = [
    "Overall V1 manual smoke: PASS/FAIL - <notes>",
    ...flowNames.map((name) => `${name}: PASS/FAIL/IN PROGRESS/NOT STARTED - <notes>`),
  ];
  return `${lines.join("\n")}\n`;
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
if (args.prompt) {
  process.stdout.write(promptBlock(artifact));
} else if (args.json) {
  console.log(JSON.stringify(artifact, null, 2));
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
