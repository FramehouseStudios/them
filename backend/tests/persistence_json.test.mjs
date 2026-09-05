// T-persistence-json-tests — direct test coverage for
// backend/lib/persistence_json.js.
//
// This is the JSON-file-backed persistence adapter (one file per
// domain at $root/<domain>.json). Used by every store that needs
// disk persistence in single-process mode. Had zero direct tests
// before this PR — the persistence_adapter.test.mjs covers the
// validator surface, not the JSON file I/O.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  createJsonPersistence,
  JSON_PERSISTENCE_DEFAULT_ROOT,
} from "../lib/persistence_json.js";

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "io-them-pj-test-"));
}

function make() {
  return createJsonPersistence({ jsonRoot: tempRoot() });
}

// ---------- factory shape ----------

test("[persistence-json] createJsonPersistence returns the canonical adapter surface", () => {
  const p = make();
  assert.equal(p.kind, "json");
  assert.equal(typeof p.root, "string");
  for (const k of ["get", "put", "delete", "list", "clear", "close"]) {
    assert.equal(typeof p[k], "function", `${k} should be a method`);
  }
});

test("[persistence-json] default root constant is absolute path under backend/data/persistence", () => {
  assert.ok(path.isAbsolute(JSON_PERSISTENCE_DEFAULT_ROOT));
  assert.ok(JSON_PERSISTENCE_DEFAULT_ROOT.endsWith(path.join("data", "persistence")));
});

test("[persistence-json] creates the root directory at construction time", () => {
  const root = path.join(tempRoot(), "deep", "nested");
  const p = createJsonPersistence({ jsonRoot: root });
  assert.equal(p.root, path.resolve(root));
  assert.ok(fs.existsSync(p.root), "root should exist after construction");
});

// ---------- put + get round-trip ----------

test("[persistence-json] put then get returns the stored value", async () => {
  const p = make();
  await p.put({ domain: "outbox", key: "k1", value: { a: 1 } });
  const got = await p.get({ domain: "outbox", key: "k1" });
  assert.deepEqual(got, { a: 1 });
});

test("[persistence-json] get returns null for unknown key", async () => {
  const p = make();
  const got = await p.get({ domain: "outbox", key: "missing" });
  assert.equal(got, null);
});

test("[persistence-json] put overwrites existing value", async () => {
  const p = make();
  await p.put({ domain: "outbox", key: "k", value: { v: 1 } });
  await p.put({ domain: "outbox", key: "k", value: { v: 2 } });
  const got = await p.get({ domain: "outbox", key: "k" });
  assert.deepEqual(got, { v: 2 });
});

// ---------- delete ----------

test("[persistence-json] delete removes the key", async () => {
  const p = make();
  await p.put({ domain: "outbox", key: "gone", value: { x: 1 } });
  await p.delete({ domain: "outbox", key: "gone" });
  assert.equal(await p.get({ domain: "outbox", key: "gone" }), null);
});

test("[persistence-json] delete is a no-op on unknown key", async () => {
  const p = make();
  await assert.doesNotReject(() =>
    p.delete({ domain: "outbox", key: "never_was" }),
  );
});

// ---------- list ----------

test("[persistence-json] list returns all keys + values for a domain", async () => {
  const p = make();
  await p.put({ domain: "outbox", key: "a", value: 1 });
  await p.put({ domain: "outbox", key: "b", value: 2 });
  await p.put({ domain: "outbox", key: "c", value: 3 });
  const out = await p.list({ domain: "outbox" });
  assert.equal(out.length, 3);
  // Order is alphabetical by key.
  assert.deepEqual(out.map((e) => e.key), ["a", "b", "c"]);
  assert.deepEqual(out.map((e) => e.value), [1, 2, 3]);
});

test("[persistence-json] list honors prefix filter", async () => {
  const p = make();
  await p.put({ domain: "outbox", key: "alpha_1", value: 1 });
  await p.put({ domain: "outbox", key: "alpha_2", value: 2 });
  await p.put({ domain: "outbox", key: "beta", value: 3 });
  const out = await p.list({ domain: "outbox", prefix: "alpha_" });
  assert.equal(out.length, 2);
  assert.deepEqual(out.map((e) => e.key), ["alpha_1", "alpha_2"]);
});

test("[persistence-json] list honors limit (clamped to 1..10000)", async () => {
  const p = make();
  for (let i = 0; i < 5; i++) {
    await p.put({ domain: "outbox", key: `k${i}`, value: i });
  }
  const out = await p.list({ domain: "outbox", limit: 3 });
  assert.equal(out.length, 3);
});

test("[persistence-json] list returns empty array on cold domain", async () => {
  const p = make();
  const out = await p.list({ domain: "outbox" });
  assert.deepEqual(out, []);
});

// ---------- clear ----------

test("[persistence-json] clear empties the domain", async () => {
  const p = make();
  await p.put({ domain: "outbox", key: "a", value: 1 });
  await p.put({ domain: "outbox", key: "b", value: 2 });
  await p.clear({ domain: "outbox" });
  assert.deepEqual(await p.list({ domain: "outbox" }), []);
});

