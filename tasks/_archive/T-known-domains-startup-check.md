---
id: T-known-domains-startup-check
title: Boot-time invariant check on KNOWN_DOMAINS
owner: support
status: merged
branch: support/T-known-domains-startup-check
pillar: infra (persistence)
---

## Scope

PR #115 pins KNOWN_DOMAINS invariants in unit tests. But unit tests
only run in CI / dev. A production deploy can still ship with a
corrupted KNOWN_DOMAINS (someone strips the `Object.freeze`, adds
a non-snake_case alias, or accidentally duplicates an entry).

This PR adds `lib/known_domains_startup_check.js` and calls it from
the server bootstrap. The check runs the same invariants as PR #115
(frozen, non-empty, all-string, trimmed, lowercase, snake_case, no
duplicates) at boot:

- Default (warn) mode: log a clear `[startup] KNOWN_DOMAINS
  invariants violated: ...` line and continue.
- `throwOnError=true`: throw, useful for a future "strict boot"
  flag.

Cheap — no I/O, single array iteration. Catches drift at deploy
time instead of at the first persistence call.

## Done when

`checkKnownDomainsAtStartup()` runs on server boot; happy path logs
nothing; tests cover the contract; `npm test` green.
