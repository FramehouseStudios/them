import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createStudioEvalDebugContext, ensureStudioVisibleWithOpenHandshake } from "./studio_eval_debug_utils.mjs";

const studioDebugDefaultsDomains = Array.from(
  new Set([
    String(process.env.THEM_DEBUG_DEFAULTS_DOMAIN || "").trim(),
    `${process.env.HOME || ""}/Library/Preferences/io.them.them`,
  ].filter(Boolean))
);
const PREFILL_DRAFT_LABEL = "__prefill_label__";
const PREFILL_DRAFT_SUMMARY = "__prefill_summary__";

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

function readJsonDefault(key) {
  const raw = readDefaultString(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function readDebugDiffState() {
  return readJsonDefault("studio_debug_diff_state_json");
}

function readBeatProvenanceHistory() {
  return readJsonDefault("studio.inspector.beat.provenance.history.v1") || {};
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
  let latest = null;
  await waitFor(() => {
    const state = readDebugDiffState();
    if (!state) return false;
    latest = state;
    return predicate(state);
  }, description, timeoutMs, 200);
  return latest;
}

function nextToken(...keys) {
  return debugContext.nextToken(...keys);
}

function uniqueStringList(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const ordered = [];
  for (const item of value) {
    const normalized = String(item || "").trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    ordered.push(normalized);
  }
  return ordered;
}

function normalizedBeatCount(payload = {}, fallbackState = null) {
  const orderCandidates = [
    payload?.beat_order_ids,
    payload?.beatOrderIDs,
    payload?.outline_beat_order_ids,
    payload?.outlineBeatOrderIDs,
    fallbackState?.beatOrderIDs,
    fallbackState?.beat_order_ids,
    fallbackState?.outlineBeatOrderIDs,
    fallbackState?.outline_beat_order_ids,
  ];
  for (const candidate of orderCandidates) {
    const ids = uniqueStringList(candidate);
    if (ids.length > 0) return ids.length;
  }
  const numericCandidates = [
    payload?.beat_count,
    payload?.outline_beat_count,
    payload?.beatCount,
    payload?.outlineBeatCount,
    fallbackState?.beat_count,
    fallbackState?.outline_beat_count,
    fallbackState?.beatCount,
    fallbackState?.outlineBeatCount,
  ];
  for (const candidate of numericCandidates) {
    const value = Number(candidate);
    if (Number.isFinite(value) && value >= 0) return Math.round(value);
  }
  return 0;
}

function hasNonPrefillDraft(label, summary) {
  const cleanLabel = String(label || "").trim();
  const cleanSummary = String(summary || "").trim();
  return (
    (cleanLabel.length > 0 || cleanSummary.length > 0)
    && (cleanLabel !== PREFILL_DRAFT_LABEL || cleanSummary !== PREFILL_DRAFT_SUMMARY)
  );
}

function resetStudioOpenHandshakeDefaults() {
  writeDefaultInt("studio_debug_open_token", 0);
  writeDefaultInt("studio_debug_open_ack_token", 0);
}

function resetStudioInspectorInputPathDefaults() {
  const intKeys = [
    "studio_debug_seed_structural_token",
    "studio_debug_seed_structural_ack_token",
    "studio_debug_shell_visibility_token",
    "studio_debug_shell_visibility_ack_token",
    "studio_debug_right_panel_tab_token",
    "studio_debug_right_panel_tab_ack_token",
    "studio_debug_select_lines_token",
    "studio_debug_select_lines_ack_token",
    "studio_debug_inspector_interaction_token",
    "studio_debug_inspector_interaction_ack_token",
    "studio_debug_inspector_interaction_result_token",
    "studio_debug_shortcut_token",
    "studio_debug_shortcut_ack_token",
    "studio_debug_shortcut_result_token",
    "studio_debug_local_command_token",
    "studio_debug_local_command_ack_token",
    "studio_debug_local_command_result_token",
  ];
  for (const key of intKeys) {
    writeDefaultInt(key, 0);
  }
  const stringKeys = [
    "studio_debug_inspector_interaction_action",
    "studio_debug_inspector_interaction_primary",
    "studio_debug_inspector_interaction_secondary",
    "studio_debug_local_command_text",
    "studio_debug_local_command_source",
    "studio_debug_shortcut_action",
    "studio_debug_shortcut_result_status",
    "studio_debug_shortcut_result_error",
    "studio_debug_shortcut_result_json",
    "studio_debug_local_command_result_status",
    "studio_debug_local_command_result_error",
    "studio_debug_local_command_result_json",
  ];
  for (const key of stringKeys) {
    writeDefaultString(key, "");
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

async function showInspector() {
  const token = nextToken("studio_debug_shell_visibility_token", "studio_debug_shell_visibility_ack_token");
  writeDefaultString("studio_debug_shell_visibility_sidebar", "show");
  writeDefaultString("studio_debug_shell_visibility_inspector", "show");
  writeDefaultInt("studio_debug_shell_visibility_token", token);
  await waitFor(
    () => readDefaultInt("studio_debug_shell_visibility_ack_token") === token,
    `shell visibility ack ${token}`,
    15000,
    150
  );
}

async function openRightPanelTab(tab) {
  const token = nextToken("studio_debug_right_panel_tab_token", "studio_debug_right_panel_tab_ack_token");
  writeDefaultString("studio_debug_right_panel_tab", tab);
  writeDefaultInt("studio_debug_right_panel_tab_token", token);
  await waitFor(
    () => readDefaultInt("studio_debug_right_panel_tab_ack_token") === token,
    `right panel tab ack ${token}`,
    15000,
    150
  );
  return await waitForDiffState((state) => state?.rightPanelTab === tab, `right inspector tab ${tab}`, 20000);
}

async function prepareSeededBeatsInspector() {
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await seedStructuralDraft();
      await showInspector();
      await openRightPanelTab("beats");
      return await waitForDiffState(
        (state) =>
          state?.rightPanelTab === "beats" &&
          Array.isArray(state?.beatOrderIDs) &&
          state.beatOrderIDs.length === 3 &&
          state.beatOrderIDs.includes("beat-diner") &&
          state.beatOrderIDs.includes("beat-kitchen") &&
          state.beatOrderIDs.includes("beat-kitchen-dup"),
        "seeded beats inspector baseline",
        20000
      );
    } catch (error) {
      lastError = error;
      await sleep(900);
      await ensureStudioVisible();
    }
  }
  throw lastError || new Error("Could not prepare seeded beats inspector baseline");
}

async function selectLines(startLine, endLine) {
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const token = nextToken("studio_debug_select_lines_token", "studio_debug_select_lines_ack_token");
    writeDefaultInt("studio_debug_select_lines_start", startLine);
    writeDefaultInt("studio_debug_select_lines_end", endLine);
    writeDefaultInt("studio_debug_select_lines_token", token);
    await waitFor(
      () => readDefaultInt("studio_debug_select_lines_ack_token") === token,
      `line selection ack ${token}`,
      15000,
      150
    );
    try {
      return await waitForDiffState(
        (state) => Number(state?.selectionStartLine || 0) === startLine && Number(state?.selectionEndLine || 0) === endLine,
        `line selection ${startLine}-${endLine}`,
        attempt === 1 ? 7000 : 10000
      );
    } catch (error) {
      lastError = error;
      await sleep(250);
    }
  }
  throw lastError || new Error(`Unable to select lines ${startLine}-${endLine}`);
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
  await waitFor(
    () => readDefaultInt("studio_debug_inspector_interaction_ack_token") === token,
    `inspector interaction ack ${action} ${token}`,
    15000,
    150
  );
  await waitFor(
    () => readDefaultInt("studio_debug_inspector_interaction_result_token") === token,
    `inspector interaction result ${action} ${token}`,
    15000,
    150
  );
  const payload = readJsonDefault("studio_debug_inspector_interaction_result_json") || {};
  assert(payload.status === "handled", `Inspector interaction ${action} failed: ${payload.error || payload.status || "unknown"}`);
  return payload;
}

async function runLocalCommand(text, source = "voice") {
  const token = nextToken(
    "studio_debug_local_command_token",
    "studio_debug_local_command_ack_token",
    "studio_debug_local_command_result_token"
  );
  writeDefaultString("studio_debug_local_command_text", text);
  writeDefaultString("studio_debug_local_command_source", source);
  writeDefaultInt("studio_debug_local_command_token", token);
  await waitFor(
    () => readDefaultInt("studio_debug_local_command_ack_token") === token,
    `local command ack ${token}`,
    15000,
    150
  );
  await waitFor(
    () => readDefaultInt("studio_debug_local_command_result_token") === token,
    `local command result ${token}`,
    15000,
    150
  );
  const payload = readJsonDefault("studio_debug_local_command_result_json") || {};
  assert(payload.status === "handled", `Local command failed: ${payload.error || payload.status || "unknown"}`);
  return payload;
}

async function runShortcutAction(action) {
  const token = nextToken(
    "studio_debug_shortcut_token",
    "studio_debug_shortcut_ack_token",
    "studio_debug_shortcut_result_token"
  );
  writeDefaultString("studio_debug_shortcut_action", action);
  writeDefaultInt("studio_debug_shortcut_token", token);
  await waitFor(
    () => readDefaultInt("studio_debug_shortcut_ack_token") === token,
    `shortcut action ack ${action} ${token}`,
    15000,
    150
  );
  await waitFor(
    () => readDefaultInt("studio_debug_shortcut_result_token") === token,
    `shortcut action result ${action} ${token}`,
    15000,
    150
  );
  const payload = readJsonDefault("studio_debug_shortcut_result_json") || {};
  const status = String(payload.status || "").trim();
  const error = String(payload.error || payload.result_error || "").trim();
  const unavailable = /unavailable/i.test(error);
  if (status !== "handled" && !unavailable) {
    assert(false, `Shortcut action ${action} failed: ${error || status || "unknown"}`);
  }
  return payload;
}

async function runShortcutActionWithRetries(action, beforeRetry = null, attempts = 3) {
  let payload = {};
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (attempt > 1 && typeof beforeRetry === "function") {
      await beforeRetry(attempt);
    }
    payload = await runShortcutAction(action);
    if (String(payload.status || "").trim() === "handled") return payload;
    await sleep(250);
  }
  return payload;
}

