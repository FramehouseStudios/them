import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import { mountPageCancelRoute } from "../lib/talk_pipeline.js";
import { createPageReservationStore } from "../lib/clementine/page_cancel.js";
import { createWalletStore } from "../lib/clementine/wallet.js";

// Route-level trust-boundary fixture, not production JWT verification.
async function fixture(run) {
  const wallet = createWalletStore({ initialBalances: { alice: { page: 5 }, bob: { page: 5 } } });
  const pages = createPageReservationStore({ walletStore: wallet });
  const reserve = (userId, sessionId = "shared-session") => {
    const held = userId ? wallet.reserve({ ownerId: userId, lane: "page", maxOutputTokens: 400 }) : null;
    return pages.reserve({ sessionId, userId, maxOutputTokens: 400,
      meta: held ? { walletReservationId: held.reservationId } : null });
  };
  const alice = reserve("alice");
  const bob = reserve("bob");
  const legacy = reserve("");
  const app = express();
  app.use((req, _res, next) => {
    // Only this middleware, never request body/owner headers, writes identity.
    const actor = req.get("Authorization");
    if (actor === "Bearer fixture-alice") req.authUser = { id: "alice" };
    if (actor === "Bearer fixture-bob") req.authUser = { id: "bob" };
    next();
  });
  mountPageCancelRoute(app, { pageReservationStore: pages });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const cancel = async (actor, body) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/talk/page-cancel`, {
      method: "POST", headers: { "Content-Type": "application/json",
        "x-user-id": "alice", "x-session-id": "shared-session",
        ...(actor ? { Authorization: `Bearer fixture-${actor}` } : {}) },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json(), headers: response.headers };
  };
  try { await run({ pages, wallet, alice, bob, legacy, cancel }); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

test("other account cannot cancel a reservation or release its wallet hold", () => fixture(async ({ pages, wallet, alice, legacy, cancel }) => {
  const result = await cancel("bob", { reservation_id: alice.id, user_id: "alice" });
  assert.equal(result.status, 404);
  assert.equal(result.body.error, "reservation_not_found");
  assert.equal(pages.getAbortSignal(alice.id).aborted, false);
  assert.equal(wallet.getBalance("alice").pageTurnsLeft, 4);
  assert.equal((await cancel("bob", { reservation_id: legacy.id })).status, 404);
  assert.equal(pages.getAbortSignal(legacy.id).aborted, false);
}));

test("session cancellation is scoped to the authenticated owner, not body aliases", () => fixture(async ({ pages, wallet, alice, bob, legacy, cancel }) => {
  const result = await cancel("bob", { session_id: "shared-session", user_id: "alice", userId: "alice" });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.dropped, [bob.id]);
  assert.equal(pages.getAbortSignal(alice.id).aborted, false);
  assert.equal(pages.getAbortSignal(legacy.id).aborted, false);
  assert.equal(pages.getAbortSignal(bob.id).aborted, true);
  assert.equal(wallet.getBalance("alice").pageTurnsLeft, 4);
  assert.equal(wallet.getBalance("bob").pageTurnsLeft, 5);
}));

test("anonymous ownership spoofing cannot cancel by ID or session", () => fixture(async ({ pages, alice, cancel }) => {
  for (const body of [{ reservation_id: alice.id }, { session_id: "shared-session", user_id: "alice" }]) {
    const result = await cancel(null, body);
    assert.equal(result.status, 401);
    assert.equal(result.body.error, "user_auth_required");
    assert.equal(result.headers.get("cache-control"), "no-store");
    assert.equal(pages.getAbortSignal(alice.id).aborted, false);
  }
}));

test("owner ID cancellation still aborts, releases once, and is idempotent", () => fixture(async ({ pages, wallet, alice, cancel }) => {
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await cancel("alice", { reservation_id: alice.id, user_id: "bob" });
    assert.equal(result.status, 200);
    assert.equal(pages.getAbortSignal(alice.id).aborted, true);
    assert.equal(wallet.getBalance("alice").pageTurnsLeft, 5);
  }
}));
