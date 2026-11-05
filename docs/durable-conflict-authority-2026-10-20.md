# T-1072 — Durable writer words and unresolved conflict authority

## Boundary and reproduced failures

Original #919 remains open on `codex/T-editor-stale-echo-recovery`, based on
original #904. Its published head `bd470578994a22ca06ae4f57e94614c6cacf829c`
failed hosted run39484555186: signed units664/0/0, V1 UI32/0/9, then recovery
1 pass / 1 failure / 0 skips. The native failure shows a conflict warning but
no writer marker, conflict choice or queued copy. Retain this red; the older
local green does not supersede it. Security child #973 is stopped, not pushed.

VERIFIED: the older conflict handler removed submitted saves from the outbox
and persisted mutable editor text, which could already be server text.
An active-retry restore guard therefore cannot recover parked conflicts.
Original #925 already implements the coherent durable-conflict capability.
Read its body, all five patches and original tests before provenance-porting
`9cc7de0eefe1ed6cfa45b172bc1db7931d03c13b` with `cherry-pick -x`.

Before port, commit `6b25553d0f188b0d06b372cf3f84616f25a97722` adds the actual
model parked-hydration regression adapted from original #928, without runtime
changes. Signed erased-SE result: **0/1/0**, native exit65. The page contains
collaborator text rather than the submitted writer bytes.

## Implementation and provenance

Port `537fc3f2403ad5c6bd9458a8864f10eee07a7513` preserves #925's immutable
submitted copies, parked/no-auto-replay semantics, newer ordinary recovery,
acknowledged Keep Mine retirement, explicit guarded Load Server, transactional
queue rollback and all14 added behavioral tests. It retains this earlier
boundary's Bool hydration stop for unreadable queues and both auth/project
fences. A proposed duplicate-guard removal was rejected by safety review;
no part of that rejected patch was applied. Both guards remain.

The first port passed signed units679 + exact typing/chooser UI3 =682/0/0,
Node20.20.2 backend2753/0/2, and stronger original #925 authenticated native
recovery2/0/0, including unresolved-conflict relaunch and one-version Keep Mine.
These results belong to that port, not the later corrected runtime below.

Further adversarial verification found a distinct metadata-authority gap.
Tests in `2ba41da45d7a43e7193ed5d81df31e3ff93fd542`, adapted from original
#962, fail **0/2/0** on the real model: a newer ordinary recovery record can
already name the server version; an ordinary detail refresh can clear an
existing conflict. Neither metadata update is the writer resolving it.

Fix `b141af839d42ae85b524c40ecbb65cb5869211ca` reuses the same outbox and
canonical current-version selector. For a parked unresolved copy, reconstruct
the original base from its immutable journal, preserve newer raw editor words,
and do not run legacy metadata-based hydration over the unresolved choice.
Exact current-server matches still take the existing acknowledgement path;
explicit Load Server remains connected. Every actor await is auth/project
fenced; unreadable does not become empty. Focused signed recovery: **30/0/0**.
No parallel queue, transport framework or replacement PR.

## Final combined proof

Runtime commit `b141af839d42ae85b524c40ecbb65cb5869211ca`, tracked tree
`5cf8b235b6a8ba986f43951cbd4ce07acd995353`. All local iOS runs use the erased,
task-owned375-point SE `E8998A6B-35B1-49E3-896C-861550849927`, iOS26.2/23C54,
with signing enabled. No human simulator/device is erased.

- Signed full unit bundle **681/0/0**, plus both exact direct/uninterrupted
  typing UI cases and inline export chooser **3/0/0**: total **684/0/0**,
  native exit0. Actual cohort identifiers verified from the result tree.
  `them-1072-final-units/v1-ui-smoke-local-1-22909.xcresult`.
- Node20.20.2 full backend from a frozen tracked archive, network disabled:
  **2753/0/2**, native exit0,104818.439799ms. Skips: real Postgres without
  DATABASE_URL; conditional talk page-write preview/sync HTTP test. No secret
  environment was copied or provider credit used.
- Stronger original #925 authenticated offline/relaunch/reconnect and
  expired-auth/conflict recovery **2/0/0**, native producer exit0.
  `them-1072-final-recovery/them-save-recovery-HwhlYQ/recovery-ios.xcresult`.
- Authenticated writer/save/relaunch fixture **1/0/0**, producer exit0.
  `them-1072-final-writer/writer-loop-cfc6da58-edf4-44c7-995b-b54809255856.xcresult`.
  It uses deterministic DEBUG replies and a temporary export artifact, not
  live speech/provider or an externally completed Files export.
- Synthetic voice-fault native test **1/0/0**.
  `them-1072-final-voice/voice-network-fault-local-1-24675-ios.xcresult`.
- macOS scaffold build and serialized voice runner finish with native exit0,
  `BUILD SUCCEEDED`. Existing Swift actor-isolation/Sendable warnings remain;
  this proves compilation, not the interactive macOS experience.
- D009 against actual parent #904d36d4e64 passes: all five deltas0;
  index33626, Studio17431, Root15112, bridge12929, memory10865. The human's
  early-stack index-count exception remains; no padding. Diff check passes.

Retained failing-before, first-port and final native bundles/logs plus exact
runtime source: `/Users/halfmutantfilms/io.them-worktrees/_proof/T-1072-20261020.I8wJBT/`.
The initial1-failure and later2-failure regressions remain recorded, not
replaced by after-fix green. No unchanged failure was retried as a fix.

Adversarial pass: parked words/no automatic replay, newer manual recovery,
cached server metadata, explicit server choice, exact-current acknowledgement,
failed persistence rollback, another owner/project/auth generation, fetch
failure and edits arriving during server fetch are answered by the executed
real-model cases. All production races and physical-device behavior are not
covered. Existing full V1 UI is not newly attributed to this local run;
fresh hosted proof is still required.

## Limits and next boundary

Not covered: physical microphone, live provider, shipping backend, external
Files completion/open, all later same-project/generation races, universal
disk repair or universal exact-byte ordinary-save identity. Ordinary save
canonicalization and later original #928/#962 work remain separate; do not
claim all later capabilities have landed. Original heads and PRs are preserved.
No paid model calls, secrets, production changes, main mutation or protection
bypass. Real independently approved hosted checks remain required.

After final local proof, normally advance original #919 only if its remote
head still matches the inspected ancestor; record fresh hosted results. Stop
at any red. Only then carry the corrected parent into original #973 and
re-prove the actual combined security child. Goal remains active.
