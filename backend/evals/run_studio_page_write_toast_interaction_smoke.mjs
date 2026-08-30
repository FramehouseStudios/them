import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createStudioEvalDebugContext, ensureStudioVisibleWithOpenHandshake } from "./studio_eval_debug_utils.mjs";

const studioDebugDefaultsDomains = Array.from(
  new Set([
    String(process.env.THEM_DEBUG_DEFAULTS_DOMAIN || "").trim(),
    `${process.env.HOME || ""}/Library/Preferences/io.them.them`,
    "io.them.them",
  ].filter(Boolean))
);

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

function resetStudioOpenHandshakeDefaults() {
  writeDefaultInt("studio_debug_open_token", 0);
  writeDefaultInt("studio_debug_open_ack_token", 0);
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
  return await waitForDiffState(
    (candidate) =>
      candidate?.pageWriteToastVisible === (mode !== "dismiss") &&
      candidate?.pageWriteToastCollapsed === (mode === "collapsed") &&
      String(candidate?.pageWriteToastSource || "") === source &&
      (mode === "dismiss" || String(candidate?.pageWriteToastPreview || "").includes("INT. KITCHEN - DAY")),
    `page write toast ${mode} ${source}`,
    15000
  );
}

async function runToastAction(mode, source, predicate, description) {
  const token = nextToken("studio_debug_page_write_toast_token", "studio_debug_page_write_toast_ack_token");
  writeDefaultString("studio_debug_page_write_toast_mode", mode);
  writeDefaultString("studio_debug_page_write_toast_source", source);
  writeDefaultInt("studio_debug_page_write_toast_token", token);
  await waitFor(
    () => readDefaultInt("studio_debug_page_write_toast_ack_token") === token,
    `page write toast action ack ${mode} ${token}`,
    15000,
    150
  );
  return await waitForDiffState(predicate, description, 15000);
}

async function main() {
  await ensureStudioVisible();
  let seededStructuralDraft = true;
  try {
    await seedStructuralDraft();
  } catch {
    seededStructuralDraft = false;
    await waitFor(() => readDebugDiffState() !== null, "Studio diff state after seed fallback", 5000, 250);
  }
  try {
    await setShellVisibility("hide", "hide");
  } catch {
    // Shell chrome visibility is cosmetic for this interaction smoke.
  }

  const baselineExpanded = await setPageWriteToast("expanded", "typed");
  const moreState = await runToastAction(
    "more",
    "typed",
    (state) =>
      state?.pageWriteToastVisible === true
      && state?.pageWriteToastCollapsed === false
      && String(state?.infoText || "").toLowerCase().includes("opened page-write actions menu"),
    "page-write toast more action"
  );

  await setPageWriteToast("expanded", "typed");
  const undoState = await runToastAction(
    "undo",
    "typed",
    (state) => state?.pageWriteToastVisible === false,
    "page-write toast undo action"
  );

  const baselineCollapsed = await setPageWriteToast("collapsed", "voice");
  assert(baselineCollapsed?.pageWriteToastCollapsed === true, "Failed to seed collapsed page-write toast state");

  const returnState = await runToastAction(
    "return",
    "voice",
    (state) =>
      state?.pageWriteToastVisible === true
      && state?.pageWriteToastCollapsed === false
      && String(state?.pageWriteToastSource || "") === "voice",
    "page-write toast return action"
  );

  const escapeState = await runToastAction(
    "escape",
    "voice",
    (state) => state?.pageWriteToastVisible === false,
    "page-write toast escape action"
  );

  await setPageWriteToast("dismiss", "voice");

  console.log(
    JSON.stringify(
      {
        seededStructuralDraft,
        baselineExpanded: {
          visible: baselineExpanded?.pageWriteToastVisible ?? false,
          collapsed: baselineExpanded?.pageWriteToastCollapsed ?? false,
          source: baselineExpanded?.pageWriteToastSource ?? "",
        },
        interactions: {
          more: {
            visible: moreState?.pageWriteToastVisible ?? false,
            collapsed: moreState?.pageWriteToastCollapsed ?? false,
            infoText: moreState?.infoText ?? "",
          },
          undo: {
            visible: undoState?.pageWriteToastVisible ?? false,
            collapsed: undoState?.pageWriteToastCollapsed ?? false,
          },
          returnKey: {
            visible: returnState?.pageWriteToastVisible ?? false,
            collapsed: returnState?.pageWriteToastCollapsed ?? false,
            source: returnState?.pageWriteToastSource ?? "",
          },
          escape: {
            visible: escapeState?.pageWriteToastVisible ?? false,
            collapsed: escapeState?.pageWriteToastCollapsed ?? false,
          },
        },
      },
      null,
      2
    )
  );
}

await main();
