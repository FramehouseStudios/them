# T-1049 — A version hint cannot retire recovered writer words

## Current boundary and hosted evidence

Isolated `codex/T-1049-auth-conflict-recovery` starts from original #919
`ce04777c05c18b0b67342d265dc916ae71cd1a2f`, based on original #904.
No replacement PR, squash, main merge or history rewrite. Preserve every
original commit; follow-up publication requires fresh hosted proof/review.

VERIFIED hosted39406648854/job118574084735, actual downloaded bundles:
signed units635/0/0; V1 UI28/0/9; recovery1 pass/1 fail/0 skip, actual
iPhone17Pro/E839A11B, iOS26.5/23F77. The expired-auth/stale-conflict case
fails at Swift1896. Final snapshot has server-only text, no dirty/queued/
parked state or conflict version. The recording shows local marker/Unsaved
before termination, then server text/Saving after relaunch. This establishes
a broken observed recovery journey, not which assignment caused it.

Retained artifact224348363 bytes, id12260423488:
`/tmp/them-1049-hosted-recovery.xdKpVN/`. Exported recording/attachments:
`/tmp/them-1049-hosted-media/`; activities:
`/tmp/them-1049-hosted-activities.json`. No secret values were inspected.
Voice-fault/macOS hosted step was skipped after recovery failed.

An unchanged-source local selected recovery baseline passes1/0/0 on erased
signed owned375-point SE E8998A6B / iOS26.2/23C54, native exit0:
`/tmp/them-1049-before/them-save-recovery-xvZ0Po/recovery-ios.xcresult`;
log `/tmp/them-1049-before.log`. Native Node24.22.0 runs the disposable
auth-required backend/harness, fake provider key, embeddings/Muse off.
This is not a hosted fix, paid-model proof or physical-radio outage.

## Confirmed authority defect, not an inferred auth explanation

Read preserved correction `0c1afb1a57281b7b4af5e5220cac0149f202ca86` and
its T-997 regression/proof before editing. Do not import the later product
stack wholesale or invent another save protocol. Its canonical guard is
missing at this earlier original-PR boundary.

The bridge's preferredVersionID is shared project context, not necessarily
the receipt for the writer's recovered bytes. The model accepted that hint
even during dirty manual recovery or an unresolved conflict. It could advance
the recovery base/clear dirty state; canonical hydration could then replace
the local words. Ordinary explicit recovery also failed to enter the existing
manual-edit authority path, unlike pending-queue hydration.

New actual-model characterization uses an isolated recovery store, restores
the exact writer draft, delivers the version hint, then calls production
canonical hydration with competing server text. Another case preserves
ordinary generated-page acknowledgement and rejects an unresolved-conflict
hint. Only visibility of the existing hydration method changes for test
access; no duplicate hydration implementation is created.

VERIFIED before:0 pass/2 fail/0 skip, native exit65, same erased signed SE:
`/tmp/them-1049-authority-before/v1-ui-smoke-local-1-49022.xcresult`;
log `/tmp/them-1049-authority-before.log`. Actual summary read. Positive
generated-page assertions execute before the conflict rejection failure.

## Small canonical correction

Reuse `0c1afb1`'s guard in adoptSavedPageWriteVersionIfNeeded: no shared-hint
adoption during conflict or dirty manual/restored editing. Explicit recovery
calls the existing noteManualDraftEdit owner, which already sets manual/
dirty authority, stops remote-follow fallback and persists the local draft.
Remove its duplicate recovery-store write. Actual canonical save receipts
and ordinary uncontested generated-page acknowledgement remain unchanged.

No backend, provider, dependency, model prompt, UI selector, callback count,
timeout, retry budget or existing recovery assertion is changed. No god-file
growth, new state variable, new framework or speculative event observer.

## Verification and adversarial checkpoint

First full after-run remains red635 pass/2 fail/0 skip, native exit65:
`/tmp/them-1049-units/v1-ui-smoke-local-1-49631.xcresult`. Both new
synchronous real-model tests crash at teardown: BackendClient deallocation
through swift_task_deinitOnExecutorImpl / TaskLocal::StopLookupScope and
malloc invalid free. The same signature also appears in the before run's
diagnostics. Do not describe these crashes as ordinary assertion failures
or a successful corrected unit boundary. Export:
`/tmp/them-1049-unit-crash/`.

