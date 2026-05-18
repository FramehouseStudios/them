// Day 2: Rate Limits And Spend Guard — pure deterministic unit tests.
//
// No network, injected clock. Proves: route-group classification,
// provider-cost detection, IP normalization, the load-bearing identity
// key (authenticated id else trusted req.ip, NEVER the spoofable
// X-User-Id header), the per-user UTC-day budget counter incl. day
// rollover, and the Express rate-limit (429) + budget (402) verdicts.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  classifyGroup,
  isProviderCostRequest,
  normalizeIp,
  exposureRequestKey,
  createDailyBudgetCounter,
  createExposureGuards,
} from "../lib/exposure_rate_guard.js";

function makeRes() {
  const res = { statusCode: 200, body: null, headers: {}, ended: false };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (o) => { res.body = o; res.ended = true; return res; };
  res.setHeader = (k, v) => { res.headers[String(k).toLowerCase()] = v; return res; };
  return res;
}
function run(mw, req) {
  const res = makeRes();
  let nexts = 0;
  mw(req, res, () => { nexts += 1; });
  return { res, nexts };
}

test("[day2] classifyGroup maps cost/abuse paths and skips public probes", () => {
  assert.equal(classifyGroup("/auth/login"), "auth");
  assert.equal(classifyGroup("/auth"), "auth");
  assert.equal(classifyGroup("/realtime/client_secret"), "realtime");
  assert.equal(classifyGroup("/realtime/call"), "realtime");
  assert.equal(classifyGroup("/realtime/studio_render_stream"), "realtime");
  assert.equal(classifyGroup("/talk"), "talk");
  assert.equal(classifyGroup("/talk/turn/abc"), "talk");
  assert.equal(classifyGroup("/visual/context"), "visual");
  // Public probes + unrelated paths must NOT be guarded.
  assert.equal(classifyGroup("/realtime/health"), null);
  assert.equal(classifyGroup("/realtime/bridge"), null);
  assert.equal(classifyGroup("/health"), null);
  assert.equal(classifyGroup("/state"), null);
  assert.equal(classifyGroup("/authorize"), null); // not /auth boundary
});

test("[day2] isProviderCostRequest: only POST cost paths spend budget", () => {
  assert.equal(isProviderCostRequest("POST", "realtime"), true);
  assert.equal(isProviderCostRequest("POST", "talk"), true);
  assert.equal(isProviderCostRequest("POST", "visual"), true);
  assert.equal(isProviderCostRequest("GET", "talk"), false); // /talk/turn read
  assert.equal(isProviderCostRequest("POST", "auth"), false); // auth never budgeted
  assert.equal(isProviderCostRequest("POST", null), false);
});

test("[day2] normalizeIp collapses loopback / strips port / unwraps v6", () => {
  assert.equal(normalizeIp("127.0.0.1"), "loopback");
  assert.equal(normalizeIp("::1"), "loopback");
  assert.equal(normalizeIp("localhost"), "loopback");
  assert.equal(normalizeIp("203.0.113.7:55321"), "203.0.113.7");
  assert.equal(normalizeIp("::ffff:203.0.113.9"), "203.0.113.9");
  assert.equal(normalizeIp("[2001:db8::1]:443"), "2001:db8::1");
  assert.equal(normalizeIp(""), "unknown");
});

test("[day2] exposureRequestKey uses authoritative id, NEVER X-User-Id", () => {
  // Authenticated -> user-keyed.
  assert.equal(
    exposureRequestKey({ authUser: { id: "real-user-1" }, ip: "203.0.113.1" }),
    "u:real-user-1",
  );
  assert.equal(exposureRequestKey({ userId: "real-user-2" }), "u:real-user-2");
  // Unauthenticated + SPOOFED X-User-Id header -> must fall back to IP,
  // and must NOT honor the header (the core anti-abuse property).
  const spoofed = {
    headers: { "x-user-id": "victim-id", "X-User-Id": "victim-id" },
    ip: "203.0.113.50",
  };
  const key = exposureRequestKey(spoofed);
  assert.equal(key, "ip:203.0.113.50");
  assert.ok(!key.includes("victim-id"), "X-User-Id must never enter the key");
});

test("[day2] daily budget counter increments, rolls over at UTC midnight", () => {
  let nowMs = Date.parse("2026-05-18T10:00:00.000Z");
  const budget = createDailyBudgetCounter({ nowFn: () => nowMs });

  let r = budget.consume("user-a");
  assert.equal(r.used, 1);
  assert.equal(r.tracked, true);
  assert.equal(budget.consume("user-a").used, 2);
  assert.equal(budget.peek("user-a"), 2);
  // Different user is independent.
  assert.equal(budget.consume("user-b").used, 1);
  // Empty/anon id is not tracked (cannot attribute a per-user budget).
  const anon = budget.consume("");
  assert.equal(anon.tracked, false);
  assert.equal(anon.used, 0);

  // Cross into the next UTC day -> counter resets for that user.
  nowMs = Date.parse("2026-05-19T00:00:01.000Z");
  assert.equal(budget.peek("user-a"), 0, "stale day must read as 0");
  assert.equal(budget.consume("user-a").used, 1, "new UTC day starts fresh");

  budget.reset();
  assert.equal(budget.size(), 0);
});

