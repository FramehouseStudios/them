// T-route-local-parsers — production-style tests for routes that
// previously read req.body without their own express.json() parser.
//
// Codex #90 established the rule: every route that touches req.body
// must mount its own express.json() so test code can't accidentally
// mask the production behavior with an app-level parser.
//
// These tests use a **bare** Express app — no app.use(express.json())
// upstream. If the route lib forgets to mount its own parser,
// req.body is undefined and these tests will fail with a 400
// `invalid_character_name` (the route's own validation) instead of
// the expected 200 / 400-with-fields result. Pre-flight's
// `route-needs-own-parser` rule is the static-analysis cousin of
// these runtime tests.

import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import qs from "qs";

import { mountCharacterTraitRoute } from "../lib/character_trait_route.js";
import { mountMemoryCharacterMentionRoute } from "../lib/memory_character_mention_route.js";
import { mountFirstPageTelemetryRoute } from "../lib/first_page_telemetry_route.js";
import { configureFirstPageTelemetry } from "../lib/first_page_telemetry.js";
import { mountFountainExportRoute } from "../lib/fountain_export_route.js";

function fakeStore() {
  const recorded = [];
  return {
    recorded,
    async recordCharacterMention({ userId, characterName, voice, tags, source, metadata, traits }) {
      recorded.push({ userId, characterName, voice, tags, source, metadata, traits });
      return { ok: true, action: "recorded" };
    },
    async getCharacterTraits({ userId, characterName }) {
      if (!characterName) return [];
      return { name: characterName, traits: { keywords: ["k"] } };
    },
  };
}

async function withBareApp(mountFn, fn) {
  // Deliberately do NOT call app.use(express.json()). Each route lib
  // must mount its own parser.
  const app = express();
  mountFn(app);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const port = server.address().port;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function postJson(baseURL, path, body) {
  const r = await fetch(`${baseURL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await r.json().catch(() => null);
  return { status: r.status, body: json };
}

test("[route-local-parsers] patched query parser preserves empty and nested Express queries", () => {
  const parse = express().get("query parser fn");
  assert.deepEqual(parse(""), {});
  assert.deepEqual(
    parse("limit=24&filter[act]=II&filter[characters][]=Mara&filter[characters][]=Eli&tags[]=1,2,3,4"),
    { limit: "24", filter: { act: "II", characters: ["Mara", "Eli"] }, tags: ["1,2,3,4"] }
  );
});

test("[route-local-parsers] qs rejects bracketed comma groups above the configured limit", () => {
  // GHSA-x5fp-wj9c-mxmx: brackets must not bypass the comma array limit.
  assert.throws(
    () => qs.parse("a[]=1,2,3,4", { comma: true, arrayLimit: 3, throwOnLimitExceeded: true }),
    RangeError
  );
});

test("[route-local-parsers] qs safely serializes a parsed non-callable constructor.isBuffer", () => {
  // GHSA-4mjr-xmp4-gh2g: never call a client-controlled non-function.
  const parse = express().get("query parser fn");
  const parsed = parse("x[constructor][isBuffer]=y");
  assert.deepEqual(parsed, { x: { constructor: { isBuffer: "y" } } });
  assert.equal(qs.stringify(parsed), "x%5Bconstructor%5D%5BisBuffer%5D=y");
});

test("[route-local-parsers] POST /memory/character-trait parses req.body without app-level parser", async () => {
  const store = fakeStore();
  const resolveUserId = () => "user_abc";
  await withBareApp(
    (app) => mountCharacterTraitRoute(app, { creativeMemoryStore: store, resolveUserId }),
    async (baseURL) => {
      const r = await postJson(baseURL, "/memory/character-trait", {
        character_name: "JUNE",
        traits: { keywords: ["wry"], goals: ["leave"] },
      });
      // If the route forgot its own express.json(), req.body is
      // undefined, character_name lookup yields "", and we'd see a
      // 400 `invalid_character_name`. Getting 200 with the recorded
      // character proves the route-local parser is wired.
      assert.equal(r.status, 200, `expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
      assert.equal(r.body.characterName, "JUNE");
      assert.equal(r.body.action, "recorded");
      assert.equal(store.recorded.length, 1);
      assert.equal(store.recorded[0].characterName, "JUNE");
    },
  );
});

test("[route-local-parsers] POST /memory/record-character-mention parses req.body without app-level parser", async () => {
  const store = fakeStore();
  const resolveUserId = () => "user_abc";
  await withBareApp(
    (app) => mountMemoryCharacterMentionRoute(app, { creativeMemoryStore: store, resolveUserId }),
    async (baseURL) => {
      const r = await postJson(baseURL, "/memory/record-character-mention", {
        character_name: "JUNE",
        source: "ios_screenplay_render",
        tags: ["lead"],
      });
      assert.equal(r.status, 200, `expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
      assert.equal(r.body.characterName, "JUNE");
      assert.equal(r.body.action, "recorded");
      assert.equal(r.body.source, "ios_screenplay_render");
      assert.equal(store.recorded.length, 1);
      assert.equal(store.recorded[0].characterName, "JUNE");
      assert.deepEqual(store.recorded[0].tags, ["lead"]);
    },
  );
});

test("[route-local-parsers] POST /telemetry/first-page-written parses req.body without app-level parser", async () => {
  // Use an in-memory persistence stub so we don't touch disk.
  const kv = new Map();
  configureFirstPageTelemetry({
    persistence: {
      async get({ domain, key }) { return kv.get(`${domain}::${key}`) || null; },
      async put({ domain, key, value }) { kv.set(`${domain}::${key}`, value); return value; },
      async list({ domain } = {}) {
        const prefix = domain ? `${domain}::` : "";
        const out = [];
        for (const [k, v] of kv.entries()) {
          if (!domain || k.startsWith(prefix)) out.push(v);
        }
        return out;
      },
    },
  });
  const resolveUserId = () => "user_abc";
  await withBareApp(
    (app) => mountFirstPageTelemetryRoute(app, { resolveUserId }),
    async (baseURL) => {
      const r = await postJson(baseURL, "/telemetry/first-page-written", {
        projectId: "p1",
        versionId: "v1",
        secondsToFirstPage: 42.5,
        source: "studio",
      });
      // Whether the underlying persistence call succeeds is incidental
      // here. The point: a 400 with `missing body` or a 500 with
      // "Cannot read properties of undefined" would mean the parser
      // didn't run. As long as the route reached past req.body
      // unpacking, the parser is wired.
      assert.notEqual(
        r.status,
        500,
        `unexpected 500; req.body was likely not parsed: ${JSON.stringify(r.body)}`,
      );
      assert.notEqual(
        r.status,
        400,
        `route rejected with 400; req.body was likely undefined: ${JSON.stringify(r.body)}`,
      );
      assert.equal(r.status, 200);
      assert.equal(r.body.ok, true);
    },
  );
});

test("[route-local-parsers] POST /screenplay/export/fountain parses req.body without app-level parser", async () => {
  await withBareApp(
    (app) => mountFountainExportRoute(app),
    async (baseURL) => {
      const r = await postJson(baseURL, "/screenplay/export/fountain", {
        title: { title: "Smoke Test" },
        scenes: [{ heading: "INT. ROOM - DAY", action: "Test." }],
      });
      assert.equal(r.status, 200, `expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
      assert.equal(typeof r.body.fountain, "string");
      assert.ok(r.body.fountain.length > 0, "expected non-empty fountain text");
    },
  );
});
