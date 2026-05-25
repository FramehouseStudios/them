import { spawnSync } from "node:child_process";
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
    req.setTimeout(4000, () => req.destroy(new Error("health request timed out")));
  });
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

async function ensureOwnerIdentity() {
  const existingUserId = readDefaultString("user_id");
  const existingClientToken = readDefaultString("client_token");
  if (existingClientToken) {
    return { userId: existingUserId, clientToken: existingClientToken, bootstrapped: false };
  }
  const response = await fetch("http://127.0.0.1:3000/session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-APP-TOKEN": "them-dev",
    },
    body: "{}",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Failed to bootstrap Studio owner identity: ${response.status} ${JSON.stringify(payload)}`);
  }
  const userId = String(payload?.user_id || "").trim();
  const clientToken = String(payload?.client_token || payload?.session_id || "").trim();
  assert(userId || clientToken, "Session bootstrap did not return an owner identity");
  writeDefaultString("user_id", userId);
  writeDefaultString("client_token", clientToken);
  return { userId, clientToken, bootstrapped: true };
}

function ownerHeaders() {
  const headers = {
    "Content-Type": "application/json",
    "X-APP-TOKEN": "them-dev",
  };
  const userId = readDefaultString("user_id");
  if (userId) headers["X-User-Id"] = userId;
  const clientToken = readDefaultString("client_token");
  assert(clientToken, "Missing owner identity in io.them.them defaults");
  headers["X-Client-Token"] = clientToken;
  return headers;
}

async function fetchBackendJSON(path, { method = "GET", body = null, headers = ownerHeaders() } = {}) {
  const response = await fetch(`http://127.0.0.1:3000${path}`, {
    method,
    headers,
    body: body == null ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
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
  const result = runOptional("pgrep", ["-x", "them"]);
  return result.status === 0 && Boolean(result.stdout.trim());
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
    () => readDefaultInt("studio_debug_manual_edit_ack_token") === token,
    `Studio manual edit ack ${token}`,
    12000,
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

try {
  clearDebugCommandState();
  const health = await readHealth();
  assert(health?.ok === true, "Backend health is not OK on localhost:3000");
  await ensureOwnerIdentity();
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
    const approvedEmails = Array.isArray(state.approvedEmails)
      ? state.approvedEmails.map((value) => normalizeKey(value))
      : [];
    return normalizeKey(state.selectedProjectID) === normalizeKey(projectId)
      && String(state.draftTailPreview || "").includes(localMarker)
      && (Boolean(state.hasUnsavedDraftChanges) || Boolean(state.isManualDraftEditing))
      && approvedEmails.includes(collaboratorEmail)
      && Number(state.commentCount || 0) >= 1
      && normalizeText(state.latestCommentText) === normalizeText(commentText)
      && state.latestCommentResolved === true;
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

  await requestManualSave();
  await waitForState((state) => {
    conflictState = state;
    return normalizeKey(state.selectedProjectID) === normalizeKey(projectId)
      && state.conflictPresent === true
      && normalizeKey(state.conflictServerVersionID) === normalizeKey(serverVersionId)
      && String(state.draftTailPreview || "").includes(localMarker)
      && normalizeKey(state.latestVersionID) === normalizeKey(initialVersionId)
      && /conflict/i.test(String(state.autosaveStatusText || ""))
      && /collaborator updated/i.test(String(state.infoText || ""));
  }, "stale local save conflict after collaborator update", 30000, 200);

  await performInspectorInteraction("keep_local_conflict");
  await waitForState((state) => {
    resolvedState = state;
    const approvedEmails = Array.isArray(state.approvedEmails)
      ? state.approvedEmails.map((value) => normalizeKey(value))
      : [];
    return normalizeKey(state.selectedProjectID) === normalizeKey(projectId)
      && state.conflictPresent === false
      && !Boolean(state.hasUnsavedDraftChanges)
      && String(state.draftTailPreview || "").includes(localMarker)
      && normalizeKey(state.latestVersionID) !== normalizeKey(initialVersionId)
      && normalizeKey(state.latestVersionID) !== normalizeKey(serverVersionId)
      && approvedEmails.includes(collaboratorEmail)
      && Number(state.commentCount || 0) >= 1
      && normalizeText(state.latestCommentText) === normalizeText(commentText)
      && state.latestCommentResolved === true;
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
  }, null, 2));
  console.log("studio-conflict-collaboration-restore-smoke: ok");
} finally {
  clearDebugCommandState();
}
