import { existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertInteractionLifecycle,
  createStudioEvalDebugContext,
  ensureStudioVisibleWithOpenHandshake,
  runCommand,
  runOptionalCommand,
  sleepMs,
  waitForCondition,
} from "./studio_eval_debug_utils.mjs";

const EVAL_DIR = dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = resolve(EVAL_DIR, "..");
const SCREENSHOT_PATH = "/tmp/them-smoke/them-page-visual.png";

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
const debugDefaults = debugContext.defaults;
const {
  readDefaultInt,
  writeDefaultInt,
  writeDefaultString,
  readJsonDefault,
  nextToken,
} = debugContext;

function osascript(lines) {
  const args = [];
  for (const line of lines) {
    args.push("-e", line);
  }
  return run("osascript", args);
}

function readDebugDiffState() {
  return readJsonDefault("studio_debug_diff_state_json", null);
}

function normalizeText(value) {
  return String(value || "")
    .replace(/\\[nrt]/g, " ")
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

function runSmokeWithRetry(command, args, options = {}, maxAttempts = 3) {
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = runOptional(command, args, options);
    if (result.status === 0) {
      return result.stdout;
    }
    lastError = result.stderr || result.stdout || `${command} failed`;
    const combined = `${result.stderr || ""}\n${result.stdout || ""}`.toLowerCase();
    const retryable = /too many session requests|429|rate limit|timed out|request timeout/.test(combined);
    if (!retryable || attempt === maxAttempts) {
      break;
    }
  }
  throw new Error((lastError || `${command} failed`).trim());
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

async function forceStudioPage(projectId) {
  const cleanProjectId = String(projectId || "").trim();
  const appPath = findDebugAppPath();
  const openResult = await ensureStudioVisibleWithOpenHandshake({
    appPath,
    debugDefaults,
    runOptional,
    activateApp: () => activateApp(),
    appHasWindow,
    readDebugDiffState,
  });
  const state = cleanProjectId
    ? await waitForDiffState(
      (candidate) => String(candidate.selectedProjectID || "").trim() === cleanProjectId
        && String(candidate.projectKey || "").trim().toLowerCase() === `project:${cleanProjectId}`.toLowerCase(),
      `Studio page for throwaway project ${cleanProjectId}`,
      20000
    )
    : await waitForDiffState(
      (candidate) => Boolean(String(candidate.projectKey || "").trim()) || Boolean(String(candidate.selectedProjectID || "").trim()),
      "Studio page selection",
      20000
    );
  activateApp();
  await sleepMs(700);
  return { state, openResult };
}

async function seedStructuralDraftFallback() {
  const appPath = findDebugAppPath();
  runOptional("open", ["-na", appPath]);
  await sleepMs(700);
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const token = nextToken("studio_debug_seed_structural_token", "studio_debug_seed_structural_ack_token");
    writeDefaultInt("studio_debug_seed_structural_token", token);
    activateApp();
    try {
      await waitForCondition(
        () => readDefaultInt("studio_debug_seed_structural_ack_token") === token,
        `structural seed ack ${token}`,
        attempt === 1 ? 15000 : 10000,
        150
      );
      const state = readDebugDiffState() || {};
      const lifecycle = assertInteractionLifecycle({
        action: "studio_debug_seed_structural",
        actionReceived: readDefaultInt("studio_debug_seed_structural_ack_token") === token,
        payload: { status: "handled", error: "" },
        stateAfter: Boolean(String(state.selectedProjectID || state.projectKey || "").trim()),
        stateLabel: "structural_seed_visible",
        extra: {
          token,
          selectedProjectID: String(state.selectedProjectID || "").trim(),
        },
      });
      return { state, lifecycle };
    } catch (error) {
      lastError = error;
      await sleepMs(900);
    }
  }
  throw lastError || new Error("structural seed ack never arrived");
}

const PAGE_VISUAL_FALLBACK_APPEND = `
INT. DINER - LATER

LUCY
I can do this.

She folds the receipt into a square and slips it into her pocket.

FRANK
Then move before the room decides for you.

Lucy clocks the back exit and the waitress refilling the coffee.

INT. KITCHEN - CONTINUOUS

Steam ghosts up from the sink.

LUCY
I know what this costs.

JESS
Then say it out loud.

Lucy steadies herself against the counter and breathes through the silence.

INT. HALLWAY - MOMENTS LATER

The overhead bulbs hum.

FRANK
If you leave now, leave clean.

LUCY
I'm not leaving clean. I'm leaving true.

She keeps walking.

INT. ROOF ACCESS - CONTINUOUS

Metal stairs rattle under her weight.

JESS
Don't look back unless you're willing to stay.

LUCY
I'm not.

She pushes through the roof door into the white wash of late afternoon.
`.trim();

