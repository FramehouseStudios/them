// T-live-draft-sync — two-device UI smoke (opt-in).
//
// Proves the writer-facing claim end to end, in the real apps: the macOS
// scaffold and the iPhone simulator open the same project against one
// spawned backend with live sync opted in (THEM_LIVE_DRAFT_SYNC=1), the phone
// types a marker and the Mac's editor shows it; the Mac types a marker and
// the phone's editor shows it; the backend ends up with each marker saved
// exactly once (the follower never double-saves).
//
// Not part of the PR gate (needs a Mac with Xcode + a simulator). Run:
//   npm run eval:live-draft-two-device
//
// Orchestration: the Mac is driven through the Studio debug defaults
// (studio_debug_manual_edit_*), the iPhone through an XCUITest
// (V1SmokeUITests.test_live_draft_two_device_follows_the_other_device) that
// receives the project fixture + markers via the restore-fixture xcconfig.
// The iOS test runs asynchronously; this script drives the Mac in step with
// what the backend channel reports.

import { spawn } from "node:child_process";
import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  cleanupStudioEvalSessionsWithHelper,
  createStudioEvalDebugContext,
  ensureStudioProjectLoadedWithDebugHook,
  ensureStudioVisibleWithOpenHandshake,
  runCommand,
  runOptionalCommand,
  stageStudioProjectLoadDebugRequest,
} from "./studio_eval_debug_utils.mjs";
import {
  createStudioRestoreAppLaunchEnvironment,
  createStudioRestoreUITestFixtureJSON,
  normalizeStudioRestoreKey,
  normalizeStudioRestoreText,
  requestStudioRestoreJSON,
  seedBackendStudioRestoreFixture,
} from "./studio_restore_seed_helper.mjs";
import { fetchStudioProjectMetadata } from "./studio_project_metadata_probe.mjs";
import { startBackend } from "../tests/helpers/backend_test_server.mjs";

const ROOT_DIR = fileURLToPath(new URL("../..", import.meta.url));
const STUDIO_APP_SESSION_HELPER = fileURLToPath(new URL("./studio_app_session_helper.sh", import.meta.url));
const APP_TOKEN = "them-dev";
const AUTOMATION_SESSION_ID = `live-draft-two-device-${process.pid}-${Date.now()}`;
const IOS_TEST_NAME = "test_live_draft_two_device_follows_the_other_device";
const STAMP = `${Date.now().toString(36)}-${process.pid}`;
const PHONE_MARKER = `LIVE-PHONE-${STAMP}`;
const MAC_MARKER = `LIVE-MAC-${STAMP}`;
// The iOS test compiles the app + UI tests before it can type; the Mac side
// must be patient. Bounded so a hung simulator still fails the smoke.
const IOS_TEST_TIMEOUT_MS = Number(process.env.THEM_LIVE_DRAFT_IOS_TIMEOUT_MS || 15 * 60_000);
const PHONE_TO_MAC_TIMEOUT_MS = Number(process.env.THEM_LIVE_DRAFT_PHONE_TO_MAC_TIMEOUT_MS || 12 * 60_000);
const MAC_TO_BACKEND_TIMEOUT_MS = 30_000;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate, description, timeoutMs, intervalMs = 300) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await predicate();
    if (last) return last;
    await sleep(intervalMs);
  }
  throw new Error(`Timed out waiting for ${description}.`);
}

function occurrenceCount(text, needle) {
  const source = String(text || "");
  return needle ? source.split(needle).length - 1 : 0;
}

// ---------- macOS app (studio-eval debug defaults) ----------

const studioDebug = createStudioEvalDebugContext({ run: runCommand, runOptional: runOptionalCommand });
const studioApp = studioDebug.ownedApp;

function synchronizeDefaults() {
  runOptionalCommand("defaults", ["synchronize", "io.them.them"]);
  for (const plistPath of studioDebug.defaults.plistTargets || []) {
    const target = plistPath.endsWith(".plist") ? plistPath.slice(0, -".plist".length) : plistPath;
    runOptionalCommand("defaults", ["synchronize", target]);
  }
}

function readDebugDiffState() {
  return studioDebug.readDebugDiffState(null);
}

function buildCurrentMacApp() {
  runCommand("xcodebuild", [
    "build",
    "-project", "them.xcodeproj",
    "-scheme", "them-macOS-scaffold",
    "-configuration", "Mac Scaffold Debug",
    "-destination", "platform=macOS",
    "CODE_SIGNING_ALLOWED=NO",
    "CODE_SIGNING_REQUIRED=NO",
  ], { cwd: ROOT_DIR });
}

