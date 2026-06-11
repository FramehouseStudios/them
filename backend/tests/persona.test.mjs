// T-persona-smoke-test — smoke coverage for backend/lib/persona.js.
//
// `persona.js` builds the runtime persona configuration (system
// prompts, preset guidance, voice/model IDs). It's a single
// factory function `createPersonaRuntime(deps)` that's called once
// at startup. Heavy on string concatenation, low on logic.
//
// These tests pin:
//   - the runtime object shape (which keys it exports)
//   - that personaPreset is honored from env
//   - that environment overrides reach the right keys
//   - that core helpers (appendDirectorAddendum,
//     normalizeSystemPrompt, withOutputContract) behave deterministically

import assert from "node:assert/strict";
import { test } from "node:test";

import { createPersonaRuntime } from "../lib/persona.js";

function defaultDeps(overrides = {}) {
  return {
    env: {},
    normalizeSnippet: (v, maxChars = 160) => {
      const s = String(v || "").trim();
      if (!s) return "";
      if (s.length <= maxChars) return s;
      return `${s.slice(0, maxChars - 1)}…`;
    },
    normalizePersonaPreset: (v, fallback = "clementine") => {
      const s = String(v || "").trim().toLowerCase();
      return s || fallback;
    },
    DEFAULT_ASSISTANT_SELF_NAME: "Clementine",
    UNIFIED_PERSONA_PRESET: "clementine",
    CLEMENTINE_EMPTY_TRANSCRIPT_PROMPT_DEFAULT: "Hey there.",
    EMPTY_TRANSCRIPT_VOICE_PROMPT_TEXT: "Hey there.",
    ELEVENLABS_VOICE_ID: "voice_clem",
    ELEVENLABS_MODEL_ID: "eleven_v2",
    TTS_VOICE: "clementine",
    TTS_SPEED: 1.0,
    SELF_AWARENESS_START_TURNS: 3,
    MAX_SYSTEM_PROMPT_CHARS: 5000,
    ...overrides,
  };
}

test("[persona] createPersonaRuntime returns the canonical runtime keys", () => {
  const runtime = createPersonaRuntime(defaultDeps());
  const expectedKeys = [
    "CLEMENTINE_DEFAULT_SYSTEM_PROMPT",
    "CLEMENTINE_PRESET_GUIDANCE_TEXT",
    "CLEMENTINE_PROFILE",
    "DEFAULT_CHAT_SYSTEM_PROMPT",
    "PERSONA_ENFORCEMENT_ADDENDUM",
    "PERSONA_PRESET",
    "PERSONA_PRESET_GUIDANCE",
    "TALK_RUNTIME_RECOVERY_PROMPT_TEXT",
    "TTS_FILLER_PREFIXES",
    "appendDirectorAddendum",
    "normalizeSystemPrompt",
    "withOutputContract",
  ];
  for (const key of expectedKeys) {
    assert.ok(key in runtime, `persona runtime missing key: ${key}`);
  }
});

test("[persona] PERSONA_PRESET is honored from env via normalizePersonaPreset", () => {
  const runtime = createPersonaRuntime(defaultDeps({
    env: { PERSONA_PRESET: "DIRECT-BIG-SIS" },
  }));
  assert.equal(runtime.PERSONA_PRESET, "direct-big-sis");
});

test("[persona] PERSONA_PRESET falls back to clementine when env is empty", () => {
  const runtime = createPersonaRuntime(defaultDeps({ env: {} }));
  assert.equal(runtime.PERSONA_PRESET, "clementine");
});

test("[persona] TTS_FILLER_PREFIXES is frozen", () => {
  const runtime = createPersonaRuntime(defaultDeps());
  assert.ok(Object.isFrozen(runtime.TTS_FILLER_PREFIXES), "TTS_FILLER_PREFIXES should be Object.frozen");
  assert.deepEqual([...runtime.TTS_FILLER_PREFIXES], ["Okay."]);
});

test("[persona] CLEMENTINE_DEFAULT_SYSTEM_PROMPT names CLEMENTINE", () => {
  const runtime = createPersonaRuntime(defaultDeps());
  assert.ok(runtime.CLEMENTINE_DEFAULT_SYSTEM_PROMPT.includes("CLEMENTINE"));
});

