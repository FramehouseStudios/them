import assert from "node:assert/strict";
import { test } from "node:test";

process.env.RUN_SERVER = "0";
process.env.OUTBOX_SNAPSHOT_ENABLED = "0";
process.env.OPENAI_API_KEY ||= "test-openai-key";
process.env.REALTIME_PROVIDER ||= "stub";

const {
  buildRealtimeSessionConfig,
  renderRealtimeBridgeHtml,
} = await import("../index.js");

test("[realtime-bridge] session config enables server VAD response interruption", () => {
  const session = buildRealtimeSessionConfig({
    instructions: "Stay present.",
    model: "gpt-realtime-test",
    voice: "marin",
  });

  assert.equal(session.audio.input.turn_detection.type, "server_vad");
  assert.equal(session.audio.input.turn_detection.create_response, true);
  assert.equal(session.audio.input.turn_detection.interrupt_response, true);
  assert.equal(session.audio.input.turn_detection.silence_duration_ms, 360);
});

test("[realtime-bridge] runtime reports first output latency and provider-confirmed interruption", () => {
  const html = renderRealtimeBridgeHtml();

  for (const marker of [
    "latency_turn_started",
    "latency_first_text",
    "latency_first_audio",
    "latency_barge_in_started",
    "latency_barge_in_ack",
    "output_audio_buffer.started",
    "output_audio_buffer.cleared",
    "output_audio_buffer.clear",
    "response.cancel",
    "conversation.item.truncate",
    "local_vad",
    "transport_lost",
    "connectionGeneration",
    "assistantSpeaking",
    "credentialRefreshRecommended",
    "resumeTurn",
    "turn_repair_submitted",
    "updateInstructions",
    "session.update",
    "project_grounding_updated",
    "project_grounding_update_failed",
  ]) {
    assert.match(html, new RegExp(marker.replaceAll(".", "\\.")), marker);
  }
});
