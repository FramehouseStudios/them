import test from "node:test";
import assert from "node:assert/strict";

import { assertProductionEnv, resolveRequireUserAuth } from "../config.js";

const FULL_PROD_ENV = Object.freeze({
  NODE_ENV: "production",
  DATABASE_URL: "postgres://user:pass@host:5432/db",
  JWT_SECRET: "test-jwt-secret",
  OPENAI_API_KEY: "sk-test",
  APP_TOKEN: "app-token",
  AUTH_APPLE_AUDIENCE: "io.them.them",
  APP_STORE_ISSUER_ID: "test-issuer-id",
  APP_STORE_KEY_ID: "test-key-id",
  APP_STORE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----",
  APP_STORE_BUNDLE_ID: "io.them.them",
});

test("[assertProductionEnv] no-op when NODE_ENV is not production", () => {
  assert.doesNotThrow(() => assertProductionEnv({ NODE_ENV: "development" }));
  assert.doesNotThrow(() => assertProductionEnv({ NODE_ENV: "test" }));
  assert.doesNotThrow(() => assertProductionEnv({}));
});

test("[assertProductionEnv] passes when all required vars are present", () => {
  assert.doesNotThrow(() => assertProductionEnv({ ...FULL_PROD_ENV }));
});

test("[assertProductionEnv] throws when DATABASE_URL is missing", () => {
  const env = { ...FULL_PROD_ENV, DATABASE_URL: "" };
  assert.throws(() => assertProductionEnv(env), /DATABASE_URL/);
});

test("[assertProductionEnv] throws when JWT_SECRET is missing", () => {
  const env = { ...FULL_PROD_ENV, JWT_SECRET: "" };
  assert.throws(() => assertProductionEnv(env), /JWT_SECRET/);
});

test("[assertProductionEnv] throws when OPENAI_API_KEY is missing", () => {
  const env = { ...FULL_PROD_ENV, OPENAI_API_KEY: "" };
  assert.throws(() => assertProductionEnv(env), /OPENAI_API_KEY/);
});

test("[assertProductionEnv] throws when APP_TOKEN is missing", () => {
  const env = { ...FULL_PROD_ENV, APP_TOKEN: "" };
  assert.throws(() => assertProductionEnv(env), /APP_TOKEN/);
});

test("[assertProductionEnv] allows disabled outbox HTTP access and rejects a weak configured operator token", () => {
  assert.doesNotThrow(() => assertProductionEnv({ ...FULL_PROD_ENV, OUTBOX_OPERATOR_TOKEN: "" }));
  assert.throws(
    () => assertProductionEnv({ ...FULL_PROD_ENV, OUTBOX_OPERATOR_TOKEN: "too-short" }),
    /OUTBOX_OPERATOR_TOKEN/,
  );
  assert.doesNotThrow(() => assertProductionEnv({
    ...FULL_PROD_ENV,
    OUTBOX_OPERATOR_TOKEN: "a".repeat(32),
  }));
});

test("[assertProductionEnv] throws when AUTH_APPLE_AUDIENCE is missing or blank", () => {
  const { AUTH_APPLE_AUDIENCE: _omitted, ...missingAudienceEnv } = FULL_PROD_ENV;
  assert.throws(() => assertProductionEnv(missingAudienceEnv), /AUTH_APPLE_AUDIENCE/);
  assert.throws(
    () => assertProductionEnv({ ...FULL_PROD_ENV, AUTH_APPLE_AUDIENCE: "   " }),
    /AUTH_APPLE_AUDIENCE/,
  );
});

