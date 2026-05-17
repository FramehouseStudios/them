---
id: T-persistence-json-tests
title: Direct tests for backend/lib/persistence_json.js
owner: claude
status: merged
branch: claude/T-persistence-json-tests
pillar: infra (test coverage)
v1_pillar: infra
v1_effect: closes a zero-test-coverage gap on the JSON-file-backed persistence adapter that every store relies on for disk persistence in single-process mode (talk-pipeline session writes, creative_memory, outbox, screenplay, accepted_twists, etc.)
---

## Scope

Ships `backend/tests/persistence_json.test.mjs` — 20 direct
tests for `createJsonPersistence` covering the full adapter
surface that the per-domain stores rely on.

### Coverage

- Factory shape (`kind`, `root`, all 6 methods).
- Default root constant is absolute + ends under `backend/data/persistence`.
- Root directory created at construction time.
- `put` + `get` round-trip.
- `get` returns null for unknown key.
- `put` overwrites existing value.
- `delete` removes the key; no-op on unknown.
- `list` returns alphabetical key+value pairs.
- `list` honors prefix filter.
- `list` honors limit (with default-to-1000 / clamp).
- `list` returns empty on cold domain.
- `clear` empties the domain; other domains untouched.
- Domain isolation (same key in different domains).
- File durability: `put` writes `<domain>.json`; new adapter on
  the same root sees prior data.
- `close()` is a no-op (parity with the Postgres adapter).
- `put` rejects unknown domain via `assertDomain`.
- `put` rejects empty key via `assertKey`.

## V1 pillar / effect

- `V1 pillar: infra`
- `V1 effect: closes a zero-test-coverage gap on the
  persistence adapter that every store uses in single-process
  mode. The talk pipeline, creative_memory, outbox, screenplay
  store, and accepted_twists log all persist through this lib.
  Regression in put/get/list/delete would silently corrupt
  state for V1 surfaces.`

## Verification

```
node --test backend/tests/persistence_json.test.mjs
```

→ **20/20 pass**.

## Done when

`persistence_json.test.mjs` ships and passes. `pre-flight`'s
`lib-missing-test` rule no longer flags `persistence_json.js`.
