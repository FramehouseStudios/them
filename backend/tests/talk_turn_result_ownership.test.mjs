import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import express from "express";
import { mountTalkPipelineRoutes } from "../lib/talk_pipeline.js";

process.env.RUN_SERVER = "0";
process.env.OPENAI_API_KEY = "test-openai-key";
process.env.REALTIME_PROVIDER = "stub";
const { storeTalkTurnMeta, readTalkTurnMeta, canReadTalkTurnMeta } = await import("../index.js");

const sessionA = "fixture-session-a-1234567890";
const sessionB = "fixture-session-b-1234567890";
function save(turnId, userId, sessionId, reply) {
  storeTalkTurnMeta({ turnId, userId, sessionId, reply,
    screenplayOutput: { target: "page", text: reply, format: "fountain", source: "fixture", lines: [] } });
}

async function withRoute(run) {
  const app = express();
  // This fixture installs verified identity; it does not test token issuance
  // or signature validation. X-User-Id is deliberately never trusted.
  app.use((req, _res, next) => {
    const identity = { "Bearer fixture-a": "writer-a", "Bearer fixture-b": "writer-b" }[req.get("Authorization")];
    if (identity) req.authUser = { id: identity };
    next();
  });
  const next = (_req, _res, done) => done();
  mountTalkPipelineRoutes(app, {
    talkRateLimitGuard: next, requireClientTokenForTalk: next,
    talkIdempotencyGuard: next, talkSessionSerialGuard: next,
    talkConcurrencyGuard: next, talkUpload: next, handleTalkRequest: next,
    normalizeTalkTurnId: (id) => String(id || "").trim(),
    getTalkTurnMeta: (id, req) => readTalkTurnMeta(id, Date.now(), req),
    canReadTalkTurnMeta,
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const get = async (id, identity, session, extra = {}) => {
    const headers = { "X-APP-TOKEN": "them-dev", ...extra };
    if (identity) headers.Authorization = `Bearer fixture-${identity}`;
    if (session) headers["X-Client-Token"] = session;
    const response = await fetch(`http://127.0.0.1:${server.address().port}/talk/turn/${id}`, { headers });
    return { status: response.status, body: await response.json() };
  };
  try { await run(get); }
  finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
}

test("two writers with the same turn ID retain their own authoritative screenplay", async () => {
  const id = `turn-collision-${randomUUID()}`;
  save(id, "writer-a", sessionA, "INT. ALPHA - NIGHT\nA's exact scene.");
  save(id, "writer-b", sessionB, "INT. BETA - DAY\nB's exact scene.");
  await withRoute(async (get) => {
    for (const [identity, session, expected] of [["a", sessionA, "A's exact scene."], ["b", sessionB, "B's exact scene."]]) {
      const result = await get(id, identity, session);
      assert.equal(result.status, 200);
      assert.equal(result.body.user_id, `writer-${identity}`, "do not repeatedly prefix the stored owner ID");
      assert.ok(result.body.screenplay_output.text.endsWith(expected));
    }
  });
  assert.equal(readTalkTurnMeta(id), null, "an unscoped internal lookup must not guess between writers");
});

test("same writer's session-local turn IDs are selected by original session, not whichever wrote last", async () => {
  const id = `turn-sessions-${randomUUID()}`;
  save(id, "writer-a", sessionA, "Project A scene");
  save(id, "writer-a", sessionB, "Project B scene");
  await withRoute(async (get) => {
    assert.equal((await get(id, "a", sessionA)).body.reply, "Project A scene");
    assert.equal((await get(id, "a", sessionB)).body.reply, "Project B scene");
    assert.equal((await get(id, "a", "fixture-renewed-session-123456")).status, 404);
  });
});

test("owner-bound result rejects another writer or signed-out caller despite matching session/IP/debug token or forged owner header", async () => {
  const id = `turn-private-${randomUUID()}`;
  save(id, "writer-a", sessionA, "Private screenplay text");
  await withRoute(async (get) => {
    for (const identity of ["b", null]) {
      const result = await get(id, identity, sessionA, { "X-User-Id": "writer-a" });
      assert.equal(result.status, 403);
      assert.deepEqual(result.body, { error: "forbidden" });
    }
    assert.equal((await get(id, "a", "fixture-renewed-session-123456")).status, 200,
      "a single owned result survives credential refresh without guessing between sessions");
  });
});

test("legacy ownerless result still works for its session outside local debug bypass", async () => {
  const id = `turn-legacy-${randomUUID()}`;
  const unscopedID = `turn-unscoped-${randomUUID()}`;
  save(id, "", sessionA, "Legacy scene");
  save(unscopedID, "", "", "No ownership evidence");
  await withRoute(async (get) => {
    const headers = { "X-APP-TOKEN": "fixture-not-debug" };
    assert.equal((await get(id, null, sessionA, headers)).status, 200);
    assert.equal((await get(id, null, sessionB, headers)).status, 403);
    assert.equal((await get(unscopedID, null, sessionA, headers)).status, 403);
  });
});
