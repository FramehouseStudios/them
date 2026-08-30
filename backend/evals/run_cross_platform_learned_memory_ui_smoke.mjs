import { spawnSync } from "node:child_process";
import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  buildCharacterFieldProvenance,
  createCreativeMemoryStore,
} from "../lib/creative_memory_store.js";
import { createPersistence } from "../lib/persistence_adapter.js";
import { startBackend } from "../tests/helpers/backend_test_server.mjs";
import {
  createStudioRestoreOwnerIdentity,
  requestStudioRestoreJSON,
} from "./studio_restore_seed_helper.mjs";

const ROOT_DIR = fileURLToPath(new URL("../..", import.meta.url));
const APP_TOKEN = "them-dev";
const PORT = Number(process.env.THEM_LEARNED_MEMORY_UI_SMOKE_PORT || 31339);
const TEST_IDENTIFIER = "themUITests/V1SmokeUITests/test_cross_platform_learned_answer_appears_after_relaunch";
const PROJECT_ID = "cross-platform-learning";
const PROJECT_TITLE = "Cross-Platform Learning";
const FEATURE_SEQUENCE = "Act II - Promise Of The Premise (p26-p40)";
const WRITER_BLOCK_PROMPT = "I am stuck in the middle. What should happen next?";
const DUE_SETUP = "The red locket inside the courthouse clock";
const DUE_PAYOFF = "Mara uses the red locket to expose the forged verdict";
const ACCEPTED_CANON_PAGE = [
  "INT. CLOCK TOWER - NIGHT",
  "",
  "Mara wedges the red locket behind the courthouse clock's brass face.",
  "",
  "ELI",
  "You are going to tell me where you put it.",
  "",
  "MARA",
  "When telling you stops making you a target.",
].join("\n");
const DERIVED_DATA_PATH = String(
  process.env.THEM_LEARNED_MEMORY_UI_DERIVED_DATA_PATH ||
  "/tmp/io-them-learned-memory-ui-derived"
).trim();
const PLATFORM = String(process.env.THEM_LEARNED_MEMORY_UI_PLATFORM || "all")
  .trim()
  .toLowerCase();

