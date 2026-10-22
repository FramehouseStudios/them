# T-1112 — Interrupted talk enqueue recovery

Parent `3ec4f27294794bc38f4a6c4e227ccb995ed0d858`.
Branch `codex/T-1112-interrupted-talk-enqueue`.
Runtime `c1e9255078f15931576aa648ce2a56c0dcef0fe4`.
Local integration checkpoint, not main, production or physical-phone proof.
No paid provider calls. Keep Clementine, the orb and existing styling.

## Reproduced boundary and connected fix

VERIFIED parent **0/2/0**, signed/erased owned iPhone simulator. A real body
write followed by a deliberately blocked manifest write left bytes on disk but
no recoverable queue entry after a fresh actor loaded that directory. An
unreferenced legacy body also disappeared from recovery status (not from disk).

Extend the existing OfflineTalkOutbox, not a second queue/store. New writes use
one versioned binary-property-list `.turn` body record inside its existing
`blobs` directory. The protected atomic write contains original request metadata,
exact body bytes and SHA256. `queue.jsonl` indexes the lifecycle; legacy raw
`.multipart` records remain readable without rewriting or assigning their owners.

- Before writing, reject unsupported/credential-bearing URL origins, unsupported
  endpoints, nonfinite timeouts and over-limit bodies. An invalid producer
  request must not create a body that poisons the next queue load.
- On first load, validate new record names, UUIDs, endpoints/origins, byte count,
  format version, hash and immutable metadata against any index row. Reject
  malformed/ambiguous/missing new records without silently dropping rows.
- A complete ready body without an index row is restored as **parked**, bound
  to its recorded account/origin and original request ID. It cannot automatically
  spend credits. Unknown-owner raw bodies remain unassigned, with a generic
  recovery notice; another account cannot inspect/replay/delete them.
- Data Controls exposes Review and Export. Review requires an owner/origin-
  bound confirmation warning that the original network attempt might already
  have reached the server and a retry may use credits. Queue Request reuses the
  exact stored intent and enters the existing retry path, not a new generation.
- Write a durable **settled** marker to a new body before removing its index
  row following HTTP2xx or confirmed deletion. A failed unlink, or interruption
  between settlement/index cleanup, cannot resurrect that request as fresh work.
  Settled files are best-effort cleaned only after index reconciliation.
- Keep existing raw-body failure behavior. A failed legacy manifest write must
  not hide the known cached legacy entry; new records rescan where their settled
  marker or unindexed body makes reconciliation necessary.
- New body validation is shared by export, duplicate detection and replay.
  Replay retains the original body/request ID and uses canonical current auth.
  A different body under the same key remains separately held, not auto-sent.
- The explicit DEBUG UI reset now clears the test outbox as well as draft and
  outline queues. It is called only by `--ui-testing --ui-reset-state`; proof
  erases only task-owned simulator7F, never another device or a human workspace.

## Evidence ledger