test("[assertProductionEnv] throws when production user auth is explicitly disabled", () => {
  assert.throws(
    () => assertProductionEnv({ ...FULL_PROD_ENV, REQUIRE_USER_AUTH: "0" }),
    /REQUIRE_USER_AUTH/,
  );
  assert.throws(
    () => assertProductionEnv({ ...FULL_PROD_ENV, REQUIRE_USER_AUTH: "false" }),
    /REQUIRE_USER_AUTH/,
  );
  assert.throws(
    () => assertProductionEnv({ ...FULL_PROD_ENV, REQUIRE_USER_AUTH: "no" }),
    /REQUIRE_USER_AUTH/,
  );
});

test("[assertProductionEnv] lists every missing variable, not just the first", () => {
  const env = { NODE_ENV: "production" };
  let caught;
  try {
    assertProductionEnv(env);
  } catch (err) {
    caught = err;
  }
  assert.ok(caught, "expected throw");
  const message = String(caught.message || "");
  assert.match(message, /DATABASE_URL/);
  assert.match(message, /JWT_SECRET/);
  assert.match(message, /OPENAI_API_KEY/);
  assert.match(message, /APP_TOKEN/);
  assert.match(message, /AUTH_APPLE_AUDIENCE/);
});

test("[assertProductionEnv] treats whitespace-only values as missing", () => {
  const env = { ...FULL_PROD_ENV, DATABASE_URL: "   " };
  assert.throws(() => assertProductionEnv(env), /DATABASE_URL/);
});

test("[assertProductionEnv] throws when each APP_STORE_* var is missing", () => {
  for (const key of ["APP_STORE_ISSUER_ID", "APP_STORE_KEY_ID", "APP_STORE_PRIVATE_KEY", "APP_STORE_BUNDLE_ID"]) {
    const env = { ...FULL_PROD_ENV, [key]: "" };
    assert.throws(() => assertProductionEnv(env), new RegExp(key), `expected ${key} to be required`);
    const { [key]: _omitted, ...withoutKey } = FULL_PROD_ENV;
    assert.throws(() => assertProductionEnv(withoutKey), new RegExp(key), `expected missing ${key} to be required`);
  }
});

test("[resolveRequireUserAuth] production enforces auth when unset or blank", () => {
  assert.equal(resolveRequireUserAuth({ NODE_ENV: "production" }), true);
  assert.equal(resolveRequireUserAuth({ NODE_ENV: "production", REQUIRE_USER_AUTH: "" }), true);
  assert.equal(resolveRequireUserAuth({ NODE_ENV: "production", REQUIRE_USER_AUTH: "   " }), true);
});

test("[resolveRequireUserAuth] production remains locked even when explicitly disabled", () => {
  assert.equal(resolveRequireUserAuth({ NODE_ENV: "production", REQUIRE_USER_AUTH: "false" }), true);
  assert.equal(resolveRequireUserAuth({ NODE_ENV: "production", REQUIRE_USER_AUTH: "0" }), true);
  assert.equal(resolveRequireUserAuth({ NODE_ENV: "production", REQUIRE_USER_AUTH: "no" }), true);
});

test("[resolveRequireUserAuth] production honors explicit true-ish values", () => {
  assert.equal(resolveRequireUserAuth({ NODE_ENV: "production", REQUIRE_USER_AUTH: "true" }), true);
  assert.equal(resolveRequireUserAuth({ NODE_ENV: "production", REQUIRE_USER_AUTH: "1" }), true);
  assert.equal(resolveRequireUserAuth({ NODE_ENV: "production", REQUIRE_USER_AUTH: "yes" }), true);
});

test("[resolveRequireUserAuth] non-production stays opt-in", () => {
  assert.equal(resolveRequireUserAuth({ NODE_ENV: "development" }), false);
  assert.equal(resolveRequireUserAuth({ NODE_ENV: "test" }), false);
  assert.equal(resolveRequireUserAuth({}), false);
  assert.equal(resolveRequireUserAuth({ NODE_ENV: "development", REQUIRE_USER_AUTH: "true" }), true);
  assert.equal(resolveRequireUserAuth({ NODE_ENV: "test", REQUIRE_USER_AUTH: "1" }), true);
});