test("[persona] enforcement addendum is compact and priority ordered", () => {
  const runtime = createPersonaRuntime(defaultDeps());
  const addendum = runtime.PERSONA_ENFORCEMENT_ADDENDUM;
  assert.ok(addendum.includes("<clementine_core>"));
  assert.ok(addendum.includes("priority_order"));
  assert.ok(addendum.includes("Truth and safety"));
  assert.ok(addendum.includes("Feature-film continuity"));
  assert.ok(addendum.length <= 3_000);
  assert.ok(!addendum.includes("Slang allowlist"));
  assert.ok(!addendum.includes("weekday emotional arc"));
  assert.ok(!addendum.includes("4-week orbit progression"));
});

test("[persona] CLEMENTINE_PRESET_GUIDANCE_TEXT names the preset", () => {
  const runtime = createPersonaRuntime(defaultDeps());
  assert.ok(runtime.CLEMENTINE_PRESET_GUIDANCE_TEXT.includes("CLEMENTINE"));
});

test("[persona] TALK_RUNTIME_RECOVERY_PROMPT_TEXT honors env override", () => {
  const runtime = createPersonaRuntime(defaultDeps({
    env: { TALK_RUNTIME_RECOVERY_PROMPT_TEXT: "Sorry — could you say that again?" },
  }));
  assert.equal(runtime.TALK_RUNTIME_RECOVERY_PROMPT_TEXT, "Sorry — could you say that again?");
});

test("[persona] TALK_RUNTIME_RECOVERY_PROMPT_TEXT falls back to default when env empty", () => {
  const runtime = createPersonaRuntime(defaultDeps());
  assert.ok(runtime.TALK_RUNTIME_RECOVERY_PROMPT_TEXT.length > 0);
  assert.ok(runtime.TALK_RUNTIME_RECOVERY_PROMPT_TEXT.includes("glitch"));
});

test("[persona] CLEMENTINE_PROFILE carries voice + model identifiers", () => {
  const runtime = createPersonaRuntime(defaultDeps({
    ELEVENLABS_VOICE_ID: "voice_xyz",
    ELEVENLABS_MODEL_ID: "model_abc",
    TTS_VOICE: "alt",
  }));
  // CLEMENTINE_PROFILE should include the voice + model IDs somewhere
  // (typed object, not asserting exact key names).
  const profileStr = JSON.stringify(runtime.CLEMENTINE_PROFILE || {});
  assert.ok(profileStr.includes("voice_xyz") || profileStr.includes("model_abc"));
});

test("[persona] runtime is deterministic: same deps → same prompt strings", () => {
  const a = createPersonaRuntime(defaultDeps());
  const b = createPersonaRuntime(defaultDeps());
  assert.equal(a.CLEMENTINE_DEFAULT_SYSTEM_PROMPT, b.CLEMENTINE_DEFAULT_SYSTEM_PROMPT);
  assert.equal(a.CLEMENTINE_PRESET_GUIDANCE_TEXT, b.CLEMENTINE_PRESET_GUIDANCE_TEXT);
  assert.equal(a.DEFAULT_CHAT_SYSTEM_PROMPT, b.DEFAULT_CHAT_SYSTEM_PROMPT);
  assert.equal(a.PERSONA_ENFORCEMENT_ADDENDUM, b.PERSONA_ENFORCEMENT_ADDENDUM);
});

test("[persona] appendDirectorAddendum + normalizeSystemPrompt + withOutputContract are functions", () => {
  const runtime = createPersonaRuntime(defaultDeps());
  assert.equal(typeof runtime.appendDirectorAddendum, "function");
  assert.equal(typeof runtime.normalizeSystemPrompt, "function");
  assert.equal(typeof runtime.withOutputContract, "function");
});

test("[persona] normalizeSystemPrompt returns a string for empty input", () => {
  const runtime = createPersonaRuntime(defaultDeps());
  const out = runtime.normalizeSystemPrompt("");
  assert.equal(typeof out, "string");
});

test("[persona] normalizeSystemPrompt preserves non-empty input shape", () => {
  const runtime = createPersonaRuntime(defaultDeps());
  const prompt = "You are a helpful test assistant.";
  const out = runtime.normalizeSystemPrompt(prompt);
  assert.equal(typeof out, "string");
  assert.ok(out.length > 0);
});