Permanent proof folder:
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1112-20261021.1BiWlG/`.
Final native source snapshot `/tmp/them-1112-final-source.t80M7G/source`;
all eight native source/test files match runtimec1e9255. Final public source
archive and GitHub receipt in the permanent folder record publication precisely.

- Parent signed **0/2/0**: interrupted enqueue not recovered; missing unassigned
  notice. `/tmp/them-1112-red/`.
- First affected signed **26/1/0**: new scenarios passed, but forcing a reload
  after a failed *legacy* manifest write hid the still-valid cached entry.
  Retain that existing assertion; fix legacy/new rescan behavior, not the test.
- Expanded affected signed **32/0/0**. Real filesystem interruption and reload,
  owner/origin refusal, explicit original-ID/body replay, corrupt-body fail-
  closed behavior, failed body unlink after acknowledgement/deletion, and a
  settled body reconciling an old manifest after acknowledgement persistence
  failed. No provider calls. `/tmp/them-1112-adversarial/`.
- First full signed **918/0/0**. Then clarify confirmation copy and add the
  invalid-producer-origin guard/test; final full signed **919/0/0** on the
  resulting native code. `/tmp/them-1112-units-final/`.
- Actual Data Controls UI **2/0/0**: review cancellation and credit warning;
  native Files export/cancel/save; confirmed owned-entry deletion with foreign/
  unassigned work retained; explicit Queue Request then relaunch restores one
  pending owned request and no renewed review action. These fixtures target
  loopback port9 with no access token, so they cannot make paid model calls.
  `/tmp/them-1112-recovery-ui/`. This precedes only the final invalid-producer
  guard; normal valid record creation/recovery is unchanged by that guard.
- Final-head recovery/export/deletion UI **1/0/0**, after that guard, retained
  the actual Files artifact for independent inspection before any simulator
  erase. Saved JSON307 bytes, SHA256
  `391478643a7e9f68ebae72fc350b021032fd6cbc57f60029cba68de00b61539d`.
  Its base64 body equals the original CRLF/tab/trailing-whitespace fixture;
  export has no headers. Actual remaining manifest contains exactly the foreign
  and unassigned records, with both original bodies verified from their new
  binary records. Owned entry is absent. `/tmp/them-1112-export-final/`.
- Final actual authenticated writer/create/save/native Files export/relaunch UI
  **1/0/0**, intercepted chat1/STT0/TTS0; frozen local backend, not a paid model.
- macOS scaffold build exits0, including the final origin guard. Existing Swift
  concurrency/deprecation warnings remain. No warning-free/Swift6 claim.
- Fresh Node20.20.2 source-dependent contracts **7/0/0** (redirect guard and
  writer-block UI runner). Backend/scripts/dependencies are unchanged versus
  3ec4f27; reuse the preceding full backend **2912/0/2** explicitly, not as a
  new full run. The two existing skips remain documented in T-1108's report.
- Initial local D009 used a stale remote-tracking parent and reported inherited
  T-1108 shrinkage. After fetching the exact parent3ec4f27, all five deltas are
  **0**: index33538, Studio17337, Root14937, bridge12860, MemoryAPI10463.
- One summary-read used the wrong generated bundle name and returned no result;
  actual bundle glob/terminal summaries are the evidence, not that failed read.

Native checks use normal signing and an erased task-owned
`7F1A14C1-B379-4417-AFE9-331810CD9CD3`, iPhone17Pro/iOS26.2. No unsigned tests,
real microphone, live model quality, production or physical-phone claim.

## Compatibility and rollback

Format version1 is additive for this client: old raw bodies/index rows still
load. Do not migrate or infer ownership for unreferenced legacy bytes.
An older client that recognizes only `.multipart` references rejects the new
`.turn` manifest rather than transmitting an encoded envelope as audio. This is
fail-closed downgrade behavior, **not** old-client recovery compatibility.

Before rolling a device with new queued records back to an old build, use the
current build to export its owner-scoped recovery work and retain its original
files. Use a current recovery-capable build to resume them; automatic downgrade
conversion/import is not implemented. No old queue is deleted or rewritten to
pretend compatibility. Production remains held and this format is not deployed.

## Adversarial disposition and limits

Answered for this storage boundary: interrupted body/index commit; explicit
review before replay; immutable original identity/body; wrong account/origin;
legacy quarantine; corrupt/hash-mismatched/ambiguous files; terminal settlement
before cleanup; failed unlink; acknowledgement/index interruption; invalid
producer origin; exact pending intent retained across relaunch.

Not claimed: power-loss/fsync guarantees, disk-full recovery UI while the index
cannot be written, downgrade import, feature-length IO latency, live network/
provider quality, broad account isolation, physical phone or main/production.
The durable settled marker rewrites the existing binary body atomically before
cleanup (maximum body25MiB). Its large-audio IO/latency is not measured; do not
claim a performance improvement. Add it to T-1115's canonical journal IO audit.

Source observation requiring a separate proof: the current outbox settles a
successful HTTP response without itself handing its response body to Clementine
or the page. T-1116 must determine/prove which backend project/receipt and client
hydration paths recover bound and unbound results. Do not infer that a queued
request's HTTP200 proves its reply was heard or its pages appeared.

Next: T-1116 response handoff investigation, then T-1113 owner/origin-scoped
recovery for retained initial project setups, before original #648. This ordering
prioritizes a potentially missing core-loop result over recovery discoverability
for already-retained project setup bytes. Blank setup
retry safety T-1114 and unbound-journal IO/durability T-1115 remain tracked.

## Exact changed files

- `them/OfflineTalkOutbox.swift`
- `them/OfflineTalkRecovery.swift`
- `them/DataControlsScreen.swift`
- `them/UITestLaunchConfiguration.swift`
- `themTests/OfflineTalkEnqueueRecoveryTests.swift`
- `themTests/OfflineTalkOutboxTests.swift`
- `themTests/OfflineTalkRecoveryOwnershipTests.swift`
- `themUITests/V1SmokeUITests.swift`
- `TASKS.md`
- `docs/interrupted-talk-enqueue-recovery-2026-10-21.md`

Save scoped verified commits only through the authorized normal fast-forward
backup branch; preserve original PR heads and review/check protections. No main
merge, force push, replacement PR, deployment or product-complete claim.

## Copy-and-paste continuation

T-1112 interrupted talk enqueue is locally repaired in the canonical outbox.
New versioned protected body records atomically bind immutable request metadata,
SHA256 and exact bytes; missing-index records recover held, never auto-spent or
assigned to the current user. Explicit owner/origin-scoped Review/Queue Request
and Export are connected. Settled markers prevent acknowledgement/deletion from
resurrecting after index/unlink failures. Legacy raw bodies remain supported;
unknown raw orphans are quarantined with notice. Downgrade is fail-closed, not
backward recovery compatibility; retain/export through the current build.
Parent red0/2, affected26/1 then32/0; full918 then final919/0/0, recovery UI2/0/0,
final export/deletion UI1/0/0 plus independent exact bytes/retained-owner checks,
writer/save/export/relaunch1/0/0, macOS/D009/diff pass. Fresh Node20 source
contracts7/0/0; unchanged backend reuses full2912/0/2, not a fresh run. No paid
providers, phone, production, main merge, original-head change or hosted-green
claim. NEXT T-1116: prove an accepted offline response actually reaches the
writer/Clementine/page; then T-1113 retained initial project setup recovery,
before original #648. Preserve the orb, Clementine and all original history.
