import { existsSync } from "node:fs";
import http from "node:http";
import { fileURLToPath } from "node:url";
import {
  assertInteractionLifecycle,
  createStudioEvalDebugContext,
  ensureStudioProjectLoadedWithDebugHook,
  ensureStudioVisibleWithOpenHandshake,
  runCommand,
  runOptionalCommand,
  sleepMs,
  waitForCondition,
} from "./studio_eval_debug_utils.mjs";

const studioAppSessionHelperPath = fileURLToPath(new URL("./studio_app_session_helper.sh", import.meta.url));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function run(command, args, options = {}) {
  return runCommand(command, args, options);
}

function runOptional(command, args, options = {}) {
  return runOptionalCommand(command, args, options);
}

const debugContext = createStudioEvalDebugContext({ run, runOptional });
const debugDefaults = debugContext.defaults;

function osascript(lines) {
  const args = [];
  for (const line of lines) args.push("-e", line);
  return run("osascript", args);
}

async function waitFor(predicate, description, timeoutMs = 20000, intervalMs = 250) {
  await waitForCondition(predicate, description, timeoutMs, intervalMs);
}

async function readHealth() {
  return await new Promise((resolve, reject) => {
    const req = http.get("http://127.0.0.1:3000/health", (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on("error", reject);
    req.setTimeout(4000, () => req.destroy(new Error("health request timed out")));
  });
}

function readDefaultString(key) {
  return debugDefaults.readString(key);
}

function readDefaultInt(key) {
  return debugDefaults.readInt(key);
}

function readDefaultBool(key, fallback = false) {
  return debugDefaults.readBool(key, fallback);
}

function writeDefaultString(key, value) {
  debugDefaults.writeString(key, value);
}

function writeDefaultInt(key, value) {
  debugDefaults.writeInt(key, value);
}

function writeDefaultBool(key, value) {
  debugDefaults.writeBool(key, Boolean(value));
}

function setLocalBackendDefaults() {
  writeDefaultString("backend_base_url", "http://127.0.0.1:3000");
  writeDefaultString("client_token_base_url", "http://127.0.0.1:3000");
  shouldRestoreAuthDefaults = true;
}

const originalAuthDefaults = {
  userId: readDefaultString("user_id"),
  clientToken: readDefaultString("client_token"),
  debugAccessToken: readDefaultString("auth_debug_access_token"),
  debugAccessTokenEnabled: readDefaultBool("auth_debug_access_token_enabled", false),
  authSignedIn: readDefaultBool("auth_signed_in", false),
  authUserEmail: readDefaultString("auth_user_email"),
  backendBaseURL: readDefaultString("backend_base_url"),
  clientTokenBaseURL: readDefaultString("client_token_base_url"),
};
let shouldRestoreAuthDefaults = false;

function restoreAuthDefaults() {
  if (!shouldRestoreAuthDefaults) return;
  shouldRestoreAuthDefaults = false;
  writeDefaultString("user_id", originalAuthDefaults.userId);
  writeDefaultString("client_token", originalAuthDefaults.clientToken);
  writeDefaultString("auth_debug_access_token", originalAuthDefaults.debugAccessToken);
  writeDefaultBool("auth_debug_access_token_enabled", originalAuthDefaults.debugAccessTokenEnabled);
  writeDefaultBool("auth_signed_in", originalAuthDefaults.authSignedIn);
  writeDefaultString("auth_user_email", originalAuthDefaults.authUserEmail);
  writeDefaultString("backend_base_url", originalAuthDefaults.backendBaseURL);
  writeDefaultString("client_token_base_url", originalAuthDefaults.clientTokenBaseURL);
}

process.on("exit", restoreAuthDefaults);

async function requestJson(path, options = {}) {
  const response = await fetch(`http://127.0.0.1:3000${path}`, options);
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

async function signupSmokeUser(email, password = "studio-prompt-modes-password-123") {
  const { response, payload } = await requestJson("/auth/signup", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-APP-TOKEN": "them-dev",
    },
    body: JSON.stringify({ email, password }),
  });
  assert(response.status === 201 || response.ok, `Failed to signup Studio smoke user: ${response.status} ${JSON.stringify(payload)}`);
  const token = String(payload?.access_token || payload?.token || "").trim();
  const userId = String(payload?.user?.user_id || payload?.user_id || "").trim();
  assert(token, "Studio smoke signup did not return an access token");
  assert(userId, "Studio smoke signup did not return a user_id");
  return { token, userId };
}

async function bootstrapSmokeIdentity() {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const identity = await signupSmokeUser(`studio-prompt-modes-${stamp}@example.com`);
  const session = await requestJson("/session", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${identity.token}`,
      "X-APP-TOKEN": "them-dev",
    },
  });
  assert(session.response.status === 201, `Failed to bootstrap Studio smoke session: ${session.response.status} ${JSON.stringify(session.payload)}`);
  const clientToken = String(session.payload?.client_token || session.payload?.session_id || "").trim();
  assert(clientToken, "Studio smoke session did not return a client token");

  writeDefaultString("user_id", identity.userId);
  writeDefaultString("client_token", clientToken);
  writeDefaultString("auth_debug_access_token", identity.token);
  writeDefaultBool("auth_debug_access_token_enabled", true);
  writeDefaultBool("auth_signed_in", true);
  writeDefaultString("auth_user_email", `studio-prompt-modes-${stamp}@example.com`);
  shouldRestoreAuthDefaults = true;
  return { ...identity, clientToken };
}

function ownerHeaders() {
  const headers = {
    "Content-Type": "application/json",
    "X-APP-TOKEN": "them-dev",
  };
  const accessToken = readDefaultString("auth_debug_access_token");
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }
  const userId = readDefaultString("user_id");
  if (userId) {
    headers["X-User-Id"] = userId;
  }
  const clientToken = readDefaultString("client_token");
  assert(clientToken, "Missing owner identity in io.them.them defaults");
  headers["X-Client-Token"] = clientToken;
  return headers;
}

async function createThrowawayStudioProject() {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const projectId = `studio-mode-separation-${stamp}`;
  const title = `Studio Mode Separation ${stamp}`;
  const response = await fetch("http://127.0.0.1:3000/screenplay/projects", {
    method: "POST",
    headers: ownerHeaders(),
    body: JSON.stringify({
      project_id: projectId,
      title,
      phase: "scene_draft",
      activate: true,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Failed to create throwaway Studio project: ${response.status} ${JSON.stringify(payload)}`);
  }
  return { projectId, title };
}

