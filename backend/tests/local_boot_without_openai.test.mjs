import assert from "node:assert/strict";
import test from "node:test";

import { apiRequest, startBackend } from "./helpers/backend_test_server.mjs";

test("[backend-boot] development backend starts without OPENAI_API_KEY when stub realtime provider is selected", async () => {
  const server = await startBackend({
    env: {
      NODE_ENV: "development",
      OPENAI_API_KEY: "",
      REALTIME_PROVIDER: "stub",
      OUTBOX_WORKER_ENABLED: "0",
      KNOWLEDGE_RAG_WARMUP_DELAY_MS: "600000",
    },
  });
  try {
    const healthz = await apiRequest(server, "/healthz");
    assert.equal(healthz.status, 200);
    assert.equal(healthz.json.ok, true);

    const version = await apiRequest(server, "/api/version");
    assert.equal(version.status, 200);
    assert.equal(version.json.ok, true);
  } finally {
    await server.stop();
  }
});
