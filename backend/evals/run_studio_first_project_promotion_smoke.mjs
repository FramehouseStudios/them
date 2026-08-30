import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, unlinkSync } from "node:fs";
import http from "node:http";
import {
  cleanupStudioEvalSessionsWithHelper,
  createStudioEvalDebugContext,
  ensureStudioVisibleWithOpenHandshake,
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
const studioApp = studioDebug.ownedApp;

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

async function ensureOwnerIdentity(label) {
  const email = `studio-first-project-${label}-${randomUUID()}@example.test`.toLowerCase();
  const password = `ThemFirstProject-${randomUUID()}-aA1!`;
  const signup = await postBackendAuthJSON("/auth/signup", {
    email,
    password,
    display_name: "Studio First Project Promotion Smoke",
  });
  assert(
    signup.response.ok,
    `Failed to create Studio first-project owner: ${signup.response.status} ${JSON.stringify(signup.payload)}`
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
  assert(accessToken, "Studio first-project owner signup did not return an access token");
  assert(userId, "Studio first-project owner signup did not return a user id");

  const session = await postBackendAuthJSON("/session", {}, {
    "Content-Type": "application/json",
    "X-APP-TOKEN": "them-dev",
    Authorization: `Bearer ${accessToken}`,
  });
  assert(
    session.response.ok,
    `Failed to create Studio first-project client session: ${session.response.status} ${JSON.stringify(session.payload)}`
  );
  const clientToken = String(session.payload?.client_token || session.payload?.session_id || "").trim();
  assert(clientToken, "Studio first-project client session did not return a client token");

  writeDefaultString("user_id", userId);
  writeDefaultString("client_token", clientToken);
  writeDefaultInt("client_token_cached_at", Math.floor(Date.now() / 1000));
  writeDefaultString("client_token_base_url", "http://127.0.0.1:3000");
  const expiresIn = Math.max(60, Number(session.payload?.expires_in || 0) || 0);
  writeDefaultString("client_token_expiry", new Date(Date.now() + expiresIn * 1000).toISOString());
  writeDefaultString("auth_debug_access_token", accessToken);
  writeDefaultBool("auth_debug_access_token_enabled", true);

  return { userId, clientToken, accessToken, email };
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

async function fetchBackendProject(projectId) {
  const result = await fetchBackendJSON(`/screenplay/projects/${projectId}?include_drafts=1&version_limit=12`);
  assert(
    result.response.ok,
    `Backend promoted project probe failed: ${result.response.status} ${JSON.stringify(result.payload)}`
  );
  return result.payload?.payload?.project || result.payload?.project || {};
}

function activeVersionFromProject(project) {
  const activeVersionId = String(project?.active_version_id || project?.activeVersionId || "").trim();
  const versions = Array.isArray(project?.versions) ? project.versions : [];
  return versions.find((version) => String(version.id || "").trim() === activeVersionId) || versions[0] || {};
}

function appHasWindow() {
  return studioApp.hasWindow();
}

function appIsRunning() {
  return studioApp.isRunning();
}

function activateApp(appPath = "", appSession = null) {
  studioApp.activate(appPath, appSession);
}

function quitApp() {
  cleanupStudioEvalSessionsWithHelper({ runOptional });
}

async function ensureAppStopped() {
  quitApp();
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

const originalUserIdRaw = readDefaultString("user_id");
const originalClientTokenRaw = readDefaultString("client_token");
const originalClientTokenCachedAt = readDefaultInt("client_token_cached_at");
const originalClientTokenBaseURLRaw = readDefaultString("client_token_base_url");
const originalClientTokenExpiryRaw = readDefaultString("client_token_expiry");
const originalAuthDebugAccessTokenRaw = readDefaultString("auth_debug_access_token");
const originalAuthDebugAccessTokenEnabledRaw = readDefaultString("auth_debug_access_token_enabled");
const originalLiveDraftRaw = readDefaultString("studio_live_draft_text_v1");
const originalStructuredDraftRaw = readDefaultString("studio_structured_draft_v1");

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const draftMarker = `FIRST-PROJECT-PROMOTION-${Date.now().toString(36).toUpperCase()}`;
const restoredDraft = [
  "INT. OBSERVATORY - NIGHT",
  "",
  `CLEMENTINE listens to the city breathe below her. ${draftMarker}`,
  "",
  "She writes one sentence, then another, like she is learning the room's pulse.",
].join("\n");

let appPath = "";
let ownerIdentity = null;
let promotedState = null;
let backendProject = null;
let backendActiveVersion = null;

try {
  const health = await readHealth();
  assert(health?.ok === true, "Backend health is not OK on localhost:3000");

  appPath = findDebugAppPath();
  await ensureAppStopped();
  clearDebugCommandState();
  ownerIdentity = await ensureOwnerIdentity(stamp);
  writeDefaultString("studio_live_draft_text_v1", restoredDraft);
  writeDefaultString("studio_structured_draft_v1", "");

  await ensureStudioVisibleWithOpenHandshake({
    appPath,
    debugDefaults: studioDebug.defaults,
    runOptional,
    activateApp,
    appHasWindow,
    readDebugDiffState,
    settleMs: 1600,
  });

  await waitForState((state) => {
    const selectedProjectId = String(state.selectedProjectID || "").trim();
    const selectedVersionId = String(state.latestVersionID || "").trim();
    const visibleDraft = normalizeText(`${state.draftPreview || ""} ${state.draftTailPreview || ""}`);
    promotedState = state;
    return selectedProjectId.length > 0
      && selectedVersionId.length > 0
      && state.selectedProjectPresent === true
      && visibleDraft.includes(draftMarker)
      && !String(state.errorText || "").trim()
      && !Boolean(state.isSaving);
  }, "restored live draft promoted into a selected Studio project", 60000, 300);

  const projectId = String(promotedState.selectedProjectID || "").trim();
  const versionId = String(promotedState.latestVersionID || "").trim();
  backendProject = await fetchBackendProject(projectId);
  backendActiveVersion = activeVersionFromProject(backendProject);

  assert(
    normalizeKey(backendProject.id) === normalizeKey(projectId),
    `Expected backend project ${projectId}, got ${JSON.stringify(backendProject)}`
  );
  assert(
    normalizeKey(backendProject.active_version_id || backendProject.activeVersionId) === normalizeKey(versionId),
    `Expected backend active version ${versionId}, got ${backendProject.active_version_id || backendProject.activeVersionId}`
  );
  assert(
    String(backendActiveVersion.source || "").trim() === "studio_first_turn_auto_create",
    `Expected promoted version source studio_first_turn_auto_create, got ${backendActiveVersion.source}`
  );
  assert(
    String(backendActiveVersion.draft || "").includes(draftMarker),
    `Expected promoted backend draft to include ${draftMarker}: ${JSON.stringify(backendActiveVersion)}`
  );

  console.log(JSON.stringify({
    ok: true,
    appPath,
    ownerEmail: ownerIdentity?.email || "",
    projectId,
    versionId,
    draftMarker,
    promotedState,
    backendProject,
    backendActiveVersion,
  }, null, 2));
  console.log("studio-first-project-promotion-smoke: ok");
} finally {
  clearDebugCommandState();
  writeDefaultString("user_id", originalUserIdRaw);
  writeDefaultString("client_token", originalClientTokenRaw);
  writeDefaultInt("client_token_cached_at", originalClientTokenCachedAt);
  writeDefaultString("client_token_base_url", originalClientTokenBaseURLRaw);
  writeDefaultString("client_token_expiry", originalClientTokenExpiryRaw);
  writeDefaultString("auth_debug_access_token", originalAuthDebugAccessTokenRaw);
  writeDefaultString("auth_debug_access_token_enabled", originalAuthDebugAccessTokenEnabledRaw);
  writeDefaultString("studio_live_draft_text_v1", originalLiveDraftRaw);
  writeDefaultString("studio_structured_draft_v1", originalStructuredDraftRaw);
}
