import { existsSync, mkdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createStudioEvalDebugContext, ensureStudioVisibleWithOpenHandshake } from "./studio_eval_debug_utils.mjs";

const BACKEND_DIR = "/Users/halfmutantfilms/Desktop/io.them/them/backend";
const SCREENSHOT_PATH = "/tmp/them-smoke/them-page-visual.png";

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

function readDebugDiffState() {
  return debugDefaults.readJSON("studio_debug_diff_state_json", null);
}

function normalizeText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractMarkedJSON(text, marker) {
  const line = String(text || "")
    .split(/\r?\n/)
    .find((entry) => entry.startsWith(`${marker} `));
  if (!line) {
    throw new Error(`Missing ${marker} marker in smoke output`);
  }
  return JSON.parse(line.slice(marker.length + 1));
}

function activateApp() {
  osascript(['tell application "them" to activate']);
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
  }, description, timeoutMs, 300);
  return latestState;
}

async function forceStudioPage(projectId) {
  const cleanProjectId = String(projectId || "").trim();
  assert(cleanProjectId, "Studio page visual smoke is missing a project id for explicit Studio landing");
  const expectedProjectKey = `project:${cleanProjectId}`.toLowerCase();

  const appPath = findDebugAppPath();
  await ensureStudioVisibleWithOpenHandshake({
    appPath,
    debugDefaults,
    runOptional,
    activateApp: () => activateApp(),
    appHasWindow,
    readDebugDiffState,
  });
  const state = await waitForDiffState(
    (candidate) => String(candidate.selectedProjectID || "").trim() === cleanProjectId
      && String(candidate.projectKey || "").trim().toLowerCase() === expectedProjectKey,
    `Studio page for throwaway project ${cleanProjectId}`,
    20000
  );
  activateApp();
  await sleep(700);
  return state;
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
    Number.isFinite(windowID) && windowID > 0 &&
    [x, y, width, height].every((value) => Number.isFinite(value)) &&
    width > 0 &&
    height > 0,
    `Studio page visual smoke received invalid THEM window info: ${raw}`
  );
  return {
    windowID: Math.round(windowID),
    x: Math.max(0, Math.round(x)),
    y: Math.max(0, Math.round(y)),
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
  };
}

function captureScreenshot(path, windowInfo) {
  mkdirSync("/tmp/them-smoke", { recursive: true });
  const args = ["-x"];
  if (windowInfo?.windowID) {
    args.push("-l", String(windowInfo.windowID));
  } else if (windowInfo) {
    args.push("-R", `${windowInfo.x},${windowInfo.y},${windowInfo.width},${windowInfo.height}`);
  }
  args.push(path);
  run("screencapture", args);
  assert(existsSync(path), `Screenshot was not created: ${path}`);
  assert(statSync(path).size > 0, `Screenshot file is empty: ${path}`);
}

function analyzePageVisualState(path) {
  const swiftSource = String.raw`
import AppKit
import Foundation

let path = ProcessInfo.processInfo.environment["STUDIO_PAGE_VISUAL_SCREENSHOT_PATH"] ?? ""
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
let cropX = max(0, Int(Double(width) * 0.24))
let cropY = max(0, Int(Double(height) * 0.18))
let cropWidth = max(1, min(width - cropX, Int(Double(width) * 0.52)))
let cropHeight = max(1, min(height - cropY, Int(Double(height) * 0.62)))
let step = max(1, min(cropWidth, cropHeight) / 180)

var samples = 0
var lumaTotal = 0.0
var brightCount = 0
var darkCount = 0
var nearBlackCount = 0

for y in stride(from: cropY, to: cropY + cropHeight, by: step) {
    for x in stride(from: cropX, to: cropX + cropWidth, by: step) {
        guard let color = rep.colorAt(x: x, y: y)?.usingColorSpace(.deviceRGB) else { continue }
        let r = Double(color.redComponent)
        let g = Double(color.greenComponent)
        let b = Double(color.blueComponent)
        let luma = (0.2126 * r) + (0.7152 * g) + (0.0722 * b)
        lumaTotal += luma
        samples += 1
        if luma > 0.82 { brightCount += 1 }
        if luma < 0.30 { darkCount += 1 }
        if luma < 0.12 { nearBlackCount += 1 }
    }
}

guard samples > 0 else {
    fputs("no samples collected\n", stderr)
    exit(1)
}

let payload: [String: Any] = [
    "width": width,
    "height": height,
    "sampleCount": samples,
    "averageLuma": lumaTotal / Double(samples),
    "brightRatio": Double(brightCount) / Double(samples),
    "darkRatio": Double(darkCount) / Double(samples),
    "nearBlackRatio": Double(nearBlackCount) / Double(samples),
]
let data = try JSONSerialization.data(withJSONObject: payload, options: [])
print(String(data: data, encoding: .utf8) ?? "{}")
`;
  const raw = run("swift", ["-e", swiftSource], {
    env: {
      ...process.env,
      STUDIO_PAGE_VISUAL_SCREENSHOT_PATH: path,
    },
  });
  return JSON.parse(raw);
}

