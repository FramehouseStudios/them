import { spawnSync } from "node:child_process";
import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import {
  cleanupStudioEvalSessionsWithHelper,
  createStudioOwnedAppController,
  relaunchStudioAppWithHelper,
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

const ownedApp = createStudioOwnedAppController({ runOptional });

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

async function readHealth() {
  const response = await fetch("http://127.0.0.1:3000/health");
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Backend health failed: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function ensureOwnerIdentity() {
  const headers = {
    "Content-Type": "application/json",
    "X-APP-TOKEN": "them-dev",
  };
  const existingClientToken = readDefaultString("client_token");
  if (existingClientToken) {
    headers["X-Client-Token"] = existingClientToken;
  }
  const response = await fetch("http://127.0.0.1:3000/session", {
    method: "POST",
    headers,
    body: "{}",
  });
  const payload = await response.json().catch(() => ({}));
  if (response.status === 429 && existingClientToken) {
    return existingClientToken;
  }
  if (!response.ok) {
    throw new Error(`Failed to bootstrap Studio owner identity: ${response.status} ${JSON.stringify(payload)}`);
  }
  const clientToken = String(payload?.client_token || payload?.session_id || "").trim();
  assert(clientToken, "Session bootstrap did not return a client_token");
  writeDefaultString("client_token", clientToken);
  synchronizeDefaults();
  return clientToken;
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

function readDefaultString(key) {
  const result = runOptional("defaults", ["read", "io.them.them", key]);
  return result.status === 0 ? result.stdout.trim() : "";
}

function writeDefaultString(key, value) {
  run("defaults", ["write", "io.them.them", key, "-string", String(value)]);
}

function deleteDefaultKey(key) {
  runOptional("defaults", ["delete", "io.them.them", key]);
}

function readDefaultInt(key) {
  const value = Number(readDefaultString(key));
  return Number.isFinite(value) ? value : 0;
}

let debugTokenSeed = Date.now();

function nextDebugToken(...keys) {
  const defaultValues = keys.map((key) => readDefaultInt(key));
  debugTokenSeed = Math.max(debugTokenSeed + 1, Date.now(), ...defaultValues.map((value) => value + 1));
  return debugTokenSeed;
}

function writeDefaultInt(key, value) {
  run("defaults", ["write", "io.them.them", key, "-int", String(value)]);
}

function synchronizeDefaults() {
  runOptional("defaults", ["synchronize", "io.them.them"]);
}

function writeDefaultBool(key, value) {
  run("defaults", ["write", "io.them.them", key, "-bool", value ? "true" : "false"]);
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeText(value) {
  return String(value || "").replace(/\\[nr]/g, " ").replace(/\s+/g, " ").trim();
}

function ownerHeaders() {
  const headers = {
    "Content-Type": "application/json",
    "X-APP-TOKEN": "them-dev",
  };
  const clientToken = readDefaultString("client_token");
  assert(clientToken, "Missing owner identity in io.them.them defaults");
  headers["X-Client-Token"] = clientToken;
  return headers;
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

async function createThrowawayStudioProject() {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const projectId = `studio-manual-save-${stamp}`;
  const title = `Studio Manual Save Smoke ${stamp}`;
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

async function seedProjectVersion(projectId, title, draft) {
  const response = await fetch(`http://127.0.0.1:3000/screenplay/projects/${projectId}/version`, {
    method: "POST",
    headers: ownerHeaders(),
    body: JSON.stringify({
      draft,
      title,
      phase: "scene_draft",
      source: "studio_manual_save_hydrate_seed",
      notes: "Studio manual save hydrate smoke seed",
      base_version_id: "",
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Failed to seed Studio draft version: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload;
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

function requestStudioProjectLoad(projectId, versionId = "") {
  const token = nextDebugToken("studio_debug_load_project_token", "studio_debug_load_project_ack_token");
  writeFileSync("/tmp/them_studio_debug_load_project_request.json", JSON.stringify({
    token,
    projectID: String(projectId || "").trim(),
    versionID: String(versionId || "").trim(),
  }), "utf8");
  writeDefaultString("studio_debug_load_project_id", projectId);
  writeDefaultString("studio_debug_load_project_version_id", versionId);
  writeDefaultInt("studio_debug_load_project_ack_token", 0);
  writeDefaultInt("studio_debug_load_project_token", token);
  synchronizeDefaults();
  return token;
}

function appHasWindow() {
  return ownedApp.hasWindow();
}

function appIsRunning() {
  return ownedApp.isRunning();
}

function activateApp(appPath = "", appSession = null) {
  ownedApp.activate(appPath, appSession);
}

function launchApp(appPath) {
  const appSession = relaunchStudioAppWithHelper({ appPath, runOptional });
  ownedApp.bindSession(appPath, appSession);
  return appSession;
}

function quitApp() {
  cleanupStudioEvalSessionsWithHelper({ runOptional });
}

async function ensureAppStopped() {
  quitApp();
}

async function ensureStudioVisible(appPath = "") {
  const nextToken = nextDebugToken("studio_debug_open_token", "studio_debug_open_ack_token");
  writeDefaultInt("studio_debug_open_token", nextToken);
  synchronizeDefaults();
  await waitFor(
    () => readDefaultInt("studio_debug_open_ack_token") >= nextToken || readDebugDiffState() !== null,
    "Studio open ack",
    15000,
    150
  );
  activateApp(appPath);
  await waitFor(() => appHasWindow(), "visible THEM window after Studio open", 20000, 300);
}

async function relaunchApp(appPath) {
  await ensureAppStopped();
  const appSession = launchApp(appPath);
  await waitFor(() => appIsRunning(), "THEM process after relaunch", 20000, 300);
  activateApp(appPath, appSession);
  await ensureStudioVisible(appPath);
}

function appleScriptQuoted(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"');
}

function injectKeystrokeEdit(marker) {
  ownedApp.runProcessAppleScript([
    'delay 0.25',
    'key code 36',
    `keystroke "${appleScriptQuoted(marker)}"`,
  ]);
}

const transport = normalize(process.env.STUDIO_MANUAL_SAVE_TRANSPORT || "debug") || "debug";
const studioDebugSaveRequestPath = "/tmp/them_studio_debug_save_request.json";
const debugRequestPaths = [
  "/tmp/them_studio_debug_load_project_request.json",
  "/tmp/them_studio_debug_manual_edit_request.json",
  "/tmp/them_studio_debug_autosave_toggle_request.json",
  studioDebugSaveRequestPath,
];
const initialDraft = [
  "INT. KITCHEN - NIGHT",
  "",
  "JUNE stands over the sink, listening to the house settle around her.",
  "",
  "The refrigerator hum is the only thing keeping her company.",
].join("\n");
const manualMarker = `MANUAL-SAVE-${Date.now().toString(36).toUpperCase()}`;

const defaultKeys = [
  "studio_debug_open_token",
  "studio_debug_open_ack_token",
  "studio_debug_load_project_token",
  "studio_debug_load_project_ack_token",
  "studio_debug_load_project_id",
  "studio_debug_load_project_version_id",
  "studio_debug_diff_state_json",
  "studio_debug_focus_page_token",
  "studio_debug_focus_page_ack_token",
  "studio_debug_manual_edit_token",
  "studio_debug_manual_edit_text",
  "studio_debug_manual_edit_ack_token",
  "studio_debug_autosave_toggle_token",
  "studio_debug_autosave_enabled",
  "studio_debug_autosave_toggle_ack_token",
  "studio_debug_save_token",
  "studio_debug_save_ack_token",
  "studio_debug_force_hydrate_token",
  "studio_debug_force_hydrate_ack_token",
];
const originalDefaults = Object.fromEntries(defaultKeys.map((key) => [key, readDefaultString(key)]));

function clearDebugCommandState() {
  for (const key of defaultKeys) {
    deleteDefaultKey(key);
  }
  for (const requestPath of debugRequestPaths) {
    if (existsSync(requestPath)) {
      unlinkSync(requestPath);
    }
  }
}

let appPath = "";
let throwawayProject = null;
let initialState = null;
let editedState = null;
let savedState = null;
let finalState = null;

try {
  clearDebugCommandState();
  const health = await readHealth();
  assert(health?.ok === true, "Backend health is not OK on localhost:3000");
  await ensureOwnerIdentity();

  throwawayProject = await createThrowawayStudioProject();
  const seedResult = await seedProjectVersion(throwawayProject.projectId, throwawayProject.title, initialDraft);
  appPath = findDebugAppPath();
  await relaunchApp(appPath);
  requestStudioProjectLoad(throwawayProject.projectId, projectVersionIdFromPayload(seedResult));

  await waitFor(() => {
    const state = readDebugDiffState();
    if (!state) return false;
    initialState = state;
    return normalize(state.selectedProjectID) === normalize(throwawayProject.projectId)
      && normalizeText(`${state.draftPreview || ""} ${state.draftTailPreview || ""}`).includes("INT. KITCHEN - NIGHT");
  }, `Studio project hydrate for ${throwawayProject.projectId}`, 30000, 300);

  const autosaveToggleToken = nextDebugToken(
    "studio_debug_autosave_toggle_token",
    "studio_debug_autosave_toggle_ack_token"
  );
  writeFileSync("/tmp/them_studio_debug_autosave_toggle_request.json", JSON.stringify({
    token: autosaveToggleToken,
    enabled: false,
  }), "utf8");
  writeDefaultBool("studio_debug_autosave_enabled", false);
  writeDefaultInt("studio_debug_autosave_toggle_token", autosaveToggleToken);
  await waitFor(() => {
    const state = readDebugDiffState();
    if (!state) return false;
    return normalize(state.selectedProjectID) === normalize(throwawayProject.projectId)
      && state.autosaveEnabled === false;
  }, "Studio autosave disabled for manual save smoke", 10000, 150);

  if (transport === "keystroke") {
    const focusToken = readDefaultInt("studio_debug_focus_page_token") + 1;
    writeDefaultInt("studio_debug_focus_page_token", focusToken);
    await waitFor(
      () => readDefaultInt("studio_debug_focus_page_ack_token") === focusToken,
      "Studio page focus ack",
      10000,
      150
    );
    injectKeystrokeEdit(manualMarker);
  } else {
    const editToken = nextDebugToken("studio_debug_manual_edit_token", "studio_debug_manual_edit_ack_token");
    writeFileSync("/tmp/them_studio_debug_manual_edit_request.json", JSON.stringify({
      token: editToken,
      text: manualMarker,
    }), "utf8");
    writeDefaultString("studio_debug_manual_edit_text", manualMarker);
    writeDefaultInt("studio_debug_manual_edit_token", editToken);
    synchronizeDefaults();
    await waitFor(
      () => readDefaultInt("studio_debug_manual_edit_ack_token") === editToken,
      "Studio manual edit ack",
      10000,
      150
    );
  }

  await waitFor(() => {
    const state = readDebugDiffState();
    if (!state) return false;
    editedState = state;
    return normalize(state.selectedProjectID) === normalize(throwawayProject.projectId)
      && (Boolean(state.hasUnsavedDraftChanges) || Boolean(state.isManualDraftEditing))
      && String(state.draftTailPreview || "").includes(manualMarker);
  }, "manual edit to appear as unsaved local draft", 15000, 150);

  const saveToken = nextDebugToken("studio_debug_save_token", "studio_debug_save_ack_token");
  writeFileSync(studioDebugSaveRequestPath, JSON.stringify({ token: saveToken }), "utf8");
  writeDefaultInt("studio_debug_save_token", saveToken);
  synchronizeDefaults();
  await waitFor(
    () => readDefaultInt("studio_debug_save_ack_token") === saveToken,
    "Studio manual save ack",
    20000,
    150
  );

  await waitFor(() => {
    const state = readDebugDiffState();
    if (!state) return false;
    savedState = state;
    return normalize(state.selectedProjectID) === normalize(throwawayProject.projectId)
      && String(state.draftTailPreview || "").includes(manualMarker)
      && !Boolean(state.hasUnsavedDraftChanges)
      && /^saved(?: now)?$/i.test(String(state.autosaveStatusText || "").trim())
      && /draft saved\./i.test(String(state.infoText || ""));
  }, "manual edit save state", 25000, 200);

  const hydrateToken = nextDebugToken(
    "studio_debug_force_hydrate_token",
    "studio_debug_force_hydrate_ack_token"
  );
  writeDefaultInt("studio_debug_force_hydrate_token", hydrateToken);

  await waitFor(() => {
    const hydrateAcked = readDefaultInt("studio_debug_force_hydrate_ack_token") === hydrateToken;
    const state = readDebugDiffState();
    if (!state) return false;
    finalState = state;
    return normalize(state.selectedProjectID) === normalize(throwawayProject.projectId)
      && (hydrateAcked || state.loadProjectStage === "editor_ready")
      && String(state.draftTailPreview || "").includes(manualMarker)
      && !Boolean(state.hasUnsavedDraftChanges)
      && !/kept your manual edits on the page/i.test(String(state.infoText || ""))
      && !/unsaved changes/i.test(String(state.autosaveStatusText || ""));
  }, "saved local edit surviving same-project hydrate", 25000, 200);

  console.log(JSON.stringify({
    ok: true,
    transport,
    appPath,
    throwawayProjectId: throwawayProject.projectId,
    manualMarker,
    initialState,
    editedState,
    savedState,
    finalState,
  }, null, 2));
  console.log("studio-manual-save-hydrate-smoke: ok");
} finally {
  clearDebugCommandState();
}
