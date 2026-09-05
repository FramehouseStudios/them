// T-live-draft-sync — hub + route contract tests.
//
// Deterministic, loopback only. Covers the op/seq/checksum model, the
// per-user channel boundary, SSE fan-out between two devices, resync on a
// stale base, and the mount guards. Runs with `node --test`.

import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";

import {
  MAX_RATE_ENTRIES_PER_CHANNEL,
  applyLiveDraftOp,
  createLiveDraftHub,
  diffLiveDraft,
  liveDraftChecksum,
  normalizeLiveDraftOp,
} from "../lib/live_draft_hub.js";
import {
  LIVE_DRAFT_OPS_BODY_LIMIT,
  mountScreenplayLiveDraftRoutes,
} from "../lib/screenplay_live_draft_routes.js";

// ---------- hub: pure helpers ----------

test("[live-draft] checksum is FNV-1a over UTF-16 units and stable", () => {
  assert.equal(liveDraftChecksum(""), "811c9dc5");
  assert.equal(liveDraftChecksum("a"), "e40c292c");
  assert.equal(liveDraftChecksum("INT. ARCHIVE - NIGHT"), liveDraftChecksum("INT. ARCHIVE - NIGHT"));
  assert.notEqual(liveDraftChecksum("a"), liveDraftChecksum("b"));
  // Surrogate pairs hash by code unit, matching Swift `String.utf16`.
  assert.equal(liveDraftChecksum("🎬"), liveDraftChecksum("🎬"));
});

test("[live-draft] diff/apply round-trips including surrogate pairs", () => {
  const cases = [
    ["", "INT. ROOM - DAY"],
    ["INT. ROOM - DAY", "INT. ROOM - NIGHT"],
    ["hello world", "hello"],
    ["hello", "hello world"],
    ["MARA\nYou said the file was gone.", "MARA\nYou said the reel was gone."],
    ["A 🎬 B", "A 🎬🎥 B"],
    ["A 🎬🎥 B", "A B"],
    ["🎬", "🎥"],
    ["x🎬", "x🎥y"],
  ];
  for (const [from, to] of cases) {
    const op = diffLiveDraft(from, to);
    assert.ok(op, `op for ${JSON.stringify([from, to])}`);
    assert.equal(applyLiveDraftOp(from, op), to);
  }
  assert.equal(diffLiveDraft("same", "same"), null);
  // 🎬 and 🎥 share a high surrogate; the op must still carry whole pairs.
  const op = diffLiveDraft("🎬", "🎥");
  assert.deepEqual(op, { start: 0, delete_count: 2, insert: "🎥" });
});

test("[live-draft] normalizeLiveDraftOp rejects malformed ops", () => {
  assert.equal(normalizeLiveDraftOp(null), null);
  assert.equal(normalizeLiveDraftOp({ start: -1, insert: "" }), null);
  assert.equal(normalizeLiveDraftOp({ start: 1.5, insert: "" }), null);
  assert.equal(normalizeLiveDraftOp({ start: 0, insert: 12 }), null);
  assert.equal(normalizeLiveDraftOp({ start: 0, insert: "abc" }, { maxInsertChars: 2 }), null);
  assert.equal(normalizeLiveDraftOp({ start: 0, insert: "\uD800" }), null, "lone surrogate insert is rejected");
  assert.deepEqual(normalizeLiveDraftOp({ start: 2, deleteCount: 1, insert: "x" }), {
    start: 2,
    delete_count: 1,
    insert: "x",
  });
  assert.equal(applyLiveDraftOp("abc", { start: 2, delete_count: 5, insert: "" }), null);
  assert.equal(applyLiveDraftOp("🎬", { start: 1, delete_count: 0, insert: "x" }), null, "insert cannot split a surrogate pair");
  assert.equal(applyLiveDraftOp("🎬", { start: 0, delete_count: 1, insert: "" }), null, "delete cannot split a surrogate pair");
  assert.equal(applyLiveDraftOp("🎬", { start: 0, delete_count: 2, insert: "🎥" }), "🎥");
});

