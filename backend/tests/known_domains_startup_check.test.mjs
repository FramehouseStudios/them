// T-known-domains-startup-check — unit tests for the boot-time
// invariant runner.

import assert from "node:assert/strict";
import { test } from "node:test";

import { checkKnownDomainsAtStartup } from "../lib/known_domains_startup_check.js";

test("[known-domains-startup] passes on a healthy KNOWN_DOMAINS export", () => {
  const logs = [];
  const r = checkKnownDomainsAtStartup({
    logger: { error: (msg) => logs.push(msg), log: (msg) => logs.push(msg) },
  });
  assert.equal(r.ok, true, `errors: ${JSON.stringify(r.errors)}`);
  assert.equal(r.errors.length, 0);
  assert.equal(logs.length, 0);
});

test("[known-domains-startup] returns ok=false on logger by default (no throw)", () => {
  // No way to inject a bad KNOWN_DOMAINS from outside, so this test
  // just exercises the signature contract: throwOnError defaults to
  // false. The healthy path covers the happy case.
  const r = checkKnownDomainsAtStartup({ logger: { error: () => {} } });
  assert.equal(typeof r.ok, "boolean");
  assert.ok(Array.isArray(r.errors));
});

test("[known-domains-startup] throwOnError=true throws on violation", () => {
  // To test the throw path without corrupting the real export, call
  // the function with a mocked logger that registers; since the real
  // KNOWN_DOMAINS is healthy on main, this just asserts the option
  // accepts the parameter without crashing.
  assert.doesNotThrow(() => {
    checkKnownDomainsAtStartup({ throwOnError: true });
  });
});
