import test from "node:test";
import assert from "node:assert/strict";
import express from "express";

import {
  TOKENS_PER_TURN,
  WALLET_LANE,
  WALLET_EMPTY_CODE,
  tokensToMilliturns,
  milliturnsToTurns,
  createWalletStore,
  createPageReservationStore,
  beginPageWork,
} from "../lib/clementine/index.js";
import {
  mountPageCancelRoute,
  mountTalkWalletRoute,
} from "../lib/talk_pipeline.js";

test("[wallet] tokens→turns formula is published and stable", () => {
  assert.equal(TOKENS_PER_TURN, 400);
  assert.equal(tokensToMilliturns(400), 1000);
  assert.equal(milliturnsToTurns(1000), 1);
  assert.equal(tokensToMilliturns(200), 500);
  assert.equal(tokensToMilliturns(1), 3); // ceil(1/400*1000) = 3
});

test("[wallet] reserve → commit refunds unused; balance has no TPM fields", () => {
  const wallet = createWalletStore({
    now: () => 1_700_000_000_000,
    initialBalances: { writer: { companion: 10, page: 5 } },
  });
  const before = wallet.getBalance("writer");
  assert.equal(before.companionTurnsLeft, 10);
  assert.equal(before.pageTurnsLeft, 5);
  assert.equal(before.approxConversationsLeft, 0); // floor(10/20)
  assert.equal(before.lowBalance, false);
  for (const k of Object.keys(before)) {
    assert.ok(
      !/tpm|tokensPerMinute|token_rate|rpm/i.test(k),
      `TPM-ish field leaked: ${k}`
    );
  }

  const r = wallet.reserve({
    ownerId: "writer",
    lane: WALLET_LANE.PAGE,
    maxOutputTokens: 800, // 2 turns
  });
  assert.ok(r.reservationId);
  assert.equal(r.reservedTurns, 2);
  assert.equal(wallet.getBalance("writer").pageTurnsLeft, 3);

  const committed = wallet.commit(r.reservationId, 400); // 1 turn actual
  assert.equal(committed.ok, true);
  assert.equal(committed.settledTurns, 1);
  assert.equal(committed.refundedTurns, 1);
  assert.equal(wallet.getBalance("writer").pageTurnsLeft, 4);
});

test("[wallet] release restores full hold (cancel path)", () => {
  const wallet = createWalletStore({
    initialBalances: { u: { companion: 3, page: 2 } },
  });
  const r = wallet.reserve({
    ownerId: "u",
    lane: "companion",
    maxOutputTokens: 400,
  });
  assert.equal(wallet.getBalance("u").companionTurnsLeft, 2);
  const rel = wallet.release(r.reservationId);
  assert.equal(rel.ok, true);
  assert.equal(rel.released, true);
  assert.equal(wallet.getBalance("u").companionTurnsLeft, 3);
  // idempotent
  assert.equal(wallet.release(r.reservationId).released, false);
});

test("[wallet] hard stop wallet_empty when insufficient", () => {
  const wallet = createWalletStore({
    initialBalances: { broke: { companion: 0.1, page: 0 } },
  });
  assert.throws(
    () =>
      wallet.reserve({
        ownerId: "broke",
        lane: "page",
        maxOutputTokens: 400,
      }),
    (err) => err && err.code === WALLET_EMPTY_CODE
  );
  // Companion thin balance still blocks a full turn
  assert.throws(
    () =>
      wallet.reserve({
        ownerId: "broke",
        lane: "companion",
        maxOutputTokens: 400,
      }),
    (err) => err && err.code === WALLET_EMPTY_CODE
  );
});

