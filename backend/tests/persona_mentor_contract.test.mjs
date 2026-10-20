import test from "node:test";
import assert from "node:assert/strict";
import { createPersonaRuntime } from "../lib/persona.js";
import { fitSystemPromptForTurnLatency } from "../lib/system_prompt_trim.js";

function runtime() {
  return createPersonaRuntime({
    env: {},
    normalizeSnippet: (v) => String(v || "").trim(),
    normalizePersonaPreset: (v, fallback = "clementine") => String(v || "").trim().toLowerCase() || fallback,
    DEFAULT_ASSISTANT_SELF_NAME: "Clementine",
    UNIFIED_PERSONA_PRESET: "clementine",
    CLEMENTINE_EMPTY_TRANSCRIPT_PROMPT_DEFAULT: "Hey there.",
    EMPTY_TRANSCRIPT_VOICE_PROMPT_TEXT: "Hey there.",
    ELEVENLABS_VOICE_ID: "v",
    ELEVENLABS_MODEL_ID: "m",
    TTS_VOICE: "clementine",
    TTS_SPEED: 1.0,
    SELF_AWARENESS_START_TURNS: 3,
    MAX_SYSTEM_PROMPT_CHARS: 12000,
  });
}

test("[persona-mentor] the mentor contract replaces the check-in contract on mentor turns only", () => {
  const r = runtime();
  const base = "You are Clementine.";
  const mentor = r.withOutputContract(base, { mentorTurn: true });
  assert.match(mentor, /<mentor_output>/);
  assert.match(mentor, /Verdict first/);
  assert.match(mentor, /intention and obstacle/);
  assert.match(mentor, /because\/therefore across three acts/);
  assert.match(mentor, /Know the ending first/);
  assert.match(mentor, /No day\/feeling check-in/);
  assert.doesNotMatch(mentor, /start line 1 with a short day\/feeling check-in question/);
  assert.doesNotMatch(mentor, /Target 2–3 short lines/);

  const plain = r.withOutputContract(base, { mentorTurn: false });
  assert.match(plain, /Target 2–3 short lines/);
  assert.doesNotMatch(plain, /<mentor_output>/);

  const page = r.withOutputContract(base, { mentorTurn: true, screenplayPageWrite: true });
  assert.match(page, /<screenplay_page_output>/, "page writes outrank the mentor contract");
  assert.doesNotMatch(page, /<mentor_output>/);
  assert.equal(r.MENTOR_OUTPUT_CONTRACT.includes("</mentor_output>"), true);
});

test("[persona-mentor] the mentor block is protected by the latency trimmer", () => {
  const r = runtime();
  const filler = Array.from({ length: 400 }, (_, i) => `FILLER LINE ${i}: the quick brown fox jumps over the lazy dog again and again.`).join("\n");
  const prompt = r.withOutputContract(`You are Clementine.\n\n${filler}`, { mentorTurn: true });
  const trimmed = fitSystemPromptForTurnLatency(prompt, {
    turnPlanner: null,
    flags: null,
    routingLane: "",
    chatModelPlan: { tier: "rich", model: "gpt-4o" },
  });
  assert.ok(trimmed.length <= prompt.length);
  assert.match(trimmed, /<mentor_output>[\s\S]*<\/mentor_output>/, "mentor contract survives trimming");
});
