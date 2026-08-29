import { existsSync, mkdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import nodePath from "node:path";
import { fileURLToPath } from "node:url";
import { createStudioEvalDebugContext, ensureStudioVisibleWithOpenHandshake } from "./studio_eval_debug_utils.mjs";

const BACKEND_DIR = nodePath.resolve(nodePath.dirname(fileURLToPath(import.meta.url)), "..");
const SCREENSHOT_PATH = "/tmp/them-smoke/them-shell-visual.png";
const PROJECT_ID = "debug-structural";

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
const studioApp = debugContext.ownedApp;
const debugDefaults = debugContext.defaults;

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
  const windowID = Number(parsed.windowID || 0);
  const x = Number(parsed.x || 0);
  const y = Number(parsed.y || 0);
  const width = Number(parsed.width || 0);
  const height = Number(parsed.height || 0);
  assert(
    Number.isFinite(windowID) && windowID > 0 &&
    [x, y, width, height].every((value) => Number.isFinite(value)) &&
    width > 0 &&
    height > 0,
    `Studio shell visual smoke received invalid THEM window info: ${raw}`
  );
  return {
    windowID: Math.round(windowID),
    x: Math.max(0, Math.round(x)),
    y: Math.max(0, Math.round(y)),
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
  };
}

function captureWindowScreenshot(path, windowInfo) {
  mkdirSync("/tmp/them-smoke", { recursive: true });
  studioApp.assertOwned();
  run("screencapture", ["-x", "-l", String(windowInfo.windowID), path]);
  studioApp.assertOwned();
  assert(existsSync(path), `Screenshot was not created: ${path}`);
  assert(statSync(path).size > 0, `Screenshot file is empty: ${path}`);
}

function analyzeShellVisualState(path) {
  const swiftSource = String.raw`
import AppKit
import Foundation

let path = ProcessInfo.processInfo.environment["STUDIO_SHELL_VISUAL_SCREENSHOT_PATH"] ?? ""
guard !path.isEmpty else {
    fputs("missing path\n", stderr)
    exit(1)
}
guard let image = NSImage(contentsOfFile: path) else {
    fputs("unable to load image\n", stderr)
    exit(1)
}
guard let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    fputs("unable to create cgImage\n", stderr)
    exit(1)
}
let rep = NSBitmapImageRep(cgImage: cgImage)
let width = rep.pixelsWide
let height = rep.pixelsHigh

func stats(for normalizedRect: CGRect) -> [String: Double] {
    let cropX = max(0, min(width - 1, Int((normalizedRect.origin.x * Double(width)).rounded())))
    let cropY = max(0, min(height - 1, Int((normalizedRect.origin.y * Double(height)).rounded())))
    let cropWidth = max(1, min(width - cropX, Int((normalizedRect.size.width * Double(width)).rounded())))
    let cropHeight = max(1, min(height - cropY, Int((normalizedRect.size.height * Double(height)).rounded())))
    let step = max(1, min(cropWidth, cropHeight) / 180)

    var samples = 0
    var lumaTotal = 0.0
    var brightCount = 0
    var darkCount = 0
    var warmCount = 0

    for y in stride(from: cropY, to: cropY + cropHeight, by: step) {
        for x in stride(from: cropX, to: cropX + cropWidth, by: step) {
            guard let color = rep.colorAt(x: x, y: y)?.usingColorSpace(.deviceRGB) else { continue }
            let r = Double(color.redComponent)
            let g = Double(color.greenComponent)
            let b = Double(color.blueComponent)
            let luma = (0.2126 * r) + (0.7152 * g) + (0.0722 * b)
            lumaTotal += luma
            samples += 1
            if luma > 0.78 { brightCount += 1 }
            if luma < 0.34 { darkCount += 1 }
            if r > b + 0.08 && g > b + 0.03 && r > 0.30 { warmCount += 1 }
        }
    }

    return [
        "sampleCount": Double(samples),
        "averageLuma": lumaTotal / Double(max(samples, 1)),
        "brightRatio": Double(brightCount) / Double(max(samples, 1)),
        "darkRatio": Double(darkCount) / Double(max(samples, 1)),
        "warmRatio": Double(warmCount) / Double(max(samples, 1)),
    ]
}

let payload: [String: Any] = [
    "width": width,
    "height": height,
    "left": stats(for: CGRect(x: 0.0, y: 0.08, width: 0.17, height: 0.84)),
    "center": stats(for: CGRect(x: 0.26, y: 0.10, width: 0.48, height: 0.84)),
    "right": stats(for: CGRect(x: 0.82, y: 0.08, width: 0.18, height: 0.84)),
    "bottom": stats(for: CGRect(x: 0.28, y: 0.92, width: 0.44, height: 0.07)),
]
let data = try JSONSerialization.data(withJSONObject: payload, options: [])
print(String(data: data, encoding: .utf8) ?? "{}")
`;
  const raw = run("swift", ["-e", swiftSource], {
    env: {
      ...process.env,
      STUDIO_SHELL_VISUAL_SCREENSHOT_PATH: path,
    },
  });
  return JSON.parse(raw);
}

