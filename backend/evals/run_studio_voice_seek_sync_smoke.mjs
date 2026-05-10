import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createStudioDebugDefaultsTransport } from "./studio_eval_debug_utils.mjs";
import { withDeterministicStudioVoiceBackend } from "./studio_voice_sync_test_backend.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(__dirname, "..");
const seekAfterKey = "studio_debug_seek_synced_voice_playback_after_ms";
const seekToKey = "studio_debug_seek_synced_voice_playback_to_ms";

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
  assert(line, "Voice seek sync smoke did not emit a structured Studio result");
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

const prompt = [
  "Render exactly this screenplay block verbatim on the page, with no commentary:",
  "INT. SAFE HOUSE - NIGHT",
  "",
  "CLEMENTINE",
  "We only get one clean exit, so don't burn it on fear.",
  "",
  "NOAH",
  "Then stop talking like it's already over and open the door.",
  "",
  "Clementine slides the deadbolt, steadying her breath before she moves.",
].join("\\n");

try {
  const output = await withDeterministicStudioVoiceBackend(async ({ baseUrl }) => {
    studioDebugDefaults.writeString(seekAfterKey, "1150");
    studioDebugDefaults.writeString(seekToKey, "260");
    try {
      return runSmoke({
        THEM_BASE_URL: baseUrl,
        STUDIO_CMDRETURN_ALLOW_SNAPSHOT_ONLY_VOICE_TURN: "1",
        STUDIO_CMDRETURN_SCENARIO: "voice-early-paint",
        STUDIO_CMDRETURN_VOICE_PROMPT: prompt,
      });
    } finally {
      studioDebugDefaults.writeString(seekAfterKey, "0");
      studioDebugDefaults.writeString(seekToKey, "0");
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
  const seekApplied = Boolean(
    voiceResult?.syncedVoiceSeekApplied
    ?? persistedVoiceResult?.syncedVoiceSeekApplied
  );
  const seekCount = Number(
    voiceResult?.syncedVoiceSeekCount
    || persistedVoiceResult?.syncedVoiceSeekCount
    || 0
  );
  const seekFromMs = Number(
    voiceResult?.syncedVoiceSeekFromMs
    || persistedVoiceResult?.syncedVoiceSeekFromMs
    || 0
  );
  const seekToMs = Number(
    voiceResult?.syncedVoiceSeekToMs
    || persistedVoiceResult?.syncedVoiceSeekToMs
    || 0
  );
  const syncedVoiceActiveScriptNodeID = String(
    voiceResult?.syncedVoiceActiveScriptNodeID
    || persistedVoiceResult?.syncedVoiceActiveScriptNodeID
    || ""
  ).trim();
  const finalCommittedPageText = normalizeText(
    structuredResult?.finalCommittedPageText
    || voiceResult?.finalCommittedPageText
    || persistedVoiceResult?.finalCommittedPageText
    || structuredResult?.latestEntry?.insertedText
    || ""
  );
  const screenplayOutputText = normalizeText(
    structuredResult?.voiceTurnMeta?.screenplay_output?.text
    || voiceResult?.screenplayOutputText
    || persistedVoiceResult?.screenplayOutputText
    || ""
  );

  assert(events.includes("synced_insert_started"), "Voice seek sync smoke did not start a synced insert");
  assert(events.includes("synced_insert_seeked"), "Voice seek sync smoke did not record a timeline seek recompute");
  assert(events.includes("synced_playback_seek_applied"), "Voice seek sync smoke did not persist the debug playback seek event");
  assert.equal(seekApplied, true, "Voice seek sync smoke did not mark the synced seek as applied");
  assert(seekCount >= 1, `Voice seek sync smoke expected at least one applied seek, got ${seekCount}`);
  assert(seekFromMs > seekToMs, `Voice seek sync smoke expected a backward seek, got from=${seekFromMs} to=${seekToMs}`);
  assert(
    syncedVoiceActiveScriptNodeID.includes(":node:"),
    `Voice seek sync smoke expected a persistent screenplay node id after seek, got ${syncedVoiceActiveScriptNodeID || "<missing>"}`
  );
  assert(finalCommittedPageText, "Voice seek sync smoke did not surface final committed page text");
  assert.equal(
    finalCommittedPageText,
    screenplayOutputText,
    "Voice seek sync smoke final committed text drifted from screenplay_output.text"
  );

  console.log(`voice seek sync smoke passed with backward seek ${seekFromMs}ms -> ${seekToMs}ms`);
} finally {}
