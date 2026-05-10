// T30 — HTTP integration tests for POST /memory/record-character-mention.
// Mirrors the craft_endpoints.test.mjs pattern: mount the route on a
// minimal Express app with an injected creativeMemoryStore so the test
// runs without touching backend/index.js boot.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import express from "express";

import { createCreativeMemoryStore } from "../lib/creative_memory_store.js";
import { createJsonPersistence } from "../lib/persistence_json.js";
import {
  mountMemoryCharacterMentionRoute,
  _sanitizeName,
  _sanitizeSource,
  _sanitizeTags,
  _sanitizeMetadata,
} from "../lib/memory_character_mention_route.js";

function freshPersistenceRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "io-them-mem-char-"));
}

async function withTestServer(fn, { userId = "user-test-1" } = {}) {
  const persistence = createJsonPersistence({ jsonRoot: freshPersistenceRoot() });
  const creativeMemoryStore = createCreativeMemoryStore({ persistence });
  const app = express();
  app.use(express.json());
  if (userId !== null) {
    app.use((req, _res, next) => {
      req.user = { id: userId };
      next();
    });
  }
  mountMemoryCharacterMentionRoute(app, { creativeMemoryStore });
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const port = server.address().port;
  const baseURL = `http://127.0.0.1:${port}`;
  try {
    await fn({ baseURL, creativeMemoryStore, userId });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function postJson(baseURL, body) {
  const r = await fetch(`${baseURL}/memory/record-character-mention`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await r.json().catch(() => null);
  return { status: r.status, body: json };
}

// ---------- happy path: snake_case ----------

test("[T30] POST records a snake_case character_name and returns the iOS receipt shape", async () => {
  await withTestServer(async ({ baseURL, creativeMemoryStore, userId }) => {
    const { status, body } = await postJson(baseURL, {
      character_name: "JUNE",
      voice: "",
      tags: ["screenplay_reply", "ios_rendered_page"],
      source: "ios_screenplay_render",
      write_id: "write-1",
      line: 12,
      metadata: {
        screenplay_write_id: "write-1",
        screenplay_project_id: "project-1",
        screenplay_version_id: "version-1",
      },
    });
    assert.equal(status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.action, "recorded");
    assert.equal(body.characterName, "JUNE");
    assert.equal(body.source, "ios_screenplay_render");

    const mem = await creativeMemoryStore.getCreativeMemoryForPrompt({ userId });
    assert.ok(mem && Array.isArray(mem.characters));
    assert.equal(mem.characters.length, 1);
    const c = mem.characters[0];
    assert.equal(c.name, "JUNE");
    assert.deepEqual(c.tags.sort(), ["ios_rendered_page", "screenplay_reply"]);
    assert.equal(c.source, "ios_screenplay_render");
    assert.equal(c.metadata.screenplay_write_id, "write-1");
    assert.equal(c.metadata.screenplay_project_id, "project-1");
    assert.equal(c.metadata.screenplay_version_id, "version-1");
    assert.equal(c.metadata.line, 12);
    assert.equal(c.metadata.source, "ios_screenplay_render");
  });
});

// ---------- happy path: camelCase ----------

test("[T30] POST records a camelCase characterName payload identically", async () => {
  await withTestServer(async ({ baseURL, creativeMemoryStore, userId }) => {
    const { status, body } = await postJson(baseURL, {
      characterName: "CAL",
      source: "ios_screenplay_render",
      write_id: "write-2",
      line: 5,
    });
    assert.equal(status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.characterName, "CAL");
    assert.equal(body.source, "ios_screenplay_render");

    const mem = await creativeMemoryStore.getCreativeMemoryForPrompt({ userId });
    assert.equal(mem.characters[0].name, "CAL");
    assert.equal(mem.characters[0].metadata.screenplay_write_id, "write-2");
    assert.equal(mem.characters[0].metadata.line, 5);
  });
});

// ---------- metadata + write_id + line preservation ----------

test("[T30] metadata, write_id, and line all land on the persisted character record", async () => {
  await withTestServer(async ({ baseURL, creativeMemoryStore, userId }) => {
    const { status, body } = await postJson(baseURL, {
      character_name: "MARY-ANNE",
      tags: ["screenplay_reply"],
      source: "ios_screenplay_render",
      write_id: "w-42",
      line: 99,
      metadata: {
        screenplay_project_id: "proj-meta",
        screenplay_version_id: "ver-meta",
      },
    });
    assert.equal(status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.characterName, "MARY-ANNE");

    const mem = await creativeMemoryStore.getCreativeMemoryForPrompt({ userId });
    const c = mem.characters[0];
    // write_id at the top level promoted into metadata.screenplay_write_id.
    assert.equal(c.metadata.screenplay_write_id, "w-42");
    // line at top level promoted into metadata.line.
    assert.equal(c.metadata.line, 99);
    // explicit metadata fields preserved.
    assert.equal(c.metadata.screenplay_project_id, "proj-meta");
    assert.equal(c.metadata.screenplay_version_id, "ver-meta");
  });
});

// ---------- invalid name rejection ----------

test("[T30] empty character name returns 400 and does not persist", async () => {
  await withTestServer(async ({ baseURL, creativeMemoryStore, userId }) => {
    const { status, body } = await postJson(baseURL, {
      character_name: "   ",
      source: "ios_screenplay_render",
    });
    assert.equal(status, 400);
    assert.equal(body.ok, false);
    assert.equal(body.action, "rejected");
    assert.equal(body.error, "invalid_character_name");

    const mem = await creativeMemoryStore.getCreativeMemoryForPrompt({ userId });
    assert.equal(mem, null);
  });
});

test("[T30] missing both name fields returns 400", async () => {
  await withTestServer(async ({ baseURL }) => {
    const { status, body } = await postJson(baseURL, {
      source: "ios_screenplay_render",
    });
    assert.equal(status, 400);
    assert.equal(body.ok, false);
    assert.equal(body.action, "rejected");
  });
});

// ---------- idempotent-ish repeated mentions ----------

test("[T30] a repeated mention of the same name yields action=updated and one stored character", async () => {
  await withTestServer(async ({ baseURL, creativeMemoryStore, userId }) => {
    const first = await postJson(baseURL, {
      character_name: "JUNE",
      source: "ios_screenplay_render",
      write_id: "w-1",
      line: 1,
      tags: ["screenplay_reply"],
    });
    assert.equal(first.body.action, "recorded");

    const second = await postJson(baseURL, {
      character_name: "JUNE",
      source: "ios_screenplay_render",
      write_id: "w-2",
      line: 2,
      tags: ["ios_rendered_page"],
    });
    assert.equal(second.status, 200);
    assert.equal(second.body.ok, true);
    assert.equal(second.body.action, "updated");

    const mem = await creativeMemoryStore.getCreativeMemoryForPrompt({ userId });
    assert.equal(mem.characters.length, 1);
    // Tags from both writes are merged onto the same record.
    assert.deepEqual(mem.characters[0].tags.sort(), ["ios_rendered_page", "screenplay_reply"]);
    // Latest write_id wins on metadata merge.
    assert.equal(mem.characters[0].metadata.screenplay_write_id, "w-2");
    assert.equal(mem.characters[0].metadata.line, 2);
  });
});

// ---------- optional metadata may be missing ----------

test("[T30] missing optional metadata fields does not fail the request", async () => {
  await withTestServer(async ({ baseURL }) => {
    const { status, body } = await postJson(baseURL, {
      character_name: "GUARD 2",
    });
    assert.equal(status, 200);
    assert.equal(body.ok, true);
    // source defaults to ios_screenplay_render when not supplied.
    assert.equal(body.source, "ios_screenplay_render");
    assert.equal(body.characterName, "GUARD 2");
  });
});

// ---------- unauthenticated request returns typed skip, not 401 ----------

test("[T30] unauthenticated request returns 200 + action=skipped (matches existing memory-write semantics)", async () => {
  await withTestServer(
    async ({ baseURL }) => {
      const { status, body } = await postJson(baseURL, {
        character_name: "JUNE",
      });
      assert.equal(status, 200);
      assert.equal(body.ok, false);
      assert.equal(body.action, "skipped");
      assert.equal(body.characterName, "JUNE");
    },
    { userId: null },
  );
});

// ---------- pure sanitizer unit tests ----------

test("[T30] sanitizeName keeps spaces, periods, apostrophes, hyphens; strips brackets/quotes", () => {
  assert.equal(_sanitizeName("JUNE"), "JUNE");
  assert.equal(_sanitizeName("  JUNE  "), "JUNE");
  assert.equal(_sanitizeName("GUARD 2"), "GUARD 2");
  assert.equal(_sanitizeName("MARY-ANNE"), "MARY-ANNE");
  assert.equal(_sanitizeName("O'BRIEN"), "O'BRIEN");
  assert.equal(_sanitizeName("MR. WHITE"), "MR. WHITE");
  // brackets and quotes collapse to a space, then internal whitespace
  // collapses to a single space.
  assert.equal(_sanitizeName('"JUNE"'), "JUNE");
  assert.equal(_sanitizeName("[JUNE]"), "JUNE");
  // non-strings reject.
  assert.equal(_sanitizeName(null), "");
  assert.equal(_sanitizeName(123), "");
});

test("[T30] sanitizeSource constrains to identifier-friendly characters", () => {
  assert.equal(_sanitizeSource("ios_screenplay_render"), "ios_screenplay_render");
  assert.equal(_sanitizeSource("  io_them  "), "io_them");
  // disallowed chars collapse to underscores.
  assert.equal(_sanitizeSource("dangerous source!"), "dangerous_source_");
  assert.equal(_sanitizeSource(""), "");
});

test("[T30] sanitizeTags drops non-strings, trims, dedupes, caps", () => {
  assert.deepEqual(_sanitizeTags(["a", "b", "a", "  c  "]).sort(), ["a", "b", "c"]);
  assert.deepEqual(_sanitizeTags(["a", 7, null, "b"]), ["a", "b"]);
  assert.deepEqual(_sanitizeTags("not-array"), []);
});

test("[T30] sanitizeMetadata promotes top-level write_id / line and merges explicit metadata", () => {
  const meta = _sanitizeMetadata({
    rawMetadata: { screenplay_project_id: "p1" },
    writeId: "w1",
    line: 7,
    source: "ios_screenplay_render",
  });
  assert.equal(meta.screenplay_write_id, "w1");
  assert.equal(meta.screenplay_project_id, "p1");
  assert.equal(meta.line, 7);
  assert.equal(meta.source, "ios_screenplay_render");
  // explicit metadata.screenplay_write_id wins over top-level write_id.
  const meta2 = _sanitizeMetadata({
    rawMetadata: { screenplay_write_id: "explicit" },
    writeId: "top-level",
    line: null,
    source: "",
  });
  assert.equal(meta2.screenplay_write_id, "explicit");
});
