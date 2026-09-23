---
id: T-deeper-lib-tests-batch-2
title: Deeper tests for persona + utils + screenplay_store + outbox_store
owner: support
status: merged
branch: support/T-deeper-lib-tests-batch-2
pillar: infra (test coverage)
v1_pillar: infra
v1_effect: closes the deeper coverage gap for 4 of the 7 stateful libs the V1 surface depends on (persona drives talk pipeline; screenplay_store backs screenplay studio; outbox_store carries durable side-effects; utils is the shared toolbox)
---

## Scope

Ships the **deeper** tier of coverage for 4 stateful libs that
already had a smoke tier. Mirrors the precedent set by #241
(deeper memory_store + user_auth in one PR).

### persona_deeper.test.mjs (10 tests)

Extends `persona.test.mjs` smoke. Exercises the three exported
helpers and a couple of derived-shape invariants the smoke left
on the table:
- `normalizeSystemPrompt` trims, is idempotent, tolerates nullish.
- `appendDirectorAddendum` appends, no-ops on empty, tolerates
  null.
- `withOutputContract` adds contract content, is deterministic.
- `CLEMENTINE_PROFILE` carries configured voice + model ids.
- `PERSONA_ENFORCEMENT_ADDENDUM` is a non-empty string.

### utils_deeper.test.mjs (16 tests)

Extends `utils.test.mjs` smoke:
- `createRequestId` 16-char hex + 1000-call uniqueness.
- `escapeRegex` escapes every regex special char + plain text
  unchanged.
- `normalizeElevenLabsVoiceId` URL-pathname extraction.
- `resolveStorePath` absolute / relative-to-backend / fallback.
- `writeJsonFileAtomic` round-trip + parent-dir creation.
- `slugifyForFilename` lowercases + fallback.
- `clampUnit` clamps to [0,1] + non-finite fallback.

### screenplay_store_deeper.test.mjs (10 tests)

Extends `screenplay_store.test.mjs` smoke:
- `recalculateScreenplayProject` on zero-version projects, with
  all-pending collaborators, with mixed-status collaborators.
- `markScreenplayOwnerDirty` triggers disk write + bumps
  updatedAt.
- `getLatestScreenplayVersion` with mixed updatedAt + createdAt.
- Multi-owner save+load round-trip.
- `ensureScreenplayOutline` idempotence + project mutation.

### outbox_store_deeper.test.mjs (10 tests)

Extends `outbox_store.test.mjs` smoke:
- Duplicate-key behavior (scaleBackplane returns duplicate:true).
- Explicit actionKey override.
- `computeOutboxRetryAt` for negative + zero attempts.
- `buildOutboxActionKey` deterministic + type-normalizing.
- `lastError` snippet length cap (640).
- `processOutboxBatch` honors limit.
- `calendar_compose` fallback target.

## V1 pillar / effect

- `V1 pillar: infra`
- `V1 effect: closes the deeper coverage gap for 4 of the 7
  stateful libs the V1 surface depends on. persona drives the
  talk pipeline. screenplay_store backs the screenplay studio.
  outbox_store carries durable side-effects (email/calendar).
  utils is the shared toolbox imported by every other lib.`

## Verification

```
node --test backend/tests/persona_deeper.test.mjs \
              backend/tests/utils_deeper.test.mjs \
              backend/tests/screenplay_store_deeper.test.mjs \
              backend/tests/outbox_store_deeper.test.mjs
```

→ **46/46 pass** (10 + 16 + 10 + 10).

## Done when

All 4 test files ship + pass; `T-untested-libs-followups` can
mark the deeper tier complete for these 4 libs.

## After this PR

7-of-7 stateful libs covered at smoke + deeper:
- utils (smoke #208, deeper here)
- persona (smoke #218, deeper here)
- screenplay_store (smoke #192, deeper here)
- outbox_store (smoke #197, deeper here)
- memory_store (smoke #216, deeper #241)
- user_store (smoke #218, deeper #237)
- user_auth (smoke #218, deeper #241, round-trip #242)
