import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import http from "node:http";
import { fileURLToPath } from "node:url";
import {
  assertInteractionLifecycle,
  createStudioDebugDefaultsTransport,
  defaultStudioSessionTelemetry,
  relaunchStudioAppWithHelper,
  waitForCondition,
} from "./studio_eval_debug_utils.mjs";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    ...options,
  });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `${command} failed`).trim());
  }
  return (result.stdout || "").trim();
}

function runOptional(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    ...options,
  });
  return {
    status: result.status ?? 1,
    stdout: (result.stdout || "").trim(),
    stderr: (result.stderr || "").trim(),
  };
}

const studioAppSessionHelperPath = fileURLToPath(new URL("./studio_app_session_helper.sh", import.meta.url));
const studioDebugDefaults = createStudioDebugDefaultsTransport({ run, runOptional });

function osascript(lines) {
  const args = [];
  for (const line of lines) {
    args.push("-e", line);
  }
  return run("osascript", args);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    req.setTimeout(4000, () => {
      req.destroy(new Error("health request timed out"));
    });
  });
}

async function createThrowawayStudioProject() {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const projectId = `studio-cmdreturn-${stamp}`;
  const title = `Studio Cmd-Return Smoke ${stamp}`;
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
  return {
    projectId,
    title,
  };
}

function findDebugAppPath() {
  const direct = process.env.THEM_APP_PATH?.trim();
  if (direct && existsSync(direct)) return direct;

  const discovered = run("/bin/zsh", [
    "-lc",
    "find ~/Library/Developer/Xcode/DerivedData -path '*Build/Products/Debug/them.app/Contents/MacOS/them' -exec stat -f '%m %N' {} \\; | sort -nr | head -n 1 | cut -d' ' -f2- | sed 's#/Contents/MacOS/them$##'",
  ]);
  assert(discovered, "Could not locate Debug them.app");
  assert(existsSync(discovered), `Debug app path does not exist: ${discovered}`);
  return discovered;
}

function appHasWindow() {
  const output = osascript([
    'try',
    'tell application "System Events"',
    'tell process "them"',
    'if visible is true then return "1"',
    'return count of windows',
    'end tell',
    'end tell',
    'on error',
    'return "0"',
    'end try',
  ]);
  return Number(output) > 0;
}

function activateApp(appPath = "") {
  if (!appIsRunning() && appPath) {
    runOptional("open", ["-na", appPath]);
  }
  const appleScript = runOptional("osascript", ["-e", 'tell application "them" to activate']);
  if (appleScript.status === 0) return;
  const message = `${appleScript.stderr}\n${appleScript.stdout}`;
  if (/timed out|Connection is invalid|\(-609\)/i.test(message)) {
    if (appPath) {
      runOptional("open", ["-na", appPath]);
    }
    return;
  }
  throw new Error(message.trim() || 'unable to activate "them"');
}

function appIsRunning() {
  const result = runOptional("pgrep", ["-x", "them"]);
  return result.status === 0 && Boolean(result.stdout.trim());
}

function currentAppPids() {
  const result = runOptional("pgrep", ["-x", "them"]);
  if (result.status !== 0 || !result.stdout.trim()) return [];
  return result.stdout
    .split(/\s+/)
    .filter(Boolean)
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0);
}

function samePidSet(left, right) {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort((a, b) => a - b);
  const sortedRight = [...right].sort((a, b) => a - b);
  return sortedLeft.every((value, index) => value === sortedRight[index]);
}

function defaultSmokeSessionTelemetry() {
  return defaultStudioSessionTelemetry();
}

function parsePidList(raw) {
  return String(raw || "")
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value > 0);
}

