import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { startBackend } from "./helpers/backend_test_server.mjs";

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = resolve(THIS_DIR, "..");
const DOTENV_PATH = resolve(BACKEND_DIR, ".env");
const WAV_PATH = resolve(BACKEND_DIR, "test.wav");
const DEFAULT_BASE_URL = String(process.env.TEST_BACKEND_URL || "http://127.0.0.1:3000");
const SPAWN_BACKEND_FOR_TESTS = String(process.env.TEST_SPAWN_BACKEND || "") === "1";
const TALK_TEST_ENFORCE = String(process.env.TALK_TEST_ENFORCE || "").trim().toLowerCase();
const TALK_TEST_RECOVERY_ONLY = String(process.env.TALK_TEST_RECOVERY_ONLY || "").trim().toLowerCase();

function parseDotEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  const output = {};
  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
    output[key] = value;
  }
  return output;
}

function lowerHeaderMap(headers) {
  const map = {};
  for (const [key, value] of headers.entries()) {
    map[String(key || "").toLowerCase()] = String(value || "");
  }
  return map;
}

function decodeHeaderValue(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    return decodeURIComponent(raw);
  } catch (_) {
    return raw;
  }
}

function decodeHeaderJson(value) {
  const decoded = decodeHeaderValue(value);
  if (!decoded) return null;
  try {
    return JSON.parse(decoded);
  } catch (_) {
    return null;
  }
}

function assertDialogueTimeline(
  timeline,
  {
    expectedText = "",
    expectedDocumentRevisionId = "",
    expectedSceneId = "",
    expectedBeatId = "",
    expectedFirstScriptNodeId = "",
    expectedInsertMode = "",
    expectedInsertionAnchorLine = 0,
    expectedInsertionAnchorEndLine = 0,
    expectedFirstSegmentAnchorLine = 0,
  } = {}
) {
  assert.ok(timeline && typeof timeline === "object", "missing dialogue timeline payload");
  assert.ok(String(timeline.turn_id || "").trim(), "dialogue timeline missing turn_id");
  assert.ok(String(timeline.revision_id || "").trim(), "dialogue timeline missing revision_id");
  assert.ok(Number(timeline.duration_ms || 0) > 0, "dialogue timeline missing duration_ms");
  assert.ok(timeline.insertion_anchor && typeof timeline.insertion_anchor === "object", "dialogue timeline missing insertion_anchor");
  assert.ok(Array.isArray(timeline.segments), "dialogue timeline missing segments");
  assert.ok(timeline.segments.length > 0, "dialogue timeline expected at least one segment");
  const firstSegment = timeline.segments[0];
  assert.ok(String(firstSegment.line_id || "").trim(), "dialogue timeline segment missing line_id");
  assert.ok(firstSegment.page_anchor && typeof firstSegment.page_anchor === "object", "dialogue timeline segment missing page_anchor");
  assert.ok(String(firstSegment.page_anchor.script_node_id || "").trim(), "dialogue timeline segment missing script_node_id");
  assert.ok(Array.isArray(firstSegment.reveal_units), "dialogue timeline segment missing reveal_units");
  assert.ok(firstSegment.reveal_units.length > 0, "dialogue timeline segment expected at least one reveal_unit");
  if (expectedDocumentRevisionId) {
    assert.equal(String(timeline.document_revision_id || "").trim(), expectedDocumentRevisionId);
  }
  if (expectedSceneId) {
    assert.equal(String(timeline.insertion_anchor?.scene_id || "").trim(), expectedSceneId);
    assert.equal(String(firstSegment.page_anchor?.scene_id || "").trim(), expectedSceneId);
  }
  if (expectedBeatId) {
    assert.equal(String(timeline.insertion_anchor?.beat_id || "").trim(), expectedBeatId);
    assert.equal(String(firstSegment.page_anchor?.beat_id || "").trim(), expectedBeatId);
  }
  if (expectedFirstScriptNodeId) {
    assert.equal(String(firstSegment.page_anchor?.script_node_id || "").trim(), expectedFirstScriptNodeId);
  }
  if (expectedInsertMode) {
    assert.equal(String(timeline.insertion_anchor?.insert_mode || "").trim(), expectedInsertMode);
    assert.equal(String(firstSegment.page_anchor?.insert_mode || "").trim(), expectedInsertMode);
  }
  if (expectedInsertionAnchorLine > 0) {
    assert.equal(Number(timeline.insertion_anchor?.anchor_line || 0), expectedInsertionAnchorLine);
  }
  if (expectedInsertionAnchorEndLine > 0) {
    assert.equal(Number(timeline.insertion_anchor?.anchor_end_line || 0), expectedInsertionAnchorEndLine);
  }
  if (expectedFirstSegmentAnchorLine > 0) {
    assert.equal(Number(firstSegment.page_anchor?.anchor_line || 0), expectedFirstSegmentAnchorLine);
    assert.equal(Number(firstSegment.page_anchor?.anchor_end_line || 0), expectedFirstSegmentAnchorLine);
  }
  if (expectedText) {
    const joined = timeline.segments.map((segment) => String(segment.text || "").trim()).filter(Boolean).join("\n");
    assert.ok(joined.length > 0, "dialogue timeline joined segment text should not be empty");
  }
}