// ---------- hub: channel semantics ----------

function makeHub(overrides = {}) {
  let t = 1_000;
  const hub = createLiveDraftHub({ now: () => t, ...overrides });
  return { hub, advance: (ms) => { t += ms; } };
}

test("[live-draft] applyOp bumps seq, rejects stale base + checksum drift", () => {
  const { hub } = makeHub();
  const key = hub.channelKey("user-1", "proj-1");
  hub.ensure(key, { seedText: "INT. ROOM - DAY", seedVersionId: "v1" });
  const first = hub.applyOp(key, {
    deviceId: "mac",
    baseSeq: 0,
    baseChecksum: liveDraftChecksum("INT. ROOM - DAY"),
    op: { start: 15, delete_count: 0, insert: "\n\nMara enters." },
  });
  assert.equal(first.ok, true);
  assert.equal(first.seq, 1);
  assert.equal(first.checksum, liveDraftChecksum("INT. ROOM - DAY\n\nMara enters."));

  const stale = hub.applyOp(key, {
    deviceId: "phone",
    baseSeq: 0,
    op: { start: 0, delete_count: 0, insert: "x" },
  });
  assert.equal(stale.ok, false);
  assert.equal(stale.reason, "stale_base");
  assert.equal(stale.seq, 1);
  assert.equal(stale.text, "INT. ROOM - DAY\n\nMara enters.");

  const drift = hub.applyOp(key, {
    deviceId: "phone",
    baseSeq: 1,
    baseChecksum: "deadbeef",
    op: { start: 0, delete_count: 0, insert: "x" },
  });
  assert.equal(drift.ok, false);
  assert.equal(drift.reason, "checksum_mismatch");

  const wrongAfter = hub.applyOp(key, {
    deviceId: "phone",
    baseSeq: 1,
    op: { start: 0, delete_count: 0, insert: "x" },
    checksum: "00000000",
  });
  assert.equal(wrongAfter.ok, false);
  assert.equal(wrongAfter.reason, "checksum_mismatch");
  assert.equal(hub.snapshot(key).seq, 1, "rejected ops never mutate the channel");

  const bad = hub.applyOp(key, { deviceId: "phone", baseSeq: 1, op: { start: 999, insert: "" } });
  assert.equal(bad.ok, false);
  assert.equal(bad.reason, "bad_op");
  assert.equal(hub.applyOp(key, { deviceId: "", baseSeq: 1, op: { start: 0, insert: "" } }).reason, "device_id_required");
});

test("[live-draft] replaceText + announceVersion follow the mirror", () => {
  const { hub } = makeHub();
  const key = hub.channelKey("user-1", "proj-1");
  hub.ensure(key, { seedText: "old" });
  const replaced = hub.replaceText(key, { deviceId: "mac", text: "new text", versionId: "v9" });
  assert.equal(replaced.ok, true);
  assert.equal(replaced.seq, 1);
  assert.equal(hub.snapshot(key).version_id, "v9");
  const same = hub.replaceText(key, { deviceId: "mac", text: "new text" });
  assert.equal(same.unchanged, true);
  assert.equal(same.seq, 1, "identical snapshot does not bump seq");
  const malformed = hub.replaceText(key, { deviceId: "mac", text: "\uD800" });
  assert.equal(malformed.ok, false);
  assert.equal(malformed.reason, "bad_text");
  assert.equal(hub.snapshot(key).text, "new text", "malformed snapshot never mutates the channel");

  const staleVersion = hub.announceVersion(key, { deviceId: "mac", versionId: "v10", checksum: "deadbeef" });
  assert.equal(staleVersion.ok, false);
  assert.equal(staleVersion.reason, "checksum_mismatch");
  const ok = hub.announceVersion(key, { deviceId: "mac", versionId: "v10", checksum: liveDraftChecksum("new text") });
  assert.equal(ok.ok, true);
  assert.equal(hub.snapshot(key).version_id, "v10");
  assert.equal(hub.announceVersion(key, { deviceId: "mac", versionId: "" }).reason, "version_id_required");
});

