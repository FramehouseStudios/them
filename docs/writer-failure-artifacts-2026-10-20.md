# T-1055 — Keep the native writer-loop evidence

Original draft #972 head `53b4d6d704d0d52247117385e9979cc7f22e2cfd`,
base main. Task branch `codex/T-1055-writer-failure-artifacts` preserves it.

## Observed problem

**VERIFIED:** hosted run39421358172/job118622822254 passes signed units but
fails the integrated writer test at the Markdown-export menu button:
invalid activation point. Existing local writer1/0/0 is not a hosted fix.
The downloaded failure artifact contains the unit bundle only. The writer
harness explicitly removes its separately named `/tmp` result bundle in
`finally`, including on failure, so its actual recording/hierarchy cannot
be inspected. Do not blame export layout or provider behavior from this log.

## Small correction

Retain the bundle under the canonical V1 artifact owner. Respect explicit
ARTIFACT_DIR, then RUNNER_TEMP/TMPDIR/platform temporary directory, matching
the existing shell runner. Use a UUID filename directly under that directory
so the existing CI `them-v1-ui-smoke/*.xcresult` upload includes it, without
a workflow change or overwriting a prior run. The shell runner still creates
the directory and runs the exact same signed/erased writer test; all summary,
text/version, save, restore and export assertions remain unchanged.

Finally still removes only its temporary port xcconfig and stops the owned
backend. Native results are no longer deleted on either success or failure;
print the path, not its content. No provider credential, screenplay content,
production configuration or secret is added to tracked output.

## Verification

**VERIFIED:** isolated offline Node20.20.2 focused helpers **10/0/0**, covering
explicit artifact ownership, the actual CI upload directory, local/platform
fallback, UUID uniqueness, fail-closed exact-one/unskipped summary validation,
bounded stdout and structured native failure extraction. These are runner
checks, not iPhone screenplay-generation or model-quality results.

**VERIFIED:** full Node20.20.2 backend `npm test`: **2,743 passed / 0 failed /
2 skipped**, native exit0, external network disabled. Exact source tree
`0079a73690b41e8aedf4f8d1409e9a77e36d6b2b`, isolated tracked-source archive
with matching read-only dependencies; no local environment/credential files.
This main-based branch has a different backend boundary from #904; do not
combine their test counts. Skips: real-Postgres prefix query (DATABASE_URL
not configured), and existing talk page-write preview/sync integration case.

**VERIFIED:** harness syntax, cached/uncached whitespace, D009 against actual
origin/main: all five deltas0. No Swift, workflow, dependency or project
configuration changes. Existing runtime fix53b4d6d remains intact; its full
signed626/0/0/macOS proof is retained, not rerun or newly attributed here.

**VERIFIED:** one real local writer journey passed **1/0/0**, native exit0,
on erased, task-owned signed SE `E8998A6B-35B1-49E3-896C-861550849927`,
iOS26.2, against its auth-required synthetic backend. Native harness runtime
Node24.22.0 (not the offline Node20 suite above). Exact actual bundle remains
readable after the process completes:
`/tmp/them-1055-writer/writer-loop-a1a1a896-1915-4925-9e38-ae976aaa3cda.xcresult`.
The temporary port config was removed and the owned backend process exited.
Private bundle/log copy, compared byte-identical:
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1055-20261020.LWFN6N/`.
The actual current writer test exercises typed create/save/Markdown export/
relaunch and checks exact server words/version count. It is not live speech,
model generation or an externally opened exported file. No failed native
export reproduction was manufactured or rerun unchanged in this task.

**LIMITATION:** this proves successful native-result retention and the
shared finally path no longer deletes bundles; the next failing hosted run
must still prove its actual artifact is uploaded and expose the export cause.
This is not a hosted export cure or live voice/model proof. Full hosted
checks and independent review remain required. Main and the production hold
stay unchanged; manual caret clipping remains open.

## Publication

Normally fast-forward original draft #972 from53b4d6d, preserving its source,
history and main base. No replacement PR, force, merge or bypass. Exact files:
the writer harness and its existing helpers/tests, `TASKS.md`, this document.
No application, backend handler, workflow, dependency, secret or production
change. Scoped temporary dependency symlink removed without touching its
target. Required hosted checks restart on the updated original head.