function findDebugAppPath() {
  const direct = process.env.THEM_APP_PATH?.trim();
  if (direct && existsSync(direct)) return direct;
  const discovered = run("/bin/zsh", [
    "-lc",
    `
for config in "Mac Scaffold Debug" "Debug"; do
  candidate="$(
    find ~/Library/Developer/Xcode/DerivedData -path "*/Build/Products/\${config}/them.app/Contents/MacOS/them" -exec stat -f '%m %N' {} \\; \
      | awk '$0 !~ /\\/them_MAIN-/' \
      | sort -nr \
      | head -n 1 \
      | cut -d' ' -f2- \
      | sed 's#/Contents/MacOS/them$##'
  )"
  if [[ -n "$candidate" ]]; then
    printf '%s\\n' "$candidate"
    exit 0
  fi
done
`,
  ]);
  assert(discovered, "Could not locate Debug them.app");
  assert(existsSync(discovered), `Debug app path does not exist: ${discovered}`);
  return discovered;
}

function appHasWindow() {
  const output = osascript([
    "try",
    'tell application "System Events"',
    'tell process "them"',
    "return count of windows",
    "end tell",
    "end tell",
    "on error",
    'return "0"',
    "end try",
  ]);
  return Number(output) > 0;
}

function activateApp() {
  osascript(['tell application "them" to activate']);
}

function appIsRunning() {
  const result = runOptional("pgrep", ["-x", "them"]);
  return result.status === 0 && Boolean(result.stdout.trim());
}

function quitApp() {
  runOptional("osascript", ["-e", "try", "-e", 'tell application "them" to quit', "-e", "end try"], {
    timeout: 2000,
  });
  runOptional("killall", ["them"], {
    timeout: 2000,
  });
}

async function ensureAppStopped() {
  if (!appIsRunning()) return;
  quitApp();
  await waitFor(() => !appIsRunning(), "THEM process to quit before prompt-mode smoke", 15000, 300);
}

function normalizeKey(value) {
  return String(value || "").trim().toLowerCase();
}

function readDebugDiffState() {
  return debugDefaults.readJSON("studio_debug_diff_state_json", null);
}

function readStudioAskNoteHistoryMap() {
  return debugDefaults.readJSON("studio.ask.note.history.v2", {}) || {};
}

function readStudioSubmitResultPayload(token = 0) {
  const tokenKey = Number(token) > 0 ? `studio_debug_submit_result_json_${Number(token)}` : "";
  if (tokenKey) {
    const tokenPayload = debugDefaults.readJSON(tokenKey, null);
    if (tokenPayload) return tokenPayload;
  }
  return debugDefaults.readJSON("studio_debug_submit_result_json", null);
}

function resetSubmitDebugDefaults() {
  writeDefaultInt("studio_debug_submit_token", 0);
  writeDefaultInt("studio_debug_submit_command_received_token", 0);
  writeDefaultString("studio_debug_submit_text", "");
  writeDefaultString("studio_debug_submit_routing", "automatic");
  writeDefaultString("studio_debug_submit_replacement_mode", "none");
  writeDefaultInt("studio_debug_submit_ack_token", 0);
  writeDefaultString("studio_debug_submit_ack_text", "");
  writeDefaultString("studio_debug_submit_ack_routing", "");
  writeDefaultString("studio_debug_submit_ack_replacement_mode", "");
  writeDefaultString("studio_debug_submit_ack_request_id", "");
  writeDefaultInt("studio_debug_submit_result_token", 0);
  writeDefaultString("studio_debug_submit_result_status", "");
  writeDefaultString("studio_debug_submit_result_error", "");
  writeDefaultString("studio_debug_submit_result_json", "");
  writeDefaultString("studio_debug_submit_stage", "");
  writeDefaultInt("studio_debug_submit_stage_token", 0);
  writeDefaultString("studio_debug_submit_stage_error", "");
  writeDefaultString("studio_debug_root_submit_stage", "");
  writeDefaultString("studio_debug_root_submit_prompt", "");
  writeDefaultString("studio_debug_root_submit_request_id", "");
  writeDefaultString("studio_debug_root_submit_error", "");
}

