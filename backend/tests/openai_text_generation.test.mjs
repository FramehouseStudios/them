import test from "node:test";
import assert from "node:assert/strict";

import {
  buildOpenAITextRequest,
  extractOpenAIResponseText,
  normalizeOpenAITextResponseRaw,
  parseOpenAITextStreamLine,
  requestOpenAIText,
} from "../lib/openai_text_generation.js";

const response = (status, body = "") => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => body,
});

test("[structural-model] Responses requests carry reasoning effort without temperature", () => {
  const request = buildOpenAITextRequest({
    apiMode: "responses",
    model: "gpt-structural",
    messages: [{ role: "user", content: "Break Act II." }],
    temperature: 0.7,
    maxTokens: 2400,
    reasoningEffort: "high",
    stream: true,
  });

  assert.equal(request.url, "https://api.openai.com/v1/responses");
  assert.deepEqual(request.body, {
    model: "gpt-structural",
    input: [{ role: "user", content: "Break Act II." }],
    max_output_tokens: 3960,
    reasoning: { effort: "high" },
    store: false,
    stream: true,
  });
  assert.equal("temperature" in request.body, false);
});

test("[structural-model] Responses output normalizes to the existing chat envelope", () => {
  const payload = {
    id: "resp_1",
    model: "gpt-structural",
    output: [{
      type: "message",
      content: [{ type: "output_text", text: "INT. MOTEL - NIGHT" }],
    }],
  };
  assert.equal(extractOpenAIResponseText(payload), "INT. MOTEL - NIGHT");
  const normalized = JSON.parse(normalizeOpenAITextResponseRaw(JSON.stringify(payload), "responses"));
  assert.equal(normalized.choices[0].message.content, "INT. MOTEL - NIGHT");
});

test("[structural-model] Responses SSE exposes deltas and completion", () => {
  assert.deepEqual(
    parseOpenAITextStreamLine(
      'data: {"type":"response.output_text.delta","delta":"MARA"}',
      "responses"
    ),
    { handled: true, done: false, delta: "MARA", error: "" }
  );
  assert.equal(
    parseOpenAITextStreamLine('data: {"type":"response.completed"}', "responses").done,
    true
  );
});

test("[structural-model] unavailable structural model falls back exactly once before streaming", async () => {
  const calls = [];
  const result = await requestOpenAIText({
    apiKey: "test-key",
    apiMode: "responses",
    model: "gpt-structural",
    messages: [{ role: "user", content: "Write the page." }],
    temperature: 0.4,
    maxTokens: 1600,
    reasoningEffort: "medium",
    stream: true,
    fallbackModel: "gpt-rich",
    timeoutMs: 500,
    fetchWithTimeout: async (url, init, timeoutMs) => {
      calls.push({ url, body: JSON.parse(init.body), timeoutMs });
      return calls.length === 1
        ? response(404, '{"error":"model unavailable"}')
        : response(200);
    },
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, "https://api.openai.com/v1/responses");
  assert.equal(calls[1].url, "https://api.openai.com/v1/chat/completions");
  assert.equal(calls[1].body.model, "gpt-rich");
  assert.equal(calls[1].body.stream, true);
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.apiMode, "chat_completions");
  assert.equal(result.model, "gpt-rich");
});

test("[structural-model] auth failures never trigger a second provider request", async () => {
  let calls = 0;
  const result = await requestOpenAIText({
    apiKey: "bad-key",
    apiMode: "responses",
    model: "gpt-structural",
    messages: [],
    maxTokens: 100,
    fallbackModel: "gpt-rich",
    fetchWithTimeout: async () => {
      calls += 1;
      return response(401, "unauthorized");
    },
  });

  assert.equal(calls, 1);
  assert.equal(result.response.status, 401);
  assert.equal(result.fallbackUsed, false);
});
