# Maintained PostgreSQL writer restart gate

Run from the repository root:

```sh
node scripts/run_postgres_writer_gate.mjs
```

Requires Docker. Builds the existing canonical backend/Dockerfile (no push),
creates UUID-named internal network, PostgreSQL disk volume and containers,
then removes only its own resources. Optional THEM_POSTGRES_GATE_BACKEND_IMAGE
can reuse an already built canonical image; borrowed images are not removed.
THEM_POSTGRES_GATE_DATABASE_IMAGE defaults to postgres:16-alpine. Actual Node/
PostgreSQL versions are printed rather than assumed. No host database URL or
provider key is forwarded. No published database port or external model calls.

The scenario refuses any non-fixture connection URL before migrations and
does not echo it. Credentials/accounts are synthetic; production-mode boot
values do not prove Apple, IAP, email delivery or paid-provider readiness.

## Contract and proof

Canonical predeploy applies12 migrations and initializes only a new empty
fixture auth store. Actual signup/session and screenplay routes write6,600
synthetic lines (422,201 UTF-8 bytes), rewrite one line, compare exact CRLF,
Unicode and boundary bytes, and deny a different authenticated reader.
Then stop backend, restart the disk-backed PostgreSQL container, boot backend
with a different empty local-data directory, re-read exact bytes, replay the
same request without another version, sign in and recheck read isolation.
The controller must perform the restart; a worker success marker alone fails.
Final PASS is printed only after cleanup. Ordinary failure cleanup is tested;
a process/host hard kill can leave UUID-named fixtures: inspect exact names,
never prune other sessions' resources.

Real final run passed on Node20.20.2/PostgreSQL16.15:
`/tmp/them-983-maintained-gate-final-v2.log`. Six CLI/fixture safety tests pass:
`/tmp/them-983-safety-final.log`. Before Boolean URL refusal, a canary test
failed (4 pass/1 fail), proving the assertion could echo a supplied DSN;
`/tmp/them-983-safety-before.log` is retained. No real credential was supplied.

Added the real gate as a non-optional step inside the existing required
Backend tests job. YAML parsed and step checked; no branch protection changes
or soft failure. Hosted execution of the new step is still unproven.

Frozen source1076a99c5af767d5ce3904f089c791418b37dc51. First pinned Node20
full suite2863 passed/1 failed/2 skipped: user_auth_roundtrip.test.mjs exited
SIGABRT after seven passing cases, without an assertion/native stack. No auth
code changed. Its isolated diagnostic run passed36/0/0. Full frozen-suite run
with native-fatal reports enabled completed2892/0/2, exit0,87.046s, with no
native report produced: `/tmp/them-983-node20-diagnostic.log`. First negative
run `/tmp/them-983-node20.log`, focused `/tmp/them-983-auth-focused.log`.
This is evidence collection, not a claimed root fix or an unchanged CI retry.
Original native abort remains unexplained; normal hosted CI must pass before
merge and any recurrence needs retained native diagnostics. Do not hide it.

Swift, packages and backend runtime logic match parent aef3250b byte-for-byte.
No iOS/macOS rerun claimed here; prior combined proof858 units, Home/writer/
offline/native restoration and macOS remains explicitly scoped to that tree.
All five D009 deltas0; whitespace clean.

## Remaining scope and manifest

This is storage/ownership at full-length payload scale, NOT generation or
validation of120 formatted screenplay pages. Physical microphone→Clementine
reply→page/rewrite, shipping deployment/DNS and external-file-open remain
unproven. No production settings changed. Investigate any reproduced auth
native abort before merge; never count an isolated pass as a full-suite pass.

Files: scripts/run_postgres_writer_gate.mjs;
backend/evals/postgres_writer_restart_scenario.mjs;
backend/tests/postgres_writer_gate.test.mjs; .github/workflows/quality-gate.yml;
TASKS.md; this document. New draft stacks on #962; no original heads replaced.