const firstPrompt = String(
  process.env.STUDIO_PAGE_VISUAL_PROMPT
  || "Write the next beat where she leaves before he can answer."
).trim();

async function runPageOnlyCmdReturnSmokeWithRetry(maxAttempts = 3) {
  let lastErrorText = "";
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = runOptional(
      "node",
      ["evals/run_studio_cmdreturn_smoke.mjs"],
      {
        cwd: BACKEND_DIR,
        env: {
          ...process.env,
          STUDIO_CMDRETURN_SCENARIO: "page-only",
          STUDIO_CMDRETURN_TRANSPORT: "debug-submit",
          STUDIO_CMDRETURN_FIRST_PROMPT: firstPrompt,
        },
      }
    );
    if (result.status === 0) {
      return result.stdout;
    }
    lastErrorText = `${result.stdout || ""}\n${result.stderr || ""}`.trim();
    if (/too many session requests/i.test(lastErrorText) && attempt < maxAttempts) {
      await sleep(1500 * attempt);
      continue;
    }
    throw new Error(lastErrorText || "run_studio_cmdreturn_smoke.mjs failed");
  }
  throw new Error(lastErrorText || "run_studio_cmdreturn_smoke.mjs failed after retries");
}

const smoke = await runPageOnlyCmdReturnSmokeWithRetry();

const payload = extractMarkedJSON(smoke, "__STUDIO_CMDRETURN_RESULT__");
const firstEntry = payload?.firstEntry || {};
const insertedText = normalizeText(firstEntry?.insertedText || payload?.firstInsertedPreview || "");

assert(payload?.ok === true, "Studio page visual smoke did not report ok=true");
assert(String(payload?.throwawayProjectId || "").trim(), "Studio page visual smoke is missing a throwaway project id");
assert(String(firstEntry?.target || "").trim().toLowerCase() === "page", "Studio page visual smoke did not land on the page target");
assert(insertedText.length > 0, "Studio page visual smoke did not persist inserted page text");

const state = await forceStudioPage(payload.throwawayProjectId);
const windowInfo = readFrontWindowInfo();
captureScreenshot(SCREENSHOT_PATH, windowInfo);

assert(
  String(state.selectedProjectID || "").trim() === String(payload.throwawayProjectId || "").trim(),
  "Studio page visual smoke was not showing the throwaway project at capture time"
);

const draftPreview = normalizeText(`${state.draftPreview || ""} ${state.draftTailPreview || ""}`);
const insertedExcerpt = insertedText.slice(0, Math.min(48, insertedText.length));
assert(
  insertedExcerpt.length === 0 || draftPreview.includes(insertedExcerpt),
  "Studio page visual smoke draft preview did not include the inserted page text at capture time"
);
assert(
  !String(state.focusedDiffKey || "").trim(),
  "Studio page visual smoke still had a focused diff overlay at capture time"
);

const visualStats = analyzePageVisualState(SCREENSHOT_PATH);
assert(
  Number(visualStats.averageLuma || 0) >= 0.72,
  `Studio page visual smoke crop was not paper-light enough: averageLuma=${visualStats.averageLuma}`
);
assert(
  Number(visualStats.brightRatio || 0) >= 0.45,
  `Studio page visual smoke crop did not contain enough white-paper pixels: brightRatio=${visualStats.brightRatio}`
);
assert(
  Number(visualStats.darkRatio || 0) >= 0.01,
  `Studio page visual smoke crop did not contain enough dark text pixels: darkRatio=${visualStats.darkRatio}`
);
assert(
  Number(visualStats.nearBlackRatio || 0) >= 0.002,
  `Studio page visual smoke crop did not contain enough near-black text pixels: nearBlackRatio=${visualStats.nearBlackRatio}`
);

const result = {
  ok: true,
  screenshotPath: SCREENSHOT_PATH,
  throwawayProjectId: payload.throwawayProjectId,
  firstPrompt,
  firstRequestID: payload.firstRequestID || "",
  selectedProjectID: state.selectedProjectID || "",
  focusedDiffKey: state.focusedDiffKey || "",
  insertedPreview: insertedText.slice(0, 220),
  windowBounds: windowInfo,
  visualStats,
};

console.log(JSON.stringify(result, null, 2));
console.log(`__STUDIO_PAGE_VISUAL_RESULT__ ${JSON.stringify(result)}`);
console.log("studio-page-visual-smoke: ok");
