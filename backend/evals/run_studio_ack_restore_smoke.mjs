import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import http from "node:http";
import {
  createStudioEvalDebugContext,
  ensureStudioProjectLoadedWithDebugHook,
  stageStudioProjectLoadDebugRequest,
} from "./studio_eval_debug_utils.mjs";
import { fetchStudioProjectMetadata } from "./studio_project_metadata_probe.mjs";
import { createStudioRestoreFixture } from "./studio_restore_seed_helper.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `${command} failed`).trim());
  }
  return (result.stdout || "").trim();
}

function runOptional(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  return {
    status: result.status ?? 1,
    stdout: (result.stdout || "").trim(),
    stderr: (result.stderr || "").trim(),
  };
}

const studioDebug = createStudioEvalDebugContext({ run, runOptional });

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

async function waitForDebugState(predicate, description, timeoutMs = 20000, intervalMs = 250) {
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

function readAcknowledgedDiffMap() {
  const raw = readDefaultString("studio.diff.keep-current.v1");
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function readAcknowledgedDiffWriteIDMap() {
  const raw = readDefaultString("studio.diff.keep-current.writeids.v1");
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function readDefaultsDomainJSON() {
  const result = runOptional("/bin/zsh", [
    "-lc",
    "defaults export io.them.them - | plutil -convert json -o - -",
  ]);
  if (result.status !== 0 || !result.stdout) return {};
  try {
    const parsed = JSON.parse(result.stdout);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function readLocalDraftRecovery(projectId) {
  const domain = readDefaultsDomainJSON();
  const store = domain?.["screenplay.studio.localDraftRecovery.v1"];
  const record = store && typeof store === "object" ? store[projectId] : null;
  if (!record || typeof record !== "object") return null;
  const draft = String(record.draft || "").trim();
  if (!draft) return null;
  return {
    draft,
    baseVersionId: String(record.baseVersionId || record.base_version_id || "").trim(),
  };
}

function projectIdFromHistoryKey(value) {
  const clean = String(value || "").trim();
  return clean.startsWith("project:") ? clean.slice("project:".length) : clean;
}

async function postBackendProjectThreadState(projectId, record, ackRecord) {
  const response = await fetch("http://127.0.0.1:3000/screenplay/projects", {
    method: "POST",
    headers: ownerHeaders(),
    body: JSON.stringify({
      project_id: projectId,
      title: "Studio Ack Restore Smoke",
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
      studio_diff_acknowledged_entries: ackRecord?.acknowledgedLineageKey
        ? [{
            key: ackRecord.acknowledgedLineageKey,
            fingerprint: String(ackRecord.acknowledgedFingerprint || ""),
            write_id: String(ackRecord.acknowledgedWriteID || ""),
          }]
        : [],
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Failed to seed backend ack restore project state: ${response.status} ${JSON.stringify(payload)}`);
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
      title: "Studio Ack Restore Smoke",
      phase: "scene_draft",
      source: "studio_ack_restore_seed",
      base_version_id: recovery.baseVersionId || "",
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Failed to seed backend project version: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function waitForBackendAckHydration(projectId, seededRecord, minimumVersionCount = 1) {
  let latestProbe = null;
  await waitFor(async () => {
    const probe = await fetchStudioProjectMetadata(projectId, ownerHeaders());
    latestProbe = probe;
    if (!probe.response.ok || !probe.metadata) return false;
    const project = probe.payload?.payload?.project || probe.payload?.project || {};
    const versionCount = Number(project.versionCount ?? project.version_count ?? 0);
    if (versionCount < minimumVersionCount) return false;
    const ackEntry = probe.metadata.acknowledgedEntries.find((entry) => entry.key === seededRecord.acknowledgedLineageKey);
    return probe.metadata.focusedDiffKey === seededRecord.focusedDiffKey
      && Boolean(ackEntry)
      && ackEntry.writeID === seededRecord.acknowledgedWriteID;
  }, `backend ack hydration for ${projectId}`, 20000, 300);
  return latestProbe;
}

function findAckRestoreSeed() {
  const debugState = readDebugDiffState();
  const projectKey = String(debugState?.projectKey || "").trim();
  if (!projectKey) return null;
  const threadMap = readFullThreadBrowseStateMap();
  const rawRecord = threadMap[projectKey] && typeof threadMap[projectKey] === "object" ? threadMap[projectKey] : null;
  const acknowledgedMap = readAcknowledgedDiffMap();
  const acknowledgedWriteMap = readAcknowledgedDiffWriteIDMap();
  const acknowledgedRecord = acknowledgedMap[projectKey] && typeof acknowledgedMap[projectKey] === "object"
    ? acknowledgedMap[projectKey]
    : {};
  const acknowledgedWriteRecord = acknowledgedWriteMap[projectKey] && typeof acknowledgedWriteMap[projectKey] === "object"
    ? acknowledgedWriteMap[projectKey]
    : {};
  const acknowledgedLineageKey = normalizeKey(
    debugState?.latestAcknowledgedLineageKey
      || Object.keys(acknowledgedWriteRecord)[0]
      || Object.keys(acknowledgedRecord)[0]
      || debugState?.latestReopenedLineageKey
      || debugState?.activeRevisedLineageKey
  );
  const acknowledgedWriteID = normalizeKey(
    debugState?.latestAcknowledgedWriteID
      || acknowledgedWriteRecord[acknowledgedLineageKey]
      || debugState?.latestReopenedWriteID
      || debugState?.activeRevisedWriteID
  );
  const acknowledgedFingerprint = String(
    debugState?.latestAcknowledgedFingerprint
      || acknowledgedRecord[acknowledgedLineageKey]
      || ""
  ).trim();
  const focusedDiffKey = normalizeKey(
    rawRecord?.focusedDiffKey
      || debugState?.focusedDiffKey
      || debugState?.restoredFocusedDiffKey
      || (acknowledgedWriteID ? `write:${acknowledgedWriteID}` : "")
  );
  if (!rawRecord) return null;
  if (!focusedDiffKey || !acknowledgedLineageKey || !acknowledgedWriteID) return null;
  return {
    projectKey,
    focusedDiffKey,
    acknowledgedLineageKey,
    acknowledgedWriteID,
    acknowledgedFingerprint,
    reopenedLineageKeys: [],
    latestReopenedWriteID: "",
    rawRecord: {
      ...rawRecord,
      focusedDiffKey,
      reopenedLineageKeys: [],
      latestReopenedWriteID: "",
    },
  };
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

const originalLocalThreadStateRaw = readDefaultString("studio.full.thread.state.v1");
const originalLocalAckStateRaw = readDefaultString("studio.diff.keep-current.v1");
const originalLocalAckWriteStateRaw = readDefaultString("studio.diff.keep-current.writeids.v1");
const originalAskNoteHistoryRaw = readDefaultString("studio.ask.note.history.v2");
const originalDebugDiffStateRaw = readDefaultString("studio_debug_diff_state_json");
const originalReplacementTraceRaw = readDefaultString("studio_debug_replacement_trace_json");

let seedFixture = null;
let seededRecord = null;
let restoredState = null;
let backendProbe = null;
let appPath = "";

try {
  const health = await readHealth();
  assert(health?.ok === true, "Backend health is not OK on localhost:3000");

  seedFixture = createStudioRestoreFixture("ack");
  seededRecord = seedFixture.ackSeed;
  const firstEntry = seedFixture.firstEntry;
  const secondEntry = seedFixture.secondEntry;

  appPath = findDebugAppPath();
  await ensureAppStopped();
  const draftRecovery = {
    draft: seedFixture.draftAck,
    baseVersionId: "",
  };
  const originalDebugState = readDebugDiffState();
  const originalDebugSessionID = normalizeKey(originalDebugState?.debugSessionID);

  const threadStateMap = readFullThreadBrowseStateMap();
  delete threadStateMap[seededRecord.projectKey];
  writeDefaultString("studio.full.thread.state.v1", Object.keys(threadStateMap).length > 0 ? JSON.stringify(threadStateMap) : "");

  const ackMap = readAcknowledgedDiffMap();
  delete ackMap[seededRecord.projectKey];
  writeDefaultString("studio.diff.keep-current.v1", Object.keys(ackMap).length > 0 ? JSON.stringify(ackMap) : "");

  const ackWriteMap = readAcknowledgedDiffWriteIDMap();
  delete ackWriteMap[seededRecord.projectKey];
  writeDefaultString("studio.diff.keep-current.writeids.v1", Object.keys(ackWriteMap).length > 0 ? JSON.stringify(ackWriteMap) : "");

  const askHistoryMap = readStudioAskNoteHistoryMap();
  askHistoryMap[seededRecord.projectKey] = seedFixture.ackHistory;
  writeDefaultString("studio.ask.note.history.v2", JSON.stringify(askHistoryMap));

  await postBackendProjectThreadState(
    projectIdFromHistoryKey(seededRecord.projectKey),
    seededRecord.rawRecord,
    seededRecord
  );
  await postBackendProjectVersion(
    projectIdFromHistoryKey(seededRecord.projectKey),
    draftRecovery
  );

  const probe = await waitForBackendAckHydration(
    projectIdFromHistoryKey(seededRecord.projectKey),
    seededRecord
  );
  assert(probe.response.ok, `Backend project probe failed: ${probe.response.status} ${JSON.stringify(probe.payload)}`);
  backendProbe = probe.metadata;
  assert(backendProbe, "Backend project probe returned no project metadata.");
  assert(backendProbe.focusedDiffKey === seededRecord.focusedDiffKey, `Expected backend focused diff ${seededRecord.focusedDiffKey}, got ${backendProbe.focusedDiffKey}`);
  const ackEntry = backendProbe.acknowledgedEntries.find((entry) => entry.key === seededRecord.acknowledgedLineageKey);
  assert(ackEntry, `Expected backend ack entry for ${seededRecord.acknowledgedLineageKey}, got ${JSON.stringify(backendProbe.acknowledgedEntries)}`);
  assert(ackEntry.writeID === seededRecord.acknowledgedWriteID, `Expected backend ack write ${seededRecord.acknowledgedWriteID}, got ${ackEntry.writeID}`);

  await relaunchApp(appPath);

  await waitForDebugState((state) => {
    const sessionID = normalizeKey(state.debugSessionID);
    return Boolean(sessionID) && sessionID !== originalDebugSessionID;
  }, "fresh Studio debug session after relaunch", 25000, 300);

  const seededProjectId = projectIdFromHistoryKey(seededRecord.projectKey);
  const stagedProjectLoadRequest = stageStudioProjectLoadDebugRequest({
    debugDefaults: studioDebug.defaults,
    projectId: seededProjectId,
  });
  await ensureStudioProjectLoadedWithDebugHook({
    debugDefaults: studioDebug.defaults,
    projectId: seededProjectId,
    readDebugDiffState,
    timeoutMs: 45000,
    stagedRequest: stagedProjectLoadRequest,
  });

  await waitForDebugState((state) => {
    restoredState = state;
    return normalizeKey(state.projectKey) === normalizeKey(seededRecord.projectKey)
      && Number(state.acknowledgedDiffCount || 0) > 0
      && normalizeKey(state.latestAcknowledgedLineageKey) === seededRecord.acknowledgedLineageKey
      && normalizeKey(state.latestAcknowledgedWriteID) === seededRecord.acknowledgedWriteID;
  }, "backend-only acknowledged diff restore after relaunch", 40000, 300);

  console.log(JSON.stringify({
    ok: true,
    appPath,
    throwawayProjectId: seedFixture?.projectId || "",
    seededRecord,
    backendProbe,
    restoredState,
  }, null, 2));
  console.log("studio-ack-restore-smoke: ok");
} finally {
  writeDefaultString("studio.full.thread.state.v1", originalLocalThreadStateRaw);
  writeDefaultString("studio.diff.keep-current.v1", originalLocalAckStateRaw);
  writeDefaultString("studio.diff.keep-current.writeids.v1", originalLocalAckWriteStateRaw);
  writeDefaultString("studio.ask.note.history.v2", originalAskNoteHistoryRaw);
  writeDefaultString("studio_debug_diff_state_json", originalDebugDiffStateRaw);
  writeDefaultString("studio_debug_replacement_trace_json", originalReplacementTraceRaw);
}
