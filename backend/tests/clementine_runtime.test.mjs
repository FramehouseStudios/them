import test from "node:test";
import assert from "node:assert/strict";

import { INTENT, classifyIntent } from "../lib/clementine/intents.js";
import { LANE, EFFORT, laneForIntent } from "../lib/clementine/lanes.js";
import {
  buildPromptCacheKey,
  buildCacheStablePrefix,
  partitionPromptParts,
} from "../lib/clementine/cache_policy.js";
import { createPageReservationStore } from "../lib/clementine/page_cancel.js";
import {
  buildMuseResponsesRequest,
  createMuseClient,
} from "../lib/clementine/muse_client.js";

test("[clementine] greeting/check-in map to Reflex", () => {
  assert.equal(classifyIntent("hey there"), INTENT.GREETING);
  assert.equal(classifyIntent("how are you doing?"), INTENT.CHECK_IN);
  assert.deepEqual(laneForIntent(INTENT.GREETING), {
    intent: INTENT.GREETING,
    lane: LANE.REFLEX,
    effort: EFFORT.NONE,
    usesSpark: false,
    walletMeter: "none",
    ownWallet: false,
  });
});

test("[clementine] page propose intents map to Page lane with low effort", () => {
  assert.equal(
    classifyIntent("write the next beat where she leaves before he answers"),
    INTENT.PAGE_EDIT
  );
  assert.equal(classifyIntent("continue the scene"), INTENT.PAGE_CONTINUE);
  const page = laneForIntent(INTENT.PAGE_EDIT);
  assert.equal(page.lane, LANE.PAGE);
  assert.equal(page.effort, EFFORT.LOW);
  assert.equal(page.walletMeter, "page");
  assert.equal(page.usesSpark, true);
  const multi = laneForIntent(INTENT.PAGE_EDIT, { multiBeat: true });
  assert.equal(multi.effort, EFFORT.MEDIUM);
});

test("[clementine] plan/think-hard map to Deep; companion stays off Page meter", () => {
  assert.equal(classifyIntent("help me plan act two conflict"), INTENT.PLAN);
  assert.equal(classifyIntent("think hard about the twist"), INTENT.THINK_HARD);
  assert.equal(laneForIntent(INTENT.PLAN).lane, LANE.DEEP);
  assert.equal(laneForIntent(INTENT.COMFORT).walletMeter, "companion");
  assert.notEqual(
    laneForIntent(INTENT.COMFORT).walletMeter,
    laneForIntent(INTENT.PAGE_EDIT).walletMeter
  );
});

test("[clementine] barge-in cancel drops page reservations", () => {
  const store = createPageReservationStore({ now: () => 1_700_000_000_000 });
  const a = store.reserve({ sessionId: "s1", maxOutputTokens: 800, reason: "page_propose" });
  const b = store.reserve({ sessionId: "s1", maxOutputTokens: 400 });
  store.reserve({ sessionId: "s2", maxOutputTokens: 200 });
  assert.equal(store.size(), 3);

  const dropped = store.cancelOnBargeIn("s1", { reason: "manual_typing" });
  assert.deepEqual(dropped.sort(), [a.id, b.id].sort());
  assert.equal(store.get(a.id).status, "cancelled");
  assert.equal(store.get(a.id).cancelReason, "manual_typing");
  assert.equal(store.get(b.id).status, "cancelled");
  assert.equal(store.get(store.listForSession("s2")[0].id).status, "reserved");
});

test("[clementine] cache policy keeps dynamic junk out of stable prefix", () => {
  const prefix = buildCacheStablePrefix({
    personaText: "You are Clementine.",
    voiceSpecText: "Short by default.",
  });
  assert.match(prefix, /Clementine/);
  assert.match(prefix, /Short by default/);
  assert.equal(buildPromptCacheKey({ version: "v0" }), "them-clementine-v0");

  const parts = partitionPromptParts({
    personaText: "PERSONA",
    voiceSpecText: "VOICE",
    dynamicContext: "user=u123 mood=anxious date=2026-09-01",
    userUtterance: "continue the scene",
  });
  assert.equal(parts.instructions, "PERSONA\n\nVOICE");
  assert.match(parts.dynamicInput, /user=u123/);
  assert.match(parts.dynamicInput, /continue the scene/);
  assert.equal(parts.instructions.includes("u123"), false);
  assert.equal(parts.prompt_cache_key.startsWith("them-clementine-"), true);
});

// Default-model assertions must not depend on the developer's shell. A local
// MUSE_MODEL export (e.g. trialing muse-spark-1.3) is a legitimate override,
// so these tests clear it and a separate test proves the override is honored.
function withoutMuseModelEnv(fn) {
  const prev = process.env.MUSE_MODEL;
  delete process.env.MUSE_MODEL;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.MUSE_MODEL;
    else process.env.MUSE_MODEL = prev;
  }
}

