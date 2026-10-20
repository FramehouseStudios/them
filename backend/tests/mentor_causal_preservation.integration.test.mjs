import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startBackend, apiRequest } from "./helpers/backend_test_server.mjs";
import { createJsonPersistence } from "../lib/persistence_json.js";
import { createAdapterWalletPersistence } from "../lib/clementine/wallet_persistence.js";

test("real mentor response keeps its reason through speech without changing the saved page", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "them-mentor-current-"));
  const stub = fileURLToPath(new URL("./helpers/mentor_causal_provider_stub.mjs", import.meta.url));
  const options = { dataDir, unsetEnv: ["DATABASE_URL", "REDIS_URL"], env: {
    NODE_OPTIONS: `--import=${stub}`, REQUIRE_USER_AUTH: "1", OPENAI_API_KEY: "fixture-only-no-live",
    TALK_TEST_DEBUG_TRANSCRIPT_ENABLED: "1", TALK_TEST_DEBUG_OFFLINE_ENABLED: "0",
    CHAT_STREAM_ENABLED: "0", TALK_STREAM_AUDIO_ENABLED: "0", CLEMENTINE_SHORT_FILM_BETA: "0",
    CLEMENTINE_MUSE_ENABLED: "0", CLEMENTINE_PROVIDER: "openai", KNOWLEDGE_RAG_EMBEDDINGS_ENABLED: "0",
  } };
  let server;
  try {
    server = await startBackend(options);
    const signup = await apiRequest(server, "/auth/signup", { method: "POST", json: {
      email: "mentor-fixture@example.com", password: "mentor-fixture-password-123",
    } });
    assert.equal(signup.status, 201);
    const auth = { Authorization: `Bearer ${signup.json.token || signup.json.access_token}` };
    await server.stop();
    await createAdapterWalletPersistence({ persistence: createJsonPersistence({ jsonRoot: path.join(dataDir, "persistence") }) })
      .putBalance({ ownerId: signup.json.user.user_id, pageMilliturns: 0, companionMilliturns: 100000,
        grantedPageMilliturns: 0, grantedCompanionMilliturns: 100000 });
    server = await startBackend(options);
    const session = await apiRequest(server, "/session", { method: "POST", headers: auth });
    assert.equal(session.status, 201);
    const headers = { ...auth, "X-Client-Token": session.json.client_token };
    const created = await apiRequest(server, "/screenplay/projects", { method: "POST", headers, json: { title: "Keep the mentor reason" } });
    assert.equal(created.status, 201);
    const id = created.json.project_id || created.json.project?.id;
    const saved = await apiRequest(server, `/screenplay/projects/${id}/version`, { method: "POST", headers,
      json: { draft: "INT. CABIN - NIGHT\n\nJOHN\nThe key stays with me." } });
    assert.ok([200, 201].includes(saved.status));
    const before = await apiRequest(server, `/screenplay/projects/${id}?include_drafts=1`, { headers });
    const form = new FormData();
    form.append("debug_transcript", "My scene has John hiding a key from Mara. How can I make the conflict clearer?");
    form.append("screenplay_project_id", id);
    form.append("max_output_tokens", "400");
    form.append("file", new Blob([fs.readFileSync(new URL("../test.wav", import.meta.url))], { type: "audio/wav" }), "test.wav");
    const result = await apiRequest(server, "/talk", { method: "POST", headers, body: form });
    assert.equal(result.status, 200);
    assert.notEqual(result.headers.get("x-turn-status"), "error_recovered");
    assert.ok(decodeURIComponent(result.headers.get("x-reply") || "").includes("because John's lie forces the chase"));
    assert.ok(decodeURIComponent(result.headers.get("x-reply") || "").includes('"Do not leave. Stay here."'));
    const trace = server.stdout.join("");
    assert.ok(trace.includes("[mentor-test] mentor_contract=true"));
    assert.ok(trace.includes("[mentor-test] because_contract=true"));
    assert.ok(trace.includes("[mentor-test] tts_causal_advice=true"));
    assert.ok(trace.includes("[mentor-test] tts_complete_quoted_dialogue=true"));
    const after = await apiRequest(server, `/screenplay/projects/${id}?include_drafts=1`, { headers });
    assert.deepEqual(after.json.project, before.json.project);
  } finally {
    await server?.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
