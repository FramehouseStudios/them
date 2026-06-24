// T-decompose-phase5b2-studio-render — integration tests for
// `mountRealtimeStudioRenderRoutes`. Cover both routes
// (sync + SSE), happy paths, error envelopes, missing-key
// 503 guard, empty-transcript 400 guard, and the
// required-deps mount guard.

import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";

import {
  mountRealtimeStudioRenderRoutes,
  STUDIO_RENDER_BODY_LIMIT,
} from "../lib/realtime_studio_render_routes.js";

function defaultDeps(overrides = {}) {
  const calls = { renderInvocations: [], streamInvocations: [] };
  return {
    getOpenAIApiKey: () => "sk-test",
    createRequestId: () => "req_studio_test",
    normalizeSnippet: (v, _max) => (typeof v === "string" ? v.trim() : ""),
    renderStudioRealtimeText: async ({ systemPrompt, transcript }) => {
      calls.renderInvocations.push({ systemPrompt, transcript });
      return "rendered reply";
    },
    streamStudioRealtimeText: async ({ systemPrompt, transcript, onDelta }) => {
      calls.streamInvocations.push({ systemPrompt, transcript });
      await onDelta("hello ", "hello ");
      await onDelta("world", "hello world");
      return "hello world";
    },
    _calls: calls,
    ...overrides,
  };
}

async function withTestServer(deps, fn) {
  const app = express();
  mountRealtimeStudioRenderRoutes(app, deps);
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const port = server.address().port;
  try { await fn(`http://127.0.0.1:${port}`); }
  finally { await new Promise((r) => server.close(r)); }
}

async function postJson(baseURL, path, body) {
  const r = await fetch(`${baseURL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => null) };
}

async function postSse(baseURL, path, body) {
  const r = await fetch(`${baseURL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  return { status: r.status, text };
}

// ---------- factory + mount guards ----------

test("[studio-render] STUDIO_RENDER_BODY_LIMIT exported as 512kb", () => {
  assert.equal(STUDIO_RENDER_BODY_LIMIT, "512kb");
});

test("[studio-render] mount fails without Express app", () => {
  assert.throws(() => mountRealtimeStudioRenderRoutes(null, defaultDeps()));
});

test("[studio-render] mount fails when any required dep is missing", () => {
  const required = [
    "renderStudioRealtimeText",
    "streamStudioRealtimeText",
    "createRequestId",
    "normalizeSnippet",
    "getOpenAIApiKey",
  ];
  for (const key of required) {
    const deps = defaultDeps();
    deps[key] = undefined;
    const app = express();
    assert.throws(
      () => mountRealtimeStudioRenderRoutes(app, deps),
      new RegExp(key),
      `should reject missing ${key}`,
    );
  }
});

// ---------- /realtime/studio_render (sync) ----------

test("[studio-render] sync: 200 with ok envelope on happy path", async () => {
  const deps = defaultDeps();
  await withTestServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, "/realtime/studio_render", {
      transcript: "make me a scene",
      system_prompt: "you are a writer",
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true);
    assert.equal(r.body.action, "studio_render");
    assert.equal(r.body.reply, "rendered reply");
    assert.equal(deps._calls.renderInvocations.length, 1);
    assert.equal(deps._calls.renderInvocations[0].transcript, "make me a scene");
  });
});

