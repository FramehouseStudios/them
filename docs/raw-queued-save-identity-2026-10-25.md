# T-1160 — Exact queued drafts and recovery before server hydration

## 1. Completed

VERIFIED runtime044684911983cd805400ddacf08c141d51cb1a97 on
`codex/T-1160-raw-queued-save-identity`, worktree
`/Users/halfmutantfilms/io.them-worktrees/codex-raw-queued-identity`.
Saved647425d354 plus preserving no-ff69505f1 of original644's focus repair
5759e5a; task-ledger conflict resolved by retaining both histories. No original
PR replacement, squash, force push or ancestry shortcut.

5f27892 fixes actual byte identity in completion/coalescing/intent and durable
outbox comparisons. Whitespace, CRLF and Unicode-equivalent but byte-distinct
changes are not already saved or the same pending request. Historical snapshot
loading retains raw text; only blankness validation trims. Schema unchanged.

b5c9d14 reuses48be183's DEBUG secured-save fault seam/readiness and acknowledged
debug-load guard. It no longer changes the global backend URL to simulate
offline. The existing live-sync automation policy excludes this isolated fault
case. Full restored editor/server byte assertions strengthen the existing UI.

0446849 reuses48be183 queued restoration/adoption, e0477d5 post-await account
revalidation,0209a12 independent detail-hydration wrapper and baaf39e unreadable
queue guard. Adapted to the current injected craft client, raw fingerprints
and existing outbox rather than import a later cumulative branch. Restore the
pending local writer copy before bootstrap OR detail hydration. Keep dirty/
manually edited pages protected. Fail closed on unreadable queue. Drain only
for the loaded selected project; adopt a queued successor only while the page
still matches its saved base. No new queue, persistence framework or product
state on the god views.

## 2. Exact files changed versus saved647425d354

```text
TASKS.md
backend/evals/run_home_voice_handoff_ui_smoke.mjs
docs/hosted-writer-focus-2026-10-25.md
docs/raw-queued-save-identity-2026-10-25.md
them/ScreenplayDraftSaveOutbox.swift
them/ScreenplayLiveDraftSync.swift
them/ScreenplayStudioPersistencePolicies.swift
them/ScreenplayStudioRecovery.swift
them/ScreenplayStudioScreen.swift
them/ScreenplayStudioViewModel.swift
themTests/ScreenplayDraftSaveOutboxTests.swift
themTests/ScreenplayStudioDraftRecoveryTests.swift
themUITests/V1SmokeUITests.swift
```

The hosted-focus report/helper change is preserved from5759e5a. Canonical UI
runner gains only the offline-case selector. Existing save-port environment
still wins; the UI may also use the already-forwarded writer-loop port.

## 3. Failures retained and root corrections

- Initial comma-joined test selector executed **0/0/0** despite Xcode success.
  Invalid evidence; retained, not called a pass. Explicit selectors then ran
  three real cases, **0/3/0**: four raw variants collapse to one entry, changed
  bytes under one ID are acknowledged, later raw changes appear saved.
- The queue/policy correction passed full signed **775/0/0**. It tests durable
  restart, exact retry/deduplication, changed-byte request-ID409 and causally rebased queued
  successors. Existing tests formerly equated normalized text; updated them
  to the raw-retention contract while retaining an exact-identical positive.
- First connected UI **0/1/0** failed before offline setup: no queued marker.
  Not evidence of transport recovery. Canonical fixture correction reached
  the real secured save failure without global URL mutation.
- Second unchanged connected UI **0/1/0** failed after termination/relaunch:
  queue count0, page shows original server text, dirty false. Inspection found
  hydration preceding local queue restoration and independent detail refresh
  bypassing bootstrap. Reused canonical ordering/scope/corruption guards.
- Final unchanged strengthened connected UI **1/0/0**, no skip or retry loop,
  same snapshot waits/time allowances. Actual authenticated project, DEBUG
  injected connectivity error after durable enqueue, terminate/relaunch
  without fault flag, real server reconnect/save. Compare complete editor and
  server-version UTF8 to captured queued text (decomposed Unicode), require
  exactly one recovered version with idempotency key. This is not a physical
  Airplane Mode or real microphone/provider test.

## 4. Final proof and adversarial boundaries

- Full signed erased units **778/0/0**; includes direct real-VM queued-versus-
  remote hydration and corrupt queue page/file retention. Pure policy tests
  reject changed account/session/project and newer dirty/manual authority;
  these are not newly suspended real HTTP account-switch experiments.
- Owned91693AF0-AE2C-4FAD-9F4C-EC4C92AA382A, iPhone17Pro/iOS26.2/23C54,
  Xcode26.3. Reserved7F1A14C1 not erased or used by this proof. No unsigned test.
- Final connected UI provider counters **ASR0/chat0/TTS0**. No paid call,
  live-model quality, audible reply, physical device or product-latency claim.
- Mac scaffold **BUILD SUCCEEDED**, build only. Existing actor/Swift6 warnings
  retained; do not call warnings resolved or macOS journey proven.
- D009 vs saved647425d354 passes: index33557, Studio17345(-7), Root14963,
  bridge12926, Memory10845. First local comparison failed closed on missing
  remote-tracking ref; fetched actual parent, then verified. Diff check passes.
- Production backend AND backend tests byte-identical to425d354: retained
  zero-byte diff. Its Node20.20.2 full **2869/0/2** is explicit parent evidence,
  not a new full run. Changed runner passes node syntax and executes the UI.
- Raw retry/restart/rebase and unreadable-manifest boundaries answered by the
  listed cases. Multi-entry HTTP saves while editing, more-than-four drain
  handoff, sign-out during live HTTP, newest not-yet-queued fast-close edits,
  and unresolved-conflict relaunch need their separate preserved repair/proof.
  Queue metadata/source/notes identity beyond draft bytes is not audited here.
  Do not call all recovery paths complete or the system universally lossless.

Explicit permanent archive:
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1160-20261025.DpxJPt/`.
Keep invalid selector, all real red bundles,775/final778 bundles, final UI,
exact patches, logs and source-equivalence evidence. No private env, provider
key, signing material or temporary auth/persistence store copied.

## 5. GitHub status

Only scoped backup publication; originals645/646/647 remain held behind exact
6445759e5a's live hosted Quality run40253410928. Backend/D009/Docker green,
Quality last observed in the voice-fault/Mac step, not terminal. No main merge,
review submission, protection change, force push, branch deletion or deploy.
Human non-author638 review remains independent of these local repairs.

## 6. Next active task

Resolve the first actual hosted failure, or advance preserved645 after exact
644 is fully green. Carry the focus correction into that saved head without
rewriting original history. Before648/phone proof, retain the existing save-
drain/conflict and Root async creation authority work; do not lose it while
porting originals. Legacy `run_screenplay_save_network_fault_smokes.sh` still
contains unsigned iOS test flags and was NOT invoked. Reconcile its canonical
a691764/48be183/e0477d5 repair with the existing signed runner before trusting
that alternate entry point; do not maintain two erasure/signing owners.

## 7. Continue status

READY FOR CONTINUE. Full product goal active/incomplete. Production hold,
physical microphone/reply/specific rewrite and fresh externally-opened export
against the intended shipping backend remain separate unproven requirements.