async function seedBeatDraftPrefill() {
  await runInspectorInteraction("seed_beat_draft", PREFILL_DRAFT_LABEL, PREFILL_DRAFT_SUMMARY);
  await waitForDiffState(
    (state) =>
      String(state?.beatDraftLabel || "").trim() === PREFILL_DRAFT_LABEL &&
      String(state?.beatDraftSummary || "").trim() === PREFILL_DRAFT_SUMMARY,
    "prefilled beat draft",
    15000
  );
}

async function runKeyboardMakeBeatFromSelectionCase() {
  const baselineState = await prepareSeededBeatsInspector();
  const baselineBeatCount = normalizedBeatCount(baselineState, baselineState);
  await seedBeatDraftPrefill();
  const selection = await selectLines(1, 3);
  assert(
    Number(selection?.selectionStartLine || 0) === 1 && Number(selection?.selectionEndLine || 0) === 3,
    "Expected keyboard make case to establish selection 1-3"
  );
  let shortcutPayload = await runShortcutActionWithRetries(
    "option_command_b",
    async () => {
      await showInspector();
      await openRightPanelTab("beats");
      await seedBeatDraftPrefill();
      await selectLines(1, 3);
    }
  );
  let state = readDebugDiffState() || {};
  let beatCount = normalizedBeatCount(shortcutPayload, state);
  let beatDraftLabel = String(shortcutPayload.beat_draft_label || "").trim();
  let beatDraftSummary = String(shortcutPayload.beat_draft_summary || "").trim();
  let createdDirectly = beatCount > baselineBeatCount;
  let loadedDraft = hasNonPrefillDraft(beatDraftLabel, beatDraftSummary);
  if (String(shortcutPayload.status || "") !== "handled" || (!createdDirectly && !loadedDraft)) {
    await sleep(250);
    shortcutPayload = await runShortcutActionWithRetries(
      "option_command_b",
      async () => {
        await showInspector();
        await openRightPanelTab("beats");
        await seedBeatDraftPrefill();
        await selectLines(1, 3);
      }
    );
    state = readDebugDiffState() || {};
    beatCount = normalizedBeatCount(shortcutPayload, state);
    beatDraftLabel = String(shortcutPayload.beat_draft_label || "").trim();
    beatDraftSummary = String(shortcutPayload.beat_draft_summary || "").trim();
    createdDirectly = beatCount > baselineBeatCount;
    loadedDraft = hasNonPrefillDraft(beatDraftLabel, beatDraftSummary);
  }
  assert(
    String(shortcutPayload.status || "") === "handled",
    `Expected keyboard make shortcut to be handled, got ${shortcutPayload.status || "<missing>"} (${shortcutPayload.error || "no error"})`
  );
  assert(
    createdDirectly || loadedDraft,
    `Expected keyboard make shortcut to create beat or load composer draft, got ${JSON.stringify(shortcutPayload)}`
  );
  if (createdDirectly) {
  } else {
    assert(
      beatCount === baselineBeatCount,
      `Expected keyboard make draft-load path to keep beat count at baseline ${baselineBeatCount}, got ${beatCount}`
    );
  }
  return {
    commandStatus: shortcutPayload.status || "",
    mode: createdDirectly ? "created" : "loaded_draft",
    baselineBeatCount,
    beatCount,
    selectedBeatID: String(shortcutPayload.selected_beat_id || state?.selectedBeatID || ""),
    selectedBeatProvenance: String(shortcutPayload.selected_beat_provenance || state?.selectedBeatProvenance || ""),
    beatDraftLabel,
    beatDraftSummary,
    selectionStartLine: Number(shortcutPayload.selection_start_line || state?.selectionStartLine || 0),
    selectionEndLine: Number(shortcutPayload.selection_end_line || state?.selectionEndLine || 0),
  };
}

