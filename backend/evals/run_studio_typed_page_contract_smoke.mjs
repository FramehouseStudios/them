import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { startBackend, apiRequest } from "../tests/helpers/backend_test_server.mjs";
import { createStudioDebugDefaultsTransport } from "./studio_eval_debug_utils.mjs";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const BACKEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APP_TOKEN = "them-dev";
const TEST_REPLY = [
  "Absolutely - here's the continuation.",
  "",
  "INT. DINER - NIGHT",
  "",
  "Rain needles the front window.",
  "",
  "MARA",
  "He came back.",
  "",
  "Want me to keep going?",
].join("\n");
const EXPECTED_INSERTED_TEXT = [
  "INT. DINER - NIGHT",
  "",
  "Rain needles the front window.",
  "",
  "MARA",
  "He came back.",
].join("\n");

const defaults = createStudioDebugDefaultsTransport();
const preservedKeys = [
  "app_token",
  "auth_access_token",
  "auth_refresh_token",
  "auth_debug_access_token",
  "auth_debug_access_token_enabled",
  "auth_signed_in",
  "backend_base_url",
  "client_token",
  "client_token_base_url",
  "client_token_cached_at",
  "client_token_expiry",
  "studio_debug_submit_transport_mode",
  "user_id",
];
const originalDefaults = new Map(preservedKeys.map((key) => [key, defaults.readString(key)]));

function writeString(key, value) {
  defaults.writeString(key, String(value || ""));
}

function restoreDefaults() {
  for (const [key, value] of originalDefaults.entries()) {
    writeString(key, value);
  }
}

function normalizeScreenplayText(value) {
  return String(value || "")
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\n")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function extractCmdReturnResult(stdout = "") {
  const lines = String(stdout || "").split(/\r?\n/).reverse();
  const marker = "__STUDIO_CMDRETURN_RESULT__ ";
  const line = lines.find((candidate) => candidate.startsWith(marker));
  assert(line, `Studio cmd-return smoke did not print ${marker.trim()}`);
  try {
    return JSON.parse(line.slice(marker.length));
  } catch (error) {
    throw new Error(`Unable to parse Studio cmd-return result: ${error?.message || error}`);
  }
}

async function createOwnerSession(server) {
  const email = `studio-typed-page-${Date.now()}-${randomUUID()}@example.test`.toLowerCase();
  const password = `ThemTypedPage-${randomUUID()}-aA1!`;
  const signup = await apiRequest(server, "/auth/signup", {
    method: "POST",
    json: {
      email,
      password,
      display_name: "Studio Typed Page Contract",
    },
  });
  assert(
    signup.response.ok,
    `Owner signup failed: ${signup.status} ${JSON.stringify(signup.json)}`
  );
  const accessToken = String(signup.json?.access_token || signup.json?.accessToken || "").trim();
  const refreshToken = String(signup.json?.refresh_token || signup.json?.refreshToken || "").trim();
  const userId = String(
    signup.json?.user?.id ||
    signup.json?.user?.user_id ||
    signup.json?.user?.userId ||
    signup.json?.user_id ||
    signup.json?.userId ||
    ""
  ).trim();
  assert(accessToken, "Owner signup did not return an access token");
  assert(userId, "Owner signup did not return a user id");

  const session = await apiRequest(server, "/session", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    json: {},
  });
  assert(
    session.response.ok,
    `Client session failed: ${session.status} ${JSON.stringify(session.json)}`
  );
  const clientToken = String(session.json?.client_token || session.json?.session_id || "").trim();
  assert(clientToken, "Client session did not return a client token");
  const expiresIn = Math.max(60, Number(session.json?.expires_in || 0) || 0);

  return {
    accessToken,
    refreshToken,
    userId,
    clientToken,
    clientTokenExpiry: new Date(Date.now() + expiresIn * 1000).toISOString(),
  };
}

function writeSessionDefaults(server, session) {
  writeString("app_token", APP_TOKEN);
  writeString("backend_base_url", server.baseUrl);
  writeString("auth_access_token", session.accessToken);
  writeString("auth_refresh_token", session.refreshToken);
  writeString("auth_debug_access_token", session.accessToken);
  writeString("auth_debug_access_token_enabled", "true");
  writeString("auth_signed_in", "true");
  writeString("client_token", session.clientToken);
  writeString("client_token_base_url", server.baseUrl);
  defaults.writeInt("client_token_cached_at", Math.floor(Date.now() / 1000));
  writeString("client_token_expiry", session.clientTokenExpiry);
  writeString("studio_debug_submit_transport_mode", "live-backend");
  writeString("user_id", session.userId);
}

function runCmdReturnSmoke(server) {
  return spawnSync(process.execPath, ["evals/run_studio_cmdreturn_smoke.mjs"], {
    cwd: BACKEND_DIR,
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
    env: {
      ...process.env,
      APP_TOKEN,
      BACKEND_BASE_URL: server.baseUrl,
      BACKEND_URL: server.baseUrl,
      THEM_BASE_URL: server.baseUrl,
      STUDIO_CMDRETURN_FIRST_PROMPT: "Continue the diner scene and write it directly to the page.",
      STUDIO_CMDRETURN_PROJECT_LOAD_TIMEOUT_MS: "45000",
      STUDIO_CMDRETURN_SCENARIO: "page-only",
      STUDIO_CMDRETURN_TRANSPORT: "debug-submit",
    },
  });
}

let server = null;
try {
  server = await startBackend({
    env: {
      APP_TOKEN,
      REQUIRE_USER_AUTH: "0",
      STUDIO_RENDER_TEST_REPLY: TEST_REPLY,
    },
  });
  const session = await createOwnerSession(server);
  writeSessionDefaults(server, session);

  const child = runCmdReturnSmoke(server);
  if (child.status !== 0) {
    throw new Error(
      "Studio typed page contract smoke failed.\n"
      + `status=${child.status}\n`
      + `stdout:\n${child.stdout || ""}\n`
      + `stderr:\n${child.stderr || ""}\n`
      + `backend stdout:\n${server.stdout.join("")}\n`
      + `backend stderr:\n${server.stderr.join("")}`
    );
  }

  const result = extractCmdReturnResult(child.stdout);
  const insertedText = normalizeScreenplayText(
    result?.firstEntry?.insertedText || result?.firstInsertedPreview || ""
  );
  assert(result?.ok === true, "Studio cmd-return smoke result was not ok");
  assert(result?.scenario === "page-only", `Unexpected scenario: ${result?.scenario}`);
  assert(result?.firstSendTransport === "debug-submit", `Unexpected transport: ${result?.firstSendTransport}`);
  assert(String(result?.firstEntry?.target || "").trim().toLowerCase() === "page", "Typed prompt did not target the screenplay page");
  assert(
    insertedText === EXPECTED_INSERTED_TEXT,
    `Typed page contract inserted the wrong text.\nExpected:\n${EXPECTED_INSERTED_TEXT}\nGot:\n${insertedText}`
  );
  assert(!/absolutely/i.test(insertedText), "Typed page contract leaked assistant chat preface");
  assert(!/want me to keep going/i.test(insertedText), "Typed page contract leaked assistant follow-up");

  console.log(JSON.stringify({
    ok: true,
    baseUrl: server.baseUrl,
    appPath: result.appPath,
    projectId: result.throwawayProjectId,
    requestId: result.firstRequestID,
    insertedText,
    transport: result.firstSendTransport,
    target: result.firstEntry?.target || "",
  }, null, 2));
  console.log("studio-typed-page-contract-smoke: ok");
} finally {
  restoreDefaults();
  if (server) {
    await server.stop();
  }
}
