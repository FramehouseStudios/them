# Conflict recovery checks the owned copy — 2026-11-12

## Observed failure

Original #996 b0e265ea, hosted run43200093429: backend3,042/0/5 and D009 passed;
units/writer/V1 steps passed, required recovery2/1/0, later voice/macOS skipped.
The failed conflict-relaunch predicate required parked_draft_save_count==1.
Its snapshot had the complete87-character writer draft, a current-project valid
parked nonpassive record and an independent invalid-scope passive record: total2.
No source or timeout was retried unchanged. The later native SIGTERM remains
recorded; its independent cause was not established.

The228,520,333-byte archive matches GitHub SHA256
821d3601385525afb070518153c86ee9a9c476371f47b70daa3051e13392d7e5.
The actual tested device is FCC5/iOS26.5. Canonical runner log identity must be
compared separately before calling this hosted result erased-device proof.

## Correct contract

Outbox diagnostics are owner-scoped, with project/status/scope/passive tags.
Their same_* tags compare with the FIRST retained row, not the current request;
they must not be mistaken for a current-origin binding. The test now requires
exactly one valid nonpassive parked current-project conflict, not one retained
copy globally. Missing, malformed or incoherent counts cannot pass. Duplicate
matching conflicts still fail.

The existing project/server-version/error/no-unconsented-save checks stay.
Relaunch additionally requires the exact draft length/tail, matching durable
recovery bytes and captured base, plus byte-for-byte editor text. Keep Mine must
acknowledge the actual server version, retire the owned conflict, commit exactly
one exact draft, and survive another launch without another saved version.
Independent passive/quarantined copies may remain. No runtime, handler, signing,
timeout, retry, tap count or schema change; no writer copy is deleted for a test.

## Current local proof

Xcode26.3, normal signing, canonical exact erased81F iPhone17 Pro/iOS26.2:

- Native predicate regression1/0/0: retained failed2-row classifications pass;
  duplicate valid copies, missing/malformed data and inconsistent counts reject.
- All three authenticated recovery workflows3/0/0, including strengthened
  conflict choice, explicit save, exact bytes/version and post-save relaunch.
- Parse/diff checks pass. App/backend/unit/project/Packages/scripts/workflow
  source remains byte-identicalb0. No unchanged local full-suite rerun.

The local end-to-end workflow did not force a second independent copy; the
known failed classifications were exercised by the native predicate regression.
This is a verification-contract repair, not a claim to fix the original
intermittent Autosave event loss, all recovery behavior or SIGTERM cause.

Private proof: _proof/T-1401-owned-conflict-ui-proof-20261112/proof.json.
First wrapped xcresult reads were denied permission to write Xcode TestReport
cache; granting that read-tool cache access produced the existing native
summaries, without rerunning tests. Pre-existing Swift concurrency/deprecation
warnings remain in the build log.

## Landing limits

Preserve this original PR and its ancestors with a normal fast-forward only.
Fresh exact-head required checks and genuine human review remain required;
#995/#997 stay held until the changed parent is green. Main remains unchanged,
#964 review is deferred, production is held. No paid provider, physical-phone,
live microphone/model, deployment or independent-human-approval claim.
