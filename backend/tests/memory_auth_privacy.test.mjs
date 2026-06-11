import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";

import { apiRequest, startBackend } from "./helpers/backend_test_server.mjs";

async function signup(server, email) {
  const r = await apiRequest(server, "/auth/signup", {
    method: "POST",
    json: {
      email,
      password: "memory-auth-password-123",
    },
  });
  assert.equal(r.status, 201, `signup failed: ${r.text}`);
  return {
    token: String(r.json?.access_token || r.json?.token || ""),
    userId: String(r.json?.user?.user_id || ""),
  };
}

test("[memory-auth] memory routes reject spoofed X-User-Id even when global auth gate is disabled", async () => {
  const server = await startBackend({
    env: {
      REQUIRE_USER_AUTH: "0",
    },
  });
  try {
    for (const path of [
      "/memories",
      "/memories/export",
      "/memory/stats",
      "/memory/block-signal",
      "/memory/block-signal/history",
      "/memory/character-archetypes",
      "/memory/character-traits",
    ]) {
      const r = await apiRequest(server, path, {
        headers: { "X-User-Id": "spoofed-user" },
      });
      assert.equal(r.status, 401, `${path} should reject unauthenticated spoofed ownership`);
      assert.equal(r.json?.error, "user_auth_required");
    }

    const write = await apiRequest(server, "/memory/record-character-mention", {
      method: "POST",
      headers: { "X-User-Id": "spoofed-user" },
      json: { character_name: "JUNE" },
    });
    assert.equal(write.status, 401);
    assert.equal(write.json?.error, "user_auth_required");
  } finally {
    await server.stop();
  }
});

test("[memory-auth] authenticated users cannot read another user's character traits via X-User-Id", async () => {
  const server = await startBackend();
  try {
    const alice = await signup(server, "memory-alice@example.com");
    const bob = await signup(server, "memory-bob@example.com");

    const writeAlice = await apiRequest(server, "/memory/character-trait", {
      method: "POST",
      headers: { Authorization: "Bearer " + alice.token },
      json: {
        character_name: "JUNE",
        traits: { keywords: ["haunted"] },
      },
    });
    assert.equal(writeAlice.status, 200, `alice write failed: ${writeAlice.text}`);

    const aliceRead = await apiRequest(server, "/memory/character-traits", {
      headers: { Authorization: "Bearer " + alice.token },
    });
    assert.equal(aliceRead.status, 200);
    assert.equal(aliceRead.json?.characters?.[0]?.name, "JUNE");

    const bobSpoof = await apiRequest(server, "/memory/character-traits", {
      headers: {
        Authorization: "Bearer " + bob.token,
        "X-User-Id": alice.userId,
      },
    });
    assert.equal(bobSpoof.status, 200);
    assert.deepEqual(bobSpoof.json?.characters, []);
  } finally {
    await server.stop();
  }
});

test("[memory-auth] authenticated session memory persists by account and restores across tokens", async () => {
  const server = await startBackend();
  try {
    const alice = await signup(server, "memory-session-alice@example.com");

    const firstSession = await apiRequest(server, "/session", {
      method: "POST",
      headers: { Authorization: "Bearer " + alice.token },
    });
    assert.equal(firstSession.status, 201, `session failed: ${firstSession.text}`);
    const firstToken = String(firstSession.json?.client_token || "");
    assert.ok(firstToken, "session returns a client token");

    const writeMemory = await apiRequest(server, "/session/evolution", {
      method: "PATCH",
      headers: {
        Authorization: "Bearer " + alice.token,
        "X-Client-Token": firstToken,
      },
      json: {
        preferred_name: "June",
        latest_user_message: "My protagonist Mara is terrified of open water.",
        is_screenwriter: true,
      },
    });
    assert.equal(writeMemory.status, 204, `memory write failed: ${writeMemory.text}`);

    const restored = await apiRequest(server, "/session", {
      method: "POST",
      headers: { Authorization: "Bearer " + alice.token },
    });
    assert.equal(restored.status, 201, `session restore failed: ${restored.text}`);
    assert.equal(restored.json?.user_id, alice.userId);
    assert.equal(restored.json?.user_name, "June");
    assert.equal(restored.json?.evolution_sync?.is_screenwriter, true);

    const raw = fs.readFileSync(server.env.USER_MEMORY_STORE_PATH, "utf8");
    const store = JSON.parse(raw);
    const userRecord = (store.users || []).find((entry) => entry.userId === alice.userId);
    assert.ok(userRecord, "user memory store should contain an account-keyed record");
    assert.equal(userRecord.memory?.userPrimaryName, "June");
  } finally {
    await server.stop();
  }
});

test("[memory-auth] spoofed X-User-Id cannot redirect authenticated session memory", async () => {
  const server = await startBackend();
  try {
    const alice = await signup(server, "memory-session-target@example.com");
    const bob = await signup(server, "memory-session-bob@example.com");

    const bobSession = await apiRequest(server, "/session", {
      method: "POST",
      headers: { Authorization: "Bearer " + bob.token },
    });
    assert.equal(bobSession.status, 201, `bob session failed: ${bobSession.text}`);
    const bobToken = String(bobSession.json?.client_token || "");
    assert.ok(bobToken, "bob session returns a client token");

    const spoofedWrite = await apiRequest(server, "/session/evolution", {
      method: "PATCH",
      headers: {
        Authorization: "Bearer " + bob.token,
        "X-Client-Token": bobToken,
        "X-User-Id": alice.userId,
      },
      json: {
        preferred_name: "Bob Memory",
        latest_user_message: "Store this only on Bob.",
      },
    });
    assert.equal(spoofedWrite.status, 204, `spoofed write failed: ${spoofedWrite.text}`);

    const raw = fs.readFileSync(server.env.USER_MEMORY_STORE_PATH, "utf8");
    const store = JSON.parse(raw);
    const aliceRecord = (store.users || []).find((entry) => entry.userId === alice.userId);
    const bobRecord = (store.users || []).find((entry) => entry.userId === bob.userId);
    assert.equal(aliceRecord?.memory?.userPrimaryName || "", "");
    assert.equal(bobRecord?.memory?.userPrimaryName, "Bob Memory");
  } finally {
    await server.stop();
  }
});
