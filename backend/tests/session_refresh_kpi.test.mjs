import assert from "node:assert/strict";
import test from "node:test";

import {
  apiRequest,
  startBackend,
} from "./helpers/backend_test_server.mjs";

function lastSessionKpi(server) {
  const lines = server.stdout.join("").split("\n").filter((line) => line.includes("[session_kpi]"));
  const last = lines[lines.length - 1] || "";
  const match = last.match(/user_initiated_sessions_7d=(\d+)/);
  return match ? Number(match[1]) : null;
}

test("[session] refreshing a valid client token is a heartbeat, not a new user-initiated session", async () => {
  const server = await startBackend({
    env: {
      REQUIRE_USER_AUTH: "0",
      SESSION_RATE_LIMIT_MAX: "50",
      SESSION_RATE_LIMIT_WINDOW_MS: "60000",
    },
  });

  try {
    const created = await apiRequest(server, "/session", { method: "POST" });
    assert.equal(created.status, 201);
    const clientToken = String(created.json?.client_token || "").trim();
    assert.ok(clientToken.length > 10);
    const afterCreate = lastSessionKpi(server);
    assert.ok(afterCreate >= 1, "a new session counts");

    for (let i = 0; i < 5; i += 1) {
      const refreshed = await apiRequest(server, "/session", {
        method: "POST",
        headers: { "X-Client-Token": clientToken },
      });
      assert.equal(refreshed.status, 201);
      assert.equal(refreshed.json?.client_token, clientToken);
    }
    assert.equal(
      lastSessionKpi(server),
      afterCreate,
      "five refreshes of the same token must not add five sessions"
    );

    const second = await apiRequest(server, "/session", { method: "POST" });
    assert.equal(second.status, 201);
    assert.equal(lastSessionKpi(server), afterCreate + 1, "a request without a token is still a new session");
  } finally {
    await server.stop();
  }
});
