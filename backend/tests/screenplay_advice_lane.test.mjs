import test from "node:test";
import assert from "node:assert/strict";
import { beginPageWork } from "../lib/clementine/page_lane_adapter.js";
import { createPageReservationStore } from "../lib/clementine/page_cancel.js";
import { createWalletStore } from "../lib/clementine/wallet.js";
import { resolveScreenplayTargetFromRequest } from "../lib/screenplay_turn_target.js";

for (const utterance of [
  "How do I write a screenplay?",
  "What is a screenplay?",
  "Explain the purpose of a slugline.",
  "Write an outline for a 120-page screenplay.",
  "Do not write the scene yet. Help me plan.",
  "Please don't rewrite the scene yet; explain the structure.",
  "Clementine, please don’t rewrite the scene yet.",
  "Could you explain how to write the next three pages?",
  "Help me plan how to write a scene.",
]) {
  test(`[advice-lane] no Page hold for advice/planning: ${utterance}`, () => {
    const wallet = createWalletStore({ initialBalances: { writer: { companion: 5, page: 5 } } });
    const pages = createPageReservationStore();
    const work = beginPageWork(pages, { utterance, userId: "writer", sessionId: "session",
      walletStore: wallet, hints: { maxOutputTokens: 400 } });
    assert.equal(resolveScreenplayTargetFromRequest({ transcript: utterance }), "");
    assert.equal(work.reserved, false, "Advice is not a Page-generation reservation");
    assert.notEqual(work.lane.walletMeter, "page");
    assert.equal(work.walletReservation, null);
    assert.equal(pages.size(), 0);
    assert.equal(wallet.getBalance("writer").pageTurnsLeft, 5);
  });
}

test("[advice-lane] an empty Page balance must not reject a non-Page request", () => {
  const wallet = createWalletStore({ initialBalances: { writer: { companion: 5, page: 0 } } });
  assert.doesNotThrow(() => beginPageWork(createPageReservationStore(), {
    utterance: "How do I write a screenplay?", userId: "writer", sessionId: "session",
    walletStore: wallet, hints: { maxOutputTokens: 400 },
  }));
  assert.equal(wallet.getBalance("writer").pageTurnsLeft, 0);
});

test("[advice-lane] real Page writing still reserves and enforces its balance", () => {
  const wallet = createWalletStore({ initialBalances: { writer: { companion: 5, page: 1 } } });
  const pages = createPageReservationStore();
  const work = beginPageWork(pages, { utterance: 'Write the scene: JOHN says "Do not write the letter."',
    userId: "writer", sessionId: "session", walletStore: wallet, hints: { maxOutputTokens: 400 } });
  assert.equal(work.reserved, true);
  assert.equal(work.lane.walletMeter, "page");
  assert.equal(wallet.getBalance("writer").pageTurnsLeft, 0);
  assert.throws(() => beginPageWork(pages, { utterance: "Write the next scene.",
    userId: "writer", sessionId: "session", walletStore: wallet, hints: { maxOutputTokens: 400 } }),
    error => error.code === "wallet_empty");
  wallet.release(work.walletReservation.reservationId);
  assert.equal(wallet.getBalance("writer").pageTurnsLeft, 1);
});

test("[advice-lane] explicit Page controls retain their existing cost contract", () => {
  for (const explicit of [{ pageMode: true }, { continuePage: true }, { intent: "page_rewrite" }]) {
    const wallet = createWalletStore({ initialBalances: { writer: { companion: 5, page: 1 } } });
    const work = beginPageWork(createPageReservationStore(), { utterance: "How do I write a screenplay?",
      userId: "writer", sessionId: "session", walletStore: wallet,
      hints: { ...explicit, maxOutputTokens: 400 } });
    assert.equal(work.reserved, true);
    assert.equal(wallet.getBalance("writer").pageTurnsLeft, 0);
    wallet.release(work.walletReservation.reservationId);
  }
});
