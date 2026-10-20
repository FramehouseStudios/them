# Parked conflict choice restoration — T-1033

## Boundary and evidence

Source: original #962 `f5e746c2146afd2050cad596d73f863961a72def`.
Hosted run39367137834 ended red: recovery **4 passed / 1 failed / 0 skipped**,
iPhone17 Pro/iOS26.5(23F77). Actual xcresult summary read. The failed assertion
is in `test_screenplay_save_outbox_refreshes_auth_and_resolves_stale_conflict_once`.
Its snapshot retains the exact writer marker and parked save count1, but has
empty conflict project/server-version fields. Do not call this proven text loss
or dismiss it as a flake because earlier local recovery passed.

Other actual hosted summaries on this head: units869/0/0 and V1 UI29/0/15.
Neither skipped V1 checks nor the unreached later voice/macOS step is a pass.
The hosted results are not evidence for the new descendant before a fresh gate.

## Root gap and fix

Queued restoration returned nothing when a dirty editor already had local
text. It also preferred a newer ordinary recovery base. If cached editor or
ordinary-recovery metadata already named the server head, normal hydration
protected the text but no longer recognized the unresolved parked conflict.
The queued original base still existed, but its decision disappeared.

The canonical restore method now returns the verified owned/project-scoped
entry independently of whether text replacement is permitted. Existing newer
writer text is untouched. Canonical project hydration combines an explicitly
conflict-parked entry with complete current-head detail and restores the choice
through the existing `handleDraftSaveConflict` owner. It does not rebase/send
the queued request, overwrite text, add persistence or infer a server draft.

Existing conflict state and active saves take precedence. Auth identity,
selected project and hydration generation are checked after the lookups and
again after the conflict-handler await. Incomplete project detail cannot
manufacture a server choice. Keep Mine/Load Server remains an explicit action.

The local reproduction proves this causal gap, not the exact ordering of every
hosted launch callback. Fresh iOS26.5 proof is still required before calling
the hosted failure resolved.

## Verification

- Before: signed isolated check failed, one test/four assertions. Three nil
  conflict-state assertions reproduce the dirty-first failure. One additional
  text assertion exposed fixture ordering: structural setup had cleared the
  ordinary recovery. The fixture was corrected by installing that snapshot
  after structural setup; do not attribute that extra failure to product code.
- After: signed **870/0/0**, erased owned Pro26.2(23C54), actual summary read,
  native exit0. Both startup orders now preserve exact boundary/Unicode bytes,
  the original parked draft/base and no automatic version POST.
- Node20.20.2, external network disabled: backend **2897/0/2** (2899 checks,
  47 suites); scripts **231/0/0**; offline mentor gate OK; native exit0.
  Skips remain ordinary-suite live Postgres prefix without DATABASE_URL and
  opt-in live page-write provider proof. No paid model request was made.
- Source frozen as tree `43e213f15b881d93dfe93c2882fe4286b1539134`; runtime
  files unchanged during proof. Backend bytes match the original failed head.
- D009 vs fetched `origin/codex/T-980-exact-draft-retention`: all five protected
  deltas0. Whitespace check passes. No UI assertion/timeout/retry was relaxed.
- Five unchanged signed app-recovery workflows: **5/0/0**, actual summary read,
  erased owned Pro26.2, auth-required loopback backend, dummy provider key.
  Includes the actual relaunch/Keep Mine tap and exact-one server version,
  offline reconnect, delete-all, blank snapshot and fresh Load Server choice.
  Host Node24.19.0 orchestrates this fixture; backend suite above is pinned20.
  Final macOS scaffold **BUILD SUCCEEDED**, serialized after the successful UI
  run; native handle terminal exit0. No new writer/export or voice UI run was
  claimed on this descendant; fresh hosted gate must still execute its full set.

Private evidence: `/Users/halfmutantfilms/io.them-worktrees/_proof/T-1033-20261019.43SwVA/`.
The hosted failed, before, final units and recovery UI bundles were cloned and
byte-compared. Logs: `/tmp/them-1033-before.log`,
`/tmp/them-1033-full-units.log`, `/tmp/them-1033-node20.log`,
`/tmp/them-1033-recovery.log`, `/tmp/them-1033-macos.log`.

## Adversarial review and remaining boundaries

- Answered locally: newer dirty text is not replaced by the older parked copy;
  a newer ordinary recovery carrying server-version metadata does not dismiss
  the unresolved original base; relaunch does not issue a version POST.
- Answered by existing guards/full unit proof: wrong/stale auth/project lookups
  cannot return another context; existing conflict and active save ownership
  take precedence. Load Server advances hydration generation; Keep Mine enters
  the existing save lane before its first persistence await.
- Verified locally: unchanged interactive conflict/relaunch/Keep Mine workflow.
  Pending: fresh required hosted checks, production/physical-phone journey and independent
  review. No claim that simulated model responses establish live behavior.
- Follow-up boundary: initial-project-creation's parked-seed retry still calls
  direct hydration under a reserved creation/save lane. It is not the ordinary
  relaunch path fixed here; verify its pending-choice recovery separately.

Files changed: `them/ScreenplayStudioViewModel.swift`,
`themTests/ScreenplaySaveConflictAuthorityTests.swift`, `TASKS.md`, this record.
Original #962/child heads/main and the separate T-1032 recovery work are
preserved. Production hold, no-paid-calls restriction and original PR/review
protections are unchanged. This is not a completed THEM release or phone proof.
