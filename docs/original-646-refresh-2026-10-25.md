# T-1157 — Quiet coverage refresh and retained writer authority

## 1. Completed

VERIFIED local runtime `a70197930366d486f31a27ed3ca27be2bfa20eb3`.
Worktree `/Users/halfmutantfilms/io.them-worktrees/codex-original-646-refresh`,
branch `codex/T-1157-original-646-refresh`, parent saved mentore803262a.
Original64672f9375e preserved by no-ff mergee4ec30a. Read its full current
body/comment, original774a001ec04 body and existing5f71ec5c correction.
Replayed the remaining correction as71a7b32; prior freshness-only work stays.
No broad backup merge, replacement PR or original-head/history rewrite.

Coverage now follows settled page/scene shape quietly through the existing
debounce. No read while streaming/inflight, empty/title-only or unowned; no
request-per-word failure retry. One automatic attempt for the last attempted
shape and owner; explicit Read again is the retry. Body/newline normalization
uses the canonical Fountain source. Earlier same-project notes remain clearly
labeled and cannot masquerade as current conversation context. Automatic
refresh neither speaks nor appends the grade to the global status strip.

## 2. Exact files changed

```text
TASKS.md
backend/evals/run_home_voice_handoff_ui_smoke.mjs
docs/original-646-refresh-2026-10-25.md
them/ScreenplayCoverage.swift
them/ScreenplayStudioViewModel.swift
themTests/ScreenplayCoverageTests.swift
themTests/ScreenplayStudioDraftRecoveryTests.swift
themUITests/V1SmokeUITests.swift
```

## 3. Newly reproduced root defect and correction

Inspecting the touched debounce revealed it still accepted a captured obsolete
draft, changed global dirty authority and could persist/clear recovery after
awaiting layout/revision. Existing636ddfc4 already owns the minimal correction;
read its exact diff and original T1076 evidence rather than invent another owner.

Direct current real-VM reproduction **0 pass /1 fail /0 skip**, signed erased,
normal signing: make a real manual edit with exact decomposed-Unicode/trailing
bytes and a durable recovery copy, then deliver an older blank observation.
Retained legacy issues identify **two failed assertions** in that one case:
hasUnsavedDraftChanges becomes false and the durable recovery copy disappears.
On-screen text itself remains in this case; no full remote overwrite or new
queued-entry corruption is claimed. Initial full756 did not include this new
regression and is not proof this bug was absent.

Reuse636ddfc4 guards in the canonical observer: capture project/auth context,
require current UTF8 bytes and noncancelled/nonhydrating state at entry, and
revalidate after both layout waits. Keep the new coverage scheduling after
validation. No new queue, store, state, retry/timeout or framework. Existing
method visibility is internal for direct regression, not a fake policy seam.
Adapt tests to this earlier boundary's existing injected recovery store rather
than import a later queue-injection API. A second test rejects Unicode-equivalent
but byte-distinct stale text. The prior same-version-modal fix remains intact.

After-a-wait account/project switches are fenced in code; this turn's direct
red/green tests exercise stale-entry/Unicode recovery, not newly fault-injected
HTTP suspension or durable outbox transport. Do not overstate that boundary.

## 4. Verification and exact limits

- Initial full signed erased **756/0/0** at71a7b32.
- Failing-first actual observer **0/1/0** (two assertions), retained patch/log/
  bundle and legacy locations. Final full signed erased **758/0/0** ata701979,
  owned91693AF0-AE2C-4FAD-9F4C-EC4C92AA382A, iPhone17Pro/iOS26.2/23C54,
  Xcode26.3. No unsigned test, hidden skip or relaxed timeout/assertion.
- Current canonical authenticated local UI **1/0/0** using the newly allowlisted
  freshness case: real app-created project, UI-entered page, acknowledged save,
  real deterministic read matched with independent authenticated coverage HTTP,
  actual same-page edit→earlier label/Hear earlier read→Read again→current label.
  This exercises the real debounce alongside the inspector; it is not a new
  export/relaunch/whole writer journey. Unit tests count injected requests on
  the real VM for quiet success, failed attempts, explicit retry, changed shape/
  owner, streaming/inflight/empty/unowned suppression. No current production
  network-load benchmark or per-shape HTTP-count metric is invented.
