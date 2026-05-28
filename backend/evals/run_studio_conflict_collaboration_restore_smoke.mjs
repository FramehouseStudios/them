import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import http from "node:http";
import {
  createStudioEvalDebugContext,
  ensureStudioProjectLoadedWithDebugHook,
  ensureStudioVisibleWithOpenHandshake,
  stageStudioProjectLoadDebugRequest,
} from "./studio_eval_debug_utils.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || result.error?.message || `${command} failed`).trim());
  }
  return (result.stdout || "").trim();
}

function runOptional(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  return {
    status: result.status ?? 1,
    stdout: (result.stdout || "").trim(),
    stderr: (result.stderr || result.error?.message || "").trim(),
  };
}

function osascript(lines) {
  const args = [];
  for (const line of lines) args.push("-e", line);
  return run("osascript", args);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate, description, timeoutMs = 20000, intervalMs = 250) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await sleep(intervalMs);
  }
  throw new Error(`Timed out waiting for ${description}`);
}

async function waitForState(predicate, description, timeoutMs = 20000, intervalMs = 250) {
  try {
    await waitFor(() => {
      const state = readDebugDiffState();
      return Boolean(state && predicate(state));
    }, description, timeoutMs, intervalMs);
  } catch (error) {
    const state = readDebugDiffState();
    throw new Error(`${error?.message || error}\nLatest Studio debug state: ${JSON.stringify(state, null, 2)}`);
  }
}

