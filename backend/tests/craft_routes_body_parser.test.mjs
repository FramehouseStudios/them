// T45 — production-style Craft route body parsing.

import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";

import { mountCraftRoutes } from "../lib/craft_routes.js";

const SAMPLE = `INT. KITCHEN - NIGHT

JUNE
Hello.`;

async function withProductionStyleCraftServer(fn) {
  const app = express();
  // Intentionally no app.use(express.json()) here. Production calls
  // mountCraftRoutes(app) directly, so the route module must own the parser.
  app.use((req, _res, next) => {
    req.authUser = { id: "craft-body-parser-test-user" };
    req.userId = req.authUser.id;
    next();
  });
  mountCraftRoutes(app, { authorizeProjectAccess: async () => true });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const port = server.address().port;
  try {
    await fn({ baseURL: `http://127.0.0.1:${port}` });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("[craft_routes] POST endpoints parse JSON in the production mount shape", async () => {
  await withProductionStyleCraftServer(async ({ baseURL }) => {
    const response = await fetch(`${baseURL}/craft/format/lint`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: SAMPLE, frameworkId: "three-act" }),
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.schemaVersion, 1);
    assert.equal(body.frameworkId, "three-act");
    assert.ok(Array.isArray(body.suggestions));
  });
});