const PAGE_VISUAL_FALLBACK_TAIL_EXCERPT = normalizeText(PAGE_VISUAL_FALLBACK_APPEND).slice(-96);

async function appendFallbackPageText() {
  const token = nextToken("studio_debug_manual_edit_token", "studio_debug_manual_edit_ack_token");
  writeDefaultString("studio_debug_manual_edit_text", PAGE_VISUAL_FALLBACK_APPEND);
  writeDefaultInt("studio_debug_manual_edit_token", token);
  await waitForCondition(
    () => readDefaultInt("studio_debug_manual_edit_ack_token") === token,
    `manual page-visual edit ack ${token}`,
    15000,
    150
  );
  const state = await waitForDiffState(
    (candidate) => normalizeText(candidate.draftTailPreview || "").includes(PAGE_VISUAL_FALLBACK_TAIL_EXCERPT),
    "page visual fallback screenplay tail preview",
    15000
  );
  const lifecycle = assertInteractionLifecycle({
    action: "studio_debug_manual_edit_page_visual",
    actionReceived: readDefaultInt("studio_debug_manual_edit_ack_token") === token,
    payload: { status: "handled", error: "" },
    stateAfter: normalizeText(state.draftTailPreview || "").includes(PAGE_VISUAL_FALLBACK_TAIL_EXCERPT),
    stateLabel: "page_visual_tail_visible",
    extra: {
      token,
      draftTailPreview: normalizeText(state.draftTailPreview || "").slice(-120),
    },
  });
  return { state, lifecycle };
}

async function focusPageForVisualFallback() {
  const token = nextToken("studio_debug_focus_page_token", "studio_debug_focus_page_ack_token");
  writeDefaultInt("studio_debug_focus_page_token", token);
  await waitForCondition(
    () => readDefaultInt("studio_debug_focus_page_ack_token") === token,
    `focus page ack ${token}`,
    10000,
    150
  );
  return assertInteractionLifecycle({
    action: "studio_debug_focus_page",
    actionReceived: readDefaultInt("studio_debug_focus_page_ack_token") === token,
    payload: { status: "handled", error: "" },
    stateAfter: true,
    stateLabel: "focus_ack_received",
    extra: { token },
  });
}

async function seedPageVisualFallback() {
  const structural = await seedStructuralDraftFallback();
  const manual = await appendFallbackPageText();
  const focus = await focusPageForVisualFallback();
  return {
    state: manual.state || structural.state || {},
    lifecycles: [structural.lifecycle, manual.lifecycle, focus],
  };
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

let payload = null;
let insertedText = "";
let sourceMode = "cmdreturn";
let fallbackLifecycles = [];
let fallbackSeedState = null;

try {
  const smoke = runSmokeWithRetry(
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
    },
    4
  );
  payload = extractMarkedJSON(smoke, "__STUDIO_CMDRETURN_RESULT__");
  const firstEntry = payload?.firstEntry || {};
  insertedText = normalizeText(firstEntry?.insertedText || payload?.firstInsertedPreview || "");
  assert(payload?.ok === true, "Studio page visual smoke did not report ok=true");
  assert(String(firstEntry?.target || "").trim().toLowerCase() === "page", "Studio page visual smoke did not land on the page target");
  assert(insertedText.length > 0, "Studio page visual smoke did not persist inserted page text");
  assert(String(payload?.throwawayProjectId || "").trim(), "Studio page visual smoke is missing a throwaway project id");
} catch (error) {
  const message = String(error?.message || error || "");
  const quotaBlocked = /insufficient_quota|exceeded your current quota|billing details/i.test(message);
  if (!quotaBlocked) {
    throw error;
  }
  sourceMode = "fallback_debug_page_seed";
  const seededFallback = await seedPageVisualFallback();
  const seededState = seededFallback.state || {};
  fallbackSeedState = seededState;
  fallbackLifecycles = seededFallback.lifecycles || [];
  const projectId = String(seededState?.selectedProjectID || "").trim();
  insertedText = normalizeText(PAGE_VISUAL_FALLBACK_APPEND);
  assert(insertedText.length > 0, "Page-visual fallback did not produce visible page text");
  payload = {
    ok: true,
    throwawayProjectId: "",
    fallbackProjectId: projectId,
    firstRequestID: "",
    firstEntry: {
      target: "page",
      insertedText,
    },
    fallbackReason: "insufficient_quota",
  };
}

let state = null;
let openResult = {
  token: 0,
  degraded: true,
  appSession: {},
};

if (sourceMode === "cmdreturn") {
  ({ state, openResult } = await forceStudioPage(payload.throwawayProjectId));
} else {
  activateApp();
  state = await waitForDiffState(
    (candidate) =>
      String(candidate.selectedProjectID || "").trim() === String(payload.fallbackProjectId || "").trim()
      && normalizeText(`${candidate.draftPreview || ""} ${candidate.draftTailPreview || ""}`).includes(PAGE_VISUAL_FALLBACK_TAIL_EXCERPT),
    "fallback page visual seeded state",
    20000
  );
  if (!state && fallbackSeedState) {
    state = fallbackSeedState;
  }
  await sleepMs(700);
}
const windowInfo = readFrontWindowInfo();
captureScreenshot(SCREENSHOT_PATH, windowInfo);

