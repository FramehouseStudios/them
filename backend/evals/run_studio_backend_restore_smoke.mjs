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

function normalizeKey(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeText(value) {
  return String(value || "").replace(/\\n/g, " ").replace(/\s+/g, " ").trim();
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

function retryableFetchError(error) {
  const material = [
    error?.message,
    error?.cause?.message,
    error?.cause?.code,
    error?.code,
  ].filter(Boolean).join(" ");
  return /ECONNRESET|fetch failed|socket|network|terminated/i.test(material);
}

async function fetchBackendRequest(path, {
  method = "GET",
  headers = ownerHeaders(),
  body = null,
  baseURL = "http://127.0.0.1:3000",
  attempts = 4,
} = {}) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(`${baseURL}${path}`, {
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
      if (!retryableFetchError(error) || attempt === attempts) break;
      await sleep(350 * attempt);
    }
  }
  throw lastError || new Error(`Backend request failed for ${method} ${path}`);
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

function projectIdFromHistoryKey(value) {
  const clean = String(value || "").trim();
  return clean.startsWith("project:") ? clean.slice("project:".length) : clean;
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

async function postBackendProjectThreadState(projectId, record, headers = ownerHeaders(), baseURL = "http://127.0.0.1:3000") {
  const focusedDiffKey = String(record?.focusedDiffKey || "").trim().toLowerCase();
  const acknowledgedLineageKey = normalizeAcknowledgedKey(record?.acknowledgedLineageKey);
  const acknowledgedWriteID = normalizeKey(record?.acknowledgedWriteID);
  const acknowledgedFingerprint = String(record?.acknowledgedFingerprint || "").trim();
  const { response, payload } = await fetchBackendRequest("/screenplay/projects", {
    method: "POST",
    headers,
    baseURL,
    body: {
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
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to seed backend project thread state: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function postBackendProjectVersion(projectId, recovery, headers = ownerHeaders(), baseURL = "http://127.0.0.1:3000") {
  if (!recovery?.draft) return null;
  const { response, payload } = await fetchBackendRequest(`/screenplay/projects/${projectId}/version`, {
    method: "POST",
    headers,
    baseURL,
    body: {
      draft: recovery.draft,
      title: "Studio Restore Smoke",
      phase: "scene_draft",
      source: "studio_clementine_page_write",
      base_version_id: recovery.baseVersionId || "",
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to seed backend project version: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function fetchBackendJSON(path, headers = ownerHeaders(), baseURL = "http://127.0.0.1:3000") {
  return fetchBackendRequest(path, { headers, baseURL });
}

async function postBackendJSON(path, body, headers = {
  "Content-Type": "application/json",
  "X-APP-TOKEN": "them-dev",
}, baseURL = "http://127.0.0.1:3000") {
  return fetchBackendRequest(path, {
    method: "POST",
    headers,
    body: body || {},
    baseURL,
  });
}

async function ensureAuthenticatedStudioOwner(projectId) {
  const email = `studio-backend-restore-${projectId}-${randomUUID()}@example.test`.toLowerCase();
  const password = `ThemSmoke-${randomUUID()}-aA1!`;
  const signup = await postBackendJSON("/auth/signup", {
    email,
    password,
    display_name: "Studio Restore Smoke",
  });
  assert(
    signup.response.ok,
    `Failed to create Studio smoke auth user: ${signup.response.status} ${JSON.stringify(signup.payload)}`
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
  assert(accessToken, "Studio smoke auth signup did not return an access token.");
  assert(userId, "Studio smoke auth signup did not return a user id.");

  const session = await postBackendJSON("/session", {}, {
    "Content-Type": "application/json",
    "X-APP-TOKEN": "them-dev",
    Authorization: `Bearer ${accessToken}`,
  });
  assert(
    session.response.ok,
    `Failed to create Studio smoke backend session: ${session.response.status} ${JSON.stringify(session.payload)}`
  );
  const clientToken = String(session.payload?.client_token || session.payload?.session_id || "").trim();
  assert(clientToken, "Studio smoke backend session did not return a client token.");

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

async function verifyBackendCollaborationSnapshot(projectId, collaboratorEmail, commentText) {
  const collaboratorsProbe = await fetchBackendJSON(`/screenplay/projects/${projectId}/collaborators`);
  assert(
    collaboratorsProbe.response.ok,
    `Backend collaborators probe failed: ${collaboratorsProbe.response.status} ${JSON.stringify(collaboratorsProbe.payload)}`
  );
  const approvedEmails = Array.isArray(collaboratorsProbe.payload?.approved_emails)
    ? collaboratorsProbe.payload.approved_emails.map((value) => String(value || "").trim().toLowerCase())
    : [];
  assert(
    approvedEmails.includes(collaboratorEmail),
    `Expected backend approved emails to include ${collaboratorEmail}, got ${JSON.stringify(approvedEmails)}`
  );
  const collaborator = (collaboratorsProbe.payload?.collaborators || []).find((item) =>
    String(item?.email || "").trim().toLowerCase() === collaboratorEmail
  );
  assert(collaborator, `Expected backend collaborator ${collaboratorEmail}`);
  assert(
    String(collaborator.status || "").trim().toLowerCase() === "approved",
    `Expected backend collaborator ${collaboratorEmail} approved, got ${collaborator.status}`
  );

  const commentsPath = `/screenplay/projects/${projectId}/comments?actor_email=${encodeURIComponent(collaboratorEmail)}&limit=160`;
  const commentsProbe = await fetchBackendJSON(commentsPath);
  assert(
    commentsProbe.response.ok,
    `Backend comments probe failed: ${commentsProbe.response.status} ${JSON.stringify(commentsProbe.payload)}`
  );
  const comment = (commentsProbe.payload?.comments || []).find((item) =>
    normalizeText(item?.text || "") === normalizeText(commentText)
  );
  assert(comment, `Expected backend comment text ${commentText}`);
  assert(comment.resolved === true, `Expected backend comment to be resolved: ${JSON.stringify(comment)}`);
  assert(comment.can_edit === true, `Expected actor email to mark comment editable: ${JSON.stringify(comment)}`);
  return {
    collaborator,
    comment,
    collaboratorsPayload: collaboratorsProbe.payload,
    commentsPayload: commentsProbe.payload,
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
const originalUserIdRaw = readDefaultString("user_id");
const originalClientTokenRaw = readDefaultString("client_token");
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
let restoredState = null;
let backendProbe = null;
let collaborationSnapshot = null;
let appPath = "";
let thrownError = null;
let stagedProjectLoadRequest = null;

try {
  const health = await readHealth();
  assert(health?.ok === true, "Backend health is not OK on localhost:3000");

  seedFixture = createStudioRestoreFixture("reopened");
  seededRecord = seedFixture.reopenedSeed;
  const projectId = projectIdFromHistoryKey(seededRecord.projectKey);
  await ensureAuthenticatedStudioOwner(projectId);

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
    projectId,
    seededRecord.rawRecord || {}
  );
  await postBackendProjectVersion(
    projectId,
    draftRecovery
  );
  for (const baseURL of ["http://127.0.0.1:3000", "http://localhost:3000"]) {
    await postBackendProjectThreadState(projectId, seededRecord.rawRecord || {}, fallbackOwnerHeaders(), baseURL);
    await postBackendProjectVersion(projectId, draftRecovery, fallbackOwnerHeaders(), baseURL);
  }
  const probe = await waitForBackendReopenedHydration(
    projectId,
    seededRecord
  );
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
    normalizeText(backendProbe.activeVersion.draft) === normalizeText(draftRecovery.draft),
    `Expected backend active draft to match seeded Clementine page write, got ${backendProbe.activeVersion.draft}`
  );
  assert(
    seededRecord.reopenedLineageKeys.some((value) => backendProbe.reopenedLineageKeys.includes(value)),
    `Expected backend reopened lineage overlap, got ${JSON.stringify(backendProbe.reopenedLineageKeys)}`
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
    startupTimeoutMs: 90000,
    ackTimeoutMs: 90000,
    settleMs: 1600,
  });

  await waitFor(() => {
    const state = readDebugDiffState();
    if (!state) return false;
    const sessionID = normalizeKey(state.debugSessionID);
    return Boolean(sessionID) && sessionID !== originalDebugSessionID;
  }, "fresh Studio debug session after relaunch", 90000, 300);

  await ensureStudioProjectLoadedWithDebugHook({
    debugDefaults: studioDebug.defaults,
    projectId,
    versionId: backendProbe.activeVersionId,
    readDebugDiffState,
    timeoutMs: 90000,
    stagedRequest: stagedProjectLoadRequest,
  });

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
      && normalizeKey(state.selectedProjectID) === normalizeKey(projectId)
      && normalizeKey(state.latestVersionID) === backendProbe.activeVersionId
      && state.loadProjectReady === true
      && normalizeKey(state.loadProjectStage) === "editor_ready"
      && !normalizeKey(state.loadProjectError)
      && normalizeText(`${state.draftPreview || ""} ${state.draftTailPreview || ""}`).includes(normalizeText(draftRecovery.draft))
      && Number(state.reopenedDiffCount || 0) > 0;
  }, "backend-only reopened diff restore after relaunch", 90000, 300);

  const collaboratorEmail = `collab-${projectId}@example.com`.toLowerCase();
  const commentText = `Restored owner context collaboration note ${projectId}`;
  const collaboratorResult = await performInspectorInteraction(
    "approve_collaborator",
    collaboratorEmail,
    "Approved by restored Studio owner smoke."
  );
  assert(
    Array.isArray(collaboratorResult.approved_emails) && collaboratorResult.approved_emails.includes(collaboratorEmail),
    `Expected app collaboration payload to approve ${collaboratorEmail}: ${JSON.stringify(collaboratorResult)}`
  );
  const commentResult = await performInspectorInteraction(
    "add_comment",
    collaboratorEmail,
    commentText
  );
  assert(
    Number(commentResult.comment_count || 0) >= 1,
    `Expected app comment payload to include a saved comment: ${JSON.stringify(commentResult)}`
  );
  const commentId = String(commentResult.latest_comment_id || "").trim();
  assert(commentId, `Expected app comment payload to include latest_comment_id: ${JSON.stringify(commentResult)}`);
  const resolveResult = await performInspectorInteraction(
    "resolve_first_comment",
    commentId,
    ""
  );
  assert(
    resolveResult.latest_comment_resolved === true,
    `Expected app comment payload to resolve the comment: ${JSON.stringify(resolveResult)}`
  );
  collaborationSnapshot = await verifyBackendCollaborationSnapshot(
    projectId,
    collaboratorEmail,
    commentText
  );

  console.log(JSON.stringify({
    ok: true,
    appPath,
    throwawayProjectId: seedFixture?.projectId || "",
    seededRecord,
    backendProbe,
    collaborationSnapshot,
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
  writeDefaultString("user_id", originalUserIdRaw);
  writeDefaultString("client_token", originalClientTokenRaw);
  writeDefaultInt("client_token_cached_at", originalClientTokenCachedAt);
  writeDefaultString("client_token_base_url", originalClientTokenBaseURLRaw);
  writeDefaultString("client_token_expiry", originalClientTokenExpiryRaw);
  writeDefaultString("auth_debug_access_token", originalAuthDebugAccessTokenRaw);
  writeDefaultString("auth_debug_access_token_enabled", originalAuthDebugAccessTokenEnabledRaw);
  writeDefaultInt("studio_debug_load_project_token", originalLoadProjectToken);
  writeDefaultInt("studio_debug_load_project_ack_token", originalLoadProjectAckToken);
  writeDefaultString("studio_debug_load_project_id", originalLoadProjectID);
  writeDefaultString("studio_debug_load_project_version_id", originalLoadProjectVersionID);
  if (thrownError) {
    throw thrownError;
  }
}
