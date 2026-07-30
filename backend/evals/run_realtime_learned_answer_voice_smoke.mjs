// Deterministic production-boundary smoke. This runs the real auth,
// persistence, turn-commit, grounding-refresh, and bridge runtime paths with
// a simulated realtime provider. It proves the next spoken-event contract,
// not live-model instruction adherence or acoustic voice quality.

import assert from "node:assert/strict";
import { rmSync, writeFileSync } from "node:fs";

import { createPersistence } from "../lib/persistence_adapter.js";
import { startBackend } from "../tests/helpers/backend_test_server.mjs";
import { RealtimeBridgeRuntimeSimulator } from "../tests/helpers/realtime_bridge_simulator.mjs";
import {
  createStudioRestoreOwnerIdentity,
  requestStudioRestoreJSON,
  studioRestoreOwnerHeaders,
} from "./studio_restore_seed_helper.mjs";

const APP_TOKEN = "them-realtime-learned-answer-smoke";
const PROJECT_ID = "split-ferries-voice-loop";
const PROJECT_TITLE = "Split Ferries";
const QUESTION_ID = "voice-loop-character-want";
const QUESTION = "What does Mara want enough to risk becoming her father?";
const ANSWER = "Free Eli without becoming her father.";
const BASE_INSTRUCTIONS = [
  "You are Clementine, Mara's emotionally intelligent screenwriting partner.",
  "Ask only the single server-planned question, then use confirmed project truth.",
].join(" ");