test("[day2] rateLimitMiddleware: 429 with Retry-After after burst, per-group isolation", () => {
  let nowMs = 1_000_000;
  const guards = createExposureGuards({
    nowFn: () => nowMs,
    auth: { capacity: 2, refillPerSec: 0.0001 },
    realtime: { capacity: 2, refillPerSec: 0.0001 },
    talk: { capacity: 2, refillPerSec: 0.0001 },
    visual: { capacity: 2, refillPerSec: 0.0001 },
  });
  const mw = guards.rateLimitMiddleware;

  // Unrelated path falls straight through.
  assert.equal(run(mw, { path: "/state", method: "GET", ip: "203.0.113.2" }).nexts, 1);

  const authReq = { path: "/auth/login", method: "POST", ip: "203.0.113.2" };
  assert.equal(run(mw, authReq).nexts, 1); // 1
  assert.equal(run(mw, authReq).nexts, 1); // 2 (capacity)
  const blocked = run(mw, authReq);        // 3 -> denied
  assert.equal(blocked.nexts, 0);
  assert.equal(blocked.res.statusCode, 429);
  assert.equal(blocked.res.body.code, "rate_limited");
  assert.ok(Number(blocked.res.headers["retry-after"]) >= 1, "Retry-After header set");

  // A DIFFERENT group with the same IP still has its own budget
  // (independent buckets — a flood on /auth must not starve /talk).
  const talkReq = { path: "/talk", method: "POST", ip: "203.0.113.2" };
  assert.equal(run(mw, talkReq).nexts, 1, "talk bucket independent of auth bucket");

  // A different IP on the SAME group is independent too.
  assert.equal(
    run(mw, { path: "/auth/login", method: "POST", ip: "198.51.100.9" }).nexts,
    1,
    "per-IP isolation on the same group",
  );
});

test("[day2] rate limiter cannot be evaded by spoofing X-User-Id", () => {
  let nowMs = 2_000_000;
  const guards = createExposureGuards({
    nowFn: () => nowMs,
    auth: { capacity: 2, refillPerSec: 0.0001 },
  });
  const mw = guards.rateLimitMiddleware;
  // Same IP, attacker rotates a fake X-User-Id each request hoping for
  // a fresh bucket. Key is IP-based (unauth) so the limit still bites.
  const mk = (id) => ({
    path: "/auth/login",
    method: "POST",
    ip: "203.0.113.77",
    headers: { "x-user-id": id },
  });
  assert.equal(run(mw, mk("fake-1")).nexts, 1);
  assert.equal(run(mw, mk("fake-2")).nexts, 1);
  const blocked = run(mw, mk("fake-3"));
  assert.equal(blocked.res.statusCode, 429, "rotating X-User-Id must not reset the IP bucket");
});

test("[day2] budgetMiddleware: 402 over the daily cap, only for authed POST cost paths", () => {
  let nowMs = Date.parse("2026-05-18T12:00:00.000Z");
  const guards = createExposureGuards({
    nowFn: () => nowMs,
    dailyProviderBudget: 2,
  });
  const mw = guards.budgetMiddleware;

  const authed = (over) => ({
    path: "/visual/context",
    method: "POST",
    authUser: { id: "spender-1" },
    ip: "203.0.113.3",
    _n: over,
  });
  assert.equal(run(mw, authed()).nexts, 1); // used 1 <= 2
  assert.equal(run(mw, authed()).nexts, 1); // used 2 <= 2
  const denied = run(mw, authed());          // used 3 > 2 -> 402
  assert.equal(denied.nexts, 0);
  assert.equal(denied.res.statusCode, 402);
  assert.equal(denied.res.body.code, "daily_provider_budget_exhausted");
  assert.equal(denied.res.body.daily_limit, 2);
  assert.ok(/Z$/.test(denied.res.body.reset_at), "reset_at is an ISO timestamp");

  // Unauthenticated provider-cost request: not per-user attributable,
  // so the budget mw passes it through (rate limiter still applies).
  assert.equal(
    run(mw, { path: "/visual/context", method: "POST", ip: "203.0.113.4" }).nexts,
    1,
  );
  // GET (a free read) and auth paths never draw the budget.
  assert.equal(
    run(mw, { path: "/talk/turn/x", method: "GET", authUser: { id: "spender-1" } }).nexts,
    1,
  );
  assert.equal(
    run(mw, { path: "/auth/login", method: "POST", authUser: { id: "spender-1" } }).nexts,
    1,
  );
  // A different authed user has an independent daily budget.
  assert.equal(
    run(mw, { path: "/talk", method: "POST", authUser: { id: "spender-2" } }).nexts,
    1,
    "per-user budget isolation",
  );
});
