import assert from "node:assert/strict";
import { test } from "node:test";

import {
  apiRequest,
  startBackend,
} from "./helpers/backend_test_server.mjs";

test("[startup] development boots without OPENAI_API_KEY and provider routes fail closed", async (t) => {
  const server = await startBackend({
    env: {
      NODE_ENV: "development",
      REQUIRE_USER_AUTH: "0",
    },
    unsetEnv: ["OPENAI_API_KEY"],
  });
  t.after(() => server.stop());

  const health = await apiRequest(server, "/health");
  assert.equal(health.status, 200);

  const realtimeCall = await apiRequest(server, "/realtime/call", {
    method: "POST",
    headers: { "Content-Type": "application/sdp" },
    body: "v=0\r\n",
  });
  assert.equal(realtimeCall.status, 503);
  assert.equal(realtimeCall.json?.stage, "realtime_call");
  assert.match(realtimeCall.json?.error || "", /OpenAI API key is missing/);
});
