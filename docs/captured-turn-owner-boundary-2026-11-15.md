# Captured turn owner and voice-task lifetime — 2026-11-15

## Scope and outcome

VERIFIED: local descendant of original #1000 (`8729d3b04fce3557678fffe3e2dde51201f8d015`), branch `codex/T-1482-captured-turn-owner`. Preserves every original commit and the two Zora contributions through non-squash merges. No backend JavaScript, dependency lock, production configuration, orb or visual design changes. This is a scoped rehearsal successor, not integrated-main or physical-phone proof.

## Root causes and connected fix

A turn admitted under one account could wait for bootstrap or deferred work, then build headers or apply history/evolution/sync results under a different account. Epoch/token equality cannot identify that change: an ordinary successful refresh rotates them. The canonical authority is the existing authenticated user plus session-intent generation.

- Extract the request identity DTO and existing always-enqueued main notification helper into single owners. Atomic snapshots carry the existing stable owner; authenticated stored identity avoids an unnecessary Keychain read. Anonymous/legacy fallback still uses the existing fallback and may access Keychain.
- Commit/annotation validate the captured owner before/after bootstrap, build headers from the validated snapshot, reject stale responses before local/cache/sync effects, and recheck delayed main-queue notification delivery. Existing payload/idempotency/error behavior and no automatic write retry are retained.
- Evolution captures owner before its Task, uses the canonical injected session and authenticated PATCH request, and retains the exact existing body and eight-second timeout. Its default automatic-sync policy is unchanged.
- Root passes immutable owners at typed, first-page, voice-result, annotation and fallback scheduling boundaries, checks after awaits, and prevents stale result/error application. Typed scope keeps its original invocation/UI-generation cleanup while adding canonical owner validation.
- A cancelled or completed voice predecessor could otherwise clear a newer task slot or strand the busy state. The invocation-owned voice scope releases only its UUID, invalidates before cancellation, skips invalid queued work, and reserves DEBUG direct calls only when idle. Root's two creation sites, thirteen cancellation sites, normal cleanup and four outer error catches use that authority. Canonical cancellation clears its lifecycle callback synchronously; it does not clear active typed busy state. Early owner rejection stops the loop and offers a visible retry instead of silently resuming the microphone.
- Move the existing realtime-result constructor, dialogue-anchor metadata/lookup and richer-transcript selection into bounded helpers. Exact constructor/lookup/body equivalence was checked; the old paths were removed. No second auth/store/transport architecture was introduced.

## Proof and honest source attribution

All native runs used normal signing, Xcode 26.3/17C529 and an erased task-owned iOS 26.2 simulator `81F0FF38-9DAD-4011-907B-357DFADD094C`. Source inputs were hash-fenced before and after each producer. Local server fixtures used Node 24.19.0, not Node 20.

| Source | Producer | Pass / fail / skip |
| --- | --- | --- |
| `f6f0b79b` | Full signed unit bundle, exact identities | 761 / 0 / 0 |
| Working source later committed as `7a27d4e5` | Focused account/owner/notification/evolution/typed/credential/design cases | 114 / 0 / 0 |
| `7a27d4e5` | Ordinary offline recovery plus stale-conflict recovery | 2 / 0 / 0 |
| `7a27d4e5` | Canonical create/save/export/restore writer workflow | 1 / 0 / 0 |
| `7a27d4e5` | Existing onboarding and controlled voice-network-fault UI | 2 / 0 / 0 |
| `7a27d4e5` | macOS scaffold compile | exit 0; no runtime claim |
| `da5c3364` | Six actual Task/continuation slot cases plus typed/design cases | 14 / 0 / 0 |
| `ae5e51d2` | Existing onboarding and controlled voice-network-fault UI after final Root callback guards | 2 / 0 / 0 |
| `ae5e51d2` | macOS scaffold compile | exit 0; no runtime claim |

