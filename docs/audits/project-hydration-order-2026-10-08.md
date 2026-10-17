# T-938 — Newest project load owns the page

Goal items 1 and 4. Base #935 `daecfa34c27eedecacb70df6f5b7ad9a113af41a`.

## Reproduced problem

VERIFIED: unchanged production failed two real-model overlapping-load tests in
four assertions. Older project detail rewound a newer clean page, head and
title; an older timeout replaced successful feedback. Retained artifacts:
`/tmp/them-938-hydration-red-v2.xcresult` and `.log`.

A separate real Load Server action succeeded, then a pending older detail
rewound its page, head and title: one test, three failed assertions,
`/tmp/them-938-choice-red.xcresult` and `.log`.
Initial `/tmp/them-938-hydration-red` is a fixture compile failure, not product
failure evidence. It was corrected to use the existing client initializer.

## Fix and boundaries

Every selected-project load captures a generation. Detail, fallback, outline,
durable queue restoration, hydration and error application check that generation
alongside the existing account/project guards. A later load of the same project
supersedes earlier responses even when their account and project still match.
Accepted fresh Load Server and exactly confirmed saves invalidate older reads
before suspension can admit them. Dirty-word/conflict protection and local queue
semantics remain canonical; no parallel recovery or networking implementation.
Bootstrap also rechecks its existing active request after queue restoration.

Expanded real-model cases cover the outline await and a confirmed manual save.
All transport content is synthetic, using a fictional `.test` URL and injected
canonical clients; no paid/live model calls. The separate authenticated UI
journeys use the real local backend with authentication required.

Existing related work inspected: #854 scopes restored memory and Live Intent to
the open script; #910 gates live sync on selected/loaded project readiness.
Their behavior is retained, not closed, squashed or reimplemented here.

## Files changed

- `them/ScreenplayStudioViewModel.swift`: generation and existing asynchronous
  loader/recovery/save boundaries.
- `themTests/ScreenplayProjectHydrationOrderTests.swift`: five real-model ordered
  transport cases and exact UTF-8 draft assertions.
- `TASKS.md` and this audit: retained failures, proof and uncovered work.

## Proof

Focused three-case signed run: three pass, zero fail/skip,
`/tmp/them-938-focused.xcresult` and `.log`.
Node 20.20.2 full backend with networking disabled: **2,744 pass, zero fail,
two skipped**, `/tmp/them-938-node20.log`. No backend source changed afterward.
macOS scaffold build exit zero, `/tmp/them-938-mac.log`; unsigned build-only,
not an unsigned test. Four recovery-runner tests pass; god/diff gates pass.
Final full signed units **691 pass, zero fail/skip**:
`/tmp/them-938-full-units.xcresult` and `.log`; exact summary checked. All five
expanded ordering cases execute and pass. Authenticated recovery UI **five
pass, zero fail/skip**, `/tmp/them-938-recovery-ui/screenplay-save-network-fault-65157.xcresult`
and `/tmp/them-938-recovery-ui.log`; exact summary checked. Integrated authenticated
writer UI **one pass, zero fail/skip**, `/tmp/them-938-integrated-writer.log`.
The evaluator checks the exact single-case summary and deletes its bundle at
completion; the log is retained. This is deterministic local writer proof,
not paid live speech generation. Read-only adversarial review found no scoped blocking
defect; this is not a GitHub approving review.
All iPhone proof runs erase only owned simulator
`11CF5EFB-D8C3-4F19-8062-28AF37F27D93`, iOS 26.2, signing enabled.

## Not covered / landing

This proves ordered client application, not chronological ordering of every
server commit or every database concurrency interleaving. Direct hydration,
other collaboration requests, project activation and bootstrap-list ordering
remain separate surfaces; do not infer their exhaustive race freedom from these
tests. Newer-load failure must not license an old response as a fresh head.
No explicit generation test seam blocks the queue actor; source review checks
the passed guard after queue restoration, while existing durable UI exercises
the ordinary recovery path.

The exact hosted #929 false-clean root, T-933 actor teardown, physical microphone,
paid provider, shipping configuration, production Postgres, export parity,
120-page performance, fsync/power loss and unsynced uninstall are not proved.
Full V1 UI is not rerun locally in this slice. Required hosted gates on the exact
published head and independent approval are still required. Main stays unchanged;
#766 then #770 remain first. No approval bypass or paid call is authorized here.
