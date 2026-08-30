import test from "node:test";
import assert from "node:assert/strict";
import express from "express";

import {
  withIdempotency,
  createIdempotencyCache,
  compositeKey,
  hashBody,
  HEADER_NAME,
  REPLAY_HEADER,
} from "../lib/idempotency_envelope.js";

function makeApp({ handlerSpy } = {}) {
  const app = express();
  app.use(express.json());
  const handler = handlerSpy || ((req, res) => {
    res.json({ ok: true, body: req.body, n: ++handler.count });
  });
  handler.count = 0;
  app.post("/echo", withIdempotency(handler, { resolveUserId: (req) => req.header("x-user-id") || "anon" }));
  return { app, handler };
}

async function hit(server, opts) {
  const port = server.address().port;
  const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
  const res = await fetch(`http://127.0.0.1:${port}/echo`, {
    method: "POST",
    headers,
    body: JSON.stringify(opts.body || {}),
  });
  const text = await res.text();
  return { status: res.status, headers: res.headers, body: text };
}

test("[idempotency] handler runs once across replayed key", async () => {
  const { app, handler } = makeApp();
  const server = app.listen(0);
  try {
    const a = await hit(server, { headers: { [HEADER_NAME]: "abc" }, body: { x: 1 } });
    const b = await hit(server, { headers: { [HEADER_NAME]: "abc" }, body: { x: 1 } });
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    assert.equal(handler.count, 1, "handler should run exactly once");
    assert.equal(b.headers.get(REPLAY_HEADER.toLowerCase()), "1");
    assert.equal(a.body, b.body, "replayed body should match original");
  } finally {
    server.close();
  }
});

test("[idempotency] no key → handler runs every time", async () => {
  const { app, handler } = makeApp();
  const server = app.listen(0);
  try {
    await hit(server, { body: { x: 1 } });
    await hit(server, { body: { x: 1 } });
    assert.equal(handler.count, 2);
  } finally {
    server.close();
  }
});

test("[idempotency] different keys → handler runs for each", async () => {
  const { app, handler } = makeApp();
  const server = app.listen(0);
  try {
    await hit(server, { headers: { [HEADER_NAME]: "k1" }, body: { x: 1 } });
    await hit(server, { headers: { [HEADER_NAME]: "k2" }, body: { x: 1 } });
    assert.equal(handler.count, 2);
  } finally {
    server.close();
  }
});

test("[idempotency] reusing key with different body → 409", async () => {
  const { app } = makeApp();
  const server = app.listen(0);
  try {
    const a = await hit(server, { headers: { [HEADER_NAME]: "abc" }, body: { x: 1 } });
    const b = await hit(server, { headers: { [HEADER_NAME]: "abc" }, body: { x: 2 } });
    assert.equal(a.status, 200);
    assert.equal(b.status, 409);
    assert.match(b.body, /idempotency_key_reused_with_different_body/);
  } finally {
    server.close();
  }
});

test("[idempotency] cache is user-id scoped", async () => {
  const { app, handler } = makeApp();
  const server = app.listen(0);
  try {
    await hit(server, { headers: { [HEADER_NAME]: "abc", "x-user-id": "alice" }, body: { x: 1 } });
    await hit(server, { headers: { [HEADER_NAME]: "abc", "x-user-id": "bob" }, body: { x: 1 } });
    assert.equal(handler.count, 2, "different users with same key must not collide");
  } finally {
    server.close();
  }
});

test("[idempotency] 5xx responses are not cached", async () => {
  const app = express();
  app.use(express.json());
  let n = 0;
  app.post("/fail", withIdempotency((req, res) => {
    n++;
    res.status(503).json({ error: "down" });
  }, { resolveUserId: () => "x" }));
  const server = app.listen(0);
  try {
    const port = server.address().port;
    await fetch(`http://127.0.0.1:${port}/fail`, {
      method: "POST",
      headers: { "Content-Type": "application/json", [HEADER_NAME]: "abc" },
      body: "{}",
    });
    await fetch(`http://127.0.0.1:${port}/fail`, {
      method: "POST",
      headers: { "Content-Type": "application/json", [HEADER_NAME]: "abc" },
      body: "{}",
    });
    assert.equal(n, 2, "5xx must allow retry");
  } finally {
    server.close();
  }
});

test("[idempotency] 4xx (non-409) responses ARE cached", async () => {
  const app = express();
  app.use(express.json());
  let n = 0;
  app.post("/bad", withIdempotency((req, res) => {
    n++;
    res.status(400).json({ error: "bad_input" });
  }, { resolveUserId: () => "x" }));
  const server = app.listen(0);
  try {
    const port = server.address().port;
    await fetch(`http://127.0.0.1:${port}/bad`, {
      method: "POST",
      headers: { "Content-Type": "application/json", [HEADER_NAME]: "abc" },
      body: "{}",
    });
    await fetch(`http://127.0.0.1:${port}/bad`, {
      method: "POST",
      headers: { "Content-Type": "application/json", [HEADER_NAME]: "abc" },
      body: "{}",
    });
    assert.equal(n, 1, "4xx must be cached to prevent re-executing bad input");
  } finally {
    server.close();
  }
});

test("[idempotency] expired key re-executes handler", async () => {
  const cache = createIdempotencyCache({ ttlMs: 50, maxEntries: 10 });
  const app = express();
  app.use(express.json());
  let n = 0;
  app.post("/ttl", withIdempotency((req, res) => {
    n++;
    res.json({ n });
  }, { cache, resolveUserId: () => "x" }));
  const server = app.listen(0);
  try {
    const port = server.address().port;
    await fetch(`http://127.0.0.1:${port}/ttl`, {
      method: "POST",
      headers: { "Content-Type": "application/json", [HEADER_NAME]: "abc" },
      body: "{}",
    });
    await new Promise((r) => setTimeout(r, 80));
    await fetch(`http://127.0.0.1:${port}/ttl`, {
      method: "POST",
      headers: { "Content-Type": "application/json", [HEADER_NAME]: "abc" },
      body: "{}",
    });
    assert.equal(n, 2);
  } finally {
    server.close();
  }
});

test("[idempotency] cache enforces maxEntries", () => {
  const cache = createIdempotencyCache({ ttlMs: 10000, maxEntries: 2 });
  cache.store("a", { bodyHash: "h", status: 200, body: "1" });
  cache.store("b", { bodyHash: "h", status: 200, body: "2" });
  cache.store("c", { bodyHash: "h", status: 200, body: "3" });
  assert.equal(cache.size, 2);
});

test("[idempotency] helpers are pure", () => {
  assert.equal(
    compositeKey({ userId: "u", routePath: "/r", idempotencyKey: "k" }),
    "u/rk"
  );
  assert.equal(hashBody(Buffer.from("x")), hashBody(Buffer.from("x")));
  assert.notEqual(hashBody(Buffer.from("x")), hashBody(Buffer.from("y")));
});
