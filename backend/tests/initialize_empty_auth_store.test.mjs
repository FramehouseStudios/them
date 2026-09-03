import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  AUTH_MARKER_VALUE,
  EMPTY_AUTH_CONFIRMATION,
  initializeEmptyAuthStore,
} from "../ops/initialize_empty_auth_store.mjs";
import { runRenderPredeploy } from "../ops/render_predeploy.mjs";

function quietLogger() {
  return { log() {}, error() {} };
}

function createAuthClient({ marker = null, hasAuthRows = false, failInsert = false } = {}) {
  const queries = [];
  let ended = false;
  return {
    queries,
    get ended() { return ended; },
    async query(sql, params = []) {
      queries.push({ sql, params });
      if (/SELECT value[\s\S]*FROM persistence_auth_store_meta/.test(sql)) {
        return { rows: marker == null ? [] : [{ value: marker }] };
      }
      if (/SELECT EXISTS \(/.test(sql)) {
        return { rows: [{ has_auth_rows: hasAuthRows }] };
      }
      if (/INSERT INTO persistence_auth_store_meta/.test(sql) && failInsert) {
        throw new Error("marker insert failed");
      }
      return { rows: [] };
    },
    async end() { ended = true; },
  };
}

async function runWithClient(client, confirmation = "") {
  return initializeEmptyAuthStore({
    databaseUrl: "postgres://test",
    confirmation,
    clientFactory: async () => client,
    logger: quietLogger(),
  });
}

function hasQuery(client, pattern) {
  return client.queries.some(({ sql }) => pattern.test(sql));
}

test("[empty-auth-init] valid marker is a no-op without first-deploy confirmation", async () => {
  const client = createAuthClient({ marker: AUTH_MARKER_VALUE, hasAuthRows: true });
  const result = await runWithClient(client);
  assert.deepEqual(result, { initialized: false, alreadyInitialized: true });
  assert.equal(hasQuery(client, /SELECT EXISTS \(/), false);
  assert.equal(hasQuery(client, /INSERT INTO persistence_auth_store_meta/), false);
  assert.equal(hasQuery(client, /^COMMIT$/), true);
  assert.equal(client.ended, true);
});

test("[empty-auth-init] exact confirmation marks a fresh empty store once", async () => {
  const client = createAuthClient();
  const result = await runWithClient(client, EMPTY_AUTH_CONFIRMATION);
  assert.deepEqual(result, { initialized: true, alreadyInitialized: false });
  const insert = client.queries.find(({ sql }) => /INSERT INTO persistence_auth_store_meta/.test(sql));
  assert.deepEqual(insert.params, ["canonical_state", JSON.stringify(AUTH_MARKER_VALUE)]);
  assert.equal(hasQuery(client, /^COMMIT$/), true);
  assert.equal(client.ended, true);
});

test("[empty-auth-init] unconfirmed empty store fails closed and rolls back", async () => {
  const client = createAuthClient();
  await assert.rejects(runWithClient(client, "wrong"), /empty auth store is uninitialized/);
  assert.equal(hasQuery(client, /INSERT INTO persistence_auth_store_meta/), false);
  assert.equal(hasQuery(client, /^ROLLBACK$/), true);
});

test("[empty-auth-init] markerless nonempty store is never authorized", async () => {
  const client = createAuthClient({ hasAuthRows: true });
  await assert.rejects(
    runWithClient(client, EMPTY_AUTH_CONFIRMATION),
    /marker is missing from a nonempty auth store/,
  );
  assert.equal(hasQuery(client, /INSERT INTO persistence_auth_store_meta/), false);
  assert.equal(hasQuery(client, /^ROLLBACK$/), true);
});

test("[empty-auth-init] incompatible marker fails closed", async () => {
  const client = createAuthClient({ marker: { schemaVersion: 2, initialized: true } });
  await assert.rejects(
    runWithClient(client, EMPTY_AUTH_CONFIRMATION),
    /unsupported value|incompatible/,
  );
  assert.equal(hasQuery(client, /INSERT INTO persistence_auth_store_meta/), false);
  assert.equal(hasQuery(client, /^ROLLBACK$/), true);
});

test("[empty-auth-init] marker write failure rolls back", async () => {
  const client = createAuthClient({ failInsert: true });
  await assert.rejects(
    runWithClient(client, EMPTY_AUTH_CONFIRMATION),
    /marker insert failed/,
  );
  assert.equal(hasQuery(client, /^ROLLBACK$/), true);
  assert.equal(hasQuery(client, /^COMMIT$/), false);
});

test("[empty-auth-init] implementation contains no destructive auth operation", () => {
  const source = readFileSync(
    new URL("../ops/initialize_empty_auth_store.mjs", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /\b(?:DELETE|TRUNCATE)\b/i);
});

test("[render-predeploy] migrations finish before auth initialization", async () => {
  const calls = [];
  await runRenderPredeploy({
    migrate: async () => { calls.push("migrate"); },
    initializeAuth: async () => { calls.push("initialize-auth"); },
    logger: quietLogger(),
  });
  assert.deepEqual(calls, ["migrate", "initialize-auth"]);
});
