# Complete recovered-page retrieval — T-1032

## Root causes and connected change

Recovery review could show only the response header's short preview when the
complete page was too large for a header. The existing owned turn-result GET
route retained more text, but its store silently clipped it at32,000 characters
without clearing the authoritative flag. A separate `reply_role=preview`
describes the spoken summary, not the full `screenplay_output`.

The canonical ephemeral map is now a `TalkTurnResultCache` retaining whole
snapshot results and their original UTF-8 SHA256. Its configurable
`TALK_TURN_META_MAX_BYTES` defaults to128MiB of serialized JSON payload. This is
not a measured JavaScript heap limit. Existing TTL/entry limits still apply;
byte pressure evicts whole oldest entries, not portions of screenplay text.
An oversized uncacheable result removes its own stale identity but does not
evict unrelated results. The cache is not a durable generation receipt store.

The existing GET response adds `screenplay_output_sha256`; older clients keep
their existing fields/behavior. Recovery requires this digest rather than
assuming an older server's possibly clipped result is complete. No POST or
paid generation is used to retrieve existing output.

The existing client metadata transport refuses redirects. Recovery reads only
the currently configured primary/fallback service matching the original talk
URL. It pins the request's current auth identity, sends the original session
selector, then verifies current ownership/epoch and original owner/session/
turn, authoritative-page flag and exact text digest. An expired result explains
that the original request/local reply remain retained. A spoken preview role
does not invalidate a verified authoritative page.

The existing outbox actor rechecks ownership and receipt identity after the
network await; it writes protected JSON before updating memory. Successful
output survives relaunch and is not refetched. Review's explicit retrieval
action displays the retained complete text and refreshes the existing list.
Dismissal cancels its structured task; deletion/account change cannot
resurrect a removed receipt. The screen accurately says review does not modify
the screenplay, rather than asserting the page was never previously applied.

The three screenplay output value types are explicitly nonisolated/Sendable
to match their use in the outbox actor and Codable recovery model. An initial
signed run passed but exposed isolation warnings; final proof follows that
correction, not a claim that the first compile was warning-free.

## Proof and boundaries

- Focused Node20.20.2:15 passed,0 failed/skipped, external network disabled.
  Real loopback owned GET returns a greater-than32k fixture byte-for-byte with
  its original digest; another writer is denied. Cache budget/snapshot/delete/
  clear/oversize behavior and existing route contract are covered.
- Initial signed focused run25/0/0, then actor-boundary correction. Final
  signed focused **25/0/0**, actual summary read, erased owned Pro26.2,
  signing enabled, native exit0. Backend **2998/0/2** (3000 checks47 suites),
  scripts **238/0/0**, offline mentor gate OK, pinned Node20.20.2 with external
  network disabled, native exit0. Skips: ordinary suite's live Postgres prefix
  check without DATABASE_URL and opt-in live page-write response proof.
- Signed iOS build and final macOS scaffold **BUILD SUCCEEDED**, native exit0.
  The final toolbar-only sharing improvement followed the focused unit run;
  it was compiled and checked natively, not attributed to another XCTest run.
- Backend full-proof source frozen as tree
  `79b11502031283c518fa44e31ad239c07efe1415`; later actor annotations do not
  change any backend file. No private environment files enter the container.
- D009 against fetched original parent `codex/T-1031-recovered-write-context`:
  index-2 lines; other four protected deltas0. Whitespace pass.

Private proof: `/Users/halfmutantfilms/io.them-worktrees/_proof/T-1032-20261019.N66MIh/`.
Logs: `/tmp/them-1032-final-focused.log`, `/tmp/them-1032-node20.log`,
`/tmp/them-1032-backend-focused.log`, `/tmp/them-1032-native-build.log`,
`/tmp/them-1032-final-macos.log`.

Client fixtures verify retained original multipart bytes, a complete long page
after fresh-actor/relaunch, one GET/no POST/no refetch, wrong owner/session/
turn/digest, a clipped body, old missing digest contract,404 and an auth epoch
change. URLProtocol responses are client-contract fixtures, not proof of JWT
signature validation, live model quality, speech or audio.

## Native observation (synthetic, not a physical-phone journey)

Erased owned375-point SE/iOS26.2 `E8998A6B-35B1-49E3-896C-861550849927`;
signed candidate, synthetic Debug owner. A disposable loopback fixture mounts
the production result route/cache/access policy and injects fixture identity;
it has no provider or working generation/writer endpoint. Other app startup
routes are intentionally unsupported, so their404/session bootstrap behavior
is not evidence of production reliability or network churn.

Observed Data Controls → retained preview → Retrieve complete page. The
display changed to the complete scene; local protected receipt contains
**38,745 UTF-8 bytes**, SHA256
`9d325f170db22f2cd48de690261b503959458ed687059a8a6811845808f6fc9c`.
The fixture recorded exactly one result GET and no POST /talk, including
terminate/install/relaunch/review of the persisted result. Accessibility's
description output clips the long text, so reaching the tail through rendered
scrolling is not claimed from that text dump.

The long result exposed buried sharing. Added a native navigation-bar Share
recovered page action, then rebuilt/reinstalled/relaunched without erasing.
Observed the icon at375 points → native share → Save to Files → On My iPhone,
then Files Quick Look outside THEM. The actual saved filename is
`THEM-T1032-recovered-page.txt.txt` (the system appended its text extension to
the manually entered fixture name). Exported file has the same38,745 bytes
and SHA256 as the retained/service text. This is a plain-text recovery export,
not formatted PDF/FDX, audio playback, real speech or a generated feature.
Native screenshots were inspected in CUA; no screenshot file is asserted.

## Integration boundary

Original #962 `f5e746c2`, hosted run39367137834: Backend/D009 successful;
Quality Gate failed at conflict-relaunch recovery, assertion line2412.
The log reports the unresolved conflict's durable writer copy was absent in
the inspected state after relaunch. Do not relabel this a pass or assume a
test flake from the earlier local5/0/0. Original child heads/main have not
advanced; next action is artifact-led diagnosis of that exact failed head.

Not complete: durable server results after TTL/restart/cache eviction; original
full draft/anchor identity and explicit guarded apply/save; native iPhone
journey against the intended backend. Existing local retention is unchanged
on failed retrieval. No automatic retry of a paid turn, application, production
mutation, main merge or original child-PR advancement is introduced.

## Files changed

`backend/index.js`, `backend/lib/talk_pipeline.js`,
`backend/lib/talk_turn_result_cache.js`,
`backend/tests/talk_turn_meta_contract.test.mjs`,
`backend/tests/talk_turn_result_ownership.test.mjs`,
`backend/tests/talk_turn_result_cache.test.mjs`, `them/BackendClient.swift`,
`them/OfflineTalkOutbox.swift`, `them/RecoveredTalkReply.swift`,
`them/RecoveredTalkReplyReview.swift`,
`themTests/BackendClientCraftAPITests.swift`, `TASKS.md` and this record.