test("[live-draft] channel seeds preserve complete UTF-16 characters", () => {
  const { hub } = makeHub({ maxTextChars: 2 });
  const safeKey = hub.channelKey("user-1", "safe");
  assert.ok(hub.ensure(safeKey, { seedText: "A🎬" }));
  assert.equal(hub.snapshot(safeKey).text, "A", "size truncation backs off before a surrogate pair");
  const malformedKey = hub.channelKey("user-1", "malformed");
  assert.equal(hub.ensure(malformedKey, { seedText: "\uD800" }), null);
  assert.equal(hub.has(malformedKey), false);
});

test("[live-draft] subscribers receive ops, presence, and bye; cap enforced", () => {
  const { hub } = makeHub({ maxSubscribersPerChannel: 2 });
  const key = hub.channelKey("user-1", "proj-1");
  hub.ensure(key, { seedText: "" });
  const macEvents = [];
  const phoneEvents = [];
  const unsubMac = hub.subscribe(key, { deviceId: "mac", send: (e) => macEvents.push(e) });
  const unsubPhone = hub.subscribe(key, { deviceId: "phone", send: (e) => phoneEvents.push(e) });
  assert.equal(hub.subscribe(key, { deviceId: "ipad", send: () => {} }), null, "third subscriber is refused");
  assert.deepEqual(hub.presence(key).devices, ["mac", "phone"]);

  hub.applyOp(key, { deviceId: "mac", baseSeq: 0, op: { start: 0, delete_count: 0, insert: "H" } });
  const macOp = macEvents.find((e) => e.type === "op");
  const phoneOp = phoneEvents.find((e) => e.type === "op");
  assert.ok(macOp && phoneOp, "both devices see the op; the client drops its own by device_id");
  assert.equal(phoneOp.device_id, "mac");
  assert.equal(phoneOp.seq, 1);

  unsubMac();
  unsubMac();
  assert.deepEqual(hub.presence(key).devices, ["phone"]);
  assert.equal(hub.closeAll(), 1);
  assert.equal(phoneEvents.at(-1).type, "bye");
  unsubPhone();
  assert.equal(hub.stats().channels, 0);
});

test("[live-draft] sweep drops idle channels; LRU eviction skips live ones", () => {
  const { hub, advance } = makeHub({ idleTtlMs: 1_000, maxChannels: 2 });
  const a = hub.channelKey("user-1", "a");
  const b = hub.channelKey("user-1", "b");
  const c = hub.channelKey("user-1", "c");
  hub.ensure(a, { seedText: "" });
  const unsub = hub.subscribe(a, { deviceId: "mac", send: () => {} });
  hub.ensure(b, { seedText: "" });
  hub.ensure(c, { seedText: "" });
  assert.equal(hub.has(a), true, "subscribed channel survives eviction");
  assert.equal(hub.has(b), false, "coldest unsubscribed channel is evicted");
  assert.equal(hub.has(c), true);
  advance(2_000);
  assert.equal(hub.sweep(), 1);
  assert.equal(hub.has(c), false);
  assert.equal(hub.has(a), true, "channels with subscribers are never swept");
  unsub();
  advance(2_000);
  assert.equal(hub.sweep(), 1);
});

test("[live-draft] per-device op rate limit", () => {
  const { hub, advance } = makeHub({ maxOpsPerSecondPerDevice: 2 });
  const key = hub.channelKey("user-1", "proj-1");
  hub.ensure(key, { seedText: "" });
  const op = (seq) => hub.applyOp(key, { deviceId: "mac", baseSeq: seq, op: { start: 0, delete_count: 0, insert: "x" } });
  assert.equal(op(0).ok, true);
  assert.equal(op(1).ok, true);
  assert.equal(op(2).reason, "rate_limited");
  advance(1_000);
  assert.equal(op(2).ok, true);
});

