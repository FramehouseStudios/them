import assert from "node:assert/strict";
import { test } from "node:test";

import { RealtimeBridgeRuntimeSimulator } from "./helpers/realtime_bridge_simulator.mjs";

process.env.RUN_SERVER = "0";
process.env.OUTBOX_SNAPSHOT_ENABLED = "0";
process.env.OPENAI_API_KEY ||= "test-openai-key";
process.env.REALTIME_PROVIDER ||= "stub";

const { renderRealtimeBridgeHtml } = await import("../index.js");

function createSimulator() {
  return new RealtimeBridgeRuntimeSimulator(renderRealtimeBridgeHtml());
}

test("[realtime-simulator] reports first text and audio once on a deterministic clock", async () => {
  const simulator = createSimulator();
  await simulator.start();
  simulator.setConnectionState("connected");
  simulator.providerEvent({ type: "input_audio_buffer.speech_stopped" });
  simulator.roundTripSeconds = 0.42;
  await simulator.runScheduledIntervals();
  simulator.advance(100);
  simulator.providerEvent({ type: "response.created" });
  simulator.advance(320);
  simulator.providerEvent({ type: "response.output_text.delta", delta: "The door" });
  simulator.providerEvent({ type: "response.output_text.delta", delta: " opens." });
  simulator.advance(280);
  simulator.providerEvent({ type: "output_audio_buffer.started" });
  simulator.providerEvent({ type: "output_audio_buffer.started" });
  simulator.providerEvent({ type: "response.output_text.done", text: "The door opens." });

  assert.equal(simulator.eventsOfType("connected").length, 1);
  assert.equal(simulator.eventsOfType("network_profile").at(-1).networkClass, "constrained");
  assert.equal(simulator.eventsOfType("latency_first_text").length, 1);
  assert.equal(simulator.eventsOfType("latency_first_text")[0].elapsedMs, 420);
  assert.equal(simulator.eventsOfType("latency_first_audio").length, 1);
  assert.equal(simulator.eventsOfType("latency_first_audio")[0].elapsedMs, 700);
  assert.equal(simulator.eventsOfType("assistant_speaking").length, 1);
  assert.equal(simulator.eventsOfType("assistant_text_final")[0].text, "The door opens.");
});

test("[realtime-simulator] interruption races clear audio and preserve response ordinals", async () => {
  const simulator = createSimulator();
  await simulator.start();
  simulator.setConnectionState("connected");
  simulator.providerEvent({ type: "input_audio_buffer.speech_stopped" });
  simulator.providerEvent({ type: "response.created" });
  simulator.providerEvent({
    type: "response.output_item.added",
    item: { id: "assistant-item-1", role: "assistant" },
  });
  simulator.providerEvent({ type: "output_audio_buffer.started" });
  simulator.advance(45);
  simulator.providerEvent({ type: "input_audio_buffer.speech_started" });

  const sentTypes = simulator.currentDataChannel.sent.map((event) => event.type);
  assert.deepEqual(sentTypes, [
    "output_audio_buffer.clear",
    "response.cancel",
    "conversation.item.truncate",
  ]);
  assert.equal(simulator.eventsOfType("latency_barge_in_started").length, 1);

  simulator.advance(80);
  simulator.providerEvent({
    type: "error",
    error: { code: "response_cancel_not_active", message: "No active response." },
  });
  simulator.providerEvent({ type: "response.output_text.done", text: "stale output" });

  const interruption = simulator.eventsOfType("assistant_interrupted")[0];
  assert.equal(simulator.eventsOfType("latency_barge_in_ack")[0].elapsedMs, 80);
  assert.equal(interruption.responseOrdinal, 1);
  assert.equal(simulator.eventsOfType("assistant_text_final").at(-1).responseOrdinal, 1);
});

test("[realtime-simulator] a disconnected bridge can start a fresh session", async () => {
  const simulator = createSimulator();
  await simulator.start();
  simulator.setConnectionState("connected");
  const firstPeer = simulator.currentPeerConnection;
  simulator.setConnectionState("failed");
  simulator.stop();

  await simulator.start();
  const secondPeer = simulator.currentPeerConnection;
  simulator.setConnectionState("connected");
  simulator.providerEvent({ type: "input_audio_buffer.speech_stopped" });
  simulator.providerEvent({ type: "response.created" });

  assert.notEqual(firstPeer, secondPeer);
  assert.equal(simulator.eventsOfType("connecting").length, 2);
  assert.equal(simulator.eventsOfType("connected").length, 2);
  assert.equal(simulator.eventsOfType("transport_lost").length, 1);
  assert.ok(simulator.eventsOfType("disconnected").length >= 1);
  assert.equal(simulator.eventsOfType("assistant_thinking").at(-1).responseOrdinal, 1);
  assert.equal(simulator.eventsOfType("error").length, 0);
});

