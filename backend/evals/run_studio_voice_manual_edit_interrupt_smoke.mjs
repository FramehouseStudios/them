import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createStudioEvalDebugContext,
  ensureStudioProjectLoadedWithDebugHook,
  ensureStudioVisibleWithOpenHandshake,
  sleepMs,
  STUDIO_DEBUG_LOAD_PROJECT_REQUEST_PATH,
  waitForCondition,
} from "./studio_eval_debug_utils.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const studioAppSessionHelperPath = path.join(__dirname, "studio_app_session_helper.sh");

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

const LOCAL_BACKEND_BASE_URL = String(process.env.THEM_BASE_URL || "").trim() || "http://127.0.0.1:3000";
const voicePrompt = [
  "Write exactly this screenplay block and nothing else:",
  "INT. WAREHOUSE - NIGHT",
  "",
  "MAYA",
  "ALPHA-SIGNAL. Hold the far door until I say go.",
  "",
  "JONAH",
  "BETA-SIGNAL. Count three beats and cut the lights.",
  "",
  "MAYA",
  "GAMMA-SIGNAL. Move only after the generator dies.",
].join("\n");
const initialDraft = [
  "INT. HALLWAY - NIGHT",
  "",
  "MAYA waits by the exit and listens for the elevator.",
].join("\n");
const manualMarker = `VOICE-MANUAL-EDIT-${Date.now().toString(36).toUpperCase()}`;
const unappliedCueProbe = "ALPHA-SIGNAL. Hold the far door until I say go.";

const debugIntKeys = new Set([
  "studio_debug_open_token",
  "studio_debug_open_ack_token",
  "studio_debug_load_project_token",
  "studio_debug_load_project_ack_token",
  "studio_debug_focus_page_token",
  "studio_debug_focus_page_ack_token",
  "studio_debug_voice_turn_token",
  "studio_debug_voice_turn_command_received_token",
  "studio_debug_voice_turn_ack_token",
  "studio_debug_voice_turn_result_token",
]);
const debugBoolKeys = new Set([
  "studio_auto_insert",
]);
const debugDefaultKeys = [
  "backend_base_url",
  "clementine_voice_transport_mode",
  "user_id",
  "client_token",
  "studio_auto_insert",
  "studio_debug_open_token",
  "studio_debug_open_ack_token",
  "studio_debug_load_project_token",
  "studio_debug_load_project_id",
  "studio_debug_load_project_version_id",
  "studio_debug_load_project_ack_token",
  "studio_debug_project_load_trace_json",
  "studio_debug_diff_state_json",
  "studio_debug_focus_page_token",
  "studio_debug_focus_page_ack_token",
  "studio_debug_voice_turn_token",
  "studio_debug_voice_turn_command_received_token",
  "studio_debug_voice_turn_ack_token",
  "studio_debug_voice_turn_text",
  "studio_debug_voice_turn_project_id",
  "studio_debug_voice_turn_result_token",
  "studio_debug_voice_turn_result_status",
  "studio_debug_voice_turn_result_error",
  "studio_debug_voice_turn_result_json",
  "studio_debug_voice_draft_trace_json",
];

const debugContext = createStudioEvalDebugContext({ run, runOptional });
const {
  defaults: debugDefaults,
  readDefaultString,
  readDefaultInt,
  writeDefaultString,
  writeDefaultInt,
  writeDefaultBool,
  nextToken,
} = debugContext;
const debugDomains = Array.isArray(debugDefaults?.domains) ? debugDefaults.domains : ["io.them.them"];
const originalDefaults = Object.fromEntries(
  debugDefaultKeys.map((key) => [key, readDefaultString(key)])
);

function readDomainResults(key) {
  const results = [];
  for (const domain of debugDomains) {
    const result = runOptional("defaults", ["read", domain, key]);
    if (result.status !== 0) continue;
    results.push({
      domain,
      value: result.stdout.trim(),
    });
  }
  return results;
}

function readDefaultsJSON(key, fallback = null) {
  const results = readDomainResults(key);
  for (const entry of [...results].reverse()) {
    if (!entry.value) continue;
    try {
      return JSON.parse(entry.value);
    } catch {
      continue;
    }
  }
  return fallback;
}