function resetProjectLoadDebugDefaults() {
  writeDefaultString("studio_debug_load_project_id", "");
  writeDefaultString("studio_debug_load_project_version_id", "");
  writeDefaultString("studio_debug_project_load_trace_json", "[]");
  writeDefaultInt("studio_debug_load_project_token", 0);
  writeDefaultInt("studio_debug_load_project_ack_token", 0);
}

function readPromptBuildState() {
  return {
    intent: readDefaultString("studio_debug_last_screenplay_task_intent"),
    label: readDefaultString("studio_debug_last_screenplay_task_label"),
    usedBackendAssembly: readDefaultString("studio_debug_last_prompt_backend_assembly") === "1",
    fallbackReason: readDefaultString("studio_debug_last_prompt_fallback_reason"),
  };
}

function readSubmitDebugState() {
  return {
    submitStage: readDefaultString("studio_debug_submit_stage"),
    submitStageToken: readDefaultInt("studio_debug_submit_stage_token"),
    submitStageError: readDefaultString("studio_debug_submit_stage_error"),
    rootSubmitStage: readDefaultString("studio_debug_root_submit_stage"),
    rootSubmitPrompt: readDefaultString("studio_debug_root_submit_prompt"),
    rootSubmitRequestID: readDefaultString("studio_debug_root_submit_request_id"),
    rootSubmitError: readDefaultString("studio_debug_root_submit_error"),
    resultToken: readDefaultInt("studio_debug_submit_result_token"),
    resultStatus: readDefaultString("studio_debug_submit_result_status"),
    resultError: readDefaultString("studio_debug_submit_result_error"),
    promptBuild: readPromptBuildState(),
  };
}

function formatSubmitDebugState() {
  return JSON.stringify(readSubmitDebugState());
}

function recentThreadEntriesForProject(projectKey, limit = 8) {
  const map = readStudioAskNoteHistoryMap();
  const preferredEntries = Array.isArray(map[projectKey]) ? map[projectKey] : [];
  const fallbackEntries = Object.entries(map).flatMap(([key, value]) => {
    if (key === projectKey || !Array.isArray(value)) return [];
    return value;
  });
  const entries = [...preferredEntries, ...fallbackEntries];
  return entries
    .slice()
    .sort((a, b) => (Date.parse(String(b?.timestamp || "")) || 0) - (Date.parse(String(a?.timestamp || "")) || 0))
    .slice(0, limit);
}

let debugTokenCounter = Math.max(
  1,
  readDefaultInt("studio_debug_open_token"),
  readDefaultInt("studio_debug_prepare_token"),
  readDefaultInt("studio_debug_prepare_ack_token"),
  readDefaultInt("studio_debug_submit_token"),
  readDefaultInt("studio_debug_submit_command_received_token"),
  readDefaultInt("studio_debug_submit_ack_token")
);

function nextDebugToken() {
  debugTokenCounter += 1;
  return debugTokenCounter;
}

async function waitForStudioOpenAck(token) {
  await waitFor(() => readDefaultInt("studio_debug_open_ack_token") === token, `Studio open ack ${token}`, 15000, 150);
}

async function ensureStudioVisible(appPath) {
  let openState;
  try {
    openState = await ensureStudioVisibleWithOpenHandshake({
      appPath,
      helperPath: studioAppSessionHelperPath,
      debugDefaults,
      runOptional,
      activateApp: () => activateApp(),
      appHasWindow,
      readDebugDiffState,
      timeoutSeconds: Number(process.env.STUDIO_APP_SESSION_TIMEOUT_SECONDS || 20),
      pollMillis: Number(process.env.STUDIO_APP_SESSION_POLL_MILLIS || 250),
      startupTimeoutMs: Number(process.env.STUDIO_APP_STARTUP_TIMEOUT_MS || 45000),
      ackTimeoutMs: Number(process.env.STUDIO_APP_OPEN_ACK_TIMEOUT_MS || 20000),
      maxAttempts: Number(process.env.STUDIO_APP_OPEN_MAX_ATTEMPTS || 5),
    });
  } catch (error) {
    await waitFor(
      () => appIsRunning() && (Boolean(readDebugDiffState()) || appHasWindow()),
      "degraded visible THEM window or Studio diff state after open",
      Number(process.env.STUDIO_APP_DEGRADED_OPEN_TIMEOUT_MS || 30000),
      250
    ).catch(() => {
      throw error;
    });
    openState = {
      token: readDefaultInt("studio_debug_open_ack_token"),
      degradedOpenHandshake: true,
      appSession: { helperStatus: "degraded_open_fallback" },
    };
  }
  assertInteractionLifecycle({
    action: "studio_debug_open",
    actionReceived: true,
    payload: { status: "handled", error: "" },
    stateAfter: Boolean(readDebugDiffState()) || appHasWindow(),
    stateLabel: "diff_state_or_window_available",
    extra: {
      token: openState.token,
      degraded_open_handshake: Boolean(openState?.degradedOpenHandshake),
    },
  });
  return openState.appSession;
}

