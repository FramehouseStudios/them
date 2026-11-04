# Authenticated five-save ViewModel drain — Zora handoff (2026-10-29)

## Scope

- **Reference checkout (read only):** `/Users/halfmutantfilms/io.them-worktrees/codex-T1205-keep-mine`
- **Reference HEAD:** `ec8a0da406835a684db1ba110e1353e0f2e2a98a`
- **Branch:** `codex/T-1209-auth-five-save-drain`
- **Worktree:** `/Users/halfmutantfilms/io.them-worktrees/codex-zora-auth-five-save-drain`
- **Owned files:** one new focused XCTest file and this handoff.
- **No production edits, Jarvis-worktree edits, simulator jobs, network access, push, or app/UI claim.**

## Binary contract

`ScreenplayAuthenticatedFiveSaveDrainTests` builds a real `ScreenplayStudioViewModel` with isolated recovery/outbox directories and a private `URLProtocol` session. The fixture:

1. snapshots the current auth defaults and shared live-draft bridge;
2. installs a unique authenticated owner using the repository's existing test pattern;
3. reconciles the bridge to that owner;
4. adopts a project draft and derives the exact document ID from `captureLiveTalkDocument()`;
5. resolves the backend through `BackendAuthClient.resolvedBackendBaseURL()`;
6. injects an authenticated `BackendAuthRequestIdentity` and intercepts every request in the API session;
7. enqueues five byte-distinct manual saves with the same initial base and exact owner/project/backend/document origin;
8. drains through the ViewModel, crossing its four-item loop boundary;
9. verifies exactly five unique ordered request IDs, exact UTF-8 bytes, causal bases `base-0 → ack-1 → ack-2 → ack-3 → ack-4`, exact acknowledgement IDs, authenticated headers, an empty queue, and final VM state at `ack-5`;
10. waits until the queue is empty, `queuedDraftSaveCount == 0`, and `debugIsDraftSaveInFlight == false` before stopping monitors and restoring auth/bridge state.

The private protocol returns an error for any origin/path/header outside the fixture. It cannot fall through to the network because it is the only protocol class in the injected ephemeral session and `canInit` accepts every request.

## Current-source assumptions

The reference checkout contains uncommitted production work that is intentionally not copied or committed here. The test is authored against these current-source APIs:

- `ScreenplayStudioViewModel.init(... overflowRecoveryStore:recoveryOriginProvider:... studioAuthContextProvider:)`;
- `resumeQueuedDraftSavesIfNeeded(force:)` requiring current editor ownership and an exact recovery origin;
- `debugIsDraftSaveInFlight` under `DEBUG`;
- `ScreenplayRecoveryOverflowStore(rootDirectory:)`;
- exact delivery-origin rebasing in `ScreenplayDraftSaveOutbox.markSucceeded`.

At base `ec8a0da`, the initializer does not yet contain the current uncommitted `recoveryOriginProvider` seam. Therefore this commit is an integration patch for Jarvis's current production changes, not a standalone green commit on the historical base.

The global owner fixture follows `ScreenplayDraftSaveOutboxTests.installAuthenticatedFixtureOwner`: it temporarily changes only `auth_user_payload`, `auth_signed_in`, and `auth_session_token_deletion_pending`, never Keychain. Actual HTTP authentication is supplied by the injected request identity and asserted as `X-User-Id` plus `Bearer five-save-access`. Cleanup restores the exact prior default values, reconciles the bridge, removes the unique owner's scoped keys, and asserts the prior draft/project/version/binding/origin were restored.

Because the production bridge, auth defaults, and live-draft editor owner are process globals, this focused test must not run concurrently with another test that mutates those same globals. The fixture detaches its editor during cleanup; there is no public API for restoring a previously attached editor. The containing target currently treats these ViewModel fixtures as isolated global-state tests.

## Verification status

- `swiftc -frontend -parse` for the new test source: **PASS**.
- `git diff --check`: **PASS**.
- XCTest/app target: **NOT RUN** by assignment; Jarvis owns integration and execution after the current production changes land.
- Simulator/device/network: **NOT RUN**.

## Integration action

Cherry-pick this test commit after the current ViewModel/outbox/recovery-origin production changes. Run only the focused test first, then the containing test target. If the test cannot settle after the fifth acknowledgement, inspect the scheduled continuation after the four-item drain cap; do not increase timeouts or remove the final `debugIsDraftSaveInFlight`/queue-empty assertions.
