import { existsSync, mkdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createStudioEvalDebugContext, ensureStudioVisibleWithOpenHandshake } from "./studio_eval_debug_utils.mjs";

const SCREENSHOT_DIR = "/tmp/them-smoke/inspector-drag";
const SCREENSHOT_PATH = `${SCREENSHOT_DIR}/them-inspector-drag.png`;
const studioAppSessionHelperPath = fileURLToPath(new URL("./studio_app_session_helper.sh", import.meta.url));
const studioDebugDefaultsDomains = Array.from(
  new Set([
    String(process.env.THEM_DEBUG_DEFAULTS_DOMAIN || "").trim(),
    `${process.env.HOME || ""}/Library/Preferences/io.them.them`,
  ].filter(Boolean))
);

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

const debugContext = createStudioEvalDebugContext({ run, runOptional });
const debugDefaults = debugContext.defaults;

function osascript(lines) {
  const args = [];
  for (const line of lines) args.push("-e", line);
  return run("osascript", args);
}

function readDefaultString(key) {
  for (const domain of studioDebugDefaultsDomains) {
    const result = runOptional("defaults", ["read", domain, key]);
    if (result.status === 0) {
      return result.stdout.trim();
    }
  }
  return "";
}

function readDefaultInt(key) {
  const value = Number(readDefaultString(key));
  return Number.isFinite(value) ? value : 0;
}

function writeDefaultInt(key, value) {
  let wrote = false;
  for (const domain of studioDebugDefaultsDomains) {
    const result = runOptional("defaults", ["write", domain, key, "-int", String(value)]);
    wrote = wrote || result.status === 0;
  }
  if (!wrote) {
    throw new Error(`Unable to write int default for key ${key}`);
  }
}

function writeDefaultString(key, value) {
  let wrote = false;
  for (const domain of studioDebugDefaultsDomains) {
    const result = runOptional("defaults", ["write", domain, key, "-string", String(value)]);
    wrote = wrote || result.status === 0;
  }
  if (!wrote) {
    throw new Error(`Unable to write string default for key ${key}`);
  }
}