assert(
  ["all", "ios", "macos"].includes(PLATFORM),
  "THEM_LEARNED_MEMORY_UI_PLATFORM must be all, ios, or macos."
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function requireString(value, message) {
  const clean = String(value || "").trim();
  if (!clean) throw new Error(message);
  return clean;
}

async function seedPendingIPhoneQuestion(server, identity) {
  const now = Date.now();
  const memory = {
    turns: 1,
    pendingScreenplayLearningQuestions: [
      {
        id: "iphone-screenplay-learning-character-want",
        projectId: PROJECT_ID,
        projectTitle: PROJECT_TITLE,
        targetField: "character.want",
        targetLabel: "Mara's dramatic want",
        anchor: "Mara",
        question: "What does Mara want enough to risk becoming her father?",
        askedAtTurn: 1,
        expiresAfterTurn: 3,
        askedAt: now,
      },
    ],
  };
  const userRecord = {
    userId: identity.userID,
    updatedAt: now,
    memory,
  };
  writeFileSync(
    server.env.USER_MEMORY_STORE_PATH,
    JSON.stringify({
      version: 3,
      updatedAt: now,
      entries: [],
      users: [userRecord],
    }, null, 2),
    { encoding: "utf8", mode: 0o600 }
  );
  const persistence = createPersistence({
    jsonRoot: server.env.PERSISTENCE_JSON_ROOT,
  });
  try {
    await persistence.put({
      domain: "user_memory",
      key: `byUserId:${identity.userID}`,
      value: userRecord,
    });
  } finally {
    await persistence.close();
  }
}

async function teachCharacterAnswerFromIPhone(server, identity) {
  const answer = "Free Eli without becoming her father.";
  const committed = await requestStudioRestoreJSON({
    baseURL: server.baseUrl,
    path: "/realtime/turn_commit",
    method: "POST",
    headers: {
      "X-APP-TOKEN": identity.appToken,
      "X-CLIENT-TOKEN": identity.clientToken,
      Authorization: `Bearer ${identity.accessToken}`,
      "X-Idempotency-Key": "iphone-screenplay-learning-character-want-answer",
    },
    body: {
      transcript: answer,
      reply: "That gives Mara's want a real moral cost.",
      request_id: "iphone-screenplay-learning-character-want-answer",
      studio: {
        screenplayProjectId: PROJECT_ID,
        screenplayProjectTitle: PROJECT_TITLE,
      },
    },
  });
  assert(
    committed.status === 201,
    `The iPhone realtime turn failed: ${committed.status} ${JSON.stringify(committed.payload)}`
  );
  assert(
    committed.payload?.screenplay_question_resolution?.response_status === "answered",
    "The iPhone realtime answer did not resolve its pending screenplay question."
  );
  assert(
    committed.payload?.screenplay_question_resolution?.learning_promoted === true,
    "The iPhone realtime answer was not promoted."
  );

  const persistence = createPersistence({
    jsonRoot: server.env.PERSISTENCE_JSON_ROOT,
  });
  const store = createCreativeMemoryStore({ persistence });
  try {
    const memory = await store.getCreativeMemoryForPrompt({
      userId: identity.userID,
      projectId: PROJECT_ID,
      projectTitle: PROJECT_TITLE,
      query: "What does Mara want?",
    });
    const character = memory?.characters?.find((item) => item?.name === "Mara");
    const provenance = buildCharacterFieldProvenance(character?.bible)
      .find((item) => item.field === "want");
    assert(provenance, "The promoted iPhone answer has no field provenance.");
    assert(provenance.status === "current", "The fresh answer was not marked current.");
    assert(
      provenance.source === "screenplay_learning_confirmation",
      "The fresh answer lost its learning source."
    );
    return {
      character: "Mara",
      field: "want",
      value: requireString(provenance.value, "The realtime-promoted answer has no value."),
      status: "Current",
      source: "Learned from your answer",
      questionId: provenance.questionId,
      preferenceFamily: "reversal_pressure",
      preferenceLabel: "Reversals",
      preferenceStance: "prefer",
    };
  } finally {
    await persistence.close();
  }
}

async function seedScreenplayProjectFromIPhone(server, identity) {
  const project = await requestStudioRestoreJSON({
    baseURL: server.baseUrl,
    path: "/screenplay/projects",
    method: "POST",
    headers: {
      "X-APP-TOKEN": identity.appToken,
      "X-CLIENT-TOKEN": identity.clientToken,
      Authorization: `Bearer ${identity.accessToken}`,
    },
    body: {
      project_id: PROJECT_ID,
      title: PROJECT_TITLE,
      phase: "scene_draft",
      act_position: "Act II",
      protagonist_want: "get Eli onto the last ferry",
      protagonist_need: "stop using control as a substitute for trust",
      activate: true,
    },
  });
  assert(
    project.response.ok,
    `The iPhone screenplay project seed failed: ${project.status} ${JSON.stringify(project.payload)}`
  );
  assert(
    project.payload?.project_id === PROJECT_ID,
    "The iPhone screenplay project seed returned the wrong project."
  );

  const version = await requestStudioRestoreJSON({
    baseURL: server.baseUrl,
    path: `/screenplay/projects/${PROJECT_ID}/version`,
    method: "POST",
    headers: {
      "X-APP-TOKEN": identity.appToken,
      "X-CLIENT-TOKEN": identity.clientToken,
      Authorization: `Bearer ${identity.accessToken}`,
    },
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
      source: "cross_platform_rescue_handoff_smoke",
      base_version_id: "",
    },
  });
  assert(
    version.response.ok,
    `The cross-platform screenplay version seed failed: ${version.status} ${JSON.stringify(version.payload)}`
  );

  const persistence = createPersistence({ jsonRoot: server.env.PERSISTENCE_JSON_ROOT });
  const store = createCreativeMemoryStore({ persistence });
  try {
    const receipt = await store.recordProjectContinuity({
      userId: identity.userID,
      continuity: {
        projectId: PROJECT_ID,
        projectTitle: PROJECT_TITLE,
        act: "Act II",
        featureSequence: FEATURE_SEQUENCE,
        currentBeat: "Mara cannot decide whether to trust Eli.",
        protagonistWant: "get Eli onto the last ferry",
        protagonistNeed: "stop using control as a substitute for trust",
        characterFocus: ["Mara", "Eli"],
        questionEffectiveness: [],
      },
    });
    assert(receipt?.ok, "The cross-platform rescue continuity seed failed.");
  } finally {
    await persistence.close();
  }
}

