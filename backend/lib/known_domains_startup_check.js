// T-known-domains-startup-check — boot-time invariant check on
// KNOWN_DOMAINS.
//
// PR #115 (T-known-domains-runtime-check) pinned KNOWN_DOMAINS
// invariants in the unit-test loop (frozen, no duplicates,
// snake_case, JSON roundtrip). But unit tests only run in CI / dev.
// A deployment can still ship with a corrupted KNOWN_DOMAINS export
// (someone edits the array, the freeze line gets stripped, a
// non-snake_case alias creeps in). This module runs the same checks
// at server-boot and either logs a hard warning or throws (per
// the caller's preference).
//
// Cheap — no I/O, just iterates the constant array.

import { KNOWN_DOMAINS as PRODUCTION_KNOWN_DOMAINS } from "./persistence_adapter.js";

function checkKnownDomainsAtStartup({
  logger = console,
  throwOnError = false,
  // Optional injection point so the script can be unit-tested
  // against pathological inputs (non-array, empty, dupes,
  // non-snake_case) without corrupting the production constant.
  domainsForTest = undefined,
} = {}) {
  const domains = domainsForTest === undefined ? PRODUCTION_KNOWN_DOMAINS : domainsForTest;
  const errors = [];

  if (!Array.isArray(domains)) {
    errors.push(`KNOWN_DOMAINS is not an array (got ${typeof domains})`);
  } else {
    if (!Object.isFrozen(domains)) {
      errors.push("KNOWN_DOMAINS is not frozen (callers can mutate it at runtime)");
    }
    if (domains.length === 0) {
      errors.push("KNOWN_DOMAINS is empty");
    }
    const seen = new Set();
    for (const d of domains) {
      if (typeof d !== "string" || d.length === 0) {
        errors.push(`KNOWN_DOMAINS contains a non-string or empty entry: ${JSON.stringify(d)}`);
        continue;
      }
      if (d !== d.trim()) {
        errors.push(`KNOWN_DOMAINS entry has whitespace: ${JSON.stringify(d)}`);
      }
      if (d !== d.toLowerCase()) {
        errors.push(`KNOWN_DOMAINS entry not lowercase: ${d}`);
      }
      if (!/^[a-z][a-z0-9_]*$/.test(d)) {
        errors.push(`KNOWN_DOMAINS entry not snake_case: ${d}`);
      }
      if (seen.has(d)) {
        errors.push(`KNOWN_DOMAINS duplicate entry: ${d}`);
      }
      seen.add(d);
    }
  }

  if (errors.length > 0) {
    const msg = `KNOWN_DOMAINS invariants violated:\n  - ${errors.join("\n  - ")}`;
    if (throwOnError) throw new Error(msg);
    (logger.error || logger.log).call(logger, `[startup] ${msg}`);
    return { ok: false, errors };
  }
  return { ok: true, errors: [] };
}

export { checkKnownDomainsAtStartup };