Primary Swift reports match the observed stack/toolchain:
https://github.com/swiftlang/swift/issues/88036 and
https://github.com/swiftlang/swift/issues/87316. The former reports the
default-MainActor synchronous deallocation failure with Xcode26.3/iOS26.2;
this is supporting evidence, not independent proof of every THEM crash.
Match the existing real-model tests' async task context without removing
any assertion. Follow-up runtime compatibility debt: characterize actual
BackendClient synchronous release and fix the production deinit path
separately, rather than claiming async tests eliminate that app risk.

VERIFIED full async unit after-run637 passed/0 failed/0 skipped, native
exit0, actual owned E8998A6B/iOS26.2 summary:
`/tmp/them-1049-async-units/v1-ui-smoke-local-1-50297.xcresult`;
log `/tmp/them-1049-async-units.log`. All assertions remain; restored manual
authority and genuine generated-page acknowledgement both execute. An
initial inspection mistyped the bundle suffix and returned missing-path;
the discovered actual bundle above supplies these counts, not that error.

VERIFIED both unchanged signed recovery workflows2 passed/0 failed/0
skipped, native exit0, same freshly erased owned SE/iOS26.2:
`/tmp/them-1049-recovery/them-save-recovery-9r57WT/recovery-ios.xcresult`;
log `/tmp/them-1049-recovery.log`. Exact-byte/exactly-once assertions remain.
Canonical macOS scaffold compile then completed native exit0, log
`/tmp/them-1049-macos.log`; existing actor/deprecation warnings remain.
No fresh hosted-fix or completed app claim. D009 passes: Studio -4 and bridge
-22 vs main, other three deltas0; all five deltas0 vs original #919. Diff
check passes. Backend/scripts are byte-identical to ce04777c; retained
Node20.20.2 proof2749/0/2 and scripts224/0/0 is historical, not fresh.

Answered by failing-first characterization: a shared version hint is able
to retire recovered writer authority on the original boundary. Pending:
fresh hosted26.5 proof. Uncertain: whether this exact hint caused every assignment
in hosted39406648854. Do not call the hosted root established by a local
after-pass. Not covered: physical phone, real speech/model, shipping backend,
cross-device timing beyond the stated cases or whole-app completion.

Exact changed files: them/ScreenplayStudioViewModel.swift,
themTests/ScreenplayStudioDraftRecoveryTests.swift, TASKS.md, this report.
Local dependency symlink is untracked tooling only, never a commit input.
No paid model call or production/credential change; production hold remains.

## Earliest boundary and preserving publication

Read current original #904 run39406112568/job118572329857: it fails the
same expired-auth/stale-conflict recovery assertion at Swift1888, before
the child. Log `/tmp/them-1049-parent-904-failure.log`. Therefore publish
the reusable two-file source correction at #904 first (T1051), then merge
that updated original parent normally into this original #919 descendant.
Do not land a green child over a red parent or discard either original PR.
Before the correction, ViewModel and recovery-test sources are identical
between original #904 `2a10365f` and #919 `ce04777c` (empty exact git diff).

Implementation commit `4abd517` contains only ViewModel/recovery tests.
Code hashes after proof:
ViewModel dcf2a95bcfc96f2a2bb8c0d5ac9e72ec69578adedcea2e183d549b9b0d7a0a40;
tests35d6c88fc3a96e723b485f4b4d060f0efeebdcf6427c97efc06821382345930d.
Retained logs, before/crashed/final unit bundles, final recovery bundle and
hosted fixture recording: `/Users/halfmutantfilms/io.them-worktrees/_proof/T-1049-20261020.o9hwWy/`.

VERIFIED earliest original parent #904 advanced normally to a6a36260 after
its own independent634/0/0 signed units,2/0/0 unchanged recovery and macOS
compile0. Preserve-merge that exact parent into this original #919 child.
Only TASKS.md overlaps; retain both histories. All executable sources remain
identical to the child's actual637/0/0, recovery2/0/0 and macOS0 proof.
No unchanged rerun or borrowed parent-count claim. Fresh exact-head hosted
checks and independent review still required for both original PRs.
