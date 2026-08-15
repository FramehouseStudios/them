import test from "node:test";
import assert from "node:assert/strict";

import {
  createChatSupplier,
  createSttSupplier,
  createTtsSupplier,
} from "../lib/talk_supplier_glue.js";

const okResponse = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => body,
});

test("[phase7c] STT supplier exposes frozen canonical shape and transcribes", async () => {
  const calls = [];
  const supplier = createSttSupplier({
    OPENAI_API_KEY: "test-key",
    STT_LANGUAGE: "en",
    STT_MODEL_PRIMARY: "primary-stt",
    STT_TIMEOUT_MS: 123,
    fetchWithTimeout: async (url, init, timeoutMs) => {
      calls.push({ url, init, timeoutMs });
      return okResponse('{"text":"hello"}');
    },
    isAbortError: () => false,
  });

  assert.equal(Object.isFrozen(supplier), true);
  assert.equal(supplier.kind, "openai-transcription");
  assert.equal(typeof supplier.transcribe, "function");

  const result = await supplier.transcribe({
    uploadedFile: {
      buffer: Buffer.from("audio"),
      originalname: "voice.m4a",
      mimetype: "audio/m4a",
    },
  });

  assert.equal(result.model, "primary-stt");
  assert.equal(result.rawText, '{"text":"hello"}');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.openai.com/v1/audio/transcriptions");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.Authorization, "Bearer test-key");
  assert.equal(calls[0].timeoutMs, 123);
});

test("[phase7c] STT supplier preserves timeout stage/status", async () => {
  const abortErr = new Error("aborted");
  const supplier = createSttSupplier({
    OPENAI_API_KEY: "test-key",
    fetchWithTimeout: async () => {
      throw abortErr;
    },
    isAbortError: (err) => err === abortErr,
  });

  await assert.rejects(
    () => supplier.transcribe({
      uploadedFile: {
        buffer: Buffer.from("audio"),
        originalname: "voice.m4a",
        mimetype: "audio/m4a",
      },
    }),
    (err) => {
      assert.equal(err.stage, "stt");
      assert.equal(err.status, 504);
      assert.equal(err.message, "Transcription timed out.");
      return true;
    }
  );
});

test("[phase7c] chat supplier delegates streaming and non-streaming calls", async () => {
  const calls = [];
  const supplier = createChatSupplier({
    OPENAI_API_KEY: "chat-key",
    CHAT_TIMEOUT_MS: 456,
    fetchWithTimeout: async (url, init, timeoutMs) => {
      calls.push({ url, init, timeoutMs });
      return okResponse('{"choices":[{"message":{"content":"hi"}}]}');
    },
    isAbortError: () => false,
    streamChatReplyWithFirstSentence: async (args) => ({
      reply: `stream:${args.transcript}`,
      firstSentence: "stream:first",
    }),
  });

  assert.equal(Object.isFrozen(supplier), true);
  assert.equal(supplier.kind, "openai-chat");
  assert.equal(typeof supplier.chat, "function");
  assert.equal(typeof supplier.stream, "function");

  const streamed = await supplier.stream({ transcript: "hello" });
  assert.deepEqual(streamed, {
    reply: "stream:hello",
    firstSentence: "stream:first",
  });

  const result = await supplier.chat({
    model: "gpt-test",
    temperature: 0.4,
    maxTokens: 99,
    messages: [{ role: "user", content: "hello" }],
  });

  assert.equal(result.rawText, '{"choices":[{"message":{"content":"hi"}}]}');
  assert.equal(calls[0].url, "https://api.openai.com/v1/chat/completions");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.Authorization, "Bearer chat-key");
  assert.equal(calls[0].init.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    model: "gpt-test",
    temperature: 0.4,
    max_tokens: 99,
    messages: [{ role: "user", content: "hello" }],
  });
  assert.equal(calls[0].timeoutMs, 456);
});

