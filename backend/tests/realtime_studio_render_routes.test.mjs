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