The focused producer captured HEAD `f6` while running the reviewed working tree; stored source equivalence establishes the later `7a` attribution. The full 761-case result is NOT attributed to final `ae5`; final-head full-unit and broader integration gates remain required in hosted CI. No unchanged full backend rerun locally: backend source/lock are unchanged. Parent #1000 at `8729` separately has fresh hosted Node 20.20.2 backend **2783 / 0 / 2** and D009 success; its Quality Gate was still running during this record. The backend skips remain skips.

The recovery fixture used real local login/Keychain and observed login200 → save401 → refresh200 → replay201, then exact restoration/conflict assertions. Five aggregate version201s include seed/conflict setup. The writer fixture used an authenticated server with the existing UI-test session and mocked generation; its one201 save proves that deterministic path, not microphone/provider quality or real sign-in. The fifteen owner API cases use actual methods with intercepted transport, including stale bootstrap/response/notification/evolution paths and valid same-owner refresh; controlled failed bootstrap avoids global credentials. None proves a live successful provider request.

Known external Node attempts were zero under the private fixture guard. This is not OS-wide network instrumentation. All 3,303 dependency entries and fixture controls remained unchanged, task backend ownership was checked, and the created module copy was returned intact. Final ports 3000 and 31337 had no listener. No real environment/key was read and no paid model call ran.

D009 versus exact `8729`: Root **15095 → 15081 (−14)**; BackendMemoryAPI **10785 → 10782 (−3)**; index.js **33626**, Studio **17416** and LiveBridge **12915** unchanged. The human's early-fix 33626 exception remains; this PR does not pretend the later 33603 stack rule has been established. Final diff check found one extra EOF blank line in the extracted notification helper; removing only that newline plus documentation does not change executable semantics or justify repeating native suites.

## Failures retained and corrected

- Private unit driver had a syntax error before native execution: zero tests, driver corrected and original retained.
- Intermediate extraction left a duplicate MainActor annotation: compile exit65, zero tests executed. Removed the duplicate and restored the moved record's explicit actor annotation; the reviewed source then passed114 focused cases.
- A cleanup proposal was stopped by exact-source assertions before mutation because existing typed cleanup already had the needed invocation/UI-generation condition; no duplicate cleanup mechanism retained.
- The final EOF whitespace failure is recorded above. None of these failures was hidden by a retry of unchanged application code.

## Coordination and boundaries

Jarvis owned production integration, native producers and publication. Zora implemented the actual API regression file and invocation-scope model/cases on isolated local branches. Einstein's read-only adversarial review identified the pre-await, notification, Keychain and voice cleanup gaps and confirmed the final cancellation/continueListening guards at `ae5`. Agents did not make human approvals or run paid calls. Luna, Howard and Alfred were idle for this bounded pass (Howard's earlier design-token mapping remains separate prior work).

PARTIALLY ADDRESSED / NOT COVERED: realtime transport owner admission is still captured at callback arrival, not connection admission; broader renderer/stream/playback/capture continuations are not all owner-fenced. Audio callbacks intentionally were not blindly tied to a completed HTTP task because legitimate playback can outlive it. Exact forced Root callback interleavings, canonical BackendClient talk suspension ownership, inner typed correction waits and unsubmitted form force-kill durability remain next bounded investigations.

Phone still runs `38fe14d2`; none of this successor is installed. The human's Nov14 live attempt did not prove a relevant reply/page/save. The development backend is stopped; paid testing is deferred and needs fresh authorization. Render health200 is not a production-readiness claim; api.them.io still redirected to parking at the Nov15 check. Production is held. Original #979 still requires genuine current-head non-author review and a fresh authenticated Render Auto-DeployOff check before backend merging; no repeated review request or protection change here.

Next: inspect the first fresh hosted failure, if any; otherwise fence the next canonical talk/stream admission boundary before scheduling another authorized physical-phone session. Preserve original PR bases/history and all unrelated work. READY FOR CONTINUE.
