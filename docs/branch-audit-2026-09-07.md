# THEM remote branch audit — September 7, 2026

## Decision

The repository has **158 remote branches including `main`**. The branch count
does not represent 157 independent features. Most of the apparent work is
already merged, patch-equivalent, duplicated, or inherited through cumulative
stacks.

Do not bulk-merge, bulk-rebase, or delete branches. The safe product train is:

1. `codex/T-writer-beta-files-picker` — PR #590.
2. `codex/T-pages-narrow-inspector-v2` — PR #591, rebased after #590.
3. `codex/T-clementine-global-voice` — PR #592, rebased after #591.
4. Reconstruct the useful part of `codex/onboarding-trust-polish` after that
   train; do not merge its stale branch.

Every other unmerged capability must be ported as a small current-main change
with its own tests, or retired. Required GitHub checks must execute and pass
before any implementation merge. As of this audit, Actions jobs abort before
steps run because of the account billing/spending-limit block.

## Scope and method

- Baseline: `origin/main` at `60bb72d8c5e135388c7bd0553091691a5e25ed93`.
- Inventory: Git refs and GitHub's live branch/PR APIs after `fetch --prune`.
- Coverage: 59 `claude/*`, 50 `clementine/*`, 46 `codex/*`, one `ci/*`, one
  `muse/*`, and `main`.
- Comparison: ancestry, ahead/behind, patch equivalence, merge bases, unique
  tip commits, tree/file overlap, open/closed PR state, recorded checks, and
  targeted source/test inspection.
- Safety: the audit itself did not merge, close, delete, rebase, or modify any
  reviewed branch or PR.

## What the numbers really mean

| Class | Count | Meaning |
| --- | ---: | --- |
| `main` | 1 | Current integration baseline. |
| Literal ancestors of `main` | 58 | No unique work remains. Safe future cleanup candidates. |
| Non-main refs nominally ahead | 99 | Includes patch-equivalent work and inherited stacks; not 99 features. |
| Open PR heads | 71 | 36 are one disconnected Clementine chain; 31 are Claude stacks/slices; four are Codex app PRs. |
| Orphan ahead refs | 28 | No open PR; most are stale snapshots, closed-PR remnants, or forensic sources. |
| Current app changes | 4 | #590, #591, #592, and the stale #422 capability that needs reconstruction. |

## Current landing train

| PR | Branch | Product outcome | Required disposition |
| ---: | --- | --- | --- |
| #590 | `codex/T-writer-beta-files-picker` | Honest native iPhone Files export, exact artifact ownership, cancel/retry, Google Docs handoff | Polish the malformed PR description, restore Actions, rerun hosted checks, then land first. |
| #591 | `codex/T-pages-narrow-inspector-v2` | Readable Page Navigator, density controls, previews, and real page navigation at phone width | Rebase after #590, remove the duplicated provenance compile fix if already present, then rerun the combined signed workflow. |
| #592 | `codex/T-clementine-global-voice` | Clementine voice on all six Studio tabs with trusted tab context and live instruction refresh; visible app name THEM | Rebase after #591 and run export + Pages + all-tab context together. |
| #422 | `codex/onboarding-trust-polish` | Authenticated first-run resume and workspace navigation | Rebuild its unique behavior on post-#592 `main`; the 81-behind branch previously failed the integrated writer-loop gate. |

The three current branches are individually textually mergeable. Their shared
Studio files require behavioral integration even when Git finds no conflict.
`UNSTABLE` currently means required jobs did not start, not that the local
evidence or source merge is accepted.

## Clementine namespace — 50 branches

### Already represented on `main` — retire later

These twelve refs are the same commit, `2656cf5`, already contained by `main`:

`arc-subplot-image`, `beat-craft`, `dialogue-ghost-payoff`,
`finaldraft-killer-all3`, `ghost-ledger`, `ghost-payoff-ledger`, `image-echo`,
`prose-polish`, `scene-beat-craft`, `scene-craft-image`,
`scene-image-echo2`, and `voice-lexicon-polish`.

`writer-learning` and `craft-suggestion` are not ancestors, but all four of
their files are byte-identical to the versions merged by #549. They also have
no remaining patch to port.

### Disconnected 36-branch chain — close, do not merge

The remaining branches are consecutive snapshots of one linear chain from
`smooth-amazing` through `smooth-clementine-ghost-page`. The final snapshot is
36 commits, 76 files, and 1,162 additions with zero deletions: 39 backend
modules, 36 tests, and one Swift file.

The chain has no production entrypoint. Its builders and motion/debounce types
are referenced only by their own tests or by the next wrapper. The top unit run
passed 39 tests and the Swift file typechecked, but that proves isolated object
construction, not app behavior.

The full ordered chain is:

