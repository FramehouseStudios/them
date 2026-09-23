// T-decompose-phase5b4-realtime-call — integration tests for
// `mountRealtimeCallRoute`. Cover the 5 response paths
// (503/400/504/502/upstream-passthrough/200), the SDP body
// passthrough, the response headers, the form encoding, and
// the no-setter regression.

import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";

import {
  mountRealtimeCallRoute,
  REALTIME_CALL_BODY_LIMIT,
  REALTIME_CALL_TIMEOUT_MS,
} from "../lib/realtime_call_route.js";

import { listenEphemeral } from "./helpers/ephemeral_server.mjs";
function defaultDeps(overrides = {}) {
  const calls = {
    createRequestId: 0,
    buildRealtimeSessionConfig: [],
    fetchWithTimeout: [],
  };
  return {
    createRequestId: () => {
      calls.createRequestId += 1;
      return "req_rc_test";
    },
    buildRealtimeSessionConfig: ({ model, voice }) => {
      calls.buildRealtimeSessionConfig.push({ model, voice });
      return {
        model: model || "openai-rt",
        audio: { output: { voice: voice || "alloy" } },
      };
    },
    fetchWithTimeout: async (url, opts, timeoutMs) => {
      calls.fetchWithTimeout.push({ url, opts, timeoutMs });
      return {
        ok: true,
        status: 200,
        text: async () => "v=0\r\n... fake answer SDP ...",
      };
    },
    isAbortError: (err) => err?.name === "AbortError",
    OPENAI_API_KEY: "sk-test",
    OPENAI_REALTIME_MODEL: "openai-rt",
    OPENAI_REALTIME_VOICE: "alloy",
    _calls: calls,
    ...overrides,
  };
}

async function withTestServer(deps, fn) {
  const app = express();
  mountRealtimeCallRoute(app, deps);
  const server = listenEphemeral(app);
  await new Promise((r) => server.once("listening", r));
  const port = server.address().port;
  try { await fn(`http://127.0.0.1:${port}`); }
  finally { await new Promise((r) => server.close(r)); }
}

async function postSdp(baseURL, body, query = "") {
  const r = await fetch(`${baseURL}/realtime/call${query}`, {
    method: "POST",
    headers: { "content-type": "application/sdp" },
    body,
  });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: r.status, headers: r.headers, text, json };
}

// ---------- exports + mount guards ----------

test("[realtime-call] REALTIME_CALL_BODY_LIMIT exported as 512kb", () => {
  assert.equal(REALTIME_CALL_BODY_LIMIT, "512kb");
});

test("[realtime-call] REALTIME_CALL_TIMEOUT_MS exported as 15s", () => {
  assert.equal(REALTIME_CALL_TIMEOUT_MS, 15_000);
});

test("[realtime-call] mount fails without Express app", () => {
  assert.throws(() => mountRealtimeCallRoute(null, defaultDeps()));
});

test("[realtime-call] mount fails when any required fn dep is missing", () => {
  const required = [
    "createRequestId",
    "buildRealtimeSessionConfig",
    "fetchWithTimeout",
    "isAbortError",
  ];
  for (const key of required) {
    const deps = defaultDeps();
    deps[key] = undefined;
    const app = express();
    assert.throws(
      () => mountRealtimeCallRoute(app, deps),
      new RegExp(key),
      `should reject missing ${key}`,
    );
  }
});

test("[realtime-call] mount fails when constants are not the right type", () => {
  for (const k of ["OPENAI_API_KEY", "OPENAI_REALTIME_MODEL", "OPENAI_REALTIME_VOICE"]) {
    const deps = defaultDeps();
    deps[k] = null;
    const app = express();
    assert.throws(() => mountRealtimeCallRoute(app, deps), new RegExp(k));
  }
});

// ---------- 503 missing key ----------

test("[realtime-call] 503 when OPENAI_API_KEY is the empty string", async () => {
  const deps = defaultDeps({ OPENAI_API_KEY: "" });
  await withTestServer(deps, async (baseURL) => {
    const r = await postSdp(baseURL, "v=0\r\n");
    assert.equal(r.status, 503);
    assert.equal(r.json.stage, "realtime_call");
    assert.match(r.json.error, /OpenAI API key/);
  });
});

// ---------- 400 missing body ----------

test("[realtime-call] 400 when SDP body is empty", async () => {
  await withTestServer(defaultDeps(), async (baseURL) => {
    const r = await postSdp(baseURL, "");
    assert.equal(r.status, 400);
    assert.equal(r.json.stage, "realtime_call");
    assert.match(r.json.error, /Missing SDP offer/);
  });
});

test("[realtime-call] 400 when SDP body is just whitespace", async () => {
  await withTestServer(defaultDeps(), async (baseURL) => {
    const r = await postSdp(baseURL, "   \n  \r\n  ");
    assert.equal(r.status, 400);
  });
});

// ---------- 504 timeout via isAbortError ----------

test("[realtime-call] 504 when fetchWithTimeout throws an abort error", async () => {
  const abortErr = Object.assign(new Error("aborted"), { name: "AbortError" });
  const deps = defaultDeps({
    fetchWithTimeout: async () => { throw abortErr; },
  });
  await withTestServer(deps, async (baseURL) => {
    const r = await postSdp(baseURL, "v=0\r\n");
    assert.equal(r.status, 504);
    assert.equal(r.json.stage, "realtime_call");
    assert.match(r.json.error, /timed out/);
  });
});

