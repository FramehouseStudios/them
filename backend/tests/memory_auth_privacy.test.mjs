import assert from "node:assert/strict";
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
