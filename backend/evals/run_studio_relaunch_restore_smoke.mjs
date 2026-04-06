import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import http from "node:http";
import { fetchStudioProjectMetadata } from "./studio_project_metadata_probe.mjs";
import { createStudioRestoreFixture } from "./studio_restore_seed_helper.mjs";

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

function readDefaultInt(key) {
  const value = Number(readDefaultString(key));
  return Number.isFinite(value) ? value : 0;
}

function writeDefaultInt(key, value) {
  run("defaults", ["write", "io.them.them", key, "-int", String(value)]);
}

function normalizeKey(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeAcknowledgedKey(value) {
  const normalized = normalizeKey(value);
  if (!normalized) return "";
  if (normalized.startsWith("write:")) {
    const writeID = normalizeKey(normalized.slice("write:".length));
    return writeID ? `lineage:${writeID}` : "";
  }
  return normalized;
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

function projectIdFromHistoryKey(value) {
  const clean = String(value || "").trim();
  return clean.startsWith("project:") ? clean.slice("project:".length) : clean;
}

async function postBackendProjectThreadState(projectId, record) {
  const acknowledgedLineageKey = normalizeAcknowledgedKey(record?.acknowledgedLineageKey);
  const acknowledgedWriteID = normalizeKey(record?.acknowledgedWriteID);
  const acknowledgedFingerprint = String(record?.acknowledgedFingerprint || "").trim();
  const response = await fetch("http://127.0.0.1:3000/screenplay/projects", {
    method: "POST",
    headers: ownerHeaders(),
    body: JSON.stringify({
      project_id: projectId,
      title: "Studio Relaunch Restore Smoke",
      phase: "scene_draft",
      activate: true,
      studio_thread_view_state: {
        search_text: String(record?.searchText || ""),
        selected_filter_raw: String(record?.selectedFilterRaw || ""),
        selected_scene_key: String(record?.selectedSceneKey || ""),
        scroll_target_key: String(record?.scrollTargetKey || ""),
        collapsed_section_keys: Array.isArray(record?.collapsedSectionKeys) ? record.collapsedSectionKeys : [],
        focused_diff_key: String(record?.focusedDiffKey || ""),
        reopened_lineage_keys: Array.isArray(record?.reopenedLineageKeys) ? record.reopenedLineageKeys : [],
        latest_reopened_write_id: String(record?.latestReopenedWriteID || ""),
      },
      studio_diff_acknowledged_entries: acknowledgedLineageKey
        ? [{
            key: acknowledgedLineageKey,
            fingerprint: acknowledgedFingerprint,
            write_id: acknowledgedWriteID,
          }]
        : [],
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Failed to seed backend project thread state: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function postBackendProjectVersion(projectId, recovery) {
  if (!recovery?.draft) return null;
  const response = await fetch(`http://127.0.0.1:3000/screenplay/projects/${projectId}/version`, {
    method: "POST",
    headers: ownerHeaders(),
    body: JSON.stringify({
      draft: recovery.draft,
      title: "Studio Relaunch Restore Smoke",
      phase: "scene_draft",
      source: "studio_relaunch_restore_seed",
      base_version_id: recovery.baseVersionId || "",
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Failed to seed backend project version: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function waitForBackendReopenedHydration(projectId, seededRecord, minimumVersionCount = 1) {
  let latestProbe = null;
  await waitFor(async () => {
    const probe = await fetchStudioProjectMetadata(projectId, ownerHeaders());
    latestProbe = probe;
    if (!probe.response.ok || !probe.metadata) return false;
    const project = probe.payload?.payload?.project || probe.payload?.project || {};
    const versionCount = Number(project.versionCount ?? project.version_count ?? 0);
    if (versionCount < minimumVersionCount) return false;
    return probe.metadata.focusedDiffKey === seededRecord.focusedDiffKey
      && probe.metadata.latestReopenedWriteID === seededRecord.latestReopenedWriteID
      && seededRecord.reopenedLineageKeys.some((value) => probe.metadata.reopenedLineageKeys.includes(value));
  }, `backend reopened hydration for ${projectId}`, 20000, 300);
  return latestProbe;
}

function appHasWindow() {
  const output = osascript([
    'try',
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
  runOptional("osascript", ["-e", "try", "-e", 'tell application \"them\" to quit', "-e", "end try"]);
}

let debugTokenCounter = Math.max(1, readDefaultInt("studio_debug_open_token"));
function nextDebugToken() {
  debugTokenCounter += 1;
  return debugTokenCounter;
}

async function ensureStudioVisible() {
  writeDefaultInt("studio_debug_open_token", nextDebugToken());
  await sleep(1200);
  activateApp();
  await waitFor(() => appHasWindow(), "visible THEM window after Studio open");
}

async function relaunchApp(appPath) {
  if (appIsRunning()) {
    quitApp();
    await waitFor(() => !appIsRunning(), "THEM process to quit", 15000, 300);
  }
  launchApp(appPath);
  await waitFor(() => appIsRunning(), "THEM process after relaunch", 20000, 300);
  activateApp();
  await ensureStudioVisible();
}

async function ensureAppStopped() {
  if (!appIsRunning()) return;
  quitApp();
  await waitFor(() => !appIsRunning(), "THEM process to quit before seed", 15000, 300);
}

const originalLocalStateRaw = readDefaultString("studio.full.thread.state.v1");
const originalLocalAckStateRaw = readDefaultString("studio.diff.keep-current.v1");
const originalLocalAckWriteStateRaw = readDefaultString("studio.diff.keep-current.writeids.v1");
const originalAskNoteHistoryRaw = readDefaultString("studio.ask.note.history.v2");
const originalDebugDiffStateRaw = readDefaultString("studio_debug_diff_state_json");
const originalReplacementTraceRaw = readDefaultString("studio_debug_replacement_trace_json");

let seedFixture = null;
let seededRecord = null;
let appPath = "";
let restoredState = null;
let backendProbe = null;

try {
  const health = await readHealth();
  assert(health?.ok === true, "Backend health is not OK on localhost:3000");

  seedFixture = createStudioRestoreFixture("reopened");
  seededRecord = seedFixture.reopenedSeed;
  const projectId = projectIdFromHistoryKey(seededRecord.projectKey);
  appPath = findDebugAppPath();
  await ensureAppStopped();
  const threadStateMap = readFullThreadBrowseStateMap();
  threadStateMap[seededRecord.projectKey] = seededRecord.rawRecord;
  writeDefaultString("studio.full.thread.state.v1", JSON.stringify(threadStateMap));
  const askHistoryMap = readStudioAskNoteHistoryMap();
  askHistoryMap[seededRecord.projectKey] = seedFixture.reopenedHistory;
  writeDefaultString("studio.ask.note.history.v2", JSON.stringify(askHistoryMap));
  await postBackendProjectThreadState(projectId, seededRecord);
  await postBackendProjectVersion(projectId, {
    draft: seedFixture.draftReopened,
    baseVersionId: "",
  });
  const probe = await waitForBackendReopenedHydration(projectId, seededRecord);
  assert(probe.response.ok, `Backend project probe failed: ${probe.response.status} ${JSON.stringify(probe.payload)}`);
  backendProbe = probe.metadata;
  assert(backendProbe, "Backend project probe returned no project metadata.");
  assert(backendProbe.focusedDiffKey === seededRecord.focusedDiffKey, `Expected backend focused diff ${seededRecord.focusedDiffKey}, got ${backendProbe.focusedDiffKey}`);
  assert(backendProbe.latestReopenedWriteID === seededRecord.latestReopenedWriteID, `Expected backend latest reopened write ${seededRecord.latestReopenedWriteID}, got ${backendProbe.latestReopenedWriteID}`);

  await relaunchApp(appPath);

  await waitFor(() => {
    const state = readDebugDiffState();
    if (!state) return false;
    restoredState = state;
    const restoredReopenedLineageKeys = Array.isArray(state.restoredReopenedLineageKeys)
      ? state.restoredReopenedLineageKeys.map((value) => normalizeKey(value)).filter(Boolean)
      : [];
    const restoredStateSource = normalizeKey(state.restoredStateSource);
    const restoredFocusedDiffSource = normalizeKey(state.restoredFocusedDiffSource);
    const restoredReopenedSource = normalizeKey(state.restoredReopenedSource);
    return normalizeKey(state.projectKey) === normalizeKey(seededRecord.projectKey)
      && ["local", "backend", "merged"].includes(restoredStateSource)
      && ["local", "backend"].includes(restoredFocusedDiffSource)
      && ["local", "backend", "merged"].includes(restoredReopenedSource)
      && normalizeKey(state.restoredFocusedDiffKey) === seededRecord.focusedDiffKey
      && restoredReopenedLineageKeys.some((value) => seededRecord.reopenedLineageKeys.includes(value))
      && normalizeKey(state.restoredLatestReopenedWriteID) === seededRecord.latestReopenedWriteID
      && Number(state.reopenedDiffCount || 0) > 0;
  }, "restored reopened diff state after relaunch", 25000, 300);

  console.log(
    JSON.stringify(
      {
        ok: true,
        appPath,
        throwawayProjectId: seedFixture?.projectId || "",
        seededRecord,
        backendProbe,
        restoredState,
      },
      null,
      2
    )
  );
  console.log("studio-relaunch-restore-smoke: ok");
} finally {
  writeDefaultString("studio.full.thread.state.v1", originalLocalStateRaw);
  writeDefaultString("studio.diff.keep-current.v1", originalLocalAckStateRaw);
  writeDefaultString("studio.diff.keep-current.writeids.v1", originalLocalAckWriteStateRaw);
  writeDefaultString("studio.ask.note.history.v2", originalAskNoteHistoryRaw);
  writeDefaultString("studio_debug_diff_state_json", originalDebugDiffStateRaw);
  writeDefaultString("studio_debug_replacement_trace_json", originalReplacementTraceRaw);
}
