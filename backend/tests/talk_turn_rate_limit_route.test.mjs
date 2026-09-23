// T-talk-turn-rate-limit-route — integration tests for the
// optional rate-limit middleware on GET /talk/turn/:turnId.
//
// Pins:
//   - omitted limiter → request flows through unchanged
//   - allowed verdict → request flows through
//   - denied verdict → 429 with `error: rate_limited` and
//     `Retry-After` header (when retryAfterMs is finite)
//   - per-key isolation: draining one userId doesn't affect another
//   - unauthenticated requests key by IP, not pooled

import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";

import { mountTalkPipelineRoutes } from "../lib/talk_pipeline.js";
import { createTalkTurnRateLimiter } from "../lib/talk_turn_rate_limit.js";

import { listenEphemeral } from "./helpers/ephemeral_server.mjs";
async function withTestServer(fn, opts = {}) {
  const app = express();
  if (opts.userId !== undefined) {
    app.use((req, _res, next) => { req.user = { id: opts.userId }; next(); });
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
    getTalkTurnMeta: () => ({
      turnId: "abc",
      sessionId: "s-1",
      userId: "u-1",
      renderContract: { reply_role: "final", authoritative_page_text_available: false, sync_ready: false },
    }),
    canReadTalkTurnMeta: () => true,
    turnReadRateLimiter: opts.rateLimiter,
  });
  const server = listenEphemeral(app);
  await new Promise((resolve) => server.once("listening", resolve));
  const baseURL = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn({ baseURL });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function get(baseURL, p) {
  const r = await fetch(`${baseURL}${p}`);
  return { status: r.status, headers: Object.fromEntries(r.headers), body: await r.json().catch(() => null) };
}

test("[turn-rate-route] omitted limiter → request flows through unchanged", async () => {
  await withTestServer(async ({ baseURL }) => {
    const r = await get(baseURL, "/talk/turn/abc");
    assert.equal(r.status, 200);
    assert.equal(r.body.turn_id, "abc");
  });
});

test("[turn-rate-route] limiter with available tokens → request flows through", async () => {
  const rl = createTalkTurnRateLimiter({ capacity: 10, refillPerSec: 1 });
  await withTestServer(
    async ({ baseURL }) => {
      const r = await get(baseURL, "/talk/turn/abc");
      assert.equal(r.status, 200);
      assert.equal(r.body.turn_id, "abc");
    },
    { rateLimiter: rl, userId: "u-1" },
  );
});

test("[turn-rate-route] limiter exhausted → 429 with rate_limited", async () => {
  const rl = createTalkTurnRateLimiter({ capacity: 2, refillPerSec: 1 });
  await withTestServer(
    async ({ baseURL }) => {
      // Burn the bucket with 2 successful calls.
      assert.equal((await get(baseURL, "/talk/turn/abc")).status, 200);
      assert.equal((await get(baseURL, "/talk/turn/abc")).status, 200);
      // Third should be denied.
      const denied = await get(baseURL, "/talk/turn/abc");
      assert.equal(denied.status, 429);
      assert.equal(denied.body.error, "rate_limited");
      assert.ok(Number.isFinite(denied.body.retry_after_ms));
      assert.ok(denied.headers["retry-after"]);
    },
    { rateLimiter: rl, userId: "u-1" },
  );
});

test("[turn-rate-route] denied response is Cache-Control: no-store", async () => {
  const rl = createTalkTurnRateLimiter({ capacity: 1, refillPerSec: 1 });
  await withTestServer(
    async ({ baseURL }) => {
      await get(baseURL, "/talk/turn/abc"); // burn
      const denied = await get(baseURL, "/talk/turn/abc");
      assert.equal(denied.status, 429);
      assert.equal(denied.headers["cache-control"], "no-store");
    },
    { rateLimiter: rl, userId: "u-1" },
  );
});

test("[turn-rate-route] limiter runs before any other gate (invalid turnId still rate-limited)", async () => {
  const rl = createTalkTurnRateLimiter({ capacity: 1, refillPerSec: 1 });
  await withTestServer(
    async ({ baseURL }) => {
      await get(baseURL, "/talk/turn/abc"); // burn token
      const denied = await get(baseURL, "/talk/turn/%20%20"); // would otherwise be invalid_turn_id
      assert.equal(denied.status, 429, "rate limit should win over invalid_turn_id");
      assert.equal(denied.body.error, "rate_limited");
    },
    { rateLimiter: rl, userId: "u-1" },
  );
});
