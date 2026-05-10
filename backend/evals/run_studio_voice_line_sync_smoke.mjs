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

const prompt = "Render exactly this screenplay block verbatim on the page, with no commentary: INT. DINER - NIGHT\\n\\nLUCY\\nI can do this, but you need to tell me the truth before that door opens.\\n\\nFRANK\\nThen stop shaking and move.\\n\\nLucy grabs her coat and forces herself toward the exit.";
await withDeterministicStudioVoiceBackend(async ({ baseUrl, appToken }) => {
  const output = runSmoke({
    THEM_BASE_URL: baseUrl,
    STUDIO_CMDRETURN_ALLOW_SNAPSHOT_ONLY_VOICE_TURN: "1",
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
  const resolvedTurnId = String(
    result?.voiceTurn || result?.voiceResult?.turnID || tokenSnapshot?.turnID || ""
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
  const dialogueTimeline = (
    turnMeta?.dialogue_timeline && typeof turnMeta.dialogue_timeline === "object"
      ? turnMeta.dialogue_timeline
      : (result?.voiceTurnMeta?.dialogue_timeline && typeof result.voiceTurnMeta.dialogue_timeline === "object"
        ? result.voiceTurnMeta.dialogue_timeline
        : (result?.voiceResult?.dialogueTimeline && typeof result.voiceResult.dialogueTimeline === "object"
          ? result.voiceResult.dialogueTimeline
          : (tokenSnapshot?.dialogueTimeline && typeof tokenSnapshot.dialogueTimeline === "object"
            ? tokenSnapshot.dialogueTimeline
            : null)))
  );
  const timingSource = String(turnMeta?.timing_source || result?.voiceTurnMeta?.timing_source || tokenSnapshot?.timingSource || "").trim();
  const playbackStartedAtMs = parseIsoMillis(result?.voiceResult?.playbackStartedAtISO8601 || tokenSnapshot?.playbackStartedAtISO8601);
  const syncedVoiceFallbackCommitted = Boolean(
    result?.voiceResult?.syncedVoiceFallbackCommitted
    ?? tokenSnapshot?.syncedVoiceFallbackCommitted
  );
  const syncedVoiceAppliedCueCount = Number(
    result?.voiceResult?.syncedVoiceAppliedCueCount
    || tokenSnapshot?.syncedVoiceAppliedCueCount
    || 0
  );
  const syncedVoiceCueCount = Number(
    result?.voiceResult?.syncedVoiceCueCount
    || tokenSnapshot?.syncedVoiceCueCount
    || 0
  );
  const syncedVoiceActiveSceneID = String(
    result?.voiceResult?.syncedVoiceActiveSceneID
    || tokenSnapshot?.syncedVoiceActiveSceneID
    || ""
  ).trim();
  const syncedVoiceActiveScriptNodeID = String(
    result?.voiceResult?.syncedVoiceActiveScriptNodeID
    || tokenSnapshot?.syncedVoiceActiveScriptNodeID
    || ""
  ).trim();
  const hasCueBreadcrumbProgress = cueEvents.length >= 2;

  assert(events.includes("synced_insert_started"), "Voice line sync smoke did not start a synced insert");
  assert(
    hasCueBreadcrumbProgress || syncedVoiceAppliedCueCount >= 2,
    `Voice line sync smoke expected synced cue progress, got breadcrumbs=${cueEvents.length} applied=${syncedVoiceAppliedCueCount}`
  );
  assert(events.includes("request_committed"), "Voice line sync smoke did not record a page commit");
  assert(Boolean(String(result?.voiceResult?.insertedPreview || tokenSnapshot?.insertedPreview || "").trim()), "Voice line sync smoke did not preserve inserted preview text");
  assert.equal(syncedVoiceFallbackCommitted, false, "Voice line sync smoke unexpectedly fell back instead of staying synced");
  assert.equal(String(screenplayOutput?.target || "").trim(), "page", "Voice line sync smoke turn meta did not target the page");
  assert(["tts_segmented", "fixture_estimated"].includes(timingSource), `Voice line sync smoke expected a sync timing source, got ${timingSource || "empty"}`);
  assert.equal(String(screenplayOutput?.text || "").trim(), String(result?.voiceResult?.insertedPreview || tokenSnapshot?.insertedPreview || "").trim(), "Voice line sync smoke inserted preview drifted from typed screenplay output");
  assert(screenplayCues.length >= 2, `Voice line sync smoke expected multiple cues, got ${screenplayCues.length}`);
  assert(Number.isFinite(playbackStartedAtMs), "Voice line sync smoke did not expose playback start timing");
  assert(syncedVoiceAppliedCueCount >= 2, `Voice line sync smoke expected synced cue progress in snapshot state, got ${syncedVoiceAppliedCueCount}`);
  assert(
    syncedVoiceCueCount > screenplayCues.length,
    `Voice line sync smoke expected client phrase densification beyond backend line cues, got client=${syncedVoiceCueCount} backend=${screenplayCues.length}`
  );
  assert(dialogueTimeline && Array.isArray(dialogueTimeline.segments) && dialogueTimeline.segments.length > 0, "Voice line sync smoke turn meta did not expose a dialogue timeline");
  assert(String(dialogueTimeline?.segments?.[0]?.page_anchor?.scene_id || "").trim(), "Voice line sync smoke dialogue timeline missing scene_id");
  assert(String(dialogueTimeline?.segments?.[0]?.page_anchor?.script_node_id || "").trim(), "Voice line sync smoke dialogue timeline missing script_node_id");
  assert(syncedVoiceActiveSceneID.length > 0, "Voice line sync smoke did not expose an active synced scene id");
  assert(
    syncedVoiceActiveScriptNodeID.includes(":node:"),
    `Voice line sync smoke expected a persistent screenplay node id, got ${syncedVoiceActiveScriptNodeID || "<missing>"}`
  );

  if (hasCueBreadcrumbProgress) {
    const cue1DeltaMs = parseIsoMillis(cueEvents[0]?.timestampISO8601) - playbackStartedAtMs;
    const cue2DeltaMs = parseIsoMillis(cueEvents[1]?.timestampISO8601) - playbackStartedAtMs;
    assert(cue1DeltaMs >= -120, `Voice line sync smoke first cue appeared before playback start: ${cue1DeltaMs}ms`);
    assert(cue1DeltaMs <= Math.max(500, Number(screenplayCues[0]?.end_ms || 0) + 350), `Voice line sync smoke first cue landed too late: ${cue1DeltaMs}ms`);
    assert(cue2DeltaMs >= Math.max(0, Number(screenplayCues[1]?.start_ms || 0) - 250), `Voice line sync smoke second cue appeared too early: ${cue2DeltaMs}ms vs ${screenplayCues[1]?.start_ms || 0}ms`);
    assert(cue2DeltaMs <= Math.max(700, Number(screenplayCues[1]?.end_ms || 0) + 350), `Voice line sync smoke second cue landed too late: ${cue2DeltaMs}ms`);
  }

  console.log(`voice line sync smoke passed with ${Math.max(cueEvents.length, syncedVoiceAppliedCueCount)} cue applications`);
});
