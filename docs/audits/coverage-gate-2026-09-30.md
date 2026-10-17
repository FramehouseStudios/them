# Coverage integration repair — 2026-09-30

## Scope and goal

Additive repair on original #644 head `047672ac1f190c78c1861ff51c636865140c81b4`.
Moves goal criteria 3 (coverage evidence), 4 (connected controls), 6 (route-auth
proof), and 7 (provable stack). This does not establish full project isolation
or release readiness. #766 → #770 remain the first merges; independent review
is required. No original Claude branch or main was rewritten.

## Root fixes

VERIFIED: against actual parent #643, the original coverage feature grows
Studio by four lines and Root by five. Its original PR gate proof used main.
The complete Craft panel moved verbatim to the existing Craft views file
(only `private` access removed so the screen can call its extension).
All bindings, callbacks and the same view model are preserved.
Coverage notification observation and stop-before-speak delivery now live
with existing coverage presentation; the root's speech owner stays private.
Against #643: Studio 17,411 → 17,361 (−50), Root 15,033 → 15,033 (0).
Against #644: Studio −54, Root −5; other god files do not grow.

The first full backend run exposed a `fetch failed` in the block-signal-history
route fixture. The existing canonical `listenEphemeral` helper from Claude's
stack was brought forward byte-for-byte, not reimplemented, for that fixture.
Source commits: `ed670e0d` and large-body correction `b3849b9c` (as present at
#864 head `a2bb305a`). The original route assertions remain unchanged. This
does not replace the later stack's migrations of other test suites.

A new real-backend coverage test requires user auth and proves deterministic
reads use submitted synthetic pages rather than characters from an earlier
read. It uses isolated test identities and stores, not production credentials
or a paid model.

## Independent proof

VERIFIED, signed Xcode 26.3 on dedicated iPhone 17 Pro simulator
`E37CE808-0323-4F50-8E8E-212D7ABFA268`, erased before each iOS run:

- Focused coverage/Craft/actions/API/navigation: 71 executed, 0 failures.
- Full `themTests`: 657 executed, 0 failures.
- Signed typing + all six inspector destinations: 2 executed, 0 failures.
- Focused fixed HTTP fixture + coverage auth: 10 passed, 0 failures.
- Final Node 20 full backend: 2,787 passed, 0 failed, 2 skipped (2,789 tests).
- Canonical god-file gates against #643 and #644: pass.
- Verbatim Craft body and canonical HTTP-helper comparison: pass.
- `node --check` for new test/helper; `git diff --check`: pass.

Initial full backend: 2,785 passed, 1 failed (`block_signal_history_route`,
fetch failure), 2 skipped. This was not erased or waved away. The new auth
test's first isolated run also failed because its assertion assumed character
strings; the actual response returns cards. Assertion corrected to card names.

Artifacts remain outside Git under
`/Users/halfmutantfilms/io.them-worktrees/_proof/branch-audit-20260930/`:
`pr644-repair-focused.log/.xcresult`, `pr644-repair-units.log/.xcresult`,
`pr644-repair-ui.log/.xcresult`, `pr644-repair-backend.log` (initial failure),
`pr644-repair-backend-final.log`, `pr644-repair-backend-focused-final.log`,
`pr644-repair-coverage-auth.log` and `pr644-repair-coverage-auth-corrected.log`.

## Limits and next priority

No physical microphone, production backend, live model or audible coverage
playback was proved. UI checks use existing DEBUG fixtures. Full V1 smoke and
the recorded production writer loop remain separate outstanding goal gates.
Existing compiler warnings are not resolved here.

SOURCE REVIEW: #644 and #877 both allow an awaited coverage response to publish
without validating current account/project/draft/request identity. Project
selection does not clear the global coverage summary. A stale/foreign-project
read can therefore become the card, spoken read or next conversational summary.
This is not yet a runtime reproduction. Next task is an identity-bound coverage
guard with delayed/out-of-order completion tests; preserve #646 refresh policy
and #774 quiet announcements. Do not claim project grounding complete.

The early-stack index remains 33,626 lines per explicit human approval; the
existing later stack establishes the required exact 33,603 invariant.