test("[persistence-json] clear leaves other domains untouched", async () => {
  const p = make();
  await p.put({ domain: "outbox", key: "x", value: 1 });
  await p.put({ domain: "user_memory", key: "y", value: 2 });
  await p.clear({ domain: "outbox" });
  assert.deepEqual(await p.list({ domain: "outbox" }), []);
  const remaining = await p.list({ domain: "user_memory" });
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].key, "y");
});

// ---------- domain isolation ----------

test("[persistence-json] put in one domain does not affect another", async () => {
  const p = make();
  await p.put({ domain: "outbox", key: "shared_key", value: "outbox_val" });
  await p.put({ domain: "user_memory", key: "shared_key", value: "memory_val" });
  assert.equal(await p.get({ domain: "outbox", key: "shared_key" }), "outbox_val");
  assert.equal(await p.get({ domain: "user_memory", key: "shared_key" }), "memory_val");
});

// ---------- file durability ----------

test("[persistence-json] put writes a domain.json file on disk", async () => {
  const root = tempRoot();
  const p = createJsonPersistence({ jsonRoot: root });
  await p.put({ domain: "outbox", key: "k", value: { a: 1 } });
  const filePath = path.join(p.root, "outbox.json");
  assert.ok(fs.existsSync(filePath));
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  assert.deepEqual(raw, { k: { a: 1 } });
});

test("[persistence-json] new adapter on same root sees previously-written data (durability)", async () => {
  const root = tempRoot();
  const p1 = createJsonPersistence({ jsonRoot: root });
  await p1.put({ domain: "outbox", key: "persist", value: { v: 42 } });
  const p2 = createJsonPersistence({ jsonRoot: root });
  const got = await p2.get({ domain: "outbox", key: "persist" });
  assert.deepEqual(got, { v: 42 });
});

test("[persistence-json] missing files and valid empty objects remain empty and writable", async () => {
  for (const initialContent of [null, "{}\n"]) {
    const p = make();
    const filePath = path.join(p.root, "creative_memory.json");
    if (initialContent !== null) fs.writeFileSync(filePath, initialContent);
    assert.equal(await p.get({ domain: "creative_memory", key: "writer" }), null);
    assert.deepEqual(await p.list({ domain: "creative_memory" }), []);
    await p.delete({ domain: "creative_memory", key: "writer" });
    if (initialContent === null) assert.equal(fs.existsSync(filePath), false);
    else assert.equal(fs.readFileSync(filePath, "utf8"), initialContent);

    await p.put({ domain: "creative_memory", key: "writer", value: { version: 1 } });
    assert.deepEqual(await p.get({ domain: "creative_memory", key: "writer" }), { version: 1 });
  }
});

for (const [label, damagedContent] of [
  ["empty", ""],
  ["whitespace", " \n\t\r\n"],
  ["truncated", '{"writer":{"version":1'],
  ["null", "null\n"],
  ["array", "[]\n"],
  ["string", '"damaged domain"\n'],
  ["number", "42\n"],
  ["boolean", "false\n"],
]) {
  test(`[persistence-json] ${label} domain damage fails reads and writes without changing bytes, then recovers`, async () => {
    const p = make();
    const domain = "creative_memory";
    const key = "writer";
    const filePath = path.join(p.root, `${domain}.json`);
    const damagedBytes = Buffer.from(damagedContent, "utf8");
    fs.writeFileSync(filePath, damagedBytes);
    const operations = [
      ["get", () => p.get({ domain, key })],
      ["list", () => p.list({ domain })],
      ["put", () => p.put({ domain, key, value: { version: 1 } })],
      ["compareAndSwap", () => p.compareAndSwap({ domain, key, expectedValue: null, value: { version: 1 } })],
      ["delete", () => p.delete({ domain, key })],
    ];
    for (const [operation, run] of operations) {
      await assert.rejects(run, { code: "persistence_read_error" }, operation);
      assert.deepEqual(fs.readFileSync(filePath), damagedBytes, operation);
      assert.deepEqual(fs.readdirSync(p.root), [`${domain}.json`], operation);
    }

    // Repair only this test's damaged file. The same adapter and write queue
    // must recover after the failed writes once valid data is restored.
    fs.writeFileSync(filePath, "{}");
    assert.equal(await p.get({ domain, key }), null);
    assert.deepEqual(await p.list({ domain }), []);
    await p.put({ domain, key, value: { version: 1 } });
    assert.equal(await p.compareAndSwap({
      domain, key, expectedValue: { version: 1 }, value: { version: 2 },
    }), true);
    assert.deepEqual(await p.get({ domain, key }), { version: 2 });
    await p.delete({ domain, key });
    assert.equal(await p.get({ domain, key }), null);
    assert.deepEqual(await p.list({ domain }), []);
  });
}

// ---------- close (parity with postgres adapter) ----------

test("[persistence-json] close is a no-op (parity with Postgres adapter)", async () => {
  const p = make();
  await assert.doesNotReject(() => p.close());
});

// ---------- assertDomain / assertKey integration ----------

test("[persistence-json] put rejects unknown domain via assertDomain", async () => {
  const p = make();
  await assert.rejects(
    () => p.put({ domain: "not_a_domain", key: "k", value: 1 }),
    /unknown domain|domain/i,
  );
});

test("[persistence-json] put rejects empty key via assertKey", async () => {
  const p = make();
  await assert.rejects(
    () => p.put({ domain: "outbox", key: "", value: 1 }),
    /key/i,
  );
});