async function seedFailedRescueContract(server, identity) {
  const persistence = createPersistence({ jsonRoot: server.env.PERSISTENCE_JSON_ROOT });
  const store = createCreativeMemoryStore({ persistence });
  try {
    const now = Date.now();
    const receipt = await store.recordProjectContinuity({
      userId: identity.userID,
      continuity: {
        projectId: PROJECT_ID,
        projectTitle: PROJECT_TITLE,
        act: "Act II",
        featureSequence: FEATURE_SEQUENCE,
        questionEffectiveness: [{
          questionId: "mac-diagnostic-seeded-failed-rescue",
          targetField: "story.writer_block_rescue",
          targetLabel: "the delivered writer-block rescue",
          question: "Which delivered story move gets the writer moving again?",
          anchor: "reversal_pressure",
          actKey: "act2",
          sequenceKey: "premise",
          writerBlocked: true,
          recommendationOnly: true,
          askedAt: now - 1_000,
          answeredAt: now - 1_000,
          respondedAt: now - 1_000,
          responseStatus: "answered",
          outcome: "rescue_failed",
          selectedMoveFamily: "reversal_pressure",
          offeredMoveFamilies: ["reversal_pressure"],
          rescueFailedAt: now,
          failedRescueCount: 1,
          updatedAt: now,
        }],
      },
    });
    assert(receipt?.ok, "The macOS diagnostic failed-rescue seed did not persist.");
  } finally {
    await persistence.close();
  }
}

async function assertCorrectedRescueSurvived(server, identity) {
  const persistence = createPersistence({ jsonRoot: server.env.PERSISTENCE_JSON_ROOT });
  const store = createCreativeMemoryStore({ persistence });
  try {
    const ledger = await store.getCreativeMemoryLedger({ userId: identity.userID });
    const project = ledger?.projects?.find((item) => item?.projectId === PROJECT_ID);
    assert(project, "The cross-device rescue project disappeared from creative memory.");
    assert(
      project.storyMovePreferenceOverrides?.some((item) => (
        item?.family === "reversal_pressure" && item?.stance === "prefer"
      )),
      "The macOS rescue correction did not survive for the iPhone round trip."
    );
    assert(
      project.questionEffectiveness?.some((item) => (
        item?.selectedMoveFamily === "reversal_pressure" &&
        Number(item?.failedRescueCount || 0) >= 1
      )),
      "The original iPhone failed-rescue evidence was lost after correction."
    );
  } finally {
    await persistence.close();
  }
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
    `Could not refresh the cross-platform client: ${session.status} ${JSON.stringify(session.payload)}`
  );
  const expiresIn = Math.max(60, Number(session.payload?.expires_in || 0));
  return {
    ...identity,
    clientToken: requireString(
      session.payload?.client_token,
      "Refreshed session did not return a client token."
    ),
    clientTokenCachedAt: Math.floor(Date.now() / 1000),
    clientTokenExpiry: new Date(Date.now() + expiresIn * 1000).toISOString(),
  };
}