function readJsonDefault(key) {
  const raw = readDefaultString(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function readDebugDiffState() {
  return readJsonDefault("studio_debug_diff_state_json");
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

async function waitForDiffState(predicate, description, timeoutMs = 20000) {
  let latest = null;
  await waitFor(() => {
    const state = readDebugDiffState();
    if (!state) return false;
    latest = state;
    return predicate(state);
  }, description, timeoutMs, 200);
  return latest;
}

function nextToken(...keys) {
  return debugContext.nextToken(...keys);
}

function parseBoolFlag(raw) {
  const normalized = String(raw || "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function parsePidList(raw) {
  return String(raw || "")
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value > 0);
}

function parseStudioAppSessionHelperOutput(stdout = "") {
  const telemetry = {
    helperStatus: "error",
    helperError: "",
    stalePidSet: [],
    relaunchedPidSet: [],
    freshPid: 0,
    lastTeardownStage: "unknown",
    sessionMode: "",
  };
  for (const line of String(stdout || "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    switch (key) {
      case "OK":
        telemetry.helperStatus = parseBoolFlag(value) ? "ok" : "error";
        break;
      case "STALE_PIDS":
        telemetry.stalePidSet = parsePidList(value);
        break;
      case "RELAUNCHED_PIDS":
        telemetry.relaunchedPidSet = parsePidList(value);
        break;
      case "FRESH_PID": {
        const parsed = Number(value);
        telemetry.freshPid = Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
        break;
      }
      case "LAST_TEARDOWN_STAGE":
        telemetry.lastTeardownStage = value || telemetry.lastTeardownStage;
        break;
      case "SESSION_MODE":
        telemetry.sessionMode = value;
        break;
      case "ERROR_MESSAGE":
        telemetry.helperError = value;
        break;
      default:
        break;
    }
  }
  return telemetry;
}

function relaunchAppWithHelper(appPath) {
  const result = runOptional("/bin/bash", [studioAppSessionHelperPath, "--app-path", appPath]);
  const telemetry = parseStudioAppSessionHelperOutput(result.stdout);
  if (result.status !== 0 || telemetry.helperStatus !== "ok") {
    throw new Error(
      `Studio app relaunch helper failed: ${telemetry.helperError || result.stderr || result.stdout || "unknown helper failure"}\n`
      + JSON.stringify(telemetry, null, 2)
    );
  }
  return telemetry;
}

function resetStudioOpenHandshakeDefaults() {
  writeDefaultInt("studio_debug_open_token", 0);
  writeDefaultInt("studio_debug_open_ack_token", 0);
}

function resetStudioInspectorDragDefaults() {
  const intKeys = [
    "studio_debug_seed_structural_token",
    "studio_debug_seed_structural_ack_token",
    "studio_debug_shell_visibility_token",
    "studio_debug_shell_visibility_ack_token",
    "studio_debug_right_panel_tab_token",
    "studio_debug_right_panel_tab_ack_token",
    "studio_debug_inspector_interaction_token",
    "studio_debug_inspector_interaction_ack_token",
    "studio_debug_inspector_interaction_result_token",
  ];
  for (const key of intKeys) {
    writeDefaultInt(key, 0);
  }
  const stringKeys = [
    "studio_debug_inspector_interaction_action",
    "studio_debug_inspector_interaction_primary",
    "studio_debug_inspector_interaction_secondary",
  ];
  for (const key of stringKeys) {
    writeDefaultString(key, "");
  }
}

function findDebugAppPath() {
  const direct = String(process.env.THEM_APP_PATH || "").trim();
  if (direct && existsSync(direct)) return direct;
  const discovered = run("/bin/zsh", [
    "-lc",
    "find ~/Library/Developer/Xcode/DerivedData -path '*Build/Products/Debug/them.app/Contents/MacOS/them' -exec stat -f '%m %N' {} \\; | sort -nr | head -n 1 | cut -d' ' -f2- | sed 's#/Contents/MacOS/them$##'",
  ]);
  assert(discovered, "Could not locate Debug them.app");
  assert(existsSync(discovered), `Debug app path does not exist: ${discovered}`);
  return discovered;
}

function appHasWindow() {
  const output = osascript([
    "try",
    'tell application "System Events"',
    'tell process "them"',
    'if visible is true then return "1"',
    "return count of windows",
    "end tell",
    "end tell",
    "on error",
    'return "0"',
    "end try",
  ]);
  return Number(output) > 0;
}

function appIsRunning() {
  const result = runOptional("pgrep", ["-x", "them"]);
  return result.status === 0 && Boolean(result.stdout.trim());
}

function activateApp(appPath = "") {
  if (!appIsRunning() && appPath) {
    runOptional("open", ["-na", appPath]);
  }
  const appleScript = runOptional("osascript", ["-e", 'tell application "them" to activate']);
  if (appleScript.status === 0) return;
  const message = `${appleScript.stderr}\n${appleScript.stdout}`;
  if (/timed out|connection invalid|can’t get application|can't get application/i.test(message)) return;
  throw new Error(message.trim() || 'unable to activate "them"');
}

async function ensureStudioVisible() {
  const appPath = findDebugAppPath();
  await ensureStudioVisibleWithOpenHandshake({
    appPath,
    debugDefaults,
    runOptional,
    activateApp,
    appHasWindow,
    readDebugDiffState,
  });
}

async function seedStructuralDraft() {
  const appPath = findDebugAppPath();
  runOptional("open", ["-na", appPath]);
  await sleep(700);
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const token = nextToken("studio_debug_seed_structural_token", "studio_debug_seed_structural_ack_token");
    writeDefaultInt("studio_debug_seed_structural_token", token);
    activateApp(appPath);
    try {
      await waitFor(() => readDefaultInt("studio_debug_seed_structural_ack_token") === token, `structural seed ack ${token}`, attempt === 1 ? 15000 : 10000, 150);
      return;
    } catch (error) {
      lastError = error;
      await sleep(1200);
    }
  }
  throw lastError || new Error("structural seed ack never arrived");
}

async function showInspector() {
  const appPath = findDebugAppPath();
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const token = nextToken("studio_debug_shell_visibility_token", "studio_debug_shell_visibility_ack_token");
    writeDefaultString("studio_debug_shell_visibility_sidebar", "show");
    writeDefaultString("studio_debug_shell_visibility_inspector", "show");
    writeDefaultInt("studio_debug_shell_visibility_token", token);
    activateApp(appPath);
    try {
      await waitFor(() => readDefaultInt("studio_debug_shell_visibility_ack_token") === token, `shell visibility ack ${token}`, attempt === 1 ? 15000 : 10000, 150);
      return;
    } catch (error) {
      lastError = error;
      await sleep(900);
    }
  }
  throw lastError || new Error("shell visibility ack never arrived");
}

async function openRightPanelTab(tab) {
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const token = nextToken("studio_debug_right_panel_tab_token", "studio_debug_right_panel_tab_ack_token");
    writeDefaultString("studio_debug_right_panel_tab", tab);
    writeDefaultInt("studio_debug_right_panel_tab_token", token);
    try {
      await waitFor(() => readDefaultInt("studio_debug_right_panel_tab_ack_token") === token, `right panel tab ack ${token}`, attempt === 1 ? 20000 : 12000, 150);
      return await waitForDiffState((state) => state?.rightPanelTab === tab, `right inspector tab ${tab}`, 20000);
    } catch (error) {
      lastError = error;
      activateApp(findDebugAppPath());
      await sleep(900);
    }
  }
  throw lastError || new Error(`right panel tab ${tab} never opened`);
}

async function prepareSeededBeatsInspector() {
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await seedStructuralDraft();
      await showInspector();
      await openRightPanelTab("beats");
      const state = await waitForDiffState(
        (state) =>
          state?.rightPanelTab === "beats" &&
          Array.isArray(state?.beatOrderIDs) &&
          state.beatOrderIDs.length === 3 &&
          state.beatOrderIDs.includes("beat-diner") &&
          state.beatOrderIDs.includes("beat-kitchen") &&
          state.beatOrderIDs.includes("beat-kitchen-dup"),
        "seeded beats inspector baseline",
        20000
      );
      return {
        state,
        seededStructuralDraft: true,
      };
    } catch (error) {
      lastError = error;
      await sleep(900);
      await ensureStudioVisible();
    }
  }
  throw lastError || new Error("Could not prepare seeded beats inspector state");
}

