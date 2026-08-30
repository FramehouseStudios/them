# Spec: T-ios-offline-outbox

**Status**: ready-for-codex.
**Owner**: codex (iOS scope).
**V1 pillar**: talk (primary), screenplay (secondary).
**V1 effect**: closes the talk-pipeline resilience gap — turns recorded
on a flaky connection or in airplane mode currently fail silently or
get dropped.

## Problem

The backend already exposes an outbox (`GET /outbox`, `POST /outbox/retry`)
and the V1 promise explicitly says "The app keeps the turn useful when the
backend is slow, rate-limited, or temporarily offline." But on the iOS
side, the audit found no client-side outbox or retry queue. A writer
recording a voice turn at 35,000 feet today loses it.

## Scope

In:
- A small, single-purpose `OfflineOutbox` actor inside `them/` that
  durably enqueues outgoing turns (talk POSTs) and retries them when
  network returns.
- Integration with `BackendClient` / `HerVoiceController` so failed
  network POSTs to `/talk` fall through to the outbox instead of
  surfacing as a hard error.
- Visible UI state: the existing companion presence indicator gains a
  "queued" affordance (one small change in `RootExperienceView` or its
  state model), so the writer knows their turn is held, not lost.

Out:
- Outbox for any non-talk routes (screenplay saves are a follow-up).
- Conflict resolution / merge logic (server is source of truth for now).
- Background URLSession uploads (next phase).

## Approach

Storage: a tiny append-only file under
`FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!`
plus an in-memory shadow. Entries are JSON lines:

```json
{ "id": "uuid", "createdAt": 1715712345, "endpoint": "/talk",
  "method": "POST", "headers": {...}, "bodyRef": "blob-uuid",
  "retries": 0, "lastError": null }
```

Audio bodies are stored as separate blob files (don't inline base64).

Retry loop:
- Trigger on app foreground.
- Trigger on `NWPathMonitor` transition to satisfied.
- Exponential backoff: 5s, 15s, 60s, 5m, 30m. Cap at 5 retries; after
  that mark `parked` and surface to the user in Memories/DataControls.

State machine (entries):
- `pending` → `inflight` → (success: removed) | (failure: pending+retry)
  | (terminal: `parked`).

## Acceptance

- Record a turn with airplane mode on. App shows "queued — will send
  when online." No error toast.
- Disable airplane mode. Within 10s, the turn is sent and the queued
  indicator clears.
- Kill the app while a turn is queued. Relaunch. The queue is intact;
  it sends.
- Backend returns 5xx. Entry retries with backoff. Backend returns
  4xx (non-retryable). Entry transitions to `parked` and the user can
  see + delete it.
- New `themTests`: a unit test that injects a fake transport and walks
  through pending → inflight → success and pending → backoff → success.

## Test plan

- Unit: state machine, backoff schedule, persistence round-trip.
- Integration: stub `BackendClient` returns 503 N times, then 200,
  assert outbox drains.
- Manual smoke: the airplane-mode flow above, on a real device.

## Risks

- Long audio blobs balloon disk. Mitigation: cap at 25 MB per entry
  (matches backend `MAX_FILE_BYTES`), drop and warn beyond that.
- Sensitive content (voice transcripts) on disk. Mitigation: store
  under Data Protection class `Complete` so the file is unreadable
  while the device is locked.

## Out-of-scope follow-ups

- Backend duplicate-detection on retries (idempotency key).
- Outbox for screenplay save POSTs.
- BackgroundURLSession upload for queued turns.