async function waitForSubmittedPrompt(token, prompt, routingMode, replacementMode, timeoutMs = 20000) {
  let requestID = "";
  let ackToken = 0;
  let fallbackMatched = false;
  await waitFor(() => {
    ackToken = readDefaultInt("studio_debug_submit_ack_token");
    const ackText = readDefaultString("studio_debug_submit_ack_text");
    const ackRouting = readDefaultString("studio_debug_submit_ack_routing");
    const ackReplacementMode = readDefaultString("studio_debug_submit_ack_replacement_mode") || "none";
    requestID = readDefaultString("studio_debug_submit_ack_request_id");
    const directMatch = ackToken === token
      && ackText === prompt
      && ackRouting === routingMode
      && ackReplacementMode === replacementMode
      && Boolean(String(requestID || "").trim());
    if (directMatch) return true;
    const historyMap = readStudioAskNoteHistoryMap();
    for (const entries of Object.values(historyMap)) {
      if (!Array.isArray(entries)) continue;
      const match = entries.find((candidate) => String(candidate?.prompt || "").trim() === String(prompt || "").trim());
      if (!match) continue;
      const candidateRequestID = String(match.requestID || "").trim();
      if (!candidateRequestID) continue;
      requestID = candidateRequestID;
      fallbackMatched = true;
      return true;
    }
    return false;
  }, `Studio prompt submit ack for: ${prompt}`, timeoutMs, 250);
  assertInteractionLifecycle({
    action: "studio_debug_submit_ack",
    actionReceived: ackToken === token || fallbackMatched,
    payload: { status: "handled", error: "" },
    stateAfter: Boolean(String(requestID || "").trim()),
    stateLabel: "submit_request_id_present",
    extra: {
      token,
      prompt,
      routingMode,
      replacementMode,
      requestID,
    },
  });
  return String(requestID || "").trim();
}

async function waitForSubmittedPromptCommandReceived(token, prompt, timeoutMs = 15000) {
  let commandReceivedToken = 0;
  await waitFor(() => {
    commandReceivedToken = readDefaultInt("studio_debug_submit_command_received_token");
    return commandReceivedToken === token;
  }, `Studio prompt command-received for: ${prompt}`, timeoutMs, 200);
  assertInteractionLifecycle({
    action: "studio_debug_submit_command_received",
    actionReceived: commandReceivedToken === token,
    payload: { status: "handled", error: "" },
    stateAfter: commandReceivedToken === token,
    stateLabel: "submit_command_received_token_matches",
    extra: {
      token,
      prompt,
      commandReceivedToken,
    },
  });
}

async function waitForSubmittedPromptResult(token, prompt, timeoutMs = 20000) {
  let status = "";
  let errorText = "";
  let resultToken = 0;
  await waitFor(() => {
    resultToken = readDefaultInt("studio_debug_submit_result_token");
    if (resultToken !== token) return false;
    status = readDefaultString("studio_debug_submit_result_status").toLowerCase();
    errorText = readDefaultString("studio_debug_submit_result_error");
    return status === "ok" || status === "error";
  }, `Studio prompt submit result for: ${prompt}`, timeoutMs, 250);
  assertInteractionLifecycle({
    action: "studio_debug_submit_result",
    actionReceived: resultToken === token,
    payload: { status, error: errorText },
    stateAfter: status === "ok" || status === "error",
    stateLabel: "submit_result_status_present",
    extra: { token, prompt },
  });
  return { status, errorText };
}

async function waitForLatestThreadEntry(projectKey, requestID, prompt, token = 0, timeoutMs = 25000) {
  let latestEntry = null;
  const matchingLatestDebugStatePayload = () => {
    const state = readDebugDiffState() || {};
    const sameToken = Number(token) > 0 && Number(state.submitAckToken || 0) === Number(token);
    const cleanRequestID = String(requestID || "").trim().toLowerCase();
    const sameRequest = cleanRequestID.length > 0 &&
      String(state.latestThreadRequestID || "").trim().toLowerCase() === cleanRequestID;
    const samePrompt = String(state.latestThreadPrompt || "").trim() === String(prompt || "").trim();
    if (!sameToken && !sameRequest && !samePrompt) return null;
    const outputValue = normalizeKey(state.latestThreadOutputValue || state.footerOutputValue || "");
    const target = outputValue === "page" ? "page" : "voicePin";
    const insertedText = String(state.latestThreadInsertedPreview || "").trim();
    if (target === "page" && insertedText.length === 0) return null;
    return {
      requestID: state.latestThreadRequestID || requestID || "",
      prompt: state.latestThreadPrompt || prompt || "",
      target,
      insertedText,
      developmentText: target === "page" ? "" : String(state.latestThreadInsertedPreview || "").trim(),
      noteTitle: target === "page" ? "Wrote to page" : "io.them Voice Pin",
    };
  };
  const matchingSubmitResultPayload = () => {
    const payload = readStudioSubmitResultPayload(token);
    const sameToken = Number(token) > 0 && Number(payload?.token || 0) === Number(token);
    const cleanRequestID = String(requestID || "").trim().toLowerCase();
    const sameRequest = cleanRequestID.length > 0 &&
      String(payload?.requestID || "").trim().toLowerCase() === cleanRequestID;
    const samePrompt = String(payload?.prompt || "").trim() === String(prompt || "").trim();
    const status = String(payload?.status || "").trim().toLowerCase();
    if (!payload || status !== "ok") return null;
    const payloadTarget = normalizeKey(payload?.target || "");
    const payloadInserted = String(payload?.insertedText || "").trim();
    if (payloadTarget === "page" && payloadInserted.length === 0) return null;
    if (sameToken || sameRequest) return payload;
    return Number(token) <= 0 && samePrompt ? payload : null;
  };
  await waitFor(() => {
    const entries = recentThreadEntriesForProject(projectKey, 10);
    const entry = entries.find((candidate) => {
      const sameRequest = String(candidate?.requestID || "").trim().toLowerCase() === String(requestID || "").trim().toLowerCase();
      const samePrompt = String(candidate?.prompt || "").trim() === String(prompt || "").trim();
      return sameRequest || samePrompt;
    });
    if (!entry) return false;
    latestEntry = entry;
    return true;
  }, `latest Studio thread entry for: ${prompt}`, 1200, 150).catch(() => {});
  if (latestEntry) return latestEntry;
  const submitPayload = matchingSubmitResultPayload();
  if (submitPayload) return submitPayload;
  const debugPayload = matchingLatestDebugStatePayload();
  if (debugPayload) return debugPayload;
  await waitFor(() => {
    const entries = recentThreadEntriesForProject(projectKey, 10);
    const entry = entries.find((candidate) => {
      const sameRequest = String(candidate?.requestID || "").trim().toLowerCase() === String(requestID || "").trim().toLowerCase();
      const samePrompt = String(candidate?.prompt || "").trim() === String(prompt || "").trim();
      return sameRequest || samePrompt;
    });
    if (entry) {
      latestEntry = entry;
      return true;
    }
    const payload = matchingSubmitResultPayload();
    if (payload) {
      latestEntry = payload;
      return true;
    }
    const debugStatePayload = matchingLatestDebugStatePayload();
    if (debugStatePayload) {
      latestEntry = debugStatePayload;
      return true;
    }
    return false;
  }, `latest Studio thread entry for: ${prompt}`, timeoutMs, 300).catch(() => {
    const payload = matchingSubmitResultPayload();
    if (payload) {
      latestEntry = payload;
      return;
    }
    const debugStatePayload = matchingLatestDebugStatePayload();
    if (!debugStatePayload) {
      throw new Error(`Timed out waiting for latest Studio thread entry for: ${prompt}`);
    }
    latestEntry = debugStatePayload;
  });
  return latestEntry;
}

