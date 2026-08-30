import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import {
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

async function waitFor(predicate, description, timeoutMs = 10000, intervalMs = 150) {
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

function appHasWindow() {
  return ownedApp.hasWindow();
}

function activateApp(appPath = "", appSession = null) {
  ownedApp.activate(appPath, appSession);
}

function appIsRunning() {
  return ownedApp.isRunning();
}

function launchApp(appPath) {
  const appSession = relaunchStudioAppWithHelper({ appPath, runOptional });
  ownedApp.bindSession(appPath, appSession);
  return appSession;
}

function writeDefaultString(key, value) {
  run("defaults", ["write", "io.them.them", key, "-string", String(value)]);
}

function writeDefaultInt(key, value) {
  run("defaults", ["write", "io.them.them", key, "-int", String(value)]);
}

function readDefaultString(key) {
  const result = runOptional("defaults", ["read", "io.them.them", key]);
  return result.status === 0 ? result.stdout.trim() : "";
}

let debugTokenCounter = Math.max(
  1,
  Number(readDefaultString("studio_debug_open_token")) || 0,
  Number(readDefaultString("studio_debug_focus_page_token")) || 0
);

function nextDebugToken() {
  debugTokenCounter += 1;
  return debugTokenCounter;
}

async function waitForStudioOpenAck(token) {
  await waitFor(() => Number(readDefaultString("studio_debug_open_ack_token")) === token, `Studio open ack ${token}`, 15000, 150);
}

async function ensureStudioVisible(appPath = "", appSession = null) {
  activateApp(appPath, appSession);
  await waitFor(() => appHasWindow(), "visible THEM window", 20000, 250);
  const token = nextDebugToken();
  writeDefaultInt("studio_debug_open_token", token);
  await waitForStudioOpenAck(token);
  await sleep(900);
  activateApp();
}

async function focusDraftEditor() {
  const token = nextDebugToken();
  writeDefaultInt("studio_debug_focus_page_token", token);
  await waitFor(() => Number(readDefaultString("studio_debug_focus_page_ack_token")) === token, `draft editor focus ack ${token}`, 10000, 150);
  await sleep(450);
}

function activeElementRaw() {
  return readDefaultString("studio_debug_active_screenplay_element_raw") || readDefaultString("studio_active_screenplay_element_v1");
}

function activeElementLabel() {
  const debugLabel = readDefaultString("studio_debug_active_screenplay_element_label");
  if (debugLabel) return debugLabel;
  const raw = activeElementRaw();
  const titles = {
    sceneHeading: "Scene Heading",
    action: "Action",
    character: "Character",
    dialogue: "Dialogue",
    parenthetical: "Parenthetical",
    transition: "Transition",
  };
  return titles[raw] || raw;
}

async function waitForActiveElement(expectedRaw, expectedLabel) {
  await waitFor(() => activeElementRaw() === expectedRaw && activeElementLabel() === expectedLabel, `active element ${expectedLabel}`, 5000, 120);
}

function sendCommandNumber(number) {
  ownedApp.runProcessAppleScript([
    'delay 0.15',
    'delay 0.05',
    `keystroke "${number}" using {command down}`,
  ]);
}

function sendTab(backward = false) {
  const modifiers = backward ? ' using {shift down}' : '';
  ownedApp.runProcessAppleScript([
    'delay 0.15',
    'delay 0.05',
    `key code 48${modifiers}`,
  ]);
}

async function pressAndAssert(step) {
  if (step.kind === 'command') {
    sendCommandNumber(step.key);
  } else if (step.kind === 'tab') {
    sendTab(false);
  } else {
    sendTab(true);
  }

  try {
    await waitForActiveElement(step.expectedRaw, step.expectedLabel);
  } catch (error) {
    await focusDraftEditor();
    if (step.kind === 'command') {
      sendCommandNumber(step.key);
    } else if (step.kind === 'tab') {
      sendTab(false);
    } else {
      sendTab(true);
    }
    await waitForActiveElement(step.expectedRaw, step.expectedLabel);
  }

  return {
    step: step.name,
    raw: activeElementRaw(),
    label: activeElementLabel(),
  };
}

const appPath = findDebugAppPath();
const appSession = launchApp(appPath);
await waitFor(() => appIsRunning(), "helper-owned THEM process after launch", 20000, 250);
activateApp(appPath, appSession);
await sleep(2200);

await ensureStudioVisible(appPath);
await focusDraftEditor();

const steps = [
  { name: 'Cmd+1', kind: 'command', key: '1', expectedRaw: 'sceneHeading', expectedLabel: 'Scene Heading' },
  { name: 'Cmd+2', kind: 'command', key: '2', expectedRaw: 'action', expectedLabel: 'Action' },
  { name: 'Cmd+3', kind: 'command', key: '3', expectedRaw: 'character', expectedLabel: 'Character' },
  { name: 'Cmd+4', kind: 'command', key: '4', expectedRaw: 'dialogue', expectedLabel: 'Dialogue' },
  { name: 'Cmd+5', kind: 'command', key: '5', expectedRaw: 'parenthetical', expectedLabel: 'Parenthetical' },
  { name: 'Cmd+6', kind: 'command', key: '6', expectedRaw: 'transition', expectedLabel: 'Transition' },
  { name: 'Tab', kind: 'tab', expectedRaw: 'sceneHeading', expectedLabel: 'Scene Heading' },
  { name: 'Shift+Tab', kind: 'backtab', expectedRaw: 'transition', expectedLabel: 'Transition' },
];

const observed = [];
for (const step of steps) {
  observed.push(await pressAndAssert(step));
}

const result = {
  ok: true,
  appPath,
  observed,
  finalActiveElementRaw: activeElementRaw(),
  finalActiveElementLabel: activeElementLabel(),
};

console.log(JSON.stringify(result, null, 2));
console.log(`__STUDIO_SCREENPLAY_SHORTCUTS_RESULT__ ${JSON.stringify(result)}`);
console.log('studio-screenplay-shortcuts-smoke: ok');