- Actual screenshot inspected: ordinary readable multiline method/freshness
  labels on iPhone17Pro, no recovery overlay. SE/Dynamic Type not rerun; legacy
  io.them tab wording remains at this historical boundary. No layout overhaul.
- UI provider counters **ASR0/chat1/TTS0**, all synthetic/intercepted, not live
  model output, actual microphone, audible speech or measured product latency.
  The deterministic coverage route itself makes no paid model call. No new
  external-attempt counter or current physical-phone claim.
- macOS scaffold **BUILD SUCCEEDED**, canonical build-only policy, not a signed
  macOS journey. Existing actor/Sendable/Swift6 warnings remain, not suppressed.
- D009 vs freshly fetched published mentor backupe803262a: all deltas0;
  index33557, Studio17352, Root14992, bridge12926, Memory10845. Diff passes.
- Production backend is byte-identical to parent T1156's **Node20.20.2 host
  2867/0/2** source; that is **parent evidence**, not a newly run full suite.
  `backend-production-unchanged.diff` excludes only the one-line canonical UI
  runner allowlist addition. That runner passed node syntax and was executed
  for the current strict1/0/0 UI. No unchanged full Node or mentor golden rerun.
  Parent skips remain real PostgreSQL prefix query without DATABASE_URL and
  existing talk-preview case. Parent offline exemplar gate is not live quality.

All local native handles terminal before documentation. Temporary producer
`/private/tmp/them-1157.ivO4hS`; explicit completed archive
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1157-20261025.Yjdll4/`.
Retain initial/full/red/final/UI bundles, exact patch, legacy assertion locations,
real counts, screenshot and macOS/hosted logs. No private env/store copied.
Remove only the task dependency symlink, not its parent641 target.

## 5. GitHub and release safety

Original643cdd463f5 is terminal required-green, run40243698383. Audited hosted
Node20 backend2853/0/2; signed units722/0/0; strict integrated writer contract
pass; V1 **29/0/15** (44 total, not44 passes); voice-fault1/0/0; Macbuild.
Original644 then normally advanced047672ac→42d6f746, preserving all original
commits/base/draft. Fresh run40248016339: Backend/D009/Docker green, Quality
still running at checkpoint. Never substitute this local758 for its hosted gate.

The new observer guard is only in the current646 candidate, **not** published
64442d6f746 or6458a7f367a. Those intermediate prefixes are not declared
releasable. Record that explicitly on644; no release/main merge until required
data-safety work is integrated and proven. Original645/646 public heads stay
unchanged until their actual parents clear fresh required checks in order.
Save this scoped branch normally; do not jump it onto an earlier original.

No main push/merge, force, squash, replacement PR, deletion, deployment,
secret change, paid provider call, impersonated review or protection bypass.
638 personal non-author review and production credential hold remain human
gates. Local safe implementation remains available; goal is not blocked/done.

## 6. Next active task

Actual next child647848e59d0 (`claude/project-auto-title`) is based on646.
Current full body and both follow-ups read: preserve original647 and reuse
d2dc719 title-codec correction, then prioritize the already reproduced raw
version/promotion loss repair2c401de and its T1104 evidence. Existing happy
marker UI does not prove CRLF/trailing/decomposed bytes across server storage.
Do not claim this758 local recovery guard fixes backend version normalization.
Raw save/replay/read/promotion/relaunch and later delayed-creation/account
authority T1105 remain required before original648 reply/action integration.

Original774's empty-dialogue move/logline cleanup is not imported here, only
the quiet dependency; preserve its remaining original work at its boundary.
Preserve orb/Clementine/aesthetic, flexible120 target and writer-chosen title.
Physical microphone/reply/precise rewrite/offline/cross-device/external export
on the intended shipping backend remain unproven. THEM is not complete.

## 7. Continue status

**READY FOR CONTINUE.** Save scoped proof and continue current original647
data-safety work while exact public parent checks and personal reviews proceed.
