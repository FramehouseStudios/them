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

const SCREENSHOT_DIR = "/tmp/them-smoke/inspector-restore";
const SCREENSHOT_PATH = `${SCREENSHOT_DIR}/them-inspector-restore-reorder.png`;

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
const studioApp = debugContext.ownedApp;
const debugDefaults = debugContext.defaults;
const {
  readDefaultInt,
  writeDefaultInt,
  writeDefaultString,
  readJsonDefault: readJsonDefaultValue,
  nextToken,
} = debugContext;

function readDebugDiffState() {
  return readJsonDefaultValue("studio_debug_diff_state_json", null);
}

async function waitForDiffState(predicate, description, timeoutMs = 20000) {
  let latest = null;
  await waitForCondition(() => {
    const state = readDebugDiffState();
    if (!state) return false;
    latest = state;
    return predicate(state);
  }, description, timeoutMs, 200);
  return latest;
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
      await waitForCondition(() => readDefaultInt("studio_debug_seed_structural_ack_token") === token, `structural seed ack ${token}`, attempt === 1 ? 15000 : 10000, 150);
      const state = readDebugDiffState() || {};
      return assertInteractionLifecycle({
        action: "studio_debug_seed_structural",
        actionReceived: readDefaultInt("studio_debug_seed_structural_ack_token") === token,
        payload: { status: "handled", error: "" },
        stateAfter: Boolean(Array.isArray(state.beatOrderIDs) && state.beatOrderIDs.length > 0),
        stateLabel: "structural_seed_beat_order_available",
        extra: {
          token,
          beatCount: Array.isArray(state.beatOrderIDs) ? state.beatOrderIDs.length : 0,
        },
      });
    } catch (error) {
      lastError = error;
      await sleepMs(1200);
    }
  }
  throw lastError || new Error("structural seed ack never arrived");
}

async function showInspector() {
  const appPath = findDebugAppPath();
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const token = nextToken("studio_debug_shell_visibility_token", "studio_debug_shell_visibility_ack_token");
    writeDefaultString("studio_debug_shell_visibility_sidebar", "show");
    writeDefaultString("studio_debug_shell_visibility_inspector", "show");
    writeDefaultInt("studio_debug_shell_visibility_token", token);
    activateApp(appPath);
    try {
      await waitForCondition(() => readDefaultInt("studio_debug_shell_visibility_ack_token") === token, `shell visibility ack ${token}`, attempt === 1 ? 15000 : 10000, 150);
      const state = await waitForDiffState(
        (candidate) => candidate.leftSidebarVisible === true && candidate.rightRailExpanded === true,
        "inspector shown",
        15000
      );
      return {
        state,
        lifecycle: assertInteractionLifecycle({
          action: "studio_debug_shell_visibility show/show",
          actionReceived: readDefaultInt("studio_debug_shell_visibility_ack_token") === token,
          payload: { status: "handled", error: "" },
          stateAfter: state.leftSidebarVisible === true && state.rightRailExpanded === true,
          stateLabel: "inspector_shown",
          extra: { token },
        }),
      };
    } catch (error) {
      lastError = error;
      await sleepMs(900);
    }
  }
  throw lastError || new Error("shell visibility ack never arrived");
}

async function openRightPanelTab(tab) {
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const token = nextToken("studio_debug_right_panel_tab_token", "studio_debug_right_panel_tab_ack_token");
    writeDefaultString("studio_debug_right_panel_tab", tab);
    writeDefaultInt("studio_debug_right_panel_tab_token", token);
    try {
      await waitForCondition(() => readDefaultInt("studio_debug_right_panel_tab_ack_token") === token, `right panel tab ack ${token}`, attempt === 1 ? 20000 : 12000, 150);
      const state = await waitForDiffState((next) => next?.rightPanelTab === tab, `right inspector tab ${tab}`, 20000);
      return {
        state,
        lifecycle: assertInteractionLifecycle({
          action: `studio_debug_right_panel_tab ${tab}`,
          actionReceived: readDefaultInt("studio_debug_right_panel_tab_ack_token") === token,
          payload: { status: "handled", error: "" },
          stateAfter: state?.rightPanelTab === tab,
          stateLabel: "right_panel_tab_open",
          extra: { token, tab },
        }),
      };
    } catch (error) {
      lastError = error;
      activateApp(findDebugAppPath());
      await sleepMs(900);
    }
  }
  throw lastError || new Error(`right panel tab ${tab} never opened`);
}

