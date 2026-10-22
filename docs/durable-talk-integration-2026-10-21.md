# T-1121 — Durable accepted-talk integration, 2026-10-21

## Checkpoint and scope

VERIFIED: branch `codex/T-1121-durable-talk-integration`, worktree
`/Users/halfmutantfilms/io.them-worktrees/codex-mentor-current-parent`.
Integration parent `ab8fbc779cfc870de0c21c348f773e2263aae421`.
Preserving merges `4de763c` and `7d1e980` retain Zora's original `c8e2b1a`
and capacity follow-up `ec38b82`. No squash, replacement PR, original-head
rewrite, main merge or production change. Runtime commit:
`a6a3204bc0fcb1c4c389004da0248bd157d7e980`.

This connects an existing capability; it does not establish complete billing
crash safety, automatic original-document delivery or physical-phone readiness.

## Root fixes

- Share canonical PostgreSQL/JSON persistence with the existing backplane.
  Hydrate extracted metadata after the authoritative auth startup guard.
- Await both sanitized metadata stores and all four completed-response stores
  before HTTP success. Preserve legacy response fields and public `turn-N` IDs.
- Private metadata storage hashes trusted owner scope plus public turn ID.
  Different writers with `turn-1` no longer overwrite each other. Canonical
  read-through sees another worker's publication and avoids reviving a deleted
  canonical row from the local cache. Legacy reads still use the HTTP policy;
  ambiguous non-owner reads carry only denial identity, never screenplay text.
- An asynchronous metadata-read failure returns503 `turn_unavailable` without
  private database error details or an unhandled Express4 rejection.
- Persist idempotency admission before publishing process-local pending state.
  Capacity failure returns retryable503 rather than a phantom pending request.
  Completion reads durable pending state if the bounded local cache evicted it.
- Include `talk_turns` and `talk_idempotency` in canonical account export/purge
  domains and recognize trusted owner/key scope. The actual local export probe
  proves own rows included and another account's rows absent; full hard-purge,
  Redis invalidation and interactive account-switch behavior were not reproved.
- Strengthen the original restart probe: charge a real synthetic funded wallet,
  test JSON and a task-owned localhost PostgreSQL database, and remove the extra
  balance HTTP read before SIGKILL so it cannot grant settlement extra time.

## Verification and red results

All provider responses were intercepted. No paid requests, physical microphone,
production database, or deployed service was exercised.

| Check | Result |
|---|---|
| Exact-lock full backend, Node20.20.2, network-disabled container | 2,939 pass / 0 fail / 2 skip |
| Signed full `themTests`, erased task-owned simulator | 932 pass / 0 fail / 0 skip |
| Signed raw voice → authoritative page → save → exact relaunch | 1 pass / 0 fail / 0 skip; intercepted STT1/chat3/TTS1 |
| Signed queued response → playback → append → save → exact relaunch | 1 pass / 0 fail / 0 skip; intercepted STT1/chat2/TTS23 |
| Final focused owner/state/startup/read-failure set, host Node24.19.0 | 47 pass / 0 fail / 0 skip |
| macOS scaffold build | exit0; compile only |
| Syntax, `git diff --check`, D009 | pass |

Full backend used the secret-free source snapshot
`/tmp/them-1121-final.gqpJg0/source`, with exact-lock read-only dependencies
from `/tmp/them-1074-node20.a8uypX/backend/node_modules`. Lock SHA256:
`dec81f1c2d2fb1912f57668260efb2183212cf0d6d05a8d2314049e041c5501c`.
The final focused run adds one test-only503 regression after that frozen full
run; runtime source is unchanged. Both UI workflows use the current native tree,
normal signing, actual local auth and synthetic wallet funding. Native source
is unchanged from the integration parent. Simulator:
`7F1A14C1-B379-4417-AFE9-331810CD9CD3`, iPhone17Pro/iOS26.2.

The two backend skips are the PostgreSQL prefix-metacharacter live test (no DB
in the network-disabled container) and the existing talk page-preview case.
The separate actual PostgreSQL restart probe does not replace that skipped
prefix test. Existing macOS warnings remain; no warning-free/Swift6 claim.

