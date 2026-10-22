# T-1116 — Full turn metadata in the existing received-result record

Parent `2deeb87523b37b721e315c3eb94d00b68452ad22`.
Runtime `f8db1d776429b462d50270860e2aa31830b93371`.
Branch `codex/T-1116-offline-reply-handoff`; local integration, not main/release.

## Status: metadata custody improved; complete delivery remains unproven

The existing receipt can now keep the canonical full turn metadata alongside
its request/audio. Retained decoding can use that local copy after relaunch
without another HTTP/model request. This is not automatic page insertion,
playback, saved delivery or the complete queued/physical-phone journey.

## Exact files changed

- `them/BackendClient.swift`: canonical metadata payload is Codable; a scoped
  read uses the existing GET parser; retained results merge that stored payload.
- `them/OfflineTalkRecovery.swift`: optional bounded metadata, credential
  filtering, integrity checking, export and revised receipt identity.
- `them/OfflineTalkOutbox.swift`: capture only after the audio receipt is
  durable; recheck scope/current entry after the GET; atomic record update.
- `them/OfflineTalkReplyReview.swift`: decode complete cached replies first;
  only try metadata recovery if needed, then use the canonical decoder again.
- `themTests/OfflineTalkMetadataCustodyTests.swift`: full-page/no-server reload,
  stale acknowledgement, wrong/unavailable turn and deletion-in-flight cases.
- `TASKS.md` and this report: evidence, limits and next security boundary.

## Behavior and verification

The production outbox attempts a metadata GET after a successful real transport
has already retained the response. It never repairs missing metadata by another
generation. The canonical typed payload drops unknown fields; its session ID is
removed before disk storage/export. Capture checks the requested turn identity,
owner/login intent/backend before and after the lookup. It re-reads the durable
entry before writing, so a deleted/acknowledged request cannot be resurrected.

Enrichment keeps original request/idempotency identity and audio bytes, but
issues a new receipt UUID. An acknowledgement of the old incomplete response
therefore cannot consume newly captured page text. The metadata is included in
the integrity digest and recovery JSON. Missing optional metadata preserves old
receipt digests/decoding; it is not a forced conversion of existing records.

- First focused signed custody/decoder/retention: **9 passed / 0 failed / 0
  skipped**, before the final stale-ack identity change.
- Full signed units including that identity change: **928/0/0**. This precedes
  only the final view-only decode-first fallback; do not claim it tested that
  later view logic. Final signed UI and macOS compilation cover that view.
- Final received-reply Read/Close/relaunch/native Files export UI: **1/0/0**.
- Final existing authenticated Home raw-audio → transcript → formatted page →
  saved restoration UI: **1/0/0**, intercepted STT1/chat2/TTS1.
- The focused metadata tests use real outbox files and URLSession with an
  intercepted GET, not a live provider or real backend restart. They verify a
  >8,000byte exact page survives local relaunch while any further metadata HTTP
  request fails, credentials are absent, and no new generation is sent. They
  explicitly invoke capture; they do not prove the entire real transport hook.
- macOS scaffold build on final view exits0; existing warnings remain.
- Fresh isolated Node20.20.2 source contracts: **7/0/0**. Backend runtime and
  dependencies unchanged; full backend **2912/0/2** is inherited evidence, not
  a new full run. No paid calls, deployments, main/original-PR-head changes.
- D009 versus exact parent2deeb87: five deltas0; index33538, Studio17337,
  Root14937, bridge12860, MemoryAPI10463. Diff checks pass.

Normal signing; erased task-owned iPhone17Pro/iOS26.2 simulator
`7F1A14C1-B379-4417-AFE9-331810CD9CD3`. Final tracked source:
`/tmp/them-1116-metadata-source.CHEnny/source`. Logs and signed results:
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1116-metadata-20261021.tO56o6/`.

## Limits / adversarial disposition

Answered locally: exact page custody, credential filtering, stale ack, wrong turn, unavailable
lookup, no generation retry, deletion during an outstanding lookup, and reload
decoding without a server. Existing owner/backend checks remain in the path.
Live account switching during capture is source-guarded, not UI-proven here.
Metadata is included in the digest by source inspection; a dedicated test that
mutates this new field was not run. Do not inflate the older corruption proof.

Metadata is limited to2MiB and response audio to32MiB. File protection, large-
record IO latency, disk-full/power-loss behavior and downgrade import remain
bounded/unproven as documented in the prior retention report. Older clients
cannot validate enriched receipts; export/preserve them with this build before
downgrade. Do not promise automatic backward recovery compatibility.

The interval between server response and successful metadata capture remains a
gap: a backend restart/expiration there can remove the only full page copy.
The retained request/audio are kept, but do not claim that page text is durable
before capture. Server-side atomic result durability still needs investigation.
The existing server diagnostic established volatile turn metadata, not a lost
authoritative page. No narrower success definition replaces T-1116.

## Security finding and exact next action

T-1117 records a source-level concern in `canReadTalkTurnMeta`: after a known
metadata-owner/authenticated-user mismatch, its legacy session fallback can
return true. Evaluating the actual canonical predicate with synthetic fixture
dependencies and NODE_ENV=production returns true for both (a) another user's
old client token and (b) missing metadata session. This is **not** proof that
production middleware allows either HTTP request; no production probing or
credentials were used. Diagnostic output is preserved with this proof.

Next: prove the actual signed-in two-account HTTP boundary without the local
`them-dev` bypass, then harden/extract this capability without growing index.js
if the mismatch is reachable or unguarded at that boundary. Preserve valid
same-owner and intentional ownerless legacy behavior. Do this before automatic
recovered-page delivery. Then finish server result durability, owner/document-
safe playback/insertion and durable insertion identity before acknowledgement.
That delivery must also publish the existing scoped update after metadata is
ready; no Root consumer is connected yet. T-1116 and the overall goal stay active.