test("[phase7c] chat supplier preserves timeout stage/status", async () => {
  const abortErr = new Error("aborted");
  const supplier = createChatSupplier({
    OPENAI_API_KEY: "chat-key",
    fetchWithTimeout: async () => {
      throw abortErr;
    },
    isAbortError: (err) => err === abortErr,
    streamChatReplyWithFirstSentence: async () => ({}),
  });

  await assert.rejects(
    () => supplier.chat({
      model: "gpt-test",
      temperature: 0.2,
      maxTokens: 10,
      messages: [],
    }),
    (err) => {
      assert.equal(err.stage, "chat");
      assert.equal(err.status, 504);
      assert.equal(err.message, "Chat completion timed out.");
      return true;
    }
  );
});

test("[structural-model] chat supplier uses Responses and preserves its effective model metadata", async () => {
  const calls = [];
  const supplier = createChatSupplier({
    OPENAI_API_KEY: "chat-key",
    CHAT_TIMEOUT_MS: 456,
    fetchWithTimeout: async (url, init) => {
      calls.push({ url, body: JSON.parse(init.body) });
      return okResponse(JSON.stringify({
        id: "resp_structural",
        model: "gpt-structural",
        output: [{
          type: "message",
          content: [{ type: "output_text", text: "INT. ARCHIVE - NIGHT" }],
        }],
      }));
    },
    isAbortError: () => false,
    streamChatReplyWithFirstSentence: async () => ({}),
  });

  const result = await supplier.chat({
    apiMode: "responses",
    model: "gpt-structural",
    reasoningEffort: "high",
    fallbackModel: "gpt-rich",
    temperature: 0.3,
    maxTokens: 1200,
    messages: [{ role: "user", content: "Repair the page." }],
  });

  assert.equal(calls[0].url, "https://api.openai.com/v1/responses");
  assert.equal(calls[0].body.reasoning.effort, "high");
  assert.equal("temperature" in calls[0].body, false);
  assert.equal(JSON.parse(result.rawText).choices[0].message.content, "INT. ARCHIVE - NIGHT");
  assert.equal(result.model, "gpt-structural");
  assert.equal(result.apiMode, "responses");
  assert.equal(result.reasoningEffort, "high");
  assert.equal(result.fallbackUsed, false);
});

test("[phase7c] TTS supplier delegates all three synthesis seams", async () => {
  const calls = [];
  const supplier = createTtsSupplier({
    synthesizeSpeechMp3: async (args) => {
      calls.push(["synthesize", args]);
      return { provider: "openai", buffer: Buffer.from("mp3") };
    },
    synthesizeSpeechMp3OpenAI: async (args) => {
      calls.push(["openai", args]);
      return { provider: "openai", buffer: Buffer.from("recover") };
    },
    synthesizeTalkScreenplayPageAudio: async (args) => {
      calls.push(["screenplay", args]);
      return { providerLabel: "openai", firstSegmentBuffer: Buffer.from("page") };
    },
  });

  assert.equal(Object.isFrozen(supplier), true);
  assert.equal(supplier.kind, "runtime-tts");
  assert.equal(typeof supplier.synthesize, "function");
  assert.equal(typeof supplier.synthesizeOpenAI, "function");
  assert.equal(typeof supplier.synthesizeScreenplayPage, "function");

  assert.equal((await supplier.synthesize({ text: "a" })).provider, "openai");
  assert.equal((await supplier.synthesizeOpenAI({ inputText: "b" })).buffer.toString(), "recover");
  assert.equal(
    (await supplier.synthesizeScreenplayPage({ screenplayOutput: {} })).firstSegmentBuffer.toString(),
    "page"
  );
  assert.deepEqual(calls.map(([name]) => name), ["synthesize", "openai", "screenplay"]);
});

test("[phase7c] supplier module exports no setter-shaped state hooks", async () => {
  const mod = await import("../lib/talk_supplier_glue.js");
  for (const name of Object.keys(mod)) {
    assert.equal(
      /^set[A-Z]/.test(name),
      false,
      `talk_supplier_glue.js must not export setter-shaped module state: ${name}`
    );
  }
});