async function readHealth() {
  return await new Promise((resolve, reject) => {
    const req = http.get("http://127.0.0.1:3000/health", (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on("error", reject);
    req.setTimeout(10000, () => req.destroy(new Error("health request timed out")));
  });
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

const studioDebug = createStudioEvalDebugContext({ run, runOptional });

function readDefaultString(key) {
  return studioDebug.readDefaultString(key);
}

function writeDefaultString(key, value) {
  studioDebug.writeDefaultString(key, value);
}

function readDefaultInt(key) {
  return studioDebug.readDefaultInt(key);
}

function writeDefaultInt(key, value) {
  studioDebug.writeDefaultInt(key, value);
}

function writeDefaultBool(key, value) {
  studioDebug.writeDefaultBool(key, value);
}

function readJsonDefaultValue(key, fallback = null) {
  return studioDebug.readJsonDefault(key, fallback);
}

function readDebugDiffState() {
  return studioDebug.readDebugDiffState(null);
}

function normalizeKey(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeText(value) {
  return String(value || "").replace(/\\[nr]/g, " ").replace(/\s+/g, " ").trim();
}

async function postBackendAuthJSON(path, body, headers = {
  "Content-Type": "application/json",
  "X-APP-TOKEN": "them-dev",
}) {
  const response = await fetch(`http://127.0.0.1:3000${path}`, {
    method: "POST",
    headers: {
      ...headers,
      Connection: "close",
    },
    body: JSON.stringify(body || {}),
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

async function ensureOwnerIdentity(projectId) {
  const email = `studio-conflict-${projectId}-${randomUUID()}@example.test`.toLowerCase();
  const password = `ThemConflict-${randomUUID()}-aA1!`;
  const signup = await postBackendAuthJSON("/auth/signup", {
    email,
    password,
    display_name: "Studio Conflict Restore Smoke",
  });
  assert(
    signup.response.ok,
    `Failed to create Studio conflict owner: ${signup.response.status} ${JSON.stringify(signup.payload)}`
  );
  const accessToken = String(signup.payload?.access_token || signup.payload?.accessToken || "").trim();
  const userId = String(
    signup.payload?.user?.id ||
    signup.payload?.user?.user_id ||
    signup.payload?.user?.userId ||
    signup.payload?.user_id ||
    signup.payload?.userId ||
    ""
  ).trim();
  assert(accessToken, "Studio conflict owner signup did not return an access token");
  assert(userId, "Studio conflict owner signup did not return a user id");

  const session = await postBackendAuthJSON("/session", {}, {
    "Content-Type": "application/json",
    "X-APP-TOKEN": "them-dev",
    Authorization: `Bearer ${accessToken}`,
  });
  assert(
    session.response.ok,
    `Failed to create Studio conflict client session: ${session.response.status} ${JSON.stringify(session.payload)}`
  );
  const clientToken = String(session.payload?.client_token || session.payload?.session_id || "").trim();
  assert(clientToken, "Studio conflict client session did not return a client token");

  writeDefaultString("user_id", userId);
  writeDefaultString("client_token", clientToken);
  writeDefaultInt("client_token_cached_at", Math.floor(Date.now() / 1000));
  writeDefaultString("client_token_base_url", "http://127.0.0.1:3000");
  const expiresIn = Math.max(60, Number(session.payload?.expires_in || 0) || 0);
  writeDefaultString("client_token_expiry", new Date(Date.now() + expiresIn * 1000).toISOString());
  writeDefaultString("auth_debug_access_token", accessToken);
  writeDefaultBool("auth_debug_access_token_enabled", true);

  return { userId, clientToken, accessToken };
}

function ownerHeaders() {
  const headers = {
    "Content-Type": "application/json",
    "X-APP-TOKEN": "them-dev",
  };
  const accessToken = readDefaultString("auth_debug_access_token");
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const clientToken = readDefaultString("client_token");
  assert(clientToken, "Missing owner identity in io.them.them defaults");
  headers["X-Client-Token"] = clientToken;
  return headers;
}

async function fetchBackendJSON(path, { method = "GET", body = null, headers = ownerHeaders() } = {}) {
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:3000${path}`, {
        method,
        headers: {
          ...headers,
          Connection: "close",
        },
        body: body == null ? undefined : JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      return { response, payload };
    } catch (error) {
      lastError = error;
      const retryable = /ECONNRESET|fetch failed|socket|network/i.test(String(error?.message || error));
      if (!retryable || attempt === 3) break;
      await sleep(400 * attempt);
    }
  }
  throw lastError || new Error(`Backend request failed for ${method} ${path}`);
}

async function postBackendProject(projectId, title) {
  const result = await fetchBackendJSON("/screenplay/projects", {
    method: "POST",
    body: {
      project_id: projectId,
      title,
      phase: "scene_draft",
      activate: true,
    },
  });
  if (!result.response.ok) {
    throw new Error(`Failed to create Studio conflict project: ${result.response.status} ${JSON.stringify(result.payload)}`);
  }
  return result.payload;
}

async function postBackendProjectVersion(projectId, title, draft, baseVersionId = "", source = "studio_conflict_collaboration_seed") {
  const result = await fetchBackendJSON(`/screenplay/projects/${projectId}/version`, {
    method: "POST",
    body: {
      draft,
      title,
      phase: "scene_draft",
      source,
      notes: "Studio conflict collaboration restore smoke",
      base_version_id: baseVersionId,
      conflict_strategy: "reject_if_stale",
    },
  });
  if (!result.response.ok) {
    throw new Error(`Failed to seed Studio conflict version: ${result.response.status} ${JSON.stringify(result.payload)}`);
  }
  return result.payload;
}

function projectVersionIdFromPayload(payload) {
  return String(
    payload?.payload?.version_id
      || payload?.payload?.versionId
      || payload?.payload?.version?.id
      || payload?.version_id
      || payload?.versionId
      || payload?.version?.id
      || ""
  ).trim();
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

function appIsRunning() {
  return appProcessIDs().length > 0;
}

function appProcessIDs() {
  const values = [];
  const pgrep = runOptional("pgrep", ["-x", "them"]);
  if (pgrep.status === 0 && pgrep.stdout.trim()) {
    values.push(...pgrep.stdout.split(/\s+/));
  }
  const systemEvents = runOptional("osascript", [
    "-e", "try",
    "-e", 'tell application "System Events" to get unix id of every process whose name is "them"',
    "-e", "on error",
    "-e", 'return ""',
    "-e", "end try",
  ]);
  if (systemEvents.status === 0 && systemEvents.stdout.trim()) {
    values.push(...systemEvents.stdout.split(/[,\s]+/));
  }
  return Array.from(new Set(
    values
      .map((value) => Number(String(value || "").trim()))
      .filter((value) => Number.isInteger(value) && value > 0)
  ));
}

function activateApp(appPath = "") {
  if (appPath && !appIsRunning()) {
    runOptional("open", [appPath]);
  }
  runOptional("osascript", ["-e", 'tell application "them" to activate'], {
    timeout: 2000,
  });
}

function quitApp() {
  runOptional("osascript", ["-e", "try", "-e", 'tell application \"them\" to quit', "-e", "end try"], {
    timeout: 2000,
  });
  runOptional("killall", ["them"], {
    timeout: 2000,
  });
  for (const pid of appProcessIDs()) {
    runOptional("kill", [String(pid)], {
      timeout: 2000,
    });
  }
}

async function ensureAppStopped() {
  if (!appIsRunning()) return;
  quitApp();
  await waitFor(() => !appIsRunning(), "THEM process to quit before seed", 15000, 300);
}

async function setAutosaveEnabled(enabled) {
  const token = studioDebug.nextToken(
    "studio_debug_autosave_toggle_token",
    "studio_debug_autosave_toggle_ack_token"
  );
  writeFileSync("/tmp/them_studio_debug_autosave_toggle_request.json", JSON.stringify({
    token,
    enabled: Boolean(enabled),
  }), "utf8");
  writeDefaultBool("studio_debug_autosave_enabled", Boolean(enabled));
  writeDefaultInt("studio_debug_autosave_toggle_ack_token", 0);
  writeDefaultInt("studio_debug_autosave_toggle_token", token);
  await waitForState(
    (state) => state.autosaveEnabled === Boolean(enabled),
    `Studio autosave ${enabled ? "enabled" : "disabled"}`,
    12000,
    150
  );
}

async function performManualEdit(text) {
  const token = studioDebug.nextToken(
    "studio_debug_manual_edit_token",
    "studio_debug_manual_edit_ack_token"
  );
  writeFileSync("/tmp/them_studio_debug_manual_edit_request.json", JSON.stringify({
    token,
    text,
  }), "utf8");
  writeDefaultString("studio_debug_manual_edit_text", text);
  writeDefaultInt("studio_debug_manual_edit_ack_token", 0);
  writeDefaultInt("studio_debug_manual_edit_token", token);
  await waitFor(
    () => {
      if (readDefaultInt("studio_debug_manual_edit_ack_token") === token) return true;
      const state = readDebugDiffState();
      const visibleDraft = `${state?.draftPreview || ""} ${state?.draftTailPreview || ""}`;
      return visibleDraft.includes(text)
        && (Boolean(state?.hasUnsavedDraftChanges) || Boolean(state?.isManualDraftEditing));
    },
    `Studio manual edit ack ${token}`,
    20000,
    150
  );
}

async function requestManualSave() {
  const token = studioDebug.nextToken(
    "studio_debug_save_token",
    "studio_debug_save_ack_token"
  );
  writeFileSync("/tmp/them_studio_debug_save_request.json", JSON.stringify({ token }), "utf8");
  writeDefaultInt("studio_debug_save_ack_token", 0);
  writeDefaultInt("studio_debug_save_token", token);
  await waitFor(
    () => readDefaultInt("studio_debug_save_ack_token") === token,
    `Studio manual save ack ${token}`,
    30000,
    150
  );
}

async function requestManualSaveAndWaitForConflict({
  projectId: expectedProjectId,
  serverVersionId: expectedServerVersionId,
  localMarker: expectedLocalMarker,
  initialVersionId: expectedInitialVersionId,
  description,
  timeoutMs = 30000,
}) {
  let lastState = null;
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await requestManualSave();
      await waitForState((state) => {
        lastState = state;
        return normalizeKey(state.selectedProjectID) === normalizeKey(expectedProjectId)
          && state.conflictPresent === true
          && normalizeKey(state.conflictServerVersionID) === normalizeKey(expectedServerVersionId)
          && String(state.draftTailPreview || "").includes(expectedLocalMarker)
          && normalizeKey(state.latestVersionID) === normalizeKey(expectedInitialVersionId)
          && /conflict/i.test(String(state.autosaveStatusText || ""))
          && /collaborator updated/i.test(String(state.infoText || ""));
      }, `${description} attempt ${attempt}`, attempt === 1 ? 12000 : timeoutMs, 200);
      return lastState;
    } catch (error) {
      lastError = error;
      lastState = readDebugDiffState();
      const errorText = String(lastState?.errorText || "");
      const statusText = String(lastState?.autosaveStatusText || "");
      const retryable = /network connection was lost|timed out|network/i.test(errorText)
        || /autosave failed|saving/i.test(statusText)
        || Boolean(lastState?.isSaving)
        || /manual save ack|timed out/i.test(String(error?.message || ""));
      if (!retryable || attempt === 3) {
        throw error;
      }
      await sleep(1200);
    }
  }
  throw lastError || new Error(`Timed out waiting for ${description}`);
}

async function performInspectorInteraction(action, primary = "", secondary = "") {
  const token = studioDebug.nextToken(
    "studio_debug_inspector_interaction_token",
    "studio_debug_inspector_interaction_ack_token",
    "studio_debug_inspector_interaction_result_token"
  );
  writeDefaultString("studio_debug_inspector_interaction_action", action);
  writeDefaultString("studio_debug_inspector_interaction_primary", primary);
  writeDefaultString("studio_debug_inspector_interaction_secondary", secondary);
  writeDefaultString("studio_debug_inspector_interaction_result_status", "");
  writeDefaultString("studio_debug_inspector_interaction_result_error", "");
  writeDefaultString("studio_debug_inspector_interaction_result_json", "{}");
  writeDefaultInt("studio_debug_inspector_interaction_ack_token", 0);
  writeDefaultInt("studio_debug_inspector_interaction_result_token", 0);
  await sleep(250);
  writeDefaultInt("studio_debug_inspector_interaction_token", token);
  await waitFor(
    () => readDefaultInt("studio_debug_inspector_interaction_ack_token") === token,
    `inspector interaction ack ${action} ${token}`,
    15000,
    150
  );
  await waitFor(
    () => readDefaultInt("studio_debug_inspector_interaction_result_token") === token,
    `inspector interaction result ${action} ${token}`,
    30000,
    150
  );
  const payload = readJsonDefaultValue("studio_debug_inspector_interaction_result_json", {}) || {};
  const status = String(payload.status || "").trim().toLowerCase();
  const error = String(payload.error || payload.vm_error_text || "").trim();
  assert(
    status === "handled" || status === "ok" || status === "success",
    `Inspector interaction ${action} failed: status=${status || "missing"} error=${error || "none"} payload=${JSON.stringify(payload)}`
  );
  return payload;
}

function clearDebugCommandState() {
  const stringKeys = [
    "studio_debug_load_project_id",
    "studio_debug_load_project_version_id",
    "studio_debug_project_load_trace_json",
    "studio_debug_diff_state_json",
    "studio_debug_manual_edit_text",
    "studio_debug_inspector_interaction_action",
    "studio_debug_inspector_interaction_primary",
    "studio_debug_inspector_interaction_secondary",
    "studio_debug_inspector_interaction_result_status",
    "studio_debug_inspector_interaction_result_error",
    "studio_debug_inspector_interaction_result_json",
  ];
  const intKeys = [
    "studio_debug_open_token",
    "studio_debug_open_ack_token",
    "studio_debug_load_project_token",
    "studio_debug_load_project_ack_token",
    "studio_debug_manual_edit_token",
    "studio_debug_manual_edit_ack_token",
    "studio_debug_autosave_toggle_token",
    "studio_debug_autosave_toggle_ack_token",
    "studio_debug_save_token",
    "studio_debug_save_ack_token",
    "studio_debug_inspector_interaction_token",
    "studio_debug_inspector_interaction_ack_token",
    "studio_debug_inspector_interaction_result_token",
  ];
  for (const key of stringKeys) writeDefaultString(key, "");
  for (const key of intKeys) writeDefaultInt(key, 0);
  for (const requestPath of [
    "/tmp/them_studio_debug_load_project_request.json",
    "/tmp/them_studio_debug_manual_edit_request.json",
    "/tmp/them_studio_debug_autosave_toggle_request.json",
    "/tmp/them_studio_debug_save_request.json",
  ]) {
    if (existsSync(requestPath)) unlinkSync(requestPath);
  }
}

async function fetchBackendProject(projectId) {
  const result = await fetchBackendJSON(`/screenplay/projects/${projectId}?include_drafts=1&version_limit=24`);
  assert(
    result.response.ok,
    `Backend project probe failed: ${result.response.status} ${JSON.stringify(result.payload)}`
  );
  return result.payload?.payload?.project || result.payload?.project || {};
}

async function fetchBackendComments(projectId, collaboratorEmail) {
  const path = `/screenplay/projects/${projectId}/comments?actor_email=${encodeURIComponent(collaboratorEmail)}&limit=160`;
  const result = await fetchBackendJSON(path);
  assert(
    result.response.ok,
    `Backend comments probe failed: ${result.response.status} ${JSON.stringify(result.payload)}`
  );
  return Array.isArray(result.payload?.comments) ? result.payload.comments : [];
}

function approvedEmailsFromState(state) {
  return Array.isArray(state?.approvedEmails)
    ? state.approvedEmails.map((value) => normalizeKey(value)).filter(Boolean)
    : [];
}

function stateHasCollaboration(state, collaboratorEmail, commentText) {
  return approvedEmailsFromState(state).includes(normalizeKey(collaboratorEmail))
    && Number(state?.commentCount || 0) >= 1
    && normalizeText(state?.latestCommentText) === normalizeText(commentText)
    && state?.latestCommentResolved === true;
}

const originalUserIdRaw = readDefaultString("user_id");
const originalClientTokenRaw = readDefaultString("client_token");
const originalClientTokenCachedAt = readDefaultInt("client_token_cached_at");
const originalClientTokenBaseURLRaw = readDefaultString("client_token_base_url");
const originalClientTokenExpiryRaw = readDefaultString("client_token_expiry");
const originalAuthDebugAccessTokenRaw = readDefaultString("auth_debug_access_token");
const originalAuthDebugAccessTokenEnabledRaw = readDefaultString("auth_debug_access_token_enabled");

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const projectId = `studio-conflict-collab-${stamp}`;
const title = `Studio Conflict Collaboration Smoke ${stamp}`;
const initialDraft = [
  "INT. EDIT BAY - NIGHT",
  "",
  "NORA studies the frozen frame, unwilling to cut away.",
].join("\n");
const localMarker = `LOCAL-CONFLICT-${Date.now().toString(36).toUpperCase()}`;
const serverMarker = `REMOTE-CONFLICT-${Date.now().toString(36).toUpperCase()}`;
const serverDraft = `${initialDraft}\n\n${serverMarker}`;
const collaboratorEmail = `conflict-collab-${projectId}@example.com`.toLowerCase();
const commentText = `Conflict collaboration restore note ${projectId}`;
const serverChoiceProjectId = `studio-conflict-server-${stamp}`;
const serverChoiceTitle = `Studio Conflict Server Choice Smoke ${stamp}`;
const serverChoiceInitialDraft = [
  "INT. SOUNDSTAGE - DAWN",
  "",
  "MARA stands in the dust, hearing applause that is not there.",
].join("\n");
const serverChoiceLocalMarker = `LOCAL-SERVER-CHOICE-${Date.now().toString(36).toUpperCase()}`;
const serverChoiceServerMarker = `REMOTE-SERVER-CHOICE-${Date.now().toString(36).toUpperCase()}`;
const serverChoiceServerDraft = `${serverChoiceInitialDraft}\n\n${serverChoiceServerMarker}`;
const serverChoiceCollaboratorEmail = `server-choice-collab-${serverChoiceProjectId}@example.com`.toLowerCase();
const serverChoiceCommentText = `Server choice restore note ${serverChoiceProjectId}`;

let appPath = "";
let initialVersionId = "";
let serverVersionId = "";
let loadedState = null;
let editedState = null;
let collaborationState = null;
let conflictState = null;
let resolvedState = null;
let backendProject = null;
let backendComments = [];
let serverChoiceInitialVersionId = "";
let serverChoiceServerVersionId = "";
let serverChoiceLoadedState = null;
let serverChoiceEditedState = null;
let serverChoiceCollaborationState = null;
let serverChoiceConflictState = null;
let serverChoiceResolvedState = null;
let serverChoiceRelaunchState = null;
let serverChoiceBackendProject = null;
let serverChoiceBackendComments = [];

try {
  clearDebugCommandState();
  const health = await readHealth();
  assert(health?.ok === true, "Backend health is not OK on localhost:3000");
  await ensureOwnerIdentity(projectId);
  appPath = findDebugAppPath();
  await ensureAppStopped();

  await postBackendProject(projectId, title);
  const seedPayload = await postBackendProjectVersion(projectId, title, initialDraft, "", "studio_conflict_collaboration_seed");
  initialVersionId = projectVersionIdFromPayload(seedPayload);
  assert(initialVersionId, `Initial version id missing: ${JSON.stringify(seedPayload)}`);

  const stagedProjectLoadRequest = stageStudioProjectLoadDebugRequest({
    debugDefaults: studioDebug.defaults,
    projectId,
    versionId: initialVersionId,
  });

  await ensureStudioVisibleWithOpenHandshake({
    appPath,
    debugDefaults: studioDebug.defaults,
    runOptional,
    activateApp,
    appHasWindow,
    readDebugDiffState,
  });

  await ensureStudioProjectLoadedWithDebugHook({
    debugDefaults: studioDebug.defaults,
    projectId,
    versionId: initialVersionId,
    readDebugDiffState,
    timeoutMs: 45000,
    stagedRequest: stagedProjectLoadRequest,
  });

  await waitForState((state) => {
    loadedState = state;
    return normalizeKey(state.selectedProjectID) === normalizeKey(projectId)
      && normalizeKey(state.latestVersionID) === normalizeKey(initialVersionId)
      && normalizeText(`${state.draftPreview || ""} ${state.draftTailPreview || ""}`).includes("INT. EDIT BAY - NIGHT")
      && state.loadProjectReady === true;
  }, "initial Studio project load", 30000, 250);

  await setAutosaveEnabled(false);
  await performManualEdit(localMarker);
  await waitForState((state) => {
    editedState = state;
    return normalizeKey(state.selectedProjectID) === normalizeKey(projectId)
      && String(state.draftTailPreview || "").includes(localMarker)
      && (Boolean(state.hasUnsavedDraftChanges) || Boolean(state.isManualDraftEditing));
  }, "local dirty draft before collaboration writes", 15000, 150);

  await performInspectorInteraction("approve_collaborator", collaboratorEmail, "Approved during conflict restore smoke.");
  const commentPayload = await performInspectorInteraction("add_comment", collaboratorEmail, commentText);
  const commentId = String(commentPayload.latest_comment_id || "").trim();
  assert(commentId, `Expected app comment payload to include latest_comment_id: ${JSON.stringify(commentPayload)}`);
  await performInspectorInteraction("resolve_first_comment", commentId);
  await waitForState((state) => {
    collaborationState = state;
    return normalizeKey(state.selectedProjectID) === normalizeKey(projectId)
      && String(state.draftTailPreview || "").includes(localMarker)
      && (Boolean(state.hasUnsavedDraftChanges) || Boolean(state.isManualDraftEditing))
      && stateHasCollaboration(state, collaboratorEmail, commentText);
  }, "dirty local draft after collaboration writes", 20000, 150);

  const remotePayload = await postBackendProjectVersion(
    projectId,
    title,
    serverDraft,
    initialVersionId,
    "external_collaborator_revision"
  );
  serverVersionId = projectVersionIdFromPayload(remotePayload);
  assert(serverVersionId, `Remote version id missing: ${JSON.stringify(remotePayload)}`);
  assert(serverVersionId !== initialVersionId, "Remote version did not advance active draft version");

  conflictState = await requestManualSaveAndWaitForConflict({
    projectId,
    serverVersionId,
    localMarker,
    initialVersionId,
    description: "stale local save conflict after collaborator update",
  });

  await performInspectorInteraction("keep_local_conflict");
  await waitForState((state) => {
    resolvedState = state;
    return normalizeKey(state.selectedProjectID) === normalizeKey(projectId)
      && state.conflictPresent === false
      && !Boolean(state.hasUnsavedDraftChanges)
      && String(state.draftTailPreview || "").includes(localMarker)
      && normalizeKey(state.latestVersionID) !== normalizeKey(initialVersionId)
      && normalizeKey(state.latestVersionID) !== normalizeKey(serverVersionId)
      && stateHasCollaboration(state, collaboratorEmail, commentText);
  }, "keep-local conflict resolution with collaboration preserved", 45000, 250);

  backendProject = await fetchBackendProject(projectId);
  const activeVersionId = String(backendProject.active_version_id || backendProject.activeVersionId || "").trim();
  const versions = Array.isArray(backendProject.versions) ? backendProject.versions : [];
  const activeVersion = versions.find((version) => String(version.id || "").trim() === activeVersionId) || versions[0] || {};
  assert(
    normalizeKey(activeVersionId) === normalizeKey(resolvedState.latestVersionID),
    `Expected backend active version ${resolvedState.latestVersionID}, got ${activeVersionId}`
  );
  assert(
    String(activeVersion.draft || "").includes(localMarker),
    `Expected backend active draft to keep local marker ${localMarker}: ${JSON.stringify(activeVersion)}`
  );
  assert(
    !String(activeVersion.draft || "").includes(serverMarker),
    `Expected local conflict resolution to replace remote marker ${serverMarker}: ${JSON.stringify(activeVersion)}`
  );

  backendComments = await fetchBackendComments(projectId, collaboratorEmail);
  const restoredComment = backendComments.find((comment) =>
    normalizeText(comment?.text || "") === normalizeText(commentText)
  );
  assert(restoredComment, `Expected backend comment text ${commentText}`);
  assert(restoredComment.resolved === true, `Expected backend comment to remain resolved: ${JSON.stringify(restoredComment)}`);
  assert(restoredComment.can_edit === true, `Expected actor email to keep comment editable: ${JSON.stringify(restoredComment)}`);

  await ensureAppStopped();
  clearDebugCommandState();
  await postBackendProject(serverChoiceProjectId, serverChoiceTitle);
  const serverChoiceSeedPayload = await postBackendProjectVersion(
    serverChoiceProjectId,
    serverChoiceTitle,
    serverChoiceInitialDraft,
    "",
    "studio_conflict_server_seed"
  );
  serverChoiceInitialVersionId = projectVersionIdFromPayload(serverChoiceSeedPayload);
  assert(serverChoiceInitialVersionId, `Server-choice initial version id missing: ${JSON.stringify(serverChoiceSeedPayload)}`);

  const stagedServerChoiceLoadRequest = stageStudioProjectLoadDebugRequest({
    debugDefaults: studioDebug.defaults,
    projectId: serverChoiceProjectId,
    versionId: serverChoiceInitialVersionId,
  });

  await ensureStudioVisibleWithOpenHandshake({
    appPath,
    debugDefaults: studioDebug.defaults,
    runOptional,
    activateApp,
    appHasWindow,
    readDebugDiffState,
  });

  await ensureStudioProjectLoadedWithDebugHook({
    debugDefaults: studioDebug.defaults,
    projectId: serverChoiceProjectId,
    versionId: serverChoiceInitialVersionId,
    readDebugDiffState,
    timeoutMs: 45000,
    stagedRequest: stagedServerChoiceLoadRequest,
  });

  await waitForState((state) => {
    serverChoiceLoadedState = state;
    return normalizeKey(state.selectedProjectID) === normalizeKey(serverChoiceProjectId)
      && normalizeKey(state.latestVersionID) === normalizeKey(serverChoiceInitialVersionId)
      && normalizeText(`${state.draftPreview || ""} ${state.draftTailPreview || ""}`).includes("INT. SOUNDSTAGE - DAWN")
      && state.loadProjectReady === true;
  }, "server-choice initial Studio project load", 30000, 250);

  await setAutosaveEnabled(false);
  await performManualEdit(serverChoiceLocalMarker);
  await waitForState((state) => {
    serverChoiceEditedState = state;
    return normalizeKey(state.selectedProjectID) === normalizeKey(serverChoiceProjectId)
      && String(state.draftTailPreview || "").includes(serverChoiceLocalMarker)
      && (Boolean(state.hasUnsavedDraftChanges) || Boolean(state.isManualDraftEditing));
  }, "server-choice dirty local draft", 15000, 150);

  await performInspectorInteraction("approve_collaborator", serverChoiceCollaboratorEmail, "Approved during server-choice smoke.");
  const serverChoiceCommentPayload = await performInspectorInteraction(
    "add_comment",
    serverChoiceCollaboratorEmail,
    serverChoiceCommentText
  );
  const serverChoiceCommentId = String(serverChoiceCommentPayload.latest_comment_id || "").trim();
  assert(
    serverChoiceCommentId,
    `Expected server-choice comment payload to include latest_comment_id: ${JSON.stringify(serverChoiceCommentPayload)}`
  );
  await performInspectorInteraction("resolve_first_comment", serverChoiceCommentId);
  await waitForState((state) => {
    serverChoiceCollaborationState = state;
    return normalizeKey(state.selectedProjectID) === normalizeKey(serverChoiceProjectId)
      && String(state.draftTailPreview || "").includes(serverChoiceLocalMarker)
      && (Boolean(state.hasUnsavedDraftChanges) || Boolean(state.isManualDraftEditing))
      && stateHasCollaboration(state, serverChoiceCollaboratorEmail, serverChoiceCommentText);
  }, "server-choice dirty draft after collaboration writes", 20000, 150);

  const serverChoiceRemotePayload = await postBackendProjectVersion(
    serverChoiceProjectId,
    serverChoiceTitle,
    serverChoiceServerDraft,
    serverChoiceInitialVersionId,
    "external_collaborator_server_revision"
  );
  serverChoiceServerVersionId = projectVersionIdFromPayload(serverChoiceRemotePayload);
  assert(serverChoiceServerVersionId, `Server-choice remote version id missing: ${JSON.stringify(serverChoiceRemotePayload)}`);
  assert(
    serverChoiceServerVersionId !== serverChoiceInitialVersionId,
    "Server-choice remote version did not advance active draft version"
  );

  serverChoiceConflictState = await requestManualSaveAndWaitForConflict({
    projectId: serverChoiceProjectId,
    serverVersionId: serverChoiceServerVersionId,
    localMarker: serverChoiceLocalMarker,
    initialVersionId: serverChoiceInitialVersionId,
    description: "server-choice stale local save conflict",
  });

  await performInspectorInteraction("load_server_conflict");
  await waitForState((state) => {
    serverChoiceResolvedState = state;
    const restoredText = `${state.draftPreview || ""} ${state.draftTailPreview || ""}`;
    return normalizeKey(state.selectedProjectID) === normalizeKey(serverChoiceProjectId)
      && state.conflictPresent === false
      && !Boolean(state.hasUnsavedDraftChanges)
      && normalizeKey(state.latestVersionID) === normalizeKey(serverChoiceServerVersionId)
      && restoredText.includes(serverChoiceServerMarker)
      && !restoredText.includes(serverChoiceLocalMarker)
      && stateHasCollaboration(state, serverChoiceCollaboratorEmail, serverChoiceCommentText);
  }, "load-server conflict resolution with collaboration preserved", 30000, 200);

  serverChoiceBackendProject = await fetchBackendProject(serverChoiceProjectId);
  const serverChoiceActiveVersionId = String(
    serverChoiceBackendProject.active_version_id || serverChoiceBackendProject.activeVersionId || ""
  ).trim();
  const serverChoiceVersions = Array.isArray(serverChoiceBackendProject.versions)
    ? serverChoiceBackendProject.versions
    : [];
  const serverChoiceActiveVersion =
    serverChoiceVersions.find((version) => String(version.id || "").trim() === serverChoiceActiveVersionId)
    || serverChoiceVersions[0]
    || {};
  assert(
    normalizeKey(serverChoiceActiveVersionId) === normalizeKey(serverChoiceServerVersionId),
    `Expected backend active server-choice version ${serverChoiceServerVersionId}, got ${serverChoiceActiveVersionId}`
  );
  assert(
    String(serverChoiceActiveVersion.draft || "").includes(serverChoiceServerMarker),
    `Expected backend active draft to keep server marker ${serverChoiceServerMarker}: ${JSON.stringify(serverChoiceActiveVersion)}`
  );
  assert(
    !String(serverChoiceActiveVersion.draft || "").includes(serverChoiceLocalMarker),
    `Expected server-choice resolution to discard local marker ${serverChoiceLocalMarker}: ${JSON.stringify(serverChoiceActiveVersion)}`
  );

  serverChoiceBackendComments = await fetchBackendComments(serverChoiceProjectId, serverChoiceCollaboratorEmail);
  const serverChoiceRestoredComment = serverChoiceBackendComments.find((comment) =>
    normalizeText(comment?.text || "") === normalizeText(serverChoiceCommentText)
  );
  assert(serverChoiceRestoredComment, `Expected server-choice backend comment text ${serverChoiceCommentText}`);
  assert(
    serverChoiceRestoredComment.resolved === true,
    `Expected server-choice backend comment to remain resolved: ${JSON.stringify(serverChoiceRestoredComment)}`
  );
  assert(
    serverChoiceRestoredComment.can_edit === true,
    `Expected server-choice actor email to keep comment editable: ${JSON.stringify(serverChoiceRestoredComment)}`
  );

  await ensureAppStopped();
  clearDebugCommandState();
  const stagedServerChoiceRelaunchRequest = stageStudioProjectLoadDebugRequest({
    debugDefaults: studioDebug.defaults,
    projectId: serverChoiceProjectId,
    versionId: serverChoiceServerVersionId,
  });

  await ensureStudioVisibleWithOpenHandshake({
    appPath,
    debugDefaults: studioDebug.defaults,
    runOptional,
    activateApp,
    appHasWindow,
    readDebugDiffState,
  });

  await ensureStudioProjectLoadedWithDebugHook({
    debugDefaults: studioDebug.defaults,
    projectId: serverChoiceProjectId,
    versionId: serverChoiceServerVersionId,
    readDebugDiffState,
    timeoutMs: 45000,
    stagedRequest: stagedServerChoiceRelaunchRequest,
  });

  await waitForState((state) => {
    serverChoiceRelaunchState = state;
    const restoredText = `${state.draftPreview || ""} ${state.draftTailPreview || ""}`;
    return normalizeKey(state.selectedProjectID) === normalizeKey(serverChoiceProjectId)
      && normalizeKey(state.latestVersionID) === normalizeKey(serverChoiceServerVersionId)
      && state.loadProjectReady === true
      && state.conflictPresent === false
      && !Boolean(state.hasUnsavedDraftChanges)
      && restoredText.includes(serverChoiceServerMarker)
      && !restoredText.includes(serverChoiceLocalMarker)
      && stateHasCollaboration(state, serverChoiceCollaboratorEmail, serverChoiceCommentText);
  }, "server-choice relaunch restore after conflict choice", 60000, 300);

  console.log(JSON.stringify({
    ok: true,
    appPath,
    projectId,
    initialVersionId,
    serverVersionId,
    finalVersionId: resolvedState.latestVersionID,
    localMarker,
    serverMarker,
    collaboratorEmail,
    commentText,
    loadedState,
    editedState,
    collaborationState,
    conflictState,
    resolvedState,
    backendProject,
    backendComments,
    serverChoiceProjectId,
    serverChoiceInitialVersionId,
    serverChoiceServerVersionId,
    serverChoiceLocalMarker,
    serverChoiceServerMarker,
    serverChoiceCollaboratorEmail,
    serverChoiceCommentText,
    serverChoiceLoadedState,
    serverChoiceEditedState,
    serverChoiceCollaborationState,
    serverChoiceConflictState,
    serverChoiceResolvedState,
    serverChoiceRelaunchState,
    serverChoiceBackendProject,
    serverChoiceBackendComments,
  }, null, 2));
  console.log("studio-conflict-collaboration-restore-smoke: ok");
} finally {
  clearDebugCommandState();
  writeDefaultString("user_id", originalUserIdRaw);
  writeDefaultString("client_token", originalClientTokenRaw);
  writeDefaultInt("client_token_cached_at", originalClientTokenCachedAt);
  writeDefaultString("client_token_base_url", originalClientTokenBaseURLRaw);
  writeDefaultString("client_token_expiry", originalClientTokenExpiryRaw);
  writeDefaultString("auth_debug_access_token", originalAuthDebugAccessTokenRaw);
  writeDefaultString("auth_debug_access_token_enabled", originalAuthDebugAccessTokenEnabledRaw);
}
