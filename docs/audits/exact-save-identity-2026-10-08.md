# Exact screenplay save identity — 2026-10-08

## Problem and scope

VERIFIED: the version-save route trimmed text and normalized CRLF before storage.
The client similarly coalesced saves using normalized text; Swift String equality
also considers NFC/NFD equivalent. Distinct writer text could be discarded as an
already-saved or already-queued draft. Recovery deletion relied only on a 64-bit
fingerprint, and snapshot loading trimmed historical text.

DECIDED: save identity compares raw UTF-8, not formatting equivalence. Blankness
validation remains separate. Explicit formatting operations retain their existing
behavior; this change does not redesign the editor or infer new element markers.

The isolated branch starts at #925 (`9cc7de0eefe1ed6cfa45b172bc1db7931d03c13b`).
Commit `2d054772` cherry-picks #918's existing ephemeral-server helper verbatim
with provenance (`89874d3fb4b2a90d0554de1d02de761da16b62c8`). #918 stays intact;
deduplicate that prerequisite when landing, never discard its original work.
The account-route fixture now uses this helper, closes connections with an
awaited shutdown, and gives requests a finite deadline without retries.

## Root fixes

- Server saves and replays preserve raw nonblank text; a byte-distinct retry using
  the same ID returns 409 instead of acknowledging different text.
- A single pure `ScreenplayDraftTextIdentity` owns UTF-8 equality for outbox,
  completion/coalescing, page-write adoption, hydration protection and recovery.
- Saved-state dirty comparisons use raw saved text, not only a hash.
- Recovery copies stay distinct across reinitialization, targeted removal and
  fingerprint collisions. Snapshot restoration preserves raw stored text.
- A successful response must contain the exact returned version draft before
  clearing the local request. A missing/lossy response parks the durable request
  and retains recovery instead of retrying indefinitely or claiming success.
- The signed offline-save fixture includes boundary whitespace, CRLF and NFD;
  its final assertion reads the raw JSON string rather than a trimming helper.

## Proof and failures retained

VERIFIED: backend red run `/tmp/them-928-backend-red.log` failed 1/1 because the
route changed submitted bytes. Focused authenticated restart/replay then passed.
The signed outbox red run `/tmp/them-928-red-units.xcresult` failed 3/3 for whitespace
coalescing, request-ID reuse and Unicode identity.

The first full backend run stalled in the account-route fixture; its pooled
ephemeral-server lifecycle matched the known #918 pattern. This is not proof of
a unique cause. The fixture was fixed, not retried until green without a change.
The first corrected full client run had 650 passes and one failure: reverting to
the exact saved text stayed dirty because other fingerprint call sites still
trimmed. Those production call sites were fixed with the assertion retained.
The next review run had 656 passes and one old provenance expectation failure;
the test now distinguishes exact committed text from normalized edits.

The first strengthened UI run passed auth/conflict but failed the exact-text
assertion. That assertion called a helper that trimmed strings; it was corrected.
Neither this failure nor an unconfirmed editor-normalization theory establishes
that production deleted the prefix. Do not cite either as live data-loss proof.

VERIFIED backend full suites:

- Node 26.7: 2,740 pass, 0 fail, 2 skip, `/tmp/them-928-final-backend.log`.
- Node 20.20.2, isolated Docker `--network none`: 2,740 pass, 0 fail, 2 skip,
  `/tmp/them-928-final-node20.log`. This is shipping-runtime proof, not a
  complete production-image deployment or live provider test.
- Node 20 focused account + authenticated cross-device restart: 13/13,
  `/tmp/them-928-node20-focused.log`.

VERIFIED: final signed units: 658 pass, 0 fail, 0 skip,
`/tmp/them-928-ack-units.xcresult`. Signed relaunch/reconnect and expired-auth/stale
conflict UI: 2 pass, 0 fail, 0 skip,
`/tmp/them-928-ack-ui/screenplay-save-network-fault-88172.xcresult`.
Both used the erased dedicated simulator `11CF5EFB-D8C3-4F19-8062-28AF37F27D93`,
iPhone 17 Pro, iOS 26.2 (23C54), Xcode 26.3, signing on. UI backend requires auth;
only synthetic local credentials were used. No human simulator was erased.
The negative acknowledgement cases are policy tests; a live legacy-server
mismatch journey and strict returned client-request-ID binding are not covered.

God-file gate passes against #925 with no protected file growth; `git diff --check`
and route `node --check` pass. index.js remains 33,626 under the human-approved
pre-stack exception. macOS scaffold build exited 0, `/tmp/them-928-mac-scaffold.log`;
`them-macOS-scaffold`, `Mac Scaffold Debug`, unsigned build-only. Existing Swift
concurrency warnings remain; this is not a claim of warning-free release readiness.

## Boundaries and not covered

- Empty/whitespace-only versions remain unsupported by the existing API contract.
- Previously normalized text cannot be reconstructed by this fix. Old request IDs
  may conflict when replayed with raw text different from their stored version.
- Async lint/coverage/logline staleness checks still normalize text; track separately.
- Reinstall/Keychain migration, Postgres production soak, physical microphone,
  paid model, 120-page responsiveness and export parity are not proven here.
- No production secrets, live model calls, main merge, review bypass, branch
  deletion, or wholesale Claude rewrite occurred. #911, #920, #832, #833 and
  #712 were inspected as related work; sibling features are not claimed integrated.
- VERIFIED: #925 run `37745634203` passed required units and integrated writer loop
  but failed hosted V1 UI smoke; later offline/voice/mac steps were skipped.
  V1 ran 37 tests: 27 passed, 1 failed, 9 skipped. The failure was
  `test_profile_remembered_login_restores_through_keychain_relaunch_and_disables`:
  “Remember me unexpectedly returned after deletion and relaunch.” Artifact:
  `/tmp/them-925-hosted-failure.log`. This is not a billing diagnosis.
- HUMAN_INPUT_REQUIRED: an independent authorized reviewer must approve #766;
  #770 requires retarget/reproof after #766. Hosted gates must pass, and model
  credit top-up must be confirmed before live provider validation.

Next target after this task: diagnose the hosted #925 V1 UI failure and pending
bottom-up merge review; then the empty-draft persistence contract, in its own PR.

## Exact changed files

Prerequisite #918: `backend/tests/helpers/ephemeral_server.mjs`,
`backend/tests/screenplay_live_draft_routes.test.mjs`, `backend/tests/trait_library.test.mjs`.

This fix: `TASKS.md`, `backend/lib/screenplay_projects_routes.js`,
`backend/tests/account_routes.test.mjs`, `backend/tests/screenplay_cross_device_persistence.test.mjs`,
`them/CrossDeviceSyncPolicy.swift`, `them/ScreenplayDraftSaveOutbox.swift`,
`them/ScreenplayStudioPersistencePolicies.swift`, `them/ScreenplayStudioRecovery.swift`,
`them/ScreenplayStudioViewModel.swift`, `themTests/ScreenplayDraftSaveOutboxTests.swift`,
`themTests/ScreenplayStudioDraftRecoveryTests.swift`, `themUITests/V1SmokeUITests.swift`,
and this audit document.
