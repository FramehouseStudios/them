import assert from "node:assert/strict";
import { test } from "node:test";

process.env.RUN_SERVER = "0";
process.env.OPENAI_API_KEY ||= "test-openai-key";
process.env.REALTIME_PROVIDER ||= "stub";

const {
  readTalkTurnMeta,
  storeTalkTurnMeta,
} = await import("../index.js");

test("[talk-turn-meta] preserves authoritative screenplay batches beyond the old 8k ceiling", () => {
  const turnId = `screenplay-length-${Date.now()}`;
  const screenplayText = Array.from({ length: 90 }, (_, index) => [
    `INT. EDITING ROOM ${index + 1} - NIGHT`,
    "",
    `Mara threads reel ${index + 1} through the flatbed while Eli guards the door.`,
    "",
    "MARA",
    `The truth changes shape every time we cut it. ${index + 1}`,
  ].join("\n")).join("\n\n");

  assert.ok(screenplayText.length > 8_000);
  assert.ok(screenplayText.length < 32_000);

  storeTalkTurnMeta({
    turnId,
    sessionId: "session-feature-batch",
    userId: "user-feature-batch",
    reply: "INT. EDITING ROOM 1 - NIGHT",
    screenplayOutput: {
      target: "page",
      format: "hollywood",
      source: "studio_target",
      quality: { ok: true, reason: "ok", source: "studio_target" },
      text: screenplayText,
      lines: [],
    },
    renderContract: {
      reply_role: "preview",
      authoritative_page_text_available: true,
      sync_ready: true,
    },
    now: Date.now(),
  });

  const stored = readTalkTurnMeta(turnId, Date.now());
  assert.ok(stored);
  assert.equal(stored.screenplayOutput?.text, screenplayText);
  assert.equal(stored.screenplayOutput?.text.length, screenplayText.length);
  assert.ok(stored.screenplayOutput?.text.endsWith("The truth changes shape every time we cut it. 90"));
  assert.equal(stored.renderContract?.authoritative_page_text_available, true);
  assert.equal(stored.renderContract?.sync_ready, true);
});
