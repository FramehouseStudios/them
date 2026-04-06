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
  await waitFor(() => !appIsRunning(), "THEM process to quit before fixer queue smoke", 15000, 300);
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

async function runQueueAction(action, itemID = "") {
  const token = nextToken(
    "studio_debug_intelligence_queue_token",
    "studio_debug_intelligence_queue_ack_token",
    "studio_debug_intelligence_queue_result_token"
  );
  writeDefaultString("studio_debug_intelligence_queue_action", action);
  writeDefaultString("studio_debug_intelligence_queue_item_id", itemID);
  writeDefaultInt("studio_debug_intelligence_queue_token", token);
  await waitFor(
    () => readDefaultInt("studio_debug_intelligence_queue_ack_token") === token
      && readDefaultInt("studio_debug_intelligence_queue_result_token") === token,
    `intelligence queue ack ${token}`,
    20000,
    150
  );
  const raw = readDefaultString("studio_debug_intelligence_queue_result_json");
  assert(raw, `Missing intelligence queue result payload for ${action}`);
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Failed to parse intelligence queue result JSON for ${action}: ${error.message}\n${raw}`);
  }
}

function cleanupDefaults() {
  [
    "studio_debug_seed_structural_token",
    "studio_debug_seed_structural_ack_token",
    "studio_debug_focus_page_token",
    "studio_debug_focus_page_ack_token",
    "studio_debug_intelligence_queue_token",
    "studio_debug_intelligence_queue_action",
    "studio_debug_intelligence_queue_item_id",
    "studio_debug_intelligence_queue_ack_token",
    "studio_debug_intelligence_queue_result_token",
    "studio_debug_intelligence_queue_result_status",
    "studio_debug_intelligence_queue_result_error",
    "studio_debug_intelligence_queue_result_json",
  ].forEach(deleteDefaultKey);
}

await readHealth();
cleanupDefaults();

const appPath = findDebugAppPath();
await relaunchApp(appPath);
await seedStructuralState();
await focusDraftEditor();

const previewAll = await runQueueAction("preview_all");
assert(previewAll.status === "handled", `Expected preview_all to be handled, got ${previewAll.status}`);
assert(previewAll.queue_count > 0, `Expected preview_all to queue fixes, got ${previewAll.queue_count}`);
assert((previewAll.queued_titles || []).length === previewAll.queue_count, "Expected queued titles to match queued count");
assert(previewAll.safe_queue_count > 0, `Expected at least one safe queued fix, got ${previewAll.safe_queue_count}`);

const applyAllSafe = await runQueueAction("apply_all_safe");
assert(applyAllSafe.status === "handled", `Expected apply_all_safe to be handled, got ${applyAllSafe.status}`);
assert(applyAllSafe.affected_fix_count > 0, `Expected apply_all_safe to affect fixes, got ${applyAllSafe.affected_fix_count}`);
assert(applyAllSafe.last_batch_id, "Expected apply_all_safe to create a rollback batch");

const rollback = await runQueueAction("rollback_last_batch");
assert(rollback.status === "handled", `Expected rollback_last_batch to be handled, got ${rollback.status}`);
assert(rollback.affected_fix_count === applyAllSafe.affected_fix_count, `Expected rollback to restore ${applyAllSafe.affected_fix_count} fixes, got ${rollback.affected_fix_count}`);
assert(rollback.queue_count === previewAll.queue_count, `Expected rollback to restore queue count ${previewAll.queue_count}, got ${rollback.queue_count}`);

const applyOneID = (rollback.queued_safe_ids || [])[0] || (rollback.queued_ids || [])[0];
assert(applyOneID, "Expected rollback payload to expose at least one queued fix ID");
const applyOne = await runQueueAction("apply_one", applyOneID);
assert(applyOne.status === "handled", `Expected apply_one to be handled, got ${applyOne.status}`);
assert(applyOne.affected_fix_count === 1, `Expected apply_one to affect exactly one fix, got ${applyOne.affected_fix_count}`);
assert(applyOne.last_batch_id, "Expected apply_one to create a rollback batch");

cleanupDefaults();

console.log(JSON.stringify({
  ok: true,
  appPath,
  previewAll,
  applyAllSafe,
  rollback,
  applyOne,
}, null, 2));
