# T-1008 — Actual database recovery on the current retention parent

## Preserved inputs and boundary

Normal preserving merge a06cbfc486a727954b64b810756b6c4a158a9e20 combines
T9911ed27b9a (original #9637459a8fa plus fail-closed cleanup) and current
original #962ee7e27f26a698cd8875fe20f7500fb26d1e3e962. Only TASKS conflicted;
both histories retained. No squash, replacement PR, force, main merge or
production change. Original #963 head remains7459a8fa until its parent
boundary and this proof are both satisfied.

## VERIFIED local proof

- Frozen a06cbfc4, isolated Node20.20.2, no external network: scripts231/0/0,
  backend2907 pass/0 fail/2 skip, native91272 exit0.
  `/tmp/them-1008-node20.log`.
- Canonical image actual PostgreSQL16.15/Node20.20.2 restart PASS, native25763
  exit0, `/tmp/them-1008-postgres.log`. All12 migrations; authenticated
  signup/session/project/version routes; exact422,201 bytes/6,600 synthetic
  lines, one-line rewrite, real database and backend restart with fresh local
  files, retained authentication, cross-user denial and duplicate replay.
- Focused cleanup10/0/0, `/tmp/them-1008-focused.log`: failures stay red,
  cleanup attempts all exact invocation-owned resources, borrowed images
  remain intact, only exactly absent auto-removed worker tolerated.
- Only UUID-owned synthetic containers/network/volume/built image removed
  before PASS. No human or production data deleted. No host database URL,
  paid key or provider used. This is NOT a generated120-page screenplay.
- Actual fetched parent D009: all five deltas0; diff clean. App/Swift/tests/
  packages/project bytes IDENTICAL to verified parent #962ee7e27f2.
  Its signed units866/0/0, recovery5/0/0, writer1/0/0, fixed-provider Home2/0/0,
  full Pro UI29/0/15, voice1/0/0 and macOS build0 are parent evidence, not a
  newly executed signed run attributed to this tooling-only change.

## Exact incremental files vs the current parent

- .github/workflows/quality-gate.yml — maintained real database step.
- scripts/run_postgres_writer_gate.mjs — canonical isolated orchestrator.
- backend/evals/postgres_writer_restart_scenario.mjs — real writer scenario.
- backend/tests/postgres_writer_gate.test.mjs — adversarial safety controls.
- TASKS.md — both histories and current task.
- docs/postgres-writer-gate-2026-10-19.md — original evidence retained.
- docs/postgres-cleanup-safety-2026-10-19.md — original correction retained.
- docs/postgres-current-parent-2026-10-19.md — this combined manifest.

## Remaining work

Current #962ee7e27f2 has hosted backend and D009 green; Quality Gate still
pending at last actual read. Keep original #963 unchanged until that boundary
is green; then normal append with preserved ancestry, fresh exact-head hosted
checks and required independent review. Do not merge main or waive protections.
The original isolated auth SIGABRT is retained in original evidence, not
claimed fixed by cleanup or by a later successful run.

Human clarified120 pages is a feature recommendation, not a quota. T1007
implements that separately; its new Swift/backend changes are NOT silently
included in this older original-stack boundary. Physical iPhone microphone,
live model writing/rewrite, actual feature craft/print/export-open remain
unproven. Production remains held until App Store credentials exist. Local
key readiness remains unconfirmed; do not read the pending secret file.
READY FOR CONTINUE.
