import test from "node:test";
import assert from "node:assert/strict";

import { assertProductionEnv } from "../config.js";

const FULL_PROD_ENV = Object.freeze({
  NODE_ENV: "production",
  DATABASE_URL: "postgres://user:pass@host:5432/db",
  JWT_SECRET: "test-jwt-secret",
  OPENAI_API_KEY: "sk-test",
  APP_TOKEN: "app-token",
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

test("[assertProductionEnv] throws when production user auth is explicitly disabled", () => {
  assert.throws(
    () => assertProductionEnv({ ...FULL_PROD_ENV, REQUIRE_USER_AUTH: "0" }),
    /REQUIRE_USER_AUTH/,
  );
  assert.throws(
    () => assertProductionEnv({ ...FULL_PROD_ENV, REQUIRE_USER_AUTH: "false" }),
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
});

test("[assertProductionEnv] treats whitespace-only values as missing", () => {
  const env = { ...FULL_PROD_ENV, DATABASE_URL: "   " };
  assert.throws(() => assertProductionEnv(env), /DATABASE_URL/);
});
