import { existsSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertInteractionLifecycle,
  createStudioEvalDebugContext,
  ensureStudioVisibleWithOpenHandshake,
  relaunchStudioAppWithHelper,
  runCommand,
  runOptionalCommand,
  sleepMs,
  waitForCondition,
} from "./studio_eval_debug_utils.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = path.resolve(__dirname, "..");
const SCREENSHOT_PATH = "/tmp/them-smoke/them-route-metadata-visual.png";
const PROJECT_ID = "debug-structural";
const studioAppSessionHelperPath = fileURLToPath(new URL("./studio_app_session_helper.sh", import.meta.url));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function run(command, args, options = {}) {
  return runCommand(command, args, options);
}

function runOptional(command, args, options = {}) {
  return runOptionalCommand(command, args, options);
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

function readDebugDiffState() {
  return debugDefaults.readJSON("studio_debug_diff_state_json", null);
}

function captureScreenshot(pathToCapture) {
  mkdirSync("/tmp/them-smoke", { recursive: true });
  run("screencapture", ["-x", pathToCapture]);
  assert(existsSync(pathToCapture), `Screenshot was not created: ${pathToCapture}`);
  assert(statSync(pathToCapture).size > 0, `Screenshot file is empty: ${pathToCapture}`);
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
  const windowID = Number(parsed.windowID || 0);
  const x = Number(parsed.x || 0);
  const y = Number(parsed.y || 0);
  const width = Number(parsed.width || 0);
  const height = Number(parsed.height || 0);
  assert(
    Number.isFinite(windowID) && windowID > 0
      && [x, y, width, height].every((value) => Number.isFinite(value))
      && width > 0
      && height > 0,
    `Studio route metadata visual smoke received invalid THEM window info: ${raw}`
  );
  return {
    windowID: Math.round(windowID),
    x: Math.max(0, Math.round(x)),
    y: Math.max(0, Math.round(y)),
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
  };
}

function captureWindowScreenshot(pathToCapture, windowInfo) {
  mkdirSync("/tmp/them-smoke", { recursive: true });
  const args = ["-x"];
  if (windowInfo?.windowID) {
    args.push("-l", String(windowInfo.windowID));
  } else if (windowInfo) {
    args.push("-R", `${windowInfo.x},${windowInfo.y},${windowInfo.width},${windowInfo.height}`);
  }
  args.push(pathToCapture);
  run("screencapture", args);
  assert(existsSync(pathToCapture), `Screenshot was not created: ${pathToCapture}`);
  assert(statSync(pathToCapture).size > 0, `Screenshot file is empty: ${pathToCapture}`);
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

async function waitForDiffState(predicate, description, timeoutMs = 20000) {
  let latestState = null;
  await waitForCondition(() => {
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

function resetStudioOpenHandshakeDefaults() {
  writeDefaultInt("studio_debug_open_token", 0);
  writeDefaultInt("studio_debug_open_ack_token", 0);
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
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const token = nextToken("studio_debug_seed_structural_token", "studio_debug_seed_structural_ack_token");
    writeDefaultInt("studio_debug_seed_structural_token", token);
    activateApp(appPath);
    try {
      await waitForCondition(
        () => readDefaultInt("studio_debug_seed_structural_ack_token") === token,
        `structural seed ack ${token}`,
        attempt === 1 ? 15000 : 10000,
        150
      );
      assertInteractionLifecycle({
        action: "studio_debug_seed_structural",
        actionReceived: readDefaultInt("studio_debug_seed_structural_ack_token") === token,
        payload: { status: "handled", error: "" },
        stateAfter: true,
        stateLabel: "seed_ack_received",
        extra: { token },
      });
      return;
    } catch (error) {
      lastError = error;
      const state = readDebugDiffState();
      const hasUsableState = Boolean(state) && Array.isArray(state?.beatOrderIDs);
      if (hasUsableState) {
        assertInteractionLifecycle({
          action: "studio_debug_seed_structural",
          actionReceived: true,
          payload: { status: "handled", error: "" },
          stateAfter: true,
          stateLabel: "seeded_state_already_available",
          extra: {
            token,
            beat_count: Array.isArray(state?.beatOrderIDs) ? state.beatOrderIDs.length : 0,
          },
        });
        return;
      }
      await sleepMs(1200);
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
  assert(output.includes("__STUDIO_PROMPT_MODE_RESULT__"), "Prompt-mode separation smoke did not emit a result marker");
}

const { appPath, appSession } = await ensureStudioVisible();
await seedStructuralDraft();
await seedRouteMetadata();

const state = await waitForDiffState(
  (candidate) =>
    candidate.rightRailExpanded === true
    && String(candidate.latestThreadMemoryLabel || "") === "Memory"
    && String(candidate.latestThreadOutputLabel || "") === "Output"
    && String(candidate.latestThreadMemoryValue || "").length > 0
    && String(candidate.latestThreadOutputValue || "").length > 0
    && String(candidate.footerMemoryLabel || "") === "Memory"
    && String(candidate.footerOutputLabel || "") === "Output"
    && String(candidate.footerMemoryValue || "").length > 0
    && String(candidate.footerOutputValue || "").length > 0,
  "explicit Memory/Output labels in Studio metadata UI",
  20000
);

assertInteractionLifecycle({
  action: "studio_route_metadata_verify",
  actionReceived: true,
  payload: { status: "handled", error: "" },
  stateAfter: Boolean(state),
  stateLabel: "metadata_labels_explicit",
  extra: {
    latestThreadMemoryLabel: state?.latestThreadMemoryLabel || "",
    latestThreadOutputLabel: state?.latestThreadOutputLabel || "",
    footerMemoryLabel: state?.footerMemoryLabel || "",
    footerOutputLabel: state?.footerOutputLabel || "",
  },
});

await sleepMs(350);
activateApp(appPath);
await waitForCondition(() => appHasWindow(), "front THEM window before route metadata screenshot", 15000, 250);
await sleepMs(700);
const windowInfo = readFrontWindowInfo();
captureWindowScreenshot(SCREENSHOT_PATH, windowInfo);

const result = {
  ok: true,
  appSession,
  screenshotPath: SCREENSHOT_PATH,
  windowBounds: windowInfo,
  rightPanelTab: state.rightPanelTab,
  latestThreadMemoryLabel: state.latestThreadMemoryLabel,
  latestThreadMemoryValue: state.latestThreadMemoryValue,
  latestThreadOutputLabel: state.latestThreadOutputLabel,
  latestThreadOutputValue: state.latestThreadOutputValue,
  footerMemoryLabel: state.footerMemoryLabel,
  footerMemoryValue: state.footerMemoryValue,
  footerOutputLabel: state.footerOutputLabel,
  footerOutputValue: state.footerOutputValue,
};

console.log(JSON.stringify(result, null, 2));
console.log(`__STUDIO_ROUTE_METADATA_VISUAL_RESULT__ ${JSON.stringify(result)}`);
console.log("studio-route-metadata-visual-smoke: ok");
