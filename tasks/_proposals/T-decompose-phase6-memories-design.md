---
id: T-decompose-phase6-memories-design
title: Phase 6 design note — /memories/* cluster (6 routes)
owner: support
status: proposed
target_pr: none yet (gating note; Phase 6 code opens only after Codex accepts)
pillar: infra (backend architecture)
v1_pillar: memory
v1_effect: infrastructure for "iOS exposes a plain-language memory summary and refresh state" (V1 line 53) + "Manual smoke: mention character -> later suggestion recalls them" (V1 line 55)
---

## Scope

Phase 6 extracts the `/memories/*` cluster from `backend/index.js`.
6 routes, ~620 lines of inline body. The handlers touch the
**session-memory write path** (separate from the
`creative_memory_store.js` lib that other PRs already extracted).

This is a **design note**. No Phase 6 code opens until Codex signs
off.

## V1 pillar / effect

- `V1 pillar: memory`
- `V1 effect: infrastructure for "iOS exposes a plain-language
  memory summary and refresh state" (V1 line 53) — the routes that
  build the summary are these handlers. Also for "Manual smoke:
  mention character -> later suggestion recalls them" (V1 line 55)
  by giving the recall path a dedicated lib + tests.`

## Routes in scope

| # | Method | Path | Lines | What it does |
| --- | --- | --- | --- | --- |
| 1 | GET | `/memories` | ~88 | Returns per-user memory summary + history threads + theme backfill on the read path |
| 2 | GET | `/memories/export` | ~67 | Returns the full memory record (tier-3 sensitive — gated by `#94 needs-human` blocker) |
| 3 | POST | `/memories/update` | ~58 | Mutates session memory fields (theme set, mood note, etc.) |
| 4 | POST | `/memories/forget` | ~48 | Forgets a specific memory item (turn / theme / character) |
| 5 | POST | `/memories/promote` | ~53 | Promotes a memory item to "preserved" status (resists eviction) |
| 6 | POST | `/memories/feedback` | ~55 | Records user feedback on a memory item (helpful / wrong / private) |

Target lib: `backend/lib/memories_routes.js` with
`mountMemoriesRoutes(app, deps)`. All 6 in one file because they
share the memory write path's helpers (~25 deps).

## Phasing decision

Phase 6 ships as **one PR**, not split. Reasoning:

1. The 6 routes share the same deps surface (the memory write
   path). Splitting would require duplicating the dep wiring.
2. Cumulative size (~620 lines) is comparable to Phase 2b (#197)
   which shipped as one PR.
3. Each handler is independently small (~50-90 lines); the lib
   file ends up ~700 lines total — reviewable.

If Codex prefers a 2-PR split (reads in 6a, writes in 6b), the
note amends.

## Deps surface

~25 deps. Most are shared across handlers:

**Read path** (used by `/memories` + `/memories/export`):
- `selectMemoryRecordForRead`, `sanitizePersistedSessionMemory`,
  `buildConversationHistoryThreads`, `maybeBackfillThemesFromHistory`,
  `setPersistedUserMemoryForIp`, `getPersistedUserMemoryForUserId`
- `normalizeClientToken`, `clientIp`, `normalizeClientIp`
- `applyReadStateHeaders`, `buildReadStateMeta`
- `parseQueryLimit`

**Write path** (used by `/update`, `/forget`, `/promote`, `/feedback`):
- `resolveWritableMemoryContext`, `persistWritableMemoryContext`,
  `updateSessionEmotionMemory`, `updateSessionAfterReply`
- `sanitizeSnippet`, `normalizeSnippet`
- `recordUserTalkMetrics`, `getUserMetricState`
- `storeTalkTurnMeta` (when a feedback creates an audit trail)

**Tier-3 specific** (used by `/memories/export` only):
- The export route is the one gated by the `creative-memory-export-
  privacy` blocker. The lib should accept a `protectExportRoute`
  middleware as a dep; when omitted, the route returns 503
  `auth_unconfigured` (matches existing inline behavior — the
  inline handler today checks `req.user` and rejects unauthenticated
  callers).

## Access-control postures (per route)

| Route | Posture | Notes |
| --- | --- | --- |
| `GET /memories` | PER-USER | Owner record resolved from request; reads only own memory |
| `GET /memories/export` | **TIER-3 SENSITIVE** | Full memory dump; blocker `creative-memory-export-privacy` still applies |
| `POST /memories/update` | PER-USER | Writes to own memory only |
| `POST /memories/forget` | PER-USER | Forgets within own memory only |
| `POST /memories/promote` | PER-USER | Promotes within own memory only |
| `POST /memories/feedback` | PER-USER | Records feedback against own memory |

Postures are documented in the lib's module header.

## Invariants Phase 6 must preserve

1. **Memory read backfill**: `/memories` triggers
   `maybeBackfillThemesFromHistory` on the read path; if backfill
   succeeds, the memory is rewritten via
   `setPersistedUserMemoryForIp`. This is **a write on a read** —
   subtle. Tests must verify the backfill path still fires.
2. **State version + headers**: `/memories` emits
   `x-state-version`, `x-session-id`, `x-last-turn-id`. iOS reads
   these for cache invalidation.
3. **Memory write idempotency**: every write returns the new
   `state_version`. Two consecutive identical writes produce two
   identical state versions (no spurious bumps).
4. **Forget semantics**: `/memories/forget` with a non-existent id
   returns 200 + `{ status: "noop" }`, not 404. iOS depends on
   this for retry safety.
5. **Promote semantics**: `/memories/promote` is idempotent. Two
   promotes on the same item produce the same final state.
6. **Feedback recording**: feedback writes a row to the memory's
   `feedback` array; never deletes existing feedback.
7. **Export gating**: `/memories/export` returns 503 when
   `requireMemoryExportAuth` is not configured (matches inline
   behavior). When configured, it returns the full record.

## Cross-phase coordination

**Phase 5b.3 (`/realtime/turn_commit`)** also touches the memory
write path. The two PRs must not race. Coordination:

- Phase 6 opens **after** Phase 5b.3 lands, OR
- Phase 5b.3 explicitly imports the memory write helpers as deps
  (already in its design) so Phase 6 can extract those helpers'
  call sites into the new lib without changing 5b.3's wiring.

Recommendation: Phase 6 waits for Phase 5b.3 to settle. The
memory write path is shared, and extracting both at the same time
creates a merge conflict on every helper rename.

## Tests

`backend/tests/memories_routes.test.mjs` covers:

- Required-deps guard for all ~25 deps.
- `GET /memories` happy path with cold + warm fixtures.
- `GET /memories` backfill-on-read: a fixture that triggers
  backfill, verify the memory mutates.
- `GET /memories/export` with `requireMemoryExportAuth` omitted
  → 503.
- `GET /memories/export` with auth dep configured → full record.
- `POST /memories/update` round-trip.
- `POST /memories/forget` with non-existent id → 200 + noop.
- `POST /memories/promote` idempotency.
- `POST /memories/feedback` writes a row.
- No-leakage scan on response (no `passwordHash`, `salt`,
  `appleSubject`, raw refresh tokens).

## What Phase 6 does NOT do

- No behavior changes.
- No memory write semantics changes.
- No new fields in the memory record or response envelopes.
- No coupling with the `creative_memory_store.js` lib (separate
  from `memory_store.js`'s session-memory path).
- No privacy-policy change for `/memories/export` (blocker still
  applies).

## What we need from Codex before opening Phase 6

1. **Sign-off on the 1-PR (not split) approach**. If Codex prefers
   a 2-PR reads/writes split, the note amends.
2. **Sign-off on the `requireMemoryExportAuth` dep pattern**. The
   lib mounts `/memories/export` regardless; the dep gates it. If
   Codex prefers the lib NOT mount `/memories/export` when the
   dep is omitted, the note amends.
3. **Coordination with Phase 5b.3**. Phase 6 opens after 5b.3
   lands, unless Codex says it's safe to parallelize.

## Rollback plan

Single revert of the merge commit restores the 6 inline handler
blocks. No state migration.

## After this design note

If Codex accepts:
1. Phase 6 opens after Phase 5b.3 merges (or per Codex direction).
2. The lib file ships with the 6 handlers + required-deps guard
   + tests.
3. `docs/schemas/memory-stats.md` ships alongside (separate PR)
   to document the `GET /memories` response envelope.
