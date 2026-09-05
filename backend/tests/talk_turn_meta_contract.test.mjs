// T-talk-pipeline-error-class-snapshot — pins the load-bearing
// surface of GET /talk/turn/:turnId so a silent rename or accidental
// shape change fails fast.
//
// What's locked in here:
//
//   1. The full set of canonical error codes the route can emit:
//      invalid_turn_id, turn_not_found, forbidden.
//   2. The full key set of the success-shape JSON body. iOS reads
//      every one of these fields directly; renaming any of them (or
//      forgetting to emit one) is a silent client regression.
//   3. The default render_contract sub-shape for legacy turns.

import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";

import { mountTalkPipelineRoutes } from "../lib/talk_pipeline.js";

// Canonical sets. Adding a field is a deliberate change — adjust this
// list and the iOS consumer in the same PR.
const ERROR_CODES = ["invalid_turn_id", "turn_not_found", "forbidden"];
const SUCCESS_KEYS = [
  "turn_id",
  "session_id",
  "user_id",
  "state_version",
  "transcript",
  "reply",
  "audio_duration_ms",
  "timing_source",
  "screenplay_cues",
  "screenplay_output",
  "dialogue_timeline",
  "render_contract",
  "request_id",
  "updated_at",
];
const DEFAULT_RENDER_CONTRACT_KEYS = [
  "reply_role",
  "authoritative_page_text_available",
  "sync_ready",
];

async function withTestServer(fn, { meta = null, canRead = true, userId = "u-test" } = {}) {
  const app = express();
  if (userId !== null) {
    app.use((req, _res, next) => { req.user = { id: userId }; next(); });
  }
  mountTalkPipelineRoutes(app, {
    talkRateLimitGuard: (req, _res, next) => next(),
    requireClientTokenForTalk: (req, _res, next) => next(),
    talkIdempotencyGuard: (req, _res, next) => next(),
    talkSessionSerialGuard: (req, _res, next) => next(),
    talkConcurrencyGuard: (req, _res, next) => next(),
    talkUpload: (req, _res, next) => next(),
    handleTalkRequest: (_req, res) => res.status(200).json({ ok: true }),
    normalizeTalkTurnId: (v) => String(v || "").trim(),
    getTalkTurnMeta: () => meta,
    canReadTalkTurnMeta: () => canRead,
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const port = server.address().port;
  const baseURL = `http://127.0.0.1:${port}`;
  try {
    await fn({ baseURL });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function get(baseURL, p) {
  const r = await fetch(`${baseURL}${p}`);
  return { status: r.status, body: await r.json().catch(() => null) };
}

// ---------- error code surface ----------

test("[talk-turn-meta] empty/whitespace turnId → 400 invalid_turn_id", async () => {
  await withTestServer(async ({ baseURL }) => {
    const r = await get(baseURL, "/talk/turn/%20%20");
    assert.equal(r.status, 400);
    assert.equal(r.body.error, "invalid_turn_id");
    assert.ok(ERROR_CODES.includes(r.body.error));
  });
});

test("[talk-turn-meta] missing meta → 404 turn_not_found", async () => {
  await withTestServer(
    async ({ baseURL }) => {
      const r = await get(baseURL, "/talk/turn/abc");
      assert.equal(r.status, 404);
      assert.equal(r.body.error, "turn_not_found");
    },
    { meta: null },
  );
});

test("[talk-turn-meta] caller can't read meta → 403 forbidden", async () => {
  await withTestServer(
    async ({ baseURL }) => {
      const r = await get(baseURL, "/talk/turn/abc");
      assert.equal(r.status, 403);
      assert.equal(r.body.error, "forbidden");
    },
    { meta: { turnId: "abc" }, canRead: false },
  );
});

// ---------- success-shape contract ----------

test("[talk-turn-meta] success body contains exactly the canonical key set", async () => {
  await withTestServer(
    async ({ baseURL }) => {
      const r = await get(baseURL, "/talk/turn/abc");
      assert.equal(r.status, 200);
      const actualKeys = Object.keys(r.body).sort();
      const expectedKeys = [...SUCCESS_KEYS].sort();
      assert.deepEqual(
        actualKeys,
        expectedKeys,
        `key drift detected\nactual:   ${actualKeys.join(", ")}\nexpected: ${expectedKeys.join(", ")}`,
      );
    },
    {
      meta: {
        turnId: "abc",
        sessionId: "s-1",
        userId: "u-1",
        stateVersion: "v-1",
        transcript: "hi",
        reply: "hello",
        audioDurationMs: 1000,
        timingSource: "openai",
        screenplayCues: [],
        screenplayOutput: null,
        dialogueTimeline: null,
        renderContract: {
          reply_role: "final",
          authoritative_page_text_available: true,
          sync_ready: true,
        },
        requestId: "r-1",
        updatedAt: 1700000000000,
        createdAt: 1700000000000,
      },
    },
  );
});

test("[talk-turn-meta] default render_contract has exactly 3 canonical keys", async () => {
  await withTestServer(
    async ({ baseURL }) => {
      const r = await get(baseURL, "/talk/turn/abc");
      const rc = r.body.render_contract;
      assert.ok(rc && typeof rc === "object");
      const actualKeys = Object.keys(rc).sort();
      assert.deepEqual(actualKeys, [...DEFAULT_RENDER_CONTRACT_KEYS].sort());
      assert.equal(rc.reply_role, "final");
      assert.equal(rc.authoritative_page_text_available, false);
      assert.equal(rc.sync_ready, false);
    },
    {
      meta: { turnId: "abc", renderContract: null },
    },
  );
});

test("[talk-turn-meta] response includes Cache-Control: no-store", async () => {
  await withTestServer(
    async ({ baseURL }) => {
      const r = await fetch(`${baseURL}/talk/turn/abc`);
      assert.equal(r.headers.get("cache-control"), "no-store");
    },
    {
      meta: { turnId: "abc" },
    },
  );
});