1. `smooth-amazing`
2. `smooth-ghost-payoff`
3. `smooth-scene-ghost`
4. `smooth-ghost-voice`
5. `smooth-ghost-voice-notes`
6. `smooth-ghost-payoff-notes-image`
7. `smooth-ghost-voice-notes-image-theme`
8. `smooth-ghost-voice-notes-image-theme-polish`
9. `smooth-ghost-voice-notes-image-theme-polish-beat`
10. `smooth-ghost-voice-notes-image-theme-polish-beat-track`
11. `smooth-ghost-voice-notes-image-theme-polish-beat-track-ledger`
12. `smooth-ghost-voice-notes-image-theme-polish-beat-track-ledger-live`
13. `smooth-ghost-voice-notes-image-theme-polish-beat-track-ledger-live-dual`
14. `smooth-ghost-voice-notes-image-theme-polish-beat-track-ledger-live-dual-director`
15. `smooth-ghost-voice-notes-image-theme-polish-beat-track-ledger-live-dual-director-export`
16. `smooth-ghost-voice-notes-image-theme-polish-beat-track-ledger-live-dual-director-export-collab`
17. `smooth-ghost-voice-notes-image-theme-polish-beat-track-ledger-live-dual-director-export-collab-inspector`
18. `smooth-ghost-voice-notes-image-theme-polish-beat-track-ledger-live-dual-director-export-collab-inspector-flip`
19. `smooth-ghost-voice-notes-image-theme-polish-beat-track-ledger-live-dual-director-export-collab-inspector-flip-clementine`
20. `smooth-ghost-voice-notes-image-theme-polish-beat-track-ledger-live-dual-director-export-collab-inspector-flip-clementine-writer`
21. `smooth-ghost-voice-notes-image-theme-polish-beat-track-ledger-live-dual-director-export-collab-inspector-flip-clementine-writer-polish`
22. `smooth-ghost-voice-notes-image-theme-polish-beat-track-ledger-live-dual-director-export-collab-inspector-flip-clementine-writer-polish-ghost`
23. `smooth-ghost-voice-notes-image-theme-polish-beat-track-ledger-live-dual-director-export-collab-inspector-flip-clementine-writer-polish-ghost-coverage`
24. `smooth-ghost-voice-notes-image-theme-polish-beat-track-ledger-live-dual-director-export-collab-inspector-flip-clementine-writer-polish-ghost-coverage-theme`
25. `smooth-ghost-voice-notes-image-theme-polish-beat-track-ledger-live-dual-director-export-collab-inspector-flip-clementine-writer-polish-ghost-coverage-theme-image`
26. `smooth-ghost-voice-notes-image-theme-polish-beat-track-ledger-live-dual-director-export-collab-inspector-flip-clementine-writer-polish-ghost-coverage-theme-image-subplot`
27. `smooth-ghost-voice-notes-image-theme-polish-beat-track-ledger-live-dual-director-export-collab-inspector-flip-clementine-writer-polish-ghost-coverage-theme-image-subplot-beat`
28. `smooth-ghost-voice-notes-image-theme-polish-beat-track-ledger-live-dual-director-export-collab-inspector-flip-clementine-writer-polish-ghost-coverage-theme-image-subplot-beat-voice`
29. `smooth-clementine-draft-notes`
30. `smooth-clementine-polish`
31. `smooth-clementine-scene-craft`
32. `smooth-clementine-beat-craft`
33. `smooth-clementine-voice-lexicon`
34. `smooth-clementine-ghost-ledger`
35. `smooth-clementine-image`
36. `smooth-clementine-ghost-page`

It is unsafe to connect as written: editing debounce returns the previous
payload, truncates drafts to 500 characters, uses an unbounded process-global
map, and keys only by project. Other layers use global mutable writer state,
fallback owner identities, synthetic collaboration edits, and hard-coded
`John`/`bedroom`/`horror` defaults. It also emits Samantha terminology while
claiming Clementine cleanup. Repeated whole-draft synchronous transforms would
be costly on real scripts.

Salvage only concepts. Reimplement motion in the real SwiftUI seam with Reduce
Motion and visual tests; put latest-write-wins coalescing in the existing
owner-scoped sync service; migrate naming intentionally. Do not transplant the
wrapper chain.

## Claude namespace — 59 branches

### Contained or patch-equivalent — retire later

Literal ancestors of `main`: `coord-refresh-2026-09-05`,
`creative-partner-order-independence`, `error-mapper-presentation-layer`,
`fdx-export-parity`, `fountain-dual-dialogue-cue`, `iap-credit-recovery-main`,
`inspector-tabs-drawer-reset`, `launch-safety-boot-guard`, `live-draft-sync`,
`live-draft-two-device-smoke`, `quality-gate-deflake`,
`rescue-sprint-security`, `v1-smoke-fixes-on-main`, `voice-print`,
`writer-loop-gate`, and `writer-loop-save-tap-retry`.