test("[studio-render] sync: applies corrected character bible memory to page prompt", async () => {
  const memoryCalls = [];
  const deps = defaultDeps({
    resolveUserId: () => "user-1",
    creativeMemoryStore: {
      getCreativeMemoryForPrompt: async (args) => {
        memoryCalls.push(args);
        return {
          userId: "user-1",
          version: 1,
          characters: [
            {
              name: "Mara",
              last_referenced: 100,
              bible: {
                canon: ["Mara is Eli's older sister and his legal guardian."],
                corrections: ["Authoritative correction for Mara: Mara is Eli's sister, not his mother."],
                correctedTerms: ["mother"],
                correctionReplacements: ["mother -> Eli's sister"],
                arc: {
                  act: "Act II",
                  want: "win Eli's trust before the hearing",
                  need: "tell the truth in public",
                  falseBelief: "truth will get Eli taken away",
                  currentTactic: "bury evidence to keep him close",
                  nextEmotionalTurn: "choose public courage over control",
                },
              },
            },
          ],
        };
      },
    },
  });

  await withTestServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, "/realtime/studio_render", {
      transcript: "Continue Mara's Act II page from the courthouse.",
      system_prompt: "Return screenplay pages only.",
      screenplay_target: "page",
      screenplay_project_id: "project-1",
      screenplay_project_title: "The Glass Orchard",
    });
    assert.equal(r.status, 200);
    assert.equal(memoryCalls.length, 1);
    assert.equal(memoryCalls[0].userId, "user-1");
    assert.equal(memoryCalls[0].projectId, "project-1");
    assert.equal(memoryCalls[0].projectTitle, "The Glass Orchard");
    assert.equal(memoryCalls[0].recordEpisodicRecall, true);
    const prompt = deps._calls.renderInvocations[0].systemPrompt;
    assert.match(prompt, /<creative_memory>/);
    assert.match(prompt, /Mara is Eli's older sister/);
    assert.match(prompt, /mother -> Eli's sister/);
    assert.match(prompt, /false_belief=truth will get Eli taken away/);
    assert.equal(r.body.memory_applied.creative_memory, true);
    assert.equal(r.body.memory_applied.character_bible, true);
    assert.equal(r.body.memory_applied.character_corrections, true);
    assert.equal(r.body.memory_applied.correction_applied_to_prompt, true);
    assert.deepEqual(r.body.memory_applied.characters, ["Mara"]);
    assert.deepEqual(r.body.memory_applied.corrected_terms, ["mother"]);
    assert.deepEqual(r.body.memory_applied.correction_replacements, ["mother -> Eli's sister"]);
  });
});

test("[studio-render] sync: voice pin target does not inject page memory", async () => {
  let memoryReads = 0;
  const deps = defaultDeps({
    resolveUserId: () => "user-1",
    creativeMemoryStore: {
      getCreativeMemoryForPrompt: async () => {
        memoryReads += 1;
        return null;
      },
    },
  });

  await withTestServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, "/realtime/studio_render", {
      transcript: "Just talk this through with me.",
      system_prompt: "Be conversational.",
      screenplay_target: "voice_pin",
    });
    assert.equal(r.status, 200);
    assert.equal(memoryReads, 0);
    assert.doesNotMatch(deps._calls.renderInvocations[0].systemPrompt, /<creative_memory>/);
    assert.equal(r.body.memory_applied, undefined);
  });
});

test("[studio-render] sync: page target strips screenplay chat drift", async () => {
  const rawReply = [
    "Absolutely - here's the continuation.",
    "",
    "INT. DINER - NIGHT",
    "",
    "Rain needles the front window.",
    "",
    "MARA",
    "He came back.",
    "",
    "Want me to keep going?"
  ].join("\n");
  const deps = defaultDeps({
    renderStudioRealtimeText: async () => rawReply,
  });

  await withTestServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, "/realtime/studio_render", {
      transcript: "continue the scene",
      screenplay_target: "page",
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.reply, [
      "INT. DINER - NIGHT",
      "",
      "Rain needles the front window.",
      "",
      "MARA",
      "He came back."
    ].join("\n"));
  });
});

test("[studio-render] sync: page target strips strategy notes before screenplay text", async () => {
  const rawReply = [
    "Strategy: make the receipt the trap instead of exposition.",
    "The scene needs one irreversible turn before anyone explains the clue.",
    "",
    "INT. MOTEL ROOM - NIGHT",
    "",
    "June folds the receipt into a white square.",
    "",
    "MARCUS",
    "You kept it."
  ].join("\n");
  const deps = defaultDeps({
    renderStudioRealtimeText: async () => rawReply,
  });

  await withTestServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, "/realtime/studio_render", {
      transcript: "make this more expert and faster",
      screenplay_target: "page",
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.reply, [
      "INT. MOTEL ROOM - NIGHT",
      "",
      "June folds the receipt into a white square.",
      "",
      "MARCUS",
      "You kept it."
    ].join("\n"));
  });
});

test("[studio-render] sync: page target strips labels, dividers, and trailing craft notes", async () => {
  const rawReply = [
    "## Screenplay Pages",
    "---",
    "Here are the next pages:",
    "",
    "INT. MOTEL ROOM - NIGHT",
    "",
    "June folds the receipt into a white square.",
    "",
    "MARCUS",
    "You kept it.",
    "",
    "END SCENE.",
    "",
    "Why this works:",
    "This gives the scene pressure without explaining the feeling.",
    "Want me to keep going from here?"
  ].join("\n");
  const deps = defaultDeps({
    renderStudioRealtimeText: async () => rawReply,
  });

  await withTestServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, "/realtime/studio_render", {
      transcript: "write the next page",
      screenplay_target: "page",
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.reply, [
      "INT. MOTEL ROOM - NIGHT",
      "",
      "June folds the receipt into a white square.",
      "",
      "MARCUS",
      "You kept it."
    ].join("\n"));
  });
});

