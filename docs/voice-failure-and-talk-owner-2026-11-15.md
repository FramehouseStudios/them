# Voice failure and talk-owner boundary — 2026-11-15

## Verified problem and smallest connected fix

The physical phone's recorded STT transport failure was converted into HTTP200 fallback audio with `error_recovered`. Root treated that result as ordinary success: cleared its issue, briefly described a recovered hiccup, continued the success/page/history path and resumed listening. Fallback speech does not establish a generated story, screenplay insertion or acknowledged save.

The scoped client now recognizes that response before normal success processing. It stops capture/audio, disables the conversation loop, marks the pending synchronized turn failed, restores an early preview if one exists and keeps truthful retry guidance in the existing Home/Studio status surfaces. The fallback apology is deliberately not played as a successful story reply. No draft replacement, annotation, conversation-memory/evolution success or save acknowledgment is initiated by this failed result. Existing committed text is retained; marking a turn failed is not a claim that every pre-existing insertion is cancelled or that every failed recording is durably recoverable. Guidance never claims unchanged/saved pages and does not echo unknown provider/private stage text.

Root's three network-to-MainActor content callbacks now recheck invocation UUID plus stable account owner at actor delivery. Ordinary replies retain their existing processing. The first-voice Page intent retained in parent #1000 is not acknowledged by a failed result.

A separate verified transport gap could admit an old story under a later account: `talk` previously chose its user after health awaited, and `talkText` could pair its earlier user with a later bearer after token resolution. The canonical client now captures the existing user+session-intent owner before the first suspension and accepts Root's already-admitted owner. Header construction, bootstrap, recursive retries/fallbacks, response processing, optional metadata and queued content deliveries retain that authority. Supersession/cancellation cannot turn into an empty-token fallback or offline enqueue. Valid same-owner token rotation is allowed.

Independent review caught and corrected a candidate regression before native execution: the identity DTO's shared client token has no backend-origin metadata. `/talk` and turn metadata therefore preserve the canonical backend-resolved client token, omitting its header when the resolver intentionally returns empty; only user and bearer come from the validated fresh identity. The regression checks both empty and distinct target-token cases on both routes.

Recovered-response headers suppress early metadata/text/audio callbacks before Root receives the final failed result. The actual intercepted HTTP200/WAV STT case verifies failure fields, retry guidance, no fabricated transcript/reply/page/commit and zero early content callbacks. Constructor-only identity/token test seams retain canonical production defaults; injected transport is honored rather than escaping to shared network. No parallel auth/store/framework was added. Multipart assembly, idempotency normalization, silent upload and retry limits remain unchanged.

## History and ownership

Parent is original #1001 at `0ba2e612501ffc3cb277b0586727d766684654f1`. Root fix `b09e7ce2`; Zora transport `c30748f7` plus normal token-origin correction `5a91ad1a`; preserving merge followed by admitted-owner connection `8c740ec0` and decoded-policy assertion `033282c8`. No original PR replacement, squash, force push, main merge or production change.

Jarvis owned Root implementation/integration/native execution. Zora implemented only BackendClient and its actual API regression file in an isolated worktree. Einstein read the phone metadata and independently reviewed the failure branch and final token-origin correction, with no runtime/provider actions. These are Codex engineering roles, not independent human approvals. Luna/Howard/Alfred were idle for this bounded pass.

## Fresh local proof and limits

All native producers used normal signing, explicit Xcode26.3/17C529 and erased task-owned iOS26.2 simulator81F. Exact case identities and frozen source manifests were verified, not count-only summaries.

| Source | Check | Pass / fail / skip |
| --- | --- | --- |
| `b09e7ce2` | Five new recovery policy cases plus existing task/design cases | 14 / 0 / 0 |
| `033282c8` | Fifteen actual talk API cases plus existing page-cancel3/auth-rotation2 | 20 / 0 / 0 |
| `033282c8` | Existing onboarding and controlled realtime network-fault UI | 2 / 0 / 0 |
| `033282c8` | macOS scaffold compile | exit0; no runtime/install claim |