test("[wallet] Page cancel releases linked wallet reservation", () => {
  const wallet = createWalletStore({
    now: () => 42,
    initialBalances: { author: { companion: 50, page: 10 } },
  });
  const pages = createPageReservationStore({ now: () => 42, walletStore: wallet });

  const wr = wallet.reserve({
    ownerId: "author",
    lane: "page",
    maxOutputTokens: 800,
  });
  assert.equal(wallet.getBalance("author").pageTurnsLeft, 8);

  const pr = pages.reserve({
    sessionId: "sess-w",
    userId: "author",
    maxOutputTokens: 800,
    meta: { walletReservationId: wr.reservationId },
  });
  wallet.linkPageReservation(wr.reservationId, pr.id);

  const cancelled = pages.cancel(pr.id, { reason: "barge_in" });
  assert.equal(cancelled.cancelled, true);
  assert.equal(wallet.getReservation(wr.reservationId).status, "released");
  assert.equal(wallet.getBalance("author").pageTurnsLeft, 10);
});

test("[wallet] beginPageWork reserves wallet when store provided", () => {
  const wallet = createWalletStore({
    initialBalances: { u1: { page: 5, companion: 1 } },
  });
  const pages = createPageReservationStore({ walletStore: wallet });
  const started = beginPageWork(pages, {
    utterance: "continue the scene",
    sessionId: "s1",
    userId: "u1",
    hints: { maxOutputTokens: 400 },
    walletStore: wallet,
  });
  assert.equal(started.reserved, true);
  assert.ok(started.walletReservation?.reservationId);
  assert.equal(
    started.reservation.meta.walletReservationId,
    started.walletReservation.reservationId
  );
  assert.equal(wallet.getBalance("u1").pageTurnsLeft, 4);

  pages.cancel(started.reservation.id, { reason: "manual_typing" });
  assert.equal(wallet.getBalance("u1").pageTurnsLeft, 5);
});

test("[wallet] POST /talk/wallet returns calm balance only", async () => {
  const wallet = createWalletStore({
    initialBalances: { alice: { companion: 40, page: 12 } },
  });
  const app = express();
  mountTalkWalletRoute(app, { walletStore: wallet });
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const port = server.address().port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/talk/wallet`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ owner_id: "alice" }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.companionTurnsLeft, 40);
    assert.equal(body.pageTurnsLeft, 12);
    assert.equal(body.approxConversationsLeft, 2);
    assert.equal(body.lowBalance, false);
    const serialized = JSON.stringify(body);
    assert.ok(!/tpm/i.test(serialized));
    assert.ok(!/tokensPerMinute/i.test(serialized));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("[wallet] lowBalance at ≤10% of granted pack", () => {
  const wallet = createWalletStore({
    initialBalances: { n: { companion: 100, page: 100 } },
  });
  // Burn companion down to 10 turns (10%)
  for (let i = 0; i < 90; i++) {
    const r = wallet.reserve({
      ownerId: "n",
      lane: "companion",
      estimatedTurns: 1,
    });
    wallet.commit(r.reservationId, 400);
  }
  const bal = wallet.getBalance("n");
  assert.equal(bal.companionTurnsLeft, 10);
  assert.equal(bal.lowBalance, true);
});

// Re-export sanity: index exports mount helpers used above via talk_pipeline.
// page_cancel mount still works with wallet-linked cancel over HTTP.
test("[wallet] POST /talk/page-cancel releases wallet funds", async () => {
  const wallet = createWalletStore({
    initialBalances: { http: { page: 3, companion: 0 } },
  });
  const pages = createPageReservationStore({ walletStore: wallet, now: () => 9 });
  const wr = wallet.reserve({ ownerId: "http", lane: "page", maxOutputTokens: 400 });
  const pr = pages.reserve({
    sessionId: "http-s",
    userId: "http",
    maxOutputTokens: 400,
    meta: { walletReservationId: wr.reservationId },
  });

  const app = express();
  mountPageCancelRoute(app, { pageReservationStore: pages });
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const port = server.address().port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/talk/page-cancel`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reservation_id: pr.id, reason: "barge_in" }),
    });
    assert.equal(res.status, 200);
    assert.equal(wallet.getBalance("http").pageTurnsLeft, 3);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
