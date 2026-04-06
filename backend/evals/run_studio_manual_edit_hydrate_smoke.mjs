import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

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

async function readHealth() {
  const response = await fetch("http://127.0.0.1:3000/health");
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Backend health failed: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload;
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

function writeDefaultInt(key, value) {
  run("defaults", ["write", "io.them.them", key, "-int", String(value)]);
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function ownerHeaders() {
  const headers = {
    "Content-Type": "application/json",
    "X-APP-TOKEN": "them-dev",
  };
  const userId = readDefaultString("user_id");
  if (userId) {
    headers["X-User-Id"] = userId;
    return headers;
  }
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
  const projectId = `studio-manual-edit-${stamp}`;
  const title = `Studio Manual Edit Smoke ${stamp}`;
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
      source: "studio_manual_edit_hydrate_seed",
      notes: "Studio manual edit hydrate smoke seed",
      base_version_id: "",
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Failed to seed Studio draft version: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload;
}

function appHasWindow() {
  const output = osascript([
    "try",
    'tell application "System Events"',
    'tell process "them"',
    'return count of windows',
    'end tell',
    'end tell',
    'on error',
    'return "0"',
    'end try',
  ]);
  return Number(output) > 0;
}

function appIsRunning() {
  const result = runOptional("pgrep", ["-x", "them"]);
  return result.status === 0 && Boolean(result.stdout.trim());
}

function activateApp() {
  osascript(['tell application "them" to activate']);
}

function launchApp(appPath) {
  run("open", ["-na", appPath]);
}

function quitApp() {
  runOptional("osascript", ["-e", "try", "-e", 'tell application "them" to quit', "-e", "end try"]);
}

async function ensureAppStopped() {
  if (!appIsRunning()) return;
  quitApp();
  await waitFor(() => !appIsRunning(), "THEM process to quit before smoke", 15000, 300);
}

async function ensureStudioVisible() {
  const nextToken = Math.max(1, readDefaultInt("studio_debug_open_token")) + 1;
  writeDefaultInt("studio_debug_open_token", nextToken);
  await waitFor(
    () => readDefaultInt("studio_debug_open_ack_token") === nextToken,
    "Studio open ack",
    15000,
    150
  );
  activateApp();
  await waitFor(() => appHasWindow(), "visible THEM window after Studio open", 20000, 300);
}

async function relaunchApp(appPath) {
  await ensureAppStopped();
  launchApp(appPath);
  await waitFor(() => appIsRunning(), "THEM process after relaunch", 20000, 300);
  activateApp();
  await ensureStudioVisible();
}

function appleScriptQuoted(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"');
}

function injectKeystrokeEdit(marker) {
  osascript([
    'tell application "them" to activate',
    'delay 0.25',
    'tell application "System Events"',
    'key code 36',
    `keystroke "${appleScriptQuoted(marker)}"`,
    'end tell',
  ]);
}

const transport = normalize(process.env.STUDIO_MANUAL_HYDRATE_TRANSPORT || "debug") || "debug";
const initialDraft = [
  "INT. HALLWAY - NIGHT",
  "",
  "MAYA reaches the apartment door but hesitates before knocking.",
  "",
  "She listens for movement inside.",
].join("\n");
const manualMarker = `MANUAL-EDIT-${Date.now().toString(36).toUpperCase()}`;

const defaultKeys = [
  "studio_debug_open_token",
  "studio_debug_open_ack_token",
  "studio_debug_diff_state_json",
  "studio_debug_focus_page_token",
  "studio_debug_focus_page_ack_token",
  "studio_debug_manual_edit_token",
  "studio_debug_manual_edit_text",
  "studio_debug_manual_edit_ack_token",
  "studio_debug_force_hydrate_token",
  "studio_debug_force_hydrate_ack_token",
];
const originalDefaults = Object.fromEntries(defaultKeys.map((key) => [key, readDefaultString(key)]));

let appPath = "";
let throwawayProject = null;
let initialState = null;
let editedState = null;
let finalState = null;

try {
  const health = await readHealth();
  assert(health?.ok === true, "Backend health is not OK on localhost:3000");

  throwawayProject = await createThrowawayStudioProject();
  await seedProjectVersion(throwawayProject.projectId, throwawayProject.title, initialDraft);
  appPath = findDebugAppPath();
  await relaunchApp(appPath);

  await waitFor(() => {
    const state = readDebugDiffState();
    if (!state) return false;
    initialState = state;
    return normalize(state.selectedProjectID) === normalize(throwawayProject.projectId)
      && String(state.draftPreview || "").includes("INT. HALLWAY - NIGHT");
  }, `Studio project hydrate for ${throwawayProject.projectId}`, 30000, 300);

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
    const editToken = readDefaultInt("studio_debug_manual_edit_token") + 1;
    writeDefaultString("studio_debug_manual_edit_text", manualMarker);
    writeDefaultInt("studio_debug_manual_edit_token", editToken);
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
      && Boolean(state.isManualDraftEditing)
      && String(state.draftTailPreview || "").includes(manualMarker);
  }, "manual edit to appear in the live Studio draft", 15000, 150);

  const hydrateToken = readDefaultInt("studio_debug_force_hydrate_token") + 1;
  writeDefaultInt("studio_debug_force_hydrate_token", hydrateToken);

  await waitFor(() => {
    if (readDefaultInt("studio_debug_force_hydrate_ack_token") !== hydrateToken) {
      return false;
    }
    const state = readDebugDiffState();
    if (!state) return false;
    finalState = state;
    return normalize(state.selectedProjectID) === normalize(throwawayProject.projectId)
      && String(state.draftTailPreview || "").includes(manualMarker)
      && /kept your manual edits on the page/i.test(String(state.infoText || ""))
      && (Boolean(state.isManualDraftEditing) || Boolean(state.hasUnsavedDraftChanges));
  }, "manual edit surviving same-project hydrate", 25000, 200);

  console.log(JSON.stringify({
    ok: true,
    transport,
    appPath,
    throwawayProjectId: throwawayProject.projectId,
    manualMarker,
    initialState,
    editedState,
    finalState,
  }, null, 2));
  console.log("studio-manual-edit-hydrate-smoke: ok");
} finally {
  for (const [key, value] of Object.entries(originalDefaults)) {
    if (value) {
      writeDefaultString(key, value);
    } else {
      deleteDefaultKey(key);
    }
  }
}
