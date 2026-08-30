import { existsSync, mkdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import nodePath from "node:path";
import { fileURLToPath } from "node:url";
import { createStudioOwnedAppController } from "./studio_eval_debug_utils.mjs";

const BACKEND_DIR = nodePath.resolve(nodePath.dirname(fileURLToPath(import.meta.url)), "..");
const SCREENSHOT_PATH = "/tmp/them-smoke/them-home.png";

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

const studioApp = createStudioOwnedAppController({ runOptional });

function readDefaultString(key) {
  const result = runOptional("defaults", ["read", "io.them.them", key]);
  return result.status === 0 ? result.stdout.trim() : "";
}

function extractMarkedJSON(text, marker) {
  const line = String(text || "")
    .split(/\r?\n/)
    .find((entry) => entry.startsWith(`${marker} `));
  if (!line) {
    throw new Error(`Missing ${marker} marker in smoke output`);
  }
  return JSON.parse(line.slice(marker.length + 1));
}

function captureScreenshot(path) {
  mkdirSync("/tmp/them-smoke", { recursive: true });
  studioApp.captureWindow(path);
  assert(existsSync(path), `Screenshot was not created: ${path}`);
  assert(statSync(path).size > 0, `Screenshot file is empty: ${path}`);
}

function readCurrentVoiceSnapshot(expectedToken) {
  const raw = readDefaultString("studio_debug_voice_turn_result_json");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (Number(parsed?.token || 0) !== Number(expectedToken || 0)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

const voicePrompt = String(
  process.env.STUDIO_CMDRETURN_VOICE_PROMPT
  || "Write three tense screenplay lines: She reaches the door before he can answer. That's it."
).trim();

const smoke = run(
  "node",
  ["evals/run_studio_cmdreturn_smoke.mjs"],
  {
    cwd: BACKEND_DIR,
    env: {
      ...process.env,
      STUDIO_CMDRETURN_SCENARIO: "voice-early-paint",
      STUDIO_CMDRETURN_REQUIRE_TALK_RESPONSE: "1",
      STUDIO_CMDRETURN_VOICE_PROMPT: voicePrompt,
    },
  }
);

const payload = extractMarkedJSON(smoke, "__STUDIO_CMDRETURN_RESULT__");
const voiceResult = payload?.voiceResult || {};
assert(payload?.ok === true, "Studio voice visual smoke did not report ok=true");
assert(payload?.draftStartedBeforeAssistantSpeech === true, "Draft did not begin before assistant speech");
assert(Boolean(String(voiceResult.playbackStartedAtISO8601 || "").trim()), "Assistant playback did not start before visual capture");
assert(!String(voiceResult.playbackFinishedAtISO8601 || "").trim(), "Assistant playback already finished before visual capture");
assert(Boolean(String(voiceResult.commitAtISO8601 || "").trim()) || Boolean(payload?.latestEntry), "Draft page did not have committed page content before visual capture");

studioApp.bindSession(payload?.appPath, payload?.appSession);
studioApp.activate(payload?.appPath);
await new Promise((resolve) => setTimeout(resolve, 350));
captureScreenshot(SCREENSHOT_PATH);

const currentSnapshot = readCurrentVoiceSnapshot(voiceResult.token);
const playbackStillInFlightAtCapture = !String(currentSnapshot?.playbackFinishedAtISO8601 || "").trim();
assert(playbackStillInFlightAtCapture, "Assistant playback finished before the screenshot was captured");

const result = {
  ok: true,
  screenshotPath: SCREENSHOT_PATH,
  throwawayProjectId: payload.throwawayProjectId,
  voicePrompt,
  renderRequestID: voiceResult.renderRequestID || "",
  renderServerFirstDeltaMs: voiceResult.renderServerFirstDeltaMs ?? null,
  playbackStartedAtISO8601: voiceResult.playbackStartedAtISO8601 || "",
  playbackStillInFlightAtCapture,
  latestEntryTarget: payload?.latestEntry?.target || "",
  latestEntryPreview: String(payload?.latestEntry?.insertedText || "").slice(0, 220),
};

console.log(JSON.stringify(result, null, 2));
console.log(`__STUDIO_VOICE_VISUAL_RESULT__ ${JSON.stringify(result)}`);
console.log("studio-voice-visual-smoke: ok");
