import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  createStudioEvalDebugContext,
  ensureStudioProjectLoadedWithDebugHook,
  ensureStudioVisibleWithOpenHandshake,
  stageStudioProjectLoadDebugRequest,
} from "./studio_eval_debug_utils.mjs";
import { fetchStudioProjectMetadata } from "./studio_project_metadata_probe.mjs";
import {
  createStudioRestoreUITestFixtureJSON,
  normalizeStudioRestoreKey,
  normalizeStudioRestoreText,
  seedBackendStudioRestoreFixture,
} from "./studio_restore_seed_helper.mjs";
import { startBackend } from "../tests/helpers/backend_test_server.mjs";

const ROOT_DIR = fileURLToPath(new URL("../..", import.meta.url));
const APP_TOKEN = "them-dev";
const CROSS_PLATFORM_PORT = Number(process.env.THEM_CROSS_PLATFORM_RESTORE_CONTRACT_PORT || 31338);
const CROSS_PLATFORM_FIXTURE_PATH = String(
  process.env.THEM_UITEST_RESTORE_FIXTURE_PATH || "/tmp/them_studio_cross_platform_restore_fixture.json"
).trim() || "/tmp/them_studio_cross_platform_restore_fixture.json";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
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
    maxBuffer: 128 * 1024 * 1024,
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

function readDefaultInt(key) {
  return studioDebug.readDefaultInt(key);
}

