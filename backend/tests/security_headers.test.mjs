import test from "node:test";
import assert from "node:assert/strict";
import express from "express";

import { applyAppMiddleware } from "../middleware/auth.js";
import { SECURITY_HEADERS } from "../lib/security_headers.js";

import { listenEphemeral } from "./helpers/ephemeral_server.mjs";
function makeApp() {
  const app = express();
  app.disable("x-powered-by");
  applyAppMiddleware(app);
  app.get("/realtime/health", (_req, res) => {
    res.status(200).json({ ok: true });
  });
  return app;
}

async function hit(app, path = "/realtime/health") {
  const server = listenEphemeral(app);
  try {
    const port = server.address().port;
    return await fetch(`http://127.0.0.1:${port}${path}`);
  } finally {
    server.close();
  }
}

test("[security-headers] app middleware sets the V1 review baseline", async () => {
  const previous = process.env.SECURITY_HEADERS_DISABLED;
  delete process.env.SECURITY_HEADERS_DISABLED;
  try {
    const res = await hit(makeApp());
    assert.equal(res.status, 200);
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      assert.equal(res.headers.get(name), value, `${name} should be set`);
    }
    assert.equal(res.headers.get("x-powered-by"), null);
  } finally {
    if (previous == null) {
      delete process.env.SECURITY_HEADERS_DISABLED;
    } else {
      process.env.SECURITY_HEADERS_DISABLED = previous;
    }
  }
});

test("[security-headers] SECURITY_HEADERS_DISABLED=1 strips the baseline for local debugging", async () => {
  const previous = process.env.SECURITY_HEADERS_DISABLED;
  process.env.SECURITY_HEADERS_DISABLED = "1";
  try {
    const res = await hit(makeApp());
    assert.equal(res.status, 200);
    for (const name of Object.keys(SECURITY_HEADERS)) {
      assert.equal(res.headers.get(name), null, `${name} should be disabled`);
    }
  } finally {
    if (previous == null) {
      delete process.env.SECURITY_HEADERS_DISABLED;
    } else {
      process.env.SECURITY_HEADERS_DISABLED = previous;
    }
  }
});