async function selectLines(startLine, endLine) {
  const token = nextToken("studio_debug_select_lines_token", "studio_debug_select_lines_ack_token");
  writeDefaultInt("studio_debug_select_lines_start", startLine);
  writeDefaultInt("studio_debug_select_lines_end", endLine);
  writeDefaultInt("studio_debug_select_lines_token", token);
  await waitForCondition(() => readDefaultInt("studio_debug_select_lines_ack_token") === token, `line selection ack ${token}`, 15000, 150);
  return await waitForDiffState(
    (state) => Number(state?.selectionStartLine || 0) === startLine && Number(state?.selectionEndLine || 0) === endLine,
    `line selection ${startLine}-${endLine}`,
    15000
  );
}

async function runInspectorInteraction(action, primary = "", secondary = "") {
  const token = nextToken(
    "studio_debug_inspector_interaction_token",
    "studio_debug_inspector_interaction_ack_token",
    "studio_debug_inspector_interaction_result_token"
  );
  writeDefaultString("studio_debug_inspector_interaction_action", action);
  writeDefaultString("studio_debug_inspector_interaction_primary", primary);
  writeDefaultString("studio_debug_inspector_interaction_secondary", secondary);
  writeDefaultInt("studio_debug_inspector_interaction_token", token);
  await waitForCondition(() => readDefaultInt("studio_debug_inspector_interaction_ack_token") === token, `inspector interaction ack ${action} ${token}`, 15000, 150);
  await waitForCondition(() => readDefaultInt("studio_debug_inspector_interaction_result_token") === token, `inspector interaction result ${action} ${token}`, 15000, 150);
  const payload = readJsonDefaultValue("studio_debug_inspector_interaction_result_json") || {};
  assert(payload.status === "handled", `Inspector interaction ${action} failed: ${payload.error || payload.status || "unknown"}`);
  return {
    token,
    actionReceived: readDefaultInt("studio_debug_inspector_interaction_ack_token") === token,
    payload,
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
  return {
    windowID: Math.round(Number(parsed.windowID || 0)),
  };
}

function captureWindow(targetPath) {
  const window = readFrontWindowInfo();
  assert(window.windowID > 0, "Missing THEM front window for capture");
  studioApp.assertOwned();
  run("screencapture", ["-x", "-l", String(window.windowID), targetPath]);
  studioApp.assertOwned();
  assert(existsSync(targetPath), `Expected screenshot at ${targetPath}`);
  const stats = statSync(targetPath);
  assert(stats.size > 0, `Expected screenshot ${targetPath} to be non-empty`);
  return stats.size;
}

async function main() {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });

  const openResult = await ensureStudioVisible();
  const seedLifecycle = await seedStructuralDraft();
  const inspectorShown = await showInspector();
  const beatsTab = await openRightPanelTab("beats");
  let state = beatsTab.state;
  assert(state?.rightPanelTab === "beats", `Expected beats tab, got ${state?.rightPanelTab || "<missing>"}`);
  const interactionLifecycles = [
    inspectorShown.lifecycle,
    beatsTab.lifecycle,
  ];

  const selectedBeatID = "beat-kitchen";
  const selectBeatInteraction = await runInspectorInteraction("select_beat", selectedBeatID);
  state = await waitForDiffState(
    (next) => next?.rightPanelTab === "beats" && next?.selectedBeatID === selectedBeatID,
    "selected beat in inspector",
    15000
  );
  interactionLifecycles.push(
    assertInteractionLifecycle({
      action: "select_beat",
      actionReceived: selectBeatInteraction.actionReceived,
      payload: selectBeatInteraction.payload,
      stateAfter: state?.rightPanelTab === "beats" && state?.selectedBeatID === selectedBeatID,
      stateLabel: "selected_beat_visible",
      extra: {
        token: selectBeatInteraction.token,
        selectedBeatID,
      },
    })
  );

  const reorderInteraction = await runInspectorInteraction("move_selected_beat_to_top");
  state = await waitForDiffState(
    (next) => Array.isArray(next?.beatOrderIDs) && next.beatOrderIDs[0] === selectedBeatID,
    "selected beat moved to top",
    15000
  );
  interactionLifecycles.push(
    assertInteractionLifecycle({
      action: "move_selected_beat_to_top",
      actionReceived: reorderInteraction.actionReceived,
      payload: reorderInteraction.payload,
      stateAfter: Array.isArray(state?.beatOrderIDs) && state.beatOrderIDs[0] === selectedBeatID,
      stateLabel: "selected_beat_at_top",
      extra: {
        token: reorderInteraction.token,
        selectedBeatID,
        firstBeatID: Array.isArray(state?.beatOrderIDs) ? state.beatOrderIDs[0] : "",
      },
    })
  );

  const restoreLabel = "Restore inspector draft";
  const restoreSummary = "Track the unresolved subtext before the scene break.";
  const seedDraftInteraction = await runInspectorInteraction("seed_beat_draft", restoreLabel, restoreSummary);
  state = await waitForDiffState(
    (next) => next?.beatDraftLabel === restoreLabel && next?.beatDraftSummary === restoreSummary,
    "seeded beat draft",
    15000
  );
  interactionLifecycles.push(
    assertInteractionLifecycle({
      action: "seed_beat_draft",
      actionReceived: seedDraftInteraction.actionReceived,
      payload: seedDraftInteraction.payload,
      stateAfter: state?.beatDraftLabel === restoreLabel && state?.beatDraftSummary === restoreSummary,
      stateLabel: "beat_draft_seeded",
      extra: {
        token: seedDraftInteraction.token,
      },
    })
  );

  const restoreInteraction = await runInspectorInteraction("restore_workspace");
  state = await waitForDiffState(
    (next) => next?.rightPanelTab === "beats"
      && next?.selectedBeatID === selectedBeatID
      && Array.isArray(next?.beatOrderIDs)
      && next.beatOrderIDs[0] === selectedBeatID
      && next?.beatDraftLabel === restoreLabel
      && next?.beatDraftSummary === restoreSummary,
    "restored inspector workspace",
    15000
  );
  interactionLifecycles.push(
    assertInteractionLifecycle({
      action: "restore_workspace",
      actionReceived: restoreInteraction.actionReceived,
      payload: restoreInteraction.payload,
      stateAfter: state?.rightPanelTab === "beats"
        && state?.selectedBeatID === selectedBeatID
        && Array.isArray(state?.beatOrderIDs)
        && state.beatOrderIDs[0] === selectedBeatID
        && state?.beatDraftLabel === restoreLabel
        && state?.beatDraftSummary === restoreSummary,
      stateLabel: "workspace_restored",
      extra: {
        token: restoreInteraction.token,
      },
    })
  );

  const bytes = captureWindow(SCREENSHOT_PATH);
  const openLifecycle = assertInteractionLifecycle({
    action: "studio_open_for_inspector_restore_reorder",
    actionReceived: Boolean(openResult?.degraded) || Number(openResult?.token || 0) > 0,
    payload: { status: "handled", error: "" },
    stateAfter: Boolean(state?.rightPanelTab),
    stateLabel: "inspector_restore_ready",
    extra: {
      token: Number(openResult?.token || 0),
      degraded: openResult?.degraded === true,
      helperStatus: String(openResult?.appSession?.helperStatus || ""),
    },
  });
  console.log(JSON.stringify({
    ok: true,
    appSession: openResult?.appSession || {},
    selectedBeatID,
    rightPanelTab: state?.rightPanelTab || "",
    beatDraftLabel: state?.beatDraftLabel || "",
    beatDraftSummary: state?.beatDraftSummary || "",
    beatOrderIDs: state?.beatOrderIDs || [],
    beatOrderLabels: state?.beatOrderLabels || [],
    screenshotPath: SCREENSHOT_PATH,
    screenshotBytes: bytes,
    lifecycle: {
      open: openLifecycle,
      structuralSeed: seedLifecycle,
      interactions: interactionLifecycles,
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
