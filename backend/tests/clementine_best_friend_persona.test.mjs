// Clementine is a personal AI agent who is the writer's best friend, like a
// fun, happy older sister who is also their best friend: bold pushback with
// soft intentions (founder, 2026-10-01). No romance or flirting, no forced
// slang ("bro", "chill out dude"), no therapist stack, no body-sensation
// curiosity, anywhere a companion prompt is built.

import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";

import { createPersonaRuntime } from "../lib/persona.js";

function runtime() {
  return createPersonaRuntime({
    env: {},
    normalizeSnippet: (v) => String(v || "").trim(),
    normalizePersonaPreset: (v, fallback = "clementine") => String(v || "").trim().toLowerCase() || fallback,
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
  });
}

const source = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

test("the persona prompts describe a best-friend older sister who pushes back kindly", () => {
  const persona = runtime();
  assert.match(persona.CLEMENTINE_DEFAULT_SYSTEM_PROMPT, /older sister/);
  assert.match(persona.CLEMENTINE_DEFAULT_SYSTEM_PROMPT, /Bold pushback with soft intentions/);
  assert.match(persona.CLEMENTINE_PRESET_GUIDANCE_TEXT, /never romantic, never flirting/);
  assert.match(persona.PERSONA_ENFORCEMENT_ADDENDUM, /never romantic/);
  for (const text of [persona.CLEMENTINE_DEFAULT_SYSTEM_PROMPT, persona.CLEMENTINE_PRESET_GUIDANCE_TEXT, persona.PERSONA_ENFORCEMENT_ADDENDUM]) {
    assert.doesNotMatch(text, /Casual AF|tiny laughter|romantic warmth subtle|Romantic warmth stays/);
  }
});

test("no companion prompt builder carries romance, slang, the therapist stack or body curiosity", () => {
  const banned = [
    /chill out dude/, /"bro"/, /therapist_attunement/, /subtle_romantic_presence/, /STATE: stage=\$\{stage\} depth=\$\{depthScore\.toFixed\(1\)\} romance=/,
    /flirt~\$\{/, /flirt_scale=/, /romantic_warmth=\$\{/, /human_learning_focus/, /body sensation/,
    /Samantha tone direction/, /Soft romantic direction/, /Eternal Sunshine direction/, /Soft romantic presence prompts/,
    /What did that bring up for you/, /quietly proactive, intimate/,
  ];
  for (const file of ["../lib/talk_handler.js", "../index.js", "../lib/prompt_assembly.js", "../lib/persona.js"]) {
    const text = source(file);
    for (const pattern of banned) assert.doesNotMatch(text, pattern, `${file} still has ${pattern}`);
  }
  assert.match(source("../lib/prompt_assembly.js"), /best-friend older sister: bold pushback, soft intentions/);
  assert.match(source("../index.js"), /fun, happy older sister who is also their best friend/);
});