test("[realtime-simulator] connected waits until the event channel is writable", async () => {
  const simulator = createSimulator();
  await simulator.start();
  simulator.currentDataChannel.readyState = "connecting";

  simulator.setConnectionState("connected");
  assert.equal(simulator.eventsOfType("connected").length, 0);

  simulator.currentDataChannel.readyState = "open";
  simulator.currentDataChannel.emit("open");
  simulator.currentDataChannel.emit("open");

  assert.equal(simulator.eventsOfType("connected").length, 1);
});

test("[realtime-simulator] transport loss preserves a final mid-turn transcript once", async () => {
  const simulator = createSimulator();
  await simulator.start();
  simulator.setConnectionState("connected");
  simulator.providerEvent({ type: "input_audio_buffer.speech_started" });
  simulator.providerEvent({
    type: "conversation.item.input_audio_transcription.delta",
    delta: "Move Mara into ",
  });
  simulator.providerEvent({
    type: "conversation.item.input_audio_transcription.delta",
    delta: "Act Two.",
  });
  simulator.providerEvent({
    type: "conversation.item.input_audio_transcription.completed",
    transcript: "Move Mara into Act Two.",
  });
  simulator.providerEvent({ type: "response.created" });

  simulator.setConnectionState("failed");

  const losses = simulator.eventsOfType("transport_lost");
  assert.equal(losses.length, 1);
  assert.equal(losses[0].cause, "peer_connection_failed");
  assert.equal(losses[0].userTranscript, "Move Mara into Act Two.");
  assert.equal(losses[0].transcriptIsFinal, true);
  assert.equal(losses[0].assistantResponseActive, true);
  assert.equal(losses[0].assistantSpeaking, false);
  assert.equal(losses[0].recoverable, true);
  assert.equal(losses[0].credentialRefreshRecommended, true);
});

test("[realtime-simulator] playback loss reports speaking state for stage-aware repair", async () => {
  const simulator = createSimulator();
  await simulator.start();
  simulator.setConnectionState("connected");
  simulator.providerEvent({ type: "input_audio_buffer.speech_stopped" });
  simulator.providerEvent({
    type: "conversation.item.input_audio_transcription.completed",
    transcript: "Finish the ferry scene.",
  });
  simulator.providerEvent({ type: "response.created" });
  simulator.providerEvent({ type: "output_audio_buffer.started" });

  simulator.setConnectionState("disconnected");

  const loss = simulator.eventsOfType("transport_lost")[0];
  assert.equal(loss.userTranscript, "Finish the ferry scene.");
  assert.equal(loss.transcriptIsFinal, true);
  assert.equal(loss.assistantResponseActive, true);
  assert.equal(loss.assistantSpeaking, true);
});

test("[realtime-simulator] a fresh session can resume an interrupted text turn", async () => {
  const simulator = createSimulator();
  await simulator.start();
  simulator.setConnectionState("connected");

  assert.equal(simulator.resumeTurn("Move Mara into Act Two.", "recovered-turn-1"), true);

  assert.deepEqual(
    simulator.currentDataChannel.sent.map((event) => event.type),
    ["conversation.item.create", "response.create"]
  );
  assert.equal(
    simulator.currentDataChannel.sent[0].item.content[0].text,
    "Move Mara into Act Two."
  );
  assert.equal(simulator.eventsOfType("turn_repair_submitted").length, 1);
  assert.equal(simulator.eventsOfType("turn_repair_submitted")[0].turnID, "recovered-turn-1");
});

test("[realtime-simulator] updates project grounding without reconnecting", async () => {
  const simulator = createSimulator();
  await simulator.start();
  simulator.setConnectionState("connected");
  const peer = simulator.currentPeerConnection;

  assert.equal(
    simulator.updateInstructions(
      "Mara now returns for both sisters. Never repeat the resolved question.",
      "memory-v12|screenplay_question_resolved|split-ferries"
    ),
    true
  );
  assert.equal(simulator.currentPeerConnection, peer);
  assert.deepEqual(simulator.currentDataChannel.sent.at(-1), {
    event_id: simulator.currentDataChannel.sent.at(-1).event_id,
    type: "session.update",
    session: {
      type: "realtime",
      instructions: "Mara now returns for both sisters. Never repeat the resolved question.",
    },
  });
  assert.equal(
    simulator.eventsOfType("project_grounding_update_submitted")[0].revision,
    "memory-v12|screenplay_question_resolved|split-ferries"
  );

  simulator.providerEvent({ type: "session.updated", session: { type: "realtime" } });

  assert.equal(simulator.currentPeerConnection, peer);
  assert.equal(
    simulator.eventsOfType("project_grounding_updated")[0].revision,
    "memory-v12|screenplay_question_resolved|split-ferries"
  );
  assert.equal(simulator.eventsOfType("transport_lost").length, 0);
});

test("[realtime-simulator] intentional stop never emits a transport loss", async () => {
  const simulator = createSimulator();
  await simulator.start();
  simulator.setConnectionState("connected");

  simulator.stop();

  assert.equal(simulator.eventsOfType("transport_lost").length, 0);
  assert.equal(simulator.eventsOfType("disconnected").length, 1);
  assert.equal(simulator.eventsOfType("disconnected")[0].intentional, true);
});
