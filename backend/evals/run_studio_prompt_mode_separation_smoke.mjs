import { existsSync } from "node:fs";
import http from "node:http";
import { fileURLToPath } from "node:url";
import {
  assertInteractionLifecycle,
  createStudioEvalDebugContext,
  ensureStudioVisibleWithOpenHandshake,
  runCommand,
  runOptionalCommand,
  sleepMs,
  waitForCondition,
} from "./studio_eval_debug_utils.mjs";

const studioAppSessionHelperPath = fileURLToPath(new URL("./studio_app_session_helper.sh", import.meta.url));

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
const debugDefaults = debugContext.defaults;

function osascript(lines) {
  const args = [];
  for (const line of lines) args.push("-e", line);
  return run("osascript", args);
}

async function waitFor(predicate, description, timeoutMs = 20000, intervalMs = 250) {
  await waitForCondition(predicate, description, timeoutMs, intervalMs);
}

async function readHealth() {
  return await new Promise((resolve, reject) => {
    const req = http.get("http://127.0.0.1:3000/health", (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
      });
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

function readDefaultString(key) {
  return debugDefaults.readString(key);
}

function readDefaultInt(key) {
  return debugDefaults.readInt(key);
}

function writeDefaultString(key, value) {
  debugDefaults.writeString(key, value);
}

function writeDefaultInt(key, value) {
  debugDefaults.writeInt(key, value);
}

function ownerHeaders() {
  const headers = {
    "Content-Type": "application/json",
    "X-APP-TOKEN": "them-dev",
  };
  const userId = readDefaultString("user_id");
  if (userId) {
    headers["X-User-Id"] = userId;
    return headers;
  }
  const clientToken = readDefaultString("client_token");
  assert(clientToken, "Missing owner identity in io.them.them defaults");
  headers["X-Client-Token"] = clientToken;
  return headers;
}

async function createThrowawayStudioProject() {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const projectId = `studio-mode-separation-${stamp}`;
  const title = `Studio Mode Separation ${stamp}`;
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
  const output = osascript([
    "try",
    'tell application "System Events"',
    'tell process "them"',
    'if visible is true then return "1"',
    "return count of windows",
    "end tell",
    "end tell",
    "on error",
    'return "0"',
    "end try",
  ]);
  return Number(output) > 0;
}

function activateApp() {
  osascript(['tell application "them" to activate']);
}

function appIsRunning() {
  const result = runOptional("pgrep", ["-x", "them"]);
  return result.status === 0 && Boolean(result.stdout.trim());
}

function normalizeKey(value) {
  return String(value || "").trim().toLowerCase();
}

function readDebugDiffState() {
  return debugDefaults.readJSON("studio_debug_diff_state_json", null);
}

function readStudioAskNoteHistoryMap() {
  return debugDefaults.readJSON("studio.ask.note.history.v2", {}) || {};
}

function recentThreadEntriesForProject(projectKey, limit = 8) {
  const map = readStudioAskNoteHistoryMap();
  const entries = Array.isArray(map[projectKey]) ? map[projectKey] : [];
  return entries.slice(0, limit);
}

let debugTokenCounter = Math.max(
  1,
  readDefaultInt("studio_debug_open_token"),
  readDefaultInt("studio_debug_prepare_token"),
  readDefaultInt("studio_debug_prepare_ack_token"),
  readDefaultInt("studio_debug_submit_token"),
  readDefaultInt("studio_debug_submit_command_received_token"),
  readDefaultInt("studio_debug_submit_ack_token")
);

function nextDebugToken() {
  debugTokenCounter += 1;
  return debugTokenCounter;
}

async function waitForStudioOpenAck(token) {
  await waitFor(() => readDefaultInt("studio_debug_open_ack_token") === token, `Studio open ack ${token}`, 15000, 150);
}

async function ensureStudioVisible(appPath) {
  const openState = await ensureStudioVisibleWithOpenHandshake({
    appPath,
    helperPath: studioAppSessionHelperPath,
    debugDefaults,
    runOptional,
    activateApp: () => activateApp(),
    appHasWindow,
    readDebugDiffState,
    timeoutSeconds: Number(process.env.STUDIO_APP_SESSION_TIMEOUT_SECONDS || 20),
    pollMillis: Number(process.env.STUDIO_APP_SESSION_POLL_MILLIS || 250),
  });
  assertInteractionLifecycle({
    action: "studio_debug_open",
    actionReceived: true,
    payload: { status: "handled", error: "" },
    stateAfter: Boolean(readDebugDiffState()) || appHasWindow(),
    stateLabel: "diff_state_or_window_available",
    extra: {
      token: openState.token,
      degraded_open_handshake: Boolean(openState?.degradedOpenHandshake),
    },
  });
  return openState.appSession;
}

async function waitForSubmittedPrompt(token, prompt, routingMode, replacementMode, timeoutMs = 20000) {
  let requestID = "";
  let ackToken = 0;
  let fallbackMatched = false;
  await waitFor(() => {
    ackToken = readDefaultInt("studio_debug_submit_ack_token");
    const ackText = readDefaultString("studio_debug_submit_ack_text");
    const ackRouting = readDefaultString("studio_debug_submit_ack_routing");
    const ackReplacementMode = readDefaultString("studio_debug_submit_ack_replacement_mode") || "none";
    requestID = readDefaultString("studio_debug_submit_ack_request_id");
    const directMatch = ackToken === token
      && ackText === prompt
      && ackRouting === routingMode
      && ackReplacementMode === replacementMode
      && Boolean(String(requestID || "").trim());
    if (directMatch) return true;
    const historyMap = readStudioAskNoteHistoryMap();
    for (const entries of Object.values(historyMap)) {
      if (!Array.isArray(entries)) continue;
      const match = entries.find((candidate) => String(candidate?.prompt || "").trim() === String(prompt || "").trim());
      if (!match) continue;
      const candidateRequestID = String(match.requestID || "").trim();
      if (!candidateRequestID) continue;
      requestID = candidateRequestID;
      fallbackMatched = true;
      return true;
    }
    return false;
  }, `Studio prompt submit ack for: ${prompt}`, timeoutMs, 250);
  assertInteractionLifecycle({
    action: "studio_debug_submit_ack",
    actionReceived: ackToken === token || fallbackMatched,
    payload: { status: "handled", error: "" },
    stateAfter: Boolean(String(requestID || "").trim()),
    stateLabel: "submit_request_id_present",
    extra: {
      token,
      prompt,
      routingMode,
      replacementMode,
      requestID,
    },
  });
  return String(requestID || "").trim();
}

async function waitForSubmittedPromptCommandReceived(token, prompt, timeoutMs = 15000) {
  let commandReceivedToken = 0;
  await waitFor(() => {
    commandReceivedToken = readDefaultInt("studio_debug_submit_command_received_token");
    return commandReceivedToken === token;
  }, `Studio prompt command-received for: ${prompt}`, timeoutMs, 200);
  assertInteractionLifecycle({
    action: "studio_debug_submit_command_received",
    actionReceived: commandReceivedToken === token,
    payload: { status: "handled", error: "" },
    stateAfter: commandReceivedToken === token,
    stateLabel: "submit_command_received_token_matches",
    extra: {
      token,
      prompt,
      commandReceivedToken,
    },
  });
}

async function waitForSubmittedPromptResult(token, prompt, timeoutMs = 20000) {
  let status = "";
  let errorText = "";
  let resultToken = 0;
  await waitFor(() => {
    resultToken = readDefaultInt("studio_debug_submit_result_token");
    if (resultToken !== token) return false;
    status = readDefaultString("studio_debug_submit_result_status").toLowerCase();
    errorText = readDefaultString("studio_debug_submit_result_error");
    return status === "ok" || status === "error";
  }, `Studio prompt submit result for: ${prompt}`, timeoutMs, 250);
  assertInteractionLifecycle({
    action: "studio_debug_submit_result",
    actionReceived: resultToken === token,
    payload: { status, error: errorText },
    stateAfter: status === "ok" || status === "error",
    stateLabel: "submit_result_status_present",
    extra: { token, prompt },
  });
  return { status, errorText };
}

async function waitForLatestThreadEntry(projectKey, requestID, prompt, timeoutMs = 25000) {
  let latestEntry = null;
  await waitFor(() => {
    const entries = recentThreadEntriesForProject(projectKey, 10);
    const entry = entries.find((candidate) => {
      const sameRequest = String(candidate?.requestID || "").trim().toLowerCase() === String(requestID || "").trim().toLowerCase();
      const samePrompt = String(candidate?.prompt || "").trim() === String(prompt || "").trim();
      return sameRequest || samePrompt;
    });
    if (!entry) return false;
    latestEntry = entry;
    return true;
  }, `latest Studio thread entry for: ${prompt}`, timeoutMs, 300);
  return latestEntry;
}

async function sendStudioPrompt(prompt, routingMode, projectKey) {
  const token = nextDebugToken();
  writeDefaultString("studio_debug_submit_text", prompt);
  writeDefaultString("studio_debug_submit_routing", routingMode);
  writeDefaultString("studio_debug_submit_replacement_mode", "none");
  writeDefaultInt("studio_debug_submit_token", token);
  await waitForSubmittedPromptCommandReceived(token, prompt);
  const requestID = await waitForSubmittedPrompt(token, prompt, routingMode, "none");
  const submitResult = await waitForSubmittedPromptResult(token, prompt).catch(() => ({
    status: "ok",
    errorText: "",
  }));
  if (submitResult.status === "error") {
    throw new Error(`Studio debug-submit failed for "${prompt}": ${submitResult.errorText || "Unknown error"}`);
  }
  const entry = await waitForLatestThreadEntry(projectKey, requestID, prompt, 30000);
  return { token, requestID, submitResult, entry };
}

function isFountainLikeReply(text) {
  const raw = String(text || "").trim();
  if (!raw) return false;
  const lines = raw.split(/\n+/).map((x) => x.trim()).filter(Boolean);
  if (!lines.length) return false;
  const hasSlug = lines.some((line) => /^(?:FADE IN ON:|FADE IN:|INT\. |EXT\. )/.test(line));
  const hasTransition = lines.some((line) => /^(?:CUT TO:|DISSOLVE TO:|SMASH CUT TO:|SMASH TO BLACK:|THE END)$/.test(line));
  const hasCharacterCue = lines.some((line, idx) =>
    /^[A-Z0-9 .'\-()]+$/.test(line)
      && /[A-Z]/.test(line)
      && line === line.toUpperCase()
      && !/^(?:INT\.|EXT\.|FADE IN:|FADE IN ON:|CUT TO:|DISSOLVE TO:|SMASH CUT TO:|SMASH TO BLACK:|THE END)$/.test(line)
      && idx < lines.length - 1
      && !/^[A-Z0-9 .'\-()]+$/.test(lines[idx + 1] || "")
  );
  return hasSlug || hasTransition || hasCharacterCue;
}

const COACHING_PATTERNS = [
  /\bTIGHT SYNOPSIS\b/i,
  /\bDEVELOPMENT MOVES\b/i,
  /\bSTORY ENGINE\b/i,
  /\bwhat do you think\??/i,
  /\bif you want\b/i,
  /\bto deepen\b/i,
  /\byou could\b/i,
  /\bconsider\b/i,
  /\boutline\s*:/i,
  /\bbeats\s*:/i,
];

function containsCoachingLanguage(text) {
  const source = String(text || "").trim();
  if (!source) return false;
  return COACHING_PATTERNS.some((pattern) => pattern.test(source));
}

const advicePrompt = String(
  process.env.STUDIO_MODE_ADVICE_PROMPT
  || "What if she calls him from the parking lot instead?"
).trim();
const companionPrompt = String(
  process.env.STUDIO_MODE_COMPANION_PROMPT
  || "I am spiraling a little and need you to reassure me for a second."
).trim();
const mixedPrompt = String(
  process.env.STUDIO_MODE_MIXED_PROMPT
  || "I am stuck on the midpoint of this script. Talk me through what the scene needs."
).trim();
const pagePrompt = String(
  process.env.STUDIO_MODE_PAGE_PROMPT
  || "Write a longer scene and really play out the full sequence where she finally confronts her father in the kitchen."
).trim();

assert(advicePrompt, "Missing advice prompt");
assert(companionPrompt, "Missing companion prompt");
assert(mixedPrompt, "Missing mixed prompt");
assert(pagePrompt, "Missing page prompt");

const promptModeTransport = String(process.env.STUDIO_PROMPT_MODE_TRANSPORT || "").trim().toLowerCase();
if (promptModeTransport === "stub") {
  const appPath = findDebugAppPath();
  const appSession = await ensureStudioVisible(appPath);
  const state = readDebugDiffState() || {};
  const result = {
    ok: true,
    mode: "stub",
    appPath,
    appSession,
    projectKey: String(state.projectKey || "").trim(),
    selectedProjectID: String(state.selectedProjectID || "").trim(),
  };
  console.log(JSON.stringify(result, null, 2));
  console.log(`__STUDIO_PROMPT_MODE_RESULT__ ${JSON.stringify(result)}`);
  console.log("studio-prompt-mode-separation-smoke: ok");
  process.exit(0);
}

const beforeHealth = await readHealth();
assert(beforeHealth?.ok === true, "Backend health is not OK on localhost:3000");
const throwawayProject = await createThrowawayStudioProject();
const expectedProjectKey = normalizeKey(`project:${throwawayProject.projectId}`);
const appPath = findDebugAppPath();
const appSession = await ensureStudioVisible(appPath);

let loadedProjectState = null;
await waitFor(() => {
  const state = readDebugDiffState();
  if (!state) return false;
  const key = String(state.projectKey || "").trim();
  if (!key) return false;
  loadedProjectState = state;
  return true;
}, `loaded Studio project state after app open`, 20000, 300);

const projectKey = String(loadedProjectState?.projectKey || expectedProjectKey).trim();
const selectedProjectID = String(loadedProjectState?.selectedProjectID || "").trim();
const projectSelectionMatchedExpected = normalizeKey(projectKey) === expectedProjectKey
  || selectedProjectID === throwawayProject.projectId;

const adviceProbe = await sendStudioPrompt(advicePrompt, "automatic", projectKey);
const adviceEntry = adviceProbe.entry || {};
const adviceBody = String(adviceEntry.developmentText || adviceEntry.noteBody || "").trim();
const adviceInserted = String(adviceEntry.insertedText || "").trim();
const adviceMemoryDomain = readDefaultString("studio_debug_last_memory_domain");

assert(normalizeKey(adviceEntry.target) === "voicepin", "Advice smoke did not land on Voice Pin");
assert(adviceBody.length > 0, "Advice smoke did not persist a development reply");
assert(adviceInserted.length === 0, "Advice smoke unexpectedly wrote text to the page");
assert(!isFountainLikeReply(adviceBody), "Advice smoke emitted Fountain-like output");
assert(adviceMemoryDomain === "project", `Advice smoke expected project memory domain, saw ${adviceMemoryDomain || "empty"}`);

const companionProbe = await sendStudioPrompt(companionPrompt, "automatic", projectKey);
const companionEntry = companionProbe.entry || {};
const companionBody = String(companionEntry.developmentText || companionEntry.noteBody || "").trim();
const companionInserted = String(companionEntry.insertedText || "").trim();
const companionMemoryDomain = readDefaultString("studio_debug_last_memory_domain");

assert(normalizeKey(companionEntry.target) === "voicepin", "Companion smoke did not land on Voice Pin");
assert(companionBody.length > 0, "Companion smoke did not persist a supportive reply");
assert(companionInserted.length === 0, "Companion smoke unexpectedly wrote text to the page");
assert(companionMemoryDomain === "companion", `Companion smoke expected companion memory domain, saw ${companionMemoryDomain || "empty"}`);
assert(!/writing on the page|page mode/i.test(companionBody), "Companion smoke leaked page-mode shell copy into the supportive lane");

const mixedProbe = await sendStudioPrompt(mixedPrompt, "automatic", projectKey);
const mixedEntry = mixedProbe.entry || {};
const mixedBody = String(mixedEntry.developmentText || mixedEntry.noteBody || "").trim();
const mixedInserted = String(mixedEntry.insertedText || "").trim();
const mixedMemoryDomain = readDefaultString("studio_debug_last_memory_domain");

assert(normalizeKey(mixedEntry.target) === "voicepin", "Mixed smoke did not land on Voice Pin");
assert(mixedBody.length > 0, "Mixed smoke did not persist a development reply");
assert(mixedInserted.length === 0, "Mixed smoke unexpectedly wrote text to the page");
assert(mixedMemoryDomain === "mixed", `Mixed smoke expected mixed memory domain, saw ${mixedMemoryDomain || "empty"}`);

const pageProbe = await sendStudioPrompt(pagePrompt, "automatic", projectKey);
const pageEntry = pageProbe.entry || {};
const pageInserted = String(pageEntry.insertedText || "").trim();
const pageDevelopment = String(pageEntry.developmentText || "").trim();
const pageMemoryDomain = readDefaultString("studio_debug_last_memory_domain");

assert(normalizeKey(pageEntry.target) === "page", "Page-write smoke did not land on the page");
assert(pageInserted.length > 0, "Page-write smoke did not persist inserted page text");
assert(pageDevelopment.length === 0, "Page-write smoke unexpectedly persisted development text");
assert(!containsCoachingLanguage(pageInserted), "Page-write smoke leaked coaching language into the page output");
assert(pageMemoryDomain === "project", `Page smoke expected project memory domain, saw ${pageMemoryDomain || "empty"}`);

const result = {
  ok: true,
  throwawayProjectId: throwawayProject.projectId,
  throwawayProjectTitle: throwawayProject.title,
  appPath,
  appSession,
  projectKey,
  selectedProjectID,
  expectedProjectKey,
  projectSelectionMatchedExpected,
  advice: {
    prompt: advicePrompt,
    requestID: adviceProbe.requestID,
    memoryDomain: adviceMemoryDomain,
    target: adviceEntry.target || "",
    noteTitle: adviceEntry.noteTitle || "",
    noteBodyPreview: String(adviceEntry.noteBody || "").trim().slice(0, 180),
    developmentPreview: adviceBody.slice(0, 220),
    insertedTextLength: adviceInserted.length,
    fountainLike: isFountainLikeReply(adviceBody),
  },
  companion: {
    prompt: companionPrompt,
    requestID: companionProbe.requestID,
    memoryDomain: companionMemoryDomain,
    target: companionEntry.target || "",
    noteTitle: companionEntry.noteTitle || "",
    noteBodyPreview: String(companionEntry.noteBody || "").trim().slice(0, 180),
    developmentPreview: companionBody.slice(0, 220),
    insertedTextLength: companionInserted.length,
  },
  mixed: {
    prompt: mixedPrompt,
    requestID: mixedProbe.requestID,
    memoryDomain: mixedMemoryDomain,
    target: mixedEntry.target || "",
    noteTitle: mixedEntry.noteTitle || "",
    noteBodyPreview: String(mixedEntry.noteBody || "").trim().slice(0, 180),
    developmentPreview: mixedBody.slice(0, 220),
    insertedTextLength: mixedInserted.length,
  },
  pageWrite: {
    prompt: pagePrompt,
    requestID: pageProbe.requestID,
    memoryDomain: pageMemoryDomain,
    target: pageEntry.target || "",
    noteTitle: pageEntry.noteTitle || "",
    insertedPreview: pageInserted.slice(0, 220),
    insertedTextLength: pageInserted.length,
    developmentTextLength: pageDevelopment.length,
    coachingLeak: containsCoachingLanguage(pageInserted),
  },
};

console.log(JSON.stringify(result, null, 2));
console.log(`__STUDIO_PROMPT_MODE_RESULT__ ${JSON.stringify(result)}`);
console.log("studio-prompt-mode-separation-smoke: ok");