async function runKeyboardUpdateSelectedBeatCase() {
  const baselineState = await prepareSeededBeatsInspector();
  const baselineBeatCount = normalizedBeatCount(baselineState, baselineState);
  await runInspectorInteraction("select_beat", "beat-diner");
  await seedBeatDraftPrefill();
  const before = await waitForDiffState(
    (state) => state?.selectedBeatID === "beat-diner",
    "selected beat before keyboard update",
    15000
  );
  const selection = await selectLines(1, 3);
  assert(
    Number(selection?.selectionStartLine || 0) === 1 && Number(selection?.selectionEndLine || 0) === 3,
    "Expected keyboard update case to establish selection 1-3"
  );
  let shortcutPayload = await runShortcutActionWithRetries(
    "option_command_u",
    async () => {
      await showInspector();
      await openRightPanelTab("beats");
      await runInspectorInteraction("select_beat", "beat-diner");
      await seedBeatDraftPrefill();
      await selectLines(1, 3);
    }
  );
  const beforeSummary = String(before?.selectedBeatSummary || "").trim();
  let afterSummary = String(shortcutPayload.selected_beat_summary || "").trim();
  let beatDraftLabel = String(shortcutPayload.beat_draft_label || "").trim();
  let beatDraftSummary = String(shortcutPayload.beat_draft_summary || "").trim();
  let state = readDebugDiffState() || {};
  let beatCount = normalizedBeatCount(shortcutPayload, state);
  let appliedDirectly = afterSummary.length > 0 && afterSummary !== beforeSummary;
  let loadedDraft = hasNonPrefillDraft(beatDraftLabel, beatDraftSummary);
  if (String(shortcutPayload.status || "") !== "handled" || (!appliedDirectly && !loadedDraft)) {
    await sleep(250);
    shortcutPayload = await runShortcutActionWithRetries(
      "option_command_u",
      async () => {
        await showInspector();
        await openRightPanelTab("beats");
        await runInspectorInteraction("select_beat", "beat-diner");
        await seedBeatDraftPrefill();
        await selectLines(1, 3);
      }
    );
    afterSummary = String(shortcutPayload.selected_beat_summary || "").trim();
    beatDraftLabel = String(shortcutPayload.beat_draft_label || "").trim();
    beatDraftSummary = String(shortcutPayload.beat_draft_summary || "").trim();
    state = readDebugDiffState() || {};
    beatCount = normalizedBeatCount(shortcutPayload, state);
    appliedDirectly = afterSummary.length > 0 && afterSummary !== beforeSummary;
    loadedDraft = hasNonPrefillDraft(beatDraftLabel, beatDraftSummary);
  }
  assert(
    String(shortcutPayload.status || "") === "handled",
    `Expected keyboard update shortcut to be handled, got ${shortcutPayload.status || "<missing>"} (${shortcutPayload.error || "no error"})`
  );
  assert(
    appliedDirectly || loadedDraft,
    `Expected keyboard update shortcut to update beat or load composer draft, got ${JSON.stringify(shortcutPayload)}`
  );
  if (appliedDirectly) {
    assert(
      String(shortcutPayload.selected_beat_provenance || "") === "manual",
      `Expected keyboard update to preserve selected beat provenance manual, got ${shortcutPayload.selected_beat_provenance || "<missing>"}`
    );
  }
  assert(
    beatCount >= baselineBeatCount,
    `Expected keyboard update flow to stay at or above baseline beat count ${baselineBeatCount}, got ${beatCount}`
  );
  return {
    commandStatus: shortcutPayload.status || "",
    mode: appliedDirectly ? "updated" : "loaded_draft",
    baselineBeatCount,
    beatCount,
    beforeSummary,
    afterSummary,
    beatDraftSummary,
    selectedBeatProvenance: String(shortcutPayload.selected_beat_provenance || ""),
  };
}

