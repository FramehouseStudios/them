import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(__dirname, "..");

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

function readDefaultsJSON(key) {
  const raw = execFileSync("defaults", ["read", "io.them.them", key], {
    encoding: "utf8",
  }).trim();
  return JSON.parse(raw);
}

function readDefaultString(key) {
  try {
    return execFileSync("defaults", ["read", "io.them.them", key], {
      encoding: "utf8",
    }).trim();
  } catch {
    return "";
  }
}

function parseResult(output) {
  const marker = "__STUDIO_CMDRETURN_RESULT__ ";
  const line = String(output || "")
    .split(/\r?\n/)
    .find((entry) => entry.startsWith(marker));
  assert(line, "Voice line sync smoke did not emit a structured Studio result");
  return JSON.parse(line.slice(marker.length));
}

async function fetchTalkTurnMeta(turnId) {
  const headers = {
    "X-APP-TOKEN": "them-dev",
  };
  const userId = readDefaultString("user_id");
  const clientToken = readDefaultString("client_token");
  if (userId) headers["X-User-Id"] = userId;
  if (clientToken) headers["X-Client-Token"] = clientToken;
  const response = await fetch(`http://127.0.0.1:3000/talk/turn/${encodeURIComponent(String(turnId || "").trim())}`, {
    method: "GET",
    headers,
  });
  const payload = await response.json().catch(() => ({}));
  if (response.status === 403 || response.status === 404) {
    return null;
  }
  assert.equal(response.status, 200, `Expected talk turn meta for ${turnId}, got ${response.status}: ${JSON.stringify(payload)}`);
  return payload;
}

function parseIsoMillis(value) {
  const millis = Date.parse(String(value || ""));
  return Number.isFinite(millis) ? millis : NaN;
}

const prompt = "Write exactly this screenplay block and nothing else: INT. DINER - NIGHT\\n\\nLUCY\\nI can do this.\\n\\nFRANK\\nMove.";
const output = runSmoke({
  STUDIO_CMDRETURN_SCENARIO: "voice-early-paint",
  STUDIO_CMDRETURN_VOICE_PROMPT: prompt,
});
process.stdout.write(output);

const result = parseResult(output);
const token = Number(result?.commandReceivedToken || result?.voiceResult?.token || readDefaultString("studio_debug_voice_turn_command_received_token") || 0);
const tokenSnapshot = token > 0
  ? readDefaultsJSON(`studio_debug_voice_turn_result_json_${token}`)
  : null;
const breadcrumbs = Array.isArray(result?.voiceResult?.breadcrumbs)
  ? result.voiceResult.breadcrumbs
  : (Array.isArray(tokenSnapshot?.breadcrumbs) ? tokenSnapshot.breadcrumbs : []);
const events = breadcrumbs.map((entry) => String(entry?.event || ""));
const cueEvents = breadcrumbs.filter((entry) => String(entry?.event || "") === "synced_insert_cue_applied");
const turnMeta = await fetchTalkTurnMeta(result?.voiceTurn || result?.voiceResult?.turnID || tokenSnapshot?.turnID || "");
const screenplayOutput = turnMeta?.screenplay_output || {
  target: String(result?.voiceTurnMeta?.screenplay_output?.target || tokenSnapshot?.screenplayOutputTarget || "").trim(),
  text: String(result?.voiceTurnMeta?.screenplay_output?.text || tokenSnapshot?.screenplayOutputText || "").trim(),
};
const screenplayCues = Array.isArray(turnMeta?.screenplay_cues) && turnMeta.screenplay_cues.length
  ? turnMeta.screenplay_cues
  : (Array.isArray(result?.voiceTurnMeta?.screenplay_cues) && result.voiceTurnMeta.screenplay_cues.length
    ? result.voiceTurnMeta.screenplay_cues
    : (Array.isArray(tokenSnapshot?.screenplayCues) ? tokenSnapshot.screenplayCues : []));
const timingSource = String(turnMeta?.timing_source || result?.voiceTurnMeta?.timing_source || tokenSnapshot?.timingSource || "").trim();
const playbackStartedAtMs = parseIsoMillis(result?.voiceResult?.playbackStartedAtISO8601 || tokenSnapshot?.playbackStartedAtISO8601);

assert(events.includes("synced_insert_started"), "Voice line sync smoke did not start a synced insert");
assert(cueEvents.length >= 2, `Voice line sync smoke expected multiple cue applications, got ${cueEvents.length}`);
assert(events.includes("request_committed"), "Voice line sync smoke did not record a page commit");
assert(Boolean(String(result?.voiceResult?.insertedPreview || tokenSnapshot?.insertedPreview || "").trim()), "Voice line sync smoke did not preserve inserted preview text");
assert.equal(String(screenplayOutput?.target || "").trim(), "page", "Voice line sync smoke turn meta did not target the page");
assert.equal(timingSource, "tts_segmented", `Voice line sync smoke expected tts_segmented timing source, got ${timingSource || "empty"}`);
assert.equal(String(screenplayOutput?.text || "").trim(), String(result?.voiceResult?.insertedPreview || tokenSnapshot?.insertedPreview || "").trim(), "Voice line sync smoke inserted preview drifted from typed screenplay output");
assert(screenplayCues.length >= 2, `Voice line sync smoke expected multiple cues, got ${screenplayCues.length}`);
assert(Number.isFinite(playbackStartedAtMs), "Voice line sync smoke did not expose playback start timing");

const cue1DeltaMs = parseIsoMillis(cueEvents[0]?.timestampISO8601) - playbackStartedAtMs;
const cue2DeltaMs = parseIsoMillis(cueEvents[1]?.timestampISO8601) - playbackStartedAtMs;
assert(cue1DeltaMs >= -120, `Voice line sync smoke first cue appeared before playback start: ${cue1DeltaMs}ms`);
assert(cue1DeltaMs <= Math.max(500, Number(screenplayCues[0]?.end_ms || 0) + 350), `Voice line sync smoke first cue landed too late: ${cue1DeltaMs}ms`);
assert(cue2DeltaMs >= Math.max(0, Number(screenplayCues[1]?.start_ms || 0) - 250), `Voice line sync smoke second cue appeared too early: ${cue2DeltaMs}ms vs ${screenplayCues[1]?.start_ms || 0}ms`);

console.log(`voice line sync smoke passed with ${cueEvents.length} cue applications`);
