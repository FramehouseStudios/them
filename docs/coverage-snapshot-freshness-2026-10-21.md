# T-1101 — Coverage follows the draft without pretending old notes are current

October 21, 2026. Parent `41e1154` (T-1102).
Branch `codex/T-1101-coverage-snapshot-freshness`.
Runtime/test checkpoint `5f71ec5c8ea7d5bd6f37b47a352ac57850eeab28`.

## Original work and root corrections

Read original #646 body, commit and current head
`72f9375e8e980cedbb1d7ed34a8339a155dd6613`, based on #645. Preserving no-ff
merge `9fcae90a059f09fd5597fc659f964059aff5ad94` retains its history and original
page/scene-change refresh rule. Read original #774 body and exact native diff
at `a001ec0`: reused its quiet announcement seam, not its cumulative ancestry.
Its other changes and preserving original integration remain at that boundary.

VERIFIED before correction: focused signed tests **19 pass / 2 fail / 0 skip**.
The failures demonstrate that a byte-distinct edit still sends the earlier
coverage summary through the actual Studio capabilities builder, and title-only
or non-LF imported documents have the wrong refresh shape. The summary failure
also covers trailing whitespace: raw words/bytes, not trimmed String equality.

Smallest coherent correction through the current owners (Jarvis):

- Registry lookup requires matching account/session, project and exact raw
  draft UTF-8. The production capabilities builder passes the bridge's original
  bytes, not its trimmed presence-check string. Earlier scores therefore cannot
  be supplied as the current script; undo to the exact snapshot can reuse them.
- Same-project notes remain useful in the card, but the card labels them
  **Earlier snapshot** immediately after an edit. Hear earlier read adds an
  explicit spoken warning. This does not prove audible playback or a new voice
  owner; the existing root speech owner is unchanged.
- Refresh shape uses the canonical Fountain body and normalized physical line
  endings, preserving original stored bytes. Title-only documents do not trigger
  a request. Coverage keeps its standard printed-page basis, not the inspector's
  adjustable display density. No new parser or pagination implementation.
- Automatic reads still wait for the existing draft debounce and page/scene
  shape change; never while streaming, already refreshing, cancelled, title-only
  or missing a project. The helper rechecks state when its Task actually runs.
- Keep #774's quiet background behavior: no status-strip grade announcement and
  no speech for automatic reads. Explicit/import reads keep their announcements.
- Remember one automatic attempt per owner/page/scene shape so an offline/error
  response does not become another HTTP request after every word. New shape or
  project permits a new attempt; Read again always permits an explicit retry.
  Tradeoff: returning online alone does not install a new auto-retry loop; use
  Read again or continue into a changed shape. No provider call for coverage.

No screenplay mutation/save logic, orb, aesthetic, product name, chosen target,
accepted decisions, auth convention, persistence schema or server route changed.

## Scope and verification

Changed implementation/test files:

- `them/ScreenplayCoverage.swift`
- `them/ScreenplayCoverageCardView.swift`
- `them/ScreenplayCraftRailView.swift`
- `them/ScreenplayStudioThemRailCraftViews.swift`
- `them/ScreenplayStudioViewModel.swift`
- `them/StudioActions.swift`
- `themTests/ScreenplayCoverageTests.swift`
- `themUITests/V1SmokeUITests.swift`
- `backend/evals/run_home_voice_handoff_ui_smoke.mjs` (one allowlisted UI case)

TASKS.md and this report are additional documentation files.

VERIFIED: focused signed **25/0/0** on erased task-owned iPhone 17 Pro,
iOS 26.2 (23C54), `7F1A14C1-B379-4417-AFE9-331810CD9CD3`. Includes real VM
owner/out-of-order/cancel guards; Unicode/trailing-byte capabilities; retained
card freshness; silent auto-read; bounded failed attempts, explicit retry and
new scene/project; streaming/in-flight/empty/unowned suppression; title/body
and LF/CRLF/CR/U+0085/U+2028/U+2029 shape. Original policy tests remain.

macOS scaffold BUILD SUCCEEDED; D009 and diff check pass. Existing actor and
Sendable warnings remain, not suppressed. Five monitored file counts unchanged
from the task parent: index33557, Studio17337, Root14992, bridge12934,
MemoryAPI10845. No artificial line-count padding.

Production backend source has no difference from T-1102; the UI runner gains
one allowlisted case. Its Node 20.20.2 result remains
2898/0/2 parent evidence, not a newly run suite. Full themTests is not repeated
for this coverage-only correction; the previous full822 is parent evidence.
No paid model calls or extrapolated live mentor quality.

First attempted expanded writer workflow: **0/1/0**, deliberately interrupted
after observing its invalid edit-position expectation and incorrect command-bar
keyboard-dismissal action. The earlier editor tap put the caret at the start,
not the end; screenshot retained. This is not a completed export/relaunch proof.
Kept the existing writer/export/relaunch assertions intact by sharing setup
with a dedicated coverage-only case rather than weaken/reshape the old gate.
The dedicated case observes actual inserted bytes and uses the existing
inspector opener's explicit end-editing path (no QuickPath swipe).

Second attempted UI run: **0/1/0** before app launch, XCTest required main-thread
launch. Moving setup into an unannotated async helper had hopped executors.
The new shared helper is now explicitly MainActor, not a runtime app workaround.
Final dedicated signed UI **1/0/0**: real app-created authenticated project,
one saved version, connected deterministic read, actual same-page edit, visible
earlier-snapshot label/Hear earlier read, then real Read again removes the stale
label and restores Hear her read. Visually inspected its captured screenshot:
the explanation and freshness label use ordinary readable multiline text, not
letter-per-line wrapping, on this iPhone 17 Pro. Smaller SE/Dynamic Type were
not rerun. This is not a spoken-audio or physical-microphone test.
A frozen tracked-source backend excludes private environment files; provider
traffic is synthetic/intercepted, never model proof. No new export/relaunch
proof is claimed by passing only the dedicated coverage case.

Permanent retained proof:
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1101-20261021.0o1W52/`
Committed-source tar and integration patch pin the runtime; red/green bundles,
logs and actual screenshot are retained. The native red bundle is evidence,
not a claim of a frozen complete red-source tar. Final runtime matches the
focused/macOS proof; subsequent changes only add/correct the dedicated UI case.

## Remaining boundary

Original #647 `848e59d0` is actually based on #646. Read its current body and
commit: delegated auto-title avoids using the first action line as a script
title. Integrate it next without discarding current recovery/title ownership.

No main merge, original-head overwrite, replacement PR, deployment, release or
physical-phone completion. Current #964 remains OPEN / REVIEW_REQUIRED with
all three required hosted checks SUCCESS at `5faa43d6`; no approval bypass.
Production credential hold remains. THEM is not complete.
