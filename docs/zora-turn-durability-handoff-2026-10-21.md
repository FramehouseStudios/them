# T-1118 accepted `/talk` result durability handoff — 2026-10-21

## Identity and scope

- **VERIFIED:** branch `codex/T-1118-zora-turn-durability`, worktree
  `/Users/halfmutantfilms/io.them-worktrees/codex-zora-turn-durability`.
- **VERIFIED:** clean starting head
  `d9f3a99c1907f616294cb175989c3793f54b07b1`; underlying runtime/document
  checkpoint `9d897e50050bc580be962b040b7c09895cee8c89`.
- **VERIFIED:** local implementation commit `6385dcb` (`fix: persist accepted
  talk results across restart`). The commit containing this handoff is reported
  separately at delivery because a commit cannot contain its own object id.
- **DECIDED:** this slice owns only canonical backend persistence/result code,
  the deterministic probe, focused tests, T-1118 and this ledger. It does not
  own raw-audio routing, Swift/client code, `backend/index.js`, or un-delegated
  `backend/lib/talk_handler.js` changes.

## Reproduction and binary success criteria

The new probe `backend/evals/probe_talk_restart_durability.mjs` uses the
existing authenticated child-process harness, two synthetic accounts, isolated
task data, a real Page `/talk` request, stable idempotency keys, deterministic
intercepted STT/chat/TTS providers, and a seeded local wallet. It accepts the
complete HTTP response before stopping the owned child. It separately tests a
normal stop and `SIGKILL`, starts a fresh backend against the same data, rotates
the client token, reads the turn as owner and other account, then retries the
same request.

Success is binary: owner metadata `200`, other account `403`, replay header
`1`, identical turn id and bytes, zero fresh provider calls, and unchanged
post-acceptance balance after both restart types.

**VERIFIED red result at current branch head (the facade is intentionally not
wired):**

| Boundary | Owner read | Other read | Replay | Same turn | Fresh providers | Balance after retry |
|---|---:|---:|---|---:|---|---|
| Before restart | 200 | 403 | n/a | n/a | STT 1 / chat 2 / TTS 23 | Initial acceptance did not change fixture balance |
| Graceful restart | 404 | 404 | absent | no | STT 1 / chat 2 / TTS 23 | unchanged |
| Forced termination after response | 404 | not re-read | absent | no | STT 1 / chat 2 / TTS 23 | unchanged |

The deterministic response bytes happened to match after regeneration. That
is **not** replay evidence: the turn id changed, the replay header was absent,
and all providers ran again. The wallet fixture showed no debit on initial
acceptance, so this probe verifies that no additional debit appeared but does
**not** prove duplicate-charge prevention for a charged production turn.

## Root cause

1. **VERIFIED by source and process reproduction:** `talkTurnMetaById` is a
   process-local map in `backend/index.js`; it is neither persisted nor hydrated.
2. **VERIFIED by source:** completed idempotency responses were process-local
   unless Redis was configured. `scale_backplane.mjs` had no canonical shared
   persistence fallback. The checked-in Render blueprint declares Postgres but
   no Redis; this is repository configuration, not a live deployment audit.
3. **VERIFIED by source:** success persistence was fire-and-forget, so an HTTP
   success could be acknowledged before the replay record was durable.
4. **VERIFIED by focused negative test:** the old lookup scope followed the
   client/session token. An authenticated retry with a rotated token could miss;
   conversely, carrying a prior owner's token was the wrong authority boundary.
5. **VERIFIED by source:** wallet settlement and accepted-result persistence
   have separate boundaries. Without awaited result persistence, an accepted
   charged turn could be settled while its replay evidence was still volatile.

## Implemented capability

Commit `6385dcb` adds the unwired capability without a second conversation
database:

- `backend/lib/persistence_adapter.js` registers canonical
  `talk_idempotency` and `talk_turns` domains.
- `backend/migrations/013_talk_result_durability.sql` adds the two Postgres
  JSONB domain tables in an idempotent transaction.
- `backend/lib/scale_backplane.mjs` accepts the existing persistence adapter,
  stores the canonical idempotency response there before caching it in Redis,
  base64-encodes audio for byte-exact JSON/Postgres recovery, falls back from a
  Redis miss to persistence, expires stale records, and bounds retained rows.
- `backend/lib/talk_state.js` scopes authenticated idempotency to the trusted
  server user id, awaits pending-record storage, and persists a completed result
  before publishing it to the process cache.
- `backend/lib/talk_turn_store.js` is the extracted bounded metadata capability:
  persistence-before-cache, startup hydration, 30-minute default retention and
  4,000-entry default cap. Sanitization and HTTP authorization stay with the
  existing facade.
- Focused tests cover byte-exact restart recovery, expiry, metadata hydration,
  persistence failure before cache publication, rotated/stale-token account
  isolation, and known persistence domains.

Default replay retention remains five minutes / 160 entries. Default turn
metadata retention remains 30 minutes / 4,000 entries. These are bounded
recovery windows, not permanent conversation history.

## Exact files changed in `6385dcb`

- `backend/evals/probe_talk_restart_durability.mjs`
- `backend/lib/persistence_adapter.js`
- `backend/lib/scale_backplane.mjs`
- `backend/lib/talk_state.js`
- `backend/lib/talk_turn_store.js`
- `backend/migrations/013_talk_result_durability.sql`
- `backend/tests/persistence_adapter.test.mjs`
- `backend/tests/talk_result_persistence.test.mjs`
- `backend/tests/talk_state.test.mjs`

This documentation checkpoint additionally changes `TASKS.md` and this file.
No Swift, native, raw-voice, `backend/index.js`, or
`backend/lib/talk_handler.js` source was changed.

## Reserved integration required

