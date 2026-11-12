# Save-drain and conflict/relaunch checkpoint — 2026-11-11

Source under test: `bd948566`, `codex/T-1365-save-completion-integration`. These are local signed iOS simulator results, not integrated-main or physical-phone proof. The intended shipping backend has not been verified.

## Save-drain handoff

The earlier T1202 reproduction (`docs/required-writer-save-handoff-2026-10-28.md`) recorded six passing and two failing focused cases before the fix: a manual save arriving during a background drain occupied the pending slot, but the drain released its flight without dispatching that slot. The fix passes the captured request to the canonical dispatcher, with owner/project/origin/base fences and failure retention. The original reproduction used a deterministic held HTTP fixture, not a live provider.

On `bd948566`, signed iOS 26.2 simulator, five focused cases passed in `ScreenplaySaveCompletionOwnershipTests`: manual behind drain dispatched exactly once; another project's captured base remains intact; explicit base remains intact; conflict retains both copies; offline retains both copies. These cases use the deterministic `SaveCompletionPeer` HTTP fixture. Full class: 51/0/0; `/private/tmp/them-t1365-class.log`. The complete signed unit bundle passed 1503/0/0 in `/private/tmp/them-t1365-all-units.log`.

Relevant source: `them/ScreenplayStudioViewModel.swift`, `them/ScreenplayDraftSaveOutbox.swift`, `themTests/ScreenplaySaveCompletionOwnershipTests.swift`. No production code changed in this checkpoint.

## Conflict and relaunch

On `bd948566`, `test_screenplay_save_outbox_restores_conflict_choice_and_resolves_once` passed 1/0/0 on an erased task-owned iOS 26.2 simulator, with signing on and an authenticated isolated localhost backend. It queues a local save, creates a stale server version, relaunches, checks conflict choice and explicit resolution. Log: `/private/tmp/them-t1365-conflict-relaunch.log`; result bundle: `/tmp/them-t1365-build/Logs/Test/Test-them-2026.11.11_18-03-06--0800.xcresult`. No paid model calls.

This does not prove every conflict. A previously submitted custody save with an uncertain delivery can still remain in a stale-conflict retry loop; a generic 409 does not certify non-delivery. The separate recovery-copy action preserves held text and was proved locally against a dropped acknowledgement, but does not settle the original request or copy character/project context. Old clients that ignore the outbox lease and lock-file replacement during an already-sent request remain unproven.

## Integration state

On 2026-11-11 GitHub reported original #964 open on main, head `5faa43d6c087813be926246be14f3425ad651880`, with God-file gate, Backend tests and Quality Gate successful and `REVIEW_REQUIRED`. No merge or protection bypass. Physical microphone, live Clementine response, intended-backend sign-in and the full real-phone journey remain unproven.
