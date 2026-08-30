# Spec: T-decompose-screenplay-studio-screen

**Status**: ready-for-codex (post-V1, after TestFlight, after
T-decompose-root-experience-view stabilizes).
**Owner**: codex (iOS scope).
**V1 pillar**: infra (enables all)
**V1 effect**: infrastructure for V1.x stability —
`ScreenplayStudioScreen.swift` is **1.1 MB** and is the largest file
in the codebase. Same problem as RootExperienceView at twice the size.

## Problem

`them/ScreenplayStudioScreen.swift` is **1.1 MB / ~25,000 lines**.

It contains:
- The screenplay paper canvas (page layout + scrolling)
- The Hollywood format renderer
- The command palette ("⌘↩" submit)
- The inline editing surface
- The voice-line-sync overlay
- The fixer queue and craft-card rail
- The inspector tabs (Memory, Craft, Drift, Twist)
- The export flow entrypoints
- Live partial transcription overlay
- The visual page-write toast
- Selection / cursor / IME handling

Anything that touches the studio touches this file. The
`ScreenplayLiveDraftBridge.swift` next door is another 422 KB; this
spec covers only the *screen*. The draft bridge gets its own spec
once this is stable.

## Approach — same phased pattern as RootExperienceView

Follow `docs/specs/T-decompose-root-experience-view.md`. Each phase
moves a self-contained concern into its own file, byte-identical.

### Phase 0: view-model carrier
Extract state into `ScreenplayStudioViewModel`. Net lines: ~500.

### Phase 1: paper canvas + page renderer
Extract `ScreenplayPaperCanvas` + Hollywood line-type renderer into
`them/ScreenplayStudio/Canvas/`. Net lines: ~5000.

### Phase 2: command palette + submit
Extract `ScreenplayCommandPalette` and the ⌘↩ submit flow. Net lines: ~3000.

### Phase 3: inline editing surface
Extract the inline writer (cursor, IME, selection, hold-to-mute) into
`ScreenplayInlineEditor`. Net lines: ~4000.

### Phase 4: voice line-sync + voice-pin
Extract the voice overlay (transcription, line sync, bargein-cancel)
into `ScreenplayVoiceOverlay`. Net lines: ~3000.

### Phase 5: inspector tabs + craft rail
Extract the inspector right-side rail and its tabs (Memory, Craft,
Drift, Twist) into `ScreenplayInspector`. Net lines: ~4000.

### Phase 6: fixer queue + toast
Extract `ScreenplayFixerQueue` and the page-write toast. Net lines: ~2000.

### Phase 7: residual
After 0–6, `ScreenplayStudioScreen.swift` should be < 250 KB and
read like a layout composer — paper + inspector + voice-overlay,
arranged. The state machine still lives here, but the renderers don't.

## Safety mechanisms

- Same as RootExperienceView decomp: byte-identical moves, one phase
  per PR, snapshot diff before/after each phase.
- **Run the existing studio eval suite** (`npm run eval:studio` in
  backend) after every phase. It's a 39-step gauntlet; a regression
  shows up loudly.
- Cap each PR at ~5000 net moved lines (these phases are larger
  than the RootExperience phases because the source is twice as big;
  smaller PRs would just multiply the review count).

## Acceptance (overall)

- `ScreenplayStudioScreen.swift` is < 250 KB.
- `npm run eval:studio` is green at every phase.
- No regression in `themTests`.
- `T-ios-xcuitest-v1-smoke` (once landed) continues to pass.

## Risks

- The studio has the most surface area in the app. A single dropped
  @State binding could silently break voice line sync. Mitigation:
  the eval suite is unusually comprehensive here — keep it gating
  every phase.
- This work runs in parallel with feature work on the studio. Codex
  must serialize: either feature freeze on the studio during a
  decomposition phase, or rebase the phase PR after every feature
  merge.

## Out-of-scope follow-ups

- `T-decompose-screenplay-live-draft-bridge` (the 422 KB neighbor).
- Replacing the Hollywood line-type renderer with a more efficient
  AttributedString-based path.
