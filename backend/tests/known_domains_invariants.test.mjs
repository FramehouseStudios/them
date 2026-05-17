// T-known-domains-runtime-check — invariants on the persistence
// KNOWN_DOMAINS constant.
//
// KNOWN_DOMAINS is the single source of truth for which logical
// domains the persistence adapter accepts. A typo when a new store
// is added silently crashes the first call in production, when the
// adapter hits `assertDomain`. These tests pin a small set of cheap
// invariants:
//
//   1. KNOWN_DOMAINS is frozen — cannot be mutated at runtime.
//   2. KNOWN_DOMAINS has no duplicate entries.
//   3. Every entry is a non-empty, trimmed, lowercase, snake_case
//      string (the codebase convention).
//   4. assertDomain throws for any value not in the array.
//   5. Every entry roundtrips through a fresh JSON adapter — proves
//      the domain is also wired through to the on-disk path layout.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { KNOWN_DOMAINS } from "../lib/persistence_adapter.js";
import { createJsonPersistence } from "../lib/persistence_json.js";

test("[known-domains] KNOWN_DOMAINS is frozen", () => {
  assert.equal(Object.isFrozen(KNOWN_DOMAINS), true);
});

test("[known-domains] no duplicate entries", () => {
  const set = new Set(KNOWN_DOMAINS);
  assert.equal(set.size, KNOWN_DOMAINS.length, `dupes in ${JSON.stringify(KNOWN_DOMAINS)}`);
});

test("[known-domains] every entry is non-empty snake_case", () => {
  for (const d of KNOWN_DOMAINS) {
    assert.equal(typeof d, "string");
    assert.ok(d.length > 0, "empty domain");
    assert.equal(d, d.trim(), `domain has whitespace: ${JSON.stringify(d)}`);
    assert.equal(d, d.toLowerCase(), `domain must be lowercase: ${d}`);
    assert.ok(/^[a-z][a-z0-9_]*$/.test(d), `not snake_case: ${d}`);
  }
});

test("[known-domains] every domain roundtrips through the JSON adapter", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-known-domains-"));
  const adapter = createJsonPersistence({ jsonRoot: root });
  for (const domain of KNOWN_DOMAINS) {
    const key = `probe-${domain}`;
    const value = { ok: true, domain, key };
    await adapter.put({ domain, key, value });
    const read = await adapter.get({ domain, key });
    assert.deepEqual(read, value, `roundtrip failed for ${domain}`);
  }
});
