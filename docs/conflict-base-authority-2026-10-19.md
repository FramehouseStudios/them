# T-997 — A preferred version is not a writer-save receipt

## Exact starting boundary

Parent original961 head8b19d86b12f247106475109442b7b1b3c2008468.
Hosted39312650862 recovery bundle4 pass/1 fail/0 skip on iPhone17Pro,
iOS26.5/23F77. Failed durable-conflict assertion after relaunch at Swift
line2404, followed by signal term. Snapshot retains its synthetic marker but
no conflict/parked/dirty state. This does not by itself prove text deletion.

The exact hosted artifact was downloaded once and retained at
/Users/halfmutantfilms/io.them-worktrees/_proof/T-961-hosted-39312650862/.
Activity tree /tmp/them-997-hosted-conflict-activities.json shows the three
launches at20:42:16,20:42:26 and20:42:36 UTC; failed state assertion at
20:44:02, then attempted Keep Mine. The exported screen recording is an ASCII
placeholder, not decodable video; no visual conclusion from it is claimed.
The prior failed SE recording inspected in T996 is a different test/source.

## Investigation and binary contract

Production ViewModel subscribes to bridge preferredVersionID, which is shared
project context, not exclusively a receipt. adoptSavedPageWriteVersionIfNeeded
can advance the editor/recovery base and clear dirty state on matching text.
The caller checks lastCommittedWrite, but the preferred-version publication is
not tied to that exact write's save. Hypothesis: a late/context update can
interfere with restored writer-save authority. Do not call this the proven
cause of the hosted failure without end-to-end evidence.

New failing-first regression exercises the actual ViewModel, persists a real
pending/parked outbox entry, reopens its store, restores local words, delivers
a preferred-version hint and hydrates a competing canonical server draft.
Required: keep original base/bytes/dirty state and surface the writer choice;
not silently acknowledge or overwrite it. A positive case requires ordinary
uncontested generated-page acknowledgement to keep working.

## Verified root defect and correction

Signed failing-first baseline45 pass/1 fail/0 skip, native66008 exit65:
/tmp/them-997-before/v1-ui-smoke-local-1-99409.xcresult,
/tmp/them-997-before.log. The single failed test reports14 assertion failures
across pending and parked entries: the hint advances base to collaborator-version,
clears dirty recovery, then actual canonical hydration replaces writer words
with collaborator text without surfacing a conflict. Positive generated-page
acknowledgement passes. Exact owned erased Pro/iOS26.2; signing enabled.
The first unprivileged xcresult reader could not create its TestReport cache;
the same read with approved access returned the authoritative45/1/0 summary.

Minimal canonical-method fix: reject bridge-version adoption during an active
conflict or dirty manual/restored writer editing. Do not change genuine
canonical server hydration or exact save acknowledgement. Existing stored
outbox restoration already marks these writer changes manual and dirty.
No new state or persistence/auth/provider pattern; no god file grows.

The positive test additionally checks that an unresolved conflict is not an
acknowledgement opportunity even when its draft equals the hint's draft.
Full signed units865 pass/0 fail/0 skip, native46644 exit0, actual owned
erased Pro/iOS26.2 summary verified:
/tmp/them-997-units/v1-ui-smoke-local-1-468.xcresult,
/tmp/them-997-units.log. Both new tests pass, including pending/parked restored
writer authority, explicit unresolved conflict and positive generated-page ack.
D009 all five deltas0 against exact fetched parent8b19d86b; whitespace pass.
Frozen runtime0c1afb1a: pinned Node20.20.2 backend2897 pass/0 fail/2 skip,
scripts231/0/0, native93802 exit0. /tmp/them-997-node20.log. External network
disabled, exact locked dependencies, readonly source and disposable fixture
writes. Expected simulated persistence-outage diagnostics are test data, not
a production outage. Authenticated UI/recovery and macOS remain pending.