async function runInspectorInteraction(action, primary = "", secondary = "") {
  const token = nextToken(
    "studio_debug_inspector_interaction_token",
    "studio_debug_inspector_interaction_ack_token",
    "studio_debug_inspector_interaction_result_token"
  );
  writeDefaultString("studio_debug_inspector_interaction_action", action);
  writeDefaultString("studio_debug_inspector_interaction_primary", primary);
  writeDefaultString("studio_debug_inspector_interaction_secondary", secondary);
  writeDefaultInt("studio_debug_inspector_interaction_token", token);
  await waitFor(() => readDefaultInt("studio_debug_inspector_interaction_ack_token") === token, `inspector interaction ack ${action} ${token}`, 15000, 150);
  await waitFor(() => readDefaultInt("studio_debug_inspector_interaction_result_token") === token, `inspector interaction result ${action} ${token}`, 15000, 150);
  const payload = readJsonDefault("studio_debug_inspector_interaction_result_json") || {};
  assert(payload.status === "handled", `Inspector interaction ${action} failed: ${payload.error || payload.status || "unknown"}`);
  return payload;
}

function readFrontWindowInfo() {
  const swiftSource = String.raw`
import AppKit
import CoreGraphics
import Foundation

let options: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
let windows = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] ?? []

let candidates = windows.compactMap { window -> [String: Any]? in
    let owner = String(describing: window[kCGWindowOwnerName as String] ?? "")
    guard owner.caseInsensitiveCompare("them") == .orderedSame else { return nil }
    let layer = window[kCGWindowLayer as String] as? Int ?? 0
    guard layer == 0 else { return nil }
    guard let bounds = window[kCGWindowBounds as String] as? [String: Any] else { return nil }
    let width = Int((bounds["Width"] as? Double ?? 0).rounded())
    let height = Int((bounds["Height"] as? Double ?? 0).rounded())
    guard width > 0, height > 0 else { return nil }
    let area = width * height
    let windowID = Int(window[kCGWindowNumber as String] as? Int ?? 0)
    guard windowID > 0 else { return nil }
    return [
        "windowID": windowID,
        "area": area,
    ]
}

guard let selected = candidates.max(by: { ($0["area"] as? Int ?? 0) < ($1["area"] as? Int ?? 0) }) else {
    fputs("missing THEM window\n", stderr)
    exit(1)
}

let data = try JSONSerialization.data(withJSONObject: selected, options: [])
print(String(data: data, encoding: .utf8) ?? "{}")
`;
  const raw = run("swift", ["-e", swiftSource]).trim();
  const parsed = JSON.parse(raw);
  return { windowID: Math.round(Number(parsed.windowID || 0)) };
}

