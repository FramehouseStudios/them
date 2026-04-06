import { spawnSync } from "node:child_process";

export function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    ...options,
  });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `${command} failed`).trim());
  }
  return (result.stdout || "").trim();
}

export function runOptionalCommand(command, args, options = {}) {
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

export function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForCondition(predicate, description, timeoutMs = 20000, intervalMs = 250) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return true;
    await sleepMs(intervalMs);
  }
  throw new Error(`Timed out waiting for ${description}`);
}

function defaultDebugDomains() {
  const home = String(process.env.HOME || "").trim();
  return Array.from(
    new Set(
      [
        String(process.env.THEM_DEBUG_DEFAULTS_DOMAIN || "").trim(),
        home ? `${home}/Library/Containers/io.them.them/Data/Library/Preferences/io.them.them` : "",
        home ? `${home}/Library/Preferences/io.them.them` : "",
        "io.them.them",
      ].filter(Boolean)
    )
  );
}

export function createStudioDebugDefaultsTransport({
  run = runCommand,
  runOptional = runOptionalCommand,
  domains = [],
} = {}) {
  const debugDomains = Array.from(new Set([...domains.filter(Boolean), ...defaultDebugDomains()]));

  function readString(key) {
    for (const domain of debugDomains) {
      const result = runOptional("defaults", ["read", domain, key]);
      if (result.status === 0) return result.stdout.trim();
    }
    return "";
  }

  function readInt(key) {
    const value = Number(readString(key));
    return Number.isFinite(value) ? value : 0;
  }

  function readBool(key, fallback = false) {
    const raw = String(readString(key)).trim().toLowerCase();
    if (!raw) return fallback;
    return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
  }

  function readJSON(key, fallback = null) {
    const raw = readString(key);
    if (!raw) return fallback;
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function writeKey(key, args) {
    let wrote = false;
    let lastError = "";
    for (const domain of debugDomains) {
      const result = runOptional("defaults", ["write", domain, key, ...args]);
      if (result.status === 0) {
        wrote = true;
      } else {
        lastError = result.stderr || result.stdout || lastError;
      }
    }
    if (!wrote) {
      throw new Error(`Unable to write defaults key ${key}: ${lastError || "unknown defaults write failure"}`);
    }
  }

  function writeString(key, value) {
    writeKey(key, ["-string", String(value)]);
  }

  function writeInt(key, value) {
    writeKey(key, ["-int", String(value)]);
  }

  function writeBool(key, value) {
    writeKey(key, ["-bool", value ? "true" : "false"]);
  }

  function nextToken(...keys) {
    return Math.max(1, ...keys.map((key) => readInt(key))) + 1;
  }

  return {
    domains: debugDomains,
    readString,
    readInt,
    readBool,
    readJSON,
    writeString,
    writeInt,
    writeBool,
    nextToken,
  };
}

export function createStudioEvalDebugContext({
  run = runCommand,
  runOptional = runOptionalCommand,
  domains = [],
} = {}) {
  const defaults = createStudioDebugDefaultsTransport({ run, runOptional, domains });
  return {
    defaults,
    readDefaultString: defaults.readString,
    readDefaultInt: defaults.readInt,
    readDefaultBool: defaults.readBool,
    writeDefaultString: defaults.writeString,
    writeDefaultInt: defaults.writeInt,
    writeDefaultBool: defaults.writeBool,
    readJsonDefault: (key, fallback = null) => defaults.readJSON(key, fallback),
    readDebugDiffState: (fallback = null) => defaults.readJSON("studio_debug_diff_state_json", fallback),
    nextToken: (...keys) => defaults.nextToken(...keys),
  };
}

export function parseBoolFlag(raw) {
  const normalized = String(raw || "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

export function parsePidList(raw) {
  return String(raw || "")
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value > 0);
}

export function defaultStudioSessionTelemetry() {
  return {
    stalePidSet: [],
    relaunchedPidSet: [],
    reusedExistingSession: false,
    lastTeardownStage: "not_started",
    freshPid: 0,
    hadExistingSession: false,
    sessionMode: "unknown",
    helperStatus: "not_run",
    helperError: "",
  };
}

export function parseStudioAppSessionHelperOutput(stdout = "") {
  const telemetry = defaultStudioSessionTelemetry();
  for (const line of String(stdout || "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    switch (key) {
      case "OK":
        telemetry.helperStatus = parseBoolFlag(value) ? "ok" : "error";
        break;
      case "STALE_PIDS":
        telemetry.stalePidSet = parsePidList(value);
        telemetry.hadExistingSession = telemetry.stalePidSet.length > 0;
        break;
      case "RELAUNCHED_PIDS":
        telemetry.relaunchedPidSet = parsePidList(value);
        break;
      case "REUSED_EXISTING_SESSION":
        telemetry.reusedExistingSession = parseBoolFlag(value);
        break;
      case "LAST_TEARDOWN_STAGE":
        telemetry.lastTeardownStage = value || telemetry.lastTeardownStage;
        break;
      case "FRESH_PID": {
        const parsed = Number(value);
        telemetry.freshPid = Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
        break;
      }
      case "HAD_EXISTING_SESSION":
        telemetry.hadExistingSession = parseBoolFlag(value);
        break;
      case "SESSION_MODE":
        telemetry.sessionMode = value || telemetry.sessionMode;
        break;
      case "ERROR_MESSAGE":
        telemetry.helperError = value;
        break;
      default:
        break;
    }
  }
  return telemetry;
}

export function relaunchStudioAppWithHelper({
  helperPath,
  appPath,
  timeoutSeconds = 20,
  pollMillis = 250,
  runOptional = runOptionalCommand,
}) {
  const result = runOptional("/bin/bash", [helperPath, "--app-path", appPath], {
    env: {
      ...process.env,
      STUDIO_APP_SESSION_HELPER_TIMEOUT_SECONDS: String(timeoutSeconds),
      STUDIO_APP_SESSION_HELPER_POLL_MILLIS: String(pollMillis),
    },
  });
  const telemetry = parseStudioAppSessionHelperOutput(result.stdout);
  if (result.status !== 0 || telemetry.helperStatus !== "ok") {
    throw new Error(
      `Studio app relaunch helper failed: ${telemetry.helperError || result.stderr || result.stdout || "unknown helper failure"}\n`
      + JSON.stringify(telemetry, null, 2)
    );
  }
  return telemetry;
}

export async function ensureStudioVisibleWithOpenHandshake({
  appPath,
  debugDefaults,
  runOptional = runOptionalCommand,
  activateApp = () => {},
  appHasWindow = () => false,
  readDebugDiffState = () => null,
  helperPath = "",
  timeoutSeconds = Number(process.env.STUDIO_APP_SESSION_TIMEOUT_SECONDS || 20),
  pollMillis = Number(process.env.STUDIO_APP_SESSION_POLL_MILLIS || 250),
  openTokenKey = "studio_debug_open_token",
  openAckTokenKey = "studio_debug_open_ack_token",
  maxAttempts = 4,
  startupTimeoutMs = 20000,
  ackTimeoutMs = 15000,
  settleMs = 1200,
} = {}) {
  if (!appPath) {
    throw new Error("ensureStudioVisibleWithOpenHandshake requires appPath");
  }
  if (!debugDefaults) {
    throw new Error("ensureStudioVisibleWithOpenHandshake requires debugDefaults");
  }

  let appSession = defaultStudioSessionTelemetry();
  const resolvedHelperPath = String(helperPath || "").trim() || `${process.cwd()}/evals/studio_app_session_helper.sh`;
  try {
    appSession = relaunchStudioAppWithHelper({
      helperPath: resolvedHelperPath,
      appPath,
      timeoutSeconds,
      pollMillis,
      runOptional,
    });
  } catch (error) {
    // Fall back to a local reopen flow when helper teardown cannot clear stale PIDs.
    appSession = {
      ...defaultStudioSessionTelemetry(),
      helperStatus: "error",
      helperError: error instanceof Error ? error.message : String(error || "unknown helper failure"),
      sessionMode: "fallback_open",
    };
    runOptional("open", ["-na", appPath]);
    await sleepMs(900);
  }

  debugDefaults.writeInt(openTokenKey, 0);
  debugDefaults.writeInt(openAckTokenKey, 0);
  activateApp(appPath);
  await waitForCondition(
    () => Boolean(appHasWindow()) || readDebugDiffState() != null,
    "visible THEM window or diff state before Studio open",
    startupTimeoutMs,
    300
  );

  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const token = debugDefaults.nextToken(openTokenKey, openAckTokenKey);
    debugDefaults.writeInt(openAckTokenKey, 0);
    debugDefaults.writeInt(openTokenKey, token);
    try {
      await waitForCondition(
        () => debugDefaults.readInt(openAckTokenKey) === token || readDebugDiffState() != null,
        `Studio open ack or diff state ${token}`,
        ackTimeoutMs,
        150
      );
      await sleepMs(settleMs);
      activateApp(appPath);
      await waitForCondition(
        () => Boolean(appHasWindow()) || readDebugDiffState() != null,
        "visible THEM window or diff state after open",
        startupTimeoutMs,
        250
      );
      return {
        token,
        appSession,
      };
    } catch (error) {
      lastError = error;
      runOptional("open", ["-na", appPath]);
      activateApp(appPath);
      await sleepMs(settleMs);
    }
  }

  if (Boolean(appHasWindow()) || readDebugDiffState() != null) {
    return {
      token: 0,
      appSession,
      degradedOpenHandshake: true,
    };
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError || "Studio open ack never arrived");
  throw new Error(
    `${message}\nApp session telemetry: ${JSON.stringify(appSession, null, 2)}`
  );
}

export function assertInteractionLifecycle({
  action = "",
  actionReceived = false,
  payload = null,
  stateAfter = false,
  stateLabel = "state_after",
  handledStatuses = ["handled", "ok", "success"],
  extra = {},
  cause = null,
}) {
  const status = String(payload?.status || payload?.result_status || "").trim().toLowerCase();
  const error = String(
    payload?.error
    || payload?.errorText
    || payload?.result_error
    || payload?.resultError
    || ""
  ).trim();
  const lifecycle = {
    action: String(action || "").trim(),
    action_received: Boolean(actionReceived),
    action_handled: handledStatuses.includes(status),
    state_after: Boolean(stateAfter),
    state_label: String(stateLabel || "").trim(),
    status,
    error,
    ...extra,
  };
  if (!lifecycle.action_received || !lifecycle.action_handled || !lifecycle.state_after) {
    const causeText = cause ? `\nCause: ${cause instanceof Error ? cause.message : String(cause)}` : "";
    throw new Error(`Interaction lifecycle assertion failed${causeText}\n${JSON.stringify(lifecycle, null, 2)}`);
  }
  return lifecycle;
}