The API cases exercise pre-health and bootstrap account changes, same-owner refresh, wrong backend-token prevention, response/queued-callback supersession, unchanged multipart/idempotency retries, optional metadata and recovered-response decoding. All transport uses unique intercepted test hosts and fictional credentials; no paid provider call or live microphone test ran. The two existing UI cases are deterministic regressions, not an observation of this exact failed-turn UI or the real phone. A command's approval description mistakenly said24 API cases; the immutable actual identity list/result is20. No unchanged full unit/backend/recovery/writer suites were repeated locally; full final-head hosted integration proof is still required.

No native producer failed in this pass. One static setup attempt found an absent remote-tracking ref under the existing scoped-fetch policy, before the D009 gate ran. It was corrected using a task-only exact-base ref, removed afterward. Canonical D009 and full diff check pass: Root15081→15080 (−1), index33626, Studio17416, LiveBridge12915 and BackendMemoryAPI10782 unchanged. Backend, dependency, workflow, save machinery and design bytes equal the parent. The early-fix33626 allowance remains; this does not establish the later33603 stack boundary.

Parent #1001 independently has fresh hosted Node20.20.2 backend2783/0/2 and D009 success; its unit job also completed successfully, while the remaining Quality workflow is still running at this record. Do not attribute those parent results to this final successor or call all checks green. Parent #1000's required run43733325767 is green, with signed units745/0/0 and V1 33/0/9; its nine UI and two backend skips remain skips.

## What the phone evidence actually establishes

PHY017 request47150de1d1f12d7f: STT fetch threw TypeError before headers after21324ms; recovery TTS then returned200, and talk completed after36591ms as error_recovered/stt/provider_unavailable. Configured STT timeout30s does not prove this was a timeout; there is no HTTP key/quota rejection in that event. Retained metadata omitted the transport cause, so DNS/TLS/socket attribution is unverified. Increasing the deadline or changing a key would be speculation.

PHY018 request565ffb42508c6b60 was a different, earlier prematurely closed request after22680ms with no correlated provider event. The server's logged500/aborted flag does not establish a500 received by the phone or a causal link to PHY017.

Open next steps: preserve an allowlisted transport-cause code through the existing diagnostic owner and capture one freshly authorized phone attempt. Separately, the STT supplier reads its response body after fetchWithTimeout's header timer ends; body-stall deadline coverage is a source finding, not this pre-header failure's demonstrated cause. Do not conflate or silently claim either network issue fixed by the client recovery guard.

Broader realtime connection-admission and inner stream/playback/capture ownership, typed correction waits, unsubmitted-form force-kill durability and failed-recording manual recovery remain outside this bounded fix. The physical phone still has38fe; none of these client fixes is installed. The live relevant-reply → formatted page → precise rewrite → acknowledged save → offline/relaunch → external export journey remains unproven. Development backend stopped/state preserved; production held under the human's App Store-credentials decision. No live model call without fresh human authorization.

Next: fix the first exact-head hosted failure if one appears; otherwise finish the safe STT cause/deadline investigation, then install and observe the updated phone build after the necessary checks and fresh human session authorization. READY FOR CONTINUE.

## Hosted compiler follow-up

VERIFIED first red: original #1002@885 run43743286908 Quality job132900946723 failed compiling the new WAV fixture's chained Data expression before any tests executed. Backend/D009 passed; later writer/V1/recovery/voice/Mac steps were skipped. The local26.3 result was valid for its compiler and did not establish hosted compile success.

Normal descendant7c91cbab splits only that fixture expression into append operations. Every production byte, test identity, assertion and generated audio byte is preserved. Standalone old/new execution proved identical4140-byte WAV data; fresh signed affected API cases15/0/0 on erased owned81F, source1463inputs unchanged. No unchanged broad local suite/UI/Mac/backend rerun. Fresh hosted checks remain mandatory; no compiler-budget increase, skip, allowlist change or test removal. Preserve the original failed job as evidence. This correction must also be preserve-merged into dependent #1003 before its next gate.