async function runVoiceMakeBeatFromSelectionCase() {
  const baselineState = await prepareSeededBeatsInspector();
  const baselineBeatCount = normalizedBeatCount(baselineState, baselineState);
  await seedBeatDraftPrefill();
  const selection = await selectLines(1, 3);
  assert(
    Number(selection?.selectionStartLine || 0) === 1 && Number(selection?.selectionEndLine || 0) === 3,
    "Expected voice make case to establish selection 1-3"
  );
  let payload = await runLocalCommand("make beat from selection", "voice");
  let state = readDebugDiffState() || {};
  let beatCount = normalizedBeatCount(payload, state);
  let beatDraftLabel = String(payload.beat_draft_label || "").trim();
  let beatDraftSummary = String(payload.beat_draft_summary || "").trim();
  let createdDirectly = beatCount > baselineBeatCount;
  let loadedDraft = hasNonPrefillDraft(beatDraftLabel, beatDraftSummary);
  if (!createdDirectly && !loadedDraft) {
    await sleep(250);
    payload = await runLocalCommand("make beat from selection", "voice");
    state = readDebugDiffState() || {};
    beatCount = normalizedBeatCount(payload, state);
    beatDraftLabel = String(payload.beat_draft_label || "").trim();
    beatDraftSummary = String(payload.beat_draft_summary || "").trim();
    createdDirectly = beatCount > baselineBeatCount;
    loadedDraft = hasNonPrefillDraft(beatDraftLabel, beatDraftSummary);
  }
  assert(
    createdDirectly || loadedDraft,
    `Expected voice make command to create beat or load composer draft, got ${JSON.stringify(payload)}`
  );
  if (createdDirectly) {
  } else {
    assert(
      beatCount === baselineBeatCount,
      `Expected voice make draft-load path to keep beat count at baseline ${baselineBeatCount}, got ${beatCount}`
    );
  }
  return {
    commandStatus: payload.status || "",
    mode: createdDirectly ? "created" : "loaded_draft",
    confirmation: payload.confirmation || "",
    baselineBeatCount,
    beatCount,
    selectedBeatID: String(payload.selected_beat_id || ""),
    selectedBeatProvenance: String(payload.selected_beat_provenance || ""),
    beatDraftSummary,
  };
}

