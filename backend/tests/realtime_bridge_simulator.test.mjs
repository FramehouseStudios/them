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
  assert.ok(simulator.eventsOfType("disconnected").length >= 2);
  assert.equal(simulator.eventsOfType("assistant_thinking").at(-1).responseOrdinal, 1);
  assert.equal(simulator.eventsOfType("error").length, 0);
});
