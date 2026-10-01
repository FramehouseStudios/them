# Studio action integration gate repair — 2026-09-30

## Scope and landing order

This is an additive repair on PR #643 head
`86cc5b245a57bd07e330cec26d07fdb16f93d20a`, not a replacement for
Claude's Studio actions. Preserve the original commits and current branch head.
The human-approved first merges remain #766, then #770; this repair must not
land ahead of those data-loss fixes or bypass the required independent review.

## Root cause and fix

VERIFIED: #643 adds two lines to `RootExperienceView.swift` against its actual
parent, #642 (`claude/pages-port`): 15,031 → 15,033. A comparison against today's
larger main would conceal this violation after the preceding stack lands.

The existing `StudioCapabilitiesSnapshot` now owns attachment to the existing
turn metadata. Nil metadata remains nil, and the snapshot is evaluated lazily.
The existing `StudioActionDispatcher` now owns the response callback wrapper:
read Studio visibility when the response arrives, dispatch supported actions,
then forward the unchanged response to the existing voice handling callback.
The existing closed-Studio mount delay is unchanged. No new framework,
notification type, backend contract, action, or parallel implementation.

The root view returns to 15,031 lines. Tests cover absent metadata without
snapshot work, preservation of the complete anchored turn metadata, response-time
visibility, supported-action filtering, and dispatch-before-response ordering.

## Independent proof

VERIFIED on the isolated worktree, Xcode 26.3, iPhone 17 Pro simulator
`E37CE808-0323-4F50-8E8E-212D7ABFA268`, erased before each signed proof run:

- Focused `StudioActionsTests`: 10 executed, 0 failures.
- Full `themTests`: 654 executed, 0 failures.
- Signed iPhone UI: 2 executed, 0 failures; complete direct page typing and
  all six Studio inspector tabs reveal their real panels and selected states.
  These tests use the existing DEBUG UI fixture, not a production backend.
- Full Node 20 backend `npm test`: 2,779 passed, 0 failed, 2 skipped
  (2,781 tests). Clean environment; live page-sync calls disabled; no private
  `.env` or release environment file present in this worktree.
- `GITHUB_BASE_REF=claude/pages-port node scripts/check_god_files.mjs`: pass.
- `GITHUB_BASE_REF=claude/studio-actions-port node scripts/check_god_files.mjs`:
  pass; only the root view shrinks by two lines against #643 itself.
- `git diff --check`: pass.

Proof artifacts are retained outside the repository at
`/Users/halfmutantfilms/io.them-worktrees/_proof/branch-audit-20260930/`:
`pr643-repair-focused.log/.xcresult`, `pr643-repair-units.log/.xcresult`,
`pr643-repair-backend.log`, `pr643-repair-ui.log/.xcresult`.

## Limits and remaining proof

The unit and backend results do not prove a physical-microphone/provider round
trip or production restore. Paid model calls remain blocked until the human
confirms credit top-up. The preserved 0.6-second closed-Studio mount delay is
not an acknowledgement-based delivery guarantee; this repair neither expands
nor claims to resolve that pre-existing behavior.

Backend `index.js` remains 33,626 lines at this early stack position, as explicitly
approved by the human. The exact 33,603 invariant starts later in the existing
stack, not by deleting unrelated backend lines here.
