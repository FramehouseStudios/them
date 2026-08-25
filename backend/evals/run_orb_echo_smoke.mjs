import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import {
  cleanupStudioEvalSessionsWithHelper,
  createStudioOwnedAppController,
  relaunchStudioAppWithHelper,
} from "./studio_eval_debug_utils.mjs";

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
  if ((result.status ?? 1) !== 0) {
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

function appIsRunning() {
  return ownedApp.isRunning();
}

function appHasWindow() {
  return ownedApp.hasWindow();
}

function launchApp(appPath) {
  const appSession = relaunchStudioAppWithHelper({ appPath, runOptional });
  ownedApp.bindSession(appPath, appSession);
  return appSession;
}

function activateApp(appPath = "", appSession = null) {
  ownedApp.activate(appPath, appSession);
}

function quitApp() {
  cleanupStudioEvalSessionsWithHelper({ runOptional });
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
  run("defaults", ["write", "io.them.them", key, String(value)]);
}

function writeDefaultInt(key, value) {
  run("defaults", ["write", "io.them.them", key, "-int", String(value)]);
}

function readEchoDebugState() {
  return {
    ackToken: readDefaultInt("orb_echo_debug_ack_token"),
    stage: readDefaultString("orb_echo_debug_stage"),
    opacity: Number(readDefaultString("orb_echo_debug_opacity") || "0"),
    userAck: readDefaultString("orb_echo_debug_user_ack"),
    assistantAck: readDefaultString("orb_echo_debug_assistant_ack"),
    visible: readDefaultString("orb_echo_debug_visible"),
    updatedAt: Number(readDefaultString("orb_echo_debug_updated_at") || "0"),
  };
}

const appPath = findDebugAppPath();
const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const userText = `orb echo user ${stamp}`;
const assistantText = `orb echo assistant ${stamp}`;
const showToken = Math.max(
  readDefaultInt("orb_echo_debug_show_token"),
  readDefaultInt("orb_echo_debug_ack_token")
) + 1;
const hideToken = showToken + 1;

quitApp();
const appSession = launchApp(appPath);
await waitFor(() => appIsRunning(), "THEM process after launch", 20000, 300);
await waitFor(() => appHasWindow(), "visible THEM window", 20000, 300);
activateApp(appPath, appSession);
await sleep(800);

writeDefaultString("orb_echo_debug_user_text", userText);
writeDefaultString("orb_echo_debug_assistant_text", assistantText);
writeDefaultInt("orb_echo_debug_show_token", showToken);

await waitFor(() => {
  const state = readEchoDebugState();
  return (
    state.ackToken === showToken &&
    state.stage === "shown" &&
    state.opacity >= 0.95 &&
    state.userAck === userText &&
    state.assistantAck === assistantText &&
    state.visible === "1"
  );
}, "orb echo fade-in after reply", 15000, 200);

const shownState = readEchoDebugState();

writeDefaultInt("orb_echo_debug_hide_token", hideToken);

await waitFor(() => {
  const state = readEchoDebugState();
  return (
    state.ackToken === hideToken &&
    (state.stage === "hiding" || state.stage === "hidden") &&
    state.opacity <= 0.05 &&
    state.visible === "0"
  );
}, "orb echo immediate fade-out on next turn", 12000, 150);

await waitFor(() => {
  const state = readEchoDebugState();
  return (
    state.ackToken === hideToken &&
    state.stage === "hidden" &&
    state.opacity <= 0.001 &&
    state.userAck === "" &&
    state.assistantAck === ""
  );
}, "orb echo cleared after fade-out", 12000, 150);

const hiddenState = readEchoDebugState();

quitApp();

console.log(JSON.stringify({
  ok: true,
  appPath,
  showToken,
  hideToken,
  fadeIn: {
    stage: shownState.stage,
    opacity: shownState.opacity,
    visible: shownState.visible,
  },
  fadeOut: {
    stage: hiddenState.stage,
    opacity: hiddenState.opacity,
    visible: hiddenState.visible,
  },
}, null, 2));
