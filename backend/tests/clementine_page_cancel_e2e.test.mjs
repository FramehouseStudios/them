import test from "node:test";
import assert from "node:assert/strict";
import express from "express";

import { createPageReservationStore } from "../lib/clementine/page_cancel.js";
import { LANE, INTENT } from "../lib/clementine/index.js";
import {
  beginPageWork,
  resolveTalkLane,
  createPageLaneTalkAdapter,
} from "../lib/clementine/page_lane_adapter.js";
import {
  mountTalkPipelineRoutes,
  mountPageCancelRoute,
} from "../lib/talk_pipeline.js";

test("[page-cancel-e2e] beginPageWork reserves only for Page lane", () => {
  const store = createPageReservationStore({ now: () => 42 });
  const companion = beginPageWork(store, {
    utterance: "hey how are you",
    sessionId: "s1",
  });
  assert.equal(companion.reserved, false);
  assert.equal(companion.reservation, null);
  assert.equal(companion.lane.lane, LANE.REFLEX);

  const page = beginPageWork(store, {
    utterance: "write the next beat where she leaves",
    sessionId: "s1",
    userId: "u1",
    hints: { maxOutputTokens: 800 },
  });
  assert.equal(page.reserved, true);
  assert.equal(page.lane.lane, LANE.PAGE);
  assert.equal(page.lane.intent, INTENT.PAGE_EDIT);
  assert.equal(page.reservation.maxOutputTokens, 800);
  assert.equal(store.size(), 1);

  const explicit = beginPageWork(store, {
    utterance: "whatever",
    sessionId: "s1",
    hints: { pageMode: true },
  });
  assert.equal(explicit.reserved, true);
  assert.equal(store.size(), 2);
});

test("[page-cancel-e2e] reserve → cancel → proceed rejected (billing short-circuit)", () => {
  const store = createPageReservationStore({ now: () => 100 });
  const { reservation } = beginPageWork(store, {
    utterance: "continue the scene",
    sessionId: "sess-e2e",
    userId: "writer",
  });
  assert.ok(reservation?.id);
  assert.equal(store.proceed(reservation.id).ok, true);

  const dropped = store.cancelByOwner(
    { sessionId: "sess-e2e" },
    { reason: "barge_in" }
  );
  assert.deepEqual(dropped, [reservation.id]);

  const gate = store.proceed(reservation.id);
  assert.equal(gate.ok, false);
  assert.equal(gate.code, "page_reservation_cancelled");
  // Documented stub: callers must skip Muse/wallet debit when !gate.ok
});

test("[page-cancel-e2e] resolveTalkLane wires classifyIntent → laneForIntent", () => {
  const greet = resolveTalkLane("hello");
  assert.equal(greet.intent, INTENT.GREETING);
  assert.equal(greet.lane, LANE.REFLEX);

  const page = resolveTalkLane("rewrite this scene tighter");
  assert.equal(page.intent, INTENT.PAGE_REWRITE);
  assert.equal(page.lane, LANE.PAGE);
  assert.equal(page.walletMeter, "page");
});

test("[page-cancel-e2e] POST /talk/page-cancel cancels by reservation id", async () => {
  const store = createPageReservationStore({ now: () => 200 });
  const r = store.reserve({ sessionId: "s-http", maxOutputTokens: 64 });

  const app = express();
  mountPageCancelRoute(app, { pageReservationStore: store });
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const port = server.address().port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/talk/page-cancel`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reservation_id: r.id, reason: "manual_typing" }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.cancelled, true);
    assert.equal(body.reservation_id, r.id);
    assert.equal(store.proceed(r.id).ok, false);

    const missing = await fetch(`http://127.0.0.1:${port}/talk/page-cancel`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reservation_id: "nope" }),
    });
    assert.equal(missing.status, 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("[page-cancel-e2e] POST /talk/page-cancel cancelByOwner via session_id", async () => {
  const store = createPageReservationStore({ now: () => 300 });
  const a = store.reserve({ sessionId: "barge-sess", userId: "u", maxOutputTokens: 10 });
  const b = store.reserve({ sessionId: "barge-sess", userId: "u", maxOutputTokens: 20 });
  store.reserve({ sessionId: "keep-sess", maxOutputTokens: 5 });

  const app = express();
  mountPageCancelRoute(app, { pageReservationStore: store });
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const port = server.address().port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/talk/page-cancel`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ session_id: "barge-sess", reason: "barge_in" }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.deepEqual(body.dropped.sort(), [a.id, b.id].sort());
    assert.equal(store.proceed(a.id).ok, false);
    assert.equal(store.size(), 3);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("[page-cancel-e2e] talk adapter attaches reservation for pageMode body", async () => {
  const store = createPageReservationStore({ now: () => 400 });
  let seen = null;
  const handleTalkRequest = (req, res) => {
    seen = req.clementine;
    // Simulate billing gate check that talk_handler should do later
    const gate = req.clementine.proceed();
    return res.status(200).json({
      ok: true,
      reservation_id: req.clementine.reservationId,
      proceed_ok: gate.ok,
    });
  };
  const wrapped = createPageLaneTalkAdapter({
    handleTalkRequest,
    pageReservationStore: store,
  });

  const app = express();
  app.use(express.json());
  app.post("/talk", (req, res) => wrapped(req, res));
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const port = server.address().port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/talk`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-session-id": "adapter-sess",
      },
      body: JSON.stringify({
        client_transcript: "continue the scene",
        screenplay_target: "page",
      }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.reservation_id);
    assert.equal(body.proceed_ok, true);
    assert.equal(seen.lane, LANE.PAGE);
    assert.equal(res.headers.get("x-clementine-lane"), "Page");
    assert.equal(res.headers.get("x-clementine-page-reservation"), body.reservation_id);

    // Barge-in then proceed must fail
    store.cancel(body.reservation_id, { reason: "barge_in" });
    assert.equal(store.proceed(body.reservation_id).ok, false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("[page-cancel-e2e] mountTalkPipelineRoutes wires cancel when store provided", async () => {
  const store = createPageReservationStore({ now: () => 500 });
  const r = store.reserve({ sessionId: "pipe-s", maxOutputTokens: 1 });
  const app = express();
  mountTalkPipelineRoutes(app, {
    talkRateLimitGuard: (_req, _res, next) => next(),
    requireClientTokenForTalk: (_req, _res, next) => next(),
    talkIdempotencyGuard: (_req, _res, next) => next(),
    talkSessionSerialGuard: (_req, _res, next) => next(),
    talkConcurrencyGuard: (_req, _res, next) => next(),
    talkUpload: (_req, _res, next) => next(),
    handleTalkRequest: (_req, res) => res.status(200).json({ ok: true }),
    normalizeTalkTurnId: (v) => String(v || "").trim(),
    getTalkTurnMeta: () => null,
    canReadTalkTurnMeta: () => true,
    pageReservationStore: store,
  });
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const port = server.address().port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/talk/page-cancel`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reservation_id: r.id }),
    });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).cancelled, true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
