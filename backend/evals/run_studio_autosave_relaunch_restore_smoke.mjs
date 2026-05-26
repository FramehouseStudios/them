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
  const result = spawnSync(command, args, {
    encoding: "utf8",
    ...options,
  });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || result.error?.message || `${command} failed`).trim());
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

  let lastStatus = 0;
  let lastPayload = {};
  let lastError = null;
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try {
      const response = await fetch("http://127.0.0.1:3000/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-APP-TOKEN": "them-dev",
          Connection: "close",
        },
        body: "{}",
      });
      const payload = await response.json().catch(() => ({}));
      if (response.ok) {
        const userId = String(payload?.user_id || "").trim();
        const clientToken = String(payload?.client_token || payload?.session_id || "").trim();
        assert(userId || clientToken, "Session bootstrap did not return an owner identity");
        writeDefaultString("user_id", userId);
        writeDefaultString("client_token", clientToken);
        writeDefaultInt("client_token_cached_at", Math.floor(Date.now() / 1000));
        writeDefaultString("client_token_base_url", "http://127.0.0.1:3000");
        const expiresIn = Number(payload?.expires_in || 0);
        if (Number.isFinite(expiresIn) && expiresIn > 0) {
          writeDefaultString("client_token_expiry", new Date(Date.now() + expiresIn * 1000).toISOString());
        }
        return { userId, clientToken, bootstrapped: true };
      }
      lastStatus = response.status;
      lastPayload = payload;
      if (response.status !== 429 && response.status < 500) break;
      const retryAfterMs = Math.max(0, Number(response.headers.get("retry-after") || 0)) * 1000;
      await sleep(Math.max(retryAfterMs, 1000 * attempt));
    } catch (error) {
      lastError = error;
      if (attempt === 6) break;
      await sleep(500 * attempt);
    }
  }
  if (lastError && !lastStatus) {
    throw new Error(`Failed to bootstrap Studio owner identity: ${lastError?.message || lastError}`);
  }
  throw new Error(`Failed to bootstrap Studio owner identity: ${lastStatus} ${JSON.stringify(lastPayload)}`);
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
    throw new Error(`Failed to create Studio autosave project: ${result.response.status} ${JSON.stringify(result.payload)}`);
  }
  return result.payload;
}

