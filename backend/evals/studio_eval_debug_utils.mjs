import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || result.error?.message || `${command} failed`).trim());
  }
  return (result.stdout || "").trim();
}

export function runOptionalCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
  return {
    status: result.status ?? 1,
    stdout: (result.stdout || "").trim(),
    stderr: (result.stderr || result.error?.message || "").trim(),
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
  const explicit = String(process.env.THEM_DEBUG_DEFAULTS_DOMAIN || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (explicit.length) {
    return Array.from(new Set(explicit));
  }
  // Use the app's logical defaults domain as the deterministic source of truth.
  return ["io.them.them"];
}

const STUDIO_DEBUG_FILE_PREFERENCES_DIR = "/tmp/them_studio_debug_preferences_v1";

function debugFilePreferencePath(key) {
  return join(STUDIO_DEBUG_FILE_PREFERENCES_DIR, `${encodeURIComponent(String(key || ""))}.json`);
}

function readDebugFilePreference(key) {
  const path = debugFilePreferencePath(key);
  if (!existsSync(path)) return { found: false, value: undefined };
  try {
    const payload = JSON.parse(readFileSync(path, "utf8"));
    if (!payload || !Object.prototype.hasOwnProperty.call(payload, "value")) {
      return { found: false, value: undefined };
    }
    return { found: true, value: payload.value };
  } catch {
    return { found: false, value: undefined };
  }
}

function writeDebugFilePreference(key, value) {
  mkdirSync(STUDIO_DEBUG_FILE_PREFERENCES_DIR, { recursive: true });
  const targetPath = debugFilePreferencePath(key);
  const temporaryPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(temporaryPath, JSON.stringify({ value }), "utf8");
  renameSync(temporaryPath, targetPath);
}

function defaultDebugPlistTargets(domains = []) {
  const home = String(process.env.HOME || "").trim();
  if (!home) return [];
  const targets = [];
  for (const domain of domains) {
    const cleanDomain = String(domain || "").trim();
    if (!cleanDomain) continue;
    const filename = cleanDomain.endsWith(".plist") ? cleanDomain : `${cleanDomain}.plist`;
    const plistPaths = [
      `${home}/Library/Containers/${cleanDomain}/Data/Library/Preferences/${filename}`,
      `${home}/Library/Preferences/${filename}`,
    ];
    for (const plistPath of plistPaths) {
      const defaultsTarget = plistPath.endsWith(".plist")
        ? plistPath.slice(0, -".plist".length)
        : plistPath;
      targets.push({
        domain: cleanDomain,
        plistPath,
        defaultsTarget,
      });
    }
  }
  return targets;
}

export function createStudioDebugDefaultsTransport({
  run = runCommand,
  runOptional = runOptionalCommand,
  domains = [],
} = {}) {
  const debugDomains = Array.from(new Set([...domains.filter(Boolean), ...defaultDebugDomains()]));
  const debugPlistTargets = defaultDebugPlistTargets(debugDomains);
  const writeTargets = Array.from(new Set([
    ...debugDomains,
    ...debugPlistTargets.map((target) => target.defaultsTarget),
  ]));

  function readPlistObject(plistPath) {
    if (!existsSync(plistPath)) return {};
    const result = runOptional("plutil", ["-convert", "json", "-o", "-", plistPath], {
      maxBuffer: 64 * 1024 * 1024,
    });
    if (result.status !== 0 || !result.stdout.trim()) return {};
    try {
      const parsed = JSON.parse(result.stdout);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  function readDomainResults(key) {
    const filePreference = readDebugFilePreference(key);
    if (filePreference.found) {
      return [{
        domain: "file-bridge",
        value: typeof filePreference.value === "string"
          ? filePreference.value
          : JSON.stringify(filePreference.value),
      }];
    }
    const results = [];
    for (const target of debugPlistTargets) {
      const plist = readPlistObject(target.plistPath);
      if (Object.prototype.hasOwnProperty.call(plist, key)) {
        const value = plist[key];
        results.push({
          domain: target.domain,
          value: typeof value === "string" ? value : JSON.stringify(value),
        });
      }
    }
    for (const domain of debugDomains) {
      const result = runOptional("defaults", ["read", domain, key], {
        timeout: 2000,
      });
      if (result.status !== 0) continue;
      results.push({
        domain,
        value: result.stdout.trim(),
      });
    }
    return results;
  }

  function readString(key) {
    const results = readDomainResults(key);
    if (results.length === 0) return "";
    const preferred = [...results].reverse().find((entry) => entry.value.length > 0);
    return (preferred || results[results.length - 1]).value;
  }

  function readInt(key) {
    const results = readDomainResults(key);
    let best = Number.NEGATIVE_INFINITY;
    let found = false;
    for (const entry of results) {
      const value = Number(entry.value);
      if (!Number.isFinite(value)) continue;
      if (!found || value > best) {
        best = value;
        found = true;
      }
    }
    return found ? best : 0;
  }

  function readBool(key, fallback = false) {
    const results = readDomainResults(key);
    const raw = String((results.length ? results[results.length - 1].value : "")).trim().toLowerCase();
    if (!raw) return fallback;
    return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
  }

  function readJSON(key, fallback = null) {
    const results = readDomainResults(key);
    const parsedValues = [];
    for (const entry of [...results].reverse()) {
      if (!entry.value) continue;
      try {
        parsedValues.push(JSON.parse(entry.value));
      } catch {
        continue;
      }
    }
    if (key === STUDIO_DEBUG_DIFF_STATE_KEY && parsedValues.length > 0) {
      return parsedValues.reduce((best, value) => {
        const bestToken = Number(best?.loadProjectToken || best?.loadProjectAckToken || 0);
        const valueToken = Number(value?.loadProjectToken || value?.loadProjectAckToken || 0);
        return valueToken > bestToken ? value : best;
      }, parsedValues[0]);
    }
    if (parsedValues.length > 0) {
      return parsedValues[0];
    }
    return fallback;
  }

  function writeKey(key, args) {
    let wrote = false;
    let lastError = "";
    const [type, rawValue] = args;
    let fileValue = String(rawValue ?? "");
    if (type === "-int") {
      fileValue = Number.parseInt(String(rawValue), 10) || 0;
    } else if (type === "-bool") {
      const normalized = String(rawValue).trim().toLowerCase();
      fileValue = normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
    }
    try {
      writeDebugFilePreference(key, fileValue);
      wrote = true;
    } catch (error) {
      lastError = error?.message || lastError;
    }
    const defaultsArgSize = args.reduce((sum, value) => sum + String(value).length, 0);
    const shouldUseDefaultsWrite = defaultsArgSize < 500_000;
    for (const domain of writeTargets) {
      if (!shouldUseDefaultsWrite) continue;
      const result = runOptional("defaults", ["write", domain, key, ...args], {
        timeout: 3000,
      });
      if (result.status === 0) {
        wrote = true;
      } else {
        lastError = result.stderr || result.stdout || lastError;
      }
    }
    const plistWrite = writeKeyToPlistTargets(key, args);
    wrote = wrote || plistWrite.wrote;
    lastError = plistWrite.lastError || lastError;
    if (!wrote) {
      throw new Error(`Unable to write defaults key ${key}: ${lastError || "unknown defaults write failure"}`);
    }
  }

  function writeKeyToPlistTargets(key, args) {
    let wrote = false;
    let lastError = "";
    const [type, rawValue] = args;
    for (const target of debugPlistTargets) {
      try {
        mkdirSync(dirname(target.plistPath), { recursive: true });
        const plist = readPlistObject(target.plistPath);
        if (type === "-int") {
          plist[key] = Number.parseInt(String(rawValue), 10) || 0;
        } else if (type === "-bool") {
          const normalized = String(rawValue).trim().toLowerCase();
          plist[key] = normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
        } else {
          plist[key] = String(rawValue ?? "");
        }
        const tempDir = mkdtempSync(join(tmpdir(), "them-defaults-"));
        const tempJSONPath = join(tempDir, "preferences.json");
        writeFileSync(tempJSONPath, JSON.stringify(plist), "utf8");
        const result = runOptional("plutil", ["-convert", "binary1", "-o", target.plistPath, tempJSONPath], {
          timeout: 3000,
          maxBuffer: 64 * 1024 * 1024,
        });
        if (result.status === 0) {
          wrote = true;
        } else {
          lastError = result.stderr || result.stdout || lastError;
        }
      } catch (error) {
        lastError = error?.message || lastError;
      }
    }
    return { wrote, lastError };
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

  let tokenSeed = Date.now();

  function nextToken(...keys) {
    const defaultValues = keys.map((key) => readInt(key));
    tokenSeed = Math.max(tokenSeed + 1, Date.now(), ...defaultValues.map((value) => value + 1));
    return tokenSeed;
  }

  return {
    domains: debugDomains,
    plistTargets: debugPlistTargets.map((target) => target.plistPath),
    writeDomains: writeTargets,
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

export const STUDIO_DEBUG_LOAD_PROJECT_REQUEST_PATH = String(
  process.env.THEM_STUDIO_DEBUG_LOAD_PROJECT_REQUEST_PATH || "/tmp/them_studio_debug_load_project_request.json"
).trim() || "/tmp/them_studio_debug_load_project_request.json";

export const STUDIO_DEBUG_PROJECT_LOAD_TRACE_KEY = "studio_debug_project_load_trace_json";
export const STUDIO_DEBUG_DIFF_STATE_KEY = "studio_debug_diff_state_json";

function studioDebugLoadProjectRequestPaths(primaryPath = STUDIO_DEBUG_LOAD_PROJECT_REQUEST_PATH) {
  const paths = [String(primaryPath || "").trim()].filter(Boolean);
  const home = String(process.env.HOME || "").trim();
  if (home) {
    for (const domain of defaultDebugDomains()) {
      paths.push(`${home}/Library/Containers/${domain}/Data/tmp/them_studio_debug_load_project_request.json`);
    }
  }
  return Array.from(new Set(paths));
}

export function writeStudioDebugLoadProjectRequest({
  token,
  projectId,
  versionId = "",
  requestPath = STUDIO_DEBUG_LOAD_PROJECT_REQUEST_PATH,
} = {}) {
  const cleanProjectId = String(projectId || "").trim();
  if (!cleanProjectId) {
    throw new Error("writeStudioDebugLoadProjectRequest requires projectId");
  }
  const cleanToken = Number(token);
  if (!Number.isInteger(cleanToken) || cleanToken <= 0) {
    throw new Error("writeStudioDebugLoadProjectRequest requires a positive token");
  }
  const payload = JSON.stringify({
    token: cleanToken,
    projectID: cleanProjectId,
    versionID: String(versionId || "").trim(),
  });
  for (const targetPath of studioDebugLoadProjectRequestPaths(requestPath)) {
    const directory = targetPath.slice(0, targetPath.lastIndexOf("/"));
    if (directory) {
      mkdirSync(directory, { recursive: true });
    }
    writeFileSync(targetPath, payload, "utf8");
  }
  return requestPath;
}

export function stageStudioProjectLoadDebugRequest({
  debugDefaults,
  projectId,
  versionId = "",
  loadProjectTokenKey = "studio_debug_load_project_token",
  loadProjectProjectIDKey = "studio_debug_load_project_id",
  loadProjectVersionIDKey = "studio_debug_load_project_version_id",
  loadProjectAckTokenKey = "studio_debug_load_project_ack_token",
  requestPath = STUDIO_DEBUG_LOAD_PROJECT_REQUEST_PATH,
} = {}) {
  if (!debugDefaults) {
    throw new Error("stageStudioProjectLoadDebugRequest requires debugDefaults");
  }
  const cleanProjectId = String(projectId || "").trim();
  if (!cleanProjectId) {
    throw new Error("stageStudioProjectLoadDebugRequest requires projectId");
  }
  const cleanVersionId = String(versionId || "").trim();
  const token = debugDefaults.nextToken(loadProjectTokenKey, loadProjectAckTokenKey);
  debugDefaults.writeString(STUDIO_DEBUG_PROJECT_LOAD_TRACE_KEY, "[]");
  debugDefaults.writeInt(loadProjectAckTokenKey, 0);
  debugDefaults.writeString(loadProjectProjectIDKey, cleanProjectId);
  debugDefaults.writeString(loadProjectVersionIDKey, cleanVersionId);
  writeStudioDebugLoadProjectRequest({
    token,
    projectId: cleanProjectId,
    versionId: cleanVersionId,
    requestPath,
  });
  debugDefaults.writeInt(loadProjectTokenKey, token);
  return {
    token,
    projectId: cleanProjectId,
    versionId: cleanVersionId,
  };
}

export function readStudioDebugProjectLoadTrace({
  debugDefaults,
  token = 0,
  traceKey = STUDIO_DEBUG_PROJECT_LOAD_TRACE_KEY,
} = {}) {
  if (!debugDefaults) return [];
  const trace = debugDefaults.readJSON(traceKey, []);
  if (!Array.isArray(trace)) return [];
  if (!Number.isInteger(token) || token <= 0) return trace;
  return trace.filter((entry) => Number(entry?.token || 0) === token);
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
    runOptional("open", [appPath]);
    await sleepMs(900);
  }

  debugDefaults.writeString(STUDIO_DEBUG_DIFF_STATE_KEY, "");
  debugDefaults.writeInt(openTokenKey, 0);
  debugDefaults.writeInt(openAckTokenKey, 0);
  activateApp(appPath);
  try {
    await waitForCondition(
      () => Boolean(appHasWindow()) || readDebugDiffState() != null,
      "visible THEM window or Studio debug state before Studio open",
      Math.min(startupTimeoutMs, 4000),
      300
    );
  } catch {
    // The helper already verified that the app process relaunched. Continue to
    // the explicit open-token handshake, which is what brings Studio forward.
  }

  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const token = debugDefaults.nextToken(openTokenKey, openAckTokenKey);
    debugDefaults.writeInt(openAckTokenKey, 0);
    debugDefaults.writeInt(openTokenKey, token);
    try {
      await waitForCondition(
        () => debugDefaults.readInt(openAckTokenKey) === token,
        `Studio open ack ${token}`,
        ackTimeoutMs,
        150
      );
      await sleepMs(settleMs);
      activateApp(appPath);
      await waitForCondition(
        () => readDebugDiffState() != null,
        "Studio diff state after open",
        startupTimeoutMs,
        250
      );
      return {
        token,
        appSession,
      };
    } catch (error) {
      lastError = error;
      runOptional("open", [appPath]);
      activateApp(appPath);
      await sleepMs(settleMs);
    }
  }

  const hasDiffState = readDebugDiffState() != null;
  const hasWindow = Boolean(appHasWindow());
  if (hasDiffState) {
    return {
      token: 0,
      degraded: true,
      appSession: {
        ...appSession,
        helperStatus: appSession.helperStatus === "ok" ? "degraded_open_ack" : appSession.helperStatus,
      },
    };
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError || "Studio open ack never arrived");
  throw new Error(
    `${message}\nApp session telemetry: ${JSON.stringify(appSession, null, 2)}`
  );
}

export async function ensureStudioProjectLoadedWithDebugHook({
  debugDefaults,
  projectId,
  versionId = "",
  readDebugDiffState = () => null,
  loadProjectTokenKey = "studio_debug_load_project_token",
  loadProjectProjectIDKey = "studio_debug_load_project_id",
  loadProjectVersionIDKey = "studio_debug_load_project_version_id",
  loadProjectAckTokenKey = "studio_debug_load_project_ack_token",
  requestPath = STUDIO_DEBUG_LOAD_PROJECT_REQUEST_PATH,
  timeoutMs = 30000,
  intervalMs = 150,
  stagedRequest = null,
} = {}) {
  if (!debugDefaults) {
    throw new Error("ensureStudioProjectLoadedWithDebugHook requires debugDefaults");
  }
  const cleanProjectId = String(projectId || "").trim();
  if (!cleanProjectId) {
    throw new Error("ensureStudioProjectLoadedWithDebugHook requires projectId");
  }
  const staged = stagedRequest || stageStudioProjectLoadDebugRequest({
    debugDefaults,
    projectId: cleanProjectId,
    versionId,
    loadProjectTokenKey,
    loadProjectProjectIDKey,
    loadProjectVersionIDKey,
    loadProjectAckTokenKey,
    requestPath,
  });
  const token = Number(staged.token);
  const cleanVersionId = String(staged.versionId ?? versionId ?? "").trim();

  const isReadyState = (diffState) => {
    const selectedProjectID = String(diffState?.selectedProjectID || "").trim();
    const latestVersionID = String(diffState?.latestVersionID || "").trim();
    const loadedDraftProjectID = String(diffState?.loadedDraftProjectID || "").trim();
    const projectMatched = selectedProjectID === cleanProjectId;
    const versionMatched = !cleanVersionId || latestVersionID === cleanVersionId;
    const explicitReady = Boolean(diffState?.loadProjectReady);
    const loadedReady = Boolean(diffState?.studioSurfaceActive)
      && Boolean(diffState?.selectedProjectPresent)
      && loadedDraftProjectID === cleanProjectId
      && projectMatched
      && versionMatched;
    const inferredReady = Boolean(diffState?.studioSurfaceActive)
      && Boolean(diffState?.selectedProjectPresent)
      && loadedDraftProjectID === cleanProjectId
      && diffState?.editorFocusPending === false
      && projectMatched
      && versionMatched;
    return {
      projectMatched,
      versionMatched,
      ready: explicitReady || inferredReady || loadedReady,
    };
  };

  try {
    await waitForCondition(() => {
      const diffState = readDebugDiffState(cleanProjectId);
      const readiness = isReadyState(diffState);
      return readiness.projectMatched && readiness.versionMatched && readiness.ready;
    }, `Studio project load for ${cleanProjectId}`, timeoutMs, intervalMs);
  } catch (error) {
    const finalState = readDebugDiffState(cleanProjectId);
    const breadcrumbs = readStudioDebugProjectLoadTrace({
      debugDefaults,
      token,
    });
    const summary = {
      token,
      requestedProjectId: cleanProjectId,
      requestedVersionId: cleanVersionId,
      ackToken: debugDefaults.readInt(loadProjectAckTokenKey),
      finalState,
      breadcrumbs,
    };
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}\n`
      + `Project-load diagnostics: ${JSON.stringify(summary, null, 2)}`
    );
  }

  return {
    token,
    state: readDebugDiffState(cleanProjectId),
    breadcrumbs: readStudioDebugProjectLoadTrace({
      debugDefaults,
      token,
    }),
  };
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
