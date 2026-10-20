import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { apiRequest, startBackend } from "../tests/helpers/backend_test_server.mjs";
import { runRenderPredeploy } from "../ops/render_predeploy.mjs";

export const FIXTURE_DATABASE_URL = "postgres://postgres@db:5432/them_writer_gate";
export function buildWriterFixture() {
  const lines = Array.from({ length: 6600 }, (_, i) => `Action ${String(i).padStart(5, "0")}: the cafe\u0301 corridor is quiet; a door stays open.`);
  lines[0] = "  INT. CAFE\u0301 - NIGHT"; lines[1] = "";
  lines[2] = "REN\u00C9E"; lines[3] = "Keep my exact words.";
  return lines.join("\r\n") + "\t \r\n";
}
async function run() {
  assert.equal(process.env.THEM_PG_GATE_FIXTURE, "1", "Use the isolated gate orchestrator, not a real database");
  assert.ok(process.env.DATABASE_URL === FIXTURE_DATABASE_URL, "Only the disposable fixture database is allowed");
  const { Client } = createRequire(import.meta.url)("pg");
  await runRenderPredeploy({ databaseUrl: FIXTURE_DATABASE_URL, confirmation: "initialize-empty-canonical-auth-store-v1" });
  const env = {
    NODE_ENV: "production", DATABASE_URL: FIXTURE_DATABASE_URL,
    APP_TOKEN: "synthetic-local-app-token", JWT_SECRET: "synthetic-local-jwt-proof-only",
    OPENAI_API_KEY: "not-a-real-provider-key", CLEMENTINE_MUSE_ENABLED: "0",
    AUTH_APPLE_AUDIENCE: "io.them.them", AUTH_REQUIRE_EMAIL_VERIFIED: "0",
    APP_STORE_ISSUER_ID: "synthetic-unused", APP_STORE_KEY_ID: "synthetic-unused",
    APP_STORE_PRIVATE_KEY: "synthetic-unused", APP_STORE_BUNDLE_ID: "io.them.them",
    KNOWLEDGE_RAG_EMBEDDINGS_ENABLED: "0", KNOWLEDGE_RAG_WARMUP_DELAY_MS: "600000",
    SCALE_BACKPLANE_ENABLED: "0",
  };
  const password = "synthetic-local-writer-proof-only";
  let server, clientToken = "";
  const payload = response => response.json?.payload ?? response.json;
  const request = (route, { token, method = "GET", json } = {}) => apiRequest(server, route, {
    method, json, headers: { "X-Client-Token": clientToken, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  async function boot(token) {
    server = await startBackend({ env });
    assert.ok(server.stdout.join("").includes("[persistence] kind=postgres"));
    if (token) await session(token);
  }
  async function session(token) {
    clientToken = "";
    const response = await request("/session", { token, method: "POST", json: {} });
    assert.equal(response.status, 201);
    clientToken = payload(response).client_token;
    assert.ok(clientToken);
  }
  async function signup(email) {
    const response = await request("/auth/signup", { method: "POST", json: { email, password } });
    assert.equal(response.status, 201); return payload(response).token;
  }
  async function exactHead(token, id, versionID, draft) {
    const response = await request(`/screenplay/projects/${id}?include_drafts=1&version_limit=24`, { token });
    assert.equal(response.status, 200);
    const project = payload(response).project;
    assert.equal(project.active_version_id ?? project.activeVersionId, versionID);
    const version = project.versions.find(v => v.id === versionID);
    assert.ok(version && Buffer.from(version.draft).equals(Buffer.from(draft)), "Exact UTF-8 writer bytes must survive");
    assert.equal(project.versions.filter(v => v.id === versionID).length, 1);
    return project.versions.length;
  }
  try {
    await boot();
    const firstDataDir = server.dataDir;
    const alice = await signup("alice-writer@example.test"), bob = await signup("bob-writer@example.test");
    await session(alice);
    const created = await request("/screenplay/projects", { token: alice, method: "POST", json: { title: "Restart proof" } });
    assert.equal(created.status, 201);
    const id = payload(created).project_id ?? payload(created).project?.id;
    assert.ok(id);
    const draft = buildWriterFixture();
    const route = `/screenplay/projects/${id}/version`;
    const first = await request(route, { token: alice, method: "POST", json: {
      draft, source: "studio_manual", client_request_id: "pg-writer-first", base_version_id: "", conflict_strategy: "reject_if_stale",
    } });
    assert.ok([200, 201].includes(first.status), "Large first draft save");
    const v1 = payload(first).version_id ?? payload(first).version?.id;
    assert.ok(v1);
    const rewritten = draft.replace("Keep my exact words.", "Keep the revised words, too.");
    const save = { draft: rewritten, source: "studio_manual", client_request_id: "pg-writer-rewrite", base_version_id: v1, conflict_strategy: "reject_if_stale" };
    const response = await request(route, { token: alice, method: "POST", json: save });
    assert.ok([200, 201].includes(response.status), "Rewrite save");
    const v2 = payload(response).version_id ?? payload(response).version?.id;
    assert.ok(v2 && v2 !== v1);
    const count = await exactHead(alice, id, v2, rewritten);
    assert.equal((await request(`/screenplay/projects/${id}`, { token: bob })).status, 404);
    const sql = new Client({ connectionString: FIXTURE_DATABASE_URL });
    try {
      await sql.connect();
      assert.ok((await sql.query("SELECT count(*)::int AS n FROM persistence_screenplay")).rows[0].n > 0);
      console.log(JSON.stringify({ node: process.version, postgres: (await sql.query("SHOW server_version")).rows[0].server_version,
        fixtureLines: 6600, draftBytes: Buffer.byteLength(draft) }));
    } finally { await sql.end(); }
    await server.stop(); server = null;
    const restarted = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Database restart signal timed out")), 60_000);
      process.stdin.once("data", chunk => {
        clearTimeout(timer); process.stdin.pause();
        String(chunk).trim() === "database-restarted" ? resolve() : reject(new Error("Invalid restart signal"));
      });
      process.stdin.once("end", () => { clearTimeout(timer); reject(new Error("Restart controller disconnected")); });
    });
    console.log("THEM_POSTGRES_WRITER_RESTART_READY");
    await restarted;
    await boot(alice);
    assert.notEqual(server.dataDir, firstDataDir, "Fresh files, no JSON mirror reuse");
    assert.equal(await exactHead(alice, id, v2, rewritten), count);
    const replay = await request(route, { token: alice, method: "POST", json: save });
    assert.ok([200, 201].includes(replay.status));
    assert.equal(payload(replay).version_id ?? payload(replay).version?.id, v2);
    assert.equal(await exactHead(alice, id, v2, rewritten), count, "No duplicate after replay");
    assert.equal((await request("/auth/login", { method: "POST", json: { email: "alice-writer@example.test", password } })).status, 200);
    assert.equal((await request(`/screenplay/projects/${id}`, { token: bob })).status, 404);
    console.log("THEM_POSTGRES_WRITER_CONTRACT_PASSED");
  } finally { if (server) await server.stop(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (!process.argv.includes("--isolated-fixture")) throw new Error("Use scripts/run_postgres_writer_gate.mjs; never supply production credentials");
  await run();
}
