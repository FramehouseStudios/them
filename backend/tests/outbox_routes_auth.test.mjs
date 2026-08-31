import assert from "node:assert/strict";
import { test } from "node:test";

import { apiRequest, startBackend } from "./helpers/backend_test_server.mjs";

const OPERATOR_TOKEN = "outbox-operator-test-token-with-32-plus-characters";
const OUTBOX_OPERATOR_HEADER = "X-OUTBOX-OPERATOR-TOKEN";

async function signup(server) {
  const response = await apiRequest(server, "/auth/signup", {
    method: "POST",
    json: {
      email: `outbox-operator-${Date.now()}@example.com`,
      password: "outbox-operator-test-password-123",
    },
  });
  assert.equal(response.status, 201, response.text);
  const accessToken = String(response.json?.access_token || "");
  assert.ok(accessToken, "signup should return an ordinary user access token");
  return accessToken;
}

test("[outbox-auth] app and user credentials cannot substitute for the operator credential", async () => {
  const server = await startBackend({
    env: {
      REQUIRE_APP_TOKEN: "1",
      OUTBOX_OPERATOR_TOKEN: OPERATOR_TOKEN,
    },
  });
  try {
    const appTokenOnly = await apiRequest(server, "/outbox");
    assert.equal(appTokenOnly.status, 401, appTokenOnly.text);
    assert.equal(appTokenOnly.json?.stage, "outbox_operator");

    const accessToken = await signup(server);
    const ordinaryUser = await apiRequest(server, "/outbox", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    assert.equal(ordinaryUser.status, 401, ordinaryUser.text);
    assert.equal(ordinaryUser.json?.stage, "outbox_operator");

    for (const malformed of ["wrong", "x".repeat(1_000)]) {
      const denied = await apiRequest(server, "/outbox", {
        headers: { [OUTBOX_OPERATOR_HEADER]: malformed },
      });
      assert.equal(denied.status, 401, denied.text);
      assert.equal(denied.json?.stage, "outbox_operator");
    }

    const missingAppToken = await apiRequest(server, "/outbox", {
      headers: {
        "X-APP-TOKEN": "",
        [OUTBOX_OPERATOR_HEADER]: OPERATOR_TOKEN,
      },
    });
    assert.equal(missingAppToken.status, 401, missingAppToken.text);
    assert.equal(missingAppToken.json?.stage, "auth");

    const list = await apiRequest(server, "/outbox", {
      headers: { [OUTBOX_OPERATOR_HEADER]: OPERATOR_TOKEN },
    });
    assert.equal(list.status, 200, list.text);
    assert.equal(list.json?.ok, true);
    assert.ok(Array.isArray(list.json?.items));

    const retry = await apiRequest(server, "/outbox/retry", {
      method: "POST",
      headers: { [OUTBOX_OPERATOR_HEADER]: OPERATOR_TOKEN },
      json: { limit: 1 },
    });
    assert.equal(retry.status, 200, retry.text);
    assert.equal(retry.json?.ok, true);
  } finally {
    await server.stop();
  }
});

test("[outbox-auth] missing server operator configuration disables the HTTP surface", async () => {
  const server = await startBackend({
    env: {
      REQUIRE_APP_TOKEN: "1",
      OUTBOX_OPERATOR_TOKEN: "",
    },
  });
  try {
    const list = await apiRequest(server, "/outbox");
    assert.equal(list.status, 404, list.text);
    assert.equal(list.json?.stage, "route");

    const retry = await apiRequest(server, "/outbox/retry", {
      method: "POST",
      json: { limit: 1 },
    });
    assert.equal(retry.status, 404, retry.text);
    assert.equal(retry.json?.stage, "route");
  } finally {
    await server.stop();
  }
});