async function sendStudioPrompt(prompt, routingMode, projectKey) {
  const token = nextDebugToken();
  resetSubmitDebugDefaults();
  writeDefaultString("studio_debug_last_screenplay_task_intent", "");
  writeDefaultString("studio_debug_last_screenplay_task_label", "");
  writeDefaultString("studio_debug_last_prompt_backend_assembly", "");
  writeDefaultString("studio_debug_last_prompt_fallback_reason", "");
  writeDefaultString("studio_debug_submit_text", prompt);
  writeDefaultString("studio_debug_submit_routing", routingMode);
  writeDefaultString("studio_debug_submit_replacement_mode", "none");
  writeDefaultString(`studio_debug_submit_result_json_${token}`, "");
  writeDefaultInt("studio_debug_submit_token", token);
  await waitForSubmittedPromptCommandReceived(token, prompt, 45000);
  const requestID = await waitForSubmittedPrompt(token, prompt, routingMode, "none");
  let submitResult;
  try {
    submitResult = await waitForSubmittedPromptResult(token, prompt, 140000);
  } catch (error) {
    throw new Error(`${error.message}; submit debug=${formatSubmitDebugState()}`);
  }
  if (submitResult.status === "error") {
    throw new Error(
      `Studio debug-submit failed for "${prompt}": ${submitResult.errorText || "Unknown error"}; submit debug=${formatSubmitDebugState()}`
    );
  }
  const entry = await waitForLatestThreadEntry(projectKey, requestID, prompt, token, 45000).catch((error) => {
    throw new Error(`${error.message}; submit debug=${formatSubmitDebugState()}`);
  });
  const promptBuild = readPromptBuildState();
  return { token, requestID, submitResult, entry, promptBuild };
}

