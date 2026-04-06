import { existsSync, mkdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createStudioEvalDebugContext, ensureStudioVisibleWithOpenHandshake } from "./studio_eval_debug_utils.mjs";

const SCREENSHOT_DIR = "/tmp/them-smoke/inspector-restore";
const SCREENSHOT_PATH = `${SCREENSHOT_DIR}/them-inspector-restore-reorder.png`;

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
  const result = runOptional("defaults", ["read", "io.them.them", key]);
  return result.status === 0 ? result.stdout.trim() : "";
}

function readDefaultInt(key) {
  const value = Number(readDefaultString(key));
  return Number.isFinite(value) ? value : 0;
}

function writeDefaultInt(key, value) {
  run("defaults", ["write", "io.them.them", key, "-int", String(value)]);
}

function writeDefaultString(key, value) {
  run("defaults", ["write", "io.them.them", key, "-string", String(value)]);
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

async function selectLines(startLine, endLine) {
  const token = nextToken("studio_debug_select_lines_token", "studio_debug_select_lines_ack_token");
  writeDefaultInt("studio_debug_select_lines_start", startLine);
  writeDefaultInt("studio_debug_select_lines_end", endLine);
  writeDefaultInt("studio_debug_select_lines_token", token);
  await waitFor(() => readDefaultInt("studio_debug_select_lines_ack_token") === token, `line selection ack ${token}`, 15000, 150);
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

async function main() {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });

  await ensureStudioVisible();
  await seedStructuralDraft();
  await showInspector();
  let state = await openRightPanelTab("beats");
  assert(state?.rightPanelTab === "beats", `Expected beats tab, got ${state?.rightPanelTab || "<missing>"}`);

  const selectedBeatID = "beat-kitchen";
  await runInspectorInteraction("select_beat", selectedBeatID);
  state = await waitForDiffState(
    (next) => next?.rightPanelTab === "beats" && next?.selectedBeatID === selectedBeatID,
    "selected beat in inspector",
    15000
  );

  await runInspectorInteraction("move_selected_beat_to_top");
  state = await waitForDiffState(
    (next) => Array.isArray(next?.beatOrderIDs) && next.beatOrderIDs[0] === selectedBeatID,
    "selected beat moved to top",
    15000
  );

  const restoreLabel = "Restore inspector draft";
  const restoreSummary = "Track the unresolved subtext before the scene break.";
  await runInspectorInteraction("seed_beat_draft", restoreLabel, restoreSummary);
  state = await waitForDiffState(
    (next) => next?.beatDraftLabel === restoreLabel && next?.beatDraftSummary === restoreSummary,
    "seeded beat draft",
    15000
  );

  await runInspectorInteraction("restore_workspace");
  state = await waitForDiffState(
    (next) => next?.rightPanelTab === "beats"
      && next?.selectedBeatID === selectedBeatID
      && Array.isArray(next?.beatOrderIDs)
      && next.beatOrderIDs[0] === selectedBeatID
      && next?.beatDraftLabel === restoreLabel
      && next?.beatDraftSummary === restoreSummary,
    "restored inspector workspace",
    15000
  );

  const bytes = captureWindow(SCREENSHOT_PATH);
  console.log(JSON.stringify({
    selectedBeatID,
    rightPanelTab: state?.rightPanelTab || "",
    beatDraftLabel: state?.beatDraftLabel || "",
    beatDraftSummary: state?.beatDraftSummary || "",
    beatOrderIDs: state?.beatOrderIDs || [],
    beatOrderLabels: state?.beatOrderLabels || [],
    screenshotPath: SCREENSHOT_PATH,
    screenshotBytes: bytes,
  }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
