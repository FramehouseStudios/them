import { existsSync, mkdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createStudioEvalDebugContext, ensureStudioVisibleWithOpenHandshake } from "./studio_eval_debug_utils.mjs";

const SCREENSHOT_DIR = "/tmp/them-smoke/inspector-quick-capture";
const SCREENSHOT_PATH = `${SCREENSHOT_DIR}/them-inspector-quick-capture.png`;
const studioDebugDefaultsDomains = Array.from(
  new Set([
    String(process.env.THEM_DEBUG_DEFAULTS_DOMAIN || "").trim(),
    `${process.env.HOME || ""}/Library/Preferences/io.them.them`,
    "io.them.them",
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
const studioApp = debugContext.ownedApp;
const debugDefaults = debugContext.defaults;

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

function resetStudioOpenHandshakeDefaults() {
  writeDefaultInt("studio_debug_open_token", 0);
  writeDefaultInt("studio_debug_open_ack_token", 0);
}

function resetStudioInspectorQuickCaptureDefaults() {
  const intKeys = [
    "studio_debug_seed_structural_token",
    "studio_debug_seed_structural_ack_token",
    "studio_debug_shell_visibility_token",
    "studio_debug_shell_visibility_ack_token",
    "studio_debug_right_panel_tab_token",
    "studio_debug_right_panel_tab_ack_token",
    "studio_debug_select_lines_token",
    "studio_debug_select_lines_ack_token",
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
    "studio_debug_inspector_interaction_result_status",
    "studio_debug_inspector_interaction_result_error",
    "studio_debug_inspector_interaction_result_json",
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
  return studioApp.hasWindow();
}

function appIsRunning() {
  return studioApp.isRunning();
}

function activateApp(appPath = "", appSession = null) {
  studioApp.activate(appPath, appSession);
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
  activateApp(appPath);
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
      return await waitForDiffState(
        (state) =>
          state?.rightPanelTab === "beats" &&
          Array.isArray(state?.beatOrderIDs) &&
          state.beatOrderIDs.length === 3 &&
          state.beatOrderIDs.includes("beat-diner") &&
          state.beatOrderIDs.includes("beat-kitchen") &&
          state.beatOrderIDs.includes("beat-kitchen-dup") &&
          Number(state?.selectionStartLine || 0) === 0 &&
          Number(state?.selectionEndLine || 0) === 0,
        "seeded beats inspector baseline",
        20000
      );
    } catch (error) {
      lastError = error;
      await sleep(900);
      await ensureStudioVisible();
    }
  }
  throw lastError || new Error("Could not prepare seeded beats inspector baseline");
}

async function selectLines(startLine, endLine, waitForDiffSelection = true) {
  const token = nextToken("studio_debug_select_lines_token", "studio_debug_select_lines_ack_token");
  writeDefaultInt("studio_debug_select_lines_start", startLine);
  writeDefaultInt("studio_debug_select_lines_end", endLine);
  writeDefaultInt("studio_debug_select_lines_token", token);
  await waitFor(() => readDefaultInt("studio_debug_select_lines_ack_token") === token, `line selection ack ${token}`, 15000, 150);
  if (!waitForDiffSelection) {
    return readDebugDiffState();
  }
  return await waitForDiffState(
    (state) => Number(state?.selectionStartLine || 0) === startLine && Number(state?.selectionEndLine || 0) === endLine,
    `line selection ${startLine}-${endLine}`,
    15000
  );
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
  studioApp.assertOwned();
  const swiftSource = String.raw`
import AppKit
import CoreGraphics
import Foundation

let options: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
let windows = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] ?? []
let expectedOwnerPID = ${studioApp.pid}

let candidates = windows.compactMap { window -> [String: Any]? in
    let ownerPID = window[kCGWindowOwnerPID as String] as? Int ?? 0
    guard ownerPID == expectedOwnerPID else { return nil }
    let layer = window[kCGWindowLayer as String] as? Int ?? 0
    guard layer == 0 else { return nil }
    guard let bounds = window[kCGWindowBounds as String] as? [String: Any] else { return nil }
    let x = Int((bounds["X"] as? Double ?? 0).rounded())
    let y = Int((bounds["Y"] as? Double ?? 0).rounded())
    let width = Int((bounds["Width"] as? Double ?? 0).rounded())
    let height = Int((bounds["Height"] as? Double ?? 0).rounded())
    guard width > 0, height > 0 else { return nil }
    let area = width * height
    let windowID = Int(window[kCGWindowNumber as String] as? Int ?? 0)
    guard windowID > 0 else { return nil }
    return [
        "windowID": windowID,
        "x": x,
        "y": y,
        "width": width,
        "height": height,
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
  return {
    windowID: Math.round(Number(parsed.windowID || 0)),
  };
}

function captureWindow(targetPath) {
  const window = readFrontWindowInfo();
  assert(window.windowID > 0, "Missing THEM front window for capture");
  studioApp.assertOwned();
  run("screencapture", ["-x", "-l", String(window.windowID), targetPath]);
  studioApp.assertOwned();
  assert(existsSync(targetPath), `Expected screenshot at ${targetPath}`);
  const stats = statSync(targetPath);
  assert(stats.size > 0, `Expected screenshot ${targetPath} to be non-empty`);
  return stats.size;
}

async function main() {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });

  await ensureStudioVisible();
  await prepareSeededBeatsInspector();

  await selectLines(8, 8);
  const selectionBeat = await runInspectorInteraction("make_beat_from_selection");
  assert(selectionBeat.beat_count === 4, `Expected selection quick capture to create beat 4, got ${selectionBeat.beat_count}`);
  assert(selectionBeat.selected_beat_label === "Frank stares at the sink.", `Unexpected selection beat label: ${selectionBeat.selected_beat_label || "<missing>"}`);
  assert(selectionBeat.selected_beat_summary === "Frank stares at the sink.", `Unexpected selection beat summary: ${selectionBeat.selected_beat_summary || "<missing>"}`);
  assert(selectionBeat.selected_beat_scene_id === "scene-kitchen", `Expected selection beat to link to scene-kitchen, got ${selectionBeat.selected_beat_scene_id || "<missing>"}`);
  assert(selectionBeat.selected_beat_act_id === "act-1", `Expected selection beat to link to act-1, got ${selectionBeat.selected_beat_act_id || "<missing>"}`);
  assert(selectionBeat.selected_beat_provenance === "selection", `Expected selection beat provenance to be selection, got ${selectionBeat.selected_beat_provenance || "<missing>"}`);

  await prepareSeededBeatsInspector();
  const sceneBeat = await runInspectorInteraction("make_beat_from_current_scene");
  assert(sceneBeat.beat_count === 4, `Expected scene quick capture to create beat 4, got ${sceneBeat.beat_count}`);
  assert(sceneBeat.selected_beat_label === "Lucy commits to the plan.", `Unexpected scene beat label: ${sceneBeat.selected_beat_label || "<missing>"}`);
  assert(sceneBeat.selected_beat_summary === "Lucy commits to the plan.", `Unexpected scene beat summary: ${sceneBeat.selected_beat_summary || "<missing>"}`);
  assert(sceneBeat.selected_beat_scene_id === "scene-diner", `Expected scene quick capture to link to scene-diner, got ${sceneBeat.selected_beat_scene_id || "<missing>"}`);
  assert(sceneBeat.selected_beat_act_id === "act-1", `Expected scene quick capture to link to act-1, got ${sceneBeat.selected_beat_act_id || "<missing>"}`);
  assert(sceneBeat.selected_beat_provenance === "current_scene", `Expected scene beat provenance to be current_scene, got ${sceneBeat.selected_beat_provenance || "<missing>"}`);

  await prepareSeededBeatsInspector();
  const selectedBeat = await runInspectorInteraction("select_beat", "beat-kitchen");
  assert(selectedBeat.selected_beat_id === "beat-kitchen", `Expected beat-kitchen to be selected before update, got ${selectedBeat.selected_beat_id || "<missing>"}`);
  await selectLines(7, 8, false);
  const updatedBeat = await runInspectorInteraction("update_selected_beat_from_selection", "beat-kitchen");
  assert(updatedBeat.selected_beat_id === "beat-kitchen", `Expected beat-kitchen to stay selected, got ${updatedBeat.selected_beat_id || "<missing>"}`);
  assert(updatedBeat.selected_beat_label === "Frank stalls", `Expected beat label to stay Frank stalls, got ${updatedBeat.selected_beat_label || "<missing>"}`);
  assert(updatedBeat.selected_beat_summary.includes("I have to move now."), `Updated beat summary missing dialogue line: ${updatedBeat.selected_beat_summary || "<missing>"}`);
  assert(updatedBeat.selected_beat_summary.includes("Frank stares at the sink."), `Updated beat summary missing action line: ${updatedBeat.selected_beat_summary || "<missing>"}`);
  assert(updatedBeat.selected_beat_scene_id === "scene-kitchen", `Expected updated beat to stay on scene-kitchen, got ${updatedBeat.selected_beat_scene_id || "<missing>"}`);
  assert(updatedBeat.selected_beat_act_id === "act-1", `Expected updated beat to stay on act-1, got ${updatedBeat.selected_beat_act_id || "<missing>"}`);
  assert(updatedBeat.selected_beat_provenance === "manual", `Expected updated seeded beat provenance to stay manual, got ${updatedBeat.selected_beat_provenance || "<missing>"}`);

  const state = await waitForDiffState(
    (next) => next?.rightPanelTab === "beats" && next?.selectedBeatID === "beat-kitchen",
    "beats tab selected after quick capture smoke",
    15000
  );

  const bytes = captureWindow(SCREENSHOT_PATH);
  console.log(JSON.stringify({
    selectionBeat,
    sceneBeat,
    updatedBeat,
    selectedBeatID: state?.selectedBeatID || "",
    selectedBeatLabel: state?.selectedBeatLabel || "",
    selectedBeatSummary: state?.selectedBeatSummary || "",
    selectedBeatSceneID: state?.selectedBeatSceneID || "",
    selectedBeatActID: state?.selectedBeatActID || "",
    screenshotPath: SCREENSHOT_PATH,
    screenshotBytes: bytes,
  }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
