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

test("[provider-budget] counter rolls over at UTC midnight", () => {
  let clock = Date.UTC(2026, 4, 23, 23, 59);
  const guard = createProviderBudgetGuard({
    dailyLimit: 1,
    now: () => clock,
    isProduction: () => true,
  });
  const mw = guard.middleware("talk");
  assert.equal(run(mw, makeReq("alice")).nextCalled, true);
  assert.equal(run(mw, makeReq("alice")).res.statusCode, 429);
  clock = Date.UTC(2026, 4, 24, 0, 1);
  assert.equal(run(mw, makeReq("alice")).nextCalled, true);
});

test("[provider-budget] capped response is support-safe and does not call downstream", () => {
  const guard = createProviderBudgetGuard({
    dailyLimit: 1,
    now: () => Date.UTC(2026, 4, 23, 12),
    isProduction: () => true,
  });
  const mw = guard.middleware("talk");
  const req = makeReq("SECRET_USER_ID", {});
  req.body = { transcript: "SECRET_TRANSCRIPT_CONTENT" };

  assert.equal(run(mw, req).nextCalled, true);
  const denied = run(mw, req);
  assert.equal(denied.nextCalled, false);
  assert.equal(denied.res.statusCode, 429);
  assert.equal(denied.res.headers["retry-after"], "86400");
  const serialized = JSON.stringify(denied.res.body);
  assert.ok(!serialized.includes("SECRET_USER_ID"));
  assert.ok(!serialized.includes("SECRET_TRANSCRIPT_CONTENT"));
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

test("[provider-budget] global daily limit stops every identity once the organisation total is reached", () => {
  const warned = [];
  const guard = createProviderBudgetGuard({
    dailyLimit: 100,
    globalDailyLimit: 3,
    now: () => Date.UTC(2026, 8, 23, 7),
    isProduction: () => true,
    logger: { warn: (m) => warned.push(m) },
  });
  const talk = guard.middleware("talk");
  const render = guard.middleware("realtime_render");
  assert.equal(run(talk, makeReq("user-a")).nextCalled, true);
  assert.equal(run(talk, makeReq("user-b")).nextCalled, true);
  assert.equal(run(render, makeReq("user-c")).nextCalled, true);
  // Fourth request of the day, a fresh identity, is refused with the global scope.
  const { res, nextCalled } = run(talk, makeReq("user-d"));
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 429);
  assert.equal(res.body.error, "provider_budget_exceeded");
  assert.equal(res.body.scope, "global");
  assert.equal(res.body.daily_limit, 3);
  assert.equal(res.headers["retry-after"], "86400");
  assert.equal(warned.length, 1, "warns once per day, not per refused request");
  run(talk, makeReq("user-e"));
  assert.equal(warned.length, 1);
  assert.deepEqual(guard.snapshot(), {
    utc_day: "2026-09-23",
    global_used: 3,
    global_daily_limit: 3,
    identity_daily_limit: 100,
    by_route_class: { talk: 2, realtime_render: 1 },
  });
});

test("[provider-budget] the global counter rolls over at UTC midnight and is off by default", () => {
  let clock = Date.UTC(2026, 8, 23, 23, 59);
  const guard = createProviderBudgetGuard({ dailyLimit: 100, globalDailyLimit: 1, now: () => clock, isProduction: () => true, logger: { warn() {} } });
  const mw = guard.middleware("talk");
  assert.equal(run(mw, makeReq("a")).nextCalled, true);
  assert.equal(run(mw, makeReq("b")).nextCalled, false);
  clock = Date.UTC(2026, 8, 24, 0, 1);
  assert.equal(run(mw, makeReq("b")).nextCalled, true);
  assert.equal(guard.snapshot().utc_day, "2026-09-24");
  assert.equal(guard.snapshot().global_used, 1);

  const off = createProviderBudgetGuard({ dailyLimit: 100, now: () => clock, isProduction: () => true });
  assert.equal(off.globalDailyLimit, 0);
  const offMw = off.middleware("talk");
  for (let i = 0; i < 50; i += 1) assert.equal(run(offMw, makeReq(`u${i}`)).nextCalled, true);
  assert.equal(off.snapshot().global_used, 50);
  // The per-identity envelope now names its scope too.
  const tight = createProviderBudgetGuard({ dailyLimit: 1, now: () => clock, isProduction: () => true });
  const tightMw = tight.middleware("talk");
  run(tightMw, makeReq("solo"));
  assert.equal(run(tightMw, makeReq("solo")).res.body.scope, "identity");
});

test("[provider-budget] the global limit is read from the environment when not injected", () => {
  const prev = process.env.PROVIDER_GLOBAL_DAILY_BUDGET_LIMIT;
  process.env.PROVIDER_GLOBAL_DAILY_BUDGET_LIMIT = "7";
  try {
    assert.equal(createProviderBudgetGuard({ isProduction: () => true }).globalDailyLimit, 7);
    process.env.PROVIDER_GLOBAL_DAILY_BUDGET_LIMIT = "nonsense";
    assert.equal(createProviderBudgetGuard({ isProduction: () => true }).globalDailyLimit, 0);
  } finally {
    if (prev === undefined) delete process.env.PROVIDER_GLOBAL_DAILY_BUDGET_LIMIT;
    else process.env.PROVIDER_GLOBAL_DAILY_BUDGET_LIMIT = prev;
  }
});
