import assert from "node:assert/strict";
import { test } from "node:test";
import { startBackend, apiRequest } from "./helpers/backend_test_server.mjs";

test("real authenticated talk rejects bad voice uploads before generation and stays healthy", async () => {
  const server = await startBackend({ unsetEnv: ["DATABASE_URL", "REDIS_URL"], env: {
    REQUIRE_USER_AUTH: "1", CLEMENTINE_MUSE_ENABLED: "0",
  } });
  try {
    const signup = await apiRequest(server, "/auth/signup", { method: "POST", json: {
      email: "upload-fixture@example.com", password: "upload-fixture-password-123",
    } });
    assert.equal(signup.status, 201);
    const headers = { Authorization: `Bearer ${signup.json.token || signup.json.access_token}` };
    const fields = () => {
      const form = new FormData();
      form.append("items[4294967294]", "x"); form.append("items[]", "y"); return form;
    };
    assert.equal((await apiRequest(server, "/talk", { method: "POST", body: fields() })).status, 401);
    const malformed = await apiRequest(server, "/talk", { method: "POST", headers, body: fields() });
    assert.equal(malformed.status, 400);
    assert.equal(malformed.json.stage, "upload");
    const truncated = await apiRequest(server, "/talk", { method: "POST",
      headers: { ...headers, "Content-Type": "multipart/form-data; boundary=fixture" },
      body: '--fixture\r\nContent-Disposition: form-data; name="audio"; filename="voice.wav"\r\n\r\npartial' });
    assert.equal(truncated.status, 400);
    assert.equal(truncated.json.code, "INVALID_MULTIPART");
    const oversized = new FormData();
    oversized.append("audio", new Blob([new Uint8Array(25 * 1024 * 1024 + 1)]), "voice.wav");
    const tooLarge = await apiRequest(server, "/talk", { method: "POST", headers, body: oversized });
    assert.equal(tooLarge.status, 413);
    assert.deepEqual(tooLarge.json, { stage: "upload", error: "File too large. Max is 25MB." });
    assert.equal((await apiRequest(server, "/health")).status, 200);
  } finally { await server.stop(); }
});
