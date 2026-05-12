// T-known-domains-startup-check — unit tests for the boot-time
// invariant runner. Uses the `domainsForTest` injection point so
// we can exercise pathological inputs without corrupting the
// production KNOWN_DOMAINS export.

import assert from "node:assert/strict";
import { test } from "node:test";

import { checkKnownDomainsAtStartup } from "../lib/known_domains_startup_check.js";

function silentLogger() {
  const messages = [];
  return {
    log: (msg) => messages.push(msg),
    error: (msg) => messages.push(msg),
    messages,
  };
}

// ---------- production export (healthy on main) ----------

test("[known-domains-startup] passes on the real production export", () => {
  const r = checkKnownDomainsAtStartup({ logger: silentLogger() });
  assert.equal(r.ok, true, `errors: ${JSON.stringify(r.errors)}`);
  assert.equal(r.errors.length, 0);
});

test("[known-domains-startup] throwOnError=true does not throw on the healthy export", () => {
  assert.doesNotThrow(() => {
    checkKnownDomainsAtStartup({ throwOnError: true, logger: silentLogger() });
  });
});

// ---------- non-array inputs ----------

test("[known-domains-startup] non-array input (object) returns ok=false instead of throwing", () => {
  const logger = silentLogger();
  const r = checkKnownDomainsAtStartup({ logger, domainsForTest: { not: "an array" } });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /not an array/.test(e)), `errors: ${JSON.stringify(r.errors)}`);
});

test("[known-domains-startup] non-array input (null) returns ok=false instead of throwing", () => {
  const r = checkKnownDomainsAtStartup({ logger: silentLogger(), domainsForTest: null });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /not an array/.test(e)));
});

test("[known-domains-startup] non-array input (string) returns ok=false instead of throwing", () => {
  const r = checkKnownDomainsAtStartup({ logger: silentLogger(), domainsForTest: "outbox" });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /not an array/.test(e)));
});

// ---------- empty array ----------

test("[known-domains-startup] empty array is flagged", () => {
  const r = checkKnownDomainsAtStartup({ logger: silentLogger(), domainsForTest: Object.freeze([]) });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /empty/.test(e)));
});

// ---------- frozen check ----------

test("[known-domains-startup] non-frozen array is flagged", () => {
  const r = checkKnownDomainsAtStartup({ logger: silentLogger(), domainsForTest: ["outbox"] });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /not frozen/.test(e)));
});

// ---------- duplicate entries ----------

test("[known-domains-startup] duplicate entry is flagged", () => {
  const r = checkKnownDomainsAtStartup({
    logger: silentLogger(),
    domainsForTest: Object.freeze(["outbox", "user_memory", "outbox"]),
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /duplicate entry: outbox/.test(e)));
});

// ---------- non-snake_case ----------

test("[known-domains-startup] non-snake_case entry is flagged", () => {
  const r = checkKnownDomainsAtStartup({
    logger: silentLogger(),
    domainsForTest: Object.freeze(["outbox", "UserMemory"]),
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /not lowercase|not snake_case/.test(e)));
});

test("[known-domains-startup] entry with dash is flagged as non-snake_case", () => {
  const r = checkKnownDomainsAtStartup({
    logger: silentLogger(),
    domainsForTest: Object.freeze(["outbox", "user-memory"]),
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /not snake_case: user-memory/.test(e)));
});

// ---------- whitespace ----------

test("[known-domains-startup] entry with leading whitespace is flagged", () => {
  const r = checkKnownDomainsAtStartup({
    logger: silentLogger(),
    domainsForTest: Object.freeze(["outbox", " user_memory"]),
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /whitespace/.test(e)));
});

// ---------- empty / non-string entries ----------

test("[known-domains-startup] empty-string entry is flagged", () => {
  const r = checkKnownDomainsAtStartup({
    logger: silentLogger(),
    domainsForTest: Object.freeze(["outbox", ""]),
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /non-string or empty/.test(e)));
});

test("[known-domains-startup] number entry is flagged as non-string", () => {
  const r = checkKnownDomainsAtStartup({
    logger: silentLogger(),
    domainsForTest: Object.freeze(["outbox", 42]),
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /non-string or empty/.test(e)));
});

// ---------- throwOnError semantics ----------

test("[known-domains-startup] throwOnError=true throws on corrupt input", () => {
  assert.throws(() => {
    checkKnownDomainsAtStartup({
      throwOnError: true,
      logger: silentLogger(),
      domainsForTest: ["bad"], // not frozen
    });
  }, /KNOWN_DOMAINS invariants violated/);
});

test("[known-domains-startup] default (warn) mode logs to logger.error", () => {
  const logger = silentLogger();
  const r = checkKnownDomainsAtStartup({
    logger,
    domainsForTest: { not: "an array" },
  });
  assert.equal(r.ok, false);
  assert.ok(logger.messages.length > 0);
  assert.match(logger.messages[0], /\[startup\] KNOWN_DOMAINS invariants violated/);
});
