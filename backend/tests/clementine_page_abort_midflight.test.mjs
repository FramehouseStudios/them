import test from "node:test";
import assert from "node:assert/strict";
import express from "express";

import { createPageReservationStore } from "../lib/clementine/page_cancel.js";
import {
  createPageCancelledError,
  gatePageGeneration,
  isPageCancelledError,
  mapAbortToPageCancel,
} from "../lib/clementine/page_abort.js";
import { createPageLaneTalkAdapter } from "../lib/clementine/page_lane_adapter.js";
import { createMuseClient } from "../lib/clementine/muse_client.js";
import { createChatSupplier } from "../lib/talk_supplier_glue.js";
import { mountPageCancelRoute } from "../lib/talk_pipeline.js";

test("[page-abort-midflight] reserve attaches AbortSignal; cancel aborts it", () => {
  const store = createPageReservationStore({ now: () => 1 });
  const r = store.reserve({ sessionId: "s-abort", maxOutputTokens: 128 });
  const signal = store.getAbortSignal(r.id);
  assert.ok(signal);
  assert.equal(signal.aborted, false);
  assert.equal(store.get(r.id).aborted, false);

  let sawAbort = false;
  signal.addEventListener("abort", () => {
    sawAbort = true;
  });

  const cancelled = store.cancel(r.id, { reason: "barge_in" });
  assert.equal(cancelled.cancelled, true);
  assert.equal(signal.aborted, true);
  assert.equal(sawAbort, true);
  assert.equal(store.get(r.id).aborted, true);
  assert.equal(store.proceed(r.id).ok, false);
});

test("[page-abort-midflight] cancelByOwner aborts all matching controllers", () => {
  const store = createPageReservationStore({ now: () => 2 });
  const a = store.reserve({ sessionId: "own", userId: "u", maxOutputTokens: 1 });
  const b = store.reserve({ sessionId: "own", userId: "u", maxOutputTokens: 2 });
  const keep = store.reserve({ sessionId: "other", maxOutputTokens: 3 });
  const sigA = store.getAbortSignal(a.id);
  const sigB = store.getAbortSignal(b.id);
  const sigKeep = store.getAbortSignal(keep.id);

  const dropped = store.cancelByOwner({ sessionId: "own" }, { reason: "manual_typing" });
  assert.deepEqual(dropped.sort(), [a.id, b.id].sort());
  assert.equal(sigA.aborted, true);
  assert.equal(sigB.aborted, true);
  assert.equal(sigKeep.aborted, false);
  assert.equal(store.proceed(a.id).ok, false);
  assert.equal(store.proceed(keep.id).ok, true);
});

test("[page-abort-midflight] gatePageGeneration throws when cancelled; no proceed", () => {
  const store = createPageReservationStore({ now: () => 3 });
  const r = store.reserve({ sessionId: "gate", maxOutputTokens: 10 });
  const clementine = {
    reservationId: r.id,
    abortSignal: store.getAbortSignal(r.id),
    proceed: () => store.proceed(r.id),
  };
  const gated = gatePageGeneration(clementine);
  assert.equal(gated.ok, true);
  assert.equal(gated.signal, clementine.abortSignal);

  store.cancel(r.id, { reason: "barge_in" });
  assert.throws(
    () => gatePageGeneration(clementine),
    (err) => isPageCancelledError(err) && err.status === 409
  );
  assert.equal(store.proceed(r.id).ok, false);
});

test("[page-abort-midflight] start → cancel aborts in-flight fetch (no proceed)", async () => {
  const store = createPageReservationStore({ now: () => 4 });
  const r = store.reserve({ sessionId: "flight", maxOutputTokens: 64 });
  const signal = store.getAbortSignal(r.id);

  let fetchStarted = false;
  let fetchAborted = false;
  const fetchImpl = (_url, init = {}) =>
    new Promise((resolve, reject) => {
      fetchStarted = true;
      const onAbort = () => {
        fetchAborted = true;
        const err = new Error("Aborted");
        err.name = "AbortError";
        reject(err);
      };
      if (init.signal?.aborted) {
        onAbort();
        return;
      }
      init.signal?.addEventListener("abort", onAbort, { once: true });
      // Never resolve unless aborted — simulates long model call.
    });

  const client = createMuseClient({
    apiKey: "test-key",
    fetchImpl,
    timeoutMs: 30_000,
  });

  const pending = client.createResponse({
    input: "write the next beat",
    signal,
  });

  // Let the fetch start, then cancel mid-flight.
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(fetchStarted, true);
  assert.equal(store.proceed(r.id).ok, true); // still reserved until cancel

  store.cancel(r.id, { reason: "barge_in" });
  assert.equal(store.proceed(r.id).ok, false);

  await assert.rejects(
    pending,
    (err) =>
      (err.cancelled === true || err.name === "AbortError") &&
      (err.code === "page_generation_cancelled" || err.name === "AbortError")
  );
  assert.equal(fetchAborted, true);
  assert.equal(signal.aborted, true);
});

