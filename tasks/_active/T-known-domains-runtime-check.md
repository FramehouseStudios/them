---
id: T-known-domains-runtime-check
title: KNOWN_DOMAINS invariants (frozen, snake_case, roundtrip)
owner: claude
status: merged
branch: claude/T-known-domains-runtime-check
pillar: infra (persistence)
---

## Scope

`KNOWN_DOMAINS` (in `backend/lib/persistence_adapter.js`) is the
single source of truth for which logical domains the adapter accepts.
A typo when a new store is added silently crashes the first call in
production when `assertDomain` runs. This PR adds cheap invariants:

1. `KNOWN_DOMAINS` is frozen — no late mutation.
2. No duplicate entries.
3. Every entry is non-empty, trimmed, lowercase, snake_case.
4. Every entry roundtrips through a fresh JSON persistence adapter
   (proves the domain is wired through to the on-disk path layout,
   not just declared).

No production code change. Catches regressions inside the unit-test
loop instead of at the first production call.

## Done when

`backend/tests/known_domains_invariants.test.mjs` covers all four
invariants; `npm test` green.