function readDebugDiffState(preferredProjectId = "") {
  const candidates = readDomainResults("studio_debug_diff_state_json")
    .map((entry) => {
      try {
        return JSON.parse(entry.value);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  if (!candidates.length) return null;
  const normalizedPreferred = String(preferredProjectId || "").trim().toLowerCase();
  if (normalizedPreferred) {
    const preferredProjectKey = `project:${normalizedPreferred}`;
    const matched = [...candidates].reverse().find((state) => {
      const selectedProjectID = String(state?.selectedProjectID || "").trim().toLowerCase();
      const projectKey = String(state?.projectKey || "").trim().toLowerCase();
      return selectedProjectID === normalizedPreferred || projectKey === preferredProjectKey;
    });
    if (matched) return matched;
  }
  return candidates[candidates.length - 1];
}

function readIdentityString(key) {
  const results = readDomainResults(key);
  const preferred = [...results].reverse().find((entry) => entry.value.length > 0);
  return (preferred || results[results.length - 1] || { value: "" }).value;
}

function deleteDefaultKey(key) {
  for (const domain of debugDomains) {
    runOptional("defaults", ["delete", domain, key]);
  }
}

function restoreDefaultKey(key, value) {
  if (!String(value || "").length) {
    deleteDefaultKey(key);
    return;
  }
  if (debugIntKeys.has(key)) {
    writeDefaultInt(key, Number(value) || 0);
    return;
  }
  if (debugBoolKeys.has(key)) {
    const normalized = String(value).trim().toLowerCase();
    writeDefaultBool(key, normalized === "1" || normalized === "true" || normalized === "yes");
    return;
  }
  writeDefaultString(key, value);
}

function localBackendURL(path = "/") {
  const base = LOCAL_BACKEND_BASE_URL.endsWith("/")
    ? LOCAL_BACKEND_BASE_URL
    : `${LOCAL_BACKEND_BASE_URL}/`;
  const cleanPath = String(path || "").replace(/^\/+/, "");
  return new URL(cleanPath, base).toString();
}

async function readHealth() {
  return await new Promise((resolve, reject) => {
    const req = http.get(localBackendURL("/health"), (res) => {
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

function ownerHeaders() {
  const headers = {
    "Content-Type": "application/json",
    "X-APP-TOKEN": "them-dev",
  };
  const userId = readIdentityString("user_id");
  if (userId) {
    headers["X-User-Id"] = userId;
  }
  const clientToken = readIdentityString("client_token");
  assert(clientToken, "Missing owner identity in io.them.them defaults");
  headers["X-Client-Token"] = clientToken;
  return headers;
}

async function ensureOwnerIdentity() {
  const userId = readIdentityString("user_id");
  const clientToken = readIdentityString("client_token");
  if (userId || clientToken) {
    return {
      userId,
      clientToken,
      bootstrapped: false,
    };
  }
  const response = await fetch(localBackendURL("/session"), {
    method: "POST",
    headers: {
      "X-APP-TOKEN": "them-dev",
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Failed to bootstrap Studio owner identity: ${response.status} ${JSON.stringify(payload)}`);
  }
  const nextUserId = String(payload?.user_id || "").trim();
  const nextClientToken = String(payload?.client_token || payload?.session_id || "").trim();
  assert(nextUserId || nextClientToken, "Session bootstrap did not return an owner identity");
  if (nextUserId) {
    writeDefaultString("user_id", nextUserId);
  }
  if (nextClientToken) {
    writeDefaultString("client_token", nextClientToken);
  }
  return {
    userId: nextUserId,
    clientToken: nextClientToken,
    bootstrapped: true,
  };
}

async function createThrowawayStudioProject(prefix, label) {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const projectId = `${prefix}-${stamp}`;
  const title = `${label} ${stamp}`;
  const response = await fetch(localBackendURL("/screenplay/projects"), {
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

async function seedProjectVersion(projectId, title, draft, source) {
  const response = await fetch(localBackendURL(`/screenplay/projects/${projectId}/version`), {
    method: "POST",
    headers: ownerHeaders(),
    body: JSON.stringify({
      draft,
      title,
      phase: "scene_draft",
      source,
      notes: "Studio voice manual edit interrupt smoke seed",
      base_version_id: "",
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Failed to seed Studio draft version: ${response.status} ${JSON.stringify(payload)}`);
  }
  const versionId = String(
    payload?.payload?.versionId
    || payload?.payload?.version?.id
    || payload?.versionId
    || payload?.version?.id
    || ""
  ).trim();
  return {
    payload,
    versionId,
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

function osascript(lines) {
  const args = [];
  for (const line of lines) args.push("-e", line);
  return run("osascript", args);
}

function appHasWindow() {
  const output = osascript([
    "try",
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
  if (appPath) {
    runOptional("open", ["-na", appPath]);
  }
  runOptional("osascript", ["-e", 'tell application "them" to activate']);
}

function appleScriptQuoted(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"');
}

async function focusPageEditor({ moveToEnd = false } = {}) {
  const token = nextToken("studio_debug_focus_page_token", "studio_debug_focus_page_ack_token");
  writeDefaultInt("studio_debug_focus_page_ack_token", 0);
  writeDefaultInt("studio_debug_focus_page_token", token);
  await waitForCondition(
    () => readDefaultInt("studio_debug_focus_page_ack_token") === token,
    "Studio page focus ack",
    10000,
    150
  );
  if (!moveToEnd) return;
  activateApp();
  osascript([
    'tell application "them" to activate',
    'delay 0.2',
    'tell application "System Events"',
    'tell process "them" to set frontmost to true',
    'delay 0.1',
    'key code 125 using {command down}',
    'end tell',
  ]);
}

function injectKeystrokeEdit(marker) {
  osascript([
    'tell application "them" to activate',
    'delay 0.2',
    'tell application "System Events"',
    'tell process "them" to set frontmost to true',
    'delay 0.1',
    'key code 36',
    `keystroke "${appleScriptQuoted(marker)}"`,
    'end tell',
  ]);
}

function studioVoiceTurnTraceKey(token) {
  return `studio_debug_voice_draft_trace_json_${token}`;
}

function studioVoiceTurnResultKey(token) {
  return `studio_debug_voice_turn_result_json_${token}`;
}

function readVoiceBreadcrumbs(token) {
  const tokenSpecific = readDefaultsJSON(studioVoiceTurnTraceKey(token), []);
  if (Array.isArray(tokenSpecific) && tokenSpecific.length) {
    return tokenSpecific;
  }
  const globalTrace = readDefaultsJSON("studio_debug_voice_draft_trace_json", []);
  if (!Array.isArray(globalTrace)) return [];
  return globalTrace.filter((entry) => Number(entry?.token || token) === token);
}

function readVoiceResult(token) {
  const tokenSpecific = readDefaultsJSON(studioVoiceTurnResultKey(token), null);
  if (tokenSpecific && Number(tokenSpecific?.token || 0) === token) {
    return tokenSpecific;
  }
  const globalResult = readDefaultsJSON("studio_debug_voice_turn_result_json", null);
  if (globalResult && Number(globalResult?.token || 0) === token) {
    return globalResult;
  }
  return null;
}

function cueApplicationCount(breadcrumbs) {
  return breadcrumbs.filter((entry) => String(entry?.event || "") === "synced_insert_cue_applied").length;
}

function normalizeText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function combinedDraftPreview(state) {
  return [state?.draftPreview || "", state?.draftTailPreview || ""]
    .filter(Boolean)
    .join("\n");
}

async function sendStudioVoiceTurn(prompt, projectId) {
  const token = nextToken(
    "studio_debug_voice_turn_token",
    "studio_debug_voice_turn_command_received_token",
    "studio_debug_voice_turn_ack_token",
    "studio_debug_voice_turn_result_token"
  );
  writeDefaultString("studio_debug_voice_turn_text", prompt);
  writeDefaultString("studio_debug_voice_turn_project_id", projectId);
  writeDefaultInt("studio_debug_voice_turn_command_received_token", 0);
  writeDefaultInt("studio_debug_voice_turn_ack_token", 0);
  writeDefaultInt("studio_debug_voice_turn_result_token", 0);
  writeDefaultString("studio_debug_voice_turn_result_status", "");
  writeDefaultString("studio_debug_voice_turn_result_error", "");
  writeDefaultString("studio_debug_voice_turn_result_json", "");
  writeDefaultString("studio_debug_voice_draft_trace_json", "[]");
  writeDefaultString(studioVoiceTurnResultKey(token), "");
  writeDefaultString(studioVoiceTurnTraceKey(token), "[]");
  writeDefaultInt("studio_debug_voice_turn_token", 0);
  await sleepMs(120);
  writeDefaultInt("studio_debug_voice_turn_token", token);
  await waitForCondition(
    () => readDefaultInt("studio_debug_voice_turn_command_received_token") === token,
    "Studio voice command received",
    20000,
    150
  );
  await waitForCondition(
    () => readDefaultInt("studio_debug_voice_turn_ack_token") === token,
    "Studio voice ack",
    20000,
    150
  );
  return token;
}

function cleanupVoiceToken(token) {
  if (token <= 0) return;
  writeDefaultString(studioVoiceTurnResultKey(token), "");
  writeDefaultString(studioVoiceTurnTraceKey(token), "[]");
}

let appPath = "";
let openResult = null;
let autoInsertDisabledProject = null;
let manualInterruptProject = null;
let autoInsertDisabledLoad = null;
let manualInterruptLoad = null;
let ownerIdentity = null;
let autoInsertDisabledVoiceToken = 0;
let manualInterruptVoiceToken = 0;
let smokeFailure = null;

try {
  const health = await readHealth();
  assert.equal(health?.ok, true, "Backend health is not OK on localhost:3000");
  ownerIdentity = await ensureOwnerIdentity();

  writeDefaultString("backend_base_url", LOCAL_BACKEND_BASE_URL);
  writeDefaultString("clementine_voice_transport_mode", "turn_based");

  appPath = findDebugAppPath();
  openResult = await ensureStudioVisibleWithOpenHandshake({
    appPath,
    debugDefaults,
    helperPath: studioAppSessionHelperPath,
    runOptional,
    activateApp,
    appHasWindow,
    readDebugDiffState,
  });

  autoInsertDisabledProject = await createThrowawayStudioProject(
    "studio-voice-auto-insert-disabled",
    "Studio Voice Auto Insert Disabled Smoke"
  );
  const autoInsertDisabledSeed = await seedProjectVersion(
    autoInsertDisabledProject.projectId,
    autoInsertDisabledProject.title,
    initialDraft,
    "studio_voice_manual_edit_interrupt_seed_disabled"
  );
  writeDefaultBool("studio_auto_insert", false);
  autoInsertDisabledLoad = await ensureStudioProjectLoadedWithDebugHook({
    debugDefaults,
    projectId: autoInsertDisabledProject.projectId,
    versionId: autoInsertDisabledSeed.versionId,
    readDebugDiffState,
  });
  await focusPageEditor({ moveToEnd: true });
  autoInsertDisabledVoiceToken = await sendStudioVoiceTurn(voicePrompt, autoInsertDisabledProject.projectId);
  await waitForCondition(
    () => readVoiceResult(autoInsertDisabledVoiceToken) != null,
    "voice result with auto-insert disabled",
    45000,
    250
  );
  await sleepMs(1200);

  const autoInsertDisabledResult = readVoiceResult(autoInsertDisabledVoiceToken) || {};
  const autoInsertDisabledBreadcrumbs = readVoiceBreadcrumbs(autoInsertDisabledVoiceToken);
  const autoInsertDisabledEvents = autoInsertDisabledBreadcrumbs.map((entry) => String(entry?.event || ""));
  const autoInsertDisabledState = readDebugDiffState(autoInsertDisabledProject.projectId) || readDebugDiffState();
  const autoInsertDisabledVisibleDraft = combinedDraftPreview(autoInsertDisabledState);
  const normalizedAutoInsertDisabledDraft = normalizeText(autoInsertDisabledVisibleDraft);

  assert.equal(
    String(autoInsertDisabledResult?.screenplayOutputTarget || "").trim(),
    "page",
    "Manual interrupt smoke did not route the auto-insert-disabled probe through the screenplay page path"
  );
  assert.equal(
    Boolean(autoInsertDisabledResult?.preparedShouldWriteToPage),
    true,
    "Manual interrupt smoke did not prepare a page write when auto-insert was disabled"
  );
  assert(
    !autoInsertDisabledEvents.includes("synced_insert_started"),
    "Manual interrupt smoke still started a synced insert with auto-insert disabled"
  );
  assert(
    !autoInsertDisabledEvents.includes("synced_insert_cancelled"),
    "Manual interrupt smoke unexpectedly cancelled a synced insert with auto-insert disabled"
  );
  assert(
    !autoInsertDisabledEvents.includes("synced_insert_finished"),
    "Manual interrupt smoke unexpectedly finished a synced insert with auto-insert disabled"
  );
  assert.equal(
    String(autoInsertDisabledState?.selectedProjectID || "").trim(),
    autoInsertDisabledProject.projectId,
    "Manual interrupt smoke drifted away from the explicit auto-insert-disabled project"
  );
  assert(
    !normalizedAutoInsertDisabledDraft.includes(normalizeText(unappliedCueProbe)),
    "Manual interrupt smoke still wrote screenplay text to the page with auto-insert disabled"
  );

  manualInterruptProject = await createThrowawayStudioProject(
    "studio-voice-manual-edit",
    "Studio Voice Manual Edit Smoke"
  );
  const manualInterruptSeed = await seedProjectVersion(
    manualInterruptProject.projectId,
    manualInterruptProject.title,
    initialDraft,
    "studio_voice_manual_edit_interrupt_seed_enabled"
  );
  writeDefaultBool("studio_auto_insert", true);
  manualInterruptLoad = await ensureStudioProjectLoadedWithDebugHook({
    debugDefaults,
    projectId: manualInterruptProject.projectId,
    versionId: manualInterruptSeed.versionId,
    readDebugDiffState,
  });
  await focusPageEditor({ moveToEnd: true });
  manualInterruptVoiceToken = await sendStudioVoiceTurn(voicePrompt, manualInterruptProject.projectId);

  let cueCountAtEdit = 0;
  await waitForCondition(() => {
    const breadcrumbs = readVoiceBreadcrumbs(manualInterruptVoiceToken);
    const events = breadcrumbs.map((entry) => String(entry?.event || ""));
    cueCountAtEdit = cueApplicationCount(breadcrumbs);
    return events.includes("synced_insert_started") && cueCountAtEdit >= 1;
  }, "synced insert to start and paint the first cue", 45000, 100);

  injectKeystrokeEdit(manualMarker);

  await waitForCondition(() => {
    const cancelBreadcrumb = readVoiceBreadcrumbs(manualInterruptVoiceToken)
      .find((entry) => String(entry?.event || "") === "synced_insert_cancelled");
    return String(cancelBreadcrumb?.interruptionReason || "").trim() === "manual_typing";
  }, "manual typing interruption reason", 30000, 100);
  await waitForCondition(
    () => readVoiceResult(manualInterruptVoiceToken) != null,
    "voice result snapshot after manual edit cancellation",
    45000,
    250
  );
  await sleepMs(1200);

  const finalBreadcrumbs = readVoiceBreadcrumbs(manualInterruptVoiceToken);
  const finalEvents = finalBreadcrumbs.map((entry) => String(entry?.event || ""));
  const finalCueCount = cueApplicationCount(finalBreadcrumbs);
  const manualCancelBreadcrumb = finalBreadcrumbs.find(
    (entry) => String(entry?.event || "") === "synced_insert_cancelled"
  ) || null;
  const voiceResult = readVoiceResult(manualInterruptVoiceToken) || {};
  const screenplayCues = Array.isArray(voiceResult.screenplayCues) ? voiceResult.screenplayCues : [];
  const nextUnappliedCueText = cueCountAtEdit < screenplayCues.length
    ? String(screenplayCues[cueCountAtEdit]?.text || "").trim()
    : "";
  const diffState = readDebugDiffState(manualInterruptProject.projectId) || readDebugDiffState();
  const visibleDraft = combinedDraftPreview(diffState);
  const normalizedVisibleDraft = normalizeText(visibleDraft);

  assert(finalEvents.includes("synced_insert_started"), "Manual interrupt smoke did not start a synced insert");
  assert(finalEvents.includes("synced_insert_cancelled"), "Manual interrupt smoke did not record synced insert cancellation");
  assert(!finalEvents.includes("synced_insert_finished"), "Manual interrupt smoke let the synced insert finish after a user edit");
  assert.equal(
    String(manualCancelBreadcrumb?.interruptionReason || "").trim(),
    "manual_typing",
    "Manual interrupt smoke did not emit the manual_typing interruption reason"
  );
  assert.equal(
    String(voiceResult?.syncedInsertInterruptionReason || "").trim(),
    "manual_typing",
    "Manual interrupt smoke left the synced insert result without an explicit manual_typing reason"
  );
  assert.equal(
    finalCueCount,
    cueCountAtEdit,
    `Manual interrupt smoke allowed additional synced cues after the user edit (${cueCountAtEdit} -> ${finalCueCount})`
  );
  assert.equal(
    String(diffState?.selectedProjectID || "").trim(),
    manualInterruptProject.projectId,
    "Manual interrupt smoke drifted away from the explicit manual-edit project"
  );
  assert(visibleDraft.includes(manualMarker), "Manual interrupt smoke did not preserve the user's typed marker on the page");
  assert(screenplayCues.length >= 2, `Manual interrupt smoke expected multiple screenplay cues, got ${screenplayCues.length}`);
  if (nextUnappliedCueText) {
    assert(
      !normalizedVisibleDraft.includes(normalizeText(nextUnappliedCueText)),
      `Manual interrupt smoke still painted an unapplied cue after cancellation: ${nextUnappliedCueText}`
    );
  }

  console.log(JSON.stringify({
    ok: true,
    appPath,
    openResult,
    ownerIdentity,
    autoInsertDisabled: {
      projectId: autoInsertDisabledProject.projectId,
      versionId: autoInsertDisabledSeed.versionId,
      projectLoadEvents: (autoInsertDisabledLoad?.breadcrumbs || []).map((entry) => String(entry?.event || "")),
      voiceToken: autoInsertDisabledVoiceToken,
      breadcrumbEvents: autoInsertDisabledEvents,
      draftTailPreview: autoInsertDisabledState?.draftTailPreview || "",
      screenplayOutputTarget: autoInsertDisabledResult?.screenplayOutputTarget || "",
    },
    manualInterrupt: {
      projectId: manualInterruptProject.projectId,
      versionId: manualInterruptSeed.versionId,
      projectLoadEvents: (manualInterruptLoad?.breadcrumbs || []).map((entry) => String(entry?.event || "")),
      voiceToken: manualInterruptVoiceToken,
      manualMarker,
      cueCountAtEdit,
      finalCueCount,
      screenplayCueCount: screenplayCues.length,
      nextUnappliedCueText,
      interruptionReason: manualCancelBreadcrumb?.interruptionReason || "",
      breadcrumbEvents: finalEvents,
      draftTailPreview: diffState?.draftTailPreview || "",
    },
  }, null, 2));
  console.log("studio-voice-manual-edit-interrupt-smoke: ok");
} catch (error) {
  smokeFailure = error;
} finally {
  cleanupVoiceToken(autoInsertDisabledVoiceToken);
  cleanupVoiceToken(manualInterruptVoiceToken);
  const restoreErrors = [];
  if (existsSync(STUDIO_DEBUG_LOAD_PROJECT_REQUEST_PATH)) {
    try {
      unlinkSync(STUDIO_DEBUG_LOAD_PROJECT_REQUEST_PATH);
    } catch (error) {
      restoreErrors.push(
        `load_project_request_file: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  for (const [key, value] of Object.entries(originalDefaults)) {
    try {
      restoreDefaultKey(key, value);
    } catch (error) {
      restoreErrors.push(`${key}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (restoreErrors.length) {
    const message = `Manual interrupt smoke cleanup failed: ${restoreErrors.join(" | ")}`;
    if (smokeFailure) {
      console.warn(message);
    } else {
      throw new Error(message);
    }
  }
}

if (smokeFailure) {
  throw smokeFailure;
}