await ensureStudioVisible();
await seedStructuralDraft();

const state = await waitForDiffState(
  (candidate) =>
    String(candidate.selectedProjectID || "").trim() === PROJECT_ID
    && candidate.leftSidebarVisible === true
    && candidate.rightRailExpanded === true
    && candidate.transientStatusVisible === false
    && candidate.collaboratorInspectorCompact === true,
  "Direction One three-column shell state",
  25000
);

activateApp(findDebugAppPath());
await waitFor(() => appHasWindow(), "front THEM window before shell screenshot", 15000, 250);
await sleep(700);
const windowInfo = readFrontWindowInfo();
captureWindowScreenshot(SCREENSHOT_PATH, windowInfo);
const visualStats = analyzeShellVisualState(SCREENSHOT_PATH);

const left = visualStats.left || {};
const center = visualStats.center || {};
const right = visualStats.right || {};

assert(
  Number(center.averageLuma || 0) >= Number(left.averageLuma || 0) + 0.12,
  `Studio shell visual smoke expected the page to be brighter than the left rail: center=${center.averageLuma} left=${left.averageLuma}`
);
assert(
  Number(center.averageLuma || 0) >= Number(right.averageLuma || 0) + 0.08,
  `Studio shell visual smoke expected the page to be brighter than the right rail: center=${center.averageLuma} right=${right.averageLuma}`
);
assert(
  Number(center.brightRatio || 0) >= 0.34,
  `Studio shell visual smoke expected more bright paper pixels in the center crop: brightRatio=${center.brightRatio}`
);
assert(
  Number(left.darkRatio || 0) >= 0.05,
  `Studio shell visual smoke expected a darker neutral source list region: darkRatio=${left.darkRatio}`
);
assert(
  Number(right.darkRatio || 0) >= 0.04,
  `Studio shell visual smoke expected a darker neutral inspector region: darkRatio=${right.darkRatio}`
);

const result = {
  ok: true,
  screenshotPath: SCREENSHOT_PATH,
  windowBounds: windowInfo,
  selectedProjectID: state.selectedProjectID || "",
  leftSidebarVisible: state.leftSidebarVisible === true,
  rightRailExpanded: state.rightRailExpanded === true,
  transientStatusVisible: state.transientStatusVisible === true,
  collaboratorInspectorCompact: state.collaboratorInspectorCompact === true,
  sidebarSection: state.sidebarSection || "",
  voicePinTurnCount: Number(state.voicePinTurnCount || 0),
  voicePinEmpty: state.voicePinEmpty === true,
  visualStats,
};

console.log(JSON.stringify(result, null, 2));
console.log(`__STUDIO_SHELL_VISUAL_RESULT__ ${JSON.stringify(result)}`);
console.log("studio-shell-visual-smoke: ok");
