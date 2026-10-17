# Script-bound coverage publication — 2026-09-30

## Problem and scope

VERIFIED: a delayed coverage response from project A could publish its card,
global conversational summary, completion message and speech request after
switching the real Studio view model to project B. The reproduction failed
four assertions before the guard; it injects only transport, not a fake policy.
Original #644 and tip #877 both lack this publication guard.

Additive repair based on #880 `b619d7d0`; no original Claude branch rewritten.
Keep #766 → #770 first, then the original product stack. Preserve #646's
same-project refresh policy and #774's quiet announcements when integrating.

## Root fix

Reads capture canonical account/session intent, project, exact draft and a
unique request ID. Success and error publication require that context to
remain current; cancellation cannot publish. Only the owning request ends its
loader. Project/account changes or blank drafts invalidate reads, while normal
nonempty edits retain a completed same-project read for manual refresh.

The shared summary is scoped at capabilities-read time; request-owned clearing
prevents an old view model erasing a newer view model's read. Cards also check
current identity before a queued identity notification arrives. A delayed
notification does not erase a fresh read. No writer content is logged or newly
persisted; no provider call was made. Normal typing avoids new auth lookups.

## Proof

VERIFIED: Xcode 26.3, dedicated iPhone 17 Pro simulator
`E37CE808-0323-4F50-8E8E-212D7ABFA268`, erased before signed iOS runs:

- Before fix: one reproduction test, four assertion failures (expected).
- Initial focused coverage/actions: 21 tests, zero failures.
- Final full `themTests`: 666 tests, zero failures, including 15 coverage tests.
- Signed direct typing and all inspector destinations: two tests, zero failures.
- Node 20 full backend: 2,787 passed, zero failed, two skipped (2,789 total).
- Parent-relative god-file gate: all five tracked files unchanged; diff check passes.
- Canonical macOS scaffold build: pass (unsigned compilation, not release signing).

Artifacts outside Git: `/Users/halfmutantfilms/io.them-worktrees/_proof/branch-audit-20260930/`,
`coverage-context-repro`, `coverage-context-focused`, `coverage-context-units-final`
and `coverage-context-ui` logs/xcresults; `coverage-context-backend.log`.
After the platform fix, `coverage-context-units-platform.log/.xcresult` again
passes 666/666; `coverage-context-macos-scaffold-final.log` records build success.
The initial macOS command used ordinary Debug, not Mac Scaffold Debug, and
failed signing. The canonical scaffold command then reproduced an inherited
Pages compile failure: `navigationBarTitleDisplayMode` is unavailable on macOS.
The modifier is now iOS-only; original #644 and tip #877 both contained it.
This preserves the iPhone behavior, Pages content and jump actions.

## Not covered

No physical microphone, production writer loop, live model, audible playback,
full V1 smoke, release signing or 120-page performance proof. UI checks use
existing DEBUG fixtures. Same-project completed reads intentionally may be
stale until refresh. This does not prove all character memory/project isolation.
HTTP identity changes during bootstrap and already-rendered manual playback
actions need separate targeted review/proof; this change guards publication.
The human-approved early index count is 33,626; the later stack establishes
exactly 33,603. Goal criteria 3/6/7 advance but are not complete.