test("[live-draft] rate-limit entries per channel are capped across device ids", () => {
  const { hub } = makeHub();
  const key = hub.channelKey("user-1", "proj-1");
  hub.ensure(key, { seedText: "" });
  for (let i = 0; i < MAX_RATE_ENTRIES_PER_CHANNEL * 3; i += 1) {
    const result = hub.applyOp(key, { deviceId: `dev-${i}`, baseSeq: i, op: { start: 0, delete_count: 0, insert: "x" } });
    assert.equal(result.ok, true);
  }
  assert.equal(hub.snapshot(key).seq, MAX_RATE_ENTRIES_PER_CHANNEL * 3);
});

test("[live-draft] channel keys never collide across users", () => {
  const { hub } = makeHub();
  assert.notEqual(hub.channelKey("u1", "p1"), hub.channelKey("u2", "p1"));
  assert.equal(hub.channelKey("", "p1"), "");
  assert.equal(hub.channelKey("u1", ""), "");
});

// ---------- routes ----------

function makeStore() {
  const owners = new Map([
    ["user-1", {
      ownerKey: "user-1",
      projects: [{
        id: "proj-1",
        activeVersionId: "v1",
        versions: [{ id: "v1", draft: "INT. ROOM - DAY\n\nMara waits.", updatedAt: 10 }],
      }, {
        // The writer restored v1 as active after v2 was written: the channel
        // must mirror what they see, not the newest by timestamp.
        id: "proj-restored",
        activeVersionId: "v1",
        versions: [
          { id: "v2", draft: "NEWER BUT NOT ACTIVE", updatedAt: 20 },
          { id: "v1", draft: "ACTIVE OLDER", updatedAt: 10 },
        ],
      }],
    }],
    ["user-2", { ownerKey: "user-2", projects: [{ id: "proj-2", activeVersionId: "", versions: [] }] }],
  ]);
  return owners;
}

function defaultDeps(overrides = {}) {
  const owners = makeStore();
  return {
    hub: createLiveDraftHub(),
    getOrCreateScreenplayOwnerRecord: (req) => owners.get(String(req.authUser?.id || "")) || null,
    getScreenplayProjectRecord: (owner, id) => owner?.projects?.find((p) => p.id === id) || null,
    getLatestScreenplayVersion: (project) => project?.versions?.[0] || null,
    normalizeSnippet: (v, max) => String(v ?? "").trim().slice(0, max),
    createRequestId: () => "rid_live_test",
    heartbeatMs: 1_000,
    ...overrides,
  };
}

async function withServer(deps, fn) {
  const app = express();
  // Test-only identity injection standing in for protectUserRoutes.
  app.use((req, _res, next) => {
    const id = String(req.get("x-test-user") || "").trim();
    if (id) req.authUser = { id };
    next();
  });
  mountScreenplayLiveDraftRoutes(app, deps);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const baseURL = `http://127.0.0.1:${server.address().port}`;
  const controllers = [];
  try {
    await fn({ baseURL, controllers });
  } finally {
    for (const c of controllers) c.abort();
    server.closeAllConnections?.();
    await new Promise((r) => server.close(r));
  }
}