test("[studio-render] sync: infers page target for typed screenplay continuation", async () => {
  const rawReply = [
    "Here are the next pages:",
    "",
    "INT. COURTHOUSE HALLWAY - NIGHT",
    "",
    "Mara stops walking before the verdict reaches her face.",
    "",
    "END SCENE.",
    "",
    "Want me to keep going?"
  ].join("\n");
  const deps = defaultDeps({
    renderStudioRealtimeText: async () => rawReply,
  });

  await withTestServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, "/realtime/studio_render", {
      transcript: "Write the next ten pages of act two.",
      screenplay_act: "Act II",
      screenplay_draft_excerpt: "INT. COURTHOUSE HALLWAY - NIGHT\n\nMARA stops walking.",
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.reply, [
      "INT. COURTHOUSE HALLWAY - NIGHT",
      "",
      "Mara stops walking before the verdict reaches her face."
    ].join("\n"));
  });
});

test("[studio-render] sync: voice pin target preserves conversational reply", async () => {
  const reply = "I can keep helping you shape the scene from here.";
  const deps = defaultDeps({
    renderStudioRealtimeText: async () => reply,
  });

  await withTestServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, "/realtime/studio_render", {
      transcript: "help me think",
      screenplay_target: "voice_pin",
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.reply, reply);
  });
});

test("[studio-render] sync: 503 when OPENAI_API_KEY missing", async () => {
  const deps = defaultDeps({ getOpenAIApiKey: () => "" });
  await withTestServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, "/realtime/studio_render", { transcript: "x" });
    assert.equal(r.status, 503);
    assert.equal(r.body.stage, "studio_render");
    assert.match(r.body.error, /OpenAI API key/);
  });
});

test("[studio-render] sync: explicit test render bypasses missing OPENAI_API_KEY", async () => {
  const deps = defaultDeps({
    getOpenAIApiKey: () => "",
    shouldAllowStudioRenderWithoutOpenAIKey: () => true,
  });
  await withTestServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, "/realtime/studio_render", { transcript: "x" });
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true);
    assert.equal(r.body.reply, "rendered reply");
    assert.equal(deps._calls.renderInvocations.length, 1);
  });
});

test("[studio-render] sync: 400 when transcript is empty", async () => {
  await withTestServer(defaultDeps(), async (baseURL) => {
    const r = await postJson(baseURL, "/realtime/studio_render", { transcript: "" });
    assert.equal(r.status, 400);
    assert.equal(r.body.stage, "studio_render");
    assert.match(r.body.error, /empty/);
  });
});

test("[studio-render] sync: 400 when neither transcript nor user_message provided", async () => {
  await withTestServer(defaultDeps(), async (baseURL) => {
    const r = await postJson(baseURL, "/realtime/studio_render", {});
    assert.equal(r.status, 400);
  });
});

test("[studio-render] sync: accepts user_message as fallback for transcript", async () => {
  const deps = defaultDeps();
  await withTestServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, "/realtime/studio_render", { user_message: "alt field" });
    assert.equal(r.status, 200);
    assert.equal(deps._calls.renderInvocations[0].transcript, "alt field");
  });
});

test("[studio-render] sync: renderer error envelope honors err.status + err.stage + err.message", async () => {
  const err = Object.assign(new Error("upstream boom"), { status: 504, stage: "openai" });
  const deps = defaultDeps({
    renderStudioRealtimeText: async () => { throw err; },
  });
  await withTestServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, "/realtime/studio_render", { transcript: "x" });
    assert.equal(r.status, 504);
    assert.equal(r.body.stage, "openai");
    assert.match(r.body.error, /upstream boom/);
  });
});

test("[studio-render] sync: renderer error without status defaults to 502", async () => {
  const deps = defaultDeps({
    renderStudioRealtimeText: async () => { throw new Error("plain error"); },
  });
  await withTestServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, "/realtime/studio_render", { transcript: "x" });
    assert.equal(r.status, 502);
    assert.equal(r.body.stage, "studio_render");
  });
});