function writeDefaultString(key, value) {
  studioDebug.writeDefaultString(key, value);
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

function appIsRunning() {
  return appProcessIDs().length > 0;
}

function currentAppPidForPath(appPath = "") {
  const cleanAppPath = String(appPath || "").trim();
  if (!cleanAppPath) return 0;
  const executablePath = cleanAppPath.endsWith("/Contents/MacOS/them")
    ? cleanAppPath
    : `${cleanAppPath.replace(/\/+$/, "")}/Contents/MacOS/them`;
  const result = runOptional("ps", ["-axo", "pid=,command="]);
  if (result.status !== 0 || !result.stdout.trim()) return 0;
  for (const line of result.stdout.split(/\r?\n/)) {
    if (!line.includes(executablePath)) continue;
    const match = line.trim().match(/^(\d+)\s+/);
    if (match) return Number(match[1]) || 0;
  }
  return 0;
}

function activateApp(appPath = "") {
  const pid = currentAppPidForPath(appPath) || appProcessIDs()[0] || 0;
  if (!pid) return;
  runOptional("osascript", [
    "-e", "tell application \"System Events\"",
    "-e", "repeat with attempt from 1 to 40",
    "-e", `set matchingProcesses to (processes whose unix id is ${pid})`,
    "-e", "if (count of matchingProcesses) > 0 then",
    "-e", "set targetProcess to item 1 of matchingProcesses",
    "-e", "set visible of targetProcess to true",
    "-e", "set frontmost of targetProcess to true",
    "-e", "return \"1\"",
    "-e", "end if",
    "-e", "delay 0.1",
    "-e", "end repeat",
    "-e", "end tell",
  ], {
    timeout: 6000,
  });
}

function appHasWindow() {
  const output = osascript([
    "try",
    "tell application \"System Events\"",
    "tell process \"them\"",
    "return count of windows",
    "end tell",
    "end tell",
    "on error",
    "return \"0\"",
    "end try",
  ]);
  return Number(output) > 0;
}

function quitApp() {
  runOptional("osascript", ["-e", "try", "-e", "tell application \"them\" to quit", "-e", "end try"], {
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
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (!appIsRunning()) return;
    await sleep(250);
  }
  throw new Error("Timed out waiting for THEM macOS app to stop before cross-platform restore.");
}

function readDebugDiffState() {
  return studioDebug.readDebugDiffState(null);
}

function writeMacRestoreDefaults(seeded) {
  writeDefaultString("app_token", APP_TOKEN);
  writeDefaultString("backend_base_url", seeded.baseURL);
  writeDefaultString("user_id", seeded.identity.userID);
  writeDefaultString("client_token", seeded.identity.clientToken);
  writeDefaultInt("client_token_cached_at", seeded.identity.clientTokenCachedAt);
  writeDefaultString("client_token_base_url", seeded.baseURL);
  writeDefaultString("client_token_expiry", seeded.identity.clientTokenExpiry);
  writeDefaultString("auth_debug_access_token", seeded.identity.accessToken);
  writeDefaultBool("auth_debug_access_token_enabled", true);
  writeDefaultString("studio.full.thread.state.v1", seeded.localState.fullThreadStateJSON);
  writeDefaultString("studio.ask.note.history.v2", "{}");
  writeDefaultString("studio.diff.keep-current.v1", seeded.localState.acknowledgedJSON);
  writeDefaultString("studio.diff.keep-current.writeids.v1", seeded.localState.acknowledgedWriteIDsJSON);
  writeDefaultString("studio_debug_diff_state_json", "");
  writeDefaultString("studio_debug_project_load_trace_json", "[]");
  synchronizeDefaults();
}

function expectedCollaborationState(state, seeded) {
  const approvedEmails = Array.isArray(state?.approvedEmails)
    ? state.approvedEmails.map((value) => normalizeStudioRestoreKey(value))
    : [];
  const latestCommentText = normalizeStudioRestoreText(state?.latestCommentText ?? state?.latest_comment_text ?? "");
  const latestCommentAuthor = normalizeStudioRestoreKey(state?.latestCommentAuthor ?? state?.latest_comment_author ?? "");
  return Number(state?.collaboratorCount ?? state?.collaborator_count ?? 0) >= 1
    && approvedEmails.includes(normalizeStudioRestoreKey(seeded.expectedCollaboratorEmail))
    && Number(state?.commentCount ?? state?.comment_count ?? 0) >= 1
    && latestCommentText === normalizeStudioRestoreText(seeded.expectedCommentText)
    && latestCommentAuthor === normalizeStudioRestoreKey(seeded.expectedCollaboratorEmail)
    && Boolean(state?.latestCommentResolved ?? state?.latest_comment_resolved) === true
    && Boolean(state?.latestCommentDeleted ?? state?.latest_comment_deleted) === false;
}

function expectedMacRestoreState(state, seeded, stagedRequest) {
  if (!state) return false;
  const reopenedLineageKeys = Array.isArray(state.restoredReopenedLineageKeys)
    ? state.restoredReopenedLineageKeys.map((value) => normalizeStudioRestoreKey(value))
    : [];
  const draftText = normalizeStudioRestoreText(`${state.draftPreview || ""} ${state.draftTailPreview || ""}`);
  return normalizeStudioRestoreKey(state.projectKey) === normalizeStudioRestoreKey(seeded.projectKey)
    && normalizeStudioRestoreKey(state.selectedProjectID) === normalizeStudioRestoreKey(seeded.projectID)
    && normalizeStudioRestoreKey(state.latestVersionID) === normalizeStudioRestoreKey(seeded.versionID)
    && Boolean(state.selectedProjectPresent)
    && Boolean(state.loadProjectReady)
    && normalizeStudioRestoreKey(state.loadProjectStage) === "editor_ready"
    && Number(state.loadProjectToken || 0) === Number(stagedRequest.token)
    && !normalizeStudioRestoreKey(state.loadProjectError)
    && normalizeStudioRestoreKey(state.restoredFocusedDiffKey) === normalizeStudioRestoreKey(seeded.expectedFocusedDiffKey)
    && reopenedLineageKeys.includes(normalizeStudioRestoreKey(seeded.expectedReopenedLineageKey))
    && normalizeStudioRestoreKey(state.restoredLatestReopenedWriteID) === normalizeStudioRestoreKey(seeded.expectedReopenedWriteID)
    && Number(state.reopenedDiffCount || 0) > 0
    && Number(state.askNoteHistoryCount ?? state.ask_note_history_count ?? 0) >= 3
    && Number(state.backendAskNoteHistoryCount ?? state.backend_ask_note_history_count ?? 0) >= 3
    && normalizeStudioRestoreText(state.latestAskNoteInsertedText ?? state.latest_ask_note_inserted_text ?? "").includes(
      normalizeStudioRestoreText(seeded.expectedDraft)
    )
    && draftText.includes(normalizeStudioRestoreText(seeded.expectedDraft))
    && expectedCollaborationState(state, seeded);
}

async function waitForMacRestoreState(seeded, stagedRequest) {
  const deadline = Date.now() + 60000;
  let state = null;
  while (Date.now() < deadline) {
    state = readDebugDiffState();
    if (expectedMacRestoreState(state, seeded, stagedRequest)) return state;
    await sleep(300);
  }
  state = readDebugDiffState();
  throw new Error(`macOS did not restore the shared Studio project.\n${JSON.stringify({ seeded, stagedRequest, state }, null, 2)}`);
}

async function assertBackendSeeded(seeded) {
  const probe = await fetchStudioProjectMetadata(seeded.projectID, seeded.headers, seeded.baseURL);
  assert(probe.response.ok, `Backend project probe failed: ${probe.response.status} ${JSON.stringify(probe.payload)}`);
  assert(probe.metadata, "Backend project probe returned no metadata.");
  assert(
    probe.metadata.activeVersionId === normalizeStudioRestoreKey(seeded.versionID),
    `Expected active version ${seeded.versionID}, got ${probe.metadata.activeVersionId}`
  );
  assert(
    normalizeStudioRestoreText(probe.metadata.activeVersion?.draft) === normalizeStudioRestoreText(seeded.expectedDraft),
    "Backend active draft did not match the shared restore draft."
  );
  assert(
    probe.metadata.focusedDiffKey === normalizeStudioRestoreKey(seeded.expectedFocusedDiffKey),
    `Expected backend focused diff ${seeded.expectedFocusedDiffKey}, got ${probe.metadata.focusedDiffKey}`
  );
  assert(
    probe.metadata.latestReopenedWriteID === normalizeStudioRestoreKey(seeded.expectedReopenedWriteID),
    `Expected backend reopened write ${seeded.expectedReopenedWriteID}, got ${probe.metadata.latestReopenedWriteID}`
  );
  assert(
    probe.metadata.reopenedLineageKeys.includes(normalizeStudioRestoreKey(seeded.expectedReopenedLineageKey)),
    `Expected backend reopened lineage ${seeded.expectedReopenedLineageKey}, got ${probe.metadata.reopenedLineageKeys.join(",")}`
  );
  assert(
    Number(probe.metadata.askNoteHistoryCount || 0) >= 3,
    `Expected backend ask-note history to be seeded, got ${probe.metadata.askNoteHistoryCount || 0}`
  );
  assert(
    probe.metadata.askNoteHistory.some((entry) => normalizeStudioRestoreText(entry.insertedText) === normalizeStudioRestoreText(seeded.expectedDraft)),
    "Expected backend ask-note history to include the shared restore draft."
  );
  return probe;
}

async function restoreSharedProjectOnMac(seeded) {
  const appPath = findDebugAppPath();
  await ensureAppStopped();
  writeMacRestoreDefaults(seeded);
  const stagedRequest = stageStudioProjectLoadDebugRequest({
    debugDefaults: studioDebug.defaults,
    projectId: seeded.projectID,
    versionId: seeded.versionID,
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
    projectId: seeded.projectID,
    versionId: seeded.versionID,
    readDebugDiffState,
    timeoutMs: 45000,
    stagedRequest,
  });
  const restoredState = await waitForMacRestoreState(seeded, stagedRequest);
  return {
    appPath,
    stagedRequest,
    restoredState,
  };
}

function restoreSharedProjectOniPhone(seeded) {
  const backendOnlySeeded = {
    ...seeded,
    localState: {
      ...seeded.localState,
      askHistoryJSON: "{}",
    },
  };
  const fixtureJSON = createStudioRestoreUITestFixtureJSON(backendOnlySeeded, {
    loadToken: Date.now() % 1_000_000_000,
  });
  writeFileSync(CROSS_PLATFORM_FIXTURE_PATH, fixtureJSON, "utf8");
  const child = spawnSync("bash", ["scripts/run_v1_ui_smoke.sh"], {
    cwd: ROOT_DIR,
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
    env: {
      ...process.env,
      ONLY_TESTING: "themUITests/V1SmokeUITests/test_cross_platform_backend_project_restore_loads_preseeded_screenplay_session",
      THEM_UITEST_RESTORE_FIXTURE_JSON: fixtureJSON,
      THEM_UITEST_RESTORE_FIXTURE_PATH: CROSS_PLATFORM_FIXTURE_PATH,
    },
  });
  const combinedOutput = `${child.stdout || ""}\n${child.stderr || ""}`;
  if (child.status !== 0) {
    throw new Error(
      "iPhone did not restore the shared Studio project.\n"
      + `status=${child.status}\n`
      + `stdout:\n${child.stdout || ""}\n`
      + `stderr:\n${child.stderr || ""}`
    );
  }
  if (/Executed 0 tests/.test(combinedOutput) || /Test skipped/.test(combinedOutput)) {
    throw new Error(
      "iPhone cross-platform restore UI test did not execute the restore assertion.\n"
      + `stdout:\n${child.stdout || ""}\n`
      + `stderr:\n${child.stderr || ""}`
    );
  }
  process.stdout.write(child.stdout || "");
  process.stderr.write(child.stderr || "");
  return { output: combinedOutput };
}

const restoreKeys = [
  "studio.full.thread.state.v1",
  "studio.diff.keep-current.v1",
  "studio.diff.keep-current.writeids.v1",
  "studio.ask.note.history.v2",
  "studio_debug_diff_state_json",
  "studio_debug_project_load_trace_json",
  "app_token",
  "backend_base_url",
  "client_token",
  "user_id",
  "client_token_base_url",
  "client_token_expiry",
  "auth_debug_access_token",
  "auth_debug_access_token_enabled",
  "studio_debug_load_project_id",
  "studio_debug_load_project_version_id",
];
const restoreIntKeys = [
  "client_token_cached_at",
  "studio_debug_load_project_token",
  "studio_debug_load_project_ack_token",
];
const originalStringValues = Object.fromEntries(restoreKeys.map((key) => [key, readDefaultString(key)]));
const originalIntValues = Object.fromEntries(restoreIntKeys.map((key) => [key, readDefaultInt(key)]));

let server = null;
try {
  server = await startBackend({
    port: CROSS_PLATFORM_PORT,
    env: {
      APP_TOKEN,
      REQUIRE_USER_AUTH: "1",
    },
  });

  const seeded = await seedBackendStudioRestoreFixture({
    baseURL: server.baseUrl,
    appToken: APP_TOKEN,
  });
  const backendProbe = await assertBackendSeeded(seeded);
  const mac = await restoreSharedProjectOnMac(seeded);
  const iphone = restoreSharedProjectOniPhone(seeded);
  console.log(JSON.stringify({
    ok: true,
    projectID: seeded.projectID,
    versionID: seeded.versionID,
    backend: backendProbe.metadata,
    mac: {
      appPath: mac.appPath,
      stagedRequest: mac.stagedRequest,
      restoredProjectID: mac.restoredState?.selectedProjectID || "",
      restoredVersionID: mac.restoredState?.latestVersionID || "",
    },
    iphone: {
      outputBytes: iphone.output.length,
    },
  }, null, 2));
  console.log("studio-cross-platform-restore-contract-smoke: ok");
} finally {
  for (const [key, value] of Object.entries(originalStringValues)) {
    writeDefaultString(key, value);
  }
  for (const [key, value] of Object.entries(originalIntValues)) {
    writeDefaultInt(key, value);
  }
  synchronizeDefaults();
  if (server) {
    await server.stop();
  }
}
