# T-1073 — Original native Files export, preserved and connected

## Outcome and source boundary

DECIDED implementation: preserve original #590, not another exporter. Read
its body, all five patches and original tests. Local no-ff merge
`915f0ee0f9c775254a519cc4c178b7a23ec99f77` has parents original
#919 `a6262b83cfc8cd10c6fcd8244ad9a258506af2dc` and original
#590 `fd239bd3b8a444f48b9c09df8ee9a5c744c88486`. Both are retained.
Only duplicate InspectorUX provenance-name fixes conflict: retain the current
parameter spelling and explicit Self dispatch. No original PR/base/head has
been changed by this local export integration.

Runtime checkpoint `b00d78d4e27668fe96dd7712c0c83f40ae6d11f4`, tracked tree
`2cb883db131ff2f5aab94a7706872bc71e218bf7`, retains original #590's
FileDocument, coordinator, exact backend artifact, native Cancel/retry/Save,
macOS save panel and truthful exact-clipboard handoff.

Two reconciliations are needed at this earlier boundary:

- The existing Document controls child owns the coordinator. Remove original
  #590's added god-view StateObject; carry the same coordinator through the
  existing actions, with no second exporter, queue or framework. Project
  changes invalidate the child's active request. Its presentation modifier
  retains the original identity/defaults/disappearance handling.
- A project-only closure does not distinguish an account transition while
  the same project stays selected. Capture the existing canonical Studio auth
  context and use its current policy, including authentication generation,
  through a weak model guard. Late preparation, picker completion and Docs
  callbacks cannot update a different auth/project context.

## Verification and actual user-visible behavior

All native checks select the erased task-owned375-point SE
`E8998A6B-35B1-49E3-896C-861550849927`, iOS26.2/23C54, signing enabled.
No human device is erased. No live model, real credentials or private env.

- Focused export support: **18/0/0**, native exit0, including original bytes,
  cancellation/retry/stale completion and three new real-model context cases.
  Tests advance the canonical authentication-intent generation, not only a
  mock boolean. `them-1073-export-focused/v1-ui-smoke-local-1-26718.xcresult`.
- Full signed units **692/0/0** plus exact chunked/uninterrupted typing,
  inline export choices and real-failure preservation UI **4/0/0**: total
  **696/0/0**, exit0. All four UI identifiers were extracted from the actual
  result tree. `them-1073-combined/v1-ui-smoke-local-1-28820.xcresult`.
- Initial authenticated writer/native Files/relaunch: **1/0/0**, exit0.
  `them-1073-native-writer/writer-loop-fd35c9d4-ef69-4090-8e23-df912b6b396c.xcresult`.
  Original stronger UI assertions executed actual Files Cancel, retry and Save
  against the actual local export endpoint. The backend requires user auth,
  uses disposable storage/dummy providers; typed writer text, not generation.
- Independently opened that actual exported Markdown in the simulator's
  Files Quick Look, outside THEM. Saved native image
  `/tmp/them-1073-opened-in-files.png`. The actual35 bytes equal the independently
  specified expected Markdown, SHA256
  `8f75a14db6241a0f691d1b4be585d501343108f4cef8659e5d26594281abe781`.
  This is observed simulator external-open proof, not a physical-phone claim.
- The bare V1 structural fixture had no authenticated backend and previously
  accepted a DEBUG-created artifact as export success. That shortcut remains
  removed. Replace its misleading test with a real closed-loopback connection
  failure: visible error, exact page retained, no picker or false Saved claim,
  and retry still available. Native success remains required in the existing
  integrated writer producer; no extra skip or assertionless pass is added.
- Final frozen-checkpoint authenticated native writer/Files/relaunch:
  **1/0/0**, producer exit0, retained
  `them-1073-final-writer/writer-loop-acbfb26b-2d26-4fae-9e59-8827979f49fc.xcresult`.
  Actual `writer-loop-5a2a250ef83a.md` was independently checked, copied into
  private proof and opened in Files Quick Look outside THEM.35 bytes, SHA256
  `fd8dd0eb0ca59fb158813780d21ac34ed307e8d26f08c5ade14ee2553e9a74aa`.
  Final native image `/tmp/them-1073-final-opened-in-files.png` is retained.
  macOS scaffold build finishes native exit0; existing warnings remain.
- D009 versus the refreshed actual #919a6262b83 ref passes: Studio17431 →
  17425 (-6); other four deltas0. Diff check passes. No padding or waived gate.
- No backend source changes versus #919a6262b83. Do not relabel its earlier
  Node20 backend2753/0/2 as a new full-suite run on this Swift integration.
  No fresh full V1, all export formats or live-provider proof is claimed.

Complete native bundles/logs, actual exported file, independent hash, both
external-open images, exact tracked runtime and separate main security receipt
are retained privately at
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1073-20261020.udQlMg/`.
This local proof checkpoint may be backed up as a scoped preparation branch,
not a replacement PR or a main-ready release. Original #590 stays unchanged.

## Main security receipt — separate attribution

VERIFIED #909 independently approved on exactd3b6027e by halfmutantpro-tech
(write permission). Fresh run39491129919 passed: backend2744/0/2; signed
units624/0/0; V1 UI28 passes/0 failures/9 skips (37 reported), integrated
writer, voice-fault and macOS build passed. Strict three-check protection,
one independent approval, stale dismissal and admin enforcement remained.

Normal protected merge `78b8c94f43b4a11f18c2e61df556b9cd7370e735` preserves
both main and original head. Its tree `6e6e1b1c38d2519346397a061c5e8b0c1aab0483`
equals the approved/tested tree. Fresh registry audit of that frozen lockfile
under Node20.20.2 reports0 known vulnerabilities; GitHub now reports0 open
Dependabot alerts (previously15). This is not a whole-app security certificate.
Render auto-deploy was rechecked Off immediately before merge. No production
setting, secret or deployment changed. Main push run39502261480 is pending.
Evidence: https://github.com/FramehouseStudios/them/pull/909#issuecomment-6302252617 .

## Remaining integration / adversarial limits

This local export branch still uses the earlier parent lockfile (Multer1.4.5,
fast-uri3.1.6, proxy-addr2.0.7). Do not promote it as hardened or deploy it.
Carry the newly merged security main through actual foundation #964 → #904 →
#919 before final landing. Original #590 remains at its original head/base;
do not silently retarget or replace it. Parent919 hosted native gate and
stopped security child973 still require their actual updated-head proof.

Answered locally: artifact byte preservation, Cancel/retry, duplicate request
ownership, stale auth/project callbacks, visible real connection failure and
an independently opened Markdown file. Partial: macOS interaction and native
FDX/PDF/Fountain extension behavior (only unit byte/type coverage so far).
Not covered: real microphone/provider, physical-phone export, shipping auth,
all provider/disappearance races or external iCloud-provider failure. Existing
Swift isolation/Sendable warnings and the production credential hold remain.
Goal stays active. No paid call, force/squash, replacement PR or deployment.
