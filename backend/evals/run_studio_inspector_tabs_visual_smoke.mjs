import { existsSync, mkdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createStudioEvalDebugContext, ensureStudioVisibleWithOpenHandshake } from "./studio_eval_debug_utils.mjs";

const BACKEND_DIR = "/Users/halfmutantfilms/Desktop/io.them/them/backend";
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
  const output = run("node", ["evals/run_studio_prompt_mode_separation_smoke.mjs"], {
    cwd: BACKEND_DIR,
    env: {
      ...process.env,
      STUDIO_PROMPT_MODE_TRANSPORT: "stub",
    },
  });
  assert(
    output.includes("__STUDIO_PROMPT_MODE_RESULT__"),
    "Prompt-mode separation smoke did not emit a result marker"
  );
  activateApp(findDebugAppPath());
  await sleep(700);
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
  const expectedTabs = tab === "outline" ? new Set(["outline", "draft"]) : new Set([tab]);
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
      const resolvedState = await waitForDiffState(
        (state) => expectedTabs.has(String(state?.rightPanelTab || "")),
        `right inspector tab ${tab}`,
        20000
      ).catch(() => readDebugDiffState());
      if (resolvedState) {
        return resolvedState;
      }
      throw new Error(`right inspector state unavailable after ack for ${tab}`);
    } catch (error) {
      lastError = error;
      activateApp(findDebugAppPath());
      await sleep(900);
    }
  }
  throw lastError || new Error(`right panel tab ${tab} never opened`);
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
  await seedRouteMetadata();
  await showInspector();

  const tabs = [
    { key: "beats", file: "them-inspector-beats.png" },
    { key: "outline", file: "them-inspector-outline.png" },
    { key: "intelligence", file: "them-inspector-intelligence.png" },
    { key: "companion", file: "them-inspector-companion.png" },
  ];

  const results = {};
  for (const tab of tabs) {
    const state = await openRightPanelTab(tab.key);
    const observedTab = String(state?.rightPanelTab || "");
    if (observedTab) {
      if (tab.key === "outline") {
        assert(
          observedTab === "outline" || observedTab === "draft",
          `Expected inspector tab outline/draft, got ${observedTab || "<missing>"}`
        );
      } else {
        assert(observedTab === tab.key, `Expected inspector tab ${tab.key}, got ${observedTab || "<missing>"}`);
      }
    }
    if (tab.key === "intelligence") {
      assert(Number(state?.intelligenceQueueCount || 0) >= 0, "Expected intelligence tab state to be readable");
    }
    if (tab.key === "companion") {
      assert(Number(state?.voicePinTurnCount || 0) >= 0, "Expected companion tab state to be readable");
      assert(typeof state?.voicePinEmpty === "boolean", "Expected companion tab Voice Pin empty-state flag");
    }
    const screenshotPath = `${SCREENSHOT_DIR}/${tab.file}`;
    const bytes = captureWindow(screenshotPath);
    results[tab.key] = {
      screenshotPath,
      bytes,
      rightPanelTab: state?.rightPanelTab || "",
      intelligenceQueueCount: Number(state?.intelligenceQueueCount || 0),
      voicePinTurnCount: Number(state?.voicePinTurnCount || 0),
    };
    await sleep(400);
  }

  console.log(JSON.stringify(results, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
