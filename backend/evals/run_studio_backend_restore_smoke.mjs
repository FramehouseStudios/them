import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import http from "node:http";
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

function projectIdFromHistoryKey(value) {
  const clean = String(value || "").trim();
  return clean.startsWith("project:") ? clean.slice("project:".length) : clean;
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
    if (!parsed || typeof parsed !== "object") return {};
    const result = {};
    for (const [projectKey, record] of Object.entries(parsed)) {
      if (!record || typeof record !== "object") continue;
      const normalizedRecord = {};
      for (const [key, fingerprint] of Object.entries(record)) {
        const normalizedKey = normalizeAcknowledgedKey(key);
        if (!normalizedKey) continue;
        normalizedRecord[normalizedKey] = String(fingerprint || "").trim();
      }
      result[String(projectKey)] = normalizedRecord;
    }
    return result;
  } catch {
    return {};
  }
}

function readAcknowledgedDiffWriteIDMap() {
  const raw = readDefaultString("studio.diff.keep-current.writeids.v1");
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const result = {};
    for (const [projectKey, record] of Object.entries(parsed)) {
      if (!record || typeof record !== "object") continue;
      const normalizedRecord = {};
      for (const [key, writeID] of Object.entries(record)) {
        const normalizedKey = normalizeAcknowledgedKey(key);
        const normalizedWriteID = normalizeKey(writeID);
        if (!normalizedKey || !normalizedWriteID) continue;
        normalizedRecord[normalizedKey] = normalizedWriteID;
      }
      result[String(projectKey)] = normalizedRecord;
    }
    return result;
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

async function postBackendProjectThreadState(projectId, record) {
  const focusedDiffKey = String(record?.focusedDiffKey || "").trim().toLowerCase();
  const acknowledgedLineageKey = normalizeAcknowledgedKey(record?.acknowledgedLineageKey);
  const acknowledgedWriteID = normalizeKey(record?.acknowledgedWriteID);
  const acknowledgedFingerprint = String(record?.acknowledgedFingerprint || "").trim();
  const response = await fetch("http://127.0.0.1:3000/screenplay/projects", {
    method: "POST",
    headers: ownerHeaders(),
    body: JSON.stringify({
      project_id: projectId,
      title: "Studio Restore Smoke",
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
      title: "Studio Restore Smoke",
      phase: "scene_draft",
      source: "studio_restore_seed",
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

function findPersistedReopenedRecord() {
  const map = readFullThreadBrowseStateMap();
  const acknowledgedMap = readAcknowledgedDiffMap();
  const acknowledgedWriteIDMap = readAcknowledgedDiffWriteIDMap();
  for (const [projectKey, record] of Object.entries(map)) {
    const reopenedLineageKeys = Array.isArray(record?.reopenedLineageKeys)
      ? record.reopenedLineageKeys.map((value) => normalizeKey(value)).filter(Boolean)
      : [];
    const focusedDiffKey = normalizeKey(record?.focusedDiffKey);
    const latestReopenedWriteID = normalizeKey(record?.latestReopenedWriteID);
    const acknowledgedRecord = acknowledgedMap[String(projectKey)] || {};
    const acknowledgedWriteRecord = acknowledgedWriteIDMap[String(projectKey)] || {};
    const acknowledgedLineageKey = reopenedLineageKeys.find((value) =>
      Object.prototype.hasOwnProperty.call(acknowledgedRecord, value)
      || Object.prototype.hasOwnProperty.call(acknowledgedWriteRecord, value)
    ) || reopenedLineageKeys[0] || "";
    if (focusedDiffKey && reopenedLineageKeys.length > 0 && latestReopenedWriteID) {
      return {
        projectKey,
        focusedDiffKey,
        reopenedLineageKeys,
        latestReopenedWriteID,
        acknowledgedLineageKey,
        acknowledgedFingerprint: String(acknowledgedRecord[acknowledgedLineageKey] || ""),
        acknowledgedWriteID: normalizeKey(acknowledgedWriteRecord[acknowledgedLineageKey] || ""),
        rawRecord: record,
      };
    }
  }
  return null;
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
let restoredState = null;
let backendProbe = null;
let appPath = "";
let thrownError = null;

try {
  const health = await readHealth();
  assert(health?.ok === true, "Backend health is not OK on localhost:3000");

  seedFixture = createStudioRestoreFixture("reopened");
  seededRecord = seedFixture.reopenedSeed;

  appPath = findDebugAppPath();
  await ensureAppStopped();
  const draftRecovery = {
    draft: seedFixture.draftReopened,
    baseVersionId: "",
  };
  const originalDebugState = readDebugDiffState();
  const originalDebugSessionID = normalizeKey(originalDebugState?.debugSessionID);

  const map = readFullThreadBrowseStateMap();
  delete map[seededRecord.projectKey];
  const nextRaw = Object.keys(map).length > 0 ? JSON.stringify(map) : "";
  writeDefaultString("studio.full.thread.state.v1", nextRaw);
  const askHistoryMap = readStudioAskNoteHistoryMap();
  askHistoryMap[seededRecord.projectKey] = seedFixture.reopenedHistory;
  writeDefaultString("studio.ask.note.history.v2", JSON.stringify(askHistoryMap));
  await postBackendProjectThreadState(
    projectIdFromHistoryKey(seededRecord.projectKey),
    seededRecord.rawRecord || {}
  );
  await postBackendProjectVersion(
    projectIdFromHistoryKey(seededRecord.projectKey),
    draftRecovery
  );
  const probe = await waitForBackendReopenedHydration(
    projectIdFromHistoryKey(seededRecord.projectKey),
    seededRecord
  );
  assert(probe.response.ok, `Backend project probe failed: ${probe.response.status} ${JSON.stringify(probe.payload)}`);
  backendProbe = probe.metadata;
  assert(backendProbe, "Backend project probe returned no project metadata.");
  assert(backendProbe.focusedDiffKey === seededRecord.focusedDiffKey, `Expected backend focused diff ${seededRecord.focusedDiffKey}, got ${backendProbe.focusedDiffKey}`);
  assert(backendProbe.latestReopenedWriteID === seededRecord.latestReopenedWriteID, `Expected backend latest reopened write ${seededRecord.latestReopenedWriteID}, got ${backendProbe.latestReopenedWriteID}`);
  assert(
    seededRecord.reopenedLineageKeys.some((value) => backendProbe.reopenedLineageKeys.includes(value)),
    `Expected backend reopened lineage overlap, got ${JSON.stringify(backendProbe.reopenedLineageKeys)}`
  );

  await relaunchApp(appPath);

  await waitFor(() => {
    const state = readDebugDiffState();
    if (!state) return false;
    const sessionID = normalizeKey(state.debugSessionID);
    return Boolean(sessionID) && sessionID !== originalDebugSessionID;
  }, "fresh Studio debug session after relaunch", 25000, 300);

  await waitFor(() => {
    const state = readDebugDiffState();
    if (!state) return false;
    restoredState = state;
    return normalizeKey(state.projectKey) === normalizeKey(seededRecord.projectKey)
      && normalizeKey(state.restoredFocusedDiffKey) === seededRecord.focusedDiffKey
      && Array.isArray(state.restoredReopenedLineageKeys)
      && state.restoredReopenedLineageKeys.map((value) => normalizeKey(value)).some((value) => seededRecord.reopenedLineageKeys.includes(value))
      && Array.isArray(state.backendSelectedReopenedLineageKeys)
      && state.backendSelectedReopenedLineageKeys.map((value) => normalizeKey(value)).some((value) => seededRecord.reopenedLineageKeys.includes(value))
      && normalizeKey(state.restoredLatestReopenedWriteID) === seededRecord.latestReopenedWriteID
      && Number(state.reopenedDiffCount || 0) > 0;
  }, "backend-only reopened diff restore after relaunch", 25000, 300);

  console.log(JSON.stringify({
    ok: true,
    appPath,
    throwawayProjectId: seedFixture?.projectId || "",
    seededRecord,
    backendProbe,
    restoredState,
  }, null, 2));
  console.log("studio-backend-restore-smoke: ok");
} catch (error) {
  thrownError = error;
  const projectId = seededRecord ? projectIdFromHistoryKey(seededRecord.projectKey) : "";
  const localThreadState = seededRecord
    ? (readFullThreadBrowseStateMap()[seededRecord.projectKey] || null)
    : null;
  const localAskHistory = seededRecord
    ? (readStudioAskNoteHistoryMap()[seededRecord.projectKey] || null)
    : null;
  const currentDebugState = readDebugDiffState();
  const currentBackendProbe = projectId
    ? await fetchStudioProjectMetadata(projectId, ownerHeaders()).catch(() => null)
    : null;
  console.error(JSON.stringify({
    ok: false,
    error: String(error?.message || error),
    throwawayProjectId: seedFixture?.projectId || "",
    seededRecord,
    currentDebugState,
    localThreadState,
    localAskHistoryCount: Array.isArray(localAskHistory) ? localAskHistory.length : 0,
    localAskHistoryHead: Array.isArray(localAskHistory) ? localAskHistory.slice(0, 2) : null,
    currentBackendProbe: currentBackendProbe?.metadata || null,
  }, null, 2));
} finally {
  writeDefaultString("studio.full.thread.state.v1", originalLocalStateRaw);
  writeDefaultString("studio.diff.keep-current.v1", originalLocalAckStateRaw);
  writeDefaultString("studio.diff.keep-current.writeids.v1", originalLocalAckWriteStateRaw);
  writeDefaultString("studio.ask.note.history.v2", originalAskNoteHistoryRaw);
  writeDefaultString("studio_debug_diff_state_json", originalDebugDiffStateRaw);
  writeDefaultString("studio_debug_replacement_trace_json", originalReplacementTraceRaw);
  if (thrownError) {
    throw thrownError;
  }
}
