import { existsSync, mkdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createStudioEvalDebugContext, ensureStudioVisibleWithOpenHandshake } from "./studio_eval_debug_utils.mjs";

const SCREENSHOT_DIR = "/tmp/them-smoke/page-write-toast";
const EXPANDED_PATH = `${SCREENSHOT_DIR}/them-page-write-toast-expanded.png`;
const COLLAPSED_PATH = `${SCREENSHOT_DIR}/them-page-write-toast-collapsed.png`;
const studioDebugDefaultsDomains = Array.from(
  new Set([
    String(process.env.THEM_DEBUG_DEFAULTS_DOMAIN || "").trim(),
    `${process.env.HOME || ""}/Library/Preferences/io.them.them`,
    "io.them.them",
  ].filter(Boolean))
);

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
  for (const domain of studioDebugDefaultsDomains) {
    const result = runOptional("defaults", ["read", domain, key]);
    if (result.status === 0) {
      return result.stdout.trim();
    }
  }
  return "";
}

function readDefaultInt(key) {
  const value = Number(readDefaultString(key));
  return Number.isFinite(value) ? value : 0;
}

function writeDefaultInt(key, value) {
  let wrote = false;
  for (const domain of studioDebugDefaultsDomains) {
    const result = runOptional("defaults", ["write", domain, key, "-int", String(value)]);
    wrote = wrote || result.status === 0;
  }
  if (!wrote) {
    throw new Error(`Unable to write int default for key ${key}`);
  }
}

function writeDefaultString(key, value) {
  let wrote = false;
  for (const domain of studioDebugDefaultsDomains) {
    const result = runOptional("defaults", ["write", domain, key, "-string", String(value)]);
    wrote = wrote || result.status === 0;
  }
  if (!wrote) {
    throw new Error(`Unable to write string default for key ${key}`);
  }
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

function appIsRunning() {
  return studioApp.isRunning();
}

function appHasWindow() {
  return studioApp.hasWindow();
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

async function setShellVisibility(sidebar, inspector) {
  const token = nextToken("studio_debug_shell_visibility_token", "studio_debug_shell_visibility_ack_token");
  writeDefaultString("studio_debug_shell_visibility_sidebar", sidebar);
  writeDefaultString("studio_debug_shell_visibility_inspector", inspector);
  writeDefaultInt("studio_debug_shell_visibility_token", token);
  await waitFor(
    () => readDefaultInt("studio_debug_shell_visibility_ack_token") === token,
    `shell visibility ack ${token}`,
    15000,
    150
  );
}

async function setPageWriteToast(mode, source) {
  const token = nextToken("studio_debug_page_write_toast_token", "studio_debug_page_write_toast_ack_token");
  writeDefaultString("studio_debug_page_write_toast_mode", mode);
  writeDefaultString("studio_debug_page_write_toast_source", source);
  writeDefaultInt("studio_debug_page_write_toast_token", token);
  await waitFor(
    () => readDefaultInt("studio_debug_page_write_toast_ack_token") === token,
    `page write toast ack ${mode} ${token}`,
    15000,
    150
  );
  const state = await waitForDiffState(
    (candidate) =>
      candidate?.pageWriteToastVisible === (mode !== "dismiss") &&
      candidate?.pageWriteToastCollapsed === (mode === "collapsed") &&
      String(candidate?.pageWriteToastSource || "") === source &&
      (mode === "dismiss" || String(candidate?.pageWriteToastPreview || "").includes("INT. KITCHEN - DAY")),
    `page write toast ${mode} ${source}`,
    15000
  );
  await sleep(300);
  return state;
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
  };
}

function captureWindow(path) {
  const window = readFrontWindowInfo();
  assert(window.windowID > 0, "Missing THEM front window for capture");
  studioApp.assertOwned();
  run("screencapture", ["-x", "-l", String(window.windowID), path]);
  studioApp.assertOwned();
  assert(existsSync(path), `Expected screenshot at ${path}`);
  const stats = statSync(path);
  assert(stats.size > 0, `Expected screenshot ${path} to be non-empty`);
  return stats.size;
}

async function main() {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });

  await ensureStudioVisible();
  let seededStructuralDraft = true;
  try {
    await seedStructuralDraft();
  } catch {
    seededStructuralDraft = false;
    await waitFor(() => readDebugDiffState() !== null, "Studio diff state after seed fallback", 5000, 250);
  }
  await setShellVisibility("hide", "hide");

  const expandedState = await setPageWriteToast("expanded", "typed");
  const expandedBytes = captureWindow(EXPANDED_PATH);

  const collapsedState = await setPageWriteToast("collapsed", "voice");
  const collapsedBytes = captureWindow(COLLAPSED_PATH);

  await setPageWriteToast("dismiss", "voice");

  console.log(JSON.stringify({
    seededStructuralDraft,
    expanded: {
      visible: expandedState?.pageWriteToastVisible ?? false,
      collapsed: expandedState?.pageWriteToastCollapsed ?? false,
      source: expandedState?.pageWriteToastSource ?? "",
      preview: expandedState?.pageWriteToastPreview ?? "",
    },
    collapsed: {
      visible: collapsedState?.pageWriteToastVisible ?? false,
      collapsed: collapsedState?.pageWriteToastCollapsed ?? false,
      source: collapsedState?.pageWriteToastSource ?? "",
      preview: collapsedState?.pageWriteToastPreview ?? "",
    },
    screenshots: {
      expandedPath: EXPANDED_PATH,
      expandedBytes,
      collapsedPath: COLLAPSED_PATH,
      collapsedBytes,
    },
  }, null, 2));
}

await main();
