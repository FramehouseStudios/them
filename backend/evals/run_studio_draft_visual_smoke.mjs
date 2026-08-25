import { existsSync, mkdirSync, statSync } from "node:fs";
import {
  assertInteractionLifecycle,
  createStudioEvalDebugContext,
  ensureStudioVisibleWithOpenHandshake,
  runCommand,
  runOptionalCommand,
  sleepMs,
  waitForCondition,
} from "./studio_eval_debug_utils.mjs";

const SCREENSHOT_PATH = "/tmp/them-smoke/them-draft-visual.png";
const PROJECT_ID = "debug-structural";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function run(command, args, options = {}) {
  return runCommand(command, args, options);
}

function runOptional(command, args, options = {}) {
  return runOptionalCommand(command, args, options);
}

const debugContext = createStudioEvalDebugContext({ run, runOptional });
const studioApp = debugContext.ownedApp;
const debugDefaults = debugContext.defaults;
const {
  readDefaultInt,
  writeDefaultInt,
  writeDefaultString,
  readJsonDefault,
  nextToken,
} = debugContext;

function readDebugDiffState() {
  return readJsonDefault("studio_debug_diff_state_json", null);
}

function normalizeText(value) {
  return String(value || "")
    .replace(/\\[nrt]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function activateApp(appPath = "", appSession = null) {
  studioApp.activate(appPath, appSession);
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

async function waitForDiffState(predicate, description, timeoutMs = 20000) {
  let latestState = null;
  await waitForCondition(() => {
    const state = readDebugDiffState();
    if (!state) return false;
    latestState = state;
    return predicate(state);
  }, description, timeoutMs, 300);
  return latestState;
}

async function ensureStudioVisible() {
  const appPath = findDebugAppPath();
  return ensureStudioVisibleWithOpenHandshake({
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
  await waitForCondition(
    () => readDefaultInt("studio_debug_seed_structural_ack_token") === token,
    `structural seed ack ${token}`,
    15000,
    150
  );
  const state = readDebugDiffState() || {};
  return assertInteractionLifecycle({
    action: "studio_debug_seed_structural",
    actionReceived: readDefaultInt("studio_debug_seed_structural_ack_token") === token,
    payload: { status: "handled", error: "" },
    stateAfter: String(state.selectedProjectID || "").trim() === PROJECT_ID,
    stateLabel: "structural_seed_selected",
    extra: {
      token,
      selectedProjectID: String(state.selectedProjectID || "").trim(),
    },
  });
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
  await waitForCondition(
    () => readDefaultInt("studio_debug_manual_edit_ack_token") === token,
    `manual draft edit ack ${token}`,
    15000,
    150
  );
  const state = await waitForDiffState(
    (candidate) => Number(candidate.draftIntegrityIssueCount || 0) >= 1,
    "draft integrity issue after manual prose append",
    15000
  );
  return assertInteractionLifecycle({
    action: "studio_debug_manual_edit_integrity_prose",
    actionReceived: readDefaultInt("studio_debug_manual_edit_ack_token") === token,
    payload: { status: "handled", error: "" },
    stateAfter: Number(state.draftIntegrityIssueCount || 0) >= 1,
    stateLabel: "draft_integrity_issue_present",
    extra: {
      token,
      draftIntegrityIssueCount: Number(state.draftIntegrityIssueCount || 0),
    },
  });
}

async function openDraftInspector(section = "pages") {
  const token = nextToken("studio_debug_draft_inspector_token", "studio_debug_draft_inspector_ack_token");
  writeDefaultString("studio_debug_draft_inspector_section", section);
  writeDefaultInt("studio_debug_draft_inspector_token", token);
  await waitForCondition(
    () => readDefaultInt("studio_debug_draft_inspector_ack_token") === token,
    `draft inspector ack ${token}`,
    20000,
    150
  );
  const state = await waitForDiffState(
    (candidate) =>
      candidate.draftInspectorPresented === true
      && String(candidate.draftInspectorSection || "").trim().toLowerCase() === String(section).trim().toLowerCase(),
    `draft inspector ${section} visible`,
    20000
  );
  return {
    state,
    lifecycle: assertInteractionLifecycle({
      action: "studio_debug_draft_inspector",
      actionReceived: readDefaultInt("studio_debug_draft_inspector_ack_token") === token,
      payload: { status: "handled", error: "" },
      stateAfter: state.draftInspectorPresented === true,
      stateLabel: "draft_inspector_presented",
      extra: {
        token,
        section: String(state.draftInspectorSection || ""),
      },
    }),
  };
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
  studioApp.assertOwned();
  run("screencapture", ["-x", "-l", String(windowInfo.windowID), path]);
  studioApp.assertOwned();
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

const openResult = await ensureStudioVisible();
const seedLifecycle = await seedStructuralDraft();
const appendLifecycle = await appendIntegrityProse();
const inspectorOpen = await openDraftInspector("pages");

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
await sleepMs(900);
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

const openLifecycle = assertInteractionLifecycle({
  action: "studio_open_for_draft_visual",
  actionReceived: Boolean(openResult?.degraded) || Number(openResult?.token || 0) > 0,
  payload: { status: "handled", error: "" },
  stateAfter: String(state.selectedProjectID || "").trim() === PROJECT_ID,
  stateLabel: "draft_visual_project_selected",
  extra: {
    token: Number(openResult?.token || 0),
    degraded: openResult?.degraded === true,
    helperStatus: String(openResult?.appSession?.helperStatus || ""),
  },
});

const stateLifecycle = assertInteractionLifecycle({
  action: "studio_draft_visual_verify",
  actionReceived: true,
  payload: { status: "handled", error: "" },
  stateAfter: state.draftInspectorPresented === true
    && String(state.draftInspectorSection || "").trim().toLowerCase() === "pages"
    && Number(state.draftPaginationPageCount || 0) >= 2
    && Number(state.draftIntegrityIssueCount || 0) >= 1,
  stateLabel: "draft_inspector_pages_ready",
  extra: {
    pageCount: Number(state.draftPaginationPageCount || 0),
    integrityIssueCount: Number(state.draftIntegrityIssueCount || 0),
  },
});

const result = {
  ok: true,
  appSession: openResult?.appSession || {},
  screenshotPath: SCREENSHOT_PATH,
  selectedProjectID: state.selectedProjectID || "",
  draftInspectorPresented: state.draftInspectorPresented === true,
  draftInspectorSection: state.draftInspectorSection || "",
  draftPaginationPageCount: Number(state.draftPaginationPageCount || 0),
  draftIntegrityIssueCount: Number(state.draftIntegrityIssueCount || 0),
  draftIntegrityPrimaryPreview: String(state.draftIntegrityPrimaryPreview || "").slice(0, 160),
  visualStats,
  windowBounds: windowInfo,
  lifecycle: {
    open: openLifecycle,
    structuralSeed: seedLifecycle,
    appendIntegrityProse: appendLifecycle,
    openDraftInspector: inspectorOpen.lifecycle,
    state: stateLifecycle,
  },
};

console.log(JSON.stringify(result, null, 2));
console.log(`__STUDIO_DRAFT_VISUAL_RESULT__ ${JSON.stringify(result)}`);
console.log("studio-draft-visual-smoke: ok");