async function runVoiceUpdateSelectedBeatCase() {
  const baselineState = await prepareSeededBeatsInspector();
  const baselineBeatCount = normalizedBeatCount(baselineState, baselineState);
  await runInspectorInteraction("select_beat", "beat-diner");
  await seedBeatDraftPrefill();
  const before = await waitForDiffState(
    (state) => state?.selectedBeatID === "beat-diner",
    "selected beat before voice update",
    15000
  );
  const selection = await selectLines(1, 3);
  assert(
    Number(selection?.selectionStartLine || 0) === 1 && Number(selection?.selectionEndLine || 0) === 3,
    "Expected voice update case to establish selection 1-3"
  );
  let payload = await runLocalCommand("update selected beat from selection", "voice");
  const beforeSummary = String(before?.selectedBeatSummary || "").trim();
  let afterSummary = String(payload.selected_beat_summary || "").trim();
  let beatDraftLabel = String(payload.beat_draft_label || "").trim();
  let beatDraftSummary = String(payload.beat_draft_summary || "").trim();
  let state = readDebugDiffState() || {};
  let beatCount = normalizedBeatCount(payload, state);
  let appliedDirectly = afterSummary.length > 0 && afterSummary !== beforeSummary;
  let loadedDraft = hasNonPrefillDraft(beatDraftLabel, beatDraftSummary);
  if (!appliedDirectly && !loadedDraft) {
    await sleep(250);
    payload = await runLocalCommand("update selected beat from selection", "voice");
    afterSummary = String(payload.selected_beat_summary || "").trim();
    beatDraftLabel = String(payload.beat_draft_label || "").trim();
    beatDraftSummary = String(payload.beat_draft_summary || "").trim();
    state = readDebugDiffState() || {};
    beatCount = normalizedBeatCount(payload, state);
    appliedDirectly = afterSummary.length > 0 && afterSummary !== beforeSummary;
    loadedDraft = hasNonPrefillDraft(beatDraftLabel, beatDraftSummary);
  }
  assert(
    appliedDirectly || loadedDraft,
    `Expected voice update command to update beat or load composer draft, got ${JSON.stringify(payload)}`
  );
  if (appliedDirectly) {
    assert(
      String(payload.selected_beat_provenance || "") === "manual",
      `Expected voice update to preserve selected beat provenance manual, got ${payload.selected_beat_provenance || "<missing>"}`
    );
  }
  assert(
    beatCount >= baselineBeatCount,
    `Expected voice update flow to stay at or above baseline beat count ${baselineBeatCount}, got ${beatCount}`
  );
  return {
    commandStatus: payload.status || "",
    mode: appliedDirectly ? "updated" : "loaded_draft",
    confirmation: payload.confirmation || "",
    baselineBeatCount,
    beatCount,
    beforeSummary,
    afterSummary,
    beatDraftSummary,
    selectedBeatProvenance: String(payload.selected_beat_provenance || ""),
  };
}

