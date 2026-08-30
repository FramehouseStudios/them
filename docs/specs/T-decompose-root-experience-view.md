# Spec: T-decompose-root-experience-view

**Status**: ready-for-codex (post-V1, after TestFlight).
**Owner**: codex (iOS scope).
**V1 pillar**: infra (enables all)
**V1 effect**: infrastructure for V1.x stability — `RootExperienceView.swift`
is 529 KB and contains the whole onboarding + companion + screenplay
launch state machine. Today every iOS regression touches this file;
splitting it makes review safe and unblocks parallel iOS work.

## Problem

`them/RootExperienceView.swift` is **529 KB / ~12,000 lines**.

It contains:
- The first-run onboarding wizard (name, seed scene)
- The companion/orb presence + initiation system
- The screenplay launch + project picker shell
- Backend health / fallback handling
- Memory refresh + character-mention surfacing
- Live-handoff display (recent assistant context)
- Modal sheets for export, data controls, conversation history
- All of the above's state machines, animations, and gestures

Any change anywhere risks a merge conflict with anything else, and
PR reviews are unreviewable past a certain diff size. This is the
single biggest iOS maintenance risk.

## Approach — phased, byte-identical, mirrors backend Phase 0-N

Follow the proven pattern in `docs/specs/T-decompose-backend-index.md`:
extract one concern at a time, keep behavior byte-identical, prove
the pattern on the smallest piece first.

### Phase 0: data plumbing (no UI change)

Extract the ObservableObject / @State carriers used by
RootExperienceView into a `RootExperienceViewModel` struct in
`them/RootExperience/RootExperienceViewModel.swift`. The view body
references the same fields by the same names, so it's a move-not-rewrite.

DoD: file count +1; behavior identical; `themTests` green;
`ScreenplayPromptBuilderTests` and `BackendEvolutionSyncPolicyTests`
unchanged.

### Phase 1: onboarding wizard

Extract `OnboardingNamePromptView`, `OnboardingSceneSeedView`, and
their state into `them/RootExperience/Onboarding/`. The root view
becomes `if needsOnboardingName { OnboardingFlow() } else { ... }`.
Net lines moved: ~1500.

### Phase 2: companion presence + orb

Extract `CompanionPresenceView`, `HerMicroInitiationsView`, and
their state into `them/RootExperience/CompanionPresence/`. The orb
itself already lives in HerOrbView.swift; this phase moves the
*hosting* code, not the orb. Net lines moved: ~2000.

### Phase 3: screenplay shell

Extract the project picker, "create project" flow, and the bridge
into ScreenplayStudioScreen. Net lines moved: ~2500. After this,
RootExperienceView's screenplay surface is one `ScreenplayShellView()`
call.

### Phase 4: modal sheets

Each modal (export, data controls, conversation history) becomes its
own file. Net lines moved: ~1500.

### Phase 5: residual cleanup

After Phases 0–4, RootExperienceView should be < 100 KB and contain
only the top-level state machine that chooses which scene to show.
At that point the giant file is gone and further work happens in the
extracted modules.

## Safety mechanisms

- **Byte-identical first**: every phase moves code without rewriting.
  No renames, no signature changes, no inlined logic.
- **No new tests required per phase**, but no test deletions either.
- **Snapshot the view before and after** each phase: take a single
  view-hierarchy screenshot of RootExperience on the simulator
  (light + dark mode), compare to the pre-extraction snapshot
  pixel-equal. Diff in the PR description.
- **One phase per PR.** Reviewer reads diff bottom-to-top: net
  zero changes by line within the moved blocks; only positions
  changed.

## Acceptance (overall)

- `RootExperienceView.swift` is < 100 KB.
- The view body reads like a router: it picks which child to render,
  it does not implement them.
- No regression in `themTests` or the V1 manual smoke.
- iOS V1 build size is unchanged (or decreases) due to no new code.

## Risks

- SwiftUI state propagation across an extracted child can drop
  @Environment changes silently. Mitigation: every phase exercises
  the new boundary in `themTests` (or `themUITests` once
  `T-ios-xcuitest-v1-smoke` lands).
- Codex review fatigue on long phases. Mitigation: hard cap each PR
  at ~2500 net moved lines.

## Out-of-scope follow-ups

- `T-decompose-screenplay-studio-screen` — even bigger file, separate spec.
- Migrating any of the extracted modules to use a state-management
  library (TCA, Observation framework) — explicitly post-decomp.
