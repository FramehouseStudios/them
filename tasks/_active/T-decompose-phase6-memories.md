---
id: T-decompose-phase6-memories
title: Decompose backend/index.js — Phase 6 (/memories/* cluster)
owner: support
status: review
branch: support/T-decompose-phase6-memories
pillar: infra (backend architecture)
v1_pillar: memory
v1_effect: closes V1 line 53 + 54 prerequisite by moving the /memories/* cluster (6 routes) into a testable lib — V1 memory pillar's iOS-facing contract now lives where decoders + tests can pin it
---

## Scope

Phase 6 of the decomposition (spec:
`docs/specs/T-decompose-backend-index.md`, design note #228).
Phase 5b (#238/#264/#273/#288) is complete; Phase 6 is the
next decomp arc per the spec.

**Extracts 6 inline routes** (~403 lines of inline body) into
`backend/lib/memories_route.js` with byte-identical behavior:

| Route | Behavior |
| --- | --- |
| `GET /memories` | list view + delta-no-change + If-None-Match etag + background theme backfill |
| `GET /memories/export` | full-dump envelope with embedded export_json string |
| `POST /memories/update` | mutate a memory card |
| `POST /memories/forget` | delete a memory card |
| `POST /memories/promote` | promote a card to a theme |
| `POST /memories/feedback` | record human feedback on a theme |

## Dependencies (31 functions + 2 constants)

### Request helpers (4)
- `parseQueryLimit`, `createRequestId`, `normalizeSnippet`, `clampUnit`

### Memory context (6)
- `selectMemoryRecordForRead`, `resolveWritableMemoryContext`,
  `sanitizePersistedSessionMemory`, `persistWritableMemoryContext`,
  `setPersistedUserMemoryForIp`, `normalizeClientToken`

### Read-state pipeline (3)
- `buildReadStateMeta`, `applyReadStateHeaders`, `ifNoneMatchStateHit`

### Memory builders (4)
- `buildConversationHistoryThreads`, `buildMemoryCards`,
  `buildMemoryQualitySnapshot`, `maybeBackfillThemesFromHistory`

### Export helpers (4)
- `buildTaskSnapshot`, `sanitizeActiveThemes`,
  `sanitizeRememberedPeople`, `formatLocalDateStamp`

### Identity normalizers (3)
- `normalizeAssistantSelfName`, `getAssistantSelfNameForIp`,
  `normalizeUserPersonName`

### Card mutators (7)
- `normalizeMemoryCardId`, `updateMemoryCardInMemory`,
  `forgetMemoryCardInMemory`, `promoteMemoryCardToThemeInMemory`,
  `resolveThemeKeyFromMemoryCard`, `normalizeMemoryQualitySignal`,
  `incrementThemeQualitySignal`

### Constants (2)
- `TASKS_MAX_STORED`, `USER_MEMORY_REMEMBERED_PEOPLE_MAX`

## Byte-identical invariants

All preserved per the #228 design note + the 3 already-merged
schema docs (memories-list.md, memories-mutate.md,
memories-export.md):

- **GET /memories**: full envelope + delta-no-change + 304
  paths all preserved; backfill side-effect on `applied:true`
  still fires `setPersistedUserMemoryForIp`.
- **GET /memories/export**: `filename` pattern unchanged
  (`clementine_memory_export_<YYYYMMDD>_<turnCount>.json`);
  `export_json` is the same 2-space-indented JSON with trailing
  newline; outer envelope key set unchanged.
- **All 4 mutation routes**: persist BEFORE building the
  response (the response always reflects post-mutation state);
  `memory_quality` is refreshed from the post-mutation cards;
  `applyReadStateHeaders` called exactly once per response.
- **Status verbs** per route unchanged (`updated` / `forgotten` /
  `promoted` / `hit|correction|not_editable|invalid_signal`).
- **Console log lines** preserved (now `console.warn` per the
  5b precedent for pre-flight's `console-log-in-lib` rule).
- **Body limit** unchanged at `256kb` on all 4 POSTs.

## #238 invariant inheritance

The lib does NOT introduce any new module-level state.
`setPersistedUserMemoryForIp` is preserved as a dep because the
inline GET /memories backfill path already calls it — that's a
write to an existing accessor, not a new state-replacement
setter. A regression test pins that this is the ONLY
setter-shaped dep accepted (any new setter would silently
violate the rule).

## V1 pillar / effect

- `V1 pillar: memory`
- `V1 effect: closes V1 line 53 ("iOS exposes a plain-language
  memory summary and refresh state") and V1 line 54 ("Human
  privacy decision is made for full memory export/delete")
  prerequisite work by moving the memory surface into a testable
  lib. The schema contracts are already on main; this PR moves
  the implementation under them so future changes (Phase 7,
  privacy redaction layer, etc.) can iterate on the lib without
  touching index.js.`

## Verification

```
node --test backend/tests/memories_route.test.mjs
```

→ **18/18 pass**:

- Exports + mount guards (4 tests): body-limit constant, null
  app rejected, missing-fn deps rejected (spot-check 10 of 31),
  non-number constants rejected.
- GET /memories (4 tests): full envelope, delta-no-change with
  `sinceVersion`, If-None-Match → 304, backfill side-effect on
  `applied: true`.
- GET /memories/export (1 test): envelope + embedded JSON
  parses cleanly + matches outer fields.
- POST /memories/update (2 tests): 200 success + 400 failure.
- POST /memories/forget (1 test): forgotten_id + theme_key
  echo.
- POST /memories/promote (1 test): theme_key + memory_card
  echo.
- POST /memories/feedback (3 tests): 200 on hit/correction,
  400 not_editable when no theme key, 400 invalid_signal.
- Persistence invariant (1 test): all 4 mutation routes call
  `persistWritableMemoryContext` exactly once.
- #238 invariant inheritance (1 test): only
  `setPersistedUserMemoryForIp` is accepted as a setter-shaped
  dep (the legitimate byte-identical write).

Plus:
- `node --check backend/index.js` passes.
- `backend/index.js` shrinks by **363 net lines** (403 inline
  → 40 mount call).
- Pre-flight clean.

## Done when

6 inline `/memories/*` routes no longer in `index.js`; lib file
exists with the PER-USER posture documented; 18/18 tests pass;
all invariants preserved.

## Next phase

Phase 6 is the largest single-PR extraction since Phase 2b.
Once it lands:

- Phase 7a (talk-state guards) opens per the #293 sub-design
  refinement note.
- Phase 7b (handleTalkRequest extraction) follows after 7a
  lands.
- Phase 7c (supplier glue) wraps the chain.

Per spec (max 1 decomp PR in flight), Phase 7a code does NOT
open until Phase 6 merges.
