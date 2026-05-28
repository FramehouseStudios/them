import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import http from "node:http";
import {
  createStudioEvalDebugContext,
  ensureStudioProjectLoadedWithDebugHook,
  ensureStudioVisibleWithOpenHandshake,
  stageStudioProjectLoadDebugRequest,
} from "./studio_eval_debug_utils.mjs";
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

function synchronizeDefaults() {
  runOptional("defaults", ["synchronize", "io.them.them"]);
  for (const plistPath of studioDebug.defaults.plistTargets || []) {
    const target = plistPath.endsWith(".plist") ? plistPath.slice(0, -".plist".length) : plistPath;
    runOptional("defaults", ["synchronize", target]);
  }
}

function normalizeKey(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeText(value) {
  return String(value || "").replace(/\\[nr]/g, " ").replace(/\s+/g, " ").trim();
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
  const accessToken = readDefaultString("auth_debug_access_token");
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  const clientToken = readDefaultString("client_token");
  assert(clientToken, "Missing owner identity in io.them.them defaults");
  headers["X-Client-Token"] = clientToken;
  return headers;
}

function fallbackOwnerHeaders() {
  return ownerHeaders();
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
  const email = `studio-relaunch-${projectId}-${randomUUID()}@example.test`.toLowerCase();
  const password = `ThemRelaunch-${randomUUID()}-aA1!`;
  const signup = await postBackendAuthJSON("/auth/signup", {
    email,
    password,
    display_name: "Studio Relaunch Restore Smoke",
  });
  assert(
    signup.response.ok,
    `Failed to create Studio relaunch owner: ${signup.response.status} ${JSON.stringify(signup.payload)}`
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
  assert(accessToken, "Studio relaunch owner signup did not return an access token");
  assert(userId, "Studio relaunch owner signup did not return a user id");

  const session = await postBackendAuthJSON("/session", {}, {
    "Content-Type": "application/json",
    "X-APP-TOKEN": "them-dev",
    Authorization: `Bearer ${accessToken}`,
  });
  assert(
    session.response.ok,
    `Failed to create Studio relaunch client session: ${session.response.status} ${JSON.stringify(session.payload)}`
  );
  const clientToken = String(session.payload?.client_token || session.payload?.session_id || "").trim();
  assert(clientToken, "Studio relaunch client session did not return a client token");

  writeDefaultString("user_id", userId);
  writeDefaultString("client_token", clientToken);
  writeDefaultInt("client_token_cached_at", Math.floor(Date.now() / 1000));
  writeDefaultString("client_token_base_url", "http://127.0.0.1:3000");
  const expiresIn = Math.max(60, Number(session.payload?.expires_in || 0) || 0);
  writeDefaultString("client_token_expiry", new Date(Date.now() + expiresIn * 1000).toISOString());
  writeDefaultString("auth_debug_access_token", accessToken);
  writeDefaultBool("auth_debug_access_token_enabled", true);
  synchronizeDefaults();

  return { userId, clientToken, accessToken };
}

function readDebugDiffState() {
  return studioDebug.readDebugDiffState(null);
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

async function postBackendProjectThreadState(projectId, record, headers = ownerHeaders(), baseURL = "http://127.0.0.1:3000") {
  const acknowledgedLineageKey = normalizeAcknowledgedKey(record?.acknowledgedLineageKey);
  const acknowledgedWriteID = normalizeKey(record?.acknowledgedWriteID);
  const acknowledgedFingerprint = String(record?.acknowledgedFingerprint || "").trim();
  const response = await fetch(`${baseURL}/screenplay/projects`, {
    method: "POST",
    headers,
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

async function postBackendProjectVersion(projectId, recovery, headers = ownerHeaders(), baseURL = "http://127.0.0.1:3000") {
  if (!recovery?.draft) return null;
  const response = await fetch(`${baseURL}/screenplay/projects/${projectId}/version`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      draft: recovery.draft,
      title: "Studio Relaunch Restore Smoke",
      phase: "scene_draft",
      source: "studio_clementine_page_write",
      base_version_id: recovery.baseVersionId || "",
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Failed to seed backend project version: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function postBackendCollaborator(projectId, collaboratorEmail, headers = ownerHeaders(), baseURL = "http://127.0.0.1:3000") {
  const response = await fetch(`${baseURL}/screenplay/projects/${projectId}/collaborators`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      email: collaboratorEmail,
      action: "approve",
      note: "Seeded before Studio relaunch restore.",
      invited_by: "studio-relaunch-restore-smoke",
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Failed to seed backend collaborator: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function postBackendComment(projectId, body, headers = ownerHeaders(), baseURL = "http://127.0.0.1:3000") {
  const response = await fetch(`${baseURL}/screenplay/projects/${projectId}/comments`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Failed to seed backend comment: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function seedBackendCollaboration(projectId, collaboratorEmail, commentText, versionId = "", headers = ownerHeaders(), baseURL = "http://127.0.0.1:3000") {
  const collaboratorPayload = await postBackendCollaborator(projectId, collaboratorEmail, headers, baseURL);
  const commentPayload = await postBackendComment(projectId, {
    text: commentText,
    author_email: collaboratorEmail,
    author_name: "Studio Relaunch Smoke",
    actor_email: collaboratorEmail,
    anchor_line: 1,
    version_id: versionId,
    type: "text",
    action: "create",
  }, headers, baseURL);
  const commentId = String(commentPayload?.comment?.id || commentPayload?.comment_id || "").trim();
  assert(commentId, `Seeded backend comment did not return an id: ${JSON.stringify(commentPayload)}`);
  const resolvePayload = await postBackendComment(projectId, {
    action: "resolve",
    comment_id: commentId,
    actor_email: collaboratorEmail,
    author_email: collaboratorEmail,
  }, headers, baseURL);
  return {
    collaboratorEmail,
    commentText,
    commentId,
    versionId,
    collaboratorPayload,
    commentPayload,
    resolvePayload,
  };
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

function activateApp() {
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

const originalLocalStateRaw = readDefaultString("studio.full.thread.state.v1");
const originalLocalAckStateRaw = readDefaultString("studio.diff.keep-current.v1");
const originalLocalAckWriteStateRaw = readDefaultString("studio.diff.keep-current.writeids.v1");
const originalAskNoteHistoryRaw = readDefaultString("studio.ask.note.history.v2");
const originalDebugDiffStateRaw = readDefaultString("studio_debug_diff_state_json");
const originalReplacementTraceRaw = readDefaultString("studio_debug_replacement_trace_json");
const originalClientTokenRaw = readDefaultString("client_token");
const originalUserIDRaw = readDefaultString("user_id");
const originalClientTokenCachedAt = readDefaultInt("client_token_cached_at");
const originalClientTokenBaseURLRaw = readDefaultString("client_token_base_url");
const originalClientTokenExpiryRaw = readDefaultString("client_token_expiry");
const originalAuthDebugAccessTokenRaw = readDefaultString("auth_debug_access_token");
const originalAuthDebugAccessTokenEnabledRaw = readDefaultString("auth_debug_access_token_enabled");
const originalLoadProjectToken = readDefaultInt("studio_debug_load_project_token");
const originalLoadProjectAckToken = readDefaultInt("studio_debug_load_project_ack_token");
const originalLoadProjectID = readDefaultString("studio_debug_load_project_id");
const originalLoadProjectVersionID = readDefaultString("studio_debug_load_project_version_id");

let seedFixture = null;
let seededRecord = null;
let appPath = "";
let restoredState = null;
let backendProbe = null;
let stagedProjectLoadRequest = null;
let seededCollaboration = null;

function isExpectedCollaborationState(state, expectedCollaboration) {
  if (!expectedCollaboration) return true;
  const approvedEmails = Array.isArray(state.approvedEmails)
    ? state.approvedEmails.map((value) => normalizeKey(value)).filter(Boolean)
    : [];
  const collaboratorCount = Number(state.collaboratorCount ?? state.collaborator_count ?? 0);
  const commentCount = Number(state.commentCount ?? state.comment_count ?? 0);
  const latestCommentText = normalizeText(state.latestCommentText ?? state.latest_comment_text ?? "");
  const latestCommentAuthor = normalizeKey(state.latestCommentAuthor ?? state.latest_comment_author ?? "");
  const latestCommentResolved = Boolean(state.latestCommentResolved ?? state.latest_comment_resolved);
  const latestCommentDeleted = Boolean(state.latestCommentDeleted ?? state.latest_comment_deleted);
  return collaboratorCount >= 1
    && approvedEmails.includes(normalizeKey(expectedCollaboration.collaboratorEmail))
    && commentCount >= 1
    && latestCommentText === normalizeText(expectedCollaboration.commentText)
    && latestCommentAuthor === normalizeKey(expectedCollaboration.collaboratorEmail)
    && latestCommentResolved === true
    && latestCommentDeleted === false;
}

function isExpectedRestoredState(state, projectId, activeVersionId, expectedDraft, expectedCollaboration = null) {
  if (!state) return false;
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
    && normalizeKey(state.selectedProjectID) === normalizeKey(projectId)
    && normalizeKey(state.latestVersionID) === activeVersionId
    && state.loadProjectReady === true
    && normalizeKey(state.loadProjectStage) === "editor_ready"
    && !normalizeKey(state.loadProjectError)
    && normalizeText(`${state.draftPreview || ""} ${state.draftTailPreview || ""}`).includes(normalizeText(expectedDraft))
    && Number(state.reopenedDiffCount || 0) > 0
    && isExpectedCollaborationState(state, expectedCollaboration);
}

try {
  const health = await readHealth();
  assert(health?.ok === true, "Backend health is not OK on localhost:3000");

  seedFixture = createStudioRestoreFixture("reopened");
  seededRecord = seedFixture.reopenedSeed;
  const projectId = projectIdFromHistoryKey(seededRecord.projectKey);
  await ensureOwnerIdentity(projectId);
  appPath = findDebugAppPath();
  await ensureAppStopped();
  const staleLoadProjectToken = Math.max(
    readDefaultInt("studio_debug_load_project_token"),
    readDefaultInt("studio_debug_load_project_ack_token")
  );
  writeDefaultInt("studio_debug_load_project_token", staleLoadProjectToken);
  writeDefaultInt("studio_debug_load_project_ack_token", staleLoadProjectToken);
  writeDefaultString("studio_debug_load_project_id", "");
  writeDefaultString("studio_debug_load_project_version_id", "");
  writeDefaultString("studio_debug_project_load_trace_json", "[]");
  const threadStateMap = readFullThreadBrowseStateMap();
  threadStateMap[seededRecord.projectKey] = seededRecord.rawRecord;
  writeDefaultString("studio.full.thread.state.v1", JSON.stringify(threadStateMap));
  const askHistoryMap = readStudioAskNoteHistoryMap();
  askHistoryMap[seededRecord.projectKey] = seedFixture.reopenedHistory;
  writeDefaultString("studio.ask.note.history.v2", JSON.stringify(askHistoryMap));
  synchronizeDefaults();
  await postBackendProjectThreadState(projectId, seededRecord);
  const ownerVersionPayload = await postBackendProjectVersion(projectId, {
    draft: seedFixture.draftReopened,
    baseVersionId: "",
  });
  const ownerVersionId = String(ownerVersionPayload?.version_id || ownerVersionPayload?.server_version_id || "").trim();
  const collaboratorEmail = `relaunch-collab-${projectId}@example.com`.toLowerCase();
  const commentText = `Relaunch collaboration restore note ${projectId}`;
  seededCollaboration = await seedBackendCollaboration(projectId, collaboratorEmail, commentText, ownerVersionId);
  for (const baseURL of ["http://127.0.0.1:3000", "http://localhost:3000"]) {
    await postBackendProjectThreadState(projectId, seededRecord, fallbackOwnerHeaders(), baseURL);
    const fallbackVersionPayload = await postBackendProjectVersion(projectId, {
      draft: seedFixture.draftReopened,
      baseVersionId: "",
    }, fallbackOwnerHeaders(), baseURL);
    const fallbackVersionId = String(fallbackVersionPayload?.version_id || fallbackVersionPayload?.server_version_id || "").trim();
    await seedBackendCollaboration(projectId, collaboratorEmail, commentText, fallbackVersionId, fallbackOwnerHeaders(), baseURL);
  }
  const probe = await waitForBackendReopenedHydration(projectId, seededRecord);
  assert(probe.response.ok, `Backend project probe failed: ${probe.response.status} ${JSON.stringify(probe.payload)}`);
  backendProbe = probe.metadata;
  assert(backendProbe, "Backend project probe returned no project metadata.");
  assert(backendProbe.focusedDiffKey === seededRecord.focusedDiffKey, `Expected backend focused diff ${seededRecord.focusedDiffKey}, got ${backendProbe.focusedDiffKey}`);
  assert(backendProbe.latestReopenedWriteID === seededRecord.latestReopenedWriteID, `Expected backend latest reopened write ${seededRecord.latestReopenedWriteID}, got ${backendProbe.latestReopenedWriteID}`);
  assert(backendProbe.activeVersion, "Backend project probe did not include an active version.");
  assert(
    backendProbe.activeVersion.source === "studio_clementine_page_write",
    `Expected active version source studio_clementine_page_write, got ${backendProbe.activeVersion.source}`
  );
  assert(
    normalizeText(backendProbe.activeVersion.draft) === normalizeText(seedFixture.draftReopened),
    `Expected backend active draft to match seeded Clementine page write, got ${backendProbe.activeVersion.draft}`
  );

  stagedProjectLoadRequest = stageStudioProjectLoadDebugRequest({
    debugDefaults: studioDebug.defaults,
    projectId,
    versionId: backendProbe.activeVersionId,
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
    versionId: backendProbe.activeVersionId,
    readDebugDiffState,
    timeoutMs: 45000,
    stagedRequest: stagedProjectLoadRequest,
  });

  try {
    await waitFor(() => {
      const state = readDebugDiffState();
      if (!state) return false;
      restoredState = state;
      return isExpectedRestoredState(state, projectId, backendProbe.activeVersionId, seedFixture.draftReopened, seededCollaboration);
    }, "restored reopened diff state after relaunch", 60000, 300);
  } catch (error) {
    restoredState = readDebugDiffState();
    if (isExpectedRestoredState(restoredState, projectId, backendProbe.activeVersionId, seedFixture.draftReopened, seededCollaboration)) {
      // The app can publish the final debug payload just after the last wait poll on slow rebuilds.
    } else {
      console.error(JSON.stringify({
        ok: false,
        failure: error?.message || String(error),
        appPath,
        throwawayProjectId: seedFixture?.projectId || "",
        seededRecord,
        seededCollaboration,
        backendProbe,
        localThreadStateMap: readFullThreadBrowseStateMap(),
        restoredState,
      }, null, 2));
      throw error;
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        appPath,
        throwawayProjectId: seedFixture?.projectId || "",
        seededRecord,
        seededCollaboration,
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
  writeDefaultString("client_token", originalClientTokenRaw);
  writeDefaultString("user_id", originalUserIDRaw);
  writeDefaultInt("client_token_cached_at", originalClientTokenCachedAt);
  writeDefaultString("client_token_base_url", originalClientTokenBaseURLRaw);
  writeDefaultString("client_token_expiry", originalClientTokenExpiryRaw);
  writeDefaultString("auth_debug_access_token", originalAuthDebugAccessTokenRaw);
  writeDefaultString("auth_debug_access_token_enabled", originalAuthDebugAccessTokenEnabledRaw);
  writeDefaultInt("studio_debug_load_project_token", originalLoadProjectToken);
  writeDefaultInt("studio_debug_load_project_ack_token", originalLoadProjectAckToken);
  writeDefaultString("studio_debug_load_project_id", originalLoadProjectID);
  writeDefaultString("studio_debug_load_project_version_id", originalLoadProjectVersionID);
}
