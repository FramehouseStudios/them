import { existsSync, mkdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createStudioEvalDebugContext, ensureStudioVisibleWithOpenHandshake } from "./studio_eval_debug_utils.mjs";

const BACKEND_DIR = "/Users/halfmutantfilms/Desktop/io.them/them/backend";
const SCREENSHOT_PATH = "/tmp/them-smoke/them-draft-visual.png";
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
const debugDefaults = debugContext.defaults;

function osascript(lines) {
  const args = [];
  for (const line of lines) {
    args.push("-e", line);
  }
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

function readDebugDiffState() {
  const raw = readDefaultString("studio_debug_diff_state_json");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function normalizeText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function activateApp() {
  osascript(['tell application "them" to activate']);
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
  const token = nextToken("studio_debug_seed_structural_token", "studio_debug_seed_structural_ack_token");
  writeDefaultInt("studio_debug_seed_structural_token", token);
  await waitFor(
    () => readDefaultInt("studio_debug_seed_structural_ack_token") === token,
    `structural seed ack ${token}`,
    15000,
    150
  );
}

async function appendIntegrityProse() {
    const proseLines = Array.from({ length: 30 }, () => [
    "It sounds like you're overwhelmed right now.",
    "Take a deep breath.",
    "What does that feel like in your body?"
  ]).flat();
  const proseBlock = ["NOTE TO SELF", "", ...proseLines].join("\n");
  const token = nextToken("studio_debug_manual_edit_token", "studio_debug_manual_edit_ack_token");
  writeDefaultString("studio_debug_manual_edit_text", proseBlock);
  writeDefaultInt("studio_debug_manual_edit_token", token);
  await waitFor(
    () => readDefaultInt("studio_debug_manual_edit_ack_token") === token,
    `manual draft edit ack ${token}`,
    15000,
    150
  );
}

async function openDraftInspector(section = "pages") {
  const token = nextToken("studio_debug_draft_inspector_token", "studio_debug_draft_inspector_ack_token");
  writeDefaultString("studio_debug_draft_inspector_section", section);
  writeDefaultInt("studio_debug_draft_inspector_token", token);
  await waitFor(
    () => readDefaultInt("studio_debug_draft_inspector_ack_token") === token,
    `draft inspector ack ${token}`,
    20000,
    150
  );
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
    `Studio draft visual smoke received invalid THEM window info: ${raw}`
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

function analyzeDraftInspectorVisualState(path) {
  const swiftSource = String.raw`
import AppKit
import Foundation

let path = ProcessInfo.processInfo.environment["STUDIO_DRAFT_VISUAL_SCREENSHOT_PATH"] ?? ""
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
let cropX = max(0, Int(Double(width) * 0.86))
let cropY = max(0, Int(Double(height) * 0.08))
let cropWidth = max(1, min(width - cropX, Int(Double(width) * 0.12)))
let cropHeight = max(1, min(height - cropY, Int(Double(height) * 0.84)))
let step = max(1, min(cropWidth, cropHeight) / 180)

var samples = 0
var lumaTotal = 0.0
var brightCount = 0
var darkCount = 0
var warmAccentCount = 0

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
        if r > b + 0.08 && g > b + 0.03 && r > 0.34 { warmAccentCount += 1 }
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
    "warmAccentRatio": Double(warmAccentCount) / Double(samples),
]
let data = try JSONSerialization.data(withJSONObject: payload, options: [])
print(String(data: data, encoding: .utf8) ?? "{}")
`;
  const raw = run("swift", ["-e", swiftSource], {
    env: {
      ...process.env,
      STUDIO_DRAFT_VISUAL_SCREENSHOT_PATH: path,
    },
  });
  return JSON.parse(raw);
}

await ensureStudioVisible();
await seedStructuralDraft();
await appendIntegrityProse();
await openDraftInspector("pages");

const state = await waitForDiffState(
  (candidate) => String(candidate.selectedProjectID || "").trim() === PROJECT_ID
    && candidate.draftInspectorPresented === true
    && String(candidate.draftInspectorSection || "").trim().toLowerCase() === "pages"
    && Number(candidate.draftPaginationPageCount || 0) >= 2
    && Number(candidate.draftIntegrityIssueCount || 0) >= 1
    && normalizeText(candidate.draftIntegrityPrimaryPreview || "").includes("overwhelmed right now"),
  "draft inspector pages with integrity warnings",
  25000
);

activateApp();
await sleep(900);
const windowInfo = readFrontWindowInfo();
captureScreenshot(SCREENSHOT_PATH, windowInfo);
const visualStats = analyzeDraftInspectorVisualState(SCREENSHOT_PATH);

assert(
  Number(visualStats.averageLuma || 0) >= 0.16 && Number(visualStats.averageLuma || 0) <= 0.82,
  `Studio draft visual smoke crop did not look like the right inspector: averageLuma=${visualStats.averageLuma}`
);
assert(
  Number(visualStats.brightRatio || 0) >= 0.08,
  `Studio draft visual smoke crop did not contain enough thumbnail/light-control pixels: brightRatio=${visualStats.brightRatio}`
);
assert(
  Number(visualStats.darkRatio || 0) >= 0.08,
  `Studio draft visual smoke crop did not contain enough inspector dark-surface pixels: darkRatio=${visualStats.darkRatio}`
);

const result = {
  ok: true,
  screenshotPath: SCREENSHOT_PATH,
  selectedProjectID: state.selectedProjectID || "",
  draftInspectorPresented: state.draftInspectorPresented === true,
  draftInspectorSection: state.draftInspectorSection || "",
  draftPaginationPageCount: Number(state.draftPaginationPageCount || 0),
  draftIntegrityIssueCount: Number(state.draftIntegrityIssueCount || 0),
  draftIntegrityPrimaryPreview: String(state.draftIntegrityPrimaryPreview || "").slice(0, 160),
  visualStats,
  windowBounds: windowInfo,
};

console.log(JSON.stringify(result, null, 2));
console.log(`__STUDIO_DRAFT_VISUAL_RESULT__ ${JSON.stringify(result)}`);
console.log("studio-draft-visual-smoke: ok");
