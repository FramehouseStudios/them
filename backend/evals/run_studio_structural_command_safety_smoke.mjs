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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate, description, timeoutMs = 20000, intervalMs = 150) {
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

function osascript(lines) {
  const args = [];
  for (const line of lines) args.push("-e", line);
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

function writeDefaultString(key, value) {
  run("defaults", ["write", "io.them.them", key, "-string", String(value)]);
}

function writeDefaultInt(key, value) {
  run("defaults", ["write", "io.them.them", key, "-int", String(value)]);
}

function deleteDefaultKey(key) {
  runOptional("defaults", ["delete", "io.them.them", key]);
}

function appHasWindow() {
  const output = osascript([
    "try",
    'tell application "System Events"',
    'tell process "them"',
    'return count of windows',
    'end tell',
    'end tell',
    'on error',
    'return "0"',
    'end try',
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

async function ensureAppStopped() {
  if (!appIsRunning()) return;
  quitApp();
  await waitFor(() => !appIsRunning(), "THEM process to quit before structural smoke", 15000, 300);
}

async function ensureStudioVisible() {
  const token = Math.max(1, readDefaultInt("studio_debug_open_token"), readDefaultInt("studio_debug_open_ack_token")) + 1;
  writeDefaultInt("studio_debug_open_token", token);
  await waitFor(() => readDefaultInt("studio_debug_open_ack_token") === token, `Studio open ack ${token}`, 15000, 150);
  activateApp();
  await waitFor(() => appHasWindow(), "visible THEM window after Studio open", 20000, 250);
}

async function relaunchApp(appPath) {
  await ensureAppStopped();
  launchApp(appPath);
  await waitFor(() => appIsRunning(), "THEM process after relaunch", 20000, 300);
  activateApp();
  await ensureStudioVisible();
}

function nextToken(...keys) {
  return Math.max(1, ...keys.map((key) => readDefaultInt(key))) + 1;
}

async function focusDraftEditor() {
  const token = nextToken("studio_debug_focus_page_token", "studio_debug_focus_page_ack_token");
  writeDefaultInt("studio_debug_focus_page_token", token);
  await waitFor(() => readDefaultInt("studio_debug_focus_page_ack_token") === token, `draft editor focus ack ${token}`, 12000, 150);
  await sleep(350);
}

async function seedStructuralState() {
  const token = nextToken("studio_debug_seed_structural_token", "studio_debug_seed_structural_ack_token");
  writeDefaultInt("studio_debug_seed_structural_token", token);
  await waitFor(() => readDefaultInt("studio_debug_seed_structural_ack_token") === token, `structural seed ack ${token}`, 12000, 150);
  await sleep(250);
}

async function selectLines(startLine, endLine = startLine) {
  const token = nextToken("studio_debug_select_lines_token", "studio_debug_select_lines_ack_token");
  writeDefaultInt("studio_debug_select_lines_start", startLine);
  writeDefaultInt("studio_debug_select_lines_end", endLine);
  writeDefaultInt("studio_debug_select_lines_token", token);
  await waitFor(() => readDefaultInt("studio_debug_select_lines_ack_token") === token, `line selection ack ${token}`, 12000, 150);
  await sleep(150);
}

async function runLocalCommand(text, source = "voice") {
  const token = nextToken("studio_debug_local_command_token", "studio_debug_local_command_ack_token", "studio_debug_local_command_result_token");
  writeDefaultString("studio_debug_local_command_text", text);
  writeDefaultString("studio_debug_local_command_source", source);
  writeDefaultInt("studio_debug_local_command_token", token);
  await waitFor(
    () => readDefaultInt("studio_debug_local_command_ack_token") === token
      && readDefaultInt("studio_debug_local_command_result_token") === token,
    `local command ack ${token}`,
    20000,
    150
  );
  const raw = readDefaultString("studio_debug_local_command_result_json");
  assert(raw, `Missing local command result payload for "${text}"`);
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Failed to parse local command result JSON for "${text}": ${error.message}\n${raw}`);
  }
}

function normalizeText(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}

function expectIncludes(haystack, needle, message) {
  assert(String(haystack || "").includes(needle), `${message}\nExpected to include: ${needle}\nReceived: ${haystack}`);
}

async function runScenario(name, fn) {
  await seedStructuralState();
  await focusDraftEditor();
  return await fn();
}

function cleanupDefaults() {
  [
    "studio_debug_seed_structural_token",
    "studio_debug_seed_structural_ack_token",
    "studio_debug_select_lines_token",
    "studio_debug_select_lines_start",
    "studio_debug_select_lines_end",
    "studio_debug_select_lines_ack_token",
    "studio_debug_local_command_token",
    "studio_debug_local_command_text",
    "studio_debug_local_command_source",
    "studio_debug_local_command_ack_token",
    "studio_debug_local_command_result_token",
    "studio_debug_local_command_result_status",
    "studio_debug_local_command_result_error",
    "studio_debug_local_command_result_json",
  ].forEach(deleteDefaultKey);
}

await readHealth();
cleanupDefaults();

const appPath = findDebugAppPath();
await relaunchApp(appPath);

const scenarios = [];

scenarios.push(await runScenario("ambiguous-move-scene", async () => {
  const result = await runLocalCommand("move this scene after scene int");
  assert(result.status === "error", `Expected ambiguous move scene to error, got ${result.status}`);
  expectIncludes(result.confirmation, "multiple scenes", "Ambiguous move scene should request clarification");
  return { name: "ambiguous-move-scene", result };
}));

scenarios.push(await runScenario("move-scene-preview-confirm", async () => {
  const preview = await runLocalCommand("move this scene after scene 2");
  assert(preview.status === "handled", `Expected move scene preview to be handled, got ${preview.status}`);
  assert(preview.preview_title === "Confirm move scene", `Unexpected move scene preview title: ${preview.preview_title}`);
  assert(preview.preview_transaction_id, "Move scene preview should expose a transaction ID");
  assert(preview.preview_risk_label === "safe", `Expected move scene preview to be marked safe, got ${preview.preview_risk_label}`);
  assert(preview.preview_impacted_line_count > 0, `Expected move scene preview to report impacted lines, got ${preview.preview_impacted_line_count}`);
  assert((preview.preview_before || []).length > 0, "Move scene preview should include before lines");
  assert((preview.preview_after || []).length > 0, "Move scene preview should include after lines");
  const confirmed = await runLocalCommand("confirm");
  expectIncludes(confirmed.latest_info_text, "Moved", "Confirming move scene should mutate the draft");
  expectIncludes(confirmed.draft_preview, "INT. KITCHEN - DAY", "Moved scene draft should begin with the kitchen scene");
  return { name: "move-scene-preview-confirm", preview, confirmed };
}));

scenarios.push(await runScenario("move-selection-preview-confirm", async () => {
  await selectLines(1, 3);
  const preview = await runLocalCommand("move this selection after scene 3");
  assert(preview.preview_title === "Confirm move selection", `Unexpected move selection preview title: ${preview.preview_title}`);
  assert(preview.preview_transaction_id, "Move selection preview should expose a transaction ID");
  assert(preview.preview_risk_label === "safe", `Expected move selection preview to be marked safe, got ${preview.preview_risk_label}`);
  assert(preview.preview_impacted_line_count > 0, `Expected move selection preview to report impacted lines, got ${preview.preview_impacted_line_count}`);
  assert(preview.selection_start_line === 1 && preview.selection_end_line === 3, `Expected move selection preview to preserve the selected line range, got ${preview.selection_start_line}-${preview.selection_end_line}`);
  const confirmed = await runLocalCommand("confirm");
  expectIncludes(confirmed.latest_info_text, "Moved the selected block", "Confirming selection move should mutate the draft");
  expectIncludes(confirmed.draft_preview, "INT. KITCHEN - DAY", "Selection move should reorder the page");
  return { name: "move-selection-preview-confirm", preview, confirmed };
}));

scenarios.push(await runScenario("split-selection-into-scene", async () => {
  await selectLines(8, 8);
  const result = await runLocalCommand("split this block into a new scene");
  assert(result.status === "handled", `Expected split selection to be handled, got ${result.status}`);
  assert(result.outline_scene_count === 3, `Expected split selection to create a third outline scene, got ${result.outline_scene_count}`);
  expectIncludes(result.latest_info_text, "Split the page into", "Split selection should report the new scene creation");
  return { name: "split-selection-into-scene", result };
}));

scenarios.push(await runScenario("promote-selection-to-beat", async () => {
  await selectLines(8, 8);
  const result = await runLocalCommand("promote this selection to a beat");
  assert(result.status === "handled", `Expected promote selection to beat to be handled, got ${result.status}`);
  assert(result.outline_beat_count === 4, `Expected beat count to grow to 4, got ${result.outline_beat_count}`);
  expectIncludes(result.latest_info_text, "Promoted the selected block into beat", "Promote selection should create a beat");
  return { name: "promote-selection-to-beat", result };
}));

scenarios.push(await runScenario("delete-beat-preview-confirm", async () => {
  await selectLines(5, 8);
  const preview = await runLocalCommand("delete this beat");
  assert(preview.preview_title === "Confirm delete beat", `Unexpected delete beat preview title: ${preview.preview_title}`);
  assert(preview.preview_risk_label === "destructive", `Expected delete beat preview to be marked destructive, got ${preview.preview_risk_label}`);
  const confirmed = await runLocalCommand("confirm");
  assert(confirmed.outline_beat_count === 2, `Expected delete beat confirm to reduce beat count to 2, got ${confirmed.outline_beat_count}`);
  expectIncludes(confirmed.latest_info_text, "Deleted beat", "Delete beat confirm should report deletion");
  return { name: "delete-beat-preview-confirm", preview, confirmed };
}));

scenarios.push(await runScenario("duplicate-scene", async () => {
  const result = await runLocalCommand("duplicate this scene");
  assert(result.status === "handled", `Expected duplicate scene to be handled, got ${result.status}`);
  assert(result.outline_scene_count === 3, `Expected duplicate scene to create a third outline scene, got ${result.outline_scene_count}`);
  expectIncludes(result.latest_info_text, "Duplicated", "Duplicate scene should report duplication");
  return { name: "duplicate-scene", result };
}));

scenarios.push(await runScenario("promote-paragraph-to-dialogue", async () => {
  await selectLines(8, 8);
  const result = await runLocalCommand("promote this paragraph to dialogue");
  assert(result.status === "handled", `Expected paragraph promotion to be handled, got ${result.status}`);
  expectIncludes(result.latest_info_text, "Promoted that paragraph into dialogue", "Paragraph promotion should report dialogue conversion");
  const promotedDraft = normalizeText(`${result.draft_preview}\n${result.draft_tail_preview}`).replace(/\\n/g, "\n");
  expectIncludes(promotedDraft, "FRANK\nFrank stares at the sink.", "Dialogue promotion should insert a FRANK cue above the promoted paragraph");
  return { name: "promote-paragraph-to-dialogue", result };
}));

scenarios.push(await runScenario("demote-beat-preview-confirm", async () => {
  await selectLines(5, 8);
  const preview = await runLocalCommand("demote this beat");
  assert(preview.preview_title === "Confirm demote beat", `Unexpected demote beat preview title: ${preview.preview_title}`);
  const confirmed = await runLocalCommand("confirm");
  assert(confirmed.outline_beat_count === 3, `Expected demote beat to keep total beat count at 3, got ${confirmed.outline_beat_count}`);
  expectIncludes(confirmed.latest_info_text, "Demoted beat", "Demote beat confirm should report the beat detach");
  return { name: "demote-beat-preview-confirm", preview, confirmed };
}));

scenarios.push(await runScenario("accept-focused-rewrite-preview-confirm", async () => {
  const preview = await runLocalCommand("accept only that rewrite");
  assert(preview.preview_title === "Confirm accept rewrite", `Unexpected accept rewrite preview title: ${preview.preview_title}`);
  const confirmed = await runLocalCommand("confirm");
  expectIncludes(confirmed.latest_info_text, "Keeping only that rewrite", "Accept rewrite confirm should acknowledge the focused rewrite");
  return { name: "accept-focused-rewrite-preview-confirm", preview, confirmed };
}));

scenarios.push(await runScenario("merge-scene-preview-confirm", async () => {
  const preview = await runLocalCommand("merge this scene with the next one");
  assert(preview.preview_title === "Confirm merge scenes", `Unexpected merge scenes preview title: ${preview.preview_title}`);
  const confirmed = await runLocalCommand("confirm");
  assert(confirmed.outline_scene_count === 1, `Expected merge scene confirm to reduce outline scene count to 1, got ${confirmed.outline_scene_count}`);
  expectIncludes(confirmed.latest_info_text, "Merged", "Merge scenes confirm should report the merge");
  return { name: "merge-scene-preview-confirm", preview, confirmed };
}));

cleanupDefaults();

const result = {
  ok: true,
  appPath,
  scenarioCount: scenarios.length,
  scenarios,
};

console.log(JSON.stringify(result, null, 2));