function captureWindow(targetPath) {
  const window = readFrontWindowInfo();
  assert(window.windowID > 0, "Missing THEM front window for capture");
  run("screencapture", ["-x", "-l", String(window.windowID), targetPath]);
  assert(existsSync(targetPath), `Expected screenshot at ${targetPath}`);
  const stats = statSync(targetPath);
  assert(stats.size > 0, `Expected screenshot ${targetPath} to be non-empty`);
  return stats.size;
}

async function main() {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });

  await ensureStudioVisible();
  const seeded = await prepareSeededBeatsInspector();
  await runInspectorInteraction("clear_beat_drag_preview");

  const selected = await runInspectorInteraction("select_beat", "beat-kitchen");
  assert(selected.selected_beat_id === "beat-kitchen", `Expected beat-kitchen to be selected, got ${selected.selected_beat_id || "<missing>"}`);

  const previewBefore = await runInspectorInteraction("preview_selected_beat_drop_before", "beat-kitchen", "beat-diner");
  assert(previewBefore.dragged_beat_id === "beat-kitchen", `Expected preview drag source beat-kitchen, got ${previewBefore.dragged_beat_id || "<missing>"}`);
  const beforeState = await waitForDiffState(
    (state) =>
      state?.rightPanelTab === "beats" &&
      state?.beatDragInFlight === true &&
      state?.draggedBeatID === "beat-kitchen" &&
      state?.beatDropTargetID === "beat-diner" &&
      state?.beatInsertionMarkerVisible === true,
    "beat insertion marker preview",
    15000
  );

  const previewEnd = await runInspectorInteraction("preview_selected_beat_drop_to_end", "beat-kitchen");
  assert(previewEnd.beat_end_drop_targeted === true, "Expected end-of-list preview to target the drop zone");
  const endState = await waitForDiffState(
    (state) =>
      state?.rightPanelTab === "beats" &&
      state?.beatDragInFlight === true &&
      state?.draggedBeatID === "beat-kitchen" &&
      state?.beatEndDropVisible === true &&
      state?.beatEndDropTargeted === true &&
      state?.inspectorAutoScrollDirection === "down",
    "end-of-list beat drop preview",
    15000
  );

  const screenshotBytes = captureWindow(SCREENSHOT_PATH);

  const moved = await runInspectorInteraction("move_selected_beat_to_end");
  assert(Array.isArray(moved.beat_order_ids), "Expected beat order ids after move");
  assert(moved.beat_order_ids.at(-1) === "beat-kitchen", `Expected beat-kitchen at end after move, got ${JSON.stringify(moved.beat_order_ids)}`);
  assert(moved.beat_drag_in_flight === false, "Expected drag state to clear after move");

  await seedStructuralDraft();
  const postReseedState = await waitForDiffState(
    (state) =>
      Array.isArray(state?.beatOrderIDs) &&
      state.beatOrderIDs.includes("beat-diner") &&
      state.beatOrderIDs.includes("beat-kitchen") &&
      state.beatOrderIDs.includes("beat-kitchen-dup"),
    "seeded beat state after reload",
    20000
  );
  await showInspector();
  await openRightPanelTab("beats");

  await runInspectorInteraction("clear_beat_drag_preview");
  const clearedState = await waitForDiffState(
    (state) =>
      state?.rightPanelTab === "beats" &&
      state?.beatDragInFlight === false &&
      !state?.beatDropTargetID,
    "cleared beat drag preview",
    15000
  );

  console.log(JSON.stringify({
    seededStructuralDraft: seeded.seededStructuralDraft,
    previewBefore,
    previewEnd,
    moved,
    postReseedState: {
      beatOrderIDs: postReseedState?.beatOrderIDs || [],
      beatOrderLabels: postReseedState?.beatOrderLabels || [],
    },
    beforeState: {
      beatDropTargetID: beforeState?.beatDropTargetID || "",
      beatInsertionMarkerVisible: beforeState?.beatInsertionMarkerVisible === true,
    },
    endState: {
      beatEndDropVisible: endState?.beatEndDropVisible === true,
      beatEndDropTargeted: endState?.beatEndDropTargeted === true,
      inspectorAutoScrollDirection: endState?.inspectorAutoScrollDirection || "",
      inspectorAutoScrollAnchorID: endState?.inspectorAutoScrollAnchorID || "",
    },
    clearedState: {
      beatDragInFlight: clearedState?.beatDragInFlight === true,
      beatDropTargetID: clearedState?.beatDropTargetID || "",
    },
    screenshotPath: SCREENSHOT_PATH,
    screenshotBytes,
  }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
