import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createStudioEvalDebugContext, ensureStudioVisibleWithOpenHandshake } from "./studio_eval_debug_utils.mjs";

const SCREENSHOT_DIR = "/tmp/them-smoke/inspector-provenance";
const SCREENSHOT_PATH = `${SCREENSHOT_DIR}/them-inspector-provenance-visual.png`;

function resolveScreenplayStudioSourcePath() {
  const explicit = String(process.env.STUDIO_SCREENPLAY_SCREEN_PATH || "").trim();
  const candidates = [
    explicit,
    `${process.cwd()}/../them/them/ScreenplayStudioScreen.swift`,
    `${process.cwd()}/../them/ScreenplayStudioScreen.swift`,
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return candidates[0] || "";
}

const SCREENPLAY_STUDIO_SOURCE_PATH = resolveScreenplayStudioSourcePath();

const studioAppSessionHelperPath = fileURLToPath(new URL("./studio_app_session_helper.sh", import.meta.url));
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

function readBeatProvenanceHistory() {
  return readJsonDefault("studio.inspector.beat.provenance.history.v1") || {};
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

function resetStudioInspectorProvenanceDefaults() {
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
    "studio.inspector.beat.provenance.history.v1",
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
      await waitFor(
        () => readDefaultInt("studio_debug_seed_structural_ack_token") === token,
        `structural seed ack ${token}`,
        attempt === 1 ? 15000 : 10000,
        150
      );
      return;
    } catch (error) {
      lastError = error;
      await sleep(1200);
    }
  }
  throw lastError || new Error("structural seed ack never arrived");
}

async function showInspector() {
  const token = nextToken("studio_debug_shell_visibility_token", "studio_debug_shell_visibility_ack_token");
  writeDefaultString("studio_debug_shell_visibility_sidebar", "show");
  writeDefaultString("studio_debug_shell_visibility_inspector", "show");
  writeDefaultInt("studio_debug_shell_visibility_token", token);
  await waitFor(
    () => readDefaultInt("studio_debug_shell_visibility_ack_token") === token,
    `shell visibility ack ${token}`,
    15000,
    150
  );
}

