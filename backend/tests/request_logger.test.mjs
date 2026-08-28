// T-pii-safe-request-logs — coverage for the structured request logger,
// including regression coverage that PII in the query string (raw AND
// percent-encoded) never reaches the log line.

import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";

import {
  buildRequestLogRecord,
  shouldLogRequest,
  formatRequestLog,
  severityForStatus,
  pathOnly,
  safeRouteTemplate,
  safeRequestId,
  createRequestLoggerMiddleware,
} from "../lib/request_logger.js";
import { requestIdMiddleware, requestLoggerMiddleware } from "../middleware/auth.js";

function mockRes(statusCode, headers = {}) {
  const listeners = {};
  return {
    statusCode,
    getHeader: (n) => headers[n],
    on: (evt, fn) => { listeners[evt] = fn; },
    emit: (evt) => listeners[evt] && listeners[evt](),
  };
}

test("[req-log] PII-safe: query string is never logged", () => {
  const req = {
    method: "GET",
    url: "/screenplay/projects/p1/comments?actor_email=alice@example.com",
    route: { path: "/screenplay/projects/:projectId/comments" },
  };
  assert.equal(pathOnly(req), "/screenplay/projects/p1/comments");
  const record = buildRequestLogRecord(req, mockRes(200), { startedAt: 100, now: 250 });
  assert.equal(record.path, "/screenplay/projects/:projectId/comments");
  assert.ok(!JSON.stringify(record).includes("alice@example.com"), "no email in the log record");
  assert.ok(!JSON.stringify(record).includes("actor_email"), "no query params in the log record");
});

test("[req-log] PII-safe regression: percent-ENCODED PII in query is stripped", () => {
  // ?actor_email=alice%40example.com&token=sk-secret%2Fabc — encoded form must
  // be dropped too. We strip everything after '?', so encoding is irrelevant.
  const req = {
    method: "GET",
    url: "/x?actor_email=alice%40example.com&token=sk-secret%2Fabc&q=%73%65%63%72%65%74",
    route: { path: "/x" },
  };
  const record = buildRequestLogRecord(req, mockRes(200), { startedAt: 0, now: 1 });
  const serialized = JSON.stringify(record) + formatRequestLog(record, "text") + formatRequestLog(record, "json");
  assert.equal(record.path, "/x");
  for (const needle of ["actor_email", "alice", "%40", "sk-secret", "token", "%73%65%63%72%65%74", "secret"]) {
    assert.ok(!serialized.includes(needle), `encoded/plain PII leaked: ${needle}`);
  }
});

test("[req-log] regression: auth headers, tokens, prompts, and screenplay text never appear", () => {
  // A request carrying every sensitive surface at once: Authorization + app
  // token + cookie headers, a body with a system prompt and screenplay content,
  // and query PII. None of it may reach the log line — the logger only reads
  // method/path/status/duration/id, never req.headers or req.body.
  const req = {
    method: "POST",
    url: "/talk?actor_email=jane@example.com&token=sk-live-DEADBEEF",
    path: "/talk",
    route: { path: "/talk" },
    requestId: "0123456789abcdef",
    headers: {
      authorization: "Bearer sk-live-SUPERSECRETTOKEN",
      "x-app-token": "app-token-9f3c",
      cookie: "session=abc123",
    },
    body: {
      prompt: "SYSTEM PROMPT: you are Clementine, a screenwriting companion...",
      screenplay: "INT. DINER - NIGHT\nJANE\nI never told anyone the truth.",
      messages: [{ role: "user", content: "write the confession scene" }],
    },
  };
  const res = mockRes(200, { "Content-Type": "audio/mpeg", "Content-Length": "2048" });
  const record = buildRequestLogRecord(req, res, { startedAt: 1000, now: 1075 });
  const rendered = [
    JSON.stringify(record),
    formatRequestLog(record, "json"),
    formatRequestLog(record, "text"),
  ].join("\n");

  const forbidden = [
    "jane@example.com", "actor_email", "sk-live-DEADBEEF", // query PII + token
    "Bearer", "sk-live-SUPERSECRETTOKEN", "authorization", // authorization header
    "app-token-9f3c", "x-app-token", "session=abc123", "cookie", // other secret headers
    "SYSTEM PROMPT", "Clementine", // prompt
    "INT. DINER", "confession", "I never told anyone", // screenplay content
    "messages", "write the confession scene", // request body
  ];
  for (const needle of forbidden) {
    assert.ok(!rendered.includes(needle), `sensitive value leaked into logs: ${needle}`);
  }

  // ...and the safe, useful fields ARE preserved.
  assert.equal(record.request_id, "0123456789abcdef");
  assert.equal(record.method, "POST");
  assert.equal(record.path, "/talk"); // route path only, no query
  assert.equal(record.status, 200);
  assert.equal(record.latency_ms, 75); // duration
  assert.match(formatRequestLog(record, "text"), /\[0123456789abcdef\] POST \/talk -> 200.*latency=75ms/);
});

test("[req-log] prefers req.path and still strips a defensive query suffix", () => {
  assert.equal(pathOnly({ path: "/talk", url: "/talk?x=1" }), "/talk");
  assert.equal(pathOnly({ path: "/talk?actor_email=alice@example.com" }), "/talk");
});

