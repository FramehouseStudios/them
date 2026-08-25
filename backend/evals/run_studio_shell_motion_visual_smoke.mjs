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

const SCREENSHOT_PATH = "/tmp/them-smoke/them-shell-motion-visual.png";
const APP_PATH_FINDER = "/bin/zsh";

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

function findDebugAppPath() {
  const direct = String(process.env.THEM_APP_PATH || "").trim();
  if (direct && existsSync(direct)) return direct;
  const discovered = run(APP_PATH_FINDER, [
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
  const appPath = findDebugAppPath();
  activateApp(appPath);
  await sleepMs(700);
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
      const state = readDebugDiffState() || {};
      return assertInteractionLifecycle({
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
    } catch (error) {
      lastError = error;
      await sleepMs(1200);
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
  return {
    windowID: Math.round(Number(parsed.windowID || 0)),
    x: Math.max(0, Math.round(Number(parsed.x || 0))),
    y: Math.max(0, Math.round(Number(parsed.y || 0))),
    width: Math.max(1, Math.round(Number(parsed.width || 0))),
    height: Math.max(1, Math.round(Number(parsed.height || 0))),
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

async function setShellVisibility(sidebar, inspector) {
  const token = nextToken("studio_debug_shell_visibility_token", "studio_debug_shell_visibility_ack_token");
  writeDefaultString("studio_debug_shell_visibility_sidebar", sidebar);
  writeDefaultString("studio_debug_shell_visibility_inspector", inspector);
  writeDefaultInt("studio_debug_shell_visibility_token", token);
  await waitForCondition(
    () => readDefaultInt("studio_debug_shell_visibility_ack_token") === token,
    `shell visibility ack ${token}`,
    15000,
    150
  );
  return token;
}

const transitions = [];
const transitionLifecycles = [];

const openResult = await ensureStudioVisible();
const seedLifecycle = await seedStructuralDraft();

let token = await setShellVisibility("hide", "show");
let state = await waitForDiffState(
  (candidate) => candidate.leftSidebarVisible === false && candidate.rightRailExpanded === true,
  "sidebar hidden and inspector shown",
  15000
);
transitions.push({
  sidebar: state.leftSidebarVisible,
  inspector: state.rightRailExpanded,
});
transitionLifecycles.push(
  assertInteractionLifecycle({
    action: "studio_debug_shell_visibility hide/show",
    actionReceived: readDefaultInt("studio_debug_shell_visibility_ack_token") === token,
    payload: { status: "handled", error: "" },
    stateAfter: state.leftSidebarVisible === false && state.rightRailExpanded === true,
    stateLabel: "sidebar_hidden_inspector_shown",
    extra: { token },
  })
);

await sleepMs(350);

token = await setShellVisibility("show", "hide");
state = await waitForDiffState(
  (candidate) => candidate.leftSidebarVisible === true && candidate.rightRailExpanded === false,
  "sidebar shown and inspector hidden",
  15000
);
transitions.push({
  sidebar: state.leftSidebarVisible,
  inspector: state.rightRailExpanded,
});
transitionLifecycles.push(
  assertInteractionLifecycle({
    action: "studio_debug_shell_visibility show/hide",
    actionReceived: readDefaultInt("studio_debug_shell_visibility_ack_token") === token,
    payload: { status: "handled", error: "" },
    stateAfter: state.leftSidebarVisible === true && state.rightRailExpanded === false,
    stateLabel: "sidebar_shown_inspector_hidden",
    extra: { token },
  })
);

await sleepMs(350);

token = await setShellVisibility("show", "show");
state = await waitForDiffState(
  (candidate) =>
    candidate.leftSidebarVisible === true &&
    candidate.rightRailExpanded === true,
  "sidebar and inspector both shown",
  15000
);
transitions.push({
  sidebar: state.leftSidebarVisible,
  inspector: state.rightRailExpanded,
});
transitionLifecycles.push(
  assertInteractionLifecycle({
    action: "studio_debug_shell_visibility show/show",
    actionReceived: readDefaultInt("studio_debug_shell_visibility_ack_token") === token,
    payload: { status: "handled", error: "" },
    stateAfter: state.leftSidebarVisible === true
      && state.rightRailExpanded === true,
    stateLabel: "sidebar_and_inspector_shown",
    extra: { token },
  })
);

activateApp(findDebugAppPath());
await sleepMs(700);
const windowInfo = readFrontWindowInfo();
captureWindowScreenshot(SCREENSHOT_PATH, windowInfo);

const openLifecycle = assertInteractionLifecycle({
  action: "studio_open_for_shell_motion_visual",
  actionReceived: Boolean(openResult?.degraded) || Number(openResult?.token || 0) > 0,
  payload: { status: "handled", error: "" },
  stateAfter: Boolean(String(state.selectedProjectID || state.projectKey || "").trim()),
  stateLabel: "shell_visible",
  extra: {
    token: Number(openResult?.token || 0),
    degraded: openResult?.degraded === true,
    helperStatus: String(openResult?.appSession?.helperStatus || ""),
  },
});

const result = {
  ok: true,
  appSession: openResult?.appSession || {},
  screenshotPath: SCREENSHOT_PATH,
  windowBounds: windowInfo,
  transitions,
  selectedProjectID: state.selectedProjectID || "",
  sidebarSection: state.sidebarSection || "",
  collaboratorInspectorCompact: state.collaboratorInspectorCompact === true,
  transientStatusVisible: state.transientStatusVisible === true,
  lifecycle: {
    open: openLifecycle,
    structuralSeed: seedLifecycle,
    transitions: transitionLifecycles,
  },
};

console.log(JSON.stringify(result, null, 2));
console.log(`__STUDIO_SHELL_MOTION_VISUAL_RESULT__ ${JSON.stringify(result)}`);
console.log("studio-shell-motion-visual-smoke: ok");
