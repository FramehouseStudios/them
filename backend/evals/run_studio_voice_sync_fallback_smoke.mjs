import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createStudioDebugDefaultsTransport } from "./studio_eval_debug_utils.mjs";
import { withDeterministicStudioVoiceBackend } from "./studio_voice_sync_test_backend.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(__dirname, "..");
const freezeKey = "studio_debug_freeze_synced_voice_playback_after_ms";
const studioDebugDefaults = createStudioDebugDefaultsTransport({
  run(command, args, options = {}) {
    const result = execFileSync(command, args, {
      encoding: "utf8",
      ...options,
    });
    return (result || "").trim();
  },
  runOptional(command, args, options = {}) {
    try {
      return {
        status: 0,
        stdout: execFileSync(command, args, {
          encoding: "utf8",
          ...options,
        }).trim(),
        stderr: "",
      };
    } catch (error) {
      return {
        status: error?.status ?? 1,
        stdout: String(error?.stdout || "").trim(),
        stderr: String(error?.stderr || "").trim(),
      };
    }
  },
});

function runSmoke(extraEnv = {}) {
  return execFileSync(
    process.execPath,
    [path.join("evals", "run_studio_cmdreturn_smoke.mjs")],
    {
      cwd: backendDir,
      env: { ...process.env, ...extraEnv },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
}

function parseResult(output) {
  const marker = "__STUDIO_CMDRETURN_RESULT__ ";
  const line = String(output || "")
    .split(/\r?\n/)
    .find((entry) => entry.startsWith(marker));
  assert(line, "Voice sync fallback smoke did not emit a structured Studio result");
  return JSON.parse(line.slice(marker.length));
}

function readDefaultsJSON(key) {
  try {
    const raw = execFileSync("defaults", ["read", "io.them.them", key], {
      encoding: "utf8",
    }).trim();
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function normalizeText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

try {
  const prompt = "Render exactly this screenplay block verbatim on the page, with no commentary: INT. DINER - NIGHT\\n\\nLUCY\\nI can do this.\\n\\nFRANK\\nMove now.\\n\\nLucy grabs her coat.\\n\\nFrank steps into her path.";
  const output = await withDeterministicStudioVoiceBackend(async ({ baseUrl }) => {
    studioDebugDefaults.writeString(freezeKey, "420");
    try {
      return runSmoke({
        THEM_BASE_URL: baseUrl,
        STUDIO_CMDRETURN_ALLOW_SNAPSHOT_ONLY_VOICE_TURN: "1",
        STUDIO_CMDRETURN_SCENARIO: "voice-early-paint",
        STUDIO_CMDRETURN_VOICE_PROMPT: prompt,
      });
    } finally {
      studioDebugDefaults.writeString(freezeKey, "0");
    }
  });
  process.stdout.write(output);

  const structuredResult = parseResult(output);
  const persistedVoiceResult = readDefaultsJSON("studio_debug_voice_turn_result_json") || {};
  const voiceResult = structuredResult?.voiceResult || persistedVoiceResult;
  const breadcrumbs = Array.isArray(voiceResult?.breadcrumbs)
    ? voiceResult.breadcrumbs
    : (Array.isArray(persistedVoiceResult?.breadcrumbs) ? persistedVoiceResult.breadcrumbs : []);
  const events = breadcrumbs.map((entry) => String(entry?.event || ""));
  const syncedVoicePhase = String(
    voiceResult?.syncedVoicePhase
    || persistedVoiceResult?.syncedVoicePhase
    || ""
  ).trim();
  const syncedVoiceFallbackCommitted = Boolean(
    voiceResult?.syncedVoiceFallbackCommitted
    ?? persistedVoiceResult?.syncedVoiceFallbackCommitted
  );
  const syncedVoiceFallbackReason = String(
    voiceResult?.syncedVoiceFallbackReason
    || persistedVoiceResult?.syncedVoiceFallbackReason
    || ""
  ).trim();
  const syncedVoiceCueCount = Number(
    voiceResult?.syncedVoiceCueCount
    || persistedVoiceResult?.syncedVoiceCueCount
    || 0
  );
  const syncedVoiceAppliedCueCount = Number(
    voiceResult?.syncedVoiceAppliedCueCount
    || persistedVoiceResult?.syncedVoiceAppliedCueCount
    || 0
  );
  const syncedVoicePlaybackDriftMs = Number(
    voiceResult?.syncedVoicePlaybackDriftMs
    || persistedVoiceResult?.syncedVoicePlaybackDriftMs
    || 0
  );
  const finalCommittedPageText = normalizeText(
    structuredResult?.finalCommittedPageText
    || voiceResult?.finalCommittedPageText
    || persistedVoiceResult?.finalCommittedPageText
    || structuredResult?.latestEntry?.insertedText
    || ""
  );
  const screenplayOutputText = normalizeText(
    structuredResult?.voiceTurnMeta?.screenplay_output?.text
    || ""
  );
  const recordedFallbackCompletion = events.includes("synced_insert_fallback_committed")
    || syncedVoiceFallbackCommitted;

  assert(events.includes("synced_insert_started"), "Voice sync fallback smoke did not start a synced insert");
  assert(recordedFallbackCompletion, "Voice sync fallback smoke did not record fallback completion");
  assert.equal(syncedVoicePhase, "completed", `Voice sync fallback smoke ended in unexpected phase: ${syncedVoicePhase || "missing"}`);
  assert.equal(syncedVoiceFallbackCommitted, true, "Voice sync fallback smoke did not mark the synced fallback as committed");
  assert.equal(syncedVoiceFallbackReason, "playback_desynced", `Voice sync fallback smoke expected playback_desynced, got ${syncedVoiceFallbackReason || "empty"}`);
  assert(syncedVoiceCueCount > 1, `Voice sync fallback smoke expected multiple cues, got ${syncedVoiceCueCount}`);
  assert(syncedVoiceAppliedCueCount < syncedVoiceCueCount, `Voice sync fallback smoke expected partial cue progress before fallback, got ${syncedVoiceAppliedCueCount}/${syncedVoiceCueCount}`);
  assert(syncedVoicePlaybackDriftMs >= 350, `Voice sync fallback smoke expected meaningful playback drift, got ${syncedVoicePlaybackDriftMs}ms`);
  assert(finalCommittedPageText, "Voice sync fallback smoke did not surface final committed page text");
  assert.equal(
    finalCommittedPageText,
    screenplayOutputText,
    "Voice sync fallback smoke final committed text drifted from screenplay_output.text"
  );

  console.log(`voice sync fallback smoke passed with fallback reason ${syncedVoiceFallbackReason}`);
} finally {}