function fixtureJSON(baseURL, identity, learned, handoffStage) {
  return JSON.stringify({
    baseURL,
    appToken: identity.appToken,
    userID: identity.userID,
    clientToken: identity.clientToken,
    clientTokenCachedAt: identity.clientTokenCachedAt,
    clientTokenExpiry: identity.clientTokenExpiry,
    accessToken: identity.accessToken,
    character: learned.character,
    field: learned.field,
    value: learned.value,
    status: learned.status,
    source: learned.source,
    preferenceFamily: learned.preferenceFamily,
    preferenceLabel: learned.preferenceLabel,
    preferenceStance: learned.preferenceStance,
    projectID: PROJECT_ID,
    projectTitle: PROJECT_TITLE,
    handoffStage,
    featureSequence: FEATURE_SEQUENCE,
    writerBlockPrompt: WRITER_BLOCK_PROMPT,
    baselineStrongestMove: "Ranked strongest move - reversal pressure",
    repairedStrongestMove: "Ranked strongest move - relationship pressure",
    repairMemoryLine: "I remember the last reversal did not get you moving here",
    correctedStrongestMove: "Ranked strongest move - reversal pressure",
    canonStrongestMove: "Ranked strongest move - payoff pressure",
    acceptedCanonPage: ACCEPTED_CANON_PAGE,
    dueSetup: DUE_SETUP,
    duePayoff: DUE_PAYOFF,
  });
}

function sanitizeUITestOutput(output, fixture) {
  return String(output || "")
    .replaceAll(fixture, "<redacted-learned-memory-fixture>")
    .replace(
      /THEM_UITEST_LEARNED_MEMORY_FIXTURE_BASE64URL\s*=\s*[A-Za-z0-9_-]+/g,
      "THEM_UITEST_LEARNED_MEMORY_FIXTURE_BASE64URL = <redacted>"
    );
}