test("[clementine] muse client builds Standard Responses body with store:false", () => {
  withoutMuseModelEnv(() => {
    const { url, body } = buildMuseResponsesRequest({
      instructions: "PERSONA",
      input: [{ role: "user", content: "hi" }],
      maxOutputTokens: 256,
      reasoningEffort: "minimal",
    });
    assert.equal(url, "https://api.meta.ai/v1/responses");
    assert.equal(body.model, "muse-spark-1.2");
    assert.equal(body.store, false);
    assert.equal(body.reasoning.effort, "minimal");
    assert.equal(body.prompt_cache_key, "them-clementine-v0");
    assert.equal(body.instructions, "PERSONA");
  });
});

test("[clementine] MUSE_MODEL env overrides the default model without a code change", async () => {
  const prev = process.env.MUSE_MODEL;
  process.env.MUSE_MODEL = "muse-spark-1.3";
  try {
    const { body } = buildMuseResponsesRequest({ input: "hi" });
    assert.equal(body.model, "muse-spark-1.3");
    assert.equal(body.store, false, "override must not change store:false");
    assert.equal(body.prompt_cache_key, "them-clementine-v0", "override must not change cache key");

    const calls = [];
    const client = createMuseClient({
      apiKey: "test-not-a-real-key",
      fetchImpl: async (url, init) => {
        calls.push({ url, init });
        return { ok: true, status: 200, text: async () => JSON.stringify({ id: "resp_env", output_text: "ok" }) };
      },
    });
    const result = await client.createResponse({ input: "hello", maxOutputTokens: 16 });
    assert.equal(result.ok, true);
    assert.equal(JSON.parse(calls[0].init.body).model, "muse-spark-1.3");
  } finally {
    if (prev === undefined) delete process.env.MUSE_MODEL;
    else process.env.MUSE_MODEL = prev;
  }
});

test("[clementine] muse client works with injected fetch (no real key in tests)", async () => {
  const calls = [];
  const client = withoutMuseModelEnv(() => createMuseClient({
    apiKey: "test-not-a-real-key",
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: "resp_test", output_text: "ok" }),
      };
    },
  }));
  assert.equal(client.kind, "muse");
  assert.equal(client.hasApiKey, true);
  const result = await client.createResponse({
    input: "hello",
    reasoningEffort: "low",
    maxOutputTokens: 64,
  });
  assert.equal(result.ok, true);
  assert.equal(result.payload.id, "resp_test");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.meta.ai/v1/responses");
  const sent = JSON.parse(calls[0].init.body);
  assert.equal(sent.store, false);
  assert.equal(sent.model, "muse-spark-1.2");
});

test("[clementine] muse client fails closed without api key", async () => {
  const prevModel = process.env.MODEL_API_KEY;
  const prevMuse = process.env.MUSE_API_KEY;
  delete process.env.MODEL_API_KEY;
  delete process.env.MUSE_API_KEY;
  try {
    const client = createMuseClient({ apiKey: "", fetchImpl: async () => ({}) });
    await assert.rejects(
      () => client.createResponse({ input: "x" }),
      (err) => err.code === "muse_client_unauthorized" && err.status === 503
    );
  } finally {
    if (prevModel !== undefined) process.env.MODEL_API_KEY = prevModel;
    if (prevMuse !== undefined) process.env.MUSE_API_KEY = prevMuse;
  }
});

test("[clementine] cancel(reservationId) + proceed rejects cancelled work", () => {
  const store = createPageReservationStore({ now: () => 1_700_000_000_100 });
  const r = store.reserve({
    sessionId: "s-page",
    userId: "u1",
    maxOutputTokens: 512,
    reason: "page_edit",
  });
  assert.equal(store.proceed(r.id).ok, true);
  assert.equal(store.proceed(r.id).code, "ok");

  const cancelled = store.cancel(r.id, { reason: "barge_in" });
  assert.equal(cancelled.cancelled, true);
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.cancelReason, "barge_in");

  const again = store.cancel(r.id, { reason: "barge_in" });
  assert.equal(again.cancelled, false); // idempotent no-op

  const gate = store.proceed(r.id);
  assert.equal(gate.ok, false);
  assert.equal(gate.code, "page_reservation_cancelled");
  assert.equal(gate.reservation.status, "cancelled");

  assert.equal(store.proceed("missing-id").ok, false);
  assert.equal(store.proceed("missing-id").code, "page_reservation_missing");
});

test("[clementine] cancelByOwner drops session page work; proceed no-ops billing", () => {
  const store = createPageReservationStore({ now: () => 1_700_000_000_200 });
  const a = store.reserve({ sessionId: "owner-s", userId: "u-a", maxOutputTokens: 100 });
  const b = store.reserve({ sessionId: "owner-s", userId: "u-a", maxOutputTokens: 200 });
  const other = store.reserve({ sessionId: "other-s", userId: "u-b", maxOutputTokens: 50 });

  const dropped = store.cancelByOwner(
    { sessionId: "owner-s", userId: "u-a" },
    { reason: "manual_typing" }
  );
  assert.deepEqual(dropped.sort(), [a.id, b.id].sort());
  assert.equal(store.proceed(a.id).ok, false);
  assert.equal(store.proceed(b.id).ok, false);
  assert.equal(store.proceed(other.id).ok, true);
});