test("[req-log] emits route templates, never user-controlled path segments", () => {
  const req = {
    path: "/screenplay/projects/alice@example.com/comments",
    route: { path: "/screenplay/projects/:projectId/comments" },
  };
  assert.equal(safeRouteTemplate(req), "/screenplay/projects/:projectId/comments");
  assert.equal(safeRouteTemplate({ path: "/reset/sk-live-secret" }), "<unmatched>");
  assert.equal(safeRouteTemplate({ route: { path: "/unsafe\nforged" } }), "<unmatched>");
});

test("[req-log] only emits generated-hex or canonical UUID request ids", () => {
  assert.equal(safeRequestId("0123456789abcdef"), "0123456789abcdef");
  assert.equal(
    safeRequestId("550e8400-e29b-41d4-a716-446655440000"),
    "550e8400-e29b-41d4-a716-446655440000"
  );
  assert.equal(safeRequestId("alice@example.com"), undefined);
  assert.equal(safeRequestId("Bearer sk-live-secret"), undefined);
});

test("[req-log] severity is classified by status", () => {
  assert.equal(severityForStatus(200), "info");
  assert.equal(severityForStatus(302), "info");
  assert.equal(severityForStatus(404), "warn");
  assert.equal(severityForStatus(500), "error");
  assert.equal(severityForStatus(503), "error");
});

test("[req-log] latency + fields are captured", () => {
  const req = { method: "POST", path: "/talk", route: { path: "/talk" }, requestId: "abcdef0123456789" };
  const res = mockRes(200, { "Content-Type": "audio/mpeg", "Content-Length": "4096" });
  const record = buildRequestLogRecord(req, res, { startedAt: 1000, now: 1123 });
  assert.equal(record.method, "POST");
  assert.equal(record.status, 200);
  assert.equal(record.request_id, "abcdef0123456789");
  assert.equal(record.latency_ms, 123);
  assert.equal(record.bytes, "4096");
  assert.equal(record.type, "audio/mpeg");
});

test("[req-log] json vs text formatting", () => {
  const record = buildRequestLogRecord({ method: "GET", path: "/state", route: { path: "/state" }, requestId: "0123456789abcdef" }, mockRes(200), { startedAt: 0, now: 5 });
  assert.equal(JSON.parse(formatRequestLog(record, "json")).path, "/state");
  assert.match(formatRequestLog(record, "text"), /GET \/state -> 200/);
});

test("[req-log] skips successful health probes but logs health failures", () => {
  const ok = buildRequestLogRecord({ method: "GET", path: "/healthz", route: { path: "/healthz" } }, mockRes(200), {});
  assert.equal(shouldLogRequest(ok, {}), false);
  const bad = buildRequestLogRecord({ method: "GET", path: "/healthz", route: { path: "/healthz" } }, mockRes(503), {});
  assert.equal(shouldLogRequest(bad, {}), true);
});

test("[req-log] LOG_LEVEL gates verbosity", () => {
  const info = buildRequestLogRecord({ method: "GET", path: "/state", route: { path: "/state" } }, mockRes(200), {});
  const warn = buildRequestLogRecord({ method: "GET", path: "/x", route: { path: "/x" } }, mockRes(404), {});
  assert.equal(shouldLogRequest(info, { level: "warn" }), false);
  assert.equal(shouldLogRequest(warn, { level: "warn" }), true);
  assert.equal(shouldLogRequest(info, { level: "info" }), true);
});

test("[req-log] middleware emits one line on finish, routed by severity", () => {
  const lines = { log: [], warn: [], error: [] };
  const sink = { log: (l) => lines.log.push(l), warn: (l) => lines.warn.push(l), error: (l) => lines.error.push(l) };
  let tick = 1000;
  const mw = createRequestLoggerMiddleware({ format: "json", level: "info", now: () => tick, sink });
  const req = { method: "POST", path: "/talk", route: { path: "/talk" }, requestId: "0123456789abcdef" };
  const res = mockRes(500, { "Content-Type": "application/json" });
  let nextCalled = false;
  mw(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  tick = 1200;
  res.emit("finish");
  assert.equal(lines.error.length, 1);
  assert.equal(lines.log.length, 0);
  assert.equal(JSON.parse(lines.error[0]).latency_ms, 200);
});

test("[req-log] Express integration logs the matched template, not concrete PII", async () => {
  const lines = [];
  const originalLog = console.log;
  console.log = (...args) => lines.push(args.join(" "));

  const app = express();
  app.use(requestIdMiddleware);
  app.use(requestLoggerMiddleware);
  app.get("/private/:accountId", (_req, res) => res.status(200).json({ ok: true }));

  const server = await new Promise((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });

  try {
    const address = server.address();
    const response = await fetch(
      `http://127.0.0.1:${address.port}/private/alice%40example.com?token=sk-live-secret`
    );
    assert.equal(response.status, 200);
    await response.text();

    assert.equal(lines.length, 1);
    assert.match(lines[0], /GET \/private\/:accountId -> 200|"path":"\/private\/:accountId"/);
    for (const forbidden of ["alice", "example.com", "token", "sk-live-secret", "%40"]) {
      assert.ok(!lines[0].includes(forbidden), `Express access log leaked: ${forbidden}`);
    }
  } finally {
    console.log = originalLog;
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
