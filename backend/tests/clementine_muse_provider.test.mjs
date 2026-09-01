import test from "node:test";
import assert from "node:assert/strict";

import {
  isClementineMuseEnabled,
  shouldUseMuseForLane,
  messagesToMuseParts,
  extractMuseOutputText,
  createMuseAwareChatSupplier,
} from "../lib/clementine/muse_provider.js";
import { LANE } from "../lib/clementine/lanes.js";
import { createMuseClient, buildMuseResponsesRequest } from "../lib/clementine/muse_client.js";
import { expectsAudioTalkResponse } from "../lib/clementine/page_lane_adapter.js";

async function withEnv(overrides, fn) {
  const prev = {};
  for (const [k, v] of Object.entries(overrides)) {
    prev[k] = process.env[k];
    if (v === undefined || v === null) delete process.env[k];
    else process.env[k] = String(v);
  }
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test("[muse-provider] gated off by default / without key", async () => {
  await withEnv(
    {
      CLEMENTINE_MUSE_ENABLED: "0",
      CLEMENTINE_PROVIDER: "openai",
      MODEL_API_KEY: "",
      MUSE_API_KEY: "",
    },
    () => {
      delete process.env.MODEL_API_KEY;
      delete process.env.MUSE_API_KEY;
      assert.equal(isClementineMuseEnabled(), false);
      assert.equal(shouldUseMuseForLane(LANE.COMPANION), false);
    }
  );
});

test("[muse-provider] flag alone is not enough without key", async () => {
  await withEnv(
    {
      CLEMENTINE_MUSE_ENABLED: "1",
      CLEMENTINE_PROVIDER: "",
      MODEL_API_KEY: "",
      MUSE_API_KEY: "",
    },
    () => {
      delete process.env.MODEL_API_KEY;
      delete process.env.MUSE_API_KEY;
      assert.equal(isClementineMuseEnabled(), false);
    }
  );
});

test("[muse-provider] enabled with CLEMENTINE_MUSE_ENABLED + MODEL_API_KEY", async () => {
  await withEnv(
    {
      CLEMENTINE_MUSE_ENABLED: "1",
      CLEMENTINE_PROVIDER: "",
      MODEL_API_KEY: "test-key",
      MUSE_API_KEY: "",
    },
    () => {
      assert.equal(isClementineMuseEnabled(), true);
      assert.equal(shouldUseMuseForLane(LANE.COMPANION), true);
      assert.equal(shouldUseMuseForLane(LANE.PAGE), true);
      assert.equal(shouldUseMuseForLane(LANE.DEEP), true);
      assert.equal(shouldUseMuseForLane(LANE.REFLEX), false);
    }
  );
});

test("[muse-provider] CLEMENTINE_PROVIDER=muse + MUSE_API_KEY enables", async () => {
  await withEnv(
    {
      CLEMENTINE_MUSE_ENABLED: "0",
      CLEMENTINE_PROVIDER: "muse",
      MODEL_API_KEY: "",
      MUSE_API_KEY: "alias-key",
    },
    () => {
      delete process.env.MODEL_API_KEY;
      assert.equal(isClementineMuseEnabled(), true);
    }
  );
});

test("[muse-provider] messagesToMuseParts + request shape (Standard, store:false)", () => {
  const mapped = messagesToMuseParts([
    { role: "system", content: "You are Clementine." },
    { role: "user", content: "continue the scene softly" },
  ]);
  assert.match(mapped.instructions, /Clementine/);
  assert.equal(mapped.input.length, 1);
  assert.equal(mapped.input[0].role, "user");
  assert.ok(mapped.promptCacheKey.startsWith("them-clementine-"));

  const { url, body } = buildMuseResponsesRequest({
    instructions: mapped.instructions,
    input: mapped.input,
    reasoningEffort: "low",
    maxOutputTokens: 128,
    promptCacheKey: mapped.promptCacheKey,
  });
  assert.equal(url, "https://api.meta.ai/v1/responses");
  assert.equal(body.model, "muse-spark-1.2");
  assert.equal(body.store, false);
  assert.equal(body.reasoning.effort, "low");
  assert.equal(body.prompt_cache_key, mapped.promptCacheKey);
});

test("[muse-provider] muse-aware chatSupplier uses Muse when gated; OpenAI otherwise", async () => {
  const openaiCalls = [];
  const openai = {
    kind: "openai-chat",
    async chat(args) {
      openaiCalls.push(args);
      return {
        response: { ok: true, status: 200 },
        rawText: JSON.stringify({
          choices: [{ message: { role: "assistant", content: "from-openai" } }],
        }),
        model: "gpt-4o-mini",
        apiMode: "chat_completions",
        reasoningEffort: "",
        fallbackUsed: false,
        usage: { inputTokens: 1, outputTokens: 2, reasoningTokens: 0, totalTokens: 3 },
      };
    },
    async stream() {
      throw new Error("stream not used in this test");
    },
  };

  await withEnv(
    {
      CLEMENTINE_MUSE_ENABLED: "0",
      CLEMENTINE_PROVIDER: "",
      MODEL_API_KEY: "unused",
    },
    async () => {
      const supplier = createMuseAwareChatSupplier({ openaiChatSupplier: openai });
      const off = await supplier.chat({
        lane: LANE.COMPANION,
        messages: [{ role: "user", content: "hi" }],
        maxTokens: 32,
      });
      assert.equal(openaiCalls.length, 1);
      assert.match(off.rawText, /from-openai/);
    }
  );

  const museFetches = [];
  await withEnv(
    {
      CLEMENTINE_MUSE_ENABLED: "1",
      CLEMENTINE_PROVIDER: "muse",
      MODEL_API_KEY: "test-meta-key",
    },
    async () => {
      const museClient = createMuseClient({
        apiKey: "test-meta-key",
        fetchImpl: async (url, init) => {
          museFetches.push({ url, init });
          return {
            ok: true,
            status: 200,
            text: async () =>
              JSON.stringify({
                id: "resp_mock",
                model: "muse-spark-1.2",
                output_text: "from-muse",
                usage: { input_tokens: 10, output_tokens: 4, total_tokens: 14 },
              }),
          };
        },
      });
      const supplier = createMuseAwareChatSupplier({
        openaiChatSupplier: openai,
        museClient,
      });
      const beforeOpenai = openaiCalls.length;
      const on = await supplier.chat({
        lane: LANE.PAGE,
        messages: [
          { role: "system", content: "PERSONA" },
          { role: "user", content: "rewrite the beat" },
        ],
        maxTokens: 64,
        reasoningEffort: "low",
        signal: null,
      });
      assert.equal(openaiCalls.length, beforeOpenai, "OpenAI must not be called when Muse is on");
      assert.equal(on.provider, "muse");
      assert.equal(on.model, "muse-spark-1.2");
      assert.equal(on.usage.outputTokens, 4);
      assert.match(on.rawText, /from-muse/);
      assert.equal(museFetches.length, 1);
      assert.equal(museFetches[0].url, "https://api.meta.ai/v1/responses");
      const sent = JSON.parse(museFetches[0].init.body);
      assert.equal(sent.model, "muse-spark-1.2");
      assert.equal(sent.store, false);
      assert.equal(sent.reasoning.effort, "low");
      assert.equal(sent.max_output_tokens, 64);
      assert.ok(String(museFetches[0].init.headers.Authorization).includes("test-meta-key"));

      // Reflex lane must not hit Muse even when flag is on.
      const reflex = await supplier.chat({
        lane: LANE.REFLEX,
        messages: [{ role: "user", content: "hey" }],
        maxTokens: 16,
      });
      assert.match(reflex.rawText, /from-openai/);
    }
  );
});

test("[muse-provider] extractMuseOutputText reads output_text", () => {
  assert.equal(extractMuseOutputText({ output_text: " hi " }), "hi");
  assert.equal(
    extractMuseOutputText({
      output: [{ content: [{ type: "output_text", text: "a" }, { type: "output_text", text: "b" }] }],
    }),
    "a\nb"
  );
});

test("[muse-provider] expectsAudioTalkResponse detects multipart / file", () => {
  assert.equal(expectsAudioTalkResponse({ headers: {}, get: () => "" }), false);
  assert.equal(
    expectsAudioTalkResponse({
      file: { originalname: "recording.m4a" },
      headers: {},
      get: () => "",
    }),
    true
  );
  assert.equal(
    expectsAudioTalkResponse({
      headers: { "content-type": "multipart/form-data; boundary=x" },
      get: () => "",
    }),
    true
  );
});
