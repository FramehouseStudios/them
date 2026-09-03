# Spec: T-live-draft-sync

**Status**: implemented on `claude/live-draft-sync`. Contract state:
`ready-for-ios` (client shipped in the same branch).
**Owner**: backend Claude (routes, hub, tests); iOS client written in the same
branch at the human's explicit request (AGENTS.md scope exception).
**V1 pillar**: infra
**V1 effect**: typing in the Studio editor on one device appears on the same
account's other devices as it is typed. The concrete ask: type on the macOS
build, watch it land on the iPhone in real time.

## Problem

Cross-device state today moves only through `/screenplay/projects/:id/version`
autosave (900 ms debounce, then a full save) plus a poll on the other device.
That is seconds of lag and a conflict prompt when both devices are open.
Nothing carries keystrokes.

## Design

One in-process channel per `(userId, projectId)` in
`backend/lib/live_draft_hub.js`, exposed by
`backend/lib/screenplay_live_draft_routes.js`. The channel holds a *mirror* of
the draft, a monotonic `seq`, and a checksum. Devices publish ops against the
seq they last agreed on; the hub applies, bumps `seq`, and fans the op out over
SSE to every subscriber (the sender drops its own echo by `device_id`).

The mirror is not persistence. The saved version stays the source of truth;
a channel is seeded from the latest saved draft and dies with the process or
after 30 idle minutes.

### Wire format

- `op = { start, delete_count, insert }` in **UTF-16 code units**. JS strings
  and Swift `String.utf16` share that unit, so the same op applies identically
  on both sides. Diffs never split a surrogate pair.
- `checksum` = FNV-1a 32-bit over UTF-16 code units, 8 lowercase hex chars.
  Vectors: `"" → 811c9dc5`, `"a" → e40c292c`.

### Routes (all under `USER_PROTECTED_PATTERNS` via `/screenplay/`)

| Route | Purpose |
| --- | --- |
| `GET  /screenplay/projects/:id/live/stream?device_id=&checksum=` | SSE. First event is `hello {seq, checksum, version_id, seeded, text?}` — `text` is omitted when the client's checksum already matches. Then `op`, `snapshot`, `version`, `presence`, `bye`. `: ping` every 15 s. |
| `GET  /screenplay/projects/:id/live/snapshot` | Current mirror `{seq, text, checksum, version_id, seeded}`. |
| `POST /screenplay/projects/:id/live/ops` | `{device_id, base_seq, base_checksum?, op, checksum?, cursor?}` → `200 {seq, checksum}`; `409` (`stale_base` / `checksum_mismatch`) carries the full mirror text for a one-round-trip resync; `429 rate_limited` (40 ops/s/device); `400 bad_op` / `device_id_required`. |
| `POST /screenplay/projects/:id/live/snapshot` | `{device_id, text, version_id?}` replaces the mirror (used when a device reconnects holding fresher text). |
| `POST /screenplay/projects/:id/live/version` | `{device_id, version_id, checksum}` after `/version` accepted a save; rejected with `409` if the mirror moved on. |

Identity: `req.authUser` only. A project that is not the caller's is `404`.
Channel keys are `(userId, projectId)` so channels can never cross accounts.

Bounds: 2 000 channels (LRU, live channels never evicted), 8 subscribers per
channel, 2 MB text, body limits 512 kB (ops) / 2 MB (snapshot) / 16 kB
(version). `closeAll()` runs in graceful shutdown and sends `bye`.

### Client (`them/ScreenplayLiveDraftSync.swift`)

`ScreenplayLiveDraftSyncService.shared` attaches to `ScreenplayStudioViewModel`
in its `init`, observes `selectedProjectID` and `fountainDraft`, and:

- opens the SSE stream for the selected project (reconnect with backoff
  1→30 s, auth refresh on 401, resume on foreground);
- coalesces local keystrokes for 50 ms, diffs against the mirror, posts one op;
- applies remote ops through `ScreenplayStudioViewModel.applyRemoteLiveDraft`,
  which sets `isFollowingRemoteLiveDraft` so the follower does **not** autosave
  the same text; the typing device saves as before, then
  `announceSavedVersion` publishes the version id and followers adopt it via
  `adoptRemoteLiveVersion` (no duplicate version, no stale base on their next
  edit).

Who wins on connect (`LiveDraftSyncPolicy.resolveHello`): a freshly seeded
channel or one that has not moved since we last agreed → the local editor is
pushed; otherwise the channel (another device's typing) is adopted. On a `409`
the channel wins so every device converges; dropped local keystrokes remain in
the on-device recovery store. Manual typing on a follower clears the follow
state and normal autosave resumes.

## Verification

- `backend/tests/screenplay_live_draft_routes.test.mjs` — hub semantics, auth
  boundary, two-device SSE fan-out, 409 resync, 429, version announce, shutdown.
- `backend/tests/screenplay_live_draft_integration.test.mjs` — spawned real
  backend: JWT signup → project → seeded stream → keystrokes fan out → version
  adoption; another user's session gets 404, no bearer gets 401.
- `themTests/ScreenplayLiveDraftSyncTests.swift` — checksum vectors shared with
  the backend, surrogate-safe diff/apply, SSE parser, hello policy, and the
  service loop with a scripted transport (remote typing → editor, local typing
  → coalesced op, conflict → server text, version adoption, resync).

## Out of scope / follow-ups

- Multi-instance fan-out (Redis pub/sub). The hub is single-process like the
  rate limiter; `T-rate-limit-redis-followup` covers the same deployment step.
- Cursor/selection presence in the UI (`cursor` is already on the wire).
- True concurrent editing (OT/CRDT). Same-account devices are expected to type
  on one device at a time; simultaneous typing resolves server-wins.
- `D-desktop-posture-v1` says no *marketed* desktop app for V1. The macOS
  scaffold build keeps working and now syncs; the posture decision is
  unchanged by this spec.