// ---------- /realtime/studio_render_stream (SSE) ----------

test("[studio-render-stream] sse: emits meta + delta + done events on happy path", async () => {
  const deps = defaultDeps();
  await withTestServer(deps, async (baseURL) => {
    const r = await postSse(baseURL, "/realtime/studio_render_stream", { transcript: "stream me" });
    assert.equal(r.status, 200);
    assert.match(r.text, /event: meta\b/);
    assert.match(r.text, /event: delta\b/);
    assert.match(r.text, /event: done\b/);
    // Verify the deltas are in order.
    const deltaCount = (r.text.match(/event: delta\b/g) || []).length;
    assert.equal(deltaCount, 2, "expected 2 delta events from stub");
  });
});

test("[studio-render-stream] sse: applies corrected character bible memory and exposes metadata", async () => {
  const deps = defaultDeps({
    resolveUserId: () => "user-1",
    creativeMemoryStore: {
      getCreativeMemoryForPrompt: async () => ({
        userId: "user-1",
        version: 1,
        characters: [
          {
            name: "Mara",
            last_referenced: 100,
            bible: {
              canon: ["Mara is Eli's older sister and his legal guardian."],
              corrections: ["Authoritative correction for Mara: Mara is Eli's sister, not his mother."],
              correctedTerms: ["mother"],
              correctionReplacements: ["mother -> Eli's sister"],
              arc: {
                act: "Act II",
                want: "win Eli's trust before the hearing",
                need: "tell the truth in public",
              },
            },
          },
        ],
      }),
    },
  });

  await withTestServer(deps, async (baseURL) => {
    const r = await postSse(baseURL, "/realtime/studio_render_stream", {
      transcript: "Stream Mara's next Act II page.",
      system_prompt: "Return screenplay pages only.",
      screenplay_target: "page",
    });
    assert.equal(r.status, 200);
    assert.match(deps._calls.streamInvocations[0].systemPrompt, /<creative_memory>/);
    assert.match(deps._calls.streamInvocations[0].systemPrompt, /mother -> Eli's sister/);
    assert.match(r.text, /event: meta\b/);
    assert.match(r.text, /event: done\b/);
    assert.match(r.text, /"memory_applied":/);
    assert.match(r.text, /"character_bible":true/);
    assert.match(r.text, /"correction_applied_to_prompt":true/);
    assert.match(r.text, /"characters":\["Mara"\]/);
  });
});

test("[studio-render-stream] sse: page target strips screenplay chat drift from deltas and done", async () => {
  const rawReply = [
    "Absolutely - here's the continuation.",
    "",
    "INT. DINER - NIGHT",
    "",
    "Rain needles the front window.",
    "",
    "MARA",
    "He came back.",
    "",
    "Want me to keep going?"
  ].join("\n");
  const deps = defaultDeps({
    streamStudioRealtimeText: async ({ onDelta }) => {
      const first = "Absolutely - here's the continuation.\n\n";
      const second = `${first}INT. DINER - NIGHT\n\nRain needles the front window.\n\nMARA\nHe came back.`;
      await onDelta(first, first);
      await onDelta(second.slice(first.length), second);
      await onDelta("\n\nWant me to keep going?", rawReply);
      return rawReply;
    },
  });

  await withTestServer(deps, async (baseURL) => {
    const r = await postSse(baseURL, "/realtime/studio_render_stream", {
      transcript: "continue the scene",
      screenplay_target: "page",
    });
    assert.equal(r.status, 200);
    assert.match(r.text, /event: delta\b/);
    assert.match(r.text, /INT\. DINER - NIGHT/);
    assert.doesNotMatch(r.text, /Absolutely/);
    assert.doesNotMatch(r.text, /Want me to keep going/);
  });
});

test("[studio-render-stream] sse: page target strips labels and craft notes from deltas and done", async () => {
  const rawReply = [
    "## Screenplay Pages",
    "---",
    "Here are the next pages:",
    "",
    "INT. MOTEL ROOM - NIGHT",
    "",
    "June folds the receipt into a white square.",
    "",
    "MARCUS",
    "You kept it.",
    "",
    "END SCENE.",
    "",
    "Why this works:",
    "This gives the scene pressure without explaining the feeling."
  ].join("\n");
  const deps = defaultDeps({
    streamStudioRealtimeText: async ({ onDelta }) => {
      const first = "## Screenplay Pages\n---\nHere are the next pages:\n\n";
      const second = `${first}INT. MOTEL ROOM - NIGHT\n\nJune folds the receipt into a white square.\n\nMARCUS\nYou kept it.`;
      await onDelta(first, first);
      await onDelta(second.slice(first.length), second);
      await onDelta("\n\nEND SCENE.\n\nWhy this works:\nThis gives the scene pressure without explaining the feeling.", rawReply);
      return rawReply;
    },
  });

  await withTestServer(deps, async (baseURL) => {
    const r = await postSse(baseURL, "/realtime/studio_render_stream", {
      transcript: "write the next page",
      screenplay_target: "page",
    });
    assert.equal(r.status, 200);
    assert.match(r.text, /INT\. MOTEL ROOM - NIGHT/);
    assert.doesNotMatch(r.text, /Screenplay Pages/);
    assert.doesNotMatch(r.text, /Here are the next pages/);
    assert.doesNotMatch(r.text, /END SCENE/);
    assert.doesNotMatch(r.text, /Why this works/);
  });
});

test("[studio-render-stream] sse: emits trace event on first delta", async () => {
  await withTestServer(defaultDeps(), async (baseURL) => {
    const r = await postSse(baseURL, "/realtime/studio_render_stream", { transcript: "x" });
    assert.match(r.text, /event: trace\b/);
    assert.match(r.text, /"kind":"first_delta"/);
  });
});

test("[studio-render-stream] sse: 503 when OPENAI_API_KEY missing", async () => {
  const deps = defaultDeps({ getOpenAIApiKey: () => "" });
  await withTestServer(deps, async (baseURL) => {
    const r = await fetch(`${baseURL}/realtime/studio_render_stream`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ transcript: "x" }),
    });
    assert.equal(r.status, 503);
    const body = await r.json();
    assert.equal(body.stage, "studio_render");
  });
});