async function runBeatProvenanceHistoryCase() {
  await prepareSeededBeatsInspector();
  await runInspectorInteraction("select_beat", "beat-diner");
  const selection = await selectLines(1, 3);
  assert(
    Number(selection?.selectionStartLine || 0) === 1 && Number(selection?.selectionEndLine || 0) === 3,
    "Expected provenance case to establish selection 1-3"
  );
  await runInspectorInteraction("update_selected_beat_from_selection", "beat-diner");
  const history = readBeatProvenanceHistory();
  const projectHistory = history?.["debug-structural"] || {};
  const beatHistory = projectHistory?.["beat-diner"] || {};
  const createdFrom = String(beatHistory.createdFromRaw || "");
  const lastRefreshedFrom = String(beatHistory.lastRefreshedFromRaw || "");
  const createdAt = Number(beatHistory.createdAt || 0);
  const lastRefreshedAt = Number(beatHistory.lastRefreshedAt || 0);
  assert(
    createdFrom.length > 0 || lastRefreshedFrom.length > 0,
    `Expected beat provenance history for beat-diner, got ${JSON.stringify(beatHistory)}`
  );
  assert(lastRefreshedFrom === "selection", `Expected last refreshed source selection, got ${lastRefreshedFrom || "<missing>"}`);
  assert(lastRefreshedAt > 0, "Expected last refreshed timestamp for beat-diner provenance history");
  return {
    createdFrom: createdFrom || "<missing>",
    lastRefreshedFrom,
    createdAt,
    lastRefreshedAt,
  };
}

async function main() {
  await ensureStudioVisible();

  const keyboardMake = await runKeyboardMakeBeatFromSelectionCase();
  const keyboardUpdate = await runKeyboardUpdateSelectedBeatCase();
  const voiceMake = await runVoiceMakeBeatFromSelectionCase();
  const voiceUpdate = await runVoiceUpdateSelectedBeatCase();
  const beatProvenanceHistory = await runBeatProvenanceHistoryCase();

  console.log(
    JSON.stringify(
      {
        keyboard: {
          optionCommandB: keyboardMake,
          optionCommandU: keyboardUpdate,
        },
        voice: {
          makeBeatFromSelection: voiceMake,
          updateSelectedBeatFromSelection: voiceUpdate,
        },
        beatProvenanceHistory,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
