import test from "node:test";
import assert from "node:assert/strict";

import {
  BYPASS_HEADER,
  createProviderBudgetGuard,
  startOfUtcDayMs,
} from "../lib/provider_budget.js";

function makeReq(id = "user-a", headers = {}) {
  return {
    authUser: { id },
    headers,
    header(name) {
      return headers[String(name || "").toLowerCase()];
    },
  };
}

function makeRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function run(middleware, req = makeReq()) {
  const res = makeRes();
  let nextCalled = false;
  middleware(req, res, () => { nextCalled = true; });
  return { res, nextCalled };
}

test("[provider-budget] startOfUtcDayMs normalizes to UTC midnight", () => {
  assert.equal(
    startOfUtcDayMs(Date.UTC(2026, 4, 23, 22, 6, 30)),
    Date.UTC(2026, 4, 23)
  );
});

test("[provider-budget] denies after the daily per-identity limit", () => {
  const guard = createProviderBudgetGuard({
    dailyLimit: 2,
    now: () => Date.UTC(2026, 4, 23, 12),
    isProduction: () => true,
  });
  const mw = guard.middleware("realtime_mint");
  assert.equal(run(mw).nextCalled, true);
  assert.equal(run(mw).nextCalled, true);
  const denied = run(mw);
  assert.equal(denied.nextCalled, false);
  assert.equal(denied.res.statusCode, 429);
  assert.equal(denied.res.body.error, "provider_budget_exceeded");
  assert.equal(denied.res.body.route_class, "realtime_mint");
});

test("[provider-budget] isolates users and route classes", () => {
  const guard = createProviderBudgetGuard({
    dailyLimit: 1,
    now: () => Date.UTC(2026, 4, 23, 12),
    isProduction: () => true,
  });
  assert.equal(run(guard.middleware("talk"), makeReq("alice")).nextCalled, true);
  assert.equal(run(guard.middleware("talk"), makeReq("alice")).res.statusCode, 429);
  assert.equal(run(guard.middleware("talk"), makeReq("bob")).nextCalled, true);
  assert.equal(run(guard.middleware("visual_context"), makeReq("alice")).nextCalled, true);
});

test("[provider-budget] non-production bypass header skips accounting", () => {
  const guard = createProviderBudgetGuard({
    dailyLimit: 1,
    isProduction: () => false,
  });
  const mw = guard.middleware("talk");
  const req = makeReq("alice", { [BYPASS_HEADER]: "1" });
  assert.equal(run(mw, req).nextCalled, true);
  assert.equal(run(mw, req).nextCalled, true);
});