Serial native65975 runs authenticated five-story recovery, writer, fixed-
provider Home, full V1 and voice-fault/macOS against that unchanged runtime;
stops at first red. Logs /tmp/them-997-{recovery,writer,home,v1,voice}.log.
Only owned Pro11CF5EFB-D8C3-4F19-8062-28AF37F27D93 is erased; signing stays on.
No finished UI/macOS result is claimed from a live process.

Authenticated recovery stage completed5 pass/0 fail/0 skip on exact erased
owned Pro/iOS26.2, evaluator exit0:
/tmp/them-997-recovery/them-save-recovery-PpKuXj/recovery-ios.xcresult.
Actual relaunch, expired-auth refresh, stale conflict and explicit choices,
intentional blank/delete-all and fresh Load Server paths passed. Runtime
unchanged from0c1afb1a. Writer stage is now active on the same serial65975;
Home/full V1/voice/macOS are not yet proven. This local result does not prove
the original hosted26.5 failure's cause or authorize main/child promotion.

This proves a concrete authority defect, not yet its causal responsibility
for hosted39312650862. Production publisher timing and26.5 recovery still need
fresh exact-head proof. Historical already-rebased snapshots and universal
late-receipt identity are not certified by this method guard.

## Final local proof and adversarial review

Native65975 completed exit0 on unchanged runtime0c1afb1a:

- Authenticated recovery5/0/0, as above.
- Writer/export/relaunch1/0/0:
  /tmp/them-997-writer/them-studio-ios-writer-loop/run-F0Ua3H/writer-loop.xcresult.
- Fixed-provider Home2/0/0, STT1/chat4/TTS24:
  /tmp/them-home-voice-2810.xcresult. Includes raw-audio server transcription
  and confirmed-text paths, not actual microphone or live providers.
- Full V1 UI29 pass/0 fail/15 skip:
  /tmp/them-997-v1/v1-ui-smoke-local-1-3429.xcresult. Fixture-dependent skips
  remain skips; dedicated recovery/writer/Home runs above supply their own
  contracts, not proof that every skipped scenario ran here.
- Voice-fault1/0/0:
  /tmp/them-997-voice/voice-network-fault-local-1-1448-ios.xcresult.
- macOS scaffold build exit0, /tmp/them-997-voice.log. Existing warnings
  remain; not a warning-free-build claim.

Every signed result is exact owned Pro11CF5EFB/iOS26.2, erased by the
canonical runner before its stage. All seven completed bundles, including
the failed baseline, copied and compared identical under
/Users/halfmutantfilms/io.them-worktrees/_proof/T-997-20261019.u7lZf7/.
This is local same-computer retention, not off-device backup.

Answered by real ViewModel/store regression: late preferred-version hints
cannot retire pending/parked writer intent, overwrite its base or make a
competing canonical draft silently replace its text; explicit conflict remains
protected; ordinary generated-page acknowledgement works. Full local recovery
also exercises actual backend auth refresh, persisted queue/relaunch and
explicit Keep Mine/Load Server actions. Partially addressed: publisher/launch
timing on hosted26.5 still needs a fresh exact-head run. Original failure is
not erased or attributed solely by these local passes. Not covered: historical
already-rebased recovery metadata, arbitrary late-receipt identity, physical
microphone, shipping backend, generated120-page quality or external-open export.

Before original PR update, actual current base85b73695 and old head8b19d86b
are verified ancestors; normal fast-forward only, preserving the original PR,
scope and history. No main merge, replacement PR or protection bypass.

Local live-proof credential check returned only presence booleans: no key in
the process and no backend/.env at that check. No dedicated key-provisioning
tool is available. Human asked to enter it directly into ignored/untracked
backend/.env, not chat or the app. Official guidance keeps API credentials
server-side in environment/secret storage:
https://developers.openai.com/api/reference/overview#authentication.
No paid call made, no credential exposed, no production-secret change.
Production remains blocked until App Store credentials exist.

Exact files: them/ScreenplayStudioViewModel.swift,
themTests/ScreenplayDraftSaveOutboxTests.swift, TASKS.md and this report.
No provider calls, production changes, main promotion or borrowed approval.
