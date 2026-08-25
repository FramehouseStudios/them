import { existsSync, mkdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import http from "node:http";
import {
  cleanupStudioEvalSessionsWithHelper,
  createStudioOwnedAppController,
  relaunchStudioAppWithHelper,
} from "./studio_eval_debug_utils.mjs";

const SCREENSHOT_PATH = "/tmp/them-smoke/them-screenplay-visual-export.png";

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

const ownedApp = createStudioOwnedAppController({ runOptional });

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

function deleteDefaultKey(key) {
  runOptional("defaults", ["delete", "io.them.them", key]);
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function ownerHeaders() {
  const headers = {
    "Content-Type": "application/json",
    "X-APP-TOKEN": "them-dev",
  };
  const userId = readDefaultString("user_id");
  if (userId) {
    headers["X-User-Id"] = userId;
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
  const projectId = `studio-visual-export-${stamp}`;
  const title = `Studio Visual Export ${stamp}`;
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

async function seedProjectVersion(projectId, title, draft) {
  const response = await fetch(`http://127.0.0.1:3000/screenplay/projects/${projectId}/version`, {
    method: "POST",
    headers: ownerHeaders(),
    body: JSON.stringify({
      draft,
      title,
      phase: "scene_draft",
      source: "studio_visual_export_smoke_seed",
      notes: "Studio visual export smoke seed",
      base_version_id: "",
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Failed to seed Studio draft version: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload;
}

function activateApp(appPath = "", appSession = null) {
  ownedApp.activate(appPath, appSession);
}

function appHasWindow() {
  return ownedApp.hasWindow();
}

function appIsRunning() {
  return ownedApp.isRunning();
}

function launchApp(appPath) {
  const appSession = relaunchStudioAppWithHelper({ appPath, runOptional });
  ownedApp.bindSession(appPath, appSession);
  return appSession;
}

function quitApp() {
  cleanupStudioEvalSessionsWithHelper({ runOptional });
}

async function ensureAppStopped() {
  quitApp();
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
  const appSession = launchApp(appPath);
  await waitFor(() => appIsRunning(), "THEM process after relaunch", 20000, 300);
  activateApp(appPath, appSession);
  await ensureStudioVisible();
}

function captureScreenshot(path) {
  mkdirSync("/tmp/them-smoke", { recursive: true });
  ownedApp.captureWindow(path);
  assert(existsSync(path), `Screenshot was not created: ${path}`);
  assert(statSync(path).size > 0, `Screenshot file is empty: ${path}`);
}

function analyzeScreenplayLayout(path) {
  const swiftSource = String.raw`
import AppKit
import Foundation

let path = ProcessInfo.processInfo.environment["SCREENPLAY_VISUAL_EXPORT_PATH"] ?? ""
guard let image = NSImage(contentsOfFile: path),
      let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    fputs("unable to load screenshot\n", stderr)
    exit(1)
}
let rep = NSBitmapImageRep(cgImage: cgImage)
let width = rep.pixelsWide
let height = rep.pixelsHigh

func lumaAt(x: Int, y: Int) -> Double {
    guard let color = rep.colorAt(x: x, y: y)?.usingColorSpace(.deviceRGB) else { return 0 }
    return (0.2126 * Double(color.redComponent))
        + (0.7152 * Double(color.greenComponent))
        + (0.0722 * Double(color.blueComponent))
}

let innerX = max(0, Int(Double(width) * 0.27))
let innerY = max(0, Int(Double(height) * 0.39))
let innerWidth = max(1, Int(Double(width) * 0.45))
let innerHeight = max(1, Int(Double(height) * 0.20))

struct Band {
    let minY: Int
    let maxY: Int
    let minX: Int
    let maxX: Int
    let darkPixels: Int
}

var rowFlags: [Bool] = Array(repeating: false, count: innerHeight)
for rowOffset in 0..<innerHeight {
    let y = innerY + rowOffset
    var dark = 0
    for x in innerX..<(innerX + innerWidth) {
        if lumaAt(x: x, y: y) <= 0.44 { dark += 1 }
    }
    rowFlags[rowOffset] = dark >= max(10, Int(Double(innerWidth) * 0.018))
}

var bands: [Band] = []
var currentStart: Int? = nil
for rowOffset in 0..<innerHeight {
    if rowFlags[rowOffset] {
        if currentStart == nil { currentStart = rowOffset }
        continue
    }
    guard let start = currentStart else { continue }
    let end = rowOffset - 1
    currentStart = nil
    guard end >= start else { continue }
    var minX = innerX + innerWidth
    var maxX = innerX
    var darkPixels = 0
    for y in (innerY + start)...(innerY + end) {
        for x in innerX..<(innerX + innerWidth) {
            if lumaAt(x: x, y: y) <= 0.44 {
                minX = min(minX, x)
                maxX = max(maxX, x)
                darkPixels += 1
            }
        }
    }
    guard darkPixels >= 60, maxX > minX else { continue }
    bands.append(Band(minY: innerY + start, maxY: innerY + end, minX: minX, maxX: maxX, darkPixels: darkPixels))
}
if let start = currentStart {
    let end = innerHeight - 1
    var minX = innerX + innerWidth
    var maxX = innerX
    var darkPixels = 0
    for y in (innerY + start)...(innerY + end) {
        for x in innerX..<(innerX + innerWidth) {
            if lumaAt(x: x, y: y) <= 0.44 {
                minX = min(minX, x)
                maxX = max(maxX, x)
                darkPixels += 1
            }
        }
    }
    if darkPixels >= 60, maxX > minX {
        bands.append(Band(minY: innerY + start, maxY: innerY + end, minX: minX, maxX: maxX, darkPixels: darkPixels))
    }
}

let payload: [String: Any] = [
    "width": width,
    "height": height,
    "cropRect": [
        "x": innerX,
        "y": innerY,
        "width": innerWidth,
        "height": innerHeight,
    ],
    "lineBands": bands.prefix(6).map { band in
        [
            "minY": band.minY,
            "maxY": band.maxY,
            "minX": band.minX,
            "maxX": band.maxX,
            "darkPixels": band.darkPixels,
        ]
    },
]
let data = try JSONSerialization.data(withJSONObject: payload, options: [])
print(String(data: data, encoding: .utf8) ?? "{}")
`;
  return JSON.parse(run("swift", ["-e", swiftSource], {
    env: {
      ...process.env,
      SCREENPLAY_VISUAL_EXPORT_PATH: path,
    },
  }));
}

async function exportFDX(draft, title, projectId) {
  const response = await fetch("http://127.0.0.1:3000/screenplay/export", {
    method: "POST",
    headers: ownerHeaders(),
    body: JSON.stringify({
      draft,
      title,
      phase: "scene_draft",
      format: "fdx",
      project_id: projectId,
    }),
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`FDX export failed: ${response.status} ${body}`);
  }
  return body;
}

function parseFDXParagraphs(xml) {
  const paragraphs = [];
  const pattern = /<Paragraph Type="([^"]+)"><Text>([\s\S]*?)<\/Text><\/Paragraph>/g;
  let match = null;
  while ((match = pattern.exec(xml))) {
    paragraphs.push({
      type: String(match[1] || "").trim(),
      text: String(match[2] || "")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, "\"")
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, "&"),
    });
  }
  return paragraphs;
}

const draft = [
  "INT. DINER - NIGHT",
  "",
  "The rain needles the windows.",
  "",
  "JESSICA",
  "(voice trembling)",
  "Dad, we need to talk.",
  "",
  "CUT TO:",
].join("\n");

const expectedTypes = [
  "Scene Heading",
  "Action",
  "Character",
  "Parenthetical",
  "Dialogue",
  "Transition",
];

const defaultKeys = [
  "studio_debug_open_token",
  "studio_debug_open_ack_token",
  "studio_debug_diff_state_json",
];
const originalDefaults = Object.fromEntries(defaultKeys.map((key) => [key, readDefaultString(key)]));

let throwawayProject = null;
let appPath = "";

try {
  const health = await readHealth();
  assert(health?.ok === true, "Backend health is not OK on localhost:3000");

  throwawayProject = await createThrowawayStudioProject();
  await seedProjectVersion(throwawayProject.projectId, throwawayProject.title, draft);
  appPath = findDebugAppPath();
  await relaunchApp(appPath);

  await waitFor(() => {
    const state = readDebugDiffState();
    return state
      && normalize(state.selectedProjectID) === normalize(throwawayProject.projectId)
      && String(state.draftPreview || "").includes("INT. DINER - NIGHT")
      && String(state.draftPreview || "").includes("JESSICA");
  }, `Studio project hydrate for ${throwawayProject.projectId}`, 30000, 250);

  captureScreenshot(SCREENSHOT_PATH);
  const visual = analyzeScreenplayLayout(SCREENSHOT_PATH);
  const bands = Array.isArray(visual.lineBands) ? visual.lineBands : [];
  assert(bands.length >= 6, `Expected at least 6 screenplay line bands, found ${bands.length}`);

  const [heading, action, character, parenthetical, dialogue, transition] = bands;
  const cropRect = visual.cropRect || {};
  const pageWidth = Number(cropRect.width || 0);
  const pageX = Number(cropRect.x || 0);
  assert(pageWidth > 0, "Visual export smoke could not resolve the screenplay crop width");

  assert(
    Math.abs(Number(heading.minX || 0) - Number(action.minX || 0)) <= pageWidth * 0.08,
    "Scene heading and action did not share the expected left margin"
  );
  assert(
    Number(dialogue.minX || 0) >= Number(action.minX || 0) + (pageWidth * 0.12),
    "Dialogue did not appear indented from action on the Studio page"
  );
  assert(
    Number(parenthetical.minX || 0) >= Number(action.minX || 0) + (pageWidth * 0.08)
      && (Number(parenthetical.maxX || 0) - Number(parenthetical.minX || 0))
        < (Number(dialogue.maxX || 0) - Number(dialogue.minX || 0)),
    "Parenthetical did not render as a tighter, indented note line on the Studio page"
  );

  const exportedFDX = await exportFDX(draft, throwawayProject.title, throwawayProject.projectId);
  const paragraphs = parseFDXParagraphs(exportedFDX);
  const exportedTypes = paragraphs.map((paragraph) => paragraph.type);
  assert(
    JSON.stringify(exportedTypes) === JSON.stringify(expectedTypes),
    `FDX export types did not match expected screenplay structure: ${JSON.stringify(exportedTypes)}`
  );

  const result = {
    ok: true,
    appPath,
    throwawayProjectId: throwawayProject.projectId,
    screenshotPath: SCREENSHOT_PATH,
    exportedTypes,
    expectedTypes,
    visual,
  };

  console.log(JSON.stringify(result, null, 2));
  console.log(`__STUDIO_SCREENPLAY_VISUAL_EXPORT_RESULT__ ${JSON.stringify(result)}`);
  console.log("studio-screenplay-visual-export-smoke: ok");
} finally {
  for (const [key, value] of Object.entries(originalDefaults)) {
    if (value) {
      writeDefaultString(key, value);
    } else {
      deleteDefaultKey(key);
    }
  }
}
