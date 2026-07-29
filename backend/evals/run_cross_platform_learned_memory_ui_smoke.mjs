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
    };
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

function fixtureJSON(baseURL, identity, learned) {
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

function runUITest({ platform, baseURL, identity, learned }) {
  const fixture = Buffer.from(fixtureJSON(baseURL, identity, learned), "utf8").toString("base64url");
  const xcconfigPath = `/tmp/them_learned_memory_ui_${platform}_${process.pid}.xcconfig`;
  writeFileSync(
    xcconfigPath,
    `THEM_UITEST_LEARNED_MEMORY_FIXTURE_BASE64URL = ${fixture}\n`,
    { encoding: "utf8", mode: 0o600 }
  );

  let result;
  try {
    if (platform === "ios") {
      result = spawnSync("bash", ["scripts/run_v1_ui_smoke.sh", "-quiet"], {
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
        "-derivedDataPath", `/tmp/io-them-learned-memory-${process.pid}-macos`,
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
      `${platform} learned-memory UI smoke failed.\nstatus=${result?.status}\n${output}`
    );
  }
  if (/Executed 0 tests/.test(output) || new RegExp(`Test Case .*${TEST_IDENTIFIER.split("/").at(-1)}.* skipped`, "i").test(output)) {
    throw new Error(`${platform} learned-memory UI smoke did not execute.\n${output}`);
  }
  console.log(`${platform} learned-memory UI smoke: ok`);
}

let server = null;
try {
  const backendEnv = {
    APP_TOKEN,
    REQUIRE_USER_AUTH: "1",
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
  const learned = await teachCharacterAnswerFromIPhone(server, iphoneIdentity);

  if (PLATFORM !== "macos") {
    runUITest({
      platform: "ios",
      baseURL: server.baseUrl,
      identity: iphoneIdentity,
      learned,
    });
  }

  let macIdentity = iphoneIdentity;
  let survivedBackendRestart = false;
  if (PLATFORM !== "ios") {
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
    });
  }

  console.log(JSON.stringify({
    ok: true,
    platform: PLATFORM,
    sourceDevice: PLATFORM === "macos" ? "seeded iPhone contract" : "iPhone",
    restoredDevice: PLATFORM === "ios" ? null : "macOS",
    survivedBackendRestart,
    userID: identity.userID,
    character: learned.character,
    field: learned.field,
    value: learned.value,
    questionId: learned.questionId,
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