function runUITest({ platform, baseURL, identity, learned, handoffStage }) {
  const fixture = Buffer.from(
    fixtureJSON(baseURL, identity, learned, handoffStage),
    "utf8"
  ).toString("base64url");
  const stageKey = String(handoffStage || "verify").replace(/[^a-z0-9_-]+/gi, "-");
  const xcconfigPath = `/tmp/them_learned_memory_ui_${platform}_${stageKey}_${process.pid}.xcconfig`;
  const resultBundlePath = `/tmp/io-them-learned-memory-${platform}-${stageKey}-${process.pid}.xcresult`;
  writeFileSync(
    xcconfigPath,
    `THEM_UITEST_LEARNED_MEMORY_FIXTURE_BASE64URL = ${fixture}\n`,
    { encoding: "utf8", mode: 0o600 }
  );

  let result;
  try {
    if (platform === "ios") {
      result = spawnSync("bash", [
        "scripts/run_v1_ui_smoke.sh",
        "-quiet",
        "-resultBundlePath", resultBundlePath,
        "-derivedDataPath", DERIVED_DATA_PATH,
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
        "-derivedDataPath", DERIVED_DATA_PATH,
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
  if (result?.status !== 0) {
    throw new Error(
      `${platform} ${handoffStage} learned-memory UI smoke failed.\nstatus=${result?.status}\n${output}`
    );
  }
  if (/Executed 0 tests/.test(output) || new RegExp(`Test Case .*${TEST_IDENTIFIER.split("/").at(-1)}.* skipped`, "i").test(output)) {
    throw new Error(`${platform} ${handoffStage} learned-memory UI smoke did not execute.\n${output}`);
  }
  const summaryResult = spawnSync("xcrun", [
    "xcresulttool", "get", "test-results", "summary", "--path", resultBundlePath,
  ], {
    cwd: ROOT_DIR,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  assert(
    summaryResult.status === 0,
    `${platform} ${handoffStage} result summary failed: ${summaryResult.stderr || summaryResult.stdout}`
  );
  const summary = JSON.parse(summaryResult.stdout);
  assert(
    Number(summary?.totalTestCount) === 1 &&
      Number(summary?.passedTests) === 1 &&
      Number(summary?.failedTests) === 0 &&
      Number(summary?.skippedTests) === 0,
    `${platform} ${handoffStage} did not execute exactly once: ${JSON.stringify({
      total: summary?.totalTestCount,
      passed: summary?.passedTests,
      failed: summary?.failedTests,
      skipped: summary?.skippedTests,
    })}`
  );
  console.log(`${platform} ${handoffStage} learned-memory UI smoke: ok`);
}

let server = null;
try {
  const backendEnv = {
    APP_TOKEN,
    REQUIRE_USER_AUTH: "1",
    STUDIO_RENDER_TEST_REPLY: "Maybe raise the stakes and trust your instincts.",
  };
  server = await startBackend({ port: PORT, env: backendEnv });
  const identity = await createStudioRestoreOwnerIdentity({
    baseURL: server.baseUrl,
    appToken: APP_TOKEN,
    emailPrefix: "learned-memory-ui",
  });
  const dataDir = server.dataDir;
  const initialServer = server;
  await server.stop();
  server = null;
  await seedPendingIPhoneQuestion(initialServer, identity);
  server = await startBackend({ port: PORT, dataDir, env: backendEnv });
  const iphoneIdentity = await refreshClientIdentity(server.baseUrl, identity);
  await seedScreenplayProjectFromIPhone(server, iphoneIdentity);
  const learned = await teachCharacterAnswerFromIPhone(server, iphoneIdentity);

  if (PLATFORM === "ios" || PLATFORM === "all") {
    runUITest({
      platform: "ios",
      baseURL: server.baseUrl,
      identity: iphoneIdentity,
      learned,
      handoffStage: "iphone_source",
    });
  }

  let macIdentity = iphoneIdentity;
  let survivedBackendRestart = false;
  if (PLATFORM === "macos" || PLATFORM === "all") {
    if (PLATFORM === "macos") {
      await seedFailedRescueContract(server, iphoneIdentity);
    }
    await server.stop();
    server = null;
    server = await startBackend({ port: PORT, dataDir, env: backendEnv });
    macIdentity = await refreshClientIdentity(server.baseUrl, iphoneIdentity);
    survivedBackendRestart = true;

    runUITest({
      platform: "macos",
      baseURL: server.baseUrl,
      identity: macIdentity,
      learned,
      handoffStage: "mac_repair",
    });
    await assertCorrectedRescueSurvived(server, macIdentity);
  }

  let roundTripIdentity = macIdentity;
  if (PLATFORM === "all") {
    await server.stop();
    server = null;
    server = await startBackend({ port: PORT, dataDir, env: backendEnv });
    roundTripIdentity = await refreshClientIdentity(server.baseUrl, macIdentity);
    runUITest({
      platform: "ios",
      baseURL: server.baseUrl,
      identity: roundTripIdentity,
      learned,
      handoffStage: "iphone_round_trip",
    });
    await assertCorrectedRescueSurvived(server, roundTripIdentity);
  }

  console.log(JSON.stringify({
    ok: true,
    platform: PLATFORM,
    sourceDevice: PLATFORM === "macos" ? "seeded iPhone diagnostic contract" : "iPhone",
    restoredDevice: PLATFORM === "ios" ? null : "macOS and iPhone",
    survivedBackendRestart,
    handoffStages: PLATFORM === "all"
      ? ["iphone_source", "mac_repair", "iphone_round_trip"]
      : [PLATFORM === "ios" ? "iphone_source" : "mac_repair"],
    userID: identity.userID,
    character: learned.character,
    field: learned.field,
    value: learned.value,
    questionId: learned.questionId,
    failedRescueFamily: "reversal_pressure",
    repairedRescueFamily: "relationship_pressure",
    correctedRescueFamily: learned.preferenceFamily,
    canonRescueFamily: "payoff_pressure",
  }, null, 2));
  console.log("cross-platform-learned-memory-ui-smoke: ok");
} catch (error) {
  if (server) {
    const stdout = server.stdout.join("").trim();
    const stderr = server.stderr.join("").trim();
    if (stdout) console.error(`learned-memory backend stdout:\n${stdout}`);
    if (stderr) console.error(`learned-memory backend stderr:\n${stderr}`);
  }
  throw error;
} finally {
  if (server) await server.stop();
}
