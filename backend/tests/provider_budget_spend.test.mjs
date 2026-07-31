// T-provider-spend-cap — durable per-user dollar accounting on the upgraded
// provider_budget guard (one module, no parallel system). Covers estimation,
// durability across restart, idempotent charging, cap-exhaustion 429, and
// fail-CLOSED 503 on meter failure.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createProviderBudgetGuard,
  estimateTurnCostUsd,
  DEFAULT_PRICES,
} from "../lib/provider_budget.js";

function fakePersistence() {
  const rows = new Map();
  return {
    rows,
    async get({ domain, key }) {
      const k = `${domain}:${key}`;
      return rows.has(k) ? JSON.parse(JSON.stringify(rows.get(k))) : null;
    },
    async put({ domain, key, value }) {
      rows.set(`${domain}:${key}`, JSON.parse(JSON.stringify(value)));
    },
  };
}

// Persistence whose reads fail — to exercise fail-closed.
function brokenPersistence() {
  return {
    async get() { throw new Error("db down"); },
    async put() { throw new Error("db down"); },
  };
}

function mockReq(userId = "u1") {
  return { authUser: { id: userId }, header: () => "" };
}
function mockRes() {
  const out = { statusCode: 0, body: null, headers: {} };
  return {
    out,
    setHeader(k, v) { out.headers[k.toLowerCase()] = v; },
    status(code) { out.statusCode = code; return { json: (b) => { out.body = b; } }; },
  };
}

const FIXED_NOW = Date.UTC(2026, 6, 31, 12, 0, 0);
const guard = (over = {}) => createProviderBudgetGuard({
  now: () => FIXED_NOW,
  isProduction: () => true,
  resolveIdentity: (req) => `user:${req.authUser.id}`,
  persistence: fakePersistence(),
  dailyUsdCap: 1.0,
  ...over,
});

test("[spend] estimate is positive and grows with usage", () => {
  const small = estimateTurnCostUsd({ transcriptChars: 40, replyChars: 80, audioDurationMs: 3000 });
  const big = estimateTurnCostUsd({ transcriptChars: 4000, replyChars: 8000, audioDurationMs: 30000 });
  assert.ok(small > 0 && big > small);
});

test("[spend] disabled when no cap: gate is a pass-through", async () => {
  const g = createProviderBudgetGuard({ persistence: fakePersistence(), dailyUsdCap: 0, resolveIdentity: (r) => `user:${r.authUser.id}` });
  assert.equal(g.spendEnabled, false);
  let nexted = false;
  await g.spendMiddleware()(mockReq(), mockRes(), () => { nexted = true; });
  assert.equal(nexted, true);
});

test("[spend] accumulates durably and survives a simulated restart", async () => {
  const store = fakePersistence();
  const cfg = { now: () => FIXED_NOW, resolveIdentity: (r) => `user:${r.authUser.id}`, persistence: store, dailyUsdCap: 100 };
  const g1 = createProviderBudgetGuard(cfg);
  await g1.recordSpend("user:u1", { transcriptChars: 500, replyChars: 1000, audioDurationMs: 8000 }, { turnId: "t1" });
  const total1 = await g1.readSpendUsd("user:u1");
  assert.ok(total1 > 0);
  // "restart": new guard over same store.
  const g2 = createProviderBudgetGuard(cfg);
  assert.equal(await g2.readSpendUsd("user:u1"), total1, "spend was durable");
});

test("[spend] idempotent per turnId: replaying a turn does not double-charge", async () => {
  const g = guard({ dailyUsdCap: 100 });
  const turn = { transcriptChars: 200, replyChars: 400, audioDurationMs: 5000 };
  await g.recordSpend("user:u1", turn, { turnId: "same" });
  const after1 = await g.readSpendUsd("user:u1");
  const dup = await g.recordSpend("user:u1", turn, { turnId: "same" });
  assert.equal(dup, -1, "second charge of same turnId is a no-op");
  assert.equal(await g.readSpendUsd("user:u1"), after1, "total unchanged on replay");
});

test("[spend] cap exhaustion returns 429", async () => {
  const store = fakePersistence();
  const g = createProviderBudgetGuard({
    now: () => FIXED_NOW, isProduction: () => true,
    resolveIdentity: (r) => `user:${r.authUser.id}`, persistence: store, dailyUsdCap: 0.001,
  });
  await g.recordSpend("user:u1", { transcriptChars: 1000, replyChars: 2000, audioDurationMs: 9000 }, { turnId: "t" });
  const res = mockRes();
  let nexted = false;
  await g.spendMiddleware()(mockReq(), res, () => { nexted = true; });
  assert.equal(nexted, false);
  assert.equal(res.out.statusCode, 429);
  assert.equal(res.out.body.error, "provider_spend_exceeded");
});

test("[spend] FAIL CLOSED: meter read failure in production returns 503", async () => {
  const g = createProviderBudgetGuard({
    isProduction: () => true, resolveIdentity: (r) => `user:${r.authUser.id}`,
    persistence: brokenPersistence(), dailyUsdCap: 1.0, logger: { error() {} },
  });
  const res = mockRes();
  let nexted = false;
  await g.spendMiddleware()(mockReq(), res, () => { nexted = true; });
  assert.equal(nexted, false, "must not serve when the meter is down");
  assert.equal(res.out.statusCode, 503);
  assert.equal(res.out.body.error, "provider_spend_unavailable");
});

test("[spend] dev fail-open ONLY with explicit setting", async () => {
  const base = { isProduction: () => false, resolveIdentity: (r) => `user:${r.authUser.id}`, persistence: brokenPersistence(), dailyUsdCap: 1.0, logger: { error() {} } };
  // default: still fail closed even in dev
  const closed = createProviderBudgetGuard(base);
  const r1 = mockRes(); let n1 = false;
  await closed.spendMiddleware()(mockReq(), r1, () => { n1 = true; });
  assert.equal(r1.out.statusCode, 503, "dev without explicit failOpen still fails closed");
  // explicit failOpen: serves through
  const open = createProviderBudgetGuard({ ...base, failOpen: true });
  const r2 = mockRes(); let n2 = false;
  await open.spendMiddleware()(mockReq(), r2, () => { n2 = true; });
  assert.equal(n2, true, "explicit dev failOpen serves through");
});

test("[spend] checkEligibility is read-only (does not charge)", async () => {
  const g = guard({ dailyUsdCap: 100 });
  const before = await g.readSpendUsd("user:u1");
  const elig = await g.checkEligibility(mockReq());
  assert.equal(elig.allowed, true);
  assert.equal(await g.readSpendUsd("user:u1"), before, "eligibility check did not charge");
});