async function waitForHealth(url, timeoutMs = 20_000) {
  const startedAt = Date.now();
  while ((Date.now() - startedAt) < timeoutMs) {
    try {
      const res = await fetch(`${url}/health`);
      if (res.status === 200) return true;
    } catch (_) {
      // server not ready yet
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  return false;
}

const envFile = parseDotEnvFile(DOTENV_PATH);
const APP_TOKEN = process.env.APP_TOKEN || envFile.APP_TOKEN || "them-dev";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || envFile.OPENAI_API_KEY || "";
const TALK_TESTS_ENABLED = Boolean(OPENAI_API_KEY) || SPAWN_BACKEND_FOR_TESTS;
const TALK_TESTS_REQUIRED = TALK_TEST_ENFORCE === "1" || TALK_TEST_ENFORCE === "true" || TALK_TEST_ENFORCE === "yes";
const RECOVERY_ONLY_MODE = TALK_TEST_RECOVERY_ONLY === "1" || TALK_TEST_RECOVERY_ONLY === "true" || TALK_TEST_RECOVERY_ONLY === "yes";
const TALK_TEST_DEBUG_FAILURE_ENABLED = (() => {
  const raw = String(
    process.env.TALK_TEST_DEBUG_FAILURE_ENABLED ??
    envFile.TALK_TEST_DEBUG_FAILURE_ENABLED ??
    ""
  ).trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
})();
const FORCED_FAILURE_TEST_ENABLED = TALK_TESTS_ENABLED && (SPAWN_BACKEND_FOR_TESTS || TALK_TEST_DEBUG_FAILURE_ENABLED);
const LIVE_PAGE_SYNC_TEST_ENABLED = (() => {
  const raw = String(process.env.TALK_TEST_PAGE_SYNC_LIVE || envFile.TALK_TEST_PAGE_SYNC_LIVE || "").trim().toLowerCase();
  return (raw === "1" || raw === "true" || raw === "yes") && Boolean(OPENAI_API_KEY);
})();

if (TALK_TESTS_REQUIRED && !TALK_TESTS_ENABLED) {
  throw new Error(
    "TALK_TEST_ENFORCE=1 requires OPENAI_API_KEY (env or backend/.env) so reliability tests cannot be silently skipped."
  );
}

let serverProc = null;
let testAudioBuffer = null;
let clientToken = "";
let lastTurnId = "";
let baseUrl = DEFAULT_BASE_URL;
let appToken = APP_TOKEN;

before(async () => {
  assert.ok(existsSync(WAV_PATH), `Missing test audio fixture: ${WAV_PATH}`);
  testAudioBuffer = readFileSync(WAV_PATH);
  assert.ok(testAudioBuffer.length > 0, "test.wav is empty");

  if (SPAWN_BACKEND_FOR_TESTS) {
    serverProc = await startBackend({
      env: {
        REQUIRE_USER_AUTH: "0",
        TALK_TEST_DEBUG_TRANSCRIPT_ENABLED: "1",
        TALK_TEST_DEBUG_FAILURE_ENABLED: "1",
        TALK_TEST_DEBUG_OFFLINE_ENABLED: "1",
        TALK_STREAM_AUDIO_ENABLED: "0",
      },
    });
    baseUrl = serverProc.baseUrl;
    appToken = serverProc.env.APP_TOKEN;
  }

  if (!SPAWN_BACKEND_FOR_TESTS) {
    const healthy = await waitForHealth(baseUrl, 25_000);
    assert.equal(
      healthy,
      true,
      `Backend not reachable at ${baseUrl}. Start it first, or run with TEST_SPAWN_BACKEND=1.`
    );
  }

  const sessionRes = await fetch(`${baseUrl}/session`, {
    method: "POST",
    headers: {
      "X-APP-TOKEN": appToken,
    },
  });
  assert.equal(sessionRes.status, 201, `POST /session failed: ${sessionRes.status}`);
  const sessionJson = await sessionRes.json();
  clientToken = String(sessionJson?.client_token || "").trim();
  assert.ok(clientToken, "No client_token returned from /session");
});

after(async () => {
  await serverProc?.stop();
  serverProc = null;
});

async function postTalk(debugTranscript, options = {}) {
  const extraHeaders = options?.headers && typeof options.headers === "object"
    ? options.headers
    : {};
  const extraFields = options?.fields && typeof options.fields === "object"
    ? options.fields
    : {};
  const form = new FormData();
  form.append("debug_transcript", String(debugTranscript || "").trim());
  for (const [fieldKey, fieldValue] of Object.entries(extraFields)) {
    if (fieldValue == null) continue;
    form.append(String(fieldKey), String(fieldValue));
  }
  form.append("file", new Blob([testAudioBuffer], { type: "audio/wav" }), "test.wav");

  const res = await fetch(`${baseUrl}/talk`, {
    method: "POST",
    headers: {
      "X-APP-TOKEN": appToken,
      "X-Client-Token": clientToken,
      ...extraHeaders,
    },
    body: form,
  });
  const audio = Buffer.from(await res.arrayBuffer());
  const headers = lowerHeaderMap(res.headers);
  return { res, audio, headers };
}

async function getTurnMeta(turnId) {
  const response = await fetch(`${baseUrl}/talk/turn/${encodeURIComponent(String(turnId || ""))}`, {
    headers: {
      "X-APP-TOKEN": appToken,
      "X-Client-Token": clientToken,
    },
  });
  const text = await response.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch (_) {
    body = {};
  }
  return { response, body, raw: text };
}

async function getState() {
  const response = await fetch(`${baseUrl}/state`, {
    headers: {
      "X-APP-TOKEN": appToken,
      "X-Client-Token": clientToken,
    },
  });
  const text = await response.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch (_) {
    body = {};
  }
  return { response, body, raw: text };
}

test(
  "talk returns audio with commit headers",
  { timeout: 120_000, skip: !TALK_TESTS_ENABLED || RECOVERY_ONLY_MODE },
  async () => {
    const { res, audio, headers } = await postTalk("hello from integration test");
    assert.equal(res.status, 200, `POST /talk status=${res.status}`);
    assert.equal(String(headers["content-type"] || "").toLowerCase().startsWith("audio/mpeg"), true);
    assert.ok(audio.length > 1024, `audio too small: ${audio.length}`);

    const turnId = String(headers["x-turn-id"] || "").trim();
    assert.ok(turnId, "missing x-turn-id");
    assert.ok(String(headers["x-session-id"] || "").trim(), "missing x-session-id");
    assert.ok(String(headers["x-state-version"] || "").trim(), "missing x-state-version");
    assert.equal(String(headers["x-turn-status"] || "").trim(), "responded");
    assert.equal(String(headers["x-turn-meta-available"] || "").trim(), "1");
    lastTurnId = turnId;
  }
);

test(
  "talk turn endpoint returns transcript and reply",
  { timeout: 120_000, skip: !TALK_TESTS_ENABLED || RECOVERY_ONLY_MODE },
  async () => {
    assert.ok(lastTurnId, "missing lastTurnId from previous test");
    const { response, body, raw } = await getTurnMeta(lastTurnId);
    assert.equal(response.status, 200, `GET /talk/turn failed status=${response.status} body=${raw}`);
    assert.equal(String(body.turn_id || "").trim(), lastTurnId);
    assert.ok(String(body.transcript || "").length > 0, "missing transcript in turn meta");
    assert.ok(String(body.reply || "").length > 0, "missing reply in turn meta");
    assert.equal(String(body.render_contract?.reply_role || "").trim(), "final");
    assert.equal(Boolean(body.render_contract?.authoritative_page_text_available), false);
    assert.equal(Boolean(body.render_contract?.sync_ready), false);
  }
);

test(
  "talk debug-offline page-write responses expose authoritative sync payload without chat drift",
  { timeout: 120_000, skip: !SPAWN_BACKEND_FOR_TESTS || RECOVERY_ONLY_MODE },
  async () => {
    const rawScreenplayTranscript = [
      "Absolutely - here's the continuation.",
      "",
      "INT. DINER - NIGHT",
      "",
      "Rain needles the front window while neon bleeds across the counter.",
      "",
      "MARA",
      "(low)",
      "He came back.",
      "",
      "Want me to keep going?"
    ].join("\n");
    const screenplayTranscript = [
      "INT. DINER - NIGHT",
      "",
      "Rain needles the front window while neon bleeds across the counter.",
      "",
      "MARA",
      "(low)",
      "He came back."
    ].join("\n");

    const { res, headers } = await postTalk("", {
      fields: {
        client_transcript: "Write the prepared screenplay block to the page.",
        screenplay_generation_transcript: rawScreenplayTranscript,
        screenplay_project_id: "integration-debug-sync-project",
        screenplay_document_revision_id: "integration-version-42",
        screenplay_target: "page",
        screenplay_prompt_source: "voice",
        screenplay_anchor_line: "42",
        screenplay_anchor_end_line: "48",
        screenplay_anchor_scene_label: "INT. DINER - NIGHT",
        screenplay_anchor_draft_scene_id: "draft-scene-diner",
        screenplay_anchor_outline_scene_id: "outline-scene-diner",
        screenplay_anchor_outline_beat_ids: JSON.stringify(["beat-diner"]),
        screenplay_anchor_script_node_id: "draft-scene-diner:line:42",
      },
    });
    assert.equal(res.status, 200, `POST /talk debug page-write status=${res.status}`);
    assert.equal(String(headers["x-stt-model"] || "").trim(), "client_transcript");
    assert.equal(String(headers["x-reply-role"] || "").trim(), "preview");
    assert.equal(String(headers["x-screenplay-authoritative"] || "").trim(), "1");
    assert.equal(String(headers["x-screenplay-sync-ready"] || "").trim(), "1");
    assert.equal(String(headers["x-screenplay-output-available"] || "").trim(), "1");
    assert.equal(String(headers["x-screenplay-timing-source"] || "").trim(), "fixture_estimated");
    assert.ok(Number(headers["x-audio-duration-ms"] || 0) > 0, "expected debug audio duration");
    assert.equal(decodeHeaderValue(headers["x-screenplay-target"]), "page");

    const previewReply = decodeHeaderValue(headers["x-reply"]);
    assert.ok(previewReply.length > 0, "missing preview x-reply header");

    const screenplayOutput = decodeHeaderJson(headers["x-screenplay-output"]);
    assert.ok(screenplayOutput && typeof screenplayOutput === "object", "missing x-screenplay-output payload");
    assert.equal(String(screenplayOutput.target || ""), "page");
    assert.equal(String(screenplayOutput.text || "").trim(), screenplayTranscript.trim());
    assert.ok(String(screenplayOutput.text || "").length > previewReply.length, "authoritative page text should exceed preview");

    const screenplayCues = decodeHeaderJson(headers["x-screenplay-cues"]);
    assert.ok(Array.isArray(screenplayCues), "missing x-screenplay-cues payload");
    assert.ok(screenplayCues.length > 0, "expected at least one screenplay cue");
    const dialogueTimeline = decodeHeaderJson(headers["x-dialogue-timeline"]);
    assertDialogueTimeline(dialogueTimeline, {
      expectedText: screenplayTranscript,
      expectedDocumentRevisionId: "integration-version-42",
      expectedSceneId: "outline-scene-diner",
      expectedBeatId: "beat-diner",
      expectedFirstScriptNodeId: "draft-scene-diner:line:42",
      expectedInsertMode: "replace_selection",
      expectedInsertionAnchorLine: 42,
      expectedInsertionAnchorEndLine: 48,
      expectedFirstSegmentAnchorLine: 42,
    });

    const turnId = String(headers["x-turn-id"] || "").trim();
    assert.ok(turnId, "debug page-write turn missing x-turn-id");
    const meta = await getTurnMeta(turnId);
    assert.equal(meta.response.status, 200, `GET /talk/turn failed status=${meta.response.status} body=${meta.raw}`);
    assert.equal(String(meta.body.turn_id || "").trim(), turnId);
    assert.equal(Number(meta.body.audio_duration_ms || 0) > 0, true, "turn meta missing audio duration");
    assert.equal(String(meta.body.timing_source || "").trim(), "fixture_estimated");
    assert.equal(String(meta.body.screenplay_output?.target || ""), "page");
    assert.equal(String(meta.body.screenplay_output?.text || "").trim(), screenplayTranscript.trim());
    assert.ok(Array.isArray(meta.body.screenplay_cues), "turn meta missing screenplay_cues");
    assert.ok(meta.body.screenplay_cues.length > 0, "turn meta should preserve screenplay cues");
    assertDialogueTimeline(meta.body.dialogue_timeline, {
      expectedText: screenplayTranscript,
      expectedDocumentRevisionId: "integration-version-42",
      expectedSceneId: "outline-scene-diner",
      expectedBeatId: "beat-diner",
      expectedFirstScriptNodeId: "draft-scene-diner:line:42",
      expectedInsertMode: "replace_selection",
      expectedInsertionAnchorLine: 42,
      expectedInsertionAnchorEndLine: 48,
      expectedFirstSegmentAnchorLine: 42,
    });
    assert.equal(String(meta.body.render_contract?.reply_role || "").trim(), "preview");
    assert.equal(Boolean(meta.body.render_contract?.authoritative_page_text_available), true);
    assert.equal(Boolean(meta.body.render_contract?.sync_ready), true);
  }
);

test(
  "talk page-write responses expose preview headers and authoritative sync payload",
  { timeout: 180_000, skip: !LIVE_PAGE_SYNC_TEST_ENABLED || RECOVERY_ONLY_MODE },
  async () => {
    const screenplayTranscript = [
      "Write exactly this screenplay block and nothing else:",
      "INT. DINER - NIGHT",
      "",
      "Rain needles the front window while neon bleeds across the counter.",
      "",
      "MARA",
      "(low)",
      "He came back."
    ].join("\n");

    const { res, headers } = await postTalk("", {
      fields: {
        client_transcript: screenplayTranscript,
        screenplay_project_id: "integration-sync-project",
        screenplay_target: "page",
        screenplay_prompt_source: "voice",
      },
    });
    assert.equal(res.status, 200, `POST /talk page-write status=${res.status}`);

    const turnId = String(headers["x-turn-id"] || "").trim();
    assert.ok(turnId, "page-write turn missing x-turn-id");
    assert.equal(String(headers["x-reply-role"] || "").trim(), "preview");
    assert.equal(String(headers["x-screenplay-authoritative"] || "").trim(), "1");
    assert.equal(String(headers["x-screenplay-sync-ready"] || "").trim(), "1");
    assert.equal(String(headers["x-screenplay-output-available"] || "").trim(), "1");
    assert.equal(decodeHeaderValue(headers["x-screenplay-target"]), "page");

    const previewReply = decodeHeaderValue(headers["x-reply"]);
    assert.ok(previewReply.length > 0, "missing preview x-reply header");

    const screenplayOutput = decodeHeaderJson(headers["x-screenplay-output"]);
    assert.ok(screenplayOutput && typeof screenplayOutput === "object", "missing x-screenplay-output payload");
    assert.equal(String(screenplayOutput.target || ""), "page");
    assert.ok(String(screenplayOutput.text || "").length > previewReply.length, "authoritative page text should exceed preview");

    const screenplayCues = decodeHeaderJson(headers["x-screenplay-cues"]);
    assert.ok(Array.isArray(screenplayCues), "missing x-screenplay-cues payload");
    assert.ok(screenplayCues.length > 0, "expected at least one screenplay cue");
    const dialogueTimeline = decodeHeaderJson(headers["x-dialogue-timeline"]);
    assertDialogueTimeline(dialogueTimeline);
    assert.ok(String(headers["x-screenplay-timing-source"] || "").trim(), "missing x-screenplay-timing-source");

    const meta = await getTurnMeta(turnId);
    assert.equal(meta.response.status, 200, `GET /talk/turn failed status=${meta.response.status} body=${meta.raw}`);
    assert.equal(String(meta.body.turn_id || "").trim(), turnId);
    assert.equal(String(meta.body.screenplay_output?.target || ""), "page");
    assert.equal(String(meta.body.screenplay_output?.text || "").trim(), String(screenplayOutput.text || "").trim());
    assert.ok(Array.isArray(meta.body.screenplay_cues), "turn meta missing screenplay_cues");
    assert.ok(meta.body.screenplay_cues.length > 0, "turn meta should preserve screenplay cues");
    assertDialogueTimeline(meta.body.dialogue_timeline);
    assert.equal(String(meta.body.render_contract?.reply_role || "").trim(), "preview");
    assert.equal(Boolean(meta.body.render_contract?.authoritative_page_text_available), true);
    assert.equal(Boolean(meta.body.render_contract?.sync_ready), true);
  }
);

test(
  "unrelated productivity requests stay in Clementine's companion lane",
  { timeout: 180_000, skip: !TALK_TESTS_ENABLED || RECOVERY_ONLY_MODE },
  async () => {
    for (const prompt of [
      "send email to qa@example.com subject Integration Check body This should stay conversational",
      "put a production meeting on my calendar tomorrow at three",
    ]) {
      const turn = await postTalk(prompt);
      assert.equal(turn.res.status, 200);
      assert.equal(turn.headers["x-email-status"], undefined);
      assert.equal(turn.headers["x-email-compose-url"], undefined);
      assert.equal(turn.headers["x-calendar-status"], undefined);
      assert.equal(turn.headers["x-calendar-compose-url"], undefined);
      assert.equal(String(turn.headers["x-action-lane"] || "chat"), "chat");

      const turnId = String(turn.headers["x-turn-id"] || "").trim();
      assert.ok(turnId, "turn missing x-turn-id");
      const meta = await getTurnMeta(turnId);
      assert.equal(meta.response.status, 200);
      assert.equal(
        String(meta.body.reply || "").toLowerCase().includes("say \"confirm\" to run it"),
        false,
        `abandoned productivity confirmation leaked into reply: ${meta.raw}`
      );
    }
  }
);

test(
  "talk forced runtime failure returns recovered audio contract",
  { timeout: 120_000, skip: !FORCED_FAILURE_TEST_ENABLED },
  async () => {
    const secretTranscript = "SECRET_TALK_DIAG_RUNTIME_TRANSCRIPT";
    const { res, audio, headers } = await postTalk(
      secretTranscript,
      { headers: { "X-Debug-Force-Error": "server" } }
    );
    assert.equal(res.status, 200, `POST /talk forced-error status=${res.status}`);
    assert.equal(String(headers["content-type"] || "").toLowerCase().startsWith("audio/mpeg"), true);
    assert.ok(audio.length > 1024, `recovery audio too small: ${audio.length}`);
    assert.equal(String(headers["x-turn-status"] || "").trim(), "error_recovered");
    assert.equal(decodeHeaderValue(headers["x-turn-error-stage"]).toLowerCase(), "server");
    assert.equal(decodeHeaderValue(headers["x-turn-provider-stage"]).toLowerCase(), "server");
    assert.equal(decodeHeaderValue(headers["x-turn-error-class"]).toLowerCase(), "talk_server_error");
    assert.equal(decodeHeaderValue(headers["x-talk-error-class"]).toLowerCase(), "talk_server_error");
    assert.ok(decodeHeaderValue(headers["x-request-id"]).length > 0, "missing x-request-id");
    assert.ok(decodeHeaderValue(headers["x-turn-error-message"]).includes("Reference"), "missing support reference");
    if (serverProc) {
      const logs = `${serverProc.stdout.join("")}\n${serverProc.stderr.join("")}`;
      assert.ok(!logs.includes(secretTranscript), "talk failure logs must not include transcript text");
    }
  }
);

test(
  "talk forced tts failure returns recovered audio contract",
  { timeout: 120_000, skip: !FORCED_FAILURE_TEST_ENABLED },
  async () => {
    const secretTranscript = "SECRET_TALK_DIAG_TTS_TRANSCRIPT";
    const { res, audio, headers } = await postTalk(
      secretTranscript,
      { headers: { "X-Debug-Force-Error": "tts" } }
    );
    assert.equal(res.status, 200, `POST /talk forced-tts-error status=${res.status}`);
    assert.equal(String(headers["content-type"] || "").toLowerCase().startsWith("audio/mpeg"), true);
    assert.ok(audio.length > 1024, `recovery audio too small: ${audio.length}`);
    assert.equal(String(headers["x-turn-status"] || "").trim(), "error_recovered");
    assert.equal(decodeHeaderValue(headers["x-turn-error-stage"]).toLowerCase(), "tts");
    assert.equal(decodeHeaderValue(headers["x-turn-provider-stage"]).toLowerCase(), "tts");
    assert.equal(decodeHeaderValue(headers["x-turn-error-class"]).toLowerCase(), "provider_unavailable");
    assert.equal(decodeHeaderValue(headers["x-talk-error-class"]).toLowerCase(), "provider_unavailable");
    assert.ok(decodeHeaderValue(headers["x-request-id"]).length > 0, "missing x-request-id");
    assert.ok(decodeHeaderValue(headers["x-turn-error-message"]).includes("Reference"), "missing support reference");
    if (serverProc) {
      const logs = `${serverProc.stdout.join("")}\n${serverProc.stderr.join("")}`;
      assert.ok(!logs.includes(secretTranscript), "talk failure logs must not include transcript text");
    }
  }
);

test(
  "talk exhausted screenplay quality returns recovery without mutating the draft session",
  { timeout: 120_000, skip: !SPAWN_BACKEND_FOR_TESTS || RECOVERY_ONLY_MODE },
  async () => {
    const before = await getState();
    assert.equal(before.response.status, 200, `GET /state before failed: ${before.raw}`);

    const { res, audio, headers } = await postTalk("", {
      headers: { "X-Debug-Force-Error": "screenplay_quality" },
      fields: {
        client_transcript: "Continue the screenplay with the prepared page.",
        screenplay_generation_transcript: [
          "INT. FERRY TERMINAL - NIGHT",
          "",
          "Mara closes her hand around the final ticket.",
          "",
          "MARA",
          "We go together.",
        ].join("\n"),
        screenplay_project_id: "integration-quality-recovery-project",
        screenplay_target: "page",
        screenplay_prompt_source: "voice",
        screenplay_anchor_scene_label: "INT. FERRY TERMINAL - NIGHT",
      },
    });

    assert.equal(res.status, 200, `POST /talk screenplay-quality status=${res.status}`);
    assert.equal(String(headers["content-type"] || "").toLowerCase().startsWith("audio/mpeg"), true);
    assert.ok(audio.length > 1024, `recovery audio too small: ${audio.length}`);
    assert.equal(String(headers["x-turn-status"] || "").trim(), "error_recovered");
    assert.equal(decodeHeaderValue(headers["x-turn-error-stage"]), "chat");
    assert.equal(decodeHeaderValue(headers["x-turn-error-class"]), "screenplay_page_quality_failed");
    assert.equal(String(headers["x-screenplay-output-available"] || ""), "0");
    assert.equal(String(headers["x-screenplay-authoritative"] || ""), "0");
    assert.equal(String(headers["x-screenplay-sync-ready"] || ""), "0");
    assert.equal(String(headers["x-screenplay-quality-ok"] || ""), "0");
    assert.equal(String(headers["x-screenplay-repair-outcome"] || ""), "exhausted");
    assert.equal(String(headers["x-turn-meta-available"] || ""), "0");
    assert.equal(String(headers["x-turn-id"] || ""), "");
    assert.match(decodeHeaderValue(headers["x-turn-error-message"]), /draft was left unchanged/i);

    const after = await getState();
    assert.equal(after.response.status, 200, `GET /state after failed: ${after.raw}`);
    assert.deepEqual(
      after.body.history_delta,
      before.body.history_delta,
      "an exhausted page-quality turn must not persist a user/assistant history pair"
    );
  }
);
