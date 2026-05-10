import { existsSync, mkdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createStudioEvalDebugContext, ensureStudioVisibleWithOpenHandshake } from "./studio_eval_debug_utils.mjs";

const SCREENSHOT_DIR = "/tmp/them-smoke/inspector-tabs";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
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
  for (const line of lines) {
    args.push("-e", line);
  }
  return run("osascript", args);
}

function readDefaultString(key) {
  return debugDefaults.readString(key);
}

function readDefaultInt(key) {
  return debugDefaults.readInt(key);
}

function writeDefaultInt(key, value) {
  debugDefaults.writeInt(key, value);
}

function writeDefaultString(key, value) {
  debugDefaults.writeString(key, value);
}

function readDebugDiffState() {
  return debugDefaults.readJSON("studio_debug_diff_state_json", null);
}

function readDefaultJSON(key, fallback = null) {
  return debugDefaults.readJSON(key, fallback);
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
  let latestState = null;
  await waitFor(() => {
    const state = readDebugDiffState();
    if (!state) return false;
    latestState = state;
    return predicate(state);
  }, description, timeoutMs, 250);
  return latestState;
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

async function seedRouteMetadata() {
  const appPath = findDebugAppPath();
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const token = nextToken("studio_debug_seed_route_metadata_token", "studio_debug_seed_route_metadata_ack_token");
    writeDefaultInt("studio_debug_seed_route_metadata_token", token);
    activateApp(appPath);
    try {
      await waitFor(
        () => readDefaultInt("studio_debug_seed_route_metadata_ack_token") === token,
        `route metadata seed ack ${token}`,
        attempt === 1 ? 15000 : 10000,
        150
      );
      return await waitForDiffState(
        (state) => Number(state?.voicePinTurnCount ?? 0) > 0,
        "seeded merged them state",
        15000
      );
    } catch (error) {
      lastError = error;
      await sleep(900);
    }
  }
  throw lastError || new Error("route metadata seed ack never arrived");
}

async function runIntelligenceQueueAction(action, itemID = "") {
  const appPath = findDebugAppPath();
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const token = nextToken(
      "studio_debug_intelligence_queue_token",
      "studio_debug_intelligence_queue_ack_token",
      "studio_debug_intelligence_queue_result_token"
    );
    writeDefaultString("studio_debug_intelligence_queue_action", action);
    writeDefaultString("studio_debug_intelligence_queue_item_id", itemID);
    writeDefaultInt("studio_debug_intelligence_queue_token", token);
    activateApp(appPath);
    try {
      await waitFor(
        () => readDefaultInt("studio_debug_intelligence_queue_ack_token") === token
          && readDefaultInt("studio_debug_intelligence_queue_result_token") === token,
        `intelligence queue ack ${token}`,
        attempt === 1 ? 20000 : 12000,
        150
      );
      const payload = readDefaultJSON("studio_debug_intelligence_queue_result_json", null);
      assert(payload, `Missing intelligence queue result payload for ${action}`);
      return payload;
    } catch (error) {
      lastError = error;
      await sleep(900);
    }
  }
  throw lastError || new Error(`intelligence queue action ${action} never completed`);
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
      await waitFor(
        () => readDefaultInt("studio_debug_shell_visibility_ack_token") === token,
        `shell visibility ack ${token}`,
        attempt === 1 ? 15000 : 10000,
        150
      );
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
      await waitFor(
        () => readDefaultInt("studio_debug_right_panel_tab_ack_token") === token,
        `right panel tab ack ${token}`,
        attempt === 1 ? 20000 : 12000,
        150
      );
      return await waitForDiffState(
        (state) => state?.rightPanelTab === tab,
        `right inspector tab ${tab}`,
        20000
      );
    } catch (error) {
      lastError = error;
      activateApp(findDebugAppPath());
      await sleep(900);
    }
  }
  throw lastError || new Error(`right panel tab ${tab} never opened`);
}