function findDebugAppPath() {
  const direct = process.env.THEM_APP_PATH?.trim();
  if (direct && existsSync(direct)) return direct;
  const discovered = runCommand("/bin/zsh", [
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
  assert(discovered && existsSync(discovered), `Could not locate the Debug them.app (${discovered || "none"})`);
  return discovered;
}

function writeMacDefaults(seeded) {
  const { writeDefaultString, writeDefaultInt, writeDefaultBool } = studioDebug;
  writeDefaultString("studio_debug_target_session_id", AUTOMATION_SESSION_ID);
  writeDefaultString("app_token", APP_TOKEN);
  writeDefaultString("backend_base_url", seeded.baseURL);
  writeDefaultString("user_id", seeded.identity.userID);
  writeDefaultString("client_token", seeded.identity.clientToken);
  writeDefaultInt("client_token_cached_at", seeded.identity.clientTokenCachedAt);
  writeDefaultString("client_token_base_url", seeded.baseURL);
  writeDefaultString("client_token_expiry", seeded.identity.clientTokenExpiry);
  writeDefaultString("auth_debug_access_token", seeded.identity.accessToken);
  writeDefaultBool("auth_debug_access_token_enabled", true);
  writeDefaultBool("auth_signed_in", true);
  writeDefaultBool("auth_session_token_deletion_pending", false);
  writeDefaultString("studio.full.thread.state.v1", seeded.localState.fullThreadStateJSON);
  writeDefaultString("studio.ask.note.history.v2", "{}");
  writeDefaultString("studio.diff.keep-current.v1", seeded.localState.acknowledgedJSON);
  writeDefaultString("studio.diff.keep-current.writeids.v1", seeded.localState.acknowledgedWriteIDsJSON);
  writeDefaultString("studio_debug_diff_state_json", "");
  writeDefaultString("studio_debug_project_load_trace_json", "[]");
  writeDefaultString("studio_debug_submit_transport_mode", "stub");
  writeDefaultInt("studio_debug_manual_edit_token", 0);
  writeDefaultInt("studio_debug_manual_edit_ack_token", 0);
  writeDefaultString("studio_debug_manual_edit_text", "");
  synchronizeDefaults();
}

async function openProjectOnMac(seeded) {
  const appPath = findDebugAppPath();
  cleanupStudioEvalSessionsWithHelper({ runOptional: runOptionalCommand });
  writeMacDefaults(seeded);
  const stagedRequest = stageStudioProjectLoadDebugRequest({
    debugDefaults: studioDebug.defaults,
    projectId: seeded.projectID,
    versionId: seeded.versionID,
  });
  await ensureStudioVisibleWithOpenHandshake({
    appPath,
    helperPath: STUDIO_APP_SESSION_HELPER,
    debugDefaults: studioDebug.defaults,
    launchEnvironment: {
      ...createStudioRestoreAppLaunchEnvironment(seeded),
      THEM_STUDIO_AUTOMATION_SESSION_ID: AUTOMATION_SESSION_ID,
      THEM_LIVE_DRAFT_SYNC: "1",
    },
    runOptional: runOptionalCommand,
    activateApp: (path, session) => studioApp.activate(path, session),
    appHasWindow: () => studioApp.hasWindow(),
    readDebugDiffState,
  });
  await ensureStudioProjectLoadedWithDebugHook({
    debugDefaults: studioDebug.defaults,
    projectId: seeded.projectID,
    versionId: seeded.versionID,
    readDebugDiffState,
    timeoutMs: 45_000,
    stagedRequest,
  });
  const state = await waitFor(() => {
    const current = readDebugDiffState();
    if (!current) return null;
    const draft = normalizeStudioRestoreText(`${current.draftPreview || ""} ${current.draftTailPreview || ""}`);
    return normalizeStudioRestoreKey(current.selectedProjectID) === normalizeStudioRestoreKey(seeded.projectID)
      && normalizeStudioRestoreKey(current.loadProjectStage) === "editor_ready"
      && draft.includes(normalizeStudioRestoreText(seeded.expectedDraft))
      ? current
      : null;
  }, "macOS Studio to open the shared project", 60_000);
  return { appPath, pid: studioApp.pid, state };
}

async function typeOnMac(text) {
  const token = studioDebug.nextToken("studio_debug_manual_edit_token", "studio_debug_manual_edit_ack_token");
  writeFileSync("/tmp/them_studio_debug_manual_edit_request.json", JSON.stringify({ token, text }), "utf8");
  studioDebug.writeDefaultString("studio_debug_manual_edit_text", text);
  studioDebug.writeDefaultInt("studio_debug_manual_edit_token", token);
  synchronizeDefaults();
  await waitFor(
    () => studioDebug.readDefaultInt("studio_debug_manual_edit_ack_token") === token,
    "macOS manual edit ack",
    15_000,
    150
  );
  return token;
}

function macDraftText() {
  const state = readDebugDiffState();
  return {
    state,
    text: normalizeStudioRestoreText(`${state?.draftPreview || ""} ${state?.draftTailPreview || ""}`),
  };
}

// ---------- backend channel probes ----------

async function liveSnapshot(seeded) {
  const result = await requestStudioRestoreJSON({
    baseURL: seeded.baseURL,
    path: `/screenplay/projects/${encodeURIComponent(seeded.projectID)}/live/snapshot`,
    method: "GET",
    headers: seeded.headers,
  });
  assert(result.response.ok, `live snapshot failed: ${result.status} ${JSON.stringify(result.payload)}`);
  return result.payload;
}

// ---------- iPhone (XCUITest, asynchronous) ----------

function startIPhoneTest(seeded) {
  const fixtureJSON = createStudioRestoreUITestFixtureJSON(
    { ...seeded, localState: { ...seeded.localState, askHistoryJSON: "{}" } },
    { loadToken: Date.now() % 1_000_000_000 }
  );
  const payload = JSON.parse(fixtureJSON);
  payload.liveDraft = {
    phoneMarker: PHONE_MARKER,
    macMarker: MAC_MARKER,
    waitSeconds: Math.floor(PHONE_TO_MAC_TIMEOUT_MS / 1000),
  };
  const fixtureBase64URL = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const xcconfigPath = `/tmp/them_live_draft_two_device_${process.pid}.xcconfig`;
  writeFileSync(xcconfigPath, `THEM_UITEST_RESTORE_FIXTURE_BASE64URL = ${fixtureBase64URL}\n`, { encoding: "utf8", mode: 0o600 });
  const child = spawn("bash", ["scripts/run_v1_ui_smoke.sh"], {
    cwd: ROOT_DIR,
    env: {
      ...process.env,
      ONLY_TESTING: `themUITests/V1SmokeUITests/${IOS_TEST_NAME}`,
      THEM_UITEST_RESTORE_XCCONFIG_PATH: xcconfigPath,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const done = new Promise((resolve) => {
    child.on("exit", (code) => {
      if (existsSync(xcconfigPath)) unlinkSync(xcconfigPath);
      resolve({ status: code ?? 1, stdout, stderr });
    });
  });
  const timer = setTimeout(() => {
    if (child.exitCode == null) child.kill("SIGTERM");
  }, IOS_TEST_TIMEOUT_MS);
  timer.unref?.();
  return { child, done, output: () => `${stdout}\n${stderr}` };
}

// ---------- main ----------

const restoreStringKeys = [
  "studio.full.thread.state.v1", "studio.diff.keep-current.v1", "studio.diff.keep-current.writeids.v1",
  "studio.ask.note.history.v2", "studio_debug_diff_state_json", "studio_debug_project_load_trace_json",
  "studio_debug_submit_transport_mode", "studio_debug_manual_edit_text", "app_token", "backend_base_url",
  "client_token", "user_id", "client_token_base_url", "client_token_expiry", "auth_debug_access_token",
  "studio_debug_load_project_id", "studio_debug_load_project_version_id", "studio_debug_target_session_id",
];
const restoreIntKeys = [
  "client_token_cached_at", "studio_debug_load_project_token", "studio_debug_load_project_ack_token",
  "studio_debug_manual_edit_token", "studio_debug_manual_edit_ack_token",
];
const restoreBoolKeys = ["auth_debug_access_token_enabled", "auth_signed_in", "auth_session_token_deletion_pending"];
const originalStrings = Object.fromEntries(restoreStringKeys.map((key) => [key, studioDebug.readDefaultString(key)]));
const originalInts = Object.fromEntries(restoreIntKeys.map((key) => [key, studioDebug.readDefaultInt(key)]));
const originalBools = Object.fromEntries(restoreBoolKeys.map((key) => [key, studioDebug.readDefaultBool(key)]));

let server = null;
let iphone = null;
try {
  if (process.env.THEM_LIVE_DRAFT_SKIP_MAC_BUILD !== "1") buildCurrentMacApp();
  server = await startBackend({ env: { APP_TOKEN, REQUIRE_USER_AUTH: "1" } });
  const seeded = await seedBackendStudioRestoreFixture({
    baseURL: server.baseUrl,
    appToken: APP_TOKEN,
    title: `Live Draft Two Device ${STAMP}`,
  });

  // 1. Mac opens the project and joins the channel.
  const mac = await openProjectOnMac(seeded);
  assert(mac.pid > 0, "Could not identify the running macOS app.");
  const macJoined = await waitFor(async () => {
    const snapshot = await liveSnapshot(seeded);
    return Number(snapshot.device_count || 0) >= 1 ? snapshot : null;
  }, "macOS to subscribe to the live channel", 30_000);

  // 2. iPhone builds, opens the same project, types its marker.
  iphone = startIPhoneTest(seeded);
  const phoneOnChannel = await waitFor(async () => {
    if (iphone.child.exitCode != null) {
      throw new Error(`iPhone UI test exited early (status ${iphone.child.exitCode}).\n${iphone.output()}`);
    }
    const snapshot = await liveSnapshot(seeded);
    return String(snapshot.text || "").includes(PHONE_MARKER) ? snapshot : null;
  }, "the iPhone's keystrokes to reach the live channel", PHONE_TO_MAC_TIMEOUT_MS, 500);

  // 3. ...and the Mac's editor shows them without a relaunch.
  const macAfterPhone = await waitFor(() => {
    const { state, text } = macDraftText();
    assert(studioApp.pid === mac.pid, `macOS app relaunched during live sync: ${mac.pid} -> ${studioApp.pid || "stopped"}`);
    return text.includes(PHONE_MARKER) && !normalizeStudioRestoreKey(state?.errorText) ? state : null;
  }, "the iPhone's keystrokes to appear in the macOS editor", 30_000);
  const macFollowStatus = String(macAfterPhone?.autosaveStatusText || "");

  // 4. Mac types its marker; the channel carries it.
  await typeOnMac(MAC_MARKER);
  const channelAfterMac = await waitFor(async () => {
    const snapshot = await liveSnapshot(seeded);
    return String(snapshot.text || "").includes(MAC_MARKER) ? snapshot : null;
  }, "the Mac's keystrokes to reach the live channel", MAC_TO_BACKEND_TIMEOUT_MS, 250);

  // 5. The iPhone test asserts the Mac marker landed in its editor and exits.
  const iphoneResult = await iphone.done;
  const combined = `${iphoneResult.stdout}\n${iphoneResult.stderr}`;
  assert(
    iphoneResult.status === 0,
    `iPhone did not see the Mac's typing.\nstatus=${iphoneResult.status}\n${combined.slice(-6000)}`
  );
  assert(
    !/Executed 0 tests/.test(combined) && !new RegExp(`Test Case .*${IOS_TEST_NAME}.* skipped`, "i").test(combined),
    `iPhone live draft UI test did not execute.\n${combined.slice(-4000)}`
  );

  // 6. Persistence: each marker saved exactly once, by one device.
  const probe = await waitFor(async () => {
    const current = await fetchStudioProjectMetadata(seeded.projectID, seeded.headers, seeded.baseURL);
    const active = String(current.metadata?.activeVersion?.draft || "");
    return current.response.ok && active.includes(PHONE_MARKER) && active.includes(MAC_MARKER) ? current : null;
  }, "both markers to be saved in the active version", 45_000, 500);
  const versions = probe.metadata?.versions || [];
  const versionsWithMac = versions.filter((version) => String(version.draft || "").includes(MAC_MARKER));
  const activeDraft = String(probe.metadata.activeVersion.draft || "");
  assert(occurrenceCount(activeDraft, PHONE_MARKER) === 1, "phone marker duplicated in the saved draft");
  assert(occurrenceCount(activeDraft, MAC_MARKER) === 1, "mac marker duplicated in the saved draft");
  assert(
    versionsWithMac.length === 1,
    `expected exactly one saved version carrying the Mac marker (follower must not double-save), got ${versionsWithMac.length}`
  );

  console.log(JSON.stringify({
    ok: true,
    projectID: seeded.projectID,
    channel: {
      macJoinedSeq: macJoined.seq,
      seqAfterPhone: phoneOnChannel.seq,
      seqAfterMac: channelAfterMac.seq,
      deviceCountAfterMac: channelAfterMac.device_count,
    },
    mac: { pid: mac.pid, followStatusAfterPhone: macFollowStatus },
    persistence: {
      activeVersionID: probe.metadata.activeVersionId,
      versionsWithMacMarker: versionsWithMac.length,
    },
  }, null, 2));
  console.log("live-draft-two-device-smoke: ok");
} catch (error) {
  if (iphone?.child && iphone.child.exitCode == null) iphone.child.kill("SIGTERM");
  if (server) {
    const backendStderr = server.stderr.join("").trim();
    if (backendStderr) console.error(`live draft backend stderr:\n${backendStderr}`);
  }
  throw error;
} finally {
  try {
    cleanupStudioEvalSessionsWithHelper({ runOptional: runOptionalCommand });
  } catch (cleanupError) {
    console.error(`Studio eval cleanup failed: ${cleanupError?.message || cleanupError}`);
  }
  for (const [key, value] of Object.entries(originalStrings)) studioDebug.writeDefaultString(key, value);
  for (const [key, value] of Object.entries(originalInts)) studioDebug.writeDefaultInt(key, value);
  for (const [key, value] of Object.entries(originalBools)) studioDebug.writeDefaultBool(key, value);
  synchronizeDefaults();
  if (server) await server.stop();
}