async function postBackendProjectVersion(projectId, title, draft, baseVersionId = "") {
  const result = await fetchBackendJSON(`/screenplay/projects/${projectId}/version`, {
    method: "POST",
    body: {
      draft,
      title,
      phase: "scene_draft",
      source: "studio_autosave_restore_seed",
      notes: "Studio autosave relaunch restore smoke seed",
      base_version_id: baseVersionId,
    },
  });
  if (!result.response.ok) {
    throw new Error(`Failed to seed Studio autosave version: ${result.response.status} ${JSON.stringify(result.payload)}`);
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

async function fetchBackendProject(projectId) {
  const result = await fetchBackendJSON(`/screenplay/projects/${projectId}?include_drafts=1&version_limit=24`);
  assert(
    result.response.ok,
    `Backend project probe failed: ${result.response.status} ${JSON.stringify(result.payload)}`
  );
  return result.payload?.payload?.project || result.payload?.project || {};
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
  await waitFor(() => !appIsRunning(), "THEM process to quit before autosave smoke", 15000, 300);
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

function clearDebugCommandState() {
  const stringKeys = [
    "studio_debug_load_project_id",
    "studio_debug_load_project_version_id",
    "studio_debug_project_load_trace_json",
    "studio_debug_diff_state_json",
    "studio_debug_manual_edit_text",
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

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const projectId = `studio-autosave-restore-${stamp}`;
const title = `Studio Autosave Restore Smoke ${stamp}`;
const initialDraft = [
  "INT. MOTEL ROOM - BLUE HOUR",
  "",
  "LENORA watches headlights drift across the ceiling.",
  "",
  "A cassette recorder clicks off beside an untouched coffee.",
].join("\n");
const autosaveMarker = `AUTOSAVE-RESTORE-${Date.now().toString(36).toUpperCase()}`;

let appPath = "";
let initialVersionId = "";
let loadedState = null;
let editedState = null;
let autosavedState = null;
let backendProject = null;
let backendActiveVersion = null;
let relaunchState = null;

try {
  clearDebugCommandState();
  const health = await readHealth();
  assert(health?.ok === true, "Backend health is not OK on localhost:3000");
  await ensureOwnerIdentity();
  appPath = findDebugAppPath();
  await ensureAppStopped();

  await postBackendProject(projectId, title);
  const seedPayload = await postBackendProjectVersion(projectId, title, initialDraft);
  initialVersionId = projectVersionIdFromPayload(seedPayload);
  assert(initialVersionId, `Initial autosave version id missing: ${JSON.stringify(seedPayload)}`);

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
      && normalizeText(`${state.draftPreview || ""} ${state.draftTailPreview || ""}`).includes("INT. MOTEL ROOM - BLUE HOUR")
      && state.loadProjectReady === true;
  }, "initial Studio autosave project load", 30000, 250);

  await setAutosaveEnabled(true);
  await performManualEdit(autosaveMarker);
  await waitForState((state) => {
    editedState = state;
    return normalizeKey(state.selectedProjectID) === normalizeKey(projectId)
      && String(state.draftTailPreview || "").includes(autosaveMarker)
      && (Boolean(state.hasUnsavedDraftChanges) || Boolean(state.isManualDraftEditing) || Boolean(state.isSaving));
  }, "autosave smoke dirty local draft", 15000, 150);

  await waitForState((state) => {
    autosavedState = state;
    return normalizeKey(state.selectedProjectID) === normalizeKey(projectId)
      && String(state.draftTailPreview || "").includes(autosaveMarker)
      && normalizeKey(state.latestVersionID) !== normalizeKey(initialVersionId)
      && !Boolean(state.hasUnsavedDraftChanges)
      && !Boolean(state.isManualDraftEditing)
      && !Boolean(state.isSaving)
      && !Boolean(state.conflictPresent)
      && !String(state.errorText || "").trim()
      && /autosaved|saved/i.test(String(state.autosaveStatusText || ""));
  }, "Studio autosave completed", 45000, 250);

  backendProject = await fetchBackendProject(projectId);
  const activeVersionId = String(backendProject.active_version_id || backendProject.activeVersionId || "").trim();
  const versions = Array.isArray(backendProject.versions) ? backendProject.versions : [];
  backendActiveVersion = versions.find((version) => String(version.id || "").trim() === activeVersionId) || versions[0] || {};
  assert(
    normalizeKey(activeVersionId) === normalizeKey(autosavedState.latestVersionID),
    `Expected backend active version ${autosavedState.latestVersionID}, got ${activeVersionId}`
  );
  assert(
    String(backendActiveVersion.draft || "").includes(autosaveMarker),
    `Expected backend active draft to include autosave marker ${autosaveMarker}: ${JSON.stringify(backendActiveVersion)}`
  );
  assert(
    String(backendActiveVersion.source || "").trim() === "studio_autosave",
    `Expected backend active draft source studio_autosave, got ${backendActiveVersion.source}`
  );

  await ensureAppStopped();
  clearDebugCommandState();
  const stagedRelaunchRequest = stageStudioProjectLoadDebugRequest({
    debugDefaults: studioDebug.defaults,
    projectId,
    versionId: activeVersionId,
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
    versionId: activeVersionId,
    readDebugDiffState,
    timeoutMs: 45000,
    stagedRequest: stagedRelaunchRequest,
  });

  await waitForState((state) => {
    relaunchState = state;
    const restoredDraft = `${state.draftPreview || ""} ${state.draftTailPreview || ""}`;
    return normalizeKey(state.selectedProjectID) === normalizeKey(projectId)
      && normalizeKey(state.latestVersionID) === normalizeKey(activeVersionId)
      && state.loadProjectReady === true
      && !Boolean(state.hasUnsavedDraftChanges)
      && !Boolean(state.isManualDraftEditing)
      && !Boolean(state.isSaving)
      && !Boolean(state.conflictPresent)
      && !String(state.errorText || "").trim()
      && restoredDraft.includes(autosaveMarker);
  }, "autosaved draft relaunch restore", 60000, 300);

  console.log(JSON.stringify({
    ok: true,
    appPath,
    projectId,
    initialVersionId,
    autosavedVersionId: activeVersionId,
    autosaveMarker,
    loadedState,
    editedState,
    autosavedState,
    relaunchState,
    backendProject,
    backendActiveVersion,
  }, null, 2));
  console.log("studio-autosave-relaunch-restore-smoke: ok");
} finally {
  clearDebugCommandState();
}