async function setCompanionMode(mode) {
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const token = nextToken("studio_debug_companion_mode_token", "studio_debug_companion_mode_ack_token");
    writeDefaultString("studio_debug_companion_mode_value", mode);
    writeDefaultInt("studio_debug_companion_mode_token", token);
    try {
      await waitFor(
        () => readDefaultInt("studio_debug_companion_mode_ack_token") === token,
        `companion mode ack ${token}`,
        attempt === 1 ? 15000 : 10000,
        150
      );
      return await waitForDiffState(
        (state) => state?.rightPanelTab === "them" && state?.themCompanionMode === mode,
        `companion mode ${mode}`,
        15000
      );
    } catch (error) {
      lastError = error;
      activateApp(findDebugAppPath());
      await sleep(900);
    }
  }
  throw lastError || new Error(`companion mode ${mode} never applied`);
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
    x: Math.max(0, Math.round(Number(parsed.x || 0))),
    y: Math.max(0, Math.round(Number(parsed.y || 0))),
    width: Math.max(1, Math.round(Number(parsed.width || 0))),
    height: Math.max(1, Math.round(Number(parsed.height || 0))),
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

  const tabs = [
    { key: "beats", file: "them-inspector-beats.png" },
    { key: "outline", file: "them-inspector-outline.png" },
  ];

  const results = {};
  for (const tab of tabs) {
    const state = await openRightPanelTab(tab.key);
    assert(state?.rightPanelTab === tab.key, `Expected inspector tab ${tab.key}, got ${state?.rightPanelTab || "<missing>"}`);
    const screenshotPath = `${SCREENSHOT_DIR}/${tab.file}`;
    const bytes = captureWindow(screenshotPath);
    results[tab.key] = {
      screenshotPath,
      bytes,
      rightPanelTab: state?.rightPanelTab || "",
      intelligenceQueueCount: Number(state?.intelligenceQueueCount || 0),
      voicePinTurnCount: Number(state?.voicePinTurnCount || 0),
      themCompanionMode: String(state?.themCompanionMode || ""),
      themUnifiedSurface: state?.themUnifiedSurface === true,
    };
    await sleep(400);
  }

  const emptyThemState = await openRightPanelTab("them");
  assert(emptyThemState?.rightPanelTab === "them", `Expected inspector tab them, got ${emptyThemState?.rightPanelTab || "<missing>"}`);
  assert(emptyThemState?.themUnifiedSurface === true, "Expected empty them state to report a unified collaborator surface");
  assert(emptyThemState?.themModeControlStyle === "segmented", "Expected them mode control to report segmented styling");
  assert(emptyThemState?.themRecentThreadInlineSummaryVisible === true, "Expected empty them state to show inline recent-thread summary");
  assert(Number(emptyThemState?.voicePinTurnCount ?? 0) === 0, "Expected empty them state to have no Voice Pin turns");
  const emptyThemScreenshotPath = `${SCREENSHOT_DIR}/them-inspector-them-empty.png`;
  const emptyThemBytes = captureWindow(emptyThemScreenshotPath);
  results.themEmpty = {
    screenshotPath: emptyThemScreenshotPath,
    bytes: emptyThemBytes,
    rightPanelTab: emptyThemState?.rightPanelTab || "",
    intelligenceQueueCount: Number(emptyThemState?.intelligenceQueueCount || 0),
    voicePinTurnCount: Number(emptyThemState?.voicePinTurnCount || 0),
    themCompanionMode: String(emptyThemState?.themCompanionMode || ""),
    themUnifiedSurface: emptyThemState?.themUnifiedSurface === true,
    themModeControlStyle: String(emptyThemState?.themModeControlStyle || ""),
    themRecentThreadInlineSummaryVisible: emptyThemState?.themRecentThreadInlineSummaryVisible === true,
  };
  await sleep(400);

  const seededThemState = await seedRouteMetadata();
  assert(seededThemState?.themUnifiedSurface === true, "Expected seeded them state to report a unified collaborator surface");
  assert(seededThemState?.themModeControlStyle === "segmented", "Expected seeded them state to keep segmented mode control");
  assert(seededThemState?.themRecentThreadInlineSummaryVisible === false, "Expected seeded them state to replace inline summary with thread content");
  assert(Number(seededThemState?.voicePinTurnCount ?? 0) > 0, "Expected seeded them state to expose Voice Pin turns");
  const seededThemOpenState = await openRightPanelTab("them");
  assert(seededThemOpenState?.rightPanelTab === "them", `Expected seeded inspector tab them, got ${seededThemOpenState?.rightPanelTab || "<missing>"}`);
  const seededThemScreenshotPath = `${SCREENSHOT_DIR}/them-inspector-them-seeded.png`;
  const seededThemBytes = captureWindow(seededThemScreenshotPath);
  results.themSeeded = {
    screenshotPath: seededThemScreenshotPath,
    bytes: seededThemBytes,
    rightPanelTab: seededThemOpenState?.rightPanelTab || "",
    intelligenceQueueCount: Number(seededThemOpenState?.intelligenceQueueCount || 0),
    voicePinTurnCount: Number(seededThemOpenState?.voicePinTurnCount || 0),
    themCompanionMode: String(seededThemOpenState?.themCompanionMode || ""),
    themUnifiedSurface: seededThemOpenState?.themUnifiedSurface === true,
    themModeControlStyle: String(seededThemOpenState?.themModeControlStyle || ""),
    themRecentThreadInlineSummaryVisible: seededThemOpenState?.themRecentThreadInlineSummaryVisible === true,
  };
  await sleep(400);

  const queuePreview = await runIntelligenceQueueAction("preview_all");
  assert(queuePreview?.status === "handled", `Expected preview_all to be handled, got ${queuePreview?.status || "<missing>"}`);
  assert(Number(queuePreview?.queue_count ?? 0) > 0, `Expected preview_all to queue fixes, got ${queuePreview?.queue_count ?? 0}`);
  const queuedThemState = await openRightPanelTab("them");
  assert(queuedThemState?.rightPanelTab === "them", `Expected queued inspector tab them, got ${queuedThemState?.rightPanelTab || "<missing>"}`);
  assert(Number(queuedThemState?.voicePinTurnCount ?? 0) > 0, "Expected queued them state to retain voice-pin thread state");
  assert(Number(queuedThemState?.intelligenceQueueCount ?? 0) > 0, "Expected queued them state to expose queued fixes");
  const queuedThemScreenshotPath = `${SCREENSHOT_DIR}/them-inspector-them-queued.png`;
  const queuedThemBytes = captureWindow(queuedThemScreenshotPath);
  results.themQueued = {
    screenshotPath: queuedThemScreenshotPath,
    bytes: queuedThemBytes,
    rightPanelTab: queuedThemState?.rightPanelTab || "",
    intelligenceQueueCount: Number(queuedThemState?.intelligenceQueueCount || 0),
    voicePinTurnCount: Number(queuedThemState?.voicePinTurnCount || 0),
    themCompanionMode: String(queuedThemState?.themCompanionMode || ""),
    themUnifiedSurface: queuedThemState?.themUnifiedSurface === true,
    themModeControlStyle: String(queuedThemState?.themModeControlStyle || ""),
    themRecentThreadInlineSummaryVisible: queuedThemState?.themRecentThreadInlineSummaryVisible === true,
    queueTitles: Array.isArray(queuePreview?.queued_titles) ? queuePreview.queued_titles : [],
  };

  const modes = ["coach", "co_writer", "comfort"];
  results.themModeTransitions = [];
  for (const mode of modes) {
    const state = await setCompanionMode(mode);
    assert(state?.themCompanionMode === mode, `Expected them companion mode ${mode}, got ${state?.themCompanionMode || "<missing>"}`);
    assert(state?.themUnifiedSurface === true, `Expected unified them surface for ${mode}`);
    assert(state?.themModeControlStyle === "segmented", `Expected segmented mode control for ${mode}`);
    results.themModeTransitions.push({
      mode,
      rightPanelTab: String(state?.rightPanelTab || ""),
      themCompanionMode: String(state?.themCompanionMode || ""),
      themUnifiedSurface: state?.themUnifiedSurface === true,
      themModeControlStyle: String(state?.themModeControlStyle || ""),
      intelligenceQueueCount: Number(state?.intelligenceQueueCount || 0),
      voicePinTurnCount: Number(state?.voicePinTurnCount || 0),
    });
  }

  console.log(JSON.stringify(results, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