async function postJson(baseURL, path, body, user = "user-1") {
  const r = await fetch(`${baseURL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(user ? { "x-test-user": user } : {}) },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => null) };
}

async function getJson(baseURL, path, user = "user-1") {
  const r = await fetch(`${baseURL}${path}`, { headers: user ? { "x-test-user": user } : {} });
  return { status: r.status, body: await r.json().catch(() => null) };
}

// Opens an SSE stream and returns { events, next(type) } where next resolves
// the first event of that type that arrives (or already arrived).
async function openStream({ baseURL, controllers }, path, user = "user-1") {
  const controller = new AbortController();
  controllers.push(controller);
  const r = await fetch(`${baseURL}${path}`, {
    headers: user ? { "x-test-user": user } : {},
    signal: controller.signal,
  });
  const events = [];
  const waiters = [];
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buffer.indexOf("\n\n")) >= 0) {
          const frame = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          let type = "message";
          let data = "";
          for (const line of frame.split("\n")) {
            if (line.startsWith("event:")) type = line.slice(6).trim();
            else if (line.startsWith("data:")) data += line.slice(5).trim();
          }
          if (!data) continue;
          const event = { type, ...JSON.parse(data) };
          events.push(event);
          for (const waiter of [...waiters]) {
            if (waiter.type === event.type) {
              waiters.splice(waiters.indexOf(waiter), 1);
              waiter.resolve(event);
            }
          }
        }
      }
    } catch (_error) {
      // aborted by the test teardown
    }
  })();
  return {
    status: r.status,
    headers: r.headers,
    events,
    next(type, { where = () => true, timeoutMs = 2_000 } = {}) {
      const existing = events.find((e) => e.type === type && !e._consumed && where(e));
      if (existing) {
        existing._consumed = true;
        return Promise.resolve(existing);
      }
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`timeout waiting for ${type}`)), timeoutMs);
        const waiter = {
          type,
          resolve: (e) => {
            if (!where(e)) {
              waiters.push(waiter);
              return;
            }
            clearTimeout(timer);
            e._consumed = true;
            resolve(e);
          },
        };
        waiters.push(waiter);
      });
    },
  };
}

test("[live-draft] mount guards", () => {
  assert.equal(LIVE_DRAFT_OPS_BODY_LIMIT, "512kb");
  assert.throws(() => mountScreenplayLiveDraftRoutes(null, defaultDeps()));
  for (const key of ["hub", "getOrCreateScreenplayOwnerRecord", "getScreenplayProjectRecord", "getLatestScreenplayVersion", "normalizeSnippet", "createRequestId"]) {
    const deps = defaultDeps();
    deps[key] = undefined;
    assert.throws(() => mountScreenplayLiveDraftRoutes(express(), deps), new RegExp(key));
  }
});

test("[live-draft] identity boundary: 401 without user, 404 for another user's project", async () => {
  await withServer(defaultDeps(), async ({ baseURL }) => {
    const anon = await getJson(baseURL, "/screenplay/projects/proj-1/live/snapshot", "");
    assert.equal(anon.status, 401);
    assert.equal(anon.body.error, "user_auth_required");
    const cross = await getJson(baseURL, "/screenplay/projects/proj-1/live/snapshot", "user-2");
    assert.equal(cross.status, 404);
    assert.equal(cross.body.error, "project_not_found");
    const anonPost = await postJson(baseURL, "/screenplay/projects/proj-1/live/ops", { device_id: "x" }, "");
    assert.equal(anonPost.status, 401);
  });
});

test("[live-draft] stream requires a device id before opening SSE", async () => {
  await withServer(defaultDeps(), async ({ baseURL }) => {
    const missingDevice = await getJson(baseURL, "/screenplay/projects/proj-1/live/stream");
    assert.equal(missingDevice.status, 400);
    assert.equal(missingDevice.body.error, "device_id_required");
  });
});

test("[live-draft] snapshot seeds from the active version, else the latest", async () => {
  await withServer(defaultDeps(), async ({ baseURL }) => {
    const r = await getJson(baseURL, "/screenplay/projects/proj-1/live/snapshot");
    assert.equal(r.status, 200);
    assert.equal(r.body.seq, 0);
    assert.equal(r.body.text, "INT. ROOM - DAY\n\nMara waits.");
    assert.equal(r.body.version_id, "v1");
    assert.equal(r.body.seeded, true);
    assert.equal(r.body.checksum, liveDraftChecksum("INT. ROOM - DAY\n\nMara waits."));
    const restored = await getJson(baseURL, "/screenplay/projects/proj-restored/live/snapshot");
    assert.equal(restored.body.text, "ACTIVE OLDER");
    assert.equal(restored.body.version_id, "v1");
  });
});

test("[live-draft] owner record is refreshed from persistence; refresh failure is 503", async () => {
  const owners = makeStore();
  const refreshes = [];
  const deps = defaultDeps({
    getOrCreateScreenplayOwnerRecord: (req) => owners.get(String(req.authUser?.id || "")) || null,
    refreshScreenplayOwnerRecord: async (ownerKey) => {
      refreshes.push(ownerKey);
      if (ownerKey === "user-2") return { ok: false, persistenceKind: "postgres" };
      return { ok: true, owner: owners.get(ownerKey) };
    },
  });
  await withServer(deps, async ({ baseURL }) => {
    const ok = await getJson(baseURL, "/screenplay/projects/proj-1/live/snapshot");
    assert.equal(ok.status, 200);
    assert.deepEqual(refreshes, ["user-1"]);
    const failed = await getJson(baseURL, "/screenplay/projects/proj-2/live/snapshot", "user-2");
    assert.equal(failed.status, 503);
    assert.equal(failed.body.error, "screenplay_persistence_failed");
    assert.equal(failed.body.persistence, "postgres");
  });
});

test("[live-draft] desktop keystrokes fan out to the phone stream", async () => {
  await withServer(defaultDeps(), async (ctx) => {
    const { baseURL } = ctx;
    const phone = await openStream(ctx, "/screenplay/projects/proj-1/live/stream?device_id=phone");
    assert.equal(phone.status, 200);
    assert.equal(phone.headers.get("content-type"), "text/event-stream");
    const hello = await phone.next("hello");
    assert.equal(hello.seq, 0);
    assert.equal(hello.text, "INT. ROOM - DAY\n\nMara waits.");
    assert.equal(hello.device_id, "phone");

    const mac = await openStream(ctx, `/screenplay/projects/proj-1/live/stream?device_id=mac&checksum=${hello.checksum}`);
    const macHello = await mac.next("hello");
    assert.equal(macHello.text, undefined, "matching checksum skips the text payload");
    const presence = await phone.next("presence", { where: (e) => e.devices.includes("mac") });
    assert.deepEqual([...presence.devices].sort(), ["mac", "phone"]);

    let text = hello.text;
    let seq = 0;
    for (const keystroke of [" ", "S", "h", "e"]) {
      const next = text + keystroke;
      const op = diffLiveDraft(text, next);
      const r = await postJson(baseURL, "/screenplay/projects/proj-1/live/ops", {
        device_id: "mac",
        base_seq: seq,
        base_checksum: liveDraftChecksum(text),
        op,
        checksum: liveDraftChecksum(next),
        cursor: next.length,
      });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.status, "applied");
      seq = r.body.seq;
      text = next;
      const received = await phone.next("op");
      assert.equal(received.device_id, "mac");
      assert.equal(received.seq, seq);
      assert.deepEqual(received.op, op);
      assert.equal(received.checksum, liveDraftChecksum(text));
      assert.equal(received.cursor, next.length);
    }
    assert.equal(text, "INT. ROOM - DAY\n\nMara waits. She");
    const macEcho = await mac.next("op");
    assert.equal(macEcho.device_id, "mac", "sender also sees its op and filters it client-side");
  });
});

test("[live-draft] stale base returns 409 with the full mirror for resync", async () => {
  await withServer(defaultDeps(), async ({ baseURL }) => {
    const first = await postJson(baseURL, "/screenplay/projects/proj-1/live/ops", {
      device_id: "mac",
      base_seq: 0,
      op: { start: 0, delete_count: 0, insert: "FADE IN:\n\n" },
    });
    assert.equal(first.status, 200);
    const stale = await postJson(baseURL, "/screenplay/projects/proj-1/live/ops", {
      device_id: "phone",
      base_seq: 0,
      op: { start: 0, delete_count: 0, insert: "x" },
    });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.error, "stale_base");
    assert.equal(stale.body.seq, 1);
    assert.equal(stale.body.text, "FADE IN:\n\nINT. ROOM - DAY\n\nMara waits.");
    assert.equal(stale.body.checksum, liveDraftChecksum(stale.body.text));

    const missingDevice = await postJson(baseURL, "/screenplay/projects/proj-1/live/ops", { base_seq: 1, op: { start: 0, insert: "" } });
    assert.equal(missingDevice.status, 400);
    assert.equal(missingDevice.body.error, "device_id_required");
    const badOp = await postJson(baseURL, "/screenplay/projects/proj-1/live/ops", { device_id: "phone", base_seq: 1, op: { start: 10_000, insert: "" } });
    assert.equal(badOp.status, 400);
    assert.equal(badOp.body.error, "bad_op");
    assert.equal(badOp.body.text, undefined, "non-conflict rejections stay small");
  });
});

test("[live-draft] rate limit surfaces as 429", async () => {
  const deps = defaultDeps({ hub: createLiveDraftHub({ maxOpsPerSecondPerDevice: 1 }) });
  await withServer(deps, async ({ baseURL }) => {
    const ok = await postJson(baseURL, "/screenplay/projects/proj-1/live/ops", { device_id: "mac", base_seq: 0, op: { start: 0, insert: "a" } });
    assert.equal(ok.status, 200);
    const limited = await postJson(baseURL, "/screenplay/projects/proj-1/live/ops", { device_id: "mac", base_seq: 1, op: { start: 0, insert: "b" } });
    assert.equal(limited.status, 429);
    assert.equal(limited.body.error, "rate_limited");
  });
});

test("[live-draft] snapshot push and version announce fan out", async () => {
  await withServer(defaultDeps(), async (ctx) => {
    const { baseURL } = ctx;
    const phone = await openStream(ctx, "/screenplay/projects/proj-1/live/stream?device_id=phone");
    await phone.next("hello");

    const badSnapshot = await postJson(baseURL, "/screenplay/projects/proj-1/live/snapshot", { device_id: "mac" });
    assert.equal(badSnapshot.status, 400);
    assert.equal(badSnapshot.body.error, "text_required");

    const pushed = await postJson(baseURL, "/screenplay/projects/proj-1/live/snapshot", {
      device_id: "mac",
      text: "INT. ROOM - DAY\r\n\r\nMara waits.\r\n\r\nShe leaves.",
    });
    assert.equal(pushed.status, 200);
    assert.equal(pushed.body.status, "replaced");
    const snapshotEvent = await phone.next("snapshot");
    assert.equal(snapshotEvent.text, "INT. ROOM - DAY\n\nMara waits.\n\nShe leaves.");
    assert.equal(snapshotEvent.device_id, "mac");

    const staleVersion = await postJson(baseURL, "/screenplay/projects/proj-1/live/version", {
      device_id: "mac", version_id: "v2", checksum: "00000000",
    });
    assert.equal(staleVersion.status, 409);
    const announced = await postJson(baseURL, "/screenplay/projects/proj-1/live/version", {
      device_id: "mac", version_id: "v2", checksum: pushed.body.checksum,
    });
    assert.equal(announced.status, 200);
    assert.equal(announced.body.version_id, "v2");
    const versionEvent = await phone.next("version");
    assert.equal(versionEvent.version_id, "v2");
    assert.equal(versionEvent.checksum, pushed.body.checksum);

    const snap = await getJson(baseURL, "/screenplay/projects/proj-1/live/snapshot");
    assert.equal(snap.body.version_id, "v2");
    assert.equal(snap.body.seeded, false);
  });
});

test("[live-draft] closing the stream releases presence; bye ends streams on shutdown", async () => {
  const hub = createLiveDraftHub();
  await withServer(defaultDeps({ hub }), async (ctx) => {
    const key = hub.channelKey("user-1", "proj-1");
    const phone = await openStream(ctx, "/screenplay/projects/proj-1/live/stream?device_id=phone");
    await phone.next("hello");
    const mac = await openStream(ctx, "/screenplay/projects/proj-1/live/stream?device_id=mac");
    await mac.next("hello");
    assert.equal(hub.stats().subscribers, 2);
    ctx.controllers.pop().abort();
    for (let i = 0; i < 40 && hub.presence(key).devices.length > 1; i += 1) {
      await new Promise((r) => setTimeout(r, 25));
    }
    assert.deepEqual(hub.presence(key).devices, ["phone"]);
    hub.closeAll();
    const bye = await phone.next("bye");
    assert.equal(bye.type, "bye");
  });
});