test("[studio-render-stream] sse: explicit test render bypasses missing OPENAI_API_KEY", async () => {
  const deps = defaultDeps({
    getOpenAIApiKey: () => "",
    shouldAllowStudioRenderWithoutOpenAIKey: () => true,
  });
  await withTestServer(deps, async (baseURL) => {
    const r = await postSse(baseURL, "/realtime/studio_render_stream", { transcript: "x" });
    assert.equal(r.status, 200);
    assert.match(r.text, /event: done\b/);
    assert.equal(deps._calls.streamInvocations.length, 1);
  });
});

test("[studio-render-stream] sse: 400 when transcript empty", async () => {
  await withTestServer(defaultDeps(), async (baseURL) => {
    const r = await fetch(`${baseURL}/realtime/studio_render_stream`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ transcript: "" }),
    });
    assert.equal(r.status, 400);
  });
});

test("[studio-render-stream] sse: emits error event when streamer throws", async () => {
  const err = Object.assign(new Error("stream boom"), { stage: "openai" });
  const deps = defaultDeps({
    streamStudioRealtimeText: async ({ onDelta }) => {
      await onDelta("partial", "partial");
      throw err;
    },
  });
  await withTestServer(deps, async (baseURL) => {
    const r = await postSse(baseURL, "/realtime/studio_render_stream", { transcript: "x" });
    assert.match(r.text, /event: error\b/);
    assert.match(r.text, /"stage":"openai"/);
    assert.match(r.text, /"error":"stream boom"/);
  });
});

test("[studio-render-stream] sse: sets correct SSE headers", async () => {
  await withTestServer(defaultDeps(), async (baseURL) => {
    const r = await fetch(`${baseURL}/realtime/studio_render_stream`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ transcript: "x" }),
    });
    assert.equal(r.headers.get("content-type"), "text/event-stream");
    assert.equal(r.headers.get("cache-control"), "no-store");
    assert.equal(r.headers.get("connection"), "keep-alive");
    assert.ok(r.headers.get("x-studio-render-request-id"));
  });
});

test("[studio-render-stream] sse: response body is read to completion (no hung connection)", async () => {
  await withTestServer(defaultDeps(), async (baseURL) => {
    const r = await postSse(baseURL, "/realtime/studio_render_stream", { transcript: "x" });
    // The body is fully read before the assertion — proves the server ended the response.
    assert.ok(r.text.length > 0);
    assert.match(r.text, /event: done\b/);
  });
});
