import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import http from "node:http";

function assert(condition, message) {
  if (!condition) throw new Error(message);
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

function osascript(lines) {
  const args = [];
  for (const line of lines) args.push("-e", line);
  return run("osascript", args);
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

async function readHealth() {
  return await new Promise((resolve, reject) => {
    const req = http.get("http://127.0.0.1:3000/health", (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on("error", reject);
    req.setTimeout(4000, () => req.destroy(new Error("health request timed out")));
  });
}

function findDebugAppPath() {
  const direct = process.env.THEM_APP_PATH?.trim();
  if (direct && existsSync(direct)) return direct;

  const discovered = run("/bin/zsh", [
    "-lc",
    "find ~/Library/Developer/Xcode/DerivedData -path '*Build/Products/Debug/them.app/Contents/MacOS/them' -exec stat -f '%m %N' {} \\; | sort -nr | head -n 1 | cut -d' ' -f2- | sed 's#/Contents/MacOS/them$##'",
  ]);
  assert(discovered, "Could not locate Debug them.app");
  assert(existsSync(discovered), `Debug app path does not exist: ${discovered}`);
  return discovered;
}

function readDefaultString(key) {
  const result = runOptional("defaults", ["read", "io.them.them", key]);
  return result.status === 0 ? result.stdout.trim() : "";
}

function writeDefaultInt(key, value) {
  run("defaults", ["write", "io.them.them", key, "-int", String(value)]);
}

function writeDefaultString(key, value) {
  run("defaults", ["write", "io.them.them", key, "-string", String(value)]);
}

function deleteDefaultKey(key) {
  runOptional("defaults", ["delete", "io.them.them", key]);
}

function readDefaultInt(key) {
  const value = Number(readDefaultString(key));
  return Number.isFinite(value) ? value : 0;
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeDraft(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}

function ownerHeaders() {
  const headers = {
    "Content-Type": "application/json",
    "X-APP-TOKEN": "them-dev",
  };
  const userId = readDefaultString("user_id");
  if (userId) {
    headers["X-User-Id"] = userId;
    return headers;
  }
  const clientToken = readDefaultString("client_token");
  assert(clientToken, "Missing owner identity in io.them.them defaults");
  headers["X-Client-Token"] = clientToken;
  return headers;
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

async function createThrowawayStudioProject() {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const projectId = `studio-core-typing-${stamp}`;
  const title = `Studio Core Typing ${stamp}`;
  const response = await fetch("http://127.0.0.1:3000/screenplay/projects", {
    method: "POST",
    headers: ownerHeaders(),
    body: JSON.stringify({
      project_id: projectId,
      title,
      phase: "scene_draft",
      activate: true,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Failed to create throwaway Studio project: ${response.status} ${JSON.stringify(payload)}`);
  }
  return { projectId, title };
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

function activateApp() {
  osascript(['tell application "them" to activate']);
}

function launchApp(appPath) {
  run("open", ["-na", appPath]);
}

function quitApp() {
  runOptional("osascript", ["-e", "try", "-e", 'tell application "them" to quit', "-e", "end try"]);
}

function killExistingAppProcesses() {
  const result = runOptional("pgrep", ["-x", "them"]);
  if (result.status !== 0 || !result.stdout.trim()) return;
  for (const pid of result.stdout.split(/\s+/).filter(Boolean)) {
    runOptional("kill", [pid]);
  }
}

async function ensureAppStopped() {
  if (!appIsRunning()) return;
  quitApp();
  await sleep(1200);
  if (appIsRunning()) {
    killExistingAppProcesses();
  }
  await waitFor(() => !appIsRunning(), "THEM process to quit before smoke", 15000, 300);
}

async function ensureStudioVisible() {
  activateApp();
  const token = Math.max(
    1,
    readDefaultInt("studio_debug_open_token"),
    readDefaultInt("studio_debug_open_ack_token")
  ) + 1;
  writeDefaultInt("studio_debug_open_token", token);
  await waitFor(
    () => readDefaultInt("studio_debug_open_ack_token") === token,
    `Studio open ack ${token}`,
    15000,
    150
  );
  activateApp();
  await waitFor(() => appHasWindow(), "visible THEM window after Studio open", 20000, 300);
}

async function relaunchApp(appPath) {
  await ensureAppStopped();
  launchApp(appPath);
  await waitFor(() => appIsRunning(), "THEM process after relaunch", 20000, 300);
  activateApp();
  await ensureStudioVisible();
}

function readFrontWindowInfo() {
  const swiftSource = String.raw`
import AppKit
import CoreGraphics
import Foundation

let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
let candidates = windows.compactMap { window -> [String: Any]? in
    let owner = String(describing: window[kCGWindowOwnerName as String] ?? "")
    guard owner.caseInsensitiveCompare("them") == .orderedSame else { return nil }
    let layer = window[kCGWindowLayer as String] as? Int ?? 0
    guard layer == 0 else { return nil }
    guard let bounds = window[kCGWindowBounds as String] as? [String: Any] else { return nil }
    let width = Int((bounds["Width"] as? Double ?? 0).rounded())
    let height = Int((bounds["Height"] as? Double ?? 0).rounded())
    guard width > 0, height > 0 else { return nil }
    let x = Int((bounds["X"] as? Double ?? 0).rounded())
    let y = Int((bounds["Y"] as? Double ?? 0).rounded())
    let area = width * height
    return ["x": x, "y": y, "width": width, "height": height, "area": area]
}
guard let selected = candidates.max(by: { ($0["area"] as? Int ?? 0) < ($1["area"] as? Int ?? 0) }) else {
    fputs("missing THEM window\n", stderr)
    exit(1)
}
let data = try JSONSerialization.data(withJSONObject: selected, options: [])
print(String(data: data, encoding: .utf8) ?? "{}")
`;
  const raw = run("swift", ["-e", swiftSource]).trim();
  return JSON.parse(raw);
}

function appleScriptQuoted(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"');
}

function typeText(text) {
  osascript([
    'tell application "them" to activate',
    "delay 0.2",
    'tell application "System Events"',
    'tell process "them"',
    'set frontmost to true',
    "delay 0.05",
    `keystroke "${appleScriptQuoted(text)}"`,
    "end tell",
    "end tell",
  ]);
}

function pressReturn(times = 1) {
  for (let index = 0; index < times; index += 1) {
    osascript([
      'tell application "them" to activate',
      "delay 0.12",
      'tell application "System Events"',
      'tell process "them"',
      'set frontmost to true',
      "delay 0.05",
      "key code 36",
      "end tell",
      "end tell",
    ]);
  }
}

async function focusDraftEditor() {
  const token = Math.max(1, readDefaultInt("studio_debug_focus_page_token")) + 1;
  writeDefaultInt("studio_debug_focus_page_token", token);
  await waitFor(
    () => readDefaultInt("studio_debug_focus_page_ack_token") === token,
    `draft editor focus ack ${token}`,
    10000,
    150
  );
  await sleep(500);
}

function clickDraftEditor(windowInfo) {
  const clickX = Math.round(Number(windowInfo.x || 0) + (Number(windowInfo.width || 0) * 0.54));
  const clickY = Math.round(Number(windowInfo.y || 0) + (Number(windowInfo.height || 0) * 0.41));
  osascript([
    'tell application "them" to activate',
    "delay 0.15",
    'tell application "System Events"',
    'tell process "them"',
    'set frontmost to true',
    `click at {${clickX}, ${clickY}}`,
    "end tell",
    "end tell",
  ]);
}

async function clearDraftIfNeeded() {
  const state = readDebugDiffState();
  const preview = normalizeDraft(state?.draftPreview || "");
  if (!preview) return;
  osascript([
    'tell application "them" to activate',
    "delay 0.15",
    'tell application "System Events"',
    'tell process "them"',
    'set frontmost to true',
    "delay 0.05",
    'keystroke "a" using {command down}',
    "delay 0.04",
    "key code 51",
    "end tell",
    "end tell",
  ]);
  await waitFor(() => {
    const current = readDebugDiffState();
    return !normalizeDraft(current?.draftPreview || "");
  }, "draft to clear", 8000, 150);
}

async function waitForDraftContains(expected, description, timeoutMs = 12000) {
  const target = normalizeDraft(expected);
  let latest = "";
  await waitFor(() => {
    const state = readDebugDiffState();
    latest = normalizeDraft(state?.draftPreview || "");
    return latest.includes(target);
  }, description, timeoutMs, 150);
  return latest;
}

const defaultKeys = [
  "studio_debug_open_token",
  "studio_debug_open_ack_token",
  "studio_debug_focus_page_token",
  "studio_debug_focus_page_ack_token",
  "studio_debug_diff_state_json",
];
const originalDefaults = Object.fromEntries(defaultKeys.map((key) => [key, readDefaultString(key)]));

const expectedDraft = [
  "INT. DINER - NIGHT",
  "",
  "JESSICA",
  "(voice trembling)",
  "Dad, we need to talk.",
  "",
  "(beat)",
  "",
  "FADE OUT:",
].join("\n");

let appPath = "";
let throwawayProject = null;
let finalState = null;
let windowInfo = null;

try {
  const health = await readHealth();
  assert(health?.ok === true, "Backend health is not OK on localhost:3000");

  throwawayProject = await createThrowawayStudioProject();
  appPath = findDebugAppPath();
  await relaunchApp(appPath);

  await waitFor(() => {
    const state = readDebugDiffState();
    return state
      && normalize(state.selectedProjectID) === normalize(throwawayProject.projectId)
      && normalize(state.projectKey) === normalize(`project:${throwawayProject.projectId}`);
  }, `Studio project load for ${throwawayProject.projectId}`, 30000, 250);

  windowInfo = readFrontWindowInfo();
  await focusDraftEditor();
  clickDraftEditor(windowInfo);
  await sleep(450);
  await clearDraftIfNeeded();

  typeText("inside the diner at night");
  await waitForDraftContains("INT. DINER - NIGHT", "slugline normalization");
  pressReturn(2);
  await sleep(250);

  typeText("JESSICA (voice trembling) Dad, we need to talk.");
  await waitForDraftContains(
    "JESSICA\n(voice trembling)\nDad, we need to talk.",
    "cue and dialogue split"
  );
  pressReturn(2);
  await sleep(250);

  typeText("(Beat.)");
  await waitForDraftContains("(beat)", "parenthetical normalization");
  pressReturn(2);
  await sleep(250);

  typeText("fade out");
  await waitForDraftContains("FADE OUT:", "transition normalization");

  await waitFor(() => {
    const state = readDebugDiffState();
    if (!state) return false;
    finalState = state;
    return normalizeDraft(state.draftPreview || "") === expectedDraft;
  }, "final normalized screenplay draft", 12000, 150);

  const result = {
    ok: true,
    appPath,
    throwawayProjectId: throwawayProject.projectId,
    finalDraft: normalizeDraft(finalState?.draftPreview || ""),
    expectedDraft,
    selectedProjectID: finalState?.selectedProjectID || "",
  };

  console.log(JSON.stringify(result, null, 2));
  console.log(`__STUDIO_SCREENPLAY_CORE_TYPING_RESULT__ ${JSON.stringify(result)}`);
  console.log("studio-screenplay-core-typing-smoke: ok");
} finally {
  for (const [key, value] of Object.entries(originalDefaults)) {
    if (value) {
      writeDefaultString(key, value);
    } else {
      deleteDefaultKey(key);
    }
  }
}
