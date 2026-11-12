# Protect the latest pre-sign-in setup — 2026-11-12

**VERIFIED:** source fixd0fdb9cd, preserved by root merge4ee78d63; observer1c972214. This fixes the bounded anonymous-input handoff. It does not certify THEM, every post-auth edit, integrated main or a physical phone.

## Root causes and resulting behavior

Login reservation advances authentication intent before credentials change. The previous recovery model treated that as loss of capture ownership, cleared its recorded fields and revoked its verified local-file lease. Replacement B could remain visible but never reach storage. If an earlier A checkpoint was still running when credentials actually changed, the old completion was rejected before pending B could drain. A sign-in/sign-out ABA with unchanged credential-free flag could instead retain the old lease because the model did not track the canonical session epoch.

The existing model now distinguishes same-epoch anonymous reservation from a real credential/session boundary. Reservation invalidates exact Recovery challenges while retaining the owned capture. A single drain owns an in-flight write and one immutable latest candidate, recorded synchronously while anonymous admission is valid. A real boundary seals that owner; only already-recorded snapshots can finish. Only that owner's verified CAS receipt advances its successor descriptor. Occupied, uncertain or oversized results stop without adopting another copy or silently retrying. A late sealed receipt cannot give the new UI epoch a lease or current Saved state.

Known-account edits are excluded from this device-only domain. Captions distinguish earlier sealing/protected/uncertain copies from current unsaved signed-in edits. The UI brackets canonical session/deletion/intent reads with the existing session epoch, failing closed if it changes; it does not hold an auth lock across the entire UI edit. No new persistence store/schema, account attachment, backend mutation, Root state or framework was added.

## Direct proof

Exact owned simulator81F0FF38-9DAD-4011-907B-357DFADD094C, iPhone17 Pro/iOS26.2, Xcode26.3. Each native proof erased this device and retained normal signing. No unsigned test invocation.

| Check | Actual result | Limit |
| --- | --- | --- |
| Real-model/filesystem causal baseline6d4ba7be | 10 passed / 4 failed / 0 skipped | Compatible epoch input/tests only; capture behavior unchanged |
| Same original14 bodies plus capacity negative | 15 / 0 / 0 | Signed native result at4ee78d63; unchanged bodies verified by exact insertion-only diff |
| Actual local held-login UI at1c972214 | 1 / 0 / 0 | Real local email auth/session transport, synthetic account; no Apple/live speech/model proof |
| Post-termination storage observer | exact fixture B verified | Both raw UTF8 fields/edited markers in normalized current.json, no pending file |
| Independent account hydration | consumed | Named201 and separate cue reached app; stored account name deferred while B stays visible |
| Write/provider observers | 0 unexpected mutations; 0 outbound attempts | One held/released login, no automatic screenplay/voice action |
| macOS scaffold | build exit0, no compiler errors | Canonical cached ad-hoc Debug scaffold; compile only |
| D009 / diff | pass, five zero deltas vs actual published73ed8393 | Genuine tracking ref fetched; no monitored god file grew |

The four causal failures were assertions: reservation retained A instead of B, auth behind held A lost pending B, form-release drain lost B, and session ABA retained old field/lease authority. No crash was substituted for a product failure. Negative cases keep known-account C out of the copy, reject another window's occupied descriptor, preserve uncertain pending evidence and retain A when frozen B exceeds capacity. Earlier-case release also proves the immutable drain outlives its original form.

The UI observer reads only the erased app's unique synthetic `UITestOnboardingInput` namespace after native termination. It retains booleans/metadata, not raw fields. The native UI case body is unchanged. It does not prove an authenticated user can unlock that copy or that automatic recovery is allowed. Signed-out/device-auth/exact-descriptor Resume is still required; no auto-fill or account import was introduced.

Current focused proof replaces the four failures; the earlier complete1603/0/0 predates this model change. No new complete unit suite or backend suite is claimed. Core backend lib/index/dependencies/tests remain unchanged from the earlier Node20.20.2 3121/0/5 component evidence; eval/controller files changed, so whole-backend-tree identity is not claimed. Four backend skips require PostgreSQL configuration; one is the preview-header case. Wider integrated-main gates remain required.

## Exact files and preserved history

- `them/OnboardingInputRecoveryScope.swift`: compatible epoch input, owned sealed drain, admission/caption wiring.
- `themTests/OnboardingInputRecoveryModelTests.swift`: six tests-first real-filesystem cases and one additive capacity negative; original bodies remain intact.
- `backend/evals/run_onboarding_hydration_owner_ui_smoke.mjs`: checks the known fixture's exact persisted B after app termination, alongside existing real-HTTP/independent-hydration counters.
- This document and TASKS: proof/status only. Unrelated untracked node_modules cache remains excluded.

Original characterizationd5d9d019, fixd0fdb9cd and prior source histories remain ancestors; no squash/replacement/history rewrite. Zora implemented the bounded model change; Jarvis reviewed and executed native proof. Einstein independently checked the epoch/CAS boundaries and identified the remaining capacity edge below. These are actual agent participants, not human reviews.

## Adversarial limits and next fix

Answered locally: anonymous login reservation, held-write auth transition, stale receipt UI isolation, known-account exclusion, exact byte/descriptor preservation, session ABA, form lifetime, occupied/uncertain/oversized stop paths. The actual HTTP/UI run additionally verifies B in storage after termination while other account metadata hydrates.

Remaining source-traced edge: an oversized A may return before I/O while a distinct smaller B is queued. The current conservative stop discards that pending B and leaves a size warning; B stays on screen and needs a later explicit edit. A separate bounded follow-up is being prepared. It must let only the pre-I/O-safe distinct candidate continue under the unchanged expected descriptor, without retries or uncertain/occupied adoption. This is not represented as already repaired.

Not guaranteed: storage before a checkpoint completes, arbitrary I/O failure/corruption/capacity excess, current signed-in edits in this anonymous domain, actual device-auth unlock/restore, physical iPhone, live microphone/model/rewrite, intended shipping backend or integrated-main readiness. The goal remains active. Production hold and the no-further-paid-calls requirement remain unchanged.

## GitHub and local evidence

Current main remains78b8c94f. Original997 f68eb60f has all three hosted jobs green (backend3042/0/5; units1566executed/0fail; V140/0/36; writer/recovery/voice/Mac steps passed). Original964 was normally advanced to831de836 for failure-only diagnostics; run43260656345 is fresh and still pending at the last observation. Independent human review is deferred; original979 stays held. The earlier987 To Page red and missing1267 original landing path are not erased by these greens. No main merge, deployment, review/protection bypass or paid model call occurred.

Permanent causal/green bundles, source hashes and metadata: `/Users/halfmutantfilms/io.them-worktrees/_proof/T-1433-onboarding-capture-handoff-20261112/`. Related hydration and CI evidence: [previous checkpoint](onboarding-name-hydration-proof-2026-11-12.md). Human phone prerequisites: [device preparation](physical-iphone-preparation-2026-11-12.md).