**BLOCKED BY:** the capability is not reachable from real HTTP until the
Jarvis-owned facade is wired. Do not mark T-1118 complete before all steps below
land together and the probe turns green.

1. In `backend/index.js`, import `createTalkTurnStore`.
2. Construct `sharedPersistence = createPersistence()` before
   `createScaleBackplane`, and pass `persistence: sharedPersistence` into
   `createScaleBackplane`.
3. Replace `talkTurnMetaById` with one `createTalkTurnStore` using
   `TALK_TURN_META_TTL_MS` and `TALK_TURN_META_MAX_ENTRIES`; await `hydrate()`
   during startup.
4. Preserve the existing metadata sanitization. Make `storeTalkTurnMeta` async,
   build the same sanitized entry, and `await talkTurnStore.put(entry)` instead
   of mutating the map. Read with `talkTurnStore.get(turnId)` and supply
   `talkTurnStore.values()` to `getAllTalkTurns`.
5. In `backend/lib/talk_handler.js`, add `await` to both existing
   `storeTalkTurnMeta(...)` calls (currently near lines 3103 and 5138). Update
   `backend/tests/talk_turn_meta_screenplay_length.test.mjs` to make its test
   async and await the store call.
6. Add `await` to all four existing `commitTalkIdempotencySuccess(...)` calls
   (currently near lines 3235, 5247, 5384 and 5587). Jarvis explicitly offered
   those four call-site hunks, but the local ownership guard rejected editing
   the reserved file, so this branch contains no partial facade change.
7. Apply migration `013` before starting the integrated production service.

The response must not be ended/sent until metadata and the completed replay
record are durable. Existing error handling should return/recover from a durable
write failure rather than acknowledge an unrecoverable success. The two rows
are not one cross-table SQL transaction: metadata is written first, then the
replay response. An acknowledged response can be made to require both, but a
failed second write can leave harmless metadata without an acknowledged result.

After wiring, run the probe exactly as documented below. Green must show zero
provider calls on each fresh retry, the original turn id and bytes, owner `200`,
other `403`, replay header `1`, and stable balance.

## Compatibility and unsupported boundaries

- PostgreSQL is the intended shared production backend after migration `013`.
  The JSON adapter supports local single-process restart proof; it is not a
  clustered/shared-filesystem guarantee.
- Redis remains an optional cache. Persistence is canonical and must be passed
  into the backplane; Redis absence must not disable restart recovery.
- A process killed while a request is still pending can retain a bounded
  `pending` record until the five-minute TTL. This task proves only termination
  after the complete HTTP response, as assigned.
- Audio is recoverable only inside the bounded idempotency response window.
  Metadata has its separate 30-minute window. No permanent audio archive was
  added.
- No live Render dashboard, production database, deployment, paid provider,
  charged-wallet, client, phone, export, or end-to-end product journey was
  tested here.

## Verification ledger

Commands were run from the task worktree. Providers were intercepted; no paid
model call or private environment file was used.

- Red real-process probe (Node 20.20.2):
  `node --max-http-header-size=65536 backend/evals/probe_talk_restart_durability.mjs`
  in the repository's local Node 20 image. Exit 1 at the intentional integrated
  assertions; observations are the table above.
- Exact-lock focused Node 20 set:
  `fast_uri_security`, `talk_state`, `talk_result_persistence`, and
  `talk_turn_owner_isolation`: **43 pass / 0 fail / 0 skip**.
- Exact-lock full Node 20 backend checkpoint: **2,922 tests / 2,920 pass /
  0 fail / 2 skip**, duration 81,944 ms.
- An earlier full run against a stale shared dependency directory reported
  **2,916 pass / 4 fail / 2 skip**, all in `fast_uri_security`; inspection found
  cached `fast-uri` 3.1.8 while `package-lock.json` requires 3.1.9. A task-owned
  `npm ci` with the exact lock made those tests and the full suite green. No
  shared dependency cache was changed.
- `node --check` passed for `scale_backplane.mjs`, `talk_state.js`,
  `talk_turn_store.js`, and the restart probe.
- `node scripts/check_god_files.mjs --json`: pass against `origin/main`;
  monitored counts were index 33,626→33,513, Studio 17,435→17,337, Root
  15,112→14,937, bridge 12,952→12,796, MemoryAPI 10,865→10,463. Against the
  exact T-1118 starting head, no monitored file changed.
- `git diff --check`: pass before the implementation commit and at the
  documentation checkpoint.

## Seven-part report

1. **Completed:** reproduced accepted-result loss/re-generation across graceful
   restart and post-response SIGKILL; implemented and unit/integration-tested
   the canonical persistence, hydration, byte recovery and owner-scope layer.
2. **Files changed:** the nine files listed for `6385dcb`, plus `TASKS.md` and
   this handoff. No native/client or reserved facade source changed.
3. **Root issues fixed:** durable adapter domains/tables, byte-safe replay
   serialization, persistence fallback, persistence-before-cache, authenticated
   user scoping, bounded metadata hydration. **Not yet fixed in HTTP:** facade
   construction and awaited success/metadata call sites.
4. **Verification:** exact Node 20 full backend **2,920/0/2** plus focused
   **43/0/0**, syntax/D009/diff pass; the real restart probe remains correctly
   red until reserved wiring.
5. **GitHub status:** local branch and commits only. No push, PR, review, merge,
   deployment, production mutation or provider spend.
6. **Next active task:** Jarvis applies the seven reserved integration steps,
   runs migration `013` in the intended environment, then reruns the focused
   probe and one proportionate full checkpoint.
7. **BLOCKED BY:** missing Jarvis-owned `backend/index.js` construction/
   hydration and awaited `backend/lib/talk_handler.js` publication boundaries.
   Integrated restart durability is not yet proven.