`iap-credit-recovery` and `port-error-mapper-approver-guard` are
patch-equivalent to later merged work. `d009-screenplay-export-route` has the
same resulting tree as `backend-pdf-export`. `next-beat-pills` is superseded by
the safer #443 response-transport design.

### Priority ports

| Source | Why it matters | Safe action |
| --- | --- | --- |
| `child-process-no-shell-guard` (#460) | Pins a backend command-execution security invariant. | Recreate/rebase the small guard first. |
| `auth-userid-index-etag-guard` (#423) | Contains useful account indexes, empty-validator handling, unknown-commit fencing, and fixture isolation. | Extract thematic commits only. Never merge the 53-commit, 185-behind stack or its gate-softening policy. |
| `preflight-self-describing` (#455) | Makes GREEN versus PARTIAL release claims honest. | Rebase and retain after current-state review. |
| `repo-hygiene-audit-items` (#456) | Security policy, notices, dependency and scan workflows. | Split durable security automation from stale release notes; verify workflow permissions. |
| `session-churn-fix` (#481) | Stops minting a backend session every five seconds while idle. | Port only its tip and outbox tests from the 25-commit stack. |
| `projects-poll-etag` (#482) | Adds account-scoped conditional project polling. | Port its tip after session churn; verify invalidation and owner scoping. |
| `linter-cue-false-positive` (#477) | Corrects cue-position/case false positives. | Port this focused branch instead of its cumulative script-coverage parent. |
| `fdx-export-pure-date-revision` (#442) | Keeps conversion clock-free and defaults dates at the route boundary. | Port atomically with frozen-input/date precedence tests. |

### Execution update — September 8, 2026

- #460 was rebuilt as #598. The replacement recursively parses every backend
  JavaScript source and tests ESM, CommonJS, namespace, dynamic-import, and
  `shell: true` bypasses. Focused guard 3/3 and full backend suite 2,742/2,742
  passed, with two intentional skips. #460 is closed; its branch is preserved.
- #477 was rebuilt as #597. The replacement keeps the cue-position fix and
  adds canonical Fountain forced-cue behavior, mixed-case extensions, dual
  dialogue, and Unicode/caseless names. Focused tests 30/30 and full backend
  suite 2,745/2,745 passed, with two intentional skips. #477 is closed; its
  branch is preserved.
- #456 is closed without a direct successor. Its private-reporting link does
  not work for this repository, both security workflows failed before proving
  a scan, its labels do not exist, and its RC notes claim open PRs are shipped.
  Rebuild its salvageable pieces independently; never merge the bundle.
- #596 repairs the red backend baseline that GitHub's billing-level job abort
  had hidden. #597, #598, and #599 are stacked directly on it. None may merge until
  the required hosted Quality Gate executes and passes on the candidate SHA.
- #455 was rebuilt as #599. The replacement includes top-level and nested
  quality checks in its summary, rejects invalid gate flags, and makes any
  required skip return `PARTIAL` with exit status 2. Release contract tests
  passed 39/39. #455 is closed; its branch is preserved.

### D009 architecture sequence

Rebuild in this order: `d009-session-route` (#461) →
`d009-visual-context-route` (#462) → `d009-normalizers` (#463) →
`d009-helpers-with-constants` (#465), then add the direct tests from sibling
`d009-sanitizers` (#464). Port `d009-i4-compose-root-and-bridge` independently
only after comparing it with the post-#592 Studio files.

### Product slices that need reconstruction

The following is one inherited stack, not independent merge-ready PRs:

`echo-loop-guard` → `mentor-core` → `mentor-golden-set` →
`three-act-craft-cards` → `pagination-port` → `filmmaker-intent` →
`dialogue-notes` → `mentor-golden-weekly` → `studio-voice-actions` →
`script-coverage` → `studio-beats-undo` → `coverage-in-conversation` →
`studio-live-drive-fixes` → `session-churn-fix` → `projects-poll-etag`.

Port the async crash guard and audio-echo suppression first. Then establish the
mentor contract and offline golden set before any scheduled paid eval. Compare
`studio-voice-actions` directly with #592 and take only missing validated action
execution. Split coverage, undo, formatter, and conversation features into
independent current-main changes.

Focused UI/export sources still have explicit acceptance gaps:

- `ghost-preview-slice` (#431): fix owner/project lifecycle, screenplay cue
  grammar, cancellation ownership, and narrow-phone layout before porting.
- `backend-pdf-export` (#435): a prior exact-head review reproduced
  nontermination, silent content loss, Unicode replacement, incomplete
  continuation cues, and incorrect page limits. Require progress and
  content-conservation invariants plus rendered-PDF inspection.
- `todo-clarify-nudge` (#436): initialize restored drafts, constrain marker
  matching, and verify narrow accessibility before porting.
- `next-beats-response-field` (#443) is the preferred transport foundation,
  but `studio-next-beat-pills` (#444) still needs owner/project/version/request
  identity, stale-result invalidation, retry identity, honest cost copy, and
  phone-layout proof.
- `talk-ghost-print-demo` (#440): do not merge the duplicate print coordinator.
  Keep Release printing off by default, explicit opt-in, and hard kill switch;
  port only safety deltas not already represented by the canonical owner.

Regenerate `launch-doctor-refresh-2026-09-05`; do not merge dated evidence.
Rebase `archive-root-prompts` only if that repository cleanup still matches the
current tree. Recreate `backend-deps-patch-refresh` from current manifests.
Port the useful measurement pieces of `backend-test-coverage-script`
separately from dependency changes and keep coverage measurement separate from
enforcement. Close `quality-gate-pr-cost` (#420): reducing PR coverage
contradicts the required green-before-main rule.

## Codex, CI, and Muse scopes — 48 branches

### Contained on `main` — retire later

`B1-wire-auth-routes`, `B3-talk-handler-stages`,
`D008-clementine-muse-runtime`, `D009-god-file-strangler`,
`D010-tts-elevenlabs`, `D011-storekit-wallet-packs`, `F1-page-craft-eval`,
`F2-page-multipass`, `F3-page-multipass-routing`,
`I3-studio-export-actions-extract`, `T-backend-persistence-gate-hardening`,
`T-clementine-ios-page-cancel`, `T-clementine-muse-standard-cutover`,
`T-craft-analysis-honesty`, `T-elevenlabs-byok-tts-adapter`,
`T-founder-docs-integration`, `T-iap-app-store-server-verify`,
`T-ios-integrated-writer-loop`, `T-ios-keychain-token-migration-review`,
`T-ios-state-auth-rotation-retry`, `T-screenplay-continuity-studio-review`,
`T-studio-eval-auth-restore-review`, `T-v1-release-clearance-refresh`,
`T-wallet-postgres-persistence`, `T382-audit-security-hardening`,
`T383-graceful-shutdown`, `fix-render-postgres-plan`,
`live-cross-device-draft-sync`, `publish-privacy-site`, and `test-ci`.

### Equivalent or topologically misleading — retire later

Patch-equivalent: `I2-ios-page-cancel-service`, `T-clementine-memory-tools`,
`T-clementine-muse-runtime-skeleton`, `T-clementine-page-abort-midflight`,
`T-clementine-page-cancel-e2e`, and `T-v1-ui-regression-repair`.

Capability already on `main` despite non-equivalent merge topology:
`T-clementine-reflex-lane`, `T-clementine-voice-eval`,
`T-clementine-wallet-turns`, and `T-ios-keychain-token-migration`.

### Forensic sources only

- `codex/T-writer-beta-integration`: closed #445; 68 commits, 266 files, and
  roughly 30,000 additions. Do not resurrect. Use as a checklist only.
- `codex/studio-craft-handoff-savepoint`: 1,223 behind with roughly 184,000
  additions, including generated snapshots/corpus material. Never merge.
  Revisit semantic retrieval only after provenance/licensing review.
- `muse/scratch-2026-09-05`: broad root/voice scratch work with direct
  `UserDefaults`, TODO injection, and duplicate print/Page ideas. Harvest no
  code without reconstruction.
- `ci/probe-gate-before-437`: empty diagnostic commit. Retire.

## Production and GitHub blockers

1. GitHub Actions is not executing required checks. Recent annotations say the
   jobs were not started because account payments failed or the spending limit
   must be increased. No implementation PR merges while this remains true.
2. Render's live service remains on the last successful deployment. The newer
   production boot correctly failed closed because App Store Server API
   credentials are absent. Do not weaken the guard or redeploy until those
   credentials exist and the exact candidate SHA is verified.
3. `api.them.io` and the public privacy/domain route require current proof
   before TestFlight acceptance.
4. Required private release inputs and physical-device/provider acceptance are
   separate from local simulator success.

## Execution order after this audit

1. Restore GitHub Actions execution through a human-owned billing setting.
2. Finish and land #590 → #591 → #592 with a combined signed iPhone workflow.
3. Rebuild #422's unique onboarding behavior.
4. Port small security and release-truth slices.
5. Port session-churn and ETag behavior.
6. Land the D009 backend sequence in small deletive steps.
7. Reconstruct focused product work behind real ownership, persistence,
   accessibility, cost, and content-conservation contracts.
8. Regenerate release evidence, validate Render configuration, and promote one
   verified SHA with rollback readiness.
9. Only then prepare an exact remote-branch/PR cleanup list for human-approved
   deletion. Branch deletion is not part of this audit.