Retained failures and corrections:

1. New owner-collision regression initially failed: A's `turn-1` read B's text.
   Fixed private storage identity; public IDs were deliberately not replaced.
2. First combined Node20 full run: 2,938 pass / 1 fail / 2 skip. Early metadata
   hydration intercepted unavailable-DB failure before the canonical auth guard.
   Move hydration after auth initialization; unchanged fail-closed assertion and
   final full suite pass. No permissive local-auth fallback was introduced.
3. Repeated PostgreSQL probe: ambiguous cached non-owner IDs returned404 rather
   than403. No other writer's content was disclosed. Preserve the existing denial
   contract with identity-only denial; final PostgreSQL probe passes.
4. Initial final-run attempts were sandbox-denied Docker access/local listening,
   not application failures. Authorized runs then completed. Logs are retained.

## Real restart samples

JSON and PostgreSQL local child-process probes use two authenticated synthetic
accounts, real Page requests and migration013 in the task-owned PostgreSQL
fixture. Owner reads200, other reads403; own account export contains both new
domains and the other account export contains neither.

Initial wallet100turns becomes99.8 for80 fixture output tokens. Graceful restart
replays identical15,456 audio bytes, original `turn-1`, replay header1 and zero
new STT/chat/TTS; balance stays99.8. A second accepted result followed immediately
by SIGKILL recovers identical bytes/original ID with zero new provider calls and
balance99.6. Final PostgreSQL probe ran after the startup-order correction.
The JSON retained sample precedes that correction. These are sampled
post-response termination points, not an exhaustive durability theorem.

Temporary container `them-t1121-postgres-proof` was verified by exact name and
label `them.task=T-1121`, then stopped after probes exited. No shared/production
database was changed. Migration013 has not been deployed.

## Critical remaining settlement failure — T-1122

VERIFIED by Zora's separate deterministic Node20 probe: with `putBalance`
injected to fail, reserve/commit reports successful0.2turn settlement, memory
becomes9.8, and `await flush()` resolves, while durable and freshly hydrated
balances remain10. Two queued writes both observe9,800milliturns because the
queued operation reads a mutable balance row. This is reproduced durable debit
loss, not merely a suspected crash race. The probe is retained with the evidence.

Source boundary: the Page adapter settles on `res.finish`; wallet mutation
queues persistence without awaiting it; the queue catches rejection. Metadata
and completed replay can be durable while settlement is not. Awaiting the
current `flush()` alone cannot solve this. T-1122 must make failures observable
and add an idempotent durable settlement/reconciliation boundary. PostgreSQL
atomic balance+receipt or a recoverable prepared-result state must be proven
before claiming exactly-once billing. No such claim is made here.

## Other limits and next action

- Replay defaults to five minutes/160 live admissions; refuse new admissions at
  capacity rather than delete a live accepted replay. Same-process admission is
  serialized, not globally transactional across workers.
- Metadata remains bounded by30minutes/4,000entries; capacity pruning can shorten
  recovery. It is not permanent conversation/audio history. Metadata-before-replay
  is not a multi-table transaction; a later failed write can leave orphan metadata.
- Pending-process death, simultaneous retries across workers, wallet hydration
  of reservations, multi-worker last-write-wins balances, Redis behavior, and
  physical storage/power-loss remain outside these passing samples.
- Automatic original-context/unbound delivery, interrupted rewrite delivery,
  feature-length performance and the real-phone journey remain active work.
- Production stays held under the human's App Store-credentials decision.

Evidence directory:
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1121-20261021.Y3IXkm/`.
It retains prior red logs, final logs, signed bundles, macOS output and the
synthetic failure probe. No private environment file is part of this checkpoint.

Next: give Zora this committed base for T-1122, with module ownership coordinated
before edits. Jarvis retains native/original-context integration and protected
GitHub landing. THEM is not complete; READY FOR CONTINUE.
