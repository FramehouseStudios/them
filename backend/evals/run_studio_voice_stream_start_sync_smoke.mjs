import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { withDeterministicStudioVoiceBackend } from "./studio_voice_sync_test_backend.mjs";

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
  try {
    const raw = execFileSync("defaults", ["read", "io.them.them", key], {
      encoding: "utf8",
    }).trim();
    return JSON.parse(raw);
  } catch {
    return null;
  }
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
  assert(line, "Voice stream-start sync smoke did not emit a structured Studio result");
  return JSON.parse(line.slice(marker.length));
}

async function fetchTalkTurnMeta(baseUrl, appToken, turnId) {
  const headers = {
    "X-APP-TOKEN": appToken,
  };
  const userId = readDefaultString("user_id");
  const clientToken = readDefaultString("client_token");
  if (userId) headers["X-User-Id"] = userId;
  if (clientToken) headers["X-Client-Token"] = clientToken;
  const response = await fetch(`${baseUrl}/talk/turn/${encodeURIComponent(String(turnId || "").trim())}`, {
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

function normalizeText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

const prompt = "Render exactly this screenplay block verbatim on the page, with no commentary: INT. DINER - NIGHT\\n\\nLUCY\\nI can do this, but you need to tell me the truth before that door opens.\\n\\nFRANK\\nThen stop shaking and move.\\n\\nLucy grabs her coat and forces herself toward the exit.";
await withDeterministicStudioVoiceBackend(
  async ({ baseUrl, appToken }) => {
    const output = runSmoke({
      THEM_BASE_URL: baseUrl,
      STUDIO_CMDRETURN_ALLOW_SNAPSHOT_ONLY_VOICE_TURN: "1",
      STUDIO_CMDRETURN_SCENARIO: "voice-early-paint",
      STUDIO_CMDRETURN_VOICE_PROMPT: prompt,
    });
    process.stdout.write(output);

    const result = parseResult(output);
    const token = Number(
      result?.commandReceivedToken
      || result?.voiceResult?.token
      || readDefaultString("studio_debug_voice_turn_command_received_token")
      || 0
    );
    const tokenSnapshot = token > 0
      ? readDefaultsJSON(`studio_debug_voice_turn_result_json_${token}`)
      : null;
    const voiceResult = result?.voiceResult || tokenSnapshot || {};
    const breadcrumbs = Array.isArray(voiceResult?.breadcrumbs)
      ? voiceResult.breadcrumbs
      : (Array.isArray(tokenSnapshot?.breadcrumbs) ? tokenSnapshot.breadcrumbs : []);
    const events = breadcrumbs.map((entry) => String(entry?.event || ""));
    const resolvedTurnId = String(
      result?.voiceTurn || voiceResult?.turnID || tokenSnapshot?.turnID || ""
    ).trim();
    const turnMeta = resolvedTurnId
      ? await fetchTalkTurnMeta(baseUrl, appToken, resolvedTurnId)
      : null;
    const screenplayOutput = turnMeta?.screenplay_output || {
      target: String(result?.voiceTurnMeta?.screenplay_output?.target || tokenSnapshot?.screenplayOutputTarget || "").trim(),
      text: String(result?.voiceTurnMeta?.screenplay_output?.text || tokenSnapshot?.screenplayOutputText || "").trim(),
    };
    const screenplayCues = Array.isArray(turnMeta?.screenplay_cues) && turnMeta.screenplay_cues.length
      ? turnMeta.screenplay_cues
      : (Array.isArray(result?.voiceTurnMeta?.screenplay_cues) && result.voiceTurnMeta.screenplay_cues.length
        ? result.voiceTurnMeta.screenplay_cues
        : (Array.isArray(tokenSnapshot?.screenplayCues) ? tokenSnapshot.screenplayCues : []));
    const playbackStartSource = String(
      voiceResult?.playbackStartSource
      || tokenSnapshot?.playbackStartSource
      || ""
    ).trim();
    const firstAudioSegmentReadyAtMs = parseIsoMillis(
      voiceResult?.firstAudioSegmentReadyAtISO8601
      || tokenSnapshot?.firstAudioSegmentReadyAtISO8601
    );
    const playbackStartedAtMs = parseIsoMillis(
      voiceResult?.playbackStartedAtISO8601
      || tokenSnapshot?.playbackStartedAtISO8601
    );
    const talkResponseReceivedAtMs = parseIsoMillis(
      voiceResult?.talkResponseReceivedAtISO8601
      || result?.talkResponseReceivedAtISO8601
      || tokenSnapshot?.talkResponseReceivedAtISO8601
    );
    const syncedVoiceCueCount = Number(
      voiceResult?.syncedVoiceCueCount
      || tokenSnapshot?.syncedVoiceCueCount
      || 0
    );
    const syncedVoiceCueDensified = Boolean(
      voiceResult?.syncedVoiceCueDensified
      ?? tokenSnapshot?.syncedVoiceCueDensified
    );
    const syncedVoiceFallbackCommitted = Boolean(
      voiceResult?.syncedVoiceFallbackCommitted
      ?? tokenSnapshot?.syncedVoiceFallbackCommitted
    );
    const finalCommittedPageText = normalizeText(
      result?.finalCommittedPageText
      || voiceResult?.finalCommittedPageText
      || tokenSnapshot?.finalCommittedPageText
      || result?.latestEntry?.insertedText
      || ""
    );
    const screenplayOutputText = normalizeText(screenplayOutput?.text || "");
    const firstAudioSegmentReadyIndex = events.indexOf("first_audio_segment_ready");
    const playbackStartedIndex = events.indexOf("assistant_playback_started");
    const talkResponseReceivedIndex = events.indexOf("talk_response_received");

    assert(events.includes("first_audio_segment_ready"), "Voice stream-start sync smoke did not record first_audio_segment_ready");
    assert.equal(playbackStartSource, "streamed_first_segment", `Voice stream-start sync smoke expected streamed_first_segment playback, got ${playbackStartSource || "empty"}`);
    assert(Number.isFinite(firstAudioSegmentReadyAtMs), "Voice stream-start sync smoke did not expose first audio segment readiness timing");
    assert(Number.isFinite(playbackStartedAtMs), "Voice stream-start sync smoke did not expose playback start timing");
    assert(Number.isFinite(talkResponseReceivedAtMs), "Voice stream-start sync smoke did not expose talk response completion timing");
    assert(playbackStartedAtMs >= firstAudioSegmentReadyAtMs, `Voice stream-start sync smoke started playback before the first segment was ready: ready=${firstAudioSegmentReadyAtMs} playback=${playbackStartedAtMs}`);
    assert(firstAudioSegmentReadyIndex >= 0, "Voice stream-start sync smoke did not capture first_audio_segment_ready ordering");
    assert(playbackStartedIndex >= 0, "Voice stream-start sync smoke did not capture assistant_playback_started ordering");
    assert(talkResponseReceivedIndex >= 0, "Voice stream-start sync smoke did not capture talk_response_received ordering");
    assert(firstAudioSegmentReadyIndex <= playbackStartedIndex, `Voice stream-start sync smoke recorded playback before first segment readiness in breadcrumb order: ready=${firstAudioSegmentReadyIndex} playback=${playbackStartedIndex}`);
    assert(playbackStartedIndex < talkResponseReceivedIndex, `Voice stream-start sync smoke did not start playback before the full talk response arrived in breadcrumb order: playback=${playbackStartedIndex} response=${talkResponseReceivedIndex}`);
    assert.equal(String(screenplayOutput?.target || "").trim(), "page", "Voice stream-start sync smoke turn meta did not target the page");
    assert.equal(syncedVoiceFallbackCommitted, false, "Voice stream-start sync smoke unexpectedly fell back instead of staying synced");
    assert(screenplayCues.length >= 2, `Voice stream-start sync smoke expected multiple backend cues, got ${screenplayCues.length}`);
    assert(syncedVoiceCueCount > screenplayCues.length, `Voice stream-start sync smoke expected densified client cues, got client=${syncedVoiceCueCount} backend=${screenplayCues.length}`);
    assert.equal(syncedVoiceCueDensified, true, "Voice stream-start sync smoke did not mark cue densification in snapshot state");
    assert(finalCommittedPageText, "Voice stream-start sync smoke did not surface final committed page text");
    assert.equal(finalCommittedPageText, screenplayOutputText, "Voice stream-start sync smoke final committed text drifted from screenplay_output.text");

    console.log("voice stream-start sync smoke passed with early playback before talk completion");
  },
  {
    streamAudioEnabled: true,
    streamEndDelayMs: 420,
  },
);
