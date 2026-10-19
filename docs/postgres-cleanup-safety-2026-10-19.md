# T-991 — Complete fixture cleanup without hiding failures

## Preserved source and root cause

Original #963 head7459a8fa2756595d6b807d390f66a51e2fbee220 remains the
parent of source e3ee205297844cac8e8330862ca3a3bbc7b900c7. No original head,
main, branch protection, production environment or writer data was changed.

Two independently reproduced cleanup defects in runPostgresWriterGate:

- A database removal failure throws from the cleanup loop, abandoning later
  volume/network/image attempts and masking the original worker failure.
- Every worker-removal error is ignored, including daemon/permission errors.
  A successful worker could therefore produce PASS with cleanup incomplete.

The existing canonical gate now attempts all exact UUID-owned cleanup
actions, aggregates failures while preserving the original failure message,
and accepts only Docker's exact absent-worker error for that worker's name.
A cleanup error prevents PASS even after a successful restart handshake.
Borrowed images remain untouched. No resource enumeration or broad deletion.

## VERIFIED proof

- Failing first, host Node26: original six cases pass; both new cleanup
  regressions fail (6/2/0): `/tmp/them-991-cleanup-before.log`.
- Final focused10/0/0, host Node26: `/tmp/them-991-cleanup-after.log`.
  Additional cases verify successful-worker cleanup remains fail-closed and
  only exact already-removed worker tolerance passes. These are Docker
  doubles, not database or model proof.
- Actual disposable PostgreSQL restart gate PASS, exit0:
  `/tmp/them-991-real-postgres.log`. Canonical backend image built locally,
  Node20.20.2/PostgreSQL16.15, all12 migrations applied, exact422,201-byte /
  6,600-line synthetic screenplay rewritten/read through authenticated real
  routes, actual disk-backed database restart and backend restart with fresh
  local files, auth persistence, cross-user denial and duplicate replay.
  UUID-owned synthetic containers, volume, network and built image removed
  before PASS. That fixture data was intentionally discarded; no human or
  production data was deleted. Not a generated120-page screenplay.
- Full pinned Node20.20.2 backend regression2896/0/2, exit0, external
  networking disabled, read-only source and disposable persistence:
  `/tmp/them-991-node20.log`. Counts include the ten cleanup safety cases;
  this older original #963 tree is distinct from T-990's backend count.
- Node syntax checks and whitespace pass. D009 against freshly fetched
  original #963 branch/head7459a8fa: all five deltas0. An earlier invocation
  without that fetched ref printed absolute sizes; not comparative proof.
- No Swift/package/runtime-backend logic changed; no new iPhone result is
  claimed for this isolated tooling source. T-990's phone proof is separate.

## Exact changed files

- TASKS.md
- scripts/run_postgres_writer_gate.mjs
- backend/tests/postgres_writer_gate.test.mjs
- docs/postgres-cleanup-safety-2026-10-19.md

## Remaining work and limits

Completed logs retained privately at
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-991-20261019.ZW95k5/`.
Same-computer retention is not an off-device backup.

Preserve this fix in original #963 only after the verified parent integration is propagated and
the combined tree re-proven. No replacement PR or main merge. Existing
original auth-file native-abort evidence remains unexplained, not fixed by
this cleanup correction.

The generic god-file checker currently reports absolute sizes if a requested
base ref is missing. Always fetch/verify the exact base before accepting
comparative evidence; a fail-closed explicit-base check is a concrete
remaining harness-hardening item, not silently claimed fixed here.

Production remains held by the human until App Store credentials exist.
Physical microphone, shipping backend, live generated120-page craft/print
and external-open exports remain unproven. No paid model calls.
Continue status: READY FOR CONTINUE.