function parseBoolFlag(raw) {
  const normalized = String(raw || "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function parseStudioAppSessionHelperOutput(stdout = "") {
  const telemetry = defaultSmokeSessionTelemetry();
  for (const line of String(stdout || "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    switch (key) {
      case "OK":
        telemetry.helperStatus = parseBoolFlag(value) ? "ok" : "error";
        break;
      case "STALE_PIDS":
        telemetry.stalePidSet = parsePidList(value);
        telemetry.hadExistingSession = telemetry.stalePidSet.length > 0;
        break;
      case "RELAUNCHED_PIDS":
        telemetry.relaunchedPidSet = parsePidList(value);
        break;
      case "REUSED_EXISTING_SESSION":
        telemetry.reusedExistingSession = parseBoolFlag(value);
        break;
      case "LAST_TEARDOWN_STAGE":
        telemetry.lastTeardownStage = value || telemetry.lastTeardownStage;
        break;
      case "FRESH_PID": {
        const parsed = Number(value);
        telemetry.freshPid = Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
        break;
      }
      case "HAD_EXISTING_SESSION":
        telemetry.hadExistingSession = parseBoolFlag(value);
        break;
      case "SESSION_MODE":
        telemetry.sessionMode = value || telemetry.sessionMode;
        break;
      case "ERROR_MESSAGE":
        telemetry.helperError = value;
        break;
      default:
        break;
    }
  }
  return telemetry;
}

function relaunchAppWithHelper(appPath) {
  return relaunchStudioAppWithHelper({
    helperPath: studioAppSessionHelperPath,
    appPath,
    timeoutSeconds: readEnvInt("STUDIO_APP_SESSION_TIMEOUT_SECONDS", 20),
    pollMillis: readEnvInt("STUDIO_APP_SESSION_POLL_MILLIS", 250),
    runOptional,
  });
}

function killExistingAppProcesses() {
  const result = runOptional("pgrep", ["-x", "them"]);
  if (result.status !== 0 || !result.stdout.trim()) return;
  const pids = result.stdout.split(/\s+/).filter(Boolean);
  for (const pid of pids) {
    runOptional("kill", [pid]);
  }
  const stubborn = runOptional("pgrep", ["-x", "them"]);
  if (stubborn.status === 0 && stubborn.stdout.trim()) {
    for (const pid of stubborn.stdout.split(/\s+/).filter(Boolean)) {
      runOptional("kill", ["-9", pid]);
    }
  }
}

function launchApp(appPath) {
  run("open", ["-na", appPath]);
}

function quitApp() {
  runOptional("osascript", ["-e", 'try', "-e", 'tell application \"them\" to quit', "-e", 'end try']);
}

async function waitFor(predicate, description, timeoutMs = 20000, intervalMs = 250) {
  await waitForCondition(predicate, description, timeoutMs, intervalMs);
}

function sendCmdReturn() {
  osascript([
    'tell application "them" to activate',
    'delay 0.35',
    'tell application "System Events"',
    'tell process "them" to set frontmost to true',
    'delay 0.1',
    'keystroke return using {command down}',
    'end tell',
  ]);
}

function writeDefaultString(key, value) {
  studioDebugDefaults.writeString(key, value);
}

function writeDefaultInt(key, value) {
  studioDebugDefaults.writeInt(key, value);
}

function writeDefaultBool(key, value) {
  studioDebugDefaults.writeBool(key, value);
}

function readDefaultString(key) {
  return studioDebugDefaults.readString(key);
}

function readDefaultInt(key) {
  return studioDebugDefaults.readInt(key);
}

function readDefaultBool(key, fallback = false) {
  const raw = readDefaultString(key).toLowerCase();
  if (!raw) return fallback;
  return raw === "1" || raw === "true" || raw === "yes";
}

function studioDebugVoiceTurnTraceKey(token) {
  return `studio_debug_voice_draft_trace_json_${token}`;
}

function studioDebugVoiceTurnResultKey(token) {
  return `studio_debug_voice_turn_result_json_${token}`;
}

function readStudioVoiceSnapshotPayload({
  token,
  resultRaw = "",
  traceRaw = "",
  status = "",
  errorText = "",
  resultToken = 0,
} = {}) {
  let breadcrumbs = [];
  try {
    const decoded = traceRaw ? JSON.parse(traceRaw) : [];
    breadcrumbs = Array.isArray(decoded) ? decoded : [];
  } catch {
    breadcrumbs = [];
  }

  let parsed = null;
  try {
    parsed = resultRaw ? JSON.parse(resultRaw) : null;
  } catch {
    parsed = null;
  }

  if (parsed && Number(parsed?.token || 0) !== Number(token || 0) && breadcrumbs.length > 0) {
    parsed = null;
  }

  if (parsed && breadcrumbs.length > 0) {
    const firstDetail = (eventName) => {
      const match = breadcrumbs.find((entry) => String(entry?.event || "") === eventName);
      return match ? String(match.detail || "") : "";
    };
    const extractRequestId = (detail) => {
      const match = String(detail || "").match(/request_id=([A-Za-z0-9._:-]+)/i);
      return match ? String(match[1] || "").trim() : "";
    };
    const extractMilliseconds = (detail) => {
      const match = String(detail || "").match(/(\d+)ms/i);
      return match ? Number(match[1]) : null;
    };
    const firstTimestamp = (eventName) => {
      const match = breadcrumbs.find((entry) => String(entry?.event || "") === eventName);
      return match ? String(match.timestampISO8601 || "") : "";
    };
    const renderMetaDetail = firstDetail("render_stream_meta_received");
    const renderFirstDeltaDetail = firstDetail("render_stream_first_delta_server");
    const renderDoneDetail = firstDetail("render_stream_done_server");
    parsed = {
      ...parsed,
      breadcrumbs,
      renderRequestID: parsed.renderRequestID || extractRequestId(renderMetaDetail) || extractRequestId(renderFirstDeltaDetail) || extractRequestId(renderDoneDetail),
      renderServerFirstDeltaMs: parsed.renderServerFirstDeltaMs ?? extractMilliseconds(renderFirstDeltaDetail),
      renderServerTotalMs: parsed.renderServerTotalMs ?? extractMilliseconds(renderDoneDetail),
      debugTurnStartedAtISO8601: parsed.debugTurnStartedAtISO8601 || firstTimestamp("debug_turn_started"),
      debugTurnFinalizingAtISO8601: parsed.debugTurnFinalizingAtISO8601 || firstTimestamp("debug_turn_finalizing"),
      debugTurnResultPersistedAtISO8601: parsed.debugTurnResultPersistedAtISO8601 || firstTimestamp("debug_turn_result_persisted"),
      headerTextReadyAtISO8601: parsed.headerTextReadyAtISO8601 || firstTimestamp("header_text_ready"),
      headerTextCommittedAtISO8601: parsed.headerTextCommittedAtISO8601 || firstTimestamp("header_text_committed"),
      talkRequestStartedAtISO8601: parsed.talkRequestStartedAtISO8601 || firstTimestamp("talk_request_started"),
      talkResponseReceivedAtISO8601: parsed.talkResponseReceivedAtISO8601 || firstTimestamp("talk_response_received"),
    };
  }

  if ((resultToken === token || breadcrumbs.length > 0) && !parsed) {
    const firstDetail = (eventName) => {
      const match = breadcrumbs.find((entry) => String(entry?.event || "") === eventName);
      return match ? String(match.detail || "") : "";
    };
    const extractRequestId = (detail) => {
      const match = String(detail || "").match(/request_id=([A-Za-z0-9._:-]+)/i);
      return match ? String(match[1] || "").trim() : "";
    };
    const extractMilliseconds = (detail) => {
      const match = String(detail || "").match(/(\d+)ms/i);
      return match ? Number(match[1]) : null;
    };
    const firstTimestamp = (eventName) => {
      const match = breadcrumbs.find((entry) => String(entry?.event || "") === eventName);
      return match ? String(match.timestampISO8601 || "") : "";
    };
    const renderMetaDetail = firstDetail("render_stream_meta_received");
    const renderFirstDeltaDetail = firstDetail("render_stream_first_delta_server");
    const renderDoneDetail = firstDetail("render_stream_done_server");
    parsed = {
      token,
      status,
      error: errorText,
      renderRequestID: extractRequestId(renderMetaDetail) || extractRequestId(renderFirstDeltaDetail) || extractRequestId(renderDoneDetail),
      renderServerFirstDeltaMs: extractMilliseconds(renderFirstDeltaDetail),
      renderServerTotalMs: extractMilliseconds(renderDoneDetail),
      headerTextReadyAtISO8601: firstTimestamp("header_text_ready"),
      headerTextCommittedAtISO8601: firstTimestamp("header_text_committed"),
      debugTurnStartedAtISO8601: firstTimestamp("debug_turn_started"),
      debugTurnFinalizingAtISO8601: firstTimestamp("debug_turn_finalizing"),
      debugTurnResultPersistedAtISO8601: firstTimestamp("debug_turn_result_persisted"),
      draftStartedAtISO8601: firstTimestamp("request_started"),
      commitAtISO8601: firstTimestamp("request_committed"),
      renderPartialAtISO8601: firstTimestamp("render_partial_received"),
      playbackStartedAtISO8601: firstTimestamp("assistant_playback_started"),
      playbackFinishedAtISO8601: firstTimestamp("assistant_playback_finished"),
      talkRequestStartedAtISO8601: firstTimestamp("talk_request_started"),
      talkResponseReceivedAtISO8601: firstTimestamp("talk_response_received"),
      draftStartedBeforePlaybackFinished: false,
      committedWhileAssistantSpeaking: false,
      breadcrumbs,
    };
  }

  return {
    status,
    errorText,
    result: parsed,
    breadcrumbs,
    resultToken,
  };
}

function studioVoiceSnapshotMatchesToken(snapshot, token) {
  const snapshotToken = Number(snapshot?.result?.token || snapshot?.resultToken || 0);
  return snapshotToken === Number(token || 0);
}

function studioVoiceSnapshotHasCommittedBreadcrumb(snapshot) {
  const breadcrumbs = Array.isArray(snapshot?.breadcrumbs) ? snapshot.breadcrumbs : [];
  return breadcrumbs.some((entry) => String(entry?.event || "") === "request_committed");
}

function studioVoiceSnapshotScore(snapshot, token) {
  if (!snapshot) return -1;
  const breadcrumbs = Array.isArray(snapshot?.breadcrumbs) ? snapshot.breadcrumbs : [];
  const result = snapshot?.result || null;
  let score = 0;
  if (studioVoiceSnapshotMatchesToken(snapshot, token)) score += 50;
  if (result) score += 20;
  score += Math.min(breadcrumbs.length, 20);
  if (studioVoiceSnapshotHasCommittedBreadcrumb(snapshot)) score += 25;
  if (String(result?.insertedPreview || "").trim()) score += 12;
  if (String(result?.commitAtISO8601 || "").trim()) score += 12;
  if (String(result?.headerTextCommittedAtISO8601 || "").trim()) score += 8;
  return score;
}

function ownerHeaders() {
  const headers = {
    "Content-Type": "application/json",
    "X-APP-TOKEN": "them-dev",
  };
  const userId = readDefaultString("user_id");
  if (userId) {
    headers["X-User-Id"] = userId;
  }
  const clientToken = readDefaultString("client_token");
  if (clientToken) {
    headers["X-Client-Token"] = clientToken;
  }
  assert(headers["X-User-Id"] || headers["X-Client-Token"], "Missing owner identity in io.them.them defaults");
  return headers;
}

async function fetchTalkTurnMeta(turnId) {
  const cleanTurnId = String(turnId || "").trim();
  assert(cleanTurnId, "fetchTalkTurnMeta requires a turn id");
  const headers = ownerHeaders();
  delete headers["Content-Type"];
  const response = await fetch(`http://127.0.0.1:3000/talk/turn/${encodeURIComponent(cleanTurnId)}`, {
    method: "GET",
    headers,
  });
  if (response.status === 404) return null;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Failed to read talk turn meta for ${cleanTurnId}: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function waitForTalkTurnMeta(turnId, timeoutMs = 15000) {
  let payload = null;
  await waitFor(async () => {
    payload = await fetchTalkTurnMeta(turnId);
    return Boolean(payload);
  }, `talk turn meta for ${turnId}`, timeoutMs, 300);
  return payload;
}

function readDebugDiffState() {
  const raw = readDefaultString("studio_debug_diff_state_json");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function readStudioAskNoteHistoryMap() {
  const raw = readDefaultString("studio.ask.note.history.v2");
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function readFullThreadBrowseStateMap() {
  const raw = readDefaultString("studio.full.thread.state.v1");
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function readReplacementTraceEvents() {
  const raw = readDefaultString("studio_debug_replacement_trace_json");
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function latestThreadEntryForProject(projectKey) {
  const map = readStudioAskNoteHistoryMap();
  const entries = Array.isArray(map[projectKey]) ? map[projectKey] : [];
  return entries[0] || null;
}

function recentThreadEntriesForProject(projectKey, limit = 5) {
  const map = readStudioAskNoteHistoryMap();
  const entries = Array.isArray(map[projectKey]) ? map[projectKey] : [];
  return entries.slice(0, limit);
}

function fullThreadBrowseStateForProject(projectKey) {
  const map = readFullThreadBrowseStateMap();
  const state = map && typeof map === "object" ? map[projectKey] : null;
  return state && typeof state === "object" ? state : null;
}

function normalizeKey(value) {
  return String(value || "").trim().toLowerCase();
}

async function waitForReplacementTargetArmed(prompt, timeoutMs = 10000) {
  let latestState = null;
  await waitFor(() => {
    const state = readDebugDiffState();
    if (!state) return false;
    latestState = state;
    const hasTarget = Boolean(state.hasPendingReplacementTarget || state.hasSubmittedReplacementTarget);
    const hasWrite = Boolean(
      String(state.pendingReplacementWriteID || "").trim()
      || String(state.submittedReplacementWriteID || "").trim()
    );
    return hasTarget && hasWrite;
  }, `replacement target armed for: ${prompt}`, timeoutMs, 250);
  return latestState;
}

function normalizeTurnNumber(turnId) {
  const digits = String(turnId || "").replace(/\D+/g, "");
  return digits ? Number(digits) : 0;
}

async function readHealthSafe() {
  try {
    return await readHealth();
  } catch {
    return null;
  }
}

function readEnvString(name, fallback = "") {
  const value = String(process.env[name] || "").trim();
  return value || fallback;
}

function readEnvInt(name, fallback = 0) {
  const raw = readEnvString(name, "");
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readEnvBool(name, fallback = false) {
  const raw = readEnvString(name, "").toLowerCase();
  if (!raw) return fallback;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

let debugTokenCounter = Math.max(
  1,
  readDefaultInt("studio_debug_open_token"),
  readDefaultInt("studio_debug_prepare_token"),
  readDefaultInt("studio_debug_prepare_ack_token"),
  readDefaultInt("studio_debug_submit_token"),
  readDefaultInt("studio_debug_submit_ack_token"),
  readDefaultInt("studio_debug_voice_turn_token"),
  readDefaultInt("studio_debug_voice_turn_result_token"),
  readDefaultInt("studio_debug_acknowledge_diff_token"),
  readDefaultInt("studio_debug_acknowledge_diff_ack_token")
);

function nextDebugToken() {
  debugTokenCounter += 1;
  return debugTokenCounter;
}

async function waitForStudioOpenAck(token) {
  await waitFor(() => {
    return readDefaultInt("studio_debug_open_ack_token") === token || readDebugDiffState() !== null;
  }, `Studio open ack or diff state for token ${token}`, 15000, 150);
}

async function waitForStudioVoiceTurnAck(token) {
  let commandReceivedToken = 0;
  let ackToken = 0;
  let resultToken = 0;
  let snapshotEvents = [];
  let snapshotStatus = "";
  try {
    await waitFor(() => {
      commandReceivedToken = readDefaultInt("studio_debug_voice_turn_command_received_token");
      ackToken = readDefaultInt("studio_debug_voice_turn_ack_token");
      resultToken = readDefaultInt("studio_debug_voice_turn_result_token");
      if (commandReceivedToken !== token) return false;
      if (ackToken !== token) return false;
      const snapshot = readStudioVoiceTurnDebugSnapshot(token);
      snapshotStatus = String(snapshot?.result?.status || snapshot?.status || "").trim().toLowerCase();
      snapshotEvents = Array.isArray(snapshot?.breadcrumbs)
        ? snapshot.breadcrumbs.map((entry) => String(entry?.event || ""))
        : [];
      return snapshotEvents.includes("debug_turn_acknowledged")
        || snapshotEvents.includes("debug_turn_started")
        || (Number(snapshot?.result?.token || 0) === token && snapshotStatus === "running");
    }, `Studio voice-turn ack for token ${token}`, 15000, 150);
  } catch (error) {
    assertInteractionLifecycle({
      action: "studio_debug_voice_turn_ack",
      actionReceived: commandReceivedToken === token,
      payload: {
        status: snapshotStatus || (ackToken === token ? "handled" : "error"),
        error: "voice_turn_ack_timeout",
      },
      stateAfter: ackToken === token,
      stateLabel: "voice_turn_ack_token_matches",
      extra: {
        token,
        command_received_token: commandReceivedToken,
        ack_token: ackToken,
        result_token: resultToken,
        breadcrumb_events: snapshotEvents,
      },
      cause: error,
    });
  }
}

async function waitForStudioVoiceTurnCommandReceived(token) {
  let commandReceivedToken = 0;
  try {
    await waitFor(() => {
      commandReceivedToken = readDefaultInt("studio_debug_voice_turn_command_received_token");
      return commandReceivedToken === token;
    }, `Studio voice-turn command receipt for token ${token}`, 30000, 150);
  } catch (error) {
    assertInteractionLifecycle({
      action: "studio_debug_voice_turn_command_received",
      actionReceived: commandReceivedToken === token,
      payload: {
        status: commandReceivedToken === token ? "handled" : "error",
        error: "voice_turn_command_received_timeout",
      },
      stateAfter: commandReceivedToken === token,
      stateLabel: "voice_turn_command_received_token_matches",
      extra: {
        token,
        command_received_token: commandReceivedToken,
      },
      cause: error,
    });
  }
}

async function ensureStudioVisible() {
  activateApp();
  await waitFor(() => appHasWindow(), "visible THEM window before Studio open", 20000, 300);
  let lastError = null;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const token = nextDebugToken();
    writeDefaultInt("studio_debug_open_ack_token", 0);
    writeDefaultInt("studio_debug_open_token", token);
    try {
      await waitForStudioOpenAck(token);
      await sleep(1200);
      activateApp();
      await waitFor(() => appHasWindow(), "visible THEM window after Studio open");
      assertInteractionLifecycle({
        action: "studio_debug_open",
        actionReceived: readDefaultInt("studio_debug_open_ack_token") === token || readDebugDiffState() !== null,
        payload: { status: "handled", error: "" },
        stateAfter: Boolean(readDebugDiffState()),
        stateLabel: "diff_state_available",
        extra: {
          token,
          open_token: readDefaultInt("studio_debug_open_token"),
          open_ack_token: readDefaultInt("studio_debug_open_ack_token"),
        },
      });
      return;
    } catch (error) {
      lastError = error;
      await sleep(900);
      activateApp();
      runOptional("open", ["-na", appPath]);
      await waitFor(
        () => appHasWindow(),
        `visible THEM window before Studio open retry ${attempt}`,
        20000,
        300
      );
    }
  }
  throw lastError || new Error("Studio open ack never arrived");
}

function resetStudioDebugHandshakeDefaults() {
  writeDefaultInt("studio_debug_open_token", 0);
  writeDefaultInt("studio_debug_open_ack_token", 0);
  writeDefaultInt("studio_debug_voice_turn_token", 0);
  writeDefaultInt("studio_debug_voice_turn_command_received_token", 0);
  writeDefaultInt("studio_debug_voice_turn_ack_token", 0);
  writeDefaultInt("studio_debug_voice_turn_result_token", 0);
  writeDefaultString("studio_debug_voice_turn_result_status", "");
  writeDefaultString("studio_debug_voice_turn_result_error", "");
  writeDefaultString("studio_debug_voice_turn_result_json", "");
  writeDefaultString("studio_debug_voice_draft_trace_json", "[]");
}

async function waitForPreparedPrompt(token, prompt, routingMode, replacementMode) {
  await waitFor(() => {
    const ackToken = readDefaultInt("studio_debug_prepare_ack_token");
    const ackText = readDefaultString("studio_debug_prepare_ack_text");
    const ackRouting = readDefaultString("studio_debug_prepare_ack_routing");
    const ackReplacementMode = readDefaultString("studio_debug_prepare_ack_replacement_mode") || "none";
    return ackToken === token
      && ackText === prompt
      && ackRouting === routingMode
      && ackReplacementMode === replacementMode;
  }, `Studio prompt preparation ack for: ${prompt}`, 20000, 250);
}

async function waitForKeyboardShortcutAck(token, prompt, routingMode, replacementMode, timeoutMs = 4000) {
  await waitFor(() => {
    const ackToken = readDefaultInt("studio_debug_keyboard_submit_ack_token");
    const ackText = readDefaultString("studio_debug_keyboard_submit_ack_text");
    const ackRouting = readDefaultString("studio_debug_keyboard_submit_ack_routing");
    const ackReplacementMode = readDefaultString("studio_debug_keyboard_submit_ack_replacement_mode") || "none";
    return ackToken === token
      && ackText === prompt
      && ackRouting === routingMode
      && ackReplacementMode === replacementMode;
  }, `Studio keyboard shortcut ack for: ${prompt}`, timeoutMs, 250);
}

async function waitForSubmittedPrompt(token, prompt, routingMode, replacementMode, timeoutMs = 20000) {
  let requestID = "";
  let ackToken = 0;
  let ackText = "";
  let ackRouting = "";
  let ackReplacementMode = "";
  try {
    await waitFor(() => {
      ackToken = readDefaultInt("studio_debug_submit_ack_token");
      ackText = readDefaultString("studio_debug_submit_ack_text");
      ackRouting = readDefaultString("studio_debug_submit_ack_routing");
      ackReplacementMode = readDefaultString("studio_debug_submit_ack_replacement_mode") || "none";
      requestID = readDefaultString("studio_debug_submit_ack_request_id");
      return ackToken === token
        && ackText === prompt
        && ackRouting === routingMode
        && ackReplacementMode === replacementMode
        && Boolean(String(requestID || "").trim());
    }, `Studio prompt submit ack for: ${prompt}`, timeoutMs, 250);
  } catch (error) {
    assertInteractionLifecycle({
      action: "studio_debug_submit_ack",
      actionReceived: ackToken === token,
      payload: {
        status: ackToken === token ? "handled" : "error",
        error: "submit_ack_timeout",
      },
      stateAfter: Boolean(String(requestID || "").trim()),
      stateLabel: "submit_ack_request_id_present",
      extra: {
        token,
        prompt,
        routing_mode: routingMode,
        replacement_mode: replacementMode,
        ack_token: ackToken,
        ack_text: ackText,
        ack_routing: ackRouting,
        ack_replacement_mode: ackReplacementMode,
        ack_request_id: requestID,
      },
      cause: error,
    });
  }
  assertInteractionLifecycle({
    action: "studio_debug_submit_ack",
    actionReceived: ackToken === token,
    payload: {
      status: "handled",
      error: "",
    },
    stateAfter: Boolean(String(requestID || "").trim()),
    stateLabel: "submit_ack_request_id_present",
    extra: {
      token,
      prompt,
      routing_mode: routingMode,
      replacement_mode: replacementMode,
      ack_token: ackToken,
      ack_request_id: requestID,
    },
  });
  return String(requestID || "").trim();
}

async function waitForKeyboardSubmittedPrompt(token, prompt, routingMode, replacementMode) {
  return await waitForSubmittedPrompt(token, prompt, routingMode, replacementMode);
}

async function tryWaitForKeyboardSubmittedPrompt(token, prompt, routingMode, replacementMode, timeoutMs = 5000) {
  try {
    return await waitForSubmittedPrompt(token, prompt, routingMode, replacementMode, timeoutMs);
  } catch {
    return "";
  }
}

async function waitForSubmittedPromptResult(token, prompt, timeoutMs = 20000) {
  let status = "";
  let errorText = "";
  let resultToken = 0;
  try {
    await waitFor(() => {
      resultToken = readDefaultInt("studio_debug_submit_result_token");
      if (resultToken !== token) return false;
      status = readDefaultString("studio_debug_submit_result_status").toLowerCase();
      errorText = readDefaultString("studio_debug_submit_result_error");
      return status === "ok" || status === "error";
    }, `Studio prompt submit result for: ${prompt}`, timeoutMs, 250);
  } catch (error) {
    assertInteractionLifecycle({
      action: "studio_debug_submit_result",
      actionReceived: resultToken === token,
      payload: {
        status: status || "error",
        error: errorText || "submit_result_timeout",
      },
      stateAfter: status === "ok" || status === "error",
      stateLabel: "submit_result_status_available",
      extra: {
        token,
        prompt,
        result_token: resultToken,
      },
      cause: error,
    });
  }
  assertInteractionLifecycle({
    action: "studio_debug_submit_result",
    actionReceived: resultToken === token,
    payload: {
      status,
      error: errorText,
    },
    stateAfter: status === "ok" || status === "error",
    stateLabel: "submit_result_status_available",
    extra: {
      token,
      prompt,
      result_token: resultToken,
    },
  });
  return {
    status,
    errorText,
  };
}

async function sendStudioPrompt(
  prompt,
  routingMode,
  lastTurnID,
  replacementMode = "none",
  transport = "keyboard",
  options = {}
) {
  const token = nextDebugToken();
  let requestID = null;
  let armedState = null;
  let submitResult = null;
  const projectKey = String(options.projectKey || "").trim();
  let keyboardShortcutAcked = false;

  if (transport === "keyboard") {
    writeDefaultString("studio_debug_prepare_text", prompt);
    writeDefaultString("studio_debug_prepare_routing", routingMode);
    writeDefaultString("studio_debug_prepare_replacement_mode", replacementMode);
    writeDefaultInt("studio_debug_prepare_token", token);
    await waitForPreparedPrompt(token, prompt, routingMode, replacementMode);
    if (replacementMode === "latest") {
      armedState = await waitForReplacementTargetArmed(prompt, 12000);
    }
    await sleep(1200);
    sendCmdReturn();
    keyboardShortcutAcked = await waitForKeyboardShortcutAck(token, prompt, routingMode, replacementMode, 3500)
      .then(() => true)
      .catch(() => false);
    const sawSubmissionStart = await waitFor(async () => {
      const state = readDebugDiffState();
      const recentEntry = projectKey
        ? recentThreadEntriesForProject(projectKey, 3).find((entry) => String(entry?.prompt || "").trim() === String(prompt || "").trim())
        : null;
      return Boolean(
        keyboardShortcutAcked
        || readDefaultInt("studio_debug_keyboard_submit_ack_token") === token
        || 
        (state && state.submitInFlight === true)
        || (state && String(state.latestThreadPrompt || "").trim() === String(prompt || "").trim())
        || recentEntry
      );
    }, `Studio keyboard submit start for: ${prompt}`, 4000, 250).then(() => true).catch(() => false);
    if (!sawSubmissionStart) {
      await sleep(350);
      sendCmdReturn();
      keyboardShortcutAcked = await waitForKeyboardShortcutAck(token, prompt, routingMode, replacementMode, 3500)
        .then(() => true)
        .catch(() => keyboardShortcutAcked);
    }
    requestID = await tryWaitForKeyboardSubmittedPrompt(token, prompt, routingMode, replacementMode, 5000);
  } else if (transport === "debug-submit") {
    writeDefaultString("studio_debug_submit_text", prompt);
    writeDefaultString("studio_debug_submit_routing", routingMode);
    writeDefaultString("studio_debug_submit_replacement_mode", replacementMode);
    writeDefaultInt("studio_debug_submit_token", token);
    requestID = await waitForSubmittedPrompt(token, prompt, routingMode, replacementMode);
    submitResult = await waitForSubmittedPromptResult(token, prompt);
    if (submitResult.status === "error") {
      throw new Error(`Studio debug-submit failed for "${prompt}": ${submitResult.errorText || "Unknown error"}`);
    }
  } else {
    throw new Error(`Unsupported Studio prompt transport: ${transport}`);
  }

  const observedHealth = await readHealthSafe();
  const observedHealthTurnId = String(observedHealth?.last_turn_id || "").trim();
  const observedHealthAdvanced = normalizeTurnNumber(observedHealthTurnId) > normalizeTurnNumber(lastTurnID);
  return {
    turnId: observedHealthAdvanced ? observedHealthTurnId : "",
    observedHealthTurnId,
    observedHealthAdvanced,
    observedHealth,
    requestID,
    preparedToken: token,
    armedState,
    transport,
    submitResult,
    keyboardShortcutAcked,
  };
}

async function waitForDiffState(predicate, description, timeoutMs = 20000) {
  let lastState = null;
  await waitFor(() => {
    const state = readDebugDiffState();
    if (!state) return false;
    lastState = state;
    return predicate(state);
  }, description, timeoutMs, 300);
  return lastState;
}

async function waitForLatestThreadEntry(projectKey, requestID, prompt, timeoutMs = 20000) {
  let latestEntry = null;
  await waitFor(() => {
    const entries = recentThreadEntriesForProject(projectKey, 6);
    const entry = entries.find((candidate) => {
      const sameRequest = String(candidate?.requestID || "").trim().toLowerCase() === String(requestID || "").trim().toLowerCase();
      const samePrompt = String(candidate?.prompt || "").trim() === String(prompt || "").trim();
      return sameRequest || samePrompt;
    });
    if (!entry) return false;
    latestEntry = entry;
    return true;
  }, `latest Studio thread entry for: ${prompt}`, timeoutMs, 300);
  return latestEntry;
}

async function collectStudioPromptDiagnostics({
  projectKey = "",
  expectedProjectKey = "",
  prompt = "",
  requestID = "",
  preparedToken = 0,
  transport = "",
  submitResult = null,
  armedState = null,
  observedHealth = null,
} = {}) {
  const diffState = readDebugDiffState();
  const effectiveProjectKey = String(projectKey || diffState?.projectKey || "").trim();
  const historyMap = readStudioAskNoteHistoryMap();
  const fullThreadMap = readFullThreadBrowseStateMap();
  return {
    prompt,
    requestID,
    transport,
    preparedToken,
    expectedProjectKey,
    projectKey: effectiveProjectKey,
    latestHealth: observedHealth || await readHealthSafe(),
    latestDiffState: diffState,
    prepareAck: {
      token: readDefaultInt("studio_debug_prepare_ack_token"),
      text: readDefaultString("studio_debug_prepare_ack_text"),
      routing: readDefaultString("studio_debug_prepare_ack_routing"),
      replacementMode: readDefaultString("studio_debug_prepare_ack_replacement_mode") || "none",
    },
    keyboardShortcutAck: {
      token: readDefaultInt("studio_debug_keyboard_submit_ack_token"),
      text: readDefaultString("studio_debug_keyboard_submit_ack_text"),
      routing: readDefaultString("studio_debug_keyboard_submit_ack_routing"),
      replacementMode: readDefaultString("studio_debug_keyboard_submit_ack_replacement_mode") || "none",
    },
    submitAck: {
      token: readDefaultInt("studio_debug_submit_ack_token"),
      text: readDefaultString("studio_debug_submit_ack_text"),
      routing: readDefaultString("studio_debug_submit_ack_routing"),
      replacementMode: readDefaultString("studio_debug_submit_ack_replacement_mode") || "none",
      requestID: readDefaultString("studio_debug_submit_ack_request_id"),
    },
    submitResult,
    armedState,
    recentThreadEntries: effectiveProjectKey ? recentThreadEntriesForProject(effectiveProjectKey, 6) : [],
    fullThreadBrowseState: effectiveProjectKey
      ? (fullThreadMap && typeof fullThreadMap === "object" ? fullThreadMap[effectiveProjectKey] : null)
      : null,
    knownProjectKeys: Object.keys(historyMap || {}).slice(0, 10),
    replacementTrace: readReplacementTraceEvents().slice(0, 12),
  };
}

async function throwWithStudioPromptDiagnostics(message, context = {}) {
  const diagnostics = await collectStudioPromptDiagnostics(context);
  throw new Error(`${message}\n${JSON.stringify(diagnostics, null, 2)}`);
}

function deriveCommittedTurnId(entry, send) {
  const backendTurn = String(entry?.backendTurn || "").trim();
  if (backendTurn) return backendTurn;
  return String(send?.turnId || "").trim();
}

function assertLatestThreadEntryReplaced(entry, label) {
  const requestID = String(entry?.requestID || "").trim();
  const trace = readReplacementTraceEvents()
    .filter((event) => !requestID || String(event.requestID || "").trim() === requestID)
    .slice(0, 12);
  const kinds = trace.map((event) => String(event.kind || ""));
  const hasCapture = kinds.includes("capture-submit");
  const hasResolveMatch = kinds.some((kind) => kind.startsWith("resolve-match") || kind === "resolve-fallback-line-range");
  const hasResolveMiss = kinds.includes("resolve-miss-no-target");
  const hasReplacementCommit = kinds.includes("commit-standard-replacement") || kinds.includes("commit-stream-replacement");

  if (entry && entry.replacementApplied === true && hasCapture && (hasResolveMatch || hasReplacementCommit) && !hasResolveMiss) {
    return;
  }
  const debugState = readDebugDiffState();
  throw new Error(
    `${label} did not land as a replacement-target write.\n`
    + JSON.stringify(
      {
        latestEntry: entry,
        debugState,
        traceSummary: {
          hasCapture,
          hasResolveMatch,
          hasResolveMiss,
          hasReplacementCommit,
        },
        replacementTrace: trace,
      },
      null,
      2
    )
  );
}

function assertReplacementLineage(entry, expectedReplacedWriteID, label) {
  const actual = normalizeKey(entry?.replacedWriteID || "");
  const expected = normalizeKey(expectedReplacedWriteID || "");
  if (actual && expected && actual === expected) {
    return;
  }
  throw new Error(
    `${label} did not preserve replacement lineage.\n`
    + JSON.stringify(
      {
        expectedReplacedWriteID: expectedReplacedWriteID || null,
        actualReplacedWriteID: entry?.replacedWriteID || null,
        entry,
        debugState: readDebugDiffState(),
      },
      null,
      2
    )
  );
}

function assertLineageState(state, expected, label) {
  const actual = {
    latestAcknowledgedLineageKey: normalizeKey(state?.latestAcknowledgedLineageKey),
    latestAcknowledgedWriteID: normalizeKey(state?.latestAcknowledgedWriteID),
    latestRevisedLineageKey: normalizeKey(state?.latestRevisedLineageKey),
    latestRevisedWriteID: normalizeKey(state?.latestRevisedWriteID),
    focusedDiffKey: normalizeKey(state?.focusedDiffKey),
    focusedDiffLineageKey: normalizeKey(state?.focusedDiffLineageKey),
    focusedDiffWriteID: normalizeKey(state?.focusedDiffWriteID),
    activeRevisedKey: normalizeKey(state?.activeRevisedKey),
    activeRevisedLineageKey: normalizeKey(state?.activeRevisedLineageKey),
    activeRevisedWriteID: normalizeKey(state?.activeRevisedWriteID),
    activeLineageRevisedKeys: Array.isArray(state?.activeLineageRevisedKeys)
      ? state.activeLineageRevisedKeys.map((value) => normalizeKey(value))
      : [],
    activeLineageRevisedWriteIDs: Array.isArray(state?.activeLineageRevisedWriteIDs)
      ? state.activeLineageRevisedWriteIDs.map((value) => normalizeKey(value))
      : [],
    latestReopenedLineageKey: normalizeKey(state?.latestReopenedLineageKey),
    latestReopenedWriteID: normalizeKey(state?.latestReopenedWriteID),
  };
  const normalizedExpected = {
    acknowledgedLineageKey: normalizeKey(expected?.acknowledgedLineageKey),
    acknowledgedWriteID: normalizeKey(expected?.acknowledgedWriteID),
    revisedLineageKey: normalizeKey(expected?.revisedLineageKey),
    revisedWriteID: normalizeKey(expected?.revisedWriteID),
    focusedDiffKey: normalizeKey(expected?.focusedDiffKey),
    focusedDiffLineageKey: normalizeKey(expected?.focusedDiffLineageKey),
    focusedDiffWriteID: normalizeKey(expected?.focusedDiffWriteID),
    activeRevisedKey: normalizeKey(expected?.activeRevisedKey),
    activeRevisedLineageKey: normalizeKey(expected?.activeRevisedLineageKey),
    activeRevisedWriteID: normalizeKey(expected?.activeRevisedWriteID),
    activeLineageIncludesWriteID: normalizeKey(expected?.activeLineageIncludesWriteID),
    reopenedLineageKey: normalizeKey(expected?.reopenedLineageKey),
    reopenedWriteID: normalizeKey(expected?.reopenedWriteID),
  };

  const acknowledgementMatches = !normalizedExpected.acknowledgedLineageKey
    || (
      actual.latestAcknowledgedLineageKey === normalizedExpected.acknowledgedLineageKey
      && actual.latestAcknowledgedWriteID === normalizedExpected.acknowledgedWriteID
    );
  const revisedMatches = !normalizedExpected.revisedLineageKey
    || (
      actual.latestRevisedLineageKey === normalizedExpected.revisedLineageKey
      && actual.latestRevisedWriteID === normalizedExpected.revisedWriteID
    );
  const focusedMatches = !normalizedExpected.focusedDiffKey
    || (
      actual.focusedDiffKey === normalizedExpected.focusedDiffKey
      && actual.focusedDiffLineageKey === normalizedExpected.focusedDiffLineageKey
      && actual.focusedDiffWriteID === normalizedExpected.focusedDiffWriteID
    );
  const activeMatches = !normalizedExpected.activeRevisedKey
    || (
      actual.activeRevisedKey === normalizedExpected.activeRevisedKey
      && actual.activeRevisedLineageKey === normalizedExpected.activeRevisedLineageKey
      && actual.activeRevisedWriteID === normalizedExpected.activeRevisedWriteID
    );
  const activeLineageMatches = !normalizedExpected.activeLineageIncludesWriteID
    || actual.activeLineageRevisedWriteIDs.includes(normalizedExpected.activeLineageIncludesWriteID);
  const reopenedMatches = !normalizedExpected.reopenedLineageKey
    || (
      actual.latestReopenedLineageKey === normalizedExpected.reopenedLineageKey
      && actual.latestReopenedWriteID === normalizedExpected.reopenedWriteID
    );

  if (acknowledgementMatches && revisedMatches && focusedMatches && activeMatches && activeLineageMatches && reopenedMatches) {
    return;
  }

  throw new Error(
    `${label} did not expose the expected lineage state.\n`
    + JSON.stringify(
      {
        expected: normalizedExpected,
        actual,
        fullState: state || null,
      },
      null,
      2
    )
  );
}

function assertPersistedReopenedRecord(record, expected, label) {
  const actual = {
    focusedDiffKey: normalizeKey(record?.focusedDiffKey),
    reopenedLineageKeys: Array.isArray(record?.reopenedLineageKeys)
      ? record.reopenedLineageKeys.map((value) => normalizeKey(value))
      : [],
    latestReopenedWriteID: normalizeKey(record?.latestReopenedWriteID),
  };
  const normalizedExpected = {
    focusedDiffKey: normalizeKey(expected?.focusedDiffKey),
    reopenedLineageKey: normalizeKey(expected?.reopenedLineageKey),
    latestReopenedWriteID: normalizeKey(expected?.latestReopenedWriteID),
  };
  if (
    actual.focusedDiffKey === normalizedExpected.focusedDiffKey
    && actual.reopenedLineageKeys.includes(normalizedExpected.reopenedLineageKey)
    && actual.latestReopenedWriteID === normalizedExpected.latestReopenedWriteID
  ) {
    return;
  }
  throw new Error(
    `${label} did not persist the expected reopened record.\n`
    + JSON.stringify(
      {
        expected: normalizedExpected,
        actual,
        fullRecord: record || null,
      },
      null,
      2
    )
  );
}

async function acknowledgeDiff(diffKey) {
  const token = nextDebugToken();
  writeDefaultString("studio_debug_acknowledge_diff_key", diffKey);
  writeDefaultInt("studio_debug_acknowledge_diff_token", token);
  await waitFor(() => readDefaultInt("studio_debug_acknowledge_diff_ack_token") === token, `diff acknowledgement for ${diffKey}`, 20000, 250);
  return token;
}

async function relaunchApp(appPath) {
  quitApp();
  await waitFor(() => !appIsRunning(), "THEM process to quit", 15000, 300);
  launchApp(appPath);
  await waitFor(() => appIsRunning(), "THEM process after relaunch", 20000, 300);
  activateApp(appPath);
  await ensureStudioVisible();
}

async function prepareAppForSmoke(appPath) {
  resetStudioDebugHandshakeDefaults();
  const appSession = relaunchAppWithHelper(appPath);
  try {
    activateApp(appPath);
    await waitFor(() => appHasWindow(), "visible THEM window after launch", 20000, 300);
    const priorOpenToken = readDefaultInt("studio_debug_open_token");
    const priorOpenAck = readDefaultInt("studio_debug_open_ack_token");
    await ensureStudioVisible();
    await waitFor(() => {
      const openToken = readDefaultInt("studio_debug_open_token");
      const openAckToken = readDefaultInt("studio_debug_open_ack_token");
      const hasDiffState = Boolean(readDebugDiffState());
      const ackProgressed = openToken > 0 && openAckToken === openToken && openAckToken !== priorOpenAck;
      const tokenProgressed = openToken > 0 && openToken !== priorOpenToken;
      return ackProgressed || (tokenProgressed && hasDiffState);
    }, "fresh Studio open-token progression", 15000, 150);
  } catch (error) {
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}\n`
      + `App session telemetry: ${JSON.stringify(appSession, null, 2)}`
    );
  }
  return appSession;
}

function readStudioVoiceTurnDebugSnapshot(token) {
  const resultToken = readDefaultInt("studio_debug_voice_turn_result_token");
  const status = readDefaultString("studio_debug_voice_turn_result_status").toLowerCase();
  const errorText = readDefaultString("studio_debug_voice_turn_result_error");
  const tokenSpecific = readStudioVoiceSnapshotPayload({
    token,
    resultRaw: readDefaultString(studioDebugVoiceTurnResultKey(token)),
    traceRaw: readDefaultString(studioDebugVoiceTurnTraceKey(token)),
    status,
    errorText,
    resultToken,
  });
  const persisted = readStudioVoiceSnapshotPayload({
    token,
    resultRaw: readDefaultString("studio_debug_voice_turn_result_json"),
    traceRaw: readDefaultString("studio_debug_voice_draft_trace_json"),
    status,
    errorText,
    resultToken,
  });

  return studioVoiceSnapshotScore(persisted, token) > studioVoiceSnapshotScore(tokenSpecific, token)
    ? persisted
    : tokenSpecific;
}

function readTokenSpecificStudioVoiceTurnDebugSnapshot(token) {
  const resultToken = readDefaultInt("studio_debug_voice_turn_result_token");
  const status = readDefaultString("studio_debug_voice_turn_result_status").toLowerCase();
  const errorText = readDefaultString("studio_debug_voice_turn_result_error");
  return readStudioVoiceSnapshotPayload({
    token,
    resultRaw: readDefaultString(studioDebugVoiceTurnResultKey(token)),
    traceRaw: readDefaultString(studioDebugVoiceTurnTraceKey(token)),
    status,
    errorText,
    resultToken,
  });
}

function mergePreferredString(...values) {
  for (const value of values) {
    const normalized = String(value || "").trim();
    if (normalized) return normalized;
  }
  return "";
}

function mergePreferredArray(...values) {
  for (const value of values) {
    if (Array.isArray(value) && value.length) {
      return value;
    }
  }
  return [];
}

function hasCompleteSnapshotScreenplayMeta({ target = "", text = "", timingSource = "", cues = [] } = {}) {
  return Boolean(
    String(target || "").trim()
    && String(text || "").trim()
    && String(timingSource || "").trim()
    && Array.isArray(cues)
    && cues.length > 0
  );
}

function extractScreenplayTextFromBreadcrumbs(...breadcrumbSets) {
  for (const breadcrumbs of breadcrumbSets) {
    if (!Array.isArray(breadcrumbs)) continue;
    for (const eventName of ["synced_insert_started", "header_text_committed", "request_committed"]) {
      const match = breadcrumbs.find((entry) => String(entry?.event || "") === eventName);
      const replyPreview = String(match?.replyPreview || "").trim();
      if (replyPreview) return replyPreview;
    }
  }
  return "";
}

function extractTimingSourceFromBreadcrumbs(...breadcrumbSets) {
  for (const breadcrumbs of breadcrumbSets) {
    if (!Array.isArray(breadcrumbs)) continue;
    for (const entry of breadcrumbs) {
      const detail = String(entry?.detail || "");
      const match = detail.match(/timing_source=([A-Za-z0-9._:-]+)/i);
      if (match?.[1]) return String(match[1]).trim();
    }
  }
  return "";
}

function inferScreenplayTargetFromBreadcrumbs(...breadcrumbSets) {
  for (const breadcrumbs of breadcrumbSets) {
    if (!Array.isArray(breadcrumbs)) continue;
    const events = breadcrumbs.map((entry) => String(entry?.event || ""));
    if (events.includes("synced_insert_started") || events.includes("request_committed")) {
      return "page";
    }
  }
  return "";
}

function mergeBreadcrumbSets(...breadcrumbSets) {
  const merged = [];
  const seen = new Set();
  for (const breadcrumbs of breadcrumbSets) {
    if (!Array.isArray(breadcrumbs)) continue;
    for (const entry of breadcrumbs) {
      if (!entry || typeof entry !== "object") continue;
      const key = [
        String(entry.timestampISO8601 || ""),
        String(entry.event || ""),
        String(entry.detail || ""),
      ].join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(entry);
    }
  }
  merged.sort((left, right) => {
    const leftTime = Date.parse(String(left?.timestampISO8601 || ""));
    const rightTime = Date.parse(String(right?.timestampISO8601 || ""));
    if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
      return leftTime - rightTime;
    }
    return String(left?.event || "").localeCompare(String(right?.event || ""));
  });
  return merged;
}

function preferredStudioVoiceResult(primary, fallback) {
  const primaryBreadcrumbs = Array.isArray(primary?.breadcrumbs) ? primary.breadcrumbs.length : 0;
  const fallbackBreadcrumbs = Array.isArray(fallback?.breadcrumbs) ? fallback.breadcrumbs.length : 0;
  if (primaryBreadcrumbs > fallbackBreadcrumbs) {
    return primary;
  }
  if (fallbackBreadcrumbs > primaryBreadcrumbs) {
    return fallback;
  }

  const primarySignals = [
    primary?.renderRequestID,
    primary?.renderPartialAtISO8601,
    primary?.commitAtISO8601,
    primary?.talkResponseReceivedAtISO8601,
  ].filter(Boolean).length;
  const fallbackSignals = [
    fallback?.renderRequestID,
    fallback?.renderPartialAtISO8601,
    fallback?.commitAtISO8601,
    fallback?.talkResponseReceivedAtISO8601,
  ].filter(Boolean).length;
  if (primarySignals >= fallbackSignals) {
    return primary || fallback || {};
  }
  return fallback || primary || {};
}

function assertNoFormatterArtifacts(text, label) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => String(line || "").trim())
    .filter(Boolean);

  assert(lines.length > 0, `${label} was empty`);

  for (const line of lines) {
    assert(!line.includes(",."), `${label} still contains ',.': ${line}`);
    assert(!line.includes(";."), `${label} still contains ';.': ${line}`);
    assert(!/[;,]$/.test(line), `${label} still ends with a trailing comma or semicolon: ${line}`);
  }
}

function collectVoiceTimeoutStageSnapshot(token, prompt, snapshot) {
  const safeSnapshot = snapshot || readStudioVoiceTurnDebugSnapshot(token);
  const breadcrumbs = Array.isArray(safeSnapshot?.breadcrumbs) ? safeSnapshot.breadcrumbs : [];
  const breadcrumbEvents = breadcrumbs.map((entry) => String(entry?.event || ""));
  const stageSnapshot = {
    token,
    prompt: String(prompt || ""),
    status: String(safeSnapshot?.status || "").trim().toLowerCase(),
    result_token: Number(safeSnapshot?.resultToken || 0),
    talk_dispatched: breadcrumbEvents.includes("talk_request_started") || breadcrumbEvents.includes("talk_dispatched"),
    talk_response_received: breadcrumbEvents.includes("talk_response_received"),
    render_partial: breadcrumbEvents.includes("render_partial_received"),
    request_committed: breadcrumbEvents.includes("request_committed"),
    breadcrumb_count: breadcrumbs.length,
    breadcrumb_events: breadcrumbEvents,
    latest_error: String(safeSnapshot?.errorText || ""),
    collected_at_iso8601: new Date().toISOString(),
  };
  writeDefaultString("studio_debug_voice_timeout_stage_json", JSON.stringify(stageSnapshot));
  writeDefaultString(`studio_debug_voice_timeout_stage_json_${token}`, JSON.stringify(stageSnapshot));
  return stageSnapshot;
}

async function waitForStudioVoiceTurnResult(token, prompt, options = {}) {
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 90000;
  const requireTalkResponse = Boolean(options.requireTalkResponse);
  const allowTalkResponse = Boolean(options.allowTalkResponse);
  let snapshot = readStudioVoiceTurnDebugSnapshot(token);
  try {
    await waitFor(() => {
      snapshot = readStudioVoiceTurnDebugSnapshot(token);
      const rawTokenResult = readDefaultString(studioDebugVoiceTurnResultKey(token));
      const rawTokenTrace = readDefaultString(studioDebugVoiceTurnTraceKey(token));
      const rawTokenTraceHasTalkResponse =
        rawTokenTrace.includes('"event":"talk_response_received"')
        || rawTokenTrace.includes('"event":"debug_turn_result_persisted"');
      const rawTokenTraceHasCommit =
        rawTokenTrace.includes('"event":"request_committed"')
        || rawTokenTrace.includes('"event":"header_text_committed"');
      const rawTokenResultHasPersistedSignal =
        /"commitAtISO8601"\s*:\s*"[^"]+"/.test(rawTokenResult)
        || /"headerTextCommittedAtISO8601"\s*:\s*"[^"]+"/.test(rawTokenResult)
        || /"debugTurnResultPersistedAtISO8601"\s*:\s*"[^"]+"/.test(rawTokenResult)
        || /"insertedPreview"\s*:\s*"[^"]+/.test(rawTokenResult);
      const result = snapshot.result || {};
      if (snapshot.status === "error" && (snapshot.resultToken === token || snapshot.breadcrumbs.length > 0)) {
        return true;
      }
      const breadcrumbEvents = snapshot.breadcrumbs.map((entry) => String(entry?.event || ""));
      const promptMatches = String(result.prompt || "").trim() === String(prompt || "").trim();
      const hasCommittedSnapshot = Boolean(String(result.commitAtISO8601 || "").trim());
      const hasPersistedSnapshotSignal = promptMatches && (
        hasCommittedSnapshot
        || Boolean(String(result.insertedPreview || "").trim())
        || Boolean(String(result.headerTextCommittedAtISO8601 || "").trim())
      );
      if (requireTalkResponse) {
        return breadcrumbEvents.includes("talk_response_received")
          || rawTokenTraceHasTalkResponse
          || (promptMatches && Boolean(String(result.talkResponseReceivedAtISO8601 || "").trim()));
      }
      if (allowTalkResponse && breadcrumbEvents.includes("talk_response_received")) {
        return true;
      }
      if (allowTalkResponse && rawTokenTraceHasTalkResponse) {
        return true;
      }
      if (breadcrumbEvents.includes("render_partial_received")) {
        return true;
      }
      if (breadcrumbEvents.includes("request_committed")) {
        return true;
      }
      if (rawTokenTraceHasCommit) {
        return true;
      }
      if (hasPersistedSnapshotSignal) {
        return true;
      }
      if (rawTokenResultHasPersistedSignal) {
        return true;
      }
      return studioVoiceSnapshotMatchesToken(snapshot, token) && snapshot.status === "ok";
    }, `Studio voice result for: ${prompt}`, timeoutMs, 250);
  } catch (error) {
    const stageSnapshot = collectVoiceTimeoutStageSnapshot(token, prompt, snapshot);
    throw new Error(
      `Timed out waiting for Studio voice result for: ${prompt}\n`
      + `${JSON.stringify(stageSnapshot, null, 2)}\n`
      + `Cause: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  return snapshot;
}

async function waitForStudioVoiceTurnFinalized(token, prompt, timeoutMs = 20000) {
  let snapshot = readStudioVoiceTurnDebugSnapshot(token);
  await waitFor(() => {
    snapshot = readStudioVoiceTurnDebugSnapshot(token);
    const breadcrumbEvents = snapshot.breadcrumbs.map((entry) => String(entry?.event || ""));
    return Boolean(snapshot.result?.debugTurnResultPersistedAtISO8601)
      || breadcrumbEvents.includes("debug_turn_result_persisted")
      || breadcrumbEvents.includes("assistant_playback_finished");
  }, `Studio voice finalized debug snapshot for: ${prompt}`, timeoutMs, 250);
  return snapshot;
}

async function waitForTokenScopedStudioVoiceScreenplaySnapshot(token, prompt, timeoutMs = 5000) {
  let snapshot = readTokenSpecificStudioVoiceTurnDebugSnapshot(token);
  await waitFor(() => {
    snapshot = readTokenSpecificStudioVoiceTurnDebugSnapshot(token);
    const result = snapshot?.result || {};
    return Boolean(
      String(result.screenplayOutputTarget || "").trim()
      && String(result.screenplayOutputText || "").trim()
    );
  }, `token-scoped screenplay snapshot for: ${prompt}`, timeoutMs, 150).catch(() => {});
  return snapshot;
}

async function sendStudioVoiceTurn(prompt, lastTurnID, options = {}) {
  const projectId = readEnvString(
    "STUDIO_CMDRETURN_PROJECT_ID",
    readDefaultString("studio_debug_voice_turn_project_id")
  );
  const sendWithFreshToken = async (token) => {
    writeDefaultString("studio_debug_voice_turn_text", prompt);
    writeDefaultString("studio_debug_voice_turn_project_id", projectId);
    writeDefaultInt("studio_debug_voice_turn_command_received_token", 0);
    writeDefaultInt("studio_debug_voice_turn_ack_token", 0);
    writeDefaultInt("studio_debug_voice_turn_result_token", 0);
    writeDefaultString("studio_debug_voice_turn_result_status", "");
    writeDefaultString("studio_debug_voice_turn_result_error", "");
    writeDefaultString("studio_debug_voice_turn_result_json", "");
    writeDefaultString("studio_debug_voice_draft_trace_json", "[]");
    writeDefaultString(studioDebugVoiceTurnResultKey(token), "");
    writeDefaultString(studioDebugVoiceTurnTraceKey(token), "[]");
    writeDefaultInt("studio_debug_voice_turn_token", 0);
    await sleep(120);
    writeDefaultInt("studio_debug_voice_turn_token", token);
    await waitForStudioVoiceTurnCommandReceived(token);
    await waitForStudioVoiceTurnAck(token);
    return token;
  };

  let token = 0;
  let sendError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      token = await sendWithFreshToken(nextDebugToken());
      sendError = null;
      break;
    } catch (error) {
      sendError = error;
      await ensureStudioVisible();
      await sleep(250 * attempt);
    }
  }
  if (!token) {
    throw sendError || new Error("Studio voice smoke could not dispatch a voice turn token");
  }
  const voiceResult = await waitForStudioVoiceTurnResult(token, prompt, options);
  if (voiceResult.status === "error") {
    throw new Error(`Studio voice smoke failed for "${prompt}": ${voiceResult.errorText || "Unknown error"}`);
  }

  let next = await readHealth();
  await waitFor(async () => {
    const health = await readHealth();
    next = health;
    return normalizeTurnNumber(health.last_turn_id) > normalizeTurnNumber(lastTurnID);
  }, `backend turn after Studio voice prompt: ${prompt}`, 30000, 500);

  return {
    token,
    turnId: String(next.last_turn_id || "").trim(),
    result: voiceResult.result,
  };
}

const appPath = findDebugAppPath();
const scenario = String(process.env.STUDIO_CMDRETURN_SCENARIO || "reopened").trim().toLowerCase();
assert(["reopened", "ack-only", "page-only", "keyboard-submit-only", "voice-early-paint"].includes(scenario), `Unsupported STUDIO_CMDRETURN_SCENARIO: ${scenario}`);
const promptTransport = readEnvString("STUDIO_CMDRETURN_TRANSPORT", "keyboard");
assert(["keyboard", "debug-submit"].includes(promptTransport), `Unsupported STUDIO_CMDRETURN_TRANSPORT: ${promptTransport}`);
const beforeHealth = await readHealth();
assert(beforeHealth?.ok === true, "Backend health is not OK on localhost:3000");
const throwawayProject = await createThrowawayStudioProject();
const expectedProjectKey = normalizeKey(`project:${throwawayProject.projectId}`);
const requiresPreloadedStudioProject = scenario !== "voice-early-paint";

const baselineDiffState = readDebugDiffState() || {
  revisedDiffCount: 0,
  reopenedDiffCount: 0,
  acknowledgedDiffCount: 0,
  latestRevisedKey: "",
  latestReopenedKey: "",
  latestAcknowledgedLineageKey: "",
  latestAcknowledgedWriteID: "",
  latestRevisedLineageKey: "",
  latestRevisedWriteID: "",
  focusedDiffLineageKey: "",
  focusedDiffWriteID: "",
  activeRevisedKey: "",
  activeRevisedLineageKey: "",
  activeRevisedWriteID: "",
  activeLineageRevisedKeys: [],
  activeLineageRevisedWriteIDs: [],
  latestReopenedLineageKey: "",
  latestReopenedWriteID: "",
  focusedDiffKey: "",
  projectKey: "",
};

let smokeAppSession = defaultSmokeSessionTelemetry();
smokeAppSession = await prepareAppForSmoke(appPath);
if (requiresPreloadedStudioProject) {
  await ensureStudioVisible();
}
const loadedProjectKey = requiresPreloadedStudioProject
  ? await waitForDiffState(
    (state) => normalizeKey(state.projectKey) === expectedProjectKey
      && String(state.selectedProjectID || "").trim() === throwawayProject.projectId,
    `loaded throwaway Studio project ${throwawayProject.projectId}`,
    20000
  ).then((state) => String(state.projectKey || "").trim())
  : expectedProjectKey;

  if (scenario === "voice-early-paint") {
    const requireThreadEntry = readEnvBool("STUDIO_CMDRETURN_REQUIRE_THREAD_ENTRY", false);
    const requireTalkResponse = readEnvBool("STUDIO_CMDRETURN_REQUIRE_TALK_RESPONSE", false);
    const effectiveRequireTalkResponse = requireTalkResponse || readEnvBool("STUDIO_CMDRETURN_FORCE_TALK_RESPONSE", false);
    const allowMissingEarlyCommit = readEnvBool("STUDIO_CMDRETURN_ALLOW_MISSING_EARLY_COMMIT", false);
    const relaxEarlyPreviewAssertions = readEnvBool("STUDIO_CMDRETURN_RELAX_EARLY_PREVIEW_ASSERTS", false);
    const threadEntryTimeoutMs = readEnvInt(
      "STUDIO_CMDRETURN_THREAD_ENTRY_TIMEOUT_MS",
      requireThreadEntry ? 45000 : 8000
    );
    const minRenderFirstDeltaMs = readEnvInt("STUDIO_CMDRETURN_MIN_RENDER_FIRST_DELTA_MS", 1);
    const maxRenderFirstDeltaMs = readEnvInt("STUDIO_CMDRETURN_MAX_RENDER_FIRST_DELTA_MS", 5000);
  const originalVoiceTransportMode = readDefaultString("clementine_voice_transport_mode");
  const originalStudioAutoInsert = readDefaultBool("studio_auto_insert", true);
  const originalVoicePrompt = readDefaultString("studio_debug_voice_turn_text");
  const originalVoiceProjectId = readDefaultString("studio_debug_voice_turn_project_id");
  const originalVoiceResultStatus = readDefaultString("studio_debug_voice_turn_result_status");
  const originalVoiceResultError = readDefaultString("studio_debug_voice_turn_result_error");
  const originalVoiceResultJSON = readDefaultString("studio_debug_voice_turn_result_json");
  const originalVoiceTraceJSON = readDefaultString("studio_debug_voice_draft_trace_json");
  let result = null;
  try {
    writeDefaultString("clementine_voice_transport_mode", "turn_based");
    writeDefaultBool("studio_auto_insert", true);
    writeDefaultString("studio_debug_voice_turn_project_id", throwawayProject.projectId);

    const projectKey = `project:${throwawayProject.projectId}`;
    const voicePrompt = readEnvString(
      "STUDIO_CMDRETURN_VOICE_PROMPT",
      "Write one tense screenplay action line: She reaches the door before he can answer. That's it."
    );
    const voiceSend = await sendStudioVoiceTurn(
      voicePrompt,
      beforeHealth.last_turn_id,
      {
        requireTalkResponse: effectiveRequireTalkResponse,
        allowTalkResponse: requireThreadEntry,
        timeoutMs: requireThreadEntry ? 140000 : readEnvInt("STUDIO_CMDRETURN_VOICE_RESULT_TIMEOUT_MS", 140000),
      }
    );
    const latestVoiceSnapshot = await waitForStudioVoiceTurnFinalized(
      voiceSend.token,
      voicePrompt,
      20000
    ).catch(() => readStudioVoiceTurnDebugSnapshot(voiceSend.token));
    const tokenSpecificVoiceSnapshot = await waitForTokenScopedStudioVoiceScreenplaySnapshot(
      voiceSend.token,
      voicePrompt,
      5000
    );
    const voiceResult = preferredStudioVoiceResult(
      preferredStudioVoiceResult(
        voiceSend.result || {},
        latestVoiceSnapshot.result || {}
      ),
      tokenSpecificVoiceSnapshot.result || {}
    );
    const fallbackScreenplayOutputTarget = mergePreferredString(
      tokenSpecificVoiceSnapshot.result?.screenplayOutputTarget,
      voiceResult.screenplayOutputTarget,
      latestVoiceSnapshot.result?.screenplayOutputTarget,
      voiceSend.result?.screenplayOutputTarget,
      inferScreenplayTargetFromBreadcrumbs(
        tokenSpecificVoiceSnapshot.breadcrumbs,
        latestVoiceSnapshot.breadcrumbs,
        voiceResult.breadcrumbs,
        voiceSend.result?.breadcrumbs
      )
    );
    const fallbackScreenplayOutputText = mergePreferredString(
      tokenSpecificVoiceSnapshot.result?.screenplayOutputText,
      voiceResult.screenplayOutputText,
      latestVoiceSnapshot.result?.screenplayOutputText,
      voiceSend.result?.screenplayOutputText,
      extractScreenplayTextFromBreadcrumbs(
        tokenSpecificVoiceSnapshot.breadcrumbs,
        latestVoiceSnapshot.breadcrumbs,
        voiceResult.breadcrumbs,
        voiceSend.result?.breadcrumbs
      )
    );
    const fallbackTimingSource = mergePreferredString(
      tokenSpecificVoiceSnapshot.result?.timingSource,
      voiceResult.timingSource,
      latestVoiceSnapshot.result?.timingSource,
      voiceSend.result?.timingSource,
      extractTimingSourceFromBreadcrumbs(
        tokenSpecificVoiceSnapshot.breadcrumbs,
        latestVoiceSnapshot.breadcrumbs,
        voiceResult.breadcrumbs,
        voiceSend.result?.breadcrumbs
      )
    );
    const fallbackScreenplayCues = mergePreferredArray(
      tokenSpecificVoiceSnapshot.result?.screenplayCues,
      voiceResult.screenplayCues,
      latestVoiceSnapshot.result?.screenplayCues,
      voiceSend.result?.screenplayCues
    );
    const hasCompleteSnapshotMeta = hasCompleteSnapshotScreenplayMeta({
      target: fallbackScreenplayOutputTarget,
      text: fallbackScreenplayOutputText,
      timingSource: fallbackTimingSource,
      cues: fallbackScreenplayCues,
    });
    const fallbackCommitAtISO8601 = mergePreferredString(
      voiceResult.commitAtISO8601,
      tokenSpecificVoiceSnapshot.result?.commitAtISO8601,
      latestVoiceSnapshot.result?.commitAtISO8601,
      voiceSend.result?.commitAtISO8601
    );
    const fallbackTalkResponseReceivedAtISO8601 = mergePreferredString(
      voiceResult.talkResponseReceivedAtISO8601,
      tokenSpecificVoiceSnapshot.result?.talkResponseReceivedAtISO8601,
      latestVoiceSnapshot.result?.talkResponseReceivedAtISO8601,
      voiceSend.result?.talkResponseReceivedAtISO8601
    );
    let voiceTurnMeta = null;
    const typedScreenplayOutput = voiceTurnMeta?.screenplay_output || {
      target: fallbackScreenplayOutputTarget,
      text: fallbackScreenplayOutputText,
    };
    const typedTimingSource = String(voiceTurnMeta?.timing_source || fallbackTimingSource || "").trim();
    const typedScreenplayCues = Array.isArray(voiceTurnMeta?.screenplay_cues) && voiceTurnMeta.screenplay_cues.length
      ? voiceTurnMeta.screenplay_cues
      : fallbackScreenplayCues;
    const typedScreenplayTarget = normalizeKey(typedScreenplayOutput?.target || "");
    if (typedScreenplayTarget) {
      assert(typedScreenplayTarget === "page", `Studio voice smoke turn meta targeted ${typedScreenplayTarget} instead of page`);
    }
    const latestEntry = await waitForLatestThreadEntry(
      projectKey,
      "",
      voicePrompt,
      threadEntryTimeoutMs
    ).catch(() => null);
    const breadcrumbs = mergeBreadcrumbSets(
      voiceResult.breadcrumbs,
      tokenSpecificVoiceSnapshot.breadcrumbs,
      latestVoiceSnapshot.breadcrumbs,
      voiceSend.result?.breadcrumbs
    );
    const breadcrumbEvents = breadcrumbs.map((entry) => String(entry.event || ""));
    const draftStartedAtMs = Date.parse(String(voiceResult.draftStartedAtISO8601 || ""));
    const renderPartialAtMs = Date.parse(String(voiceResult.renderPartialAtISO8601 || ""));
    const playbackStartedAtMs = Date.parse(String(voiceResult.playbackStartedAtISO8601 || ""));
    const playbackFinishedAtMs = Date.parse(String(voiceResult.playbackFinishedAtISO8601 || ""));
    const headerTextReadyAtMs = Date.parse(String(voiceResult.headerTextReadyAtISO8601 || ""));
    const headerTextCommittedAtMs = Date.parse(String(voiceResult.headerTextCommittedAtISO8601 || ""));
    const renderServerFirstDeltaMs = Number(voiceResult.renderServerFirstDeltaMs || 0);
    const hasRenderStreamFirstDeltaMetadata = breadcrumbEvents.includes("render_stream_first_delta_server");
    const hasCommittedEarlyPreview = breadcrumbEvents.includes("request_committed")
      && Boolean(fallbackCommitAtISO8601);
    const hasSyncedInsert = breadcrumbEvents.includes("synced_insert_started");
    const sawTalkRequestStarted = breadcrumbEvents.includes("talk_request_started");
    const sawTalkResponseReceived = breadcrumbEvents.includes("talk_response_received")
      || Boolean(String(voiceResult.talkResponseReceivedAtISO8601 || "").trim());
    const syncedCueEvents = breadcrumbs.filter((entry) => String(entry?.event || "") === "synced_insert_cue_applied");
    const hasUsableRenderFirstDelta = Number.isFinite(renderServerFirstDeltaMs) && renderServerFirstDeltaMs > 0;
    const canSkipRenderFirstDeltaAssertion = hasCommittedEarlyPreview
      && (!hasRenderStreamFirstDeltaMetadata || !hasUsableRenderFirstDelta);
    const draftStartedBeforeFirstDraftPaint = Number.isFinite(draftStartedAtMs)
      && Number.isFinite(renderPartialAtMs)
      && draftStartedAtMs <= renderPartialAtMs;
    const draftStartedBeforeAssistantSpeech = Number.isFinite(draftStartedAtMs)
      && (
        (Number.isFinite(playbackStartedAtMs) && draftStartedAtMs < playbackStartedAtMs)
        || (Number.isFinite(playbackFinishedAtMs) && draftStartedAtMs < playbackFinishedAtMs)
      );
    const headerTextReadyBeforeAssistantSpeech = Number.isFinite(headerTextReadyAtMs)
      && (
        (Number.isFinite(playbackStartedAtMs) && headerTextReadyAtMs < playbackStartedAtMs)
        || (Number.isFinite(playbackFinishedAtMs) && headerTextReadyAtMs < playbackFinishedAtMs)
      );
    const headerTextCommittedBeforeAudioCompletion = Number.isFinite(headerTextCommittedAtMs)
      && Number.isFinite(playbackFinishedAtMs)
      && headerTextCommittedAtMs < playbackFinishedAtMs;

    assert(voiceSend.turnId && voiceSend.turnId !== beforeHealth.last_turn_id, "Studio voice smoke did not create a new turn");
    const shouldAssertRenderFirstDelta = false;
    if (shouldAssertRenderFirstDelta && !canSkipRenderFirstDeltaAssertion && !hasSyncedInsert) {
      assert(renderServerFirstDeltaMs >= minRenderFirstDeltaMs, `Studio voice smoke render first delta was too fast/unset: ${renderServerFirstDeltaMs}ms`);
      assert(renderServerFirstDeltaMs <= maxRenderFirstDeltaMs, `Studio voice smoke render first delta regressed beyond ${maxRenderFirstDeltaMs}ms: ${renderServerFirstDeltaMs}ms`);
    }
    if (!requireThreadEntry && !allowMissingEarlyCommit) {
      assert(Boolean(fallbackCommitAtISO8601), "Studio voice smoke did not commit the early draft preview");
    }
    if ((effectiveRequireTalkResponse || requireTalkResponse) && !requireThreadEntry) {
      assert(Boolean(fallbackTalkResponseReceivedAtISO8601), "Studio voice smoke did not surface talk response timing");
    }
    if (!requireThreadEntry && !relaxEarlyPreviewAssertions) {
      assert(Boolean(voiceResult.headerTextReadyAtISO8601), "Studio voice smoke did not record header_text_ready breadcrumb");
      assert(Boolean(voiceResult.headerTextCommittedAtISO8601), "Studio voice smoke did not record header_text_committed breadcrumb");
      assert(headerTextReadyBeforeAssistantSpeech, "Studio voice smoke did not receive header-time text before assistant speech");
      assert(headerTextCommittedBeforeAudioCompletion, "Studio voice smoke did not apply header-time text before audio completion");
      if (hasSyncedInsert) {
        assert(breadcrumbEvents.includes("synced_insert_started"), "Studio voice smoke did not record synced_insert_started breadcrumb");
        assert(syncedCueEvents.length >= 1, "Studio voice smoke did not record any synced insert cue events");
        assert(breadcrumbEvents.includes("request_committed"), "Studio voice smoke did not record request_committed breadcrumb");
        if (Number.isFinite(playbackStartedAtMs) && Number.isFinite(headerTextCommittedAtMs)) {
          assert(headerTextCommittedAtMs >= playbackStartedAtMs, "Studio voice smoke started the synced insert before playback began");
        }
      } else {
        assert(Boolean(voiceResult.draftStartedAtISO8601), "Studio voice smoke did not start the early draft preview");
        assert(
          Boolean(voiceResult.renderPartialAtISO8601) || Boolean(voiceResult.commitAtISO8601),
          "Studio voice smoke did not receive an early render partial or early page commit"
        );
        if (Boolean(voiceResult.renderPartialAtISO8601)) {
          assert(draftStartedBeforeFirstDraftPaint, "Studio voice smoke did not paint the draft after preview start");
        }
        assert(breadcrumbEvents.includes("request_started"), "Studio voice smoke did not record request_started breadcrumb");
        assert(breadcrumbEvents.includes("placeholder_inserted"), "Studio voice smoke did not record placeholder_inserted breadcrumb");
        assert(breadcrumbEvents.includes("header_text_committed"), "Studio voice smoke did not record header_text_committed breadcrumb");
        assert(
          breadcrumbEvents.includes("render_stream_meta_received") || breadcrumbEvents.includes("request_committed"),
          "Studio voice smoke did not record an early render meta event or early page commit"
        );
        if (breadcrumbEvents.includes("render_stream_meta_received")) {
          assert(Boolean(String(voiceResult.renderRequestID || "").trim()), "Studio voice smoke did not surface the render request_id");
        }
        assert(breadcrumbEvents.includes("request_committed"), "Studio voice smoke did not record request_committed breadcrumb");
      }
    }
    if (requireThreadEntry) {
      assert(latestEntry, "Studio voice persistence smoke did not produce a Studio thread entry");
      assert(normalizeKey(latestEntry?.target) === "page", "Studio voice persistence smoke thread entry did not land on the page target");
      assert(Boolean(String(latestEntry?.insertedText || "").trim()), "Studio voice persistence smoke thread entry did not persist inserted page text");
    }
    if (latestEntry) {
      assert(normalizeKey(latestEntry?.target) === "page", "Studio voice smoke latest entry did not land on the page target");
      assert(Boolean(String(latestEntry?.insertedText || "").trim()), "Studio voice smoke latest entry did not persist inserted page text");
    }
    const finalCommittedPageText = String(
      voiceResult.finalCommittedPageText
      || latestEntry?.insertedText
      || ""
    ).trim();
    assert(finalCommittedPageText, "Studio voice smoke did not surface the final committed page text");
    if (String(typedScreenplayOutput?.text || "").trim()) {
      assert.equal(
        finalCommittedPageText,
        String(typedScreenplayOutput?.text || "").trim(),
        "Studio voice smoke final committed page text drifted from screenplay_output.text"
      );
    }
    if (voicePrompt === "Write one tense screenplay action line: She reaches the door before he can answer. That's it.") {
      const pageInsertText = String(latestEntry?.insertedText || voiceResult.insertedPreview || "").trim();
      const voicePinOutputText = String(
        latestEntry?.insertedText
        || latestEntry?.resolvedAnchorExcerpt
        || latestEntry?.noteBody
        || voiceResult.insertedPreview
        || ""
      ).trim();
      assertNoFormatterArtifacts(pageInsertText, "Studio voice smoke page insert");
      assertNoFormatterArtifacts(voicePinOutputText, "Studio voice smoke Voice Pin output");
    }

    result = {
      ok: true,
      appPath,
      appSession: smokeAppSession,
      scenario,
      throwawayProjectId: throwawayProject.projectId,
      throwawayProjectTitle: throwawayProject.title,
      voicePrompt,
      voiceTurn: voiceSend.turnId,
      voiceTurnMeta: voiceTurnMeta || {
        screenplay_output: typedScreenplayOutput,
        timing_source: typedTimingSource,
        screenplay_cues: typedScreenplayCues,
      },
      usedSnapshotScreenplayMeta: true,
      snapshotScreenplayMetaWasComplete: hasCompleteSnapshotMeta,
      commandReceivedToken: readDefaultInt("studio_debug_voice_turn_command_received_token"),
      openToken: readDefaultInt("studio_debug_open_token"),
      openAckToken: readDefaultInt("studio_debug_open_ack_token"),
      projectKey,
      requireThreadEntry,
      requireTalkResponse: effectiveRequireTalkResponse || requireTalkResponse,
      latestEntry,
      voiceResult: {
        ...voiceResult,
        breadcrumbs,
      },
      finalCommittedPageText,
      renderFirstDeltaBandMs: {
        min: minRenderFirstDeltaMs,
        max: maxRenderFirstDeltaMs,
        observed: renderServerFirstDeltaMs,
        asserted: shouldAssertRenderFirstDelta && !canSkipRenderFirstDeltaAssertion && !hasSyncedInsert,
      },
      debugTurnStartedAtISO8601: voiceResult.debugTurnStartedAtISO8601 || "",
      debugTurnFinalizingAtISO8601: voiceResult.debugTurnFinalizingAtISO8601 || "",
      debugTurnResultPersistedAtISO8601: voiceResult.debugTurnResultPersistedAtISO8601 || "",
      commitAtISO8601: fallbackCommitAtISO8601,
      talkResponseReceivedAtISO8601: fallbackTalkResponseReceivedAtISO8601,
      sawTalkRequestStarted,
      sawTalkResponseReceived,
      headerTextReadyAtISO8601: voiceResult.headerTextReadyAtISO8601 || "",
      headerTextReadyBeforeAssistantSpeech,
      draftStartedBeforeFirstDraftPaint,
      draftStartedBeforeAssistantSpeech,
      breadcrumbEvents,
    };
  } finally {
    writeDefaultString("clementine_voice_transport_mode", originalVoiceTransportMode || "turn_based");
    writeDefaultBool("studio_auto_insert", originalStudioAutoInsert);
    writeDefaultInt("studio_debug_voice_turn_token", 0);
    writeDefaultString("studio_debug_voice_turn_text", originalVoicePrompt);
    writeDefaultString("studio_debug_voice_turn_project_id", originalVoiceProjectId);
    writeDefaultInt("studio_debug_voice_turn_result_token", 0);
    writeDefaultString("studio_debug_voice_turn_result_status", originalVoiceResultStatus);
    writeDefaultString("studio_debug_voice_turn_result_error", originalVoiceResultError);
    writeDefaultString("studio_debug_voice_turn_result_json", originalVoiceResultJSON);
    writeDefaultString("studio_debug_voice_draft_trace_json", originalVoiceTraceJSON);
  }
  console.log(JSON.stringify(result, null, 2));
  console.log(`__STUDIO_CMDRETURN_RESULT__ ${JSON.stringify(result)}`);
  console.log("studio-cmdreturn-smoke: ok");
  process.exit(0);
}

const firstPrompt = readEnvString(
  "STUDIO_CMDRETURN_FIRST_PROMPT",
  "Write one new action line: He closes the blinds and waits."
);
let firstSend = null;
let firstSendAttempts = 1;
try {
  firstSend = await sendStudioPrompt(
  firstPrompt,
  "page",
  beforeHealth.last_turn_id,
  "none",
  promptTransport,
  {
    projectKey: loadedProjectKey,
  }
  );
} catch (error) {
  await throwWithStudioPromptDiagnostics(
    `Failed to submit first Studio prompt: ${firstPrompt}\nCause: ${error instanceof Error ? error.message : String(error)}`,
    {
      expectedProjectKey,
      prompt: firstPrompt,
      transport: promptTransport,
    }
  );
}
const projectKey = loadedProjectKey;
let firstEntry = null;
try {
  firstEntry = await waitForLatestThreadEntry(projectKey, firstSend.requestID, firstPrompt, 20000);
} catch (error) {
  if (promptTransport === "keyboard") {
    firstSendAttempts += 1;
    try {
      firstSend = await sendStudioPrompt(
        firstPrompt,
        "page",
        beforeHealth.last_turn_id,
        "none",
        promptTransport,
        {
          projectKey,
        }
      );
      firstEntry = await waitForLatestThreadEntry(projectKey, firstSend.requestID, firstPrompt, 20000);
    } catch (retryError) {
      await throwWithStudioPromptDiagnostics(
        `Failed to observe committed Studio entry after first prompt: ${firstPrompt}\nCause: ${retryError instanceof Error ? retryError.message : String(retryError)}`,
        {
          projectKey,
          expectedProjectKey,
          prompt: firstPrompt,
          requestID: firstSend.requestID,
          preparedToken: firstSend.preparedToken,
          transport: firstSend.transport,
          submitResult: firstSend.submitResult,
          armedState: firstSend.armedState,
          observedHealth: firstSend.observedHealth,
        }
      );
    }
  }
  if (firstEntry != null) {
    // Retry succeeded.
  } else {
  await throwWithStudioPromptDiagnostics(
    `Failed to observe committed Studio entry after first prompt: ${firstPrompt}`,
    {
      projectKey,
      expectedProjectKey,
      prompt: firstPrompt,
      requestID: firstSend.requestID,
      preparedToken: firstSend.preparedToken,
      transport: firstSend.transport,
      submitResult: firstSend.submitResult,
      armedState: firstSend.armedState,
      observedHealth: firstSend.observedHealth,
    }
  );
  }
}
const firstCommittedTurnId = deriveCommittedTurnId(firstEntry, firstSend);
const firstCommittedRequestID = String(firstEntry?.requestID || firstSend.requestID || "").trim();

if (scenario === "page-only") {
  const firstInsertedText = String(firstEntry?.insertedText || "").trim();
  assert(normalizeKey(firstEntry?.target) === "page", "Typed Studio page-write smoke did not land on the page target");
  assert(Boolean(normalizeKey(firstEntry?.writeID)), "Typed Studio page-write smoke did not produce a write ID");
  assert(firstInsertedText.length > 0, "Typed Studio page-write smoke did not persist inserted page text");

  const result = {
    ok: true,
    appPath,
    appSession: smokeAppSession,
    scenario,
    throwawayProjectId: throwawayProject.projectId,
    throwawayProjectTitle: throwawayProject.title,
    firstPrompt,
    firstSendTransport: firstSend.transport,
    firstSendAttempts,
    firstKeyboardShortcutAcked: firstSend.keyboardShortcutAcked,
    firstTurn: firstCommittedTurnId,
    firstRequestID: firstCommittedRequestID,
    firstObservedHealthTurn: firstSend.observedHealthTurnId,
    projectKey,
    firstEntry,
    firstInsertedPreview: firstInsertedText.slice(0, 220),
    baselineDiffState,
    fullThreadBrowseState: fullThreadBrowseStateForProject(projectKey),
    replacementTrace: readReplacementTraceEvents().slice(0, 8),
  };

  console.log(JSON.stringify(result, null, 2));
  console.log(`__STUDIO_CMDRETURN_RESULT__ ${JSON.stringify(result)}`);
  console.log("studio-cmdreturn-smoke: ok");
  process.exit(0);
}

if (scenario === "keyboard-submit-only") {
  const firstInsertedText = String(firstEntry?.insertedText || "").trim();
  assert(promptTransport === "keyboard", "Keyboard submit smoke must run with keyboard transport");
  assert(firstSend.keyboardShortcutAcked === true, "Keyboard submit smoke did not observe the hidden Cmd-Return shortcut ack");
  assert(normalizeKey(firstEntry?.target) === "page", "Keyboard submit smoke did not land on the page target");
  assert(Boolean(normalizeKey(firstEntry?.writeID)), "Keyboard submit smoke did not produce a write ID");
  assert(firstInsertedText.length > 0, "Keyboard submit smoke did not persist inserted page text");

  const result = {
    ok: true,
    appPath,
    appSession: smokeAppSession,
    scenario,
    throwawayProjectId: throwawayProject.projectId,
    throwawayProjectTitle: throwawayProject.title,
    firstPrompt,
    firstSendTransport: firstSend.transport,
    firstSendAttempts,
    firstKeyboardShortcutAcked: firstSend.keyboardShortcutAcked,
    firstTurn: firstCommittedTurnId,
    firstRequestID: firstCommittedRequestID,
    firstObservedHealthTurn: firstSend.observedHealthTurnId,
    projectKey,
    firstEntry,
    firstInsertedPreview: firstInsertedText.slice(0, 220),
    baselineDiffState,
    fullThreadBrowseState: fullThreadBrowseStateForProject(projectKey),
    replacementTrace: readReplacementTraceEvents().slice(0, 8),
  };

  console.log(JSON.stringify(result, null, 2));
  console.log(`__STUDIO_CMDRETURN_RESULT__ ${JSON.stringify(result)}`);
  console.log("studio-cmdreturn-smoke: ok");
  process.exit(0);
}

const rewritePrompt = "Rewrite only the last line shorter. Replace that line and do not add a new slugline or any extra lines.";
let secondSend = null;
let secondSendAttempts = 1;
try {
  secondSend = await sendStudioPrompt(rewritePrompt, "page", firstCommittedTurnId, "latest", promptTransport, {
    projectKey,
  });
} catch (error) {
  await throwWithStudioPromptDiagnostics(
    `Failed to submit rewrite Studio prompt: ${rewritePrompt}\nCause: ${error instanceof Error ? error.message : String(error)}`,
    {
      projectKey,
      expectedProjectKey,
      prompt: rewritePrompt,
      transport: promptTransport,
    }
  );
}
let secondEntry = null;
try {
  secondEntry = await waitForLatestThreadEntry(projectKey, secondSend.requestID, rewritePrompt, 20000);
} catch (error) {
  if (promptTransport === "keyboard") {
    secondSendAttempts += 1;
    try {
      secondSend = await sendStudioPrompt(rewritePrompt, "page", firstCommittedTurnId, "latest", promptTransport, {
        projectKey,
      });
      secondEntry = await waitForLatestThreadEntry(projectKey, secondSend.requestID, rewritePrompt, 20000);
    } catch (retryError) {
      await throwWithStudioPromptDiagnostics(
        `Failed to observe committed Studio entry after rewrite prompt: ${rewritePrompt}\nCause: ${retryError instanceof Error ? retryError.message : String(retryError)}`,
        {
          projectKey,
          expectedProjectKey,
          prompt: rewritePrompt,
          requestID: secondSend.requestID,
          preparedToken: secondSend.preparedToken,
          transport: secondSend.transport,
          submitResult: secondSend.submitResult,
          armedState: secondSend.armedState,
          observedHealth: secondSend.observedHealth,
        }
      );
    }
  }
  if (secondEntry != null) {
    // Retry succeeded.
  } else {
  await throwWithStudioPromptDiagnostics(
    `Failed to observe committed Studio entry after rewrite prompt: ${rewritePrompt}`,
    {
      projectKey,
      expectedProjectKey,
      prompt: rewritePrompt,
      requestID: secondSend.requestID,
      preparedToken: secondSend.preparedToken,
      transport: secondSend.transport,
      submitResult: secondSend.submitResult,
      armedState: secondSend.armedState,
      observedHealth: secondSend.observedHealth,
    }
  );
  }
}
const secondCommittedTurnId = deriveCommittedTurnId(secondEntry, secondSend);
const secondCommittedRequestID = String(secondEntry?.requestID || secondSend.requestID || "").trim();
assertLatestThreadEntryReplaced(secondEntry, "First rewrite");
assertReplacementLineage(secondEntry, firstEntry?.writeID, "First rewrite");
const lineageKey = normalizeKey(firstEntry?.writeID ? `lineage:${firstEntry.writeID}` : "");

const revisedState = await waitForDiffState((state) => {
  return normalizeKey(state.latestRevisedLineageKey) === lineageKey
    && normalizeKey(state.latestRevisedWriteID) === normalizeKey(firstEntry?.writeID)
    && normalizeKey(state.latestThreadWriteID) === normalizeKey(secondEntry?.writeID)
    && normalizeKey(state.latestThreadReplacedWriteID) === normalizeKey(firstEntry?.writeID)
    && state.latestThreadReplacementApplied === true;
}, "revised diff state after rewrite", 25000);

const latestRevisedKey = String(revisedState.latestRevisedKey || "").trim().toLowerCase();
assert(latestRevisedKey, "Revised diff state did not expose a latest diff key");
const expectedFocusedDiffKey = normalizeKey(firstEntry?.backendThreadID ? `thread:${firstEntry.backendThreadID}` : `write:${firstEntry?.writeID || ""}`);

const focusedRevisedState = await waitForDiffState((state) => {
  return normalizeKey(state.focusedDiffLineageKey) === lineageKey
    && normalizeKey(state.focusedDiffWriteID) === normalizeKey(firstEntry?.writeID)
    && normalizeKey(state.activeRevisedLineageKey) === lineageKey
    && normalizeKey(state.activeRevisedWriteID) === normalizeKey(firstEntry?.writeID);
}, "focused revised diff selection after first rewrite", 15000);
assertLineageState(
  focusedRevisedState,
  {
    focusedDiffKey: expectedFocusedDiffKey,
    focusedDiffLineageKey: lineageKey,
    focusedDiffWriteID: firstEntry?.writeID,
    activeRevisedKey: expectedFocusedDiffKey,
    activeRevisedLineageKey: lineageKey,
    activeRevisedWriteID: firstEntry?.writeID,
    activeLineageIncludesWriteID: firstEntry?.writeID,
  },
  "Focused revised diff selection"
);

await acknowledgeDiff(String(focusedRevisedState.focusedDiffKey || latestRevisedKey));
const acknowledgedState = await waitForDiffState((state) => {
  return Number(state.acknowledgedDiffCount || 0) >= Number(revisedState.acknowledgedDiffCount || 0) + 1
    || normalizeKey(state.latestAcknowledgedLineageKey) === lineageKey;
}, "acknowledged diff state", 10000).catch(() => readDebugDiffState());
assertLineageState(
  acknowledgedState,
  {
    acknowledgedLineageKey: lineageKey,
    acknowledgedWriteID: secondEntry?.writeID,
  },
  "Acknowledged diff"
);

let reopenedPrompt = "";
let thirdSend = {
  turnId: "",
  observedHealthTurnId: "",
  requestID: "",
  transport: "keyboard",
};
let thirdSendAttempts = 0;
let thirdEntry = null;
if (scenario !== "ack-only") {
  reopenedPrompt = "Rewrite that same line again, but make it more visual. Replace the same line only.";
  try {
    thirdSendAttempts = 1;
    thirdSend = await sendStudioPrompt(reopenedPrompt, "page", secondCommittedTurnId, "latest", promptTransport, {
      projectKey,
    });
  } catch (error) {
    await throwWithStudioPromptDiagnostics(
      `Failed to submit reopened Studio prompt: ${reopenedPrompt}\nCause: ${error instanceof Error ? error.message : String(error)}`,
      {
        projectKey,
        expectedProjectKey,
        prompt: reopenedPrompt,
        transport: promptTransport,
      }
    );
  }
  try {
    thirdEntry = await waitForLatestThreadEntry(projectKey, thirdSend.requestID, reopenedPrompt, 20000);
  } catch (error) {
    if (promptTransport === "keyboard") {
      thirdSendAttempts += 1;
      try {
        thirdSend = await sendStudioPrompt(reopenedPrompt, "page", secondCommittedTurnId, "latest", promptTransport, {
          projectKey,
        });
        thirdEntry = await waitForLatestThreadEntry(projectKey, thirdSend.requestID, reopenedPrompt, 20000);
      } catch (retryError) {
        await throwWithStudioPromptDiagnostics(
          `Failed to observe committed Studio entry after reopened prompt: ${reopenedPrompt}\nCause: ${retryError instanceof Error ? retryError.message : String(retryError)}`,
          {
            projectKey,
            expectedProjectKey,
            prompt: reopenedPrompt,
            requestID: thirdSend.requestID,
            preparedToken: thirdSend.preparedToken,
            transport: thirdSend.transport,
            submitResult: thirdSend.submitResult,
            armedState: thirdSend.armedState,
            observedHealth: thirdSend.observedHealth,
          }
        );
      }
    }
    if (thirdEntry != null) {
      // Retry succeeded.
    } else {
    await throwWithStudioPromptDiagnostics(
      `Failed to observe committed Studio entry after reopened prompt: ${reopenedPrompt}`,
      {
        projectKey,
        expectedProjectKey,
        prompt: reopenedPrompt,
        requestID: thirdSend.requestID,
        preparedToken: thirdSend.preparedToken,
        transport: thirdSend.transport,
        submitResult: thirdSend.submitResult,
        armedState: thirdSend.armedState,
        observedHealth: thirdSend.observedHealth,
      }
    );
    }
  }
  assertLatestThreadEntryReplaced(thirdEntry, "Second rewrite");
  assertReplacementLineage(thirdEntry, secondEntry?.writeID, "Second rewrite");
}
const thirdCommittedTurnId = deriveCommittedTurnId(thirdEntry, thirdSend);
const thirdCommittedRequestID = String(thirdEntry?.requestID || thirdSend.requestID || "").trim();
const fullThreadBrowseState = fullThreadBrowseStateForProject(projectKey);

const result = {
  ok: true,
  appPath,
  appSession: smokeAppSession,
  scenario,
  throwawayProjectId: throwawayProject.projectId,
  throwawayProjectTitle: throwawayProject.title,
  firstPrompt,
  firstSendTransport: firstSend.transport,
  rewritePrompt,
  reopenedPrompt,
  firstSendAttempts,
  secondSendAttempts,
  thirdSendAttempts,
  firstKeyboardShortcutAcked: firstSend.keyboardShortcutAcked,
  secondKeyboardShortcutAcked: secondSend.keyboardShortcutAcked,
  thirdKeyboardShortcutAcked: thirdSend.keyboardShortcutAcked,
  firstTurn: firstCommittedTurnId,
  secondTurn: secondCommittedTurnId,
  thirdTurn: thirdCommittedTurnId,
  firstRequestID: firstCommittedRequestID,
  secondRequestID: secondCommittedRequestID,
  thirdRequestID: thirdCommittedRequestID,
  firstObservedHealthTurn: firstSend.observedHealthTurnId,
  secondObservedHealthTurn: secondSend.observedHealthTurnId,
  thirdObservedHealthTurn: thirdSend.observedHealthTurnId,
  projectKey,
  firstEntry,
  latestRevisedKey,
  secondEntry,
  thirdEntry,
  baselineDiffState,
  revisedState,
  acknowledgedState,
  fullThreadBrowseState,
  replacementTrace: readReplacementTraceEvents().slice(0, 8),
};

console.log(JSON.stringify(result, null, 2));
console.log(`__STUDIO_CMDRETURN_RESULT__ ${JSON.stringify(result)}`);
console.log("studio-cmdreturn-smoke: ok");