test("[page-abort-midflight] chat supplier maps page signal abort to cancelled (not timeout)", async () => {
  const store = createPageReservationStore({ now: () => 5 });
  const r = store.reserve({ sessionId: "chat", maxOutputTokens: 8 });
  const signal = store.getAbortSignal(r.id);

  const supplier = createChatSupplier({
    OPENAI_API_KEY: "k",
    CHAT_TIMEOUT_MS: 30_000,
    fetchWithTimeout: async (_url, init) => {
      await new Promise((_, reject) => {
        const fail = () => {
          const err = new Error("Aborted");
          err.name = "AbortError";
          reject(err);
        };
        if (init.signal?.aborted) return fail();
        init.signal?.addEventListener("abort", fail, { once: true });
      });
    },
    isAbortError: (err) => err?.name === "AbortError",
    streamChatReplyWithFirstSentence: async () => ({ reply: "" }),
  });

  const pending = supplier.chat({
    model: "gpt-test",
    messages: [{ role: "user", content: "hi" }],
    signal,
  });
  await new Promise((r) => setTimeout(r, 10));
  store.cancelByOwner({ sessionId: "chat" }, { reason: "barge_in" });

  await assert.rejects(pending, (err) => isPageCancelledError(err) && err.status === 409);
  assert.equal(store.proceed(r.id).ok, false);
});

test("[page-abort-midflight] adapter exposes abortSignal; HTTP cancel aborts mid-flight waiter", async () => {
  const store = createPageReservationStore({ now: () => 6 });
  let seenSignal = null;
  let resolveWait;
  const waitPromise = new Promise((resolve) => {
    resolveWait = resolve;
  });

  const handleTalkRequest = async (req, res) => {
    seenSignal = req.clementine?.abortSignal || null;
    assert.ok(seenSignal);
    const onAbort = () => {
      resolveWait({ aborted: true, reservationId: req.clementine.reservationId });
    };
    if (seenSignal.aborted) onAbort();
    else seenSignal.addEventListener("abort", onAbort, { once: true });

    const outcome = await waitPromise;
    return res.status(409).json({
      ok: false,
      cancelled: true,
      ...outcome,
      proceed_ok: store.proceed(req.clementine.reservationId).ok,
    });
  };

  const wrapped = createPageLaneTalkAdapter({
    handleTalkRequest,
    pageReservationStore: store,
  });

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.authUser = { id: "writer" }; next(); });
  app.post("/talk", (req, res) => wrapped(req, res));
  mountPageCancelRoute(app, { pageReservationStore: store });
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const port = server.address().port;
  try {
    const talkPromise = fetch(`http://127.0.0.1:${port}/talk`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-session-id": "midflight-sess",
      },
      body: JSON.stringify({
        client_transcript: "continue the scene",
        screenplay_target: "page",
      }),
    });

    // Wait until adapter has reserved + handler attached the signal.
    for (let i = 0; i < 50 && !seenSignal; i++) {
      await new Promise((r) => setTimeout(r, 10));
    }
    assert.ok(seenSignal);
    const reservationId = [...store.listForSession("midflight-sess")][0]?.id;
    assert.ok(reservationId);

    const cancelRes = await fetch(`http://127.0.0.1:${port}/talk/page-cancel`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reservation_id: reservationId, reason: "barge_in" }),
    });
    assert.equal(cancelRes.status, 200);

    const talkRes = await talkPromise;
    assert.equal(talkRes.status, 409);
    const body = await talkRes.json();
    assert.equal(body.cancelled, true);
    assert.equal(body.aborted, true);
    assert.equal(body.proceed_ok, false);
    assert.equal(seenSignal.aborted, true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("[page-abort-midflight] mapAbortToPageCancel distinguishes timeout vs page cancel", () => {
  const timeoutErr = new Error("Aborted");
  timeoutErr.name = "AbortError";
  const mappedTimeout = mapAbortToPageCancel(timeoutErr, { aborted: false });
  assert.equal(isPageCancelledError(mappedTimeout), false);

  const pageErr = mapAbortToPageCancel(timeoutErr, { aborted: true, reason: "barge_in" }, {
    reservationId: "r1",
  });
  assert.equal(isPageCancelledError(pageErr), true);
  assert.equal(pageErr.cancelReason, "barge_in");

  const explicit = createPageCancelledError({ reason: "x", reservationId: "r2" });
  assert.equal(isPageCancelledError(explicit), true);
});
