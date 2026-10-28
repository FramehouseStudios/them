> Historical handoff for candidate 2e2a39d5. Subsequent commits a4dfc70 and
> e3c942a replace full-content markers with digest-only markers and require
> explicit request selection. This document does not describe the final
> integration or establish native/UI proof; see the integration handoff.

# T-1203 exact Load Server authority handoff

## Boundary

- Base: `4a3525cc04a2bb8b9d19dd93bdf9861b341bc744`
- Branch/worktree: `codex/T-1203-exact-load-server-authority` at
  `/Users/halfmutantfilms/io.them-worktrees/codex-T1203-exact-load-server-authority`
- Rejected candidate `1f03d3574b39768a016185ae9def9c572a5b6a9a`
  remains untouched in its separate worktree.
- Owned here: `them/ScreenplayDraftSaveOutbox.swift`, focused
  `themTests/ScreenplayDraftSaveOutboxTests.swift`, and this handoff.
- Jarvis owns VM/UI integration, native jobs, publication and merge decisions.

No push, simulator, xcodebuild, backend, provider call, deployment, T1201
change or Jarvis-checkout mutation is part of this lane.

## Corrected authority model

The rejected candidate used a wall-clock cutoff as deletion authority. That
could sweep unrelated pending/inflight writer edits and could miss a delayed
request whose outbox entry was materialized with a newer timestamp.

This replacement never uses `createdAt` to select, retire or fence a request.

- `ScreenplayDraftSaveRequestAuthority` is an immutable UUID + generation that
  Jarvis must create with `DraftSaveRequest` and preserve unchanged through
  rebasing, outbox materialization, retries and delayed conflict replies.
- `captureLoadServerSelection` selects only exact canonical conflict rows
  already parked with the conflict reason, plus exact request snapshots the VM
  explicitly supplies. Ordinary pending/inflight rows are never inferred from
  scope, age or generation range.
- `resolveLoadServerSelection` removes only those exact IDs after revalidating
  immutable request bytes, owner/project/origin, authority, base and metadata.
- Each retired request gets a durable same-ID marker. Admission and exact
  conflict retention match request ID + immutable authority + request payload;
  a different ID remains independent even when it has the same authority.
- A missing request-authority on a legacy conflict fails closed and leaves the
  row intact.
- Persistence failure rolls back both active rows and markers in memory while
  the prior atomic file remains unchanged.

`createdAt` should still be stable for queue ordering and Jarvis has separately
committed that fix at `43f6586`, but it is not deletion or fence authority.

## Array-only downgrade audit

The manifest remains the exact array root expected by `4a3525c`; no object
envelope or sidecar is introduced. The new optional fields are additive.

Array decoding alone was not sufficient because an older app drops unknown
fields whenever it rewrites the queue. The compatibility marker therefore also
encodes its complete retirement identity as a versioned base64 JSON payload in
old-known `source`/`notes` fields. On return to the new app, the marker is
rehydrated even after the old app stripped `requestAuthority` and
`loadServerRetirement`.

Actual prior-app behavior was audited against the `4a3525c` algorithms:

- The marker uses a sentinel owner/project/document origin. The old
  `beginNext(project, owner)` therefore selects the real pending row, not the
  earlier parked marker; unrelated saves are not blocked.
- Old `markSucceeded` removes parked rows only in the completed row's exact
  owner/project/origin. The sentinel marker survives a normal save.
- Old `removeAll(actualProject, actualOwner)` does not match the sentinel marker.
- A late retired request reusing the same ID hits the old enqueue ID check, but
  sentinel scope differs, so the old app returns the existing 409 reuse error
  before network delivery. Marker status does not change that collision.
- Old retry/inflight-recovery mutations may change marker status/error and drop
  new fields. The old-known payload survives; the new app normalizes the marker
  back to parked and keeps fencing the request.
- The prior global snapshot counts one conservative parked sentinel after
  downgrade, but the actual Screen notification ignores that payload and calls
  `refreshDraftSaveOutboxStatus`, whose owner-scoped snapshot excludes the
  sentinel. The reviewed prior UI therefore does not publish a false owner
  “local save needs attention” status from this marker.

Remaining rollback risk: an old build could remove the marker only by calling
`remove(id:)`/`markSucceeded(id:)` for that exact retired request or by clearing
the sentinel scope/storage. Normal downgraded admission cannot produce such a
server acknowledgement because the same-ID sentinel blocks delivery; broad
actual-project cleanup does not match it. A manual storage reset remains
destructive by definition. This is fail-closed operational compatibility, not
an assertion that the old UI understands the new decision.

## Jarvis integration steps

1. Add `requestAuthority` to `DraftSaveRequest`; capture it once at request
   creation and preserve it in every initializer/rebase/outbox projection.
   Jarvis's stable `createdAt` fix remains separate and should also be retained.
2. Replace both broad conflict calls with `retainConflict(request.outboxEntry)`.
   A nil result is an already-retired late reply and must not recreate conflict
   UI.
3. At the Load Server tap, capture the exact conflict request snapshot in
   `captureLoadServerSelection(... explicitRequests:)` before the fresh-head
   await. Do not add unrelated pending/inflight rows.
4. After fresh-head, auth/project/document/backend/conflict and exact-page-byte
   revalidation, call `resolveLoadServerSelection`. Apply the server draft and
   clear recovery/UI only after it returns proof. On error preserve everything.
5. Replace direct admission with `beginDeliveryUnlessRetiredByLoadServer`; nil
   is intentional retirement, not a queue failure.
6. Reconcile Jarvis's separate `beginNext` persistence-rollback fix during
   integration. This branch intentionally does not duplicate or overwrite it.

## Focused coverage authored

- exact selected-ID retirement while older pending/inflight same-scope rows
  remain untouched;
- different request ID remains deliverable even with the same authority;
- changed/rematerialized wall-clock timestamp cannot revive a retired request;
- same request ID with different authority is a 409, not silent retirement;
- relaunch fence;
- atomic write failure rollback;
- prior array decoder and rewrite dropping all new fields;
- old `beginNext`, `markSucceeded`, `removeAll`, retry mutation and return-to-new
  behavior;
- legacy conflict without immutable authority remains preserved.

Verification in this lane is static only: Swift parser checks for both changed
Swift files and `git diff --check`. No XCTest/xcodebuild/simulator pass count is
claimed. Jarvis must independently review the marker semantics, integrate with
`43f6586` and the `beginNext` rollback change, then run focused signed outbox and
authenticated conflict/relaunch proof before any publication claim.