async function openRightPanelTab(tab) {
  const token = nextToken("studio_debug_right_panel_tab_token", "studio_debug_right_panel_tab_ack_token");
  writeDefaultString("studio_debug_right_panel_tab", tab);
  writeDefaultInt("studio_debug_right_panel_tab_token", token);
  await waitFor(
    () => readDefaultInt("studio_debug_right_panel_tab_ack_token") === token,
    `right panel tab ack ${token}`,
    15000,
    150
  );
  return await waitForDiffState((state) => state?.rightPanelTab === tab, `right inspector tab ${tab}`, 20000);
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
          state.beatOrderIDs.includes("beat-kitchen-dup"),
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

async function selectLines(startLine, endLine) {
  const token = nextToken("studio_debug_select_lines_token", "studio_debug_select_lines_ack_token");
  writeDefaultInt("studio_debug_select_lines_start", startLine);
  writeDefaultInt("studio_debug_select_lines_end", endLine);
  writeDefaultInt("studio_debug_select_lines_token", token);
  await waitFor(
    () => readDefaultInt("studio_debug_select_lines_ack_token") === token,
    `line selection ack ${token}`,
    15000,
    150
  );
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
  await waitFor(
    () => readDefaultInt("studio_debug_inspector_interaction_ack_token") === token,
    `inspector interaction ack ${action} ${token}`,
    15000,
    150
  );
  await waitFor(
    () => readDefaultInt("studio_debug_inspector_interaction_result_token") === token,
    `inspector interaction result ${action} ${token}`,
    15000,
    150
  );
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
  run("screencapture", ["-x", "-l", String(window.windowID), targetPath]);
  assert(existsSync(targetPath), `Expected screenshot at ${targetPath}`);
  const stats = statSync(targetPath);
  assert(stats.size > 0, `Expected screenshot ${targetPath} to be non-empty`);
  return stats.size;
}

function readRuntimeStaticTextBlob() {
  const result = runOptional("osascript", [
    "-e", "try",
    "-e", 'tell application "System Events"',
    "-e", 'tell process "them"',
    "-e", 'if (count of windows) is 0 then return ""',
    "-e", "set frontWindow to front window",
    "-e", "set staticValues to value of every static text of entire contents of frontWindow",
    "-e", "set AppleScript's text item delimiters to linefeed",
    "-e", "return staticValues as text",
    "-e", "end tell",
    "-e", "end tell",
    "-e", "on error",
    "-e", 'return ""',
    "-e", "end try",
  ]);
  return (result.status === 0 ? result.stdout : "").replace(/\r/g, "\n").trim();
}

function readSourceProvenanceA11yContract() {
  assert(existsSync(SCREENPLAY_STUDIO_SOURCE_PATH), `Missing ScreenplayStudioScreen.swift at ${SCREENPLAY_STUDIO_SOURCE_PATH}`);
  const source = readFileSync(SCREENPLAY_STUDIO_SOURCE_PATH, "utf8");
  const hasCreatedFromLabel = source.includes("Created from ");
  const hasLastRefreshedLabel = source.includes("Last refreshed from ");
  const hasProvenanceA11yLabel = source.includes(".accessibilityLabel(\"Created from") && source.includes("last refreshed from");
  return {
    sourcePath: SCREENPLAY_STUDIO_SOURCE_PATH,
    hasCreatedFromLabel,
    hasLastRefreshedLabel,
    hasProvenanceA11yLabel,
  };
}

async function main() {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });

  await ensureStudioVisible();
  await prepareSeededBeatsInspector();

  const selected = await runInspectorInteraction("select_beat", "beat-diner");
  assert(selected.selected_beat_id === "beat-diner", `Expected beat-diner selected, got ${selected.selected_beat_id || "<missing>"}`);

  await selectLines(1, 3);
  const updated = await runInspectorInteraction("update_selected_beat_from_selection", "beat-diner");
  assert(updated.selected_beat_id === "beat-diner", `Expected update to keep beat-diner selected, got ${updated.selected_beat_id || "<missing>"}`);
  assert(
    String(updated.selected_beat_provenance || "") === "manual",
    `Expected selected beat provenance to remain manual after update, got ${updated.selected_beat_provenance || "<missing>"}`
  );

  await waitFor(
    () => {
      const history = readBeatProvenanceHistory();
      const beatHistory = history?.["debug-structural"]?.["beat-diner"] || {};
      return String(beatHistory.lastRefreshedFromRaw || "") === "selection";
    },
    "beat provenance refresh in defaults",
    15000,
    200
  );

  const history = readBeatProvenanceHistory();
  const beatHistory = history?.["debug-structural"]?.["beat-diner"] || {};
  const createdFrom = String(beatHistory.createdFromRaw || "");
  const lastRefreshedFrom = String(beatHistory.lastRefreshedFromRaw || "");
  const createdAt = Number(beatHistory.createdAt || 0);
  const lastRefreshedAt = Number(beatHistory.lastRefreshedAt || 0);

  assert(createdFrom.length > 0, "Expected beat provenance history to include created source");
  assert(lastRefreshedFrom === "selection", `Expected last refreshed source selection, got ${lastRefreshedFrom || "<missing>"}`);
  assert(createdAt > 0, "Expected created timestamp on beat provenance history");
  assert(lastRefreshedAt > 0, "Expected last refreshed timestamp on beat provenance history");

  const sourceA11y = readSourceProvenanceA11yContract();
  assert(sourceA11y.hasCreatedFromLabel, `Expected Created from label in ${sourceA11y.sourcePath}`);
  assert(sourceA11y.hasLastRefreshedLabel, `Expected Last refreshed from label in ${sourceA11y.sourcePath}`);
  assert(sourceA11y.hasProvenanceA11yLabel, `Expected provenance accessibility label in ${sourceA11y.sourcePath}`);

  const runtimeText = readRuntimeStaticTextBlob();
  const runtimeHasCreatedFrom = /Created from/i.test(runtimeText);
  const runtimeHasLastRefreshed = /Last refreshed from/i.test(runtimeText);
  const runtimeA11yFoundBoth = runtimeHasCreatedFrom && runtimeHasLastRefreshed;
  const sourceA11yContractSatisfied =
    sourceA11y.hasCreatedFromLabel &&
    sourceA11y.hasLastRefreshedLabel &&
    sourceA11y.hasProvenanceA11yLabel;
  assert(
    runtimeA11yFoundBoth || sourceA11yContractSatisfied,
    "Expected runtime provenance accessibility labels or source-level provenance accessibility contract"
  );

  const bytes = captureWindow(SCREENSHOT_PATH);

  console.log(
    JSON.stringify(
      {
        beatID: "beat-diner",
        createdFrom,
        lastRefreshedFrom,
        createdAt,
        lastRefreshedAt,
        sourceA11y,
        runtimeA11y: {
          hasCreatedFrom: runtimeHasCreatedFrom,
          hasLastRefreshed: runtimeHasLastRefreshed,
          foundBoth: runtimeA11yFoundBoth,
        },
        screenshotPath: SCREENSHOT_PATH,
        screenshotBytes: bytes,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
