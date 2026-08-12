import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { fileURLToPath } from "node:url";

import { createCreativeMemoryStore } from "../lib/creative_memory_store.js";
import { createPersistence } from "../lib/persistence_adapter.js";
import { startBackend } from "../tests/helpers/backend_test_server.mjs";
import {
  createStudioRestoreOwnerIdentity,
  requestStudioRestoreJSON,
} from "./studio_restore_seed_helper.mjs";

const ROOT_DIR = fileURLToPath(new URL("../..", import.meta.url));
const APP_TOKEN = "them-dev";
const PORT = Number(process.env.THEM_STUDIO_INSTINCT_UI_SMOKE_PORT || 31340);
const TEST_IDENTIFIER =
  "themUITests/V1SmokeUITests/test_studio_writer_block_rescue_follows_instinct_then_protects_due_canon";
const PROJECT_ID = "studio-instinct-rescue";
const PROJECT_TITLE = "Studio Instinct Rescue";
const EVIDENCE_DIR = "/tmp/them-smoke/studio-instinct-writer-block";
const EVIDENCE_STAGES = [
  "01-baseline",
  "02-rescue-rejected",
  "03-relaunch-adapted",
  "04-repaired-rescue-learned",
  "05-other-act-unaffected",
  "06-explicit-correction",
  "07-canon-protected",
];
const PROMPT = "I am stuck in the middle. What should happen next?";
const DUE_SETUP = "The red locket inside the courthouse clock";
const DUE_PAYOFF = "Mara uses the red locket to expose the forged verdict";
const ACCEPTED_PAGE = [
  "INT. CLOCK TOWER - NIGHT",
  "",
  "Mara wedges the red locket behind the courthouse clock's brass face.",
  "",
  "ELI",
  "You are going to tell me where you put it.",
  "",
  "MARA",
  "When telling you stops making you a target.",
  "",
  "She closes the clock and leaves him with the ticking.",
].join("\n");
const RESCUE_ACCEPTED_PAGE = [
  "INT. FERRY WAITING ROOM - NIGHT",
  "",
  "Mara finds the last ferry ticket beneath the bench.",
  "",
  "She holds it out to Eli. He lets it fall between them.",
  "",
  "MARA",
  "We can still make it.",
  "",
  "Outside, the ferry pulls away without them.",
].join("\n");
const PLATFORM = String(process.env.THEM_STUDIO_INSTINCT_UI_PLATFORM || "all")
  .trim()
  .toLowerCase();

