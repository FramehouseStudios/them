# T-973 — A project's name follows the writer's document

## Preserved original

Preserving merge of original #647
`848e59d040dc935d082beaeb7dc21c51faee4222` above T-972
`cc75e51f436055ada516d08022559963e30e6543`.
Read body and all three changed files. No squash, original-head rewrite,
replacement original PR, or main merge.

Retain the original project naming order: explicit title, scene heading,
pack name, dated fallback. Preserve scene-heading presentation and the
48-character display clamp. Root delegates instead of owning title logic.
The durable automatic creation worker/outbox and writer's raw text stay intact.

## Root-cause reconciliation

VERIFIED original helper, compiled directly with `swiftc` and a small synthetic
caller, failed **3 of 3** boundary cases:

- `INT. KITCHEN ... Title: The Wrong Project` selected the screenplay's action
  as metadata instead of the scene-derived name.
- A real multiline `Title:` selected the scene name instead of the writer title.
- A writer's `Title: X` was replaced by a derived location name.

Executable and caller `/tmp/them-973-title-before.hqWOkg/`, output
`/tmp/them-973-title-before.log`, probe exit1. This is real helper behavior,
not signed XCTest or model output. The same cases are app unit regressions.

DECIDED: original #613 already supplies the canonical leading title-page
boundary and multiline metadata. Reuse `FountainTitlePageCodec` and remove
the helper's twelve-line title scan. Only screenplay body lines can supply a
heading fallback. Project title display still strips markup/clamps whitespace;
the document's original bytes and explicit one-character title are preserved.

Home handoff UI now checks that the automatically created project is named
`Observatory at Night` in the authenticated backend record and remains so after
app relaunch. No replacement for the durable creation path is introduced.

## Files

- `them/RootExperienceView.swift`
- `them/ScreenplayProjectAutoTitle.swift`
- `themTests/ScreenplayProjectAutoTitleTests.swift`
- `themUITests/V1SmokeUITests.swift`
- `TASKS.md`
- `docs/project-title-integration-2026-10-16.md`

## Verification

VERIFIED: signed focused title plus creation-recovery units **29 pass / 0 fail /
0 skip**, exit0, erased owned iPhone17Pro/iOS26.2. Authoritative bundle and log:
`/tmp/them-973-title-units.xcresult`, `/tmp/them-973-title-units.log`.
VERIFIED: both connected Home handoffs (confirmed transcript and fixed server
ASR) **2 pass / 0 fail / 0 skip**, process exit0; automatic project title
`Observatory at Night` persisted and exact draft restored after relaunch.
Bundle `/tmp/them-973-title-home.xcresult`, log `/tmp/them-973-title-home.log`.
Fixture counts: STT1/chat4/TTS24; the fixture rejects unmatched external
requests. These are fixed outputs, not paid provider or real-microphone proof.
The first macOS result and final isolation correction are recorded below.
The first macOS compile completed exit0 but exposed a new implicit-main-actor
warning at `lines.lazy.compactMap(sceneHeadingTitle)`. DECIDED: title parsing
has no UI state, so mark the helper `nonisolated`, matching existing pure
policy types. Final signed title/creation tests and final macOS compilation
are required after this correction. The two passing Home UI cases preceded
this isolation-only annotation; do not label them an exact-final-head rerun.
VERIFIED: final signed title/creation tests after the annotation **29/0/0**,
exit0; `/tmp/them-973-title-final-units.xcresult` and
`/tmp/them-973-title-final-units.log`.
VERIFIED: final macOS scaffold compile **exit0**;
`/tmp/them-973-title-final-macos.log`. No title-helper warning/error diagnostic
remains. Other existing warnings remain, including PrintScreenplayIntent's
non-Sendable callback; this is compilation, not macOS UI proof.
All14 host runner contracts pass (`/tmp/them-973-runner-contracts.log`).
D009 versus T-972 passes: Root -29 lines, other watched deltas0. Working diff
checks pass. The original before caller is a private synthetic fixture only.
Backend source is unchanged; T-971's Node20 full2837/0/2 is prior-head/source-
identical evidence, not a fresh backend run. No paid model calls this pass.

The connected handoff uses deterministic provider responses and is not a
microphone, live model quality, shipping backend or physical-phone result.
120-page generation/print parity and release readiness remain unproven.

Next actual base-chain boundary is #648, current head
`210c5ef02d075b0bd359d4c55f5b8c0917d15554`, base `claude/project-auto-title`.
Its current two-commit range includes `ab05fb5d` mentor opener shaping and
`210c5ef0` live Studio voice actions/prompt protection. Read and preserve both,
not just the opening PR body or first commit. Historical live scores are not
current integrated model proof.
Source-review concern for that next boundary: writer-command regexes need
negative/quoted/hypothetical command tests before trusting inferred save or
navigation actions. This is a review target, not a reproduced runtime claim.

Private proof retention:
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-973-20261016.MGMDJD/`.
Full iOS unit bundle is not repeated at this boundary; T-971's836/0/0 is
prior-head evidence, not this updated Root/helper tree's full-suite result.
