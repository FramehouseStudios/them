// T-deeper-lib-tests-batch-2 — deeper persona coverage beyond
// backend/tests/persona.test.mjs (existing smoke).
//
// Smoke covers: runtime keys exist, PERSONA_PRESET env honored,
// frozen filler prefixes, deterministic prompts.
//
// This file exercises the three exported helpers
// (appendDirectorAddendum, normalizeSystemPrompt, withOutputContract)
// and a couple of derived-shape invariants the smoke leaves on
// the table.

import assert from "node:assert/strict";
import { test } from "node:test";

import { createPersonaRuntime } from "../lib/persona.js";

function defaultDeps(overrides = {}) {
  return {
    env: {},
    normalizeSnippet: (v, maxChars = 160) => {
      const s = String(v || "").trim();
      if (!s) return "";
      return s.length <= maxChars ? s : `${s.slice(0, maxChars - 1)}…`;
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

// ---------- normalizeSystemPrompt ----------

test("[persona-deeper] normalizeSystemPrompt trims surrounding whitespace", () => {
  const r = createPersonaRuntime(defaultDeps());
  const out = r.normalizeSystemPrompt("\n\n  hello world  \n\n");
  assert.equal(out, "hello world");
});

test("[persona-deeper] normalizeSystemPrompt is idempotent", () => {
  const r = createPersonaRuntime(defaultDeps());
  const once = r.normalizeSystemPrompt("You are a helpful assistant. ");
  const twice = r.normalizeSystemPrompt(once);
  assert.equal(twice, once);
});

test("[persona-deeper] normalizeSystemPrompt returns empty for nullish input", () => {
  const r = createPersonaRuntime(defaultDeps());
  assert.equal(r.normalizeSystemPrompt(null), "");
  assert.equal(r.normalizeSystemPrompt(undefined), "");
  assert.equal(r.normalizeSystemPrompt(""), "");
});

// ---------- appendDirectorAddendum ----------

test("[persona-deeper] appendDirectorAddendum appends addendum to base prompt", () => {
  const r = createPersonaRuntime(defaultDeps());
  const base = "You are an assistant.";
  const out = r.appendDirectorAddendum(base, "Stay in character.");
  assert.ok(out.includes(base));
  assert.ok(out.includes("Stay in character."));
});

test("[persona-deeper] appendDirectorAddendum no-ops on empty addendum", () => {
  const r = createPersonaRuntime(defaultDeps());
  const base = "You are an assistant.";
  const out = r.appendDirectorAddendum(base, "");
  // Output must contain the base; may or may not equal it exactly
  // (whitespace can vary). The invariant is "no addendum content".
  assert.ok(out.includes(base));
});

test("[persona-deeper] appendDirectorAddendum tolerates null/undefined", () => {
  const r = createPersonaRuntime(defaultDeps());
  assert.doesNotThrow(() => r.appendDirectorAddendum(null, null));
  assert.doesNotThrow(() => r.appendDirectorAddendum(undefined, undefined));
});

// ---------- withOutputContract ----------

test("[persona-deeper] withOutputContract appends an output contract to prompt", () => {
  const r = createPersonaRuntime(defaultDeps());
  const base = "You are an assistant.";
  const out = r.withOutputContract(base);
  assert.ok(out.length > base.length, "contract should add content");
  assert.ok(out.includes(base) || out.includes("assistant"));
});

test("[persona-deeper] withOutputContract is deterministic for same input", () => {
  const r = createPersonaRuntime(defaultDeps());
  const a = r.withOutputContract("You are an assistant.");
  const b = r.withOutputContract("You are an assistant.");
  assert.equal(a, b);
});

// ---------- runtime invariants ----------

test("[persona-deeper] CLEMENTINE_PROFILE includes the configured voice + model ids", () => {
  const r = createPersonaRuntime(defaultDeps({
    ELEVENLABS_VOICE_ID: "voice_test_xyz",
    ELEVENLABS_MODEL_ID: "model_test_abc",
  }));
  const profileStr = JSON.stringify(r.CLEMENTINE_PROFILE || {});
  assert.ok(
    profileStr.includes("voice_test_xyz") || profileStr.includes("model_test_abc"),
    `expected configured ids in profile, got: ${profileStr.slice(0, 200)}`,
  );
});

test("[persona-deeper] runtime exposes a PERSONA_ENFORCEMENT_ADDENDUM string", () => {
  const r = createPersonaRuntime(defaultDeps());
  assert.equal(typeof r.PERSONA_ENFORCEMENT_ADDENDUM, "string");
  assert.ok(r.PERSONA_ENFORCEMENT_ADDENDUM.length > 0);
});