assert(
  ["all", "ios", "macos"].includes(PLATFORM),
  "THEM_STUDIO_INSTINCT_UI_PLATFORM must be all, ios, or macos."
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function requireString(value, message) {
  const clean = String(value || "").trim();
  if (!clean) throw new Error(message);
  return clean;
}

async function refreshClientIdentity(baseURL, identity) {
  const session = await requestStudioRestoreJSON({
    baseURL,
    path: "/session",
    method: "POST",
    headers: {
      "X-APP-TOKEN": identity.appToken,
      Authorization: `Bearer ${identity.accessToken}`,
    },
    body: {},
  });
  assert(
    session.response.ok,
    `Could not refresh the Studio instinct client: ${session.status} ${JSON.stringify(session.payload)}`
  );
  const expiresIn = Math.max(60, Number(session.payload?.expires_in || 0));
  return {
    ...identity,
    clientToken: requireString(
      session.payload?.client_token,
      "Refreshed Studio instinct session did not return a client token."
    ),
    clientTokenCachedAt: Math.floor(Date.now() / 1000),
    clientTokenExpiry: new Date(Date.now() + expiresIn * 1000).toISOString(),
  };
}

async function seedProject(server, identity) {
  const headers = {
    "X-APP-TOKEN": identity.appToken,
    "X-CLIENT-TOKEN": identity.clientToken,
    Authorization: `Bearer ${identity.accessToken}`,
  };
  const project = await requestStudioRestoreJSON({
    baseURL: server.baseUrl,
    path: "/screenplay/projects",
    method: "POST",
    headers,
    body: {
      project_id: PROJECT_ID,
      title: PROJECT_TITLE,
      phase: "scene_draft",
      act_position: "Act II",
      protagonist_want: "get Eli onto the last ferry",
      protagonist_need: "stop using control as a substitute for trust",
      unresolved_setups: [],
      activate: true,
    },
  });
  assert(
    project.response.ok,
    `The Studio instinct project seed failed: ${project.status} ${JSON.stringify(project.payload)}`
  );

  const version = await requestStudioRestoreJSON({
    baseURL: server.baseUrl,
    path: `/screenplay/projects/${PROJECT_ID}/version`,
    method: "POST",
    headers,
    body: {
      draft: [
        "INT. FERRY WAITING ROOM - NIGHT",
        "",
        "Mara watches Eli hold the last ticket between two fingers.",
        "",
        "MARA",
        "Either trust me or tear it up.",
      ].join("\n"),
      title: PROJECT_TITLE,
      phase: "scene_draft",
      source: "studio_instinct_writer_block_smoke",
      base_version_id: "",
    },
  });
  assert(
    version.response.ok,
    `The Studio instinct version seed failed: ${version.status} ${JSON.stringify(version.payload)}`
  );

  const persistence = createPersistence({
    jsonRoot: server.env.PERSISTENCE_JSON_ROOT,
  });
  const store = createCreativeMemoryStore({ persistence });
  try {
    const receipt = await store.recordProjectContinuity({
      userId: identity.userID,
      continuity: {
        projectId: PROJECT_ID,
        projectTitle: PROJECT_TITLE,
        act: "Act II",
        featureSequence: "Bad Guys Close In",
        currentBeat: "Mara cannot decide whether to trust Eli.",
        protagonistWant: "get Eli onto the last ferry",
        protagonistNeed: "stop using control as a substitute for trust",
        characterFocus: ["Mara", "Eli"],
        questionEffectiveness: [],
      },
    });
    assert(receipt?.ok, "The Studio instinct creative-memory seed failed.");
  } finally {
    await persistence.close();
  }
}

function prepareEvidenceDirectory(platform) {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  for (const fileName of readdirSync(EVIDENCE_DIR)) {
    if (!fileName.startsWith(`${platform}-`)) continue;
    unlinkSync(`${EVIDENCE_DIR}/${fileName}`);
  }
}

function fixtureJSON(baseURL, identity, platform) {
  return JSON.stringify({
    baseURL,
    appToken: identity.appToken,
    userID: identity.userID,
    clientToken: identity.clientToken,
    clientTokenCachedAt: identity.clientTokenCachedAt,
    clientTokenExpiry: identity.clientTokenExpiry,
    accessToken: identity.accessToken,
    projectID: PROJECT_ID,
    projectTitle: PROJECT_TITLE,
    preferenceFamily: "reversal_pressure",
    rejectedPreferenceFamily: "reversal_pressure",
    repairedPreferenceFamily: "relationship_pressure",
    prompt: PROMPT,
    baselineStrongestMove: "Ranked strongest move - reversal pressure",
    repairedStrongestMove: "Ranked strongest move - relationship pressure",
    otherActStrongestMove: "Ranked strongest move - reversal pressure",
    correctedStrongestMove: "Ranked strongest move - reversal pressure",
    canonStrongestMove: "Ranked strongest move - payoff pressure",
    acceptedPage: ACCEPTED_PAGE,
    rescueAcceptedPage: RESCUE_ACCEPTED_PAGE,
    dueSetup: DUE_SETUP,
    duePayoff: DUE_PAYOFF,
    evidencePlatform: platform,
  });
}

function sanitizeUITestOutput(output, fixture) {
  return String(output || "")
    .replaceAll(fixture, "<redacted-studio-instinct-fixture>")
    .replace(
      /THEM_UITEST_STUDIO_INSTINCT_FIXTURE_BASE64URL\s*=\s*[A-Za-z0-9_-]+/g,
      "THEM_UITEST_STUDIO_INSTINCT_FIXTURE_BASE64URL = <redacted>"
    );
}

function safeEvidenceName(value) {
  return String(value || "attachment")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "attachment";
}

function exportEvidenceAttachments({ platform, resultBundlePath }) {
  if (!existsSync(resultBundlePath)) return;
  const exportPath = `/tmp/io-them-studio-instinct-${platform}-${process.pid}-attachments`;
  const result = spawnSync("xcrun", [
    "xcresulttool", "export", "attachments",
    "--path", resultBundlePath,
    "--output-path", exportPath,
  ], {
    cwd: ROOT_DIR,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(
      `${platform} Studio instinct evidence export failed.\n${result.stdout || ""}\n${result.stderr || ""}`
    );
  }

  const manifestPath = `${exportPath}/manifest.json`;
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  copyFileSync(manifestPath, `${EVIDENCE_DIR}/${platform}-xcresult-manifest.json`);
  let failureIndex = 0;
  for (const testResult of Array.isArray(manifest) ? manifest : []) {
    for (const attachment of Array.isArray(testResult?.attachments) ? testResult.attachments : []) {
      const exportedFileName = String(attachment?.exportedFileName || "").trim();
      const suggestedName = String(attachment?.suggestedHumanReadableName || "").trim();
      if (!exportedFileName || !suggestedName) continue;
      const source = `${exportPath}/${exportedFileName}`;
      if (!existsSync(source)) continue;

      const stageMatch = suggestedName.match(
        new RegExp(
          `^studio-instinct-${platform}-(${EVIDENCE_STAGES.join("|")})(?:_\\d+_[a-f0-9-]+)?\\.(json|png)$`,
          "i"
        )
      );
      if (stageMatch) {
        const [, stage, extension] = stageMatch;
        copyFileSync(
          source,
          `${EVIDENCE_DIR}/${platform}-${stage}.${extension.toLowerCase()}`
        );
      } else if (attachment?.isAssociatedWithFailure === true) {
        failureIndex += 1;
        const extension = exportedFileName.includes(".")
          ? `.${exportedFileName.split(".").at(-1)}`
          : "";
        const baseName = safeEvidenceName(suggestedName).replace(/\.[a-z0-9]+$/i, "");
        copyFileSync(
          source,
          `${EVIDENCE_DIR}/${platform}-failure-${String(failureIndex).padStart(2, "0")}-${baseName}${extension}`
        );
      }
    }
  }
}

function readTestSummary({ platform, resultBundlePath }) {
  const result = spawnSync("xcrun", [
    "xcresulttool", "get", "test-results", "summary",
    "--path", resultBundlePath,
  ], {
    cwd: ROOT_DIR,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(
      `${platform} Studio instinct result summary failed.\n${result.stdout || ""}\n${result.stderr || ""}`
    );
  }
  const summary = JSON.parse(result.stdout);
  writeFileSync(
    `${EVIDENCE_DIR}/${platform}-xcresult-summary.json`,
    `${JSON.stringify(summary, null, 2)}\n`,
    "utf8"
  );
  return summary;
}

function runUITest({ platform, baseURL, identity }) {
  prepareEvidenceDirectory(platform);
  const fixture = Buffer.from(fixtureJSON(baseURL, identity, platform), "utf8").toString("base64url");
  const xcconfigPath = `/tmp/them_studio_instinct_ui_${platform}_${process.pid}.xcconfig`;
  const resultBundlePath = `/tmp/io-them-studio-instinct-${platform}-${process.pid}.xcresult`;
  writeFileSync(
    xcconfigPath,
    `THEM_UITEST_STUDIO_INSTINCT_FIXTURE_BASE64URL = ${fixture}\n`,
    { encoding: "utf8", mode: 0o600 }
  );

  let result;
  try {
    if (platform === "ios") {
      result = spawnSync("bash", [
        "scripts/run_v1_ui_smoke.sh",
        "-quiet",
        "-resultBundlePath",
        resultBundlePath,
      ], {
        cwd: ROOT_DIR,
        encoding: "utf8",
        maxBuffer: 128 * 1024 * 1024,
        env: {
          ...process.env,
          ONLY_TESTING: TEST_IDENTIFIER,
          THEM_UITEST_RESTORE_XCCONFIG_PATH: xcconfigPath,
        },
      });
    } else {
      result = spawnSync("xcodebuild", [
        "-quiet",
        "-xcconfig", xcconfigPath,
        "test",
        "-project", "them.xcodeproj",
        "-scheme", "them-macOS-scaffold",
        "-configuration", "Mac Scaffold Debug",
        "-destination", "platform=macOS",
        `-only-testing:${TEST_IDENTIFIER}`,
        "-resultBundlePath", resultBundlePath,
        "-derivedDataPath", `/tmp/io-them-studio-instinct-${process.pid}-macos`,
        "CODE_SIGN_STYLE=Manual",
        "CODE_SIGN_IDENTITY=-",
        "CODE_SIGN_ENTITLEMENTS=",
        "ENABLE_APP_SANDBOX=NO",
        "REGISTER_APP_GROUPS=NO",
      ], {
        cwd: ROOT_DIR,
        encoding: "utf8",
        maxBuffer: 128 * 1024 * 1024,
        env: process.env,
      });
    }
  } finally {
    if (existsSync(xcconfigPath)) unlinkSync(xcconfigPath);
  }

  const output = sanitizeUITestOutput(
    `${result?.stdout || ""}\n${result?.stderr || ""}`,
    fixture
  );
  exportEvidenceAttachments({ platform, resultBundlePath });
  const summary = readTestSummary({ platform, resultBundlePath });
  if (result?.status !== 0) {
    throw new Error(
      `${platform} Studio instinct UI smoke failed.\nstatus=${result?.status}\n${output}`
    );
  }
  assert(
    Number(summary?.totalTestCount) === 1 &&
      Number(summary?.passedTests) === 1 &&
      Number(summary?.failedTests) === 0 &&
      Number(summary?.skippedTests) === 0,
    `${platform} Studio instinct UI smoke did not execute exactly once: ${JSON.stringify({
      total: summary?.totalTestCount,
      passed: summary?.passedTests,
      failed: summary?.failedTests,
      skipped: summary?.skippedTests,
    })}`
  );
  for (const stage of EVIDENCE_STAGES) {
    for (const extension of ["json", "png"]) {
      const target = `${EVIDENCE_DIR}/${platform}-${stage}.${extension}`;
      assert(existsSync(target), `${platform} Studio instinct UI smoke did not write ${target}.`);
    }
  }
  console.log(`${platform} Studio instinct UI smoke: ok`);
}

let server = null;
try {
  server = await startBackend({
    port: PORT,
    env: {
      APP_TOKEN,
      REQUIRE_USER_AUTH: "1",
      STUDIO_RENDER_TEST_REPLY: "Maybe raise the stakes and trust your instincts.",
    },
  });
  const platforms = PLATFORM === "all" ? ["ios", "macos"] : [PLATFORM];
  for (const platform of platforms) {
    const initialIdentity = await createStudioRestoreOwnerIdentity({
      baseURL: server.baseUrl,
      appToken: APP_TOKEN,
      emailPrefix: `studio-instinct-ui-${platform}`,
    });
    const identity = await refreshClientIdentity(server.baseUrl, initialIdentity);
    await seedProject(server, identity);
    runUITest({
      platform,
      baseURL: server.baseUrl,
      identity,
    });
  }

  console.log(JSON.stringify({
    ok: true,
    platform: PLATFORM,
    projectID: PROJECT_ID,
    preferenceFamily: "reversal_pressure",
    baselineStrongestMove: "reversal_pressure",
    rejectedStrongestMove: "reversal_pressure",
    repairedStrongestMove: "relationship_pressure",
    otherActStrongestMove: "reversal_pressure",
    correctedStrongestMove: "reversal_pressure",
    canonStrongestMove: "payoff_pressure",
    evidenceDirectory: EVIDENCE_DIR,
    evidenceFiles: readdirSync(EVIDENCE_DIR).sort(),
  }, null, 2));
  console.log("studio-instinct-writer-block-ui-smoke: ok");
} catch (error) {
  if (server) {
    const stdout = server.stdout.join("").trim();
    const stderr = server.stderr.join("").trim();
    if (stdout) console.error(`Studio instinct backend stdout:\n${stdout}`);
    if (stderr) console.error(`Studio instinct backend stderr:\n${stderr}`);
  }
  throw error;
} finally {
  if (server) await server.stop();
}
