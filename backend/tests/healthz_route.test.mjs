import test from "node:test";
import assert from "node:assert/strict";
import express from "express";

import { mountHealthzRoute } from "../lib/healthz_route.js";

async function hit(app, path = "/healthz") {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const port = server.address().port;
    const res = await fetch(`http://127.0.0.1:${port}${path}`);
    const body = await res.json();
    return { status: res.status, body };
  } finally {
    server.close();
  }
}

test("[healthz] returns 200 when persistence ping resolves true", async () => {
  const app = express();
  mountHealthzRoute(app, { pingPersistence: async () => true });
  const { status, body } = await hit(app);
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.persistence, "ok");
  assert.equal(typeof body.elapsed_ms, "number");
});

test("[healthz] returns 503 when persistence ping resolves false", async () => {
  const app = express();
  mountHealthzRoute(app, { pingPersistence: async () => false });
  const { status, body } = await hit(app);
  assert.equal(status, 503);
  assert.equal(body.ok, false);
  assert.equal(body.persistence, "fail");
});

test("[healthz] returns 503 when persistence ping throws", async () => {
  const app = express();
  mountHealthzRoute(app, { pingPersistence: async () => { throw new Error("conn refused"); } });
  const { status, body } = await hit(app);
  assert.equal(status, 503);
  assert.equal(body.ok, false);
  assert.equal(body.persistence, "fail");
  assert.match(body.error || "", /conn refused/);
});

test("[healthz] returns 503 when persistence ping exceeds timeout", async () => {
  const app = express();
  mountHealthzRoute(app, {
    pingPersistence: () => new Promise(resolve => setTimeout(() => resolve(true), 200)),
    timeoutMs: 30,
  });
  const { status, body } = await hit(app);
  assert.equal(status, 503);
  assert.equal(body.ok, false);
  assert.match(body.error || "", /timeout/);
});

test("[healthz] default ping resolves true (JSON dev mode)", async () => {
  const app = express();
  mountHealthzRoute(app, {}); // no deps → default ping
  const { status, body } = await hit(app);
  assert.equal(status, 200);
  assert.equal(body.ok, true);
});

test("[healthz] returns 503 immediately while shutdown is draining", async () => {
  const app = express();
  let pingCalls = 0;
  mountHealthzRoute(app, {
    isDraining: () => true,
    pingPersistence: async () => {
      pingCalls += 1;
      return true;
    },
  });
  const { status, body } = await hit(app);
  assert.equal(status, 503);
  assert.equal(body.ok, false);
  assert.equal(body.status, "draining");
  assert.equal(body.persistence, "skipped");
  assert.equal(pingCalls, 0);
});

test("[healthz] requires an Express app", () => {
  assert.throws(() => mountHealthzRoute(null, {}), /requires an Express app/);
});
