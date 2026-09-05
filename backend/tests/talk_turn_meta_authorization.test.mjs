import assert from "node:assert/strict";
import { once } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { apiRequest } from "./helpers/backend_test_server.mjs";

test("[talk-turn-meta] real HTTP authorization preserves canonical owner and legacy boundaries", async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-turn-meta-auth-"));
  const env = {
    RUN_SERVER: "0",
    NODE_ENV: "test",
    APP_TOKEN: "turn-meta-test-app-token",
    REQUIRE_APP_TOKEN: "1",
    // Exercise permitted legacy anonymous reads as well as real signed users.
    REQUIRE_USER_AUTH: "0",
    JWT_SECRET: "turn-meta-test-jwt-secret",
    OPENAI_API_KEY: "",
    REALTIME_PROVIDER: "stub",
    DATABASE_URL: "",
    SCALE_POSTGRES_URL: "",
    REDIS_URL: "",
    SCALE_REDIS_URL: "",
    SCALE_BACKPLANE_ENABLED: "0",
    SCALE_BACKPLANE_SYNC_BOOT_MS: "600000",
    OUTBOX_WORKER_ENABLED: "0",
    OUTBOX_SNAPSHOT_ENABLED: "0",
    SESSION_THREAD_SUMMARIZER_ENABLED: "0",
    ACTIVE_THEME_LLM_ENABLED: "0",
    CLEMENTINE_MUSE_ENABLED: "0",
    TALK_TURN_META_TTL_MS: String(30 * 60 * 1000),
    TALK_TURN_META_MAX_ENTRIES: "4000",
    PERSISTENCE_JSON_ROOT: path.join(dataDir, "persistence"),
    BACKEND_SQLITE_PATH: path.join(dataDir, "backend.sqlite"),
  };
  for (const key of [
    "USER_STORE_PATH", "USER_MEMORY_STORE_PATH", "SCREENPLAY_STORE_PATH",
    "OUTBOX_STORE_PATH", "ASSISTANT_IDENTITY_STORE_PATH",
  ]) env[key] = path.join(dataDir, `${key.toLowerCase()}.json`);
  const previousEnv = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
  Object.assign(process.env, env);
  let httpServer;
  t.after(async () => {
    try {
      if (httpServer) {
        const closed = new Promise((resolve, reject) => httpServer.close((error) => error ? reject(error) : resolve()));
        httpServer.closeAllConnections();
        await closed;
      }
    } finally {
      for (const [key, value] of Object.entries(previousEnv)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });

  // The real store, reader, mounted routes and auth middleware—not a stubbed
  // canReadTalkTurnMeta callback. Importing with RUN_SERVER=0 avoids fixed ports.
  const { storeTalkTurnMeta, readTalkTurnMeta } = await import("../index.js");
  const { app } = await import("../app.js");
  httpServer = app.listen(0, "127.0.0.1");
  await once(httpServer, "listening");
  const server = { baseUrl: `http://127.0.0.1:${httpServer.address().port}`, env };
  async function signup(name) {
    const result = await apiRequest(server, "/auth/signup", {
      method: "POST",
      json: { email: `${name}@example.test`, password: "Turn-meta-test-password-123!" },
    });
    assert.equal(result.status, 201, result.text);
    assert.ok(result.json?.access_token);
    assert.ok(result.json?.user?.user_id);
    return { id: result.json.user.user_id, token: result.json.access_token };
  }
  const alice = await signup("turn-meta-alice");
  const bob = await signup("turn-meta-bob");
  const sharedToken = "same-device-client-token-123456";
  const differentToken = "different-device-client-token-123456";
  const privateReply = "Alice's private screenplay reply.";
  const auth = (user, token = sharedToken) => ({
    Authorization: `Bearer ${user.token}`, "X-Client-Token": token,
  });
  function seed(turnId, { userId = alice.id, sessionId = sharedToken } = {}) {
    storeTalkTurnMeta({ turnId, userId, sessionId, transcript: "Private writer input.", reply: privateReply });
    return `/talk/turn/${turnId}`;
  }
  const owned = seed("owned-token-turn");

  await t.test("same authenticated owner reads from another device without the old session token", async () => {
    const result = await apiRequest(server, owned, { headers: auth(alice, differentToken) });
    assert.equal(result.status, 200, result.text);
    assert.equal(result.json.reply, privateReply);
  });
  await t.test("store and reader retain exactly one canonical owner prefix", () => {
    const first = readTalkTurnMeta("owned-token-turn");
    const second = readTalkTurnMeta("owned-token-turn");
    assert.equal(first.userId, `user:${alice.id}`);
    assert.equal(second.userId, first.userId);
  });
  await t.test("another authenticated owner cannot reuse the same device token on the same IP", async () => {
    const result = await apiRequest(server, owned, { headers: auth(bob) });
    assert.equal(result.status, 403, "An account mismatch must not fall through to a matching session token.");
    assert.deepEqual(result.json, { error: "forbidden" });
    assert.ok(!result.text.includes(privateReply));
  });
  await t.test("known ownership cannot be bypassed by an IP-session collision or absent session", async () => {
    for (const [turnId, sessionId] of [
      ["owned-ip-session", `ip:authuser:${bob.id}`],
      ["owned-loopback-session", "ip:loopback"],
      ["owned-no-session", ""],
    ]) {
      const url = seed(turnId, { sessionId });
      for (const headers of [auth(bob), { Authorization: `Bearer ${bob.token}` }]) {
        const result = await apiRequest(server, url, { headers });
        assert.equal(result.status, 403, `${turnId}: ${result.text}`);
      }
    }
  });
  await t.test("anonymous callers and spoofed user headers cannot read known-owner metadata", async () => {
    const result = await apiRequest(server, owned, {
      headers: { "X-Client-Token": sharedToken, "X-User-Id": alice.id },
    });
    assert.equal(result.status, 403, result.text);
  });
  await t.test("ownerless legacy token reads retain their existing allow and deny cases", async () => {
    const url = seed("legacy-token-turn", { userId: "" });
    const allowed = await apiRequest(server, url, { headers: { "X-Client-Token": sharedToken } });
    assert.equal(allowed.status, 200, allowed.text);
    for (const headers of [{}, { "X-Client-Token": differentToken }]) {
      assert.equal((await apiRequest(server, url, { headers })).status, 403);
    }
  });
  await t.test("ownerless legacy IP reads retain their existing allow and deny cases", async () => {
    const url = seed("legacy-ip-turn", { userId: "", sessionId: "ip:loopback" });
    assert.equal((await apiRequest(server, url)).status, 200);
    const otherIp = await apiRequest(server, url, { headers: { "X-Forwarded-For": "192.0.2.99" } });
    assert.equal(otherIp.status, 403, otherIp.text);
    const ownerless = seed("legacy-unscoped-turn", { userId: "", sessionId: "" });
    assert.equal((await apiRequest(server, ownerless)).status, 200);
  });
  await t.test("real authenticated realtime commits store their owner despite spoofed payload/header IDs", async () => {
    const committed = await apiRequest(server, "/realtime/turn_commit", {
      method: "POST",
      headers: { ...auth(alice), "X-User-Id": bob.id },
      json: { transcript: "Keep this private.", reply: privateReply, user_id: bob.id, request_id: "owned-realtime-commit" },
    });
    assert.equal(committed.status, 201, committed.text);
    const turnId = committed.headers.get("x-turn-id");
    assert.ok(turnId);
    assert.equal(readTalkTurnMeta(turnId).userId, `user:${alice.id}`);
    const url = `/talk/turn/${turnId}`;
    assert.equal((await apiRequest(server, url, { headers: auth(alice, differentToken) })).status, 200);
    const sessionId = committed.headers.get("x-session-id");
    assert.ok(sessionId);
    const denied = await apiRequest(server, url, { headers: auth(bob, sessionId) });
    assert.equal(denied.status, 403, "Knowing the committed session ID cannot authorize another account.");
  });
  await t.test("two real accounts retain their own turn-1 after both commit from the same device", async () => {
    const before = await apiRequest(server, "/talk/stats", { headers: auth(alice) });
    const committed = await apiRequest(server, "/realtime/turn_commit", {
      method: "POST", headers: auth(bob),
      json: { transcript: "Bob's private input.", reply: "Bob's private reply.", request_id: "bob-first-commit" },
    });
    assert.equal(committed.status, 201, committed.text);
    assert.equal(committed.headers.get("x-turn-id"), "turn-1", "Public turn IDs must stay unchanged.");
    const aliceTurn = await apiRequest(server, "/talk/turn/turn-1", { headers: auth(alice, differentToken) });
    const bobTurn = await apiRequest(server, "/talk/turn/turn-1", { headers: auth(bob) });
    assert.equal(aliceTurn.status, 200, aliceTurn.text);
    assert.equal(bobTurn.status, 200, bobTurn.text);
    assert.equal(aliceTurn.json.reply, privateReply);
    assert.equal(bobTurn.json.reply, "Bob's private reply.");
    assert.equal(aliceTurn.json.turn_id, "turn-1");
    assert.equal(bobTurn.json.turn_id, "turn-1");
    const after = await apiRequest(server, "/talk/stats", { headers: auth(alice) });
    assert.equal(after.json.total, before.json.total + 1);
    assert.equal(after.json.uniqueUserCount, 2);
    assert.ok(!after.text.includes(privateReply) && !after.text.includes("Bob's private reply."));
    assert.equal(readTalkTurnMeta("turn-1", Date.now()), null,
      "An internal read without owner context must not arbitrarily select between owners.");
    assert.equal(readTalkTurnMeta("turn-1", Date.now(), { userId: bob.id }).reply, "Bob's private reply.");
    assert.equal(readTalkTurnMeta("turn-1", Date.now(), {
      authUser: { id: alice.id }, userId: bob.id,
    }).reply, privateReply, "Canonical authenticated ownership takes precedence over the server fallback.");
  });
  await t.test("same-owner replacement changes only that owner's metadata", async () => {
    storeTalkTurnMeta({ turnId: "turn-1", userId: alice.id, sessionId: differentToken, reply: "Alice's updated reply." });
    const aliceTurn = await apiRequest(server, "/talk/turn/turn-1", { headers: auth(alice) });
    const bobTurn = await apiRequest(server, "/talk/turn/turn-1", { headers: auth(bob) });
    assert.equal(aliceTurn.status, 200, aliceTurn.text);
    assert.equal(aliceTurn.json.reply, "Alice's updated reply.");
    assert.equal(bobTurn.status, 200, bobTurn.text);
    assert.equal(bobTurn.json.reply, "Bob's private reply.");
  });
  await t.test("an ownerless collision keeps its legacy bucket without shadowing authenticated owners", async () => {
    storeTalkTurnMeta({ turnId: "turn-1", sessionId: sharedToken, reply: "Legacy device reply." });
    const legacy = await apiRequest(server, "/talk/turn/turn-1", { headers: { "X-Client-Token": sharedToken } });
    assert.equal(legacy.status, 200, legacy.text);
    assert.equal(legacy.json.reply, "Legacy device reply.");
    assert.equal(legacy.json.user_id, null);
    assert.equal((await apiRequest(server, "/talk/turn/turn-1", { headers: auth(alice) })).json.reply, "Alice's updated reply.");
    assert.equal((await apiRequest(server, "/talk/turn/turn-1", { headers: auth(bob) })).json.reply, "Bob's private reply.");
    const denied = await apiRequest(server, "/talk/turn/turn-1", { headers: { "X-Client-Token": differentToken } });
    assert.equal(denied.status, 403, denied.text);
    // Preserve the pre-existing single ownerless bucket, not a new session store.
    storeTalkTurnMeta({ turnId: "turn-1", sessionId: differentToken, reply: "Replacement legacy reply." });
    assert.equal((await apiRequest(server, "/talk/turn/turn-1", { headers: { "X-Client-Token": sharedToken } })).status, 403);
    assert.equal((await apiRequest(server, "/talk/turn/turn-1", { headers: { "X-Client-Token": differentToken } })).json.reply, "Replacement legacy reply.");
    assert.equal((await apiRequest(server, "/talk/turn/turn-1", { headers: auth(bob) })).json.reply, "Bob's private reply.");
  });
  await t.test("inaccessible existing turns stay 403 and absent turns stay 404", async () => {
    const unavailable = seed("alice-exclusive-turn");
    const denied = await apiRequest(server, unavailable, { headers: auth(bob) });
    assert.equal(denied.status, 403);
    assert.deepEqual(denied.json, { error: "forbidden" });
    const missing = await apiRequest(server, "/talk/turn/no-such-turn", { headers: auth(bob) });
    assert.equal(missing.status, 404);
    assert.deepEqual(missing.json, { error: "turn_not_found" });
  });
  await t.test("accepted legacy auth IDs remain distinct despite display-owner normalization collisions", async () => {
    const { createJsonPersistence } = await import("../lib/persistence_json.js");
    const { loadUserStoreFromAdapter } = await import("../lib/user_store.js");
    const persistence = createJsonPersistence({ jsonRoot: env.PERSISTENCE_JSON_ROOT });
    const template = await persistence.get({ domain: "auth_users", key: alice.id });
    assert.ok(template?.password, "Use genuine canonical password records, not forged auth context.");
    const cases = [
      ["WriterCase", "writercase", "user:writercase"],
      ["writer+legacy", "writer legacy", "user:writer-legacy"],
      ["x".repeat(96) + "a", "x".repeat(96) + "b", `user:${"x".repeat(96)}`],
      ["!!!", "???", null],
    ];
    for (const [index, ids] of cases.entries()) {
      for (const [side, id] of ids.slice(0, 2).entries()) {
        await persistence.put({
          domain: "auth_users", key: id,
          value: { ...template, id, email: `legacy-${index}-${side}@example.test` },
        });
      }
    }
    assert.equal(await loadUserStoreFromAdapter(), true, "These exact legacy IDs pass canonical hydration.");
    await persistence.close();
    const expectedKeys = Object.keys((await apiRequest(server, owned, { headers: auth(alice) })).json).sort();
    for (const [index, [firstId, secondId, publicOwner]] of cases.entries()) {
      const users = [];
      for (const [side, id] of [firstId, secondId].entries()) {
        const login = await apiRequest(server, "/auth/login", {
          method: "POST",
          json: { email: `legacy-${index}-${side}@example.test`, password: "Turn-meta-test-password-123!" },
        });
        assert.equal(login.status, 200, login.text);
        assert.equal(login.json.user.user_id, id);
        users.push({ id, token: login.json.access_token });
      }
      const turnId = `legacy-collision-${index}`;
      const url = `/talk/turn/${turnId}`;
      const beforeStats = await apiRequest(server, "/talk/stats", { headers: auth(alice) });
      storeTalkTurnMeta({ turnId, userId: firstId, sessionId: sharedToken, reply: "First legacy owner's reply." });
      assert.equal((await apiRequest(server, url, { headers: auth(users[1]) })).status, 403,
        "A display-owner alias cannot read the first account before storing its own turn.");
      storeTalkTurnMeta({ turnId, userId: secondId, sessionId: sharedToken, reply: "Second legacy owner's reply." });
      for (const [side, user] of users.entries()) {
        const response = await apiRequest(server, url, { headers: auth(user, differentToken) });
        assert.equal(response.status, 200, response.text);
        assert.equal(response.json.reply, side === 0 ? "First legacy owner's reply." : "Second legacy owner's reply.");
        assert.equal(response.json.user_id, publicOwner, "Keep the legacy public envelope unchanged.");
        assert.deepEqual(Object.keys(response.json).sort(), expectedKeys, "Private identity must not add response fields.");
      }
      assert.equal((await apiRequest(server, url, { headers: { "X-Client-Token": sharedToken } })).status, 403,
        "A nonempty exact owner must never become anonymous when its display normalization is empty.");
      const afterStats = await apiRequest(server, "/talk/stats", { headers: auth(alice) });
      assert.equal(afterStats.json.uniqueUserCount, beforeStats.json.uniqueUserCount + 2,
        "Statistics count exact owners without exposing their private identities.");
    }
  });
  await t.test("TTL cleanup independently expires owner namespaces at the existing cutoff", () => {
    const ttl = Number(env.TALK_TURN_META_TTL_MS);
    const baseNow = Date.now() + ttl + 1000;
    readTalkTurnMeta("cleanup-trigger", baseNow);
    storeTalkTurnMeta({ turnId: "ttl-shared", userId: alice.id, reply: "older", now: baseNow });
    storeTalkTurnMeta({ turnId: "ttl-shared", userId: bob.id, reply: "newer", now: baseNow + 1000 });
    const aliceContext = { authUser: { id: alice.id } };
    const bobContext = { authUser: { id: bob.id } };
    assert.equal(readTalkTurnMeta("ttl-shared", baseNow + ttl, aliceContext)?.reply, "older");
    assert.equal(readTalkTurnMeta("ttl-shared", baseNow + ttl, bobContext)?.reply, "newer");
    assert.equal(readTalkTurnMeta("ttl-shared", baseNow + ttl + 1)?.reply, "newer",
      "After the older namespace expires, only the newer entry remains.");
    assert.equal(readTalkTurnMeta("ttl-shared", baseNow + ttl + 1001), null);
  });
  await t.test("eviction applies the 4000-entry global cap across owners and stats", async () => {
    const cap = Number(env.TALK_TURN_META_MAX_ENTRIES);
    const baseNow = Date.now() + Number(env.TALK_TURN_META_TTL_MS) * 4;
    readTalkTurnMeta("cleanup-trigger", baseNow);
    for (let index = 0; index <= cap; index += 1) {
      storeTalkTurnMeta({
        turnId: `cap-turn-${Math.floor(index / 2)}`,
        userId: index % 2 === 0 ? alice.id : bob.id,
        reply: `entry-${index}`, now: baseNow + index,
      });
    }
    const stats = await apiRequest(server, "/talk/stats", { headers: auth(alice) });
    assert.equal(stats.json.total, cap, "The cap is global and enforced after insertion, not per owner.");
    assert.equal(stats.json.uniqueUserCount, 2);
    assert.equal(readTalkTurnMeta("cap-turn-0", baseNow + cap)?.reply, "entry-1",
      "Eviction removes the oldest compound key, not the surviving owner's public turn ID.");
    assert.equal(readTalkTurnMeta(`cap-turn-${cap / 2}`, baseNow + cap)?.reply, `entry-${cap}`);
  });
});
