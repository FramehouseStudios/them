import assert from "node:assert/strict";
import test from "node:test";

import {
  apiRequest,
  startBackend,
} from "./helpers/backend_test_server.mjs";

test("[session] existing client tokens refresh beyond new-session rate limit", async () => {
  const server = await startBackend({
    env: {
      REQUIRE_USER_AUTH: "0",
      SESSION_RATE_LIMIT_MAX: "1",
      SESSION_RATE_LIMIT_WINDOW_MS: "60000",
    },
  });

  try {
    const created = await apiRequest(server, "/session", { method: "POST" });
    assert.equal(created.status, 201);
    const clientToken = String(created.json?.client_token || "").trim();
    assert.ok(clientToken.length > 10, "Expected /session to issue a client token");

    const refreshed = await apiRequest(server, "/session", {
      method: "POST",
      headers: {
        "X-Client-Token": clientToken,
      },
    });
    assert.equal(refreshed.status, 201);
    assert.equal(refreshed.json?.client_token, clientToken);

    const denied = await apiRequest(server, "/session", { method: "POST" });
    assert.equal(denied.status, 429);
    assert.equal(denied.json?.stage, "session");
  } finally {
    await server.stop();
  }
});