function isFountainLikeReply(text) {
  const raw = String(text || "").trim();
  if (!raw) return false;
  const lines = raw.split(/\n+/).map((x) => x.trim()).filter(Boolean);
  if (!lines.length) return false;
  const hasSlug = lines.some((line) => /^(?:FADE IN ON:|FADE IN:|INT\. |EXT\. )/.test(line));
  const hasTransition = lines.some((line) => /^(?:CUT TO:|DISSOLVE TO:|SMASH CUT TO:|SMASH TO BLACK:|THE END)$/.test(line));
  const hasCharacterCue = lines.some((line, idx) =>
    /^[A-Z0-9 .'\-()]+$/.test(line)
      && /[A-Z]/.test(line)
      && line === line.toUpperCase()
      && !/^(?:INT\.|EXT\.|FADE IN:|FADE IN ON:|CUT TO:|DISSOLVE TO:|SMASH CUT TO:|SMASH TO BLACK:|THE END)$/.test(line)
      && idx < lines.length - 1
      && !/^[A-Z0-9 .'\-()]+$/.test(lines[idx + 1] || "")
  );
  return hasSlug || hasTransition || hasCharacterCue;
}

const COACHING_PATTERNS = [
  /\bTIGHT SYNOPSIS\b/i,
  /\bDEVELOPMENT MOVES\b/i,
  /\bSTORY ENGINE\b/i,
  /\bwhat do you think\??/i,
  /\bif you want(?:,?\s+I can| me to|,?\s+we can| to try| to go)\b/i,
  /\bto deepen (?:the|this|your|her|his|their|its) (?:scene|story|character|moment|conflict|arc|relationship|theme|emotion|tension)\b/i,
  /\byou could\b/i,
  /\bconsider (?:replacing|making|cutting|adding|turning|moving|starting|ending|letting|having|using|trying)\b/i,
  /\boutline\s*:/i,
  /\bbeats\s*:/i,
  /\bWHAT'?S NOT LANDING\b/i,
  /\bHIGHEST[- ]LEVERAGE FIX\b/i,
];

function containsCoachingLanguage(text) {
  const source = String(text || "").trim();
  if (!source) return false;
  return COACHING_PATTERNS.some((pattern) => pattern.test(source));
}

function assertPromptIntent(probe, expectedIntent, label) {
  const state = probe?.promptBuild || {};
  assert(state.usedBackendAssembly === true, `${label} did not use backend prompt assembly`);
  assert(
    String(state.intent || "") === expectedIntent,
    `${label} expected screenplay task intent ${expectedIntent}, saw ${state.intent || "empty"}`
  );
  assert(!String(state.fallbackReason || "").trim(), `${label} prompt assembly fallback: ${state.fallbackReason}`);
}

const advicePrompt = String(
  process.env.STUDIO_MODE_ADVICE_PROMPT
  || "What if she calls him from the parking lot instead?"
).trim();
const companionPrompt = String(
  process.env.STUDIO_MODE_COMPANION_PROMPT
  || "I am spiraling a little and need you to reassure me for a second."
).trim();
const mixedPrompt = String(
  process.env.STUDIO_MODE_MIXED_PROMPT
  || "I am stuck on the midpoint of this script. Talk me through what the scene needs."
).trim();
const pagePrompt = String(
  process.env.STUDIO_MODE_PAGE_PROMPT
  || "Write a longer scene and really play out the full sequence where she finally confronts her father in the kitchen."
).trim();
const rewritePrompt = String(
  process.env.STUDIO_MODE_REWRITE_PROMPT
  || "Replace that line with something sharper."
).trim();
const continuePrompt = String(
  process.env.STUDIO_MODE_CONTINUE_PROMPT
  || "Keep writing from here without restarting the scene."
).trim();
const sceneDoctorPrompt = String(
  process.env.STUDIO_MODE_SCENE_DOCTOR_PROMPT
  || "Scene doctor this kitchen confrontation and tell me what's not working."
).trim();
const dialoguePunchupPrompt = String(
  process.env.STUDIO_MODE_DIALOGUE_PUNCHUP_PROMPT
  || "Punch up this exchange so it has more subtext."
).trim();

assert(advicePrompt, "Missing advice prompt");
assert(companionPrompt, "Missing companion prompt");
assert(mixedPrompt, "Missing mixed prompt");
assert(pagePrompt, "Missing page prompt");
assert(rewritePrompt, "Missing rewrite prompt");
assert(continuePrompt, "Missing continue prompt");
assert(sceneDoctorPrompt, "Missing scene doctor prompt");
assert(dialoguePunchupPrompt, "Missing dialogue punch-up prompt");

const promptModeTransport = String(process.env.STUDIO_PROMPT_MODE_TRANSPORT || "").trim().toLowerCase();
if (promptModeTransport === "stub") {
  const appPath = findDebugAppPath();
  const appSession = await ensureStudioVisible(appPath);
  const state = readDebugDiffState() || {};
  const result = {
    ok: true,
    mode: "stub",
    appPath,
    appSession,
    projectKey: String(state.projectKey || "").trim(),
    selectedProjectID: String(state.selectedProjectID || "").trim(),
  };
  console.log(JSON.stringify(result, null, 2));
  console.log(`__STUDIO_PROMPT_MODE_RESULT__ ${JSON.stringify(result)}`);
  console.log("studio-prompt-mode-separation-smoke: ok");
  process.exit(0);
}

writeDefaultString("studio_debug_submit_transport_mode", "backend");

const beforeHealth = await readHealth();
assert(beforeHealth?.ok === true, "Backend health is not OK on localhost:3000");
setLocalBackendDefaults();
const smokeIdentity = await bootstrapSmokeIdentity();
const throwawayProject = await createThrowawayStudioProject();
const expectedProjectKey = normalizeKey(`project:${throwawayProject.projectId}`);
resetSubmitDebugDefaults();
resetProjectLoadDebugDefaults();
await ensureAppStopped();
const appPath = findDebugAppPath();
const appSession = await ensureStudioVisible(appPath);

const loadedProjectResult = await ensureStudioProjectLoadedWithDebugHook({
  debugDefaults,
  projectId: throwawayProject.projectId,
  readDebugDiffState,
  timeoutMs: 45000,
  intervalMs: 250,
});
let loadedProjectState = loadedProjectResult.state;

const projectKey = String(loadedProjectState?.projectKey || expectedProjectKey).trim();
const selectedProjectID = String(loadedProjectState?.selectedProjectID || "").trim();
const projectSelectionMatchedExpected = normalizeKey(projectKey) === expectedProjectKey
  || selectedProjectID === throwawayProject.projectId;

const adviceProbe = await sendStudioPrompt(advicePrompt, "automatic", projectKey);
const adviceEntry = adviceProbe.entry || {};
const adviceBody = String(adviceEntry.developmentText || adviceEntry.noteBody || "").trim();
const adviceInserted = String(adviceEntry.insertedText || "").trim();
const adviceMemoryDomain = readDefaultString("studio_debug_last_memory_domain");

assert(normalizeKey(adviceEntry.target) === "voicepin", "Advice smoke did not land on Voice Pin");
assert(adviceBody.length > 0, "Advice smoke did not persist a development reply");
assert(adviceInserted.length === 0, "Advice smoke unexpectedly wrote text to the page");
assert(!isFountainLikeReply(adviceBody), "Advice smoke emitted Fountain-like output");
assert(adviceMemoryDomain === "project", `Advice smoke expected project memory domain, saw ${adviceMemoryDomain || "empty"}`);

const companionProbe = await sendStudioPrompt(companionPrompt, "automatic", projectKey);
const companionEntry = companionProbe.entry || {};
const companionBody = String(companionEntry.developmentText || companionEntry.noteBody || "").trim();
const companionInserted = String(companionEntry.insertedText || "").trim();
const companionMemoryDomain = readDefaultString("studio_debug_last_memory_domain");

assert(normalizeKey(companionEntry.target) === "voicepin", "Companion smoke did not land on Voice Pin");
assert(companionBody.length > 0, "Companion smoke did not persist a supportive reply");
assert(companionInserted.length === 0, "Companion smoke unexpectedly wrote text to the page");
assert(companionMemoryDomain === "companion", `Companion smoke expected companion memory domain, saw ${companionMemoryDomain || "empty"}`);
assert(!/writing on the page|page mode/i.test(companionBody), "Companion smoke leaked page-mode shell copy into the supportive lane");

const mixedProbe = await sendStudioPrompt(mixedPrompt, "automatic", projectKey);
const mixedEntry = mixedProbe.entry || {};
const mixedBody = String(mixedEntry.developmentText || mixedEntry.noteBody || "").trim();
const mixedInserted = String(mixedEntry.insertedText || "").trim();
const mixedMemoryDomain = readDefaultString("studio_debug_last_memory_domain");

assert(normalizeKey(mixedEntry.target) === "voicepin", "Mixed smoke did not land on Voice Pin");
assert(mixedBody.length > 0, "Mixed smoke did not persist a development reply");
assert(mixedInserted.length === 0, "Mixed smoke unexpectedly wrote text to the page");
assert(mixedMemoryDomain === "mixed", `Mixed smoke expected mixed memory domain, saw ${mixedMemoryDomain || "empty"}`);

const pageProbe = await sendStudioPrompt(pagePrompt, "automatic", projectKey);
const pageEntry = pageProbe.entry || {};
const pageInserted = String(pageEntry.insertedText || "").trim();
const pageDevelopment = String(pageEntry.developmentText || "").trim();
const pageMemoryDomain = readDefaultString("studio_debug_last_memory_domain");

assert(normalizeKey(pageEntry.target) === "page", "Page-write smoke did not land on the page");
assert(pageInserted.length > 0, "Page-write smoke did not persist inserted page text");
assert(pageDevelopment.length === 0, "Page-write smoke unexpectedly persisted development text");
assert(!containsCoachingLanguage(pageInserted), "Page-write smoke leaked coaching language into the page output");
assert(pageMemoryDomain === "project", `Page smoke expected project memory domain, saw ${pageMemoryDomain || "empty"}`);

const rewriteProbe = await sendStudioPrompt(rewritePrompt, "automatic", projectKey);
const rewriteEntry = rewriteProbe.entry || {};
const rewriteInserted = String(rewriteEntry.insertedText || "").trim();
const rewriteDevelopment = String(rewriteEntry.developmentText || "").trim();
assertPromptIntent(rewriteProbe, "rewrite_scene", "Rewrite smoke");
assert(normalizeKey(rewriteEntry.target) === "page", "Rewrite smoke did not land on the page");
assert(rewriteInserted.length > 0, "Rewrite smoke did not persist inserted page text");
assert(rewriteDevelopment.length === 0, "Rewrite smoke unexpectedly persisted development text");

const continueProbe = await sendStudioPrompt(continuePrompt, "automatic", projectKey);
const continueEntry = continueProbe.entry || {};
const continueInserted = String(continueEntry.insertedText || "").trim();
const continueDevelopment = String(continueEntry.developmentText || "").trim();
assertPromptIntent(continueProbe, "continue_script", "Continue smoke");
assert(normalizeKey(continueEntry.target) === "page", "Continue smoke did not land on the page");
assert(continueInserted.length > 0, "Continue smoke did not persist inserted page text");
assert(continueDevelopment.length === 0, "Continue smoke unexpectedly persisted development text");

const sceneDoctorProbe = await sendStudioPrompt(sceneDoctorPrompt, "automatic", projectKey);
const sceneDoctorEntry = sceneDoctorProbe.entry || {};
const sceneDoctorBody = String(sceneDoctorEntry.developmentText || sceneDoctorEntry.noteBody || "").trim();
const sceneDoctorInserted = String(sceneDoctorEntry.insertedText || "").trim();
assertPromptIntent(sceneDoctorProbe, "scene_doctor", "Scene-doctor smoke");
assert(normalizeKey(sceneDoctorEntry.target) === "voicepin", "Scene-doctor smoke did not land on Voice Pin");
assert(sceneDoctorBody.length > 0, "Scene-doctor smoke did not persist development text");
assert(sceneDoctorInserted.length === 0, "Scene-doctor smoke unexpectedly wrote text to the page");
assert(!/page mode|write directly into the draft|say yes, write that/i.test(sceneDoctorBody), "Scene-doctor smoke persisted page-mode shell copy instead of feedback");

const dialoguePunchupProbe = await sendStudioPrompt(dialoguePunchupPrompt, "automatic", projectKey);
const dialoguePunchupEntry = dialoguePunchupProbe.entry || {};
const dialoguePunchupInserted = String(dialoguePunchupEntry.insertedText || "").trim();
const dialoguePunchupDevelopment = String(dialoguePunchupEntry.developmentText || "").trim();
assertPromptIntent(dialoguePunchupProbe, "dialogue_punchup", "Dialogue punch-up smoke");
assert(normalizeKey(dialoguePunchupEntry.target) === "page", "Dialogue punch-up smoke did not land on the page");
assert(dialoguePunchupInserted.length > 0, "Dialogue punch-up smoke did not persist inserted page text");
assert(dialoguePunchupDevelopment.length === 0, "Dialogue punch-up smoke unexpectedly persisted development text");
assert(!containsCoachingLanguage(dialoguePunchupInserted), "Dialogue punch-up smoke leaked coaching language into the page output");

const result = {
  ok: true,
  throwawayProjectId: throwawayProject.projectId,
  throwawayProjectTitle: throwawayProject.title,
  appPath,
  appSession,
  projectKey,
  selectedProjectID,
  expectedProjectKey,
  projectSelectionMatchedExpected,
  userId: smokeIdentity.userId,
  advice: {
    prompt: advicePrompt,
    requestID: adviceProbe.requestID,
    memoryDomain: adviceMemoryDomain,
    target: adviceEntry.target || "",
    noteTitle: adviceEntry.noteTitle || "",
    noteBodyPreview: String(adviceEntry.noteBody || "").trim().slice(0, 180),
    developmentPreview: adviceBody.slice(0, 220),
    insertedTextLength: adviceInserted.length,
    fountainLike: isFountainLikeReply(adviceBody),
  },
  companion: {
    prompt: companionPrompt,
    requestID: companionProbe.requestID,
    memoryDomain: companionMemoryDomain,
    target: companionEntry.target || "",
    noteTitle: companionEntry.noteTitle || "",
    noteBodyPreview: String(companionEntry.noteBody || "").trim().slice(0, 180),
    developmentPreview: companionBody.slice(0, 220),
    insertedTextLength: companionInserted.length,
  },
  mixed: {
    prompt: mixedPrompt,
    requestID: mixedProbe.requestID,
    memoryDomain: mixedMemoryDomain,
    target: mixedEntry.target || "",
    noteTitle: mixedEntry.noteTitle || "",
    noteBodyPreview: String(mixedEntry.noteBody || "").trim().slice(0, 180),
    developmentPreview: mixedBody.slice(0, 220),
    insertedTextLength: mixedInserted.length,
  },
  pageWrite: {
    prompt: pagePrompt,
    requestID: pageProbe.requestID,
    memoryDomain: pageMemoryDomain,
    target: pageEntry.target || "",
    noteTitle: pageEntry.noteTitle || "",
    insertedPreview: pageInserted.slice(0, 220),
    insertedTextLength: pageInserted.length,
    developmentTextLength: pageDevelopment.length,
    coachingLeak: containsCoachingLanguage(pageInserted),
  },
  rewrite: {
    prompt: rewritePrompt,
    requestID: rewriteProbe.requestID,
    promptBuild: rewriteProbe.promptBuild,
    target: rewriteEntry.target || "",
    insertedPreview: rewriteInserted.slice(0, 220),
    insertedTextLength: rewriteInserted.length,
    developmentTextLength: rewriteDevelopment.length,
  },
  continueScript: {
    prompt: continuePrompt,
    requestID: continueProbe.requestID,
    promptBuild: continueProbe.promptBuild,
    target: continueEntry.target || "",
    insertedPreview: continueInserted.slice(0, 220),
    insertedTextLength: continueInserted.length,
    developmentTextLength: continueDevelopment.length,
  },
  sceneDoctor: {
    prompt: sceneDoctorPrompt,
    requestID: sceneDoctorProbe.requestID,
    promptBuild: sceneDoctorProbe.promptBuild,
    target: sceneDoctorEntry.target || "",
    noteTitle: sceneDoctorEntry.noteTitle || "",
    developmentPreview: sceneDoctorBody.slice(0, 220),
    insertedTextLength: sceneDoctorInserted.length,
  },
  dialoguePunchup: {
    prompt: dialoguePunchupPrompt,
    requestID: dialoguePunchupProbe.requestID,
    promptBuild: dialoguePunchupProbe.promptBuild,
    target: dialoguePunchupEntry.target || "",
    insertedPreview: dialoguePunchupInserted.slice(0, 220),
    insertedTextLength: dialoguePunchupInserted.length,
    developmentTextLength: dialoguePunchupDevelopment.length,
  },
};

console.log(JSON.stringify(result, null, 2));
console.log(`__STUDIO_PROMPT_MODE_RESULT__ ${JSON.stringify(result)}`);
console.log("studio-prompt-mode-separation-smoke: ok");