// ---------- 502 generic fetch failure ----------

test("[realtime-call] 502 when fetchWithTimeout throws a non-abort error", async () => {
  const deps = defaultDeps({
    fetchWithTimeout: async () => { throw new Error("connect failed"); },
  });
  await withTestServer(deps, async (baseURL) => {
    const r = await postSdp(baseURL, "v=0\r\n");
    assert.equal(r.status, 502);
    assert.equal(r.json.stage, "realtime_call");
    assert.match(r.json.error, /connect failed/);
  });
});

// ---------- upstream non-2xx passthrough ----------

test("[realtime-call] forwards OpenAI status code on upstream non-2xx", async () => {
  const deps = defaultDeps({
    fetchWithTimeout: async () => ({
      ok: false,
      status: 429,
      text: async () => "rate limit exceeded",
    }),
  });
  await withTestServer(deps, async (baseURL) => {
    const r = await postSdp(baseURL, "v=0\r\n");
    assert.equal(r.status, 429);
    assert.equal(r.json.stage, "realtime_call");
    assert.match(r.json.error, /rate limit/);
  });
});

test("[realtime-call] uses fallback message when upstream returns empty error body", async () => {
  const deps = defaultDeps({
    fetchWithTimeout: async () => ({
      ok: false,
      status: 500,
      text: async () => "",
    }),
  });
  await withTestServer(deps, async (baseURL) => {
    const r = await postSdp(baseURL, "v=0\r\n");
    assert.equal(r.status, 500);
    assert.match(r.json.error, /OpenAI Realtime call setup failed/);
  });
});

// ---------- 200 happy path ----------

test("[realtime-call] 200 SDP response on happy path", async () => {
  await withTestServer(defaultDeps(), async (baseURL) => {
    const r = await postSdp(baseURL, "v=0\r\no=...");
    assert.equal(r.status, 200);
    assert.match(r.text, /fake answer SDP/);
    // Body is the SDP answer string, not JSON.
    assert.equal(r.json, null);
  });
});

test("[realtime-call] 200 response sets canonical headers", async () => {
  await withTestServer(defaultDeps(), async (baseURL) => {
    const r = await postSdp(baseURL, "v=0\r\n");
    // Express adds charset=utf-8 when send() infers the body is
    // text; the Content-Type starts with application/sdp.
    assert.match(r.headers.get("content-type") || "", /^application\/sdp/);
    assert.equal(r.headers.get("cache-control"), "no-store");
    assert.equal(r.headers.get("x-realtime-model"), "openai-rt");
    assert.equal(r.headers.get("x-realtime-voice"), "alloy");
  });
});

// ---------- session config + query param flow ----------

test("[realtime-call] buildRealtimeSessionConfig receives model + voice (defaults)", async () => {
  const deps = defaultDeps();
  await withTestServer(deps, async (baseURL) => {
    await postSdp(baseURL, "v=0\r\n");
    const args = deps._calls.buildRealtimeSessionConfig[0];
    assert.equal(args.model, "openai-rt");
    assert.equal(args.voice, "alloy");
  });
});

test("[realtime-call] model + voice query params override defaults", async () => {
  const deps = defaultDeps();
  await withTestServer(deps, async (baseURL) => {
    await postSdp(baseURL, "v=0\r\n", "?model=custom-model&voice=ECHO");
    const args = deps._calls.buildRealtimeSessionConfig[0];
    assert.equal(args.model, "custom-model");
    assert.equal(args.voice, "echo", "voice should be lowercased");
  });
});

// ---------- form encoding + upstream request ----------

test("[realtime-call] sends a multipart form with sdp + session fields to OpenAI", async () => {
  const deps = defaultDeps();
  await withTestServer(deps, async (baseURL) => {
    await postSdp(baseURL, "v=0\r\no=test");
    const args = deps._calls.fetchWithTimeout[0];
    assert.match(args.url, /api\.openai\.com\/v1\/realtime\/calls/);
    assert.equal(args.opts.method, "POST");
    assert.equal(args.opts.headers["Authorization"], "Bearer sk-test");
    assert.equal(args.opts.headers["OpenAI-Beta"], "realtime=v1");
    assert.equal(args.timeoutMs, 15_000);
    // body is a FormData; assert it carries the sdp + session.
    const form = args.opts.body;
    assert.equal(form.get("sdp"), "v=0\r\no=test");
    const session = JSON.parse(form.get("session"));
    assert.equal(session.model, "openai-rt");
    assert.equal(session.audio.output.voice, "alloy");
  });
});

// ---------- #238 invariant inheritance ----------

test("[realtime-call] does NOT accept any setter-shaped dep", () => {
  const deps = defaultDeps();
  for (const key of Object.keys(deps)) {
    if (key.startsWith("_")) continue;
    assert.ok(
      !/^set[A-Z]/.test(key),
      `unexpected setter-shaped dep "${key}" — would silently mutate module state`,
    );
  }
  const app = express();
  assert.doesNotThrow(() => mountRealtimeCallRoute(app, deps));
});