if (String(payload.throwawayProjectId || "").trim()) {
  assert(
    String(state.selectedProjectID || "").trim() === String(payload.throwawayProjectId || "").trim(),
    "Studio page visual smoke was not showing the throwaway project at capture time"
  );
}

const draftPreview = normalizeText(`${state.draftPreview || ""} ${state.draftTailPreview || ""}`);
const visibleExcerpt = sourceMode === "cmdreturn"
  ? insertedText.slice(0, Math.min(48, insertedText.length))
  : PAGE_VISUAL_FALLBACK_TAIL_EXCERPT;
assert(
  visibleExcerpt.length === 0 || draftPreview.includes(visibleExcerpt),
  "Studio page visual smoke draft preview did not include the inserted page text at capture time"
);
if (sourceMode === "cmdreturn") {
  assert(
    !String(state.focusedDiffKey || "").trim(),
    "Studio page visual smoke still had a focused diff overlay at capture time"
  );
}

const visualStats = analyzePageVisualState(SCREENSHOT_PATH);
const minDarkRatio = sourceMode === "cmdreturn" ? 0.01 : 0.008;
const minNearBlackRatio = sourceMode === "cmdreturn" ? 0.002 : 0.001;
assert(
  Number(visualStats.averageLuma || 0) >= 0.72,
  `Studio page visual smoke crop was not paper-light enough: averageLuma=${visualStats.averageLuma}`
);
assert(
  Number(visualStats.brightRatio || 0) >= 0.45,
  `Studio page visual smoke crop did not contain enough white-paper pixels: brightRatio=${visualStats.brightRatio}`
);
assert(
  Number(visualStats.darkRatio || 0) >= minDarkRatio,
  `Studio page visual smoke crop did not contain enough dark text pixels: darkRatio=${visualStats.darkRatio}`
);
assert(
  Number(visualStats.nearBlackRatio || 0) >= minNearBlackRatio,
  `Studio page visual smoke crop did not contain enough near-black text pixels: nearBlackRatio=${visualStats.nearBlackRatio}`
);

const openLifecycle = assertInteractionLifecycle({
  action: "studio_open_for_page_visual",
  actionReceived: Boolean(openResult?.degraded) || Number(openResult?.token || 0) > 0,
  payload: { status: "handled", error: "" },
  stateAfter: Boolean(String(state.selectedProjectID || state.projectKey || "").trim()),
  stateLabel: "studio_page_visible",
  extra: {
    token: Number(openResult?.token || 0),
    degraded: openResult?.degraded === true,
    helperStatus: String(openResult?.appSession?.helperStatus || ""),
  },
});

const sourceLifecycle = assertInteractionLifecycle({
  action: sourceMode === "cmdreturn" ? "studio_cmdreturn_page_visual" : "studio_debug_page_seed",
  actionReceived: sourceMode === "cmdreturn"
    ? Boolean(String(payload.firstRequestID || "").trim()) || payload?.ok === true
    : fallbackLifecycles.length > 0,
  payload: { status: payload?.ok === true ? "handled" : "error", error: String(payload?.fallbackReason || "") },
  stateAfter: visibleExcerpt.length === 0 || draftPreview.includes(visibleExcerpt),
  stateLabel: "page_preview_contains_inserted_text",
  extra: {
    sourceMode,
    requestId: String(payload.firstRequestID || ""),
    fallbackReason: String(payload.fallbackReason || ""),
  },
});

const result = {
  ok: true,
  appSession: openResult?.appSession || {},
  screenshotPath: SCREENSHOT_PATH,
  sourceMode,
  fallbackReason: String(payload.fallbackReason || "").trim(),
  throwawayProjectId: String(payload.throwawayProjectId || "").trim(),
  fallbackProjectId: String(payload.fallbackProjectId || "").trim(),
  firstPrompt,
  firstRequestID: payload.firstRequestID || "",
  selectedProjectID: state.selectedProjectID || "",
  focusedDiffKey: state.focusedDiffKey || "",
  insertedPreview: insertedText.slice(0, 220),
  windowBounds: windowInfo,
  visualStats,
  lifecycle: {
    open: openLifecycle,
    source: sourceLifecycle,
    fallbackSteps: fallbackLifecycles,
  },
};

console.log(JSON.stringify(result, null, 2));
console.log(`__STUDIO_PAGE_VISUAL_RESULT__ ${JSON.stringify(result)}`);
console.log("studio-page-visual-smoke: ok");