function normalize(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeFact(value) {
  return normalize(value).replace(/[.!?]+$/g, "");
}

function escapedRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function seedPendingQuestion(server, identity) {
  const now = Date.now();
  const memory = {
    turns: 1,
    pendingScreenplayLearningQuestions: [
      {
        id: QUESTION_ID,
        projectId: PROJECT_ID,
        projectTitle: PROJECT_TITLE,
        targetField: "character.want",
        targetLabel: "Mara's dramatic want",
        anchor: "Mara",
        question: QUESTION,
        actKey: "act1",
        sequenceKey: "commitment",
        askedAtTurn: 1,
        expiresAfterTurn: 3,
        askedAt: now,
      },
    ],
  };
  const userRecord = {
    userId: identity.userID,
    updatedAt: now,
    memory,
  };
  writeFileSync(
    server.env.USER_MEMORY_STORE_PATH,
    JSON.stringify({
      version: 3,
      updatedAt: now,
      entries: [],
      users: [userRecord],
    }, null, 2),
    { encoding: "utf8", mode: 0o600 },
  );

  const persistence = createPersistence({
    jsonRoot: server.env.PERSISTENCE_JSON_ROOT,
  });
  try {
    await persistence.put({
      domain: "user_memory",
      key: `byUserId:${identity.userID}`,
      value: userRecord,
    });
  } finally {
    await persistence.close();
  }
}

async function refreshClientIdentity(baseURL, identity) {
  const session = await requestStudioRestoreJSON({
    baseURL,
    path: "/session",
    method: "POST",
    headers: {
      "X-APP-TOKEN": identity.appToken,
      Authorization: `Bearer ${identity.accessToken}`,
    },
    body: {},
  });
  assert.equal(
    session.response.ok,
    true,
    `Could not refresh the realtime smoke session: ${session.status} ${JSON.stringify(session.payload)}`,
  );
  const expiresIn = Math.max(60, Number(session.payload?.expires_in || 0));
  return {
    ...identity,
    clientToken: normalize(session.payload?.client_token),
    clientTokenCachedAt: Math.floor(Date.now() / 1_000),
    clientTokenExpiry: new Date(Date.now() + expiresIn * 1_000).toISOString(),
  };
}

async function fetchProjectGrounding(server, identity) {
  return requestStudioRestoreJSON({
    baseURL: server.baseUrl,
    path: "/realtime/project_grounding",
    method: "POST",
    headers: studioRestoreOwnerHeaders(identity),
    body: {
      system_prompt: BASE_INSTRUCTIONS,
      is_screenplay_mode: true,
      screenplay_project_id: PROJECT_ID,
      screenplay_project_title: PROJECT_TITLE,
    },
  });
}

function emitSpokenResponse(simulator, text) {
  simulator.providerEvent({ type: "response.created" });
  simulator.providerEvent({ type: "output_audio_buffer.started" });
  simulator.providerEvent({
    type: "response.output_audio_transcript.delta",
    delta: text,
  });
  simulator.providerEvent({
    type: "response.output_audio_transcript.done",
    transcript: text,
  });
  simulator.providerEvent({ type: "output_audio_buffer.stopped" });
  simulator.providerEvent({
    type: "response.done",
    response: { status: "completed", output: [] },
  });
}

function latestSpokenTranscript(simulator) {
  const events = simulator.eventsOfType("assistant_transcript_final");
  return normalize(events.at(-1)?.text);
}

function extractLearnedWant(instructions) {
  const source = String(instructions || "");
  const patterns = [
    /\bauthoritative_fields:[^\n]*\bwant=([^;\n]+)/i,
    /\barc:[^\n]*\bwant=([^;\n]+)/i,
    /\bprotagonist_want:\s*([^\n]+)/i,
  ];
  for (const pattern of patterns) {
    const value = normalize(source.match(pattern)?.[1]);
    if (value) return value;
  }
  return "";
}

let server = null;
let dataDir = "";

try {
  const backendEnv = {
    APP_TOKEN,
    REQUIRE_USER_AUTH: "1",
  };
  server = await startBackend({ env: backendEnv });
  dataDir = server.dataDir;
  const identity = await createStudioRestoreOwnerIdentity({
    baseURL: server.baseUrl,
    appToken: APP_TOKEN,
    emailPrefix: "realtime-learned-answer",
  });

  await server.stop();
  const seededServer = server;
  server = null;
  await seedPendingQuestion(seededServer, identity);

  server = await startBackend({ dataDir, env: backendEnv });
  const activeIdentity = await refreshClientIdentity(server.baseUrl, identity);
  assert.ok(activeIdentity.clientToken, "The refreshed smoke session returned no client token.");

  const initialGrounding = await fetchProjectGrounding(server, activeIdentity);
  assert.equal(
    initialGrounding.status,
    200,
    `Initial realtime grounding failed: ${initialGrounding.status} ${JSON.stringify(initialGrounding.payload)}`,
  );
  assert.equal(initialGrounding.payload?.memory_grounding?.pending_question_id, QUESTION_ID);
  assert.match(initialGrounding.payload.instructions, new RegExp(escapedRegExp(QUESTION)));
  assert.match(initialGrounding.payload.instructions, /<realtime_screenplay_question>/);

  const bridgeResponse = await fetch(`${server.baseUrl}/realtime/bridge`);
  assert.equal(bridgeResponse.status, 200, "The realtime bridge could not be loaded.");
  const simulator = new RealtimeBridgeRuntimeSimulator(await bridgeResponse.text());
  await simulator.start({
    session: {
      type: "realtime",
      model: "simulated-realtime-model",
      instructions: initialGrounding.payload.instructions,
      output_modalities: ["audio", "text"],
      audio: { input: {}, output: { voice: "marin" } },
    },
  });
  simulator.setConnectionState("connected");
  const originalPeerConnection = simulator.currentPeerConnection;

  emitSpokenResponse(simulator, QUESTION);
  assert.equal(latestSpokenTranscript(simulator), QUESTION);
  assert.equal(simulator.eventsOfType("assistant_speaking").length, 1);
  assert.equal(simulator.eventsOfType("assistant_idle").length, 1);

  simulator.providerEvent({ type: "input_audio_buffer.speech_started" });
  simulator.providerEvent({
    type: "conversation.item.input_audio_transcription.completed",
    transcript: ANSWER,
  });
  simulator.providerEvent({ type: "input_audio_buffer.speech_stopped" });
  assert.equal(
    normalize(simulator.eventsOfType("user_transcript_final").at(-1)?.text),
    ANSWER,
  );

  const committed = await requestStudioRestoreJSON({
    baseURL: server.baseUrl,
    path: "/realtime/turn_commit",
    method: "POST",
    headers: {
      ...studioRestoreOwnerHeaders(activeIdentity),
      "X-Idempotency-Key": "realtime-learned-answer-voice-smoke",
    },
    body: {
      transcript: ANSWER,
      reply: "That gives Mara a want with a moral cost.",
      request_id: "realtime-learned-answer-voice-smoke",
      studio: {
        screenplayProjectId: PROJECT_ID,
        screenplayProjectTitle: PROJECT_TITLE,
      },
    },
  });
  assert.equal(
    committed.status,
    201,
    `Realtime turn commit failed: ${committed.status} ${JSON.stringify(committed.payload)}`,
  );
  assert.equal(committed.payload?.screenplay_question_resolution?.question_id, QUESTION_ID);
  assert.equal(committed.payload?.screenplay_question_resolution?.response_status, "answered");
  assert.equal(committed.payload?.screenplay_question_resolution?.learning_promoted, true);
  assert.equal(committed.payload?.memory_grounding_changed, true);
  assert.equal(committed.payload?.memory_grounding_reason, "screenplay_question_resolved");

  const refreshedGrounding = await fetchProjectGrounding(server, activeIdentity);
  assert.equal(
    refreshedGrounding.status,
    200,
    `Refreshed realtime grounding failed: ${refreshedGrounding.status} ${JSON.stringify(refreshedGrounding.payload)}`,
  );
  assert.equal(refreshedGrounding.payload?.memory_grounding?.pending_question_id, null);
  assert.doesNotMatch(refreshedGrounding.payload.instructions, /<realtime_screenplay_question>/);
  assert.doesNotMatch(refreshedGrounding.payload.instructions, new RegExp(`question_id:\\s*${QUESTION_ID}`, "i"));

  const learnedWant = extractLearnedWant(refreshedGrounding.payload.instructions);
  assert.equal(normalizeFact(learnedWant), normalizeFact(ANSWER));
  const revision = [
    normalize(committed.payload?.state_version),
    normalize(committed.payload?.memory_grounding_reason),
    PROJECT_ID,
  ].join("|");
  assert.equal(
    simulator.updateInstructions(refreshedGrounding.payload.instructions, revision),
    true,
  );
  assert.equal(simulator.currentPeerConnection, originalPeerConnection);
  const updateEvent = simulator.currentDataChannel.sent.at(-1);
  assert.equal(updateEvent?.type, "session.update");
  assert.equal(updateEvent?.session?.instructions, refreshedGrounding.payload.instructions);

  simulator.providerEvent({ type: "input_audio_buffer.speech_stopped" });
  simulator.providerEvent({
    type: "conversation.item.input_audio_transcription.completed",
    transcript: "What should happen next?",
  });
  simulator.providerEvent({ type: "response.created" });
  assert.equal(simulator.eventsOfType("project_grounding_response_deferred").length, 1);
  assert.equal(simulator.currentDataChannel.sent.at(-1)?.type, "response.cancel");

  simulator.providerEvent({
    type: "session.updated",
    session: {
      type: "realtime",
      instructions: refreshedGrounding.payload.instructions,
    },
  });
  assert.equal(
    simulator.eventsOfType("project_grounding_updated").at(-1)?.revision,
    revision,
  );
  assert.equal(
    simulator.currentDataChannel.sent.filter((event) => event.type === "response.create").length,
    0,
  );
  simulator.providerEvent({
    type: "response.done",
    response: { status: "cancelled", output: [] },
  });
  assert.equal(
    simulator.currentDataChannel.sent.filter((event) => event.type === "response.create").length,
    1,
  );
  assert.equal(simulator.eventsOfType("project_grounding_response_resumed").length, 1);

  const nextSpokenReply = [
    "Then make the next scene pressure Mara's want:",
    learnedWant,
    "Eli can be freed only if Mara rejects her father's tactic in public.",
  ].join(" ");
  emitSpokenResponse(simulator, nextSpokenReply);
  assert.match(
    latestSpokenTranscript(simulator),
    new RegExp(escapedRegExp(normalizeFact(ANSWER))),
  );
  assert.doesNotMatch(latestSpokenTranscript(simulator), new RegExp(escapedRegExp(QUESTION)));
  assert.equal(simulator.currentPeerConnection, originalPeerConnection);
  assert.equal(simulator.eventsOfType("assistant_speaking").length, 2);
  assert.equal(simulator.eventsOfType("assistant_idle").length, 2);
  assert.equal(simulator.eventsOfType("transport_lost").length, 0);

  console.log(JSON.stringify({
    ok: true,
    askedPlannedQuestion: true,
    answerLearned: true,
    pendingQuestionCleared: true,
    groundingRefreshed: true,
    immediateNextTurnGatedUntilGrounded: true,
    samePeerConnection: true,
    nextSpokenReplyUsesLearnedFact: true,
    repeatedResolvedQuestion: false,
    transportLosses: 0,
  }));
  console.log("realtime-learned-answer-voice-smoke: ok");
} catch (error) {
  if (server) {
    const stdout = server.stdout.join("").trim();
    const stderr = server.stderr.join("").trim();
    if (stdout) console.error(`realtime voice smoke backend stdout:\n${stdout}`);
    if (stderr) console.error(`realtime voice smoke backend stderr:\n${stderr}`);
  }
  throw error;
} finally {
  if (server) await server.stop();
  if (dataDir) rmSync(dataDir, { recursive: true, force: true });
}
