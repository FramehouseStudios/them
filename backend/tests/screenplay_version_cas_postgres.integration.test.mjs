import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import pg from "pg";
import { apiRequest, startBackend } from "./helpers/backend_test_server.mjs";

const databaseUrl = process.env.THEM_VERSION_CAS_TEST_DATABASE_URL || "";

test("[screenplay-version-cas] two PostgreSQL-backed processes retain one winner and exact replay", { skip: !databaseUrl }, async () => {
  const target = new URL(databaseUrl);
  assert.ok(["127.0.0.1", "localhost", "::1"].includes(target.hostname) && target.pathname === "/them_t1354",
    "This test creates a delay trigger and may only run against its task-owned local database.");
  const db = new pg.Client({ connectionString: databaseUrl });
  await db.connect();
  let first;
  let second;
  try {
    // The test owns its database. Delay updates to force overlapping CAS attempts.
    await db.query(`CREATE OR REPLACE FUNCTION them_t1354_delay() RETURNS trigger AS $$
      BEGIN PERFORM pg_sleep(0.15); RETURN NEW; END; $$ LANGUAGE plpgsql`);
    await db.query(`CREATE TRIGGER them_t1354_delay BEFORE UPDATE ON persistence_screenplay
      FOR EACH ROW EXECUTE FUNCTION them_t1354_delay()`);
    first = await startBackend({ env: { DATABASE_URL: databaseUrl, REQUIRE_USER_AUTH: "1" }, unsetEnv: ["REDIS_URL"] });
    const signup = await apiRequest(first, "/auth/signup", { method: "POST", json: {
      email: `cas-${randomUUID()}@example.test`, password: `Cas-${randomUUID()}-aA1!`, display_name: "CAS fixture",
    } });
    assert.equal(signup.status, 201);
    const token = signup.json?.access_token;
    assert.ok(token);
    second = await startBackend({ env: { DATABASE_URL: databaseUrl, REQUIRE_USER_AUTH: "1" }, unsetEnv: ["REDIS_URL"] });
    const headers = { Authorization: `Bearer ${token}` };
    const project = `cas-${randomUUID().replaceAll("-", "").slice(0, 20)}`;
    const create = await apiRequest(first, "/screenplay/projects", { method: "POST", headers,
      json: { project_id: project, title: "CAS fixture", activate: true } });
    assert.equal(create.status, 201);
    const path = `/screenplay/projects/${project}/version`;
    const seed = await apiRequest(first, path, { method: "POST", headers,
      json: { draft: "Original", client_request_id: "seed", source: "studio_manual" } });
    assert.equal(seed.status, 201);
    const base = seed.json.version_id;
    const requests = [first, second].map((server, index) => apiRequest(server, path, { method: "POST", headers,
      json: { draft: `Writer ${index}`, base_version_id: base, client_request_id: `writer-${index}`, source: "studio_manual" } }));
    const competing = await Promise.all(requests);
    assert.deepEqual(competing.map((r) => r.status).sort(), [201, 409]);
    assert.equal(competing.find((r) => r.status === 409).json.status, "conflict");
    const winner = competing.find((r) => r.status === 201);
    const winnerIndex = competing.indexOf(winner);
    const head = winner.json.version_id;
    const sameBody = { draft: "Identical next page", base_version_id: head, client_request_id: "same-request", source: "studio_manual" };
    const same = await Promise.all([first, second].map((server) => apiRequest(server, path, { method: "POST", headers, json: sameBody })));
    assert.deepEqual(same.map((r) => r.status).sort(), [200, 201]);
    assert.equal(new Set(same.map((r) => r.json.version_id)).size, 1);
    assert.equal(same.find((r) => r.status === 200).json.replay_proof, "full_request_hash_v1");
    const read = await apiRequest(second, `/screenplay/projects/${project}?include_drafts=true&version_limit=24`, { headers });
    assert.equal(read.status, 200);
    const versions = read.json.project.versions;
    assert.equal(versions.filter((v) => v.client_request_id === "same-request").length, 1);
    assert.equal(versions.filter((v) => v.client_request_id === `writer-${winnerIndex}`).length, 1);
    assert.equal(versions.some((v) => v.client_request_id === `writer-${1 - winnerIndex}`), false);
  } finally {
    if (second) await second.stop();
    if (first) await first.stop();
    await db.query("DROP TRIGGER IF EXISTS them_t1354_delay ON persistence_screenplay");
    await db.query("DROP FUNCTION IF EXISTS them_t1354_delay()");
    await db.end();
  }
});
