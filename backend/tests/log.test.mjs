import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { Writable } from "node:stream";

import {
  createLogger,
  createRequestIdMiddleware,
  serializeError,
} from "../lib/log.js";

function captureOut() {
  const lines = [];
  const out = new Writable({
    write(chunk, enc, cb) {
      lines.push(String(chunk).replace(/\n$/, ""));
      cb();
    },
  });
  return { out, lines };
}

test("[log] info emits JSON line when format=json", () => {
  const { out, lines } = captureOut();
  const log = createLogger({ format: "json", out, now: () => "FIXED-TS" });
  log.info("hello", { user: "alice" });
  assert.equal(lines.length, 1);
  const parsed = JSON.parse(lines[0]);
  assert.deepEqual(parsed, { ts: "FIXED-TS", level: "info", msg: "hello", user: "alice" });
});

test("[log] pretty format produces single-line non-JSON output", () => {
  const { out, lines } = captureOut();
  const log = createLogger({ format: "pretty", out });
  log.info("hello", { k: 1 });
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^\[info\] hello /);
  assert.doesNotMatch(lines[0], /^\{/);
});

test("[log] level filter suppresses lower-level lines", () => {
  const { out, lines } = captureOut();
  const log = createLogger({ format: "json", level: "warn", out });
  log.debug("d");
  log.info("i");
  log.warn("w");
  log.error("e", new Error("boom"));
  assert.equal(lines.length, 2, "only warn + error should pass");
});

test("[log] error serializes Error instances", () => {
  const { out, lines } = captureOut();
  const log = createLogger({ format: "json", out, now: () => "T" });
  log.error("crash", new Error("oh no"), { route: "/x" });
  const parsed = JSON.parse(lines[0]);
  assert.equal(parsed.level, "error");
  assert.equal(parsed.msg, "crash");
  assert.equal(parsed.route, "/x");
  assert.equal(parsed.err.name, "Error");
  assert.equal(parsed.err.message, "oh no");
  assert.match(String(parsed.err.stack || ""), /at /);
});

test("[log] error with non-Error value serializes to string", () => {
  const { out, lines } = captureOut();
  const log = createLogger({ format: "json", out, now: () => "T" });
  log.error("crash", "literal string error");
  const parsed = JSON.parse(lines[0]);
  assert.equal(parsed.err.value, "literal string error");
});

test("[log] child logger merges bound fields into every record", () => {
  const { out, lines } = captureOut();
  const log = createLogger({ format: "json", out, now: () => "T" });
  const child = log.child({ req_id: "abc" });
  child.info("hello", { k: 1 });
  const parsed = JSON.parse(lines[0]);
  assert.equal(parsed.req_id, "abc");
  assert.equal(parsed.k, 1);
});

test("[log] child of child merges all bindings", () => {
  const { out, lines } = captureOut();
  const log = createLogger({ format: "json", out, now: () => "T" });
  const c1 = log.child({ req_id: "abc" });
  const c2 = c1.child({ user_id: "alice" });
  c2.info("hello");
  const parsed = JSON.parse(lines[0]);
  assert.equal(parsed.req_id, "abc");
  assert.equal(parsed.user_id, "alice");
});

test("[log] serializeError handles null/undefined", () => {
  assert.equal(serializeError(null), null);
  assert.equal(serializeError(undefined), null);
});

test("[requestIdMiddleware] mints a UUID when no header supplied", async () => {
  const app = express();
  const { out, lines } = captureOut();
  const logger = createLogger({ format: "json", out, now: () => "T" });
  app.use(createRequestIdMiddleware({ logger }));
  app.get("/r", (req, res) => {
    req.log.info("served", { path: "/r" });
    res.json({ req_id: req.requestId });
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const port = server.address().port;
    const res = await fetch(`http://127.0.0.1:${port}/r`);
    const body = await res.json();
    assert.match(body.req_id, /^[0-9a-f-]{36}$/);
    assert.equal(res.headers.get("x-request-id"), body.req_id);
    const parsed = JSON.parse(lines[0]);
    assert.equal(parsed.req_id, body.req_id);
  } finally {
    server.close();
  }
});

test("[requestIdMiddleware] honors incoming x-request-id", async () => {
  const app = express();
  app.use(createRequestIdMiddleware());
  app.get("/r", (req, res) => res.json({ req_id: req.requestId }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const port = server.address().port;
    const res = await fetch(`http://127.0.0.1:${port}/r`, {
      headers: { "x-request-id": "explicit-id-xyz" },
    });
    const body = await res.json();
    assert.equal(body.req_id, "explicit-id-xyz");
    assert.equal(res.headers.get("x-request-id"), "explicit-id-xyz");
  } finally {
    server.close();
  }
});
