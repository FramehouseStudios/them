# T-1013 — Preserve queued writer input through load failure

## Target and binary criteria

On current T1011 parent6e9776ce, the canonical OfflineTalkOutbox sets
didLoad before attempting its manifest read and silently compactMaps decode
failures. A later successful write can discard existing queue records.
The next change must load transactionally, retry a failed read on the same
actor, refuse mutation of malformed storage, keep every manifest/blob byte,
and display an unavailable state instead of claiming the queue is empty.
Normal replay/deduplication/parking and user-account checks must remain.

## VERIFIED reproduction

Signed tests use actual temporary manifest/blob files and actual outbox
actors. A directory temporarily at the manifest path forces a real read
failure; this is not a physical-iPhone file-protection reproduction. Separate
malformed JSON and invalid UTF-8 cases verify no overwrite and same-actor
recovery after restoring only the synthetic valid manifest. No human data,
credentials, phone, paid provider or production storage is used.

Before correction: signed8 pass/2 fail/0 skip, native27034 terminal65,
`/tmp/them-1013-before.log` and completed bundle
`/tmp/them-1013-before/v1-ui-smoke-local-1-35801.xcresult`.
Actual summary read: first turn missing after enqueue; malformed storage
accepted a write instead of refusing it. Existing eight tests passed.

## Correction and current proof

Read without treating every file-existence failure as a new empty queue;
only the actual Foundation no-such-file error permits fresh initialization.
Decode UTF-8 and every nonblank JSONL record before assigning entries or
didLoad. On error, retain original manifest/blobs, keep load retryable, and
surface a safe error without raw file content. Existing shared snapshot
status supplies Studio/Data Controls an unavailable message rather than
claiming no waiting work. No god-file/UI-view growth or new storage system.

Malformed data intentionally blocks all queue mutation, including parked
deletion, rather than dropping the bad record and rewriting the rest.
This is preservation, not automatic corruption repair. The same actor can
recover after storage becomes readable/valid again.

VERIFIED corrected focused10/0/0, native97648 exit0;
`/tmp/them-1013-focused/v1-ui-smoke-local-1-36661.xcresult`.
Frozen89d75626d08b1686d91a26449967c2c7c39d4f68 full signed units874/0/0;
`/tmp/them-1013-ui.tCkJkP/units/v1-ui-smoke-local-1-37181.xcresult`.
Actual completed summaries read. Node20.20.2/no external network backend
2988 pass/0 fail/2 skip, scripts238/0/0, native82055 terminal0;
`/tmp/them-1013-node20.log`. Actual fetched T1011 parent6e9776ce:
all five god-file deltas0, diff clean; `/tmp/them-1013-god-files.log`.

Signed iPhone recovery5/0/0, completed bundle
`/tmp/them-1013-ui.tCkJkP/recovery/them-save-recovery-GAGxiF/recovery-ios.xcresult`.
The initial chain48555 terminated1 because my `INCLUDE_MACOS=0` variable
was ignored; canonical option is `SCREENPLAY_SAVE_INCLUDE_MACOS=0`.
It additionally attempted macOS recovery UI, which failed to initialize
automation mode (75.284s observer diagnostic). Completed summary reports
0 pass/1 runner failure, no recovery test body reached. Retain the failure;
do not call macOS recovery green or presume a product cause. No security/
automation permissions changed and no unchanged failed test was retried.

Only the previously unreached required checks were then run:
native13186 terminal0, `/tmp/them-1013-remaining-ui.log`:
writer1/0/0 at
`/tmp/them-1013-ui.tCkJkP/writer/them-studio-ios-writer-loop/run-7HtaiW/writer-loop.xcresult`;
voice1/0/0 at
`/tmp/them-1013-ui.tCkJkP/voice/voice-network-fault-local-1-39410-ios.xcresult`;
macOS scaffold BUILD SUCCEEDED. Actual completed summaries read. These run
on07e02bbb, whose app/backend/test bytes match frozen89d75626 (docs only).
No fresh full V1/Home/live-model/phone or release certification claimed.

Seven COMPLETED before/focused/full-unit/recovery-iOS/recovery-macOS-failed/
writer/voice bundles cloned and compared identical
under `/Users/halfmutantfilms/io.them-worktrees/_proof/T-1013-20261019.rNeXzn/`,
with completed logs. Same computer is not an off-device backup. Initial
xcresult read accidentally used an unobserved filename and failed64; corrected
to the actual log-reported36661 bundle. No test rerun was used for that read.

## Remaining full objective

This does not solve initial nonqueued provider failures or make parked voice
turns usable on the page. Those still require a connected recovery design and
proof. A successful transport send alone must not be claimed as a restored
screenplay. Physical microphone, live model, full-feature craft and external
export-open remain unproven. Original #962 hosted39336874458 is now terminal
FAILURE: blank-snapshot not queued, unresolved conflict metadata/queue missing
after relaunch, and a terminated test process. The marker text was present
in the conflict snapshot; do not overclaim total writer-text loss or call it
a harmless flake. Raw completed log at `/tmp/them-962-hosted-failure.log`.
Artifact download native43407 to `/tmp/them-962-hosted.lipI85` completed0;
actual hosted bundle summary3/2/0 on iOS26.5(23F77), distinct from local26.2.
Hold original #963 and mentor-head advancement. A local
pass is not a root fix for this hosted failure. No original head/main or
production setting changed. Production hold remains in force.

## Exact files

- them/OfflineTalkOutbox.swift — transactional loading and shared error status.
- themTests/OfflineTalkOutboxTests.swift — actual-file retention regressions.
- TASKS.md — task, scope, proof and remaining gates.
- docs/outbox-load-safety-2026-10-19.md — this report.

READY FOR CONTINUE: T1014's deterministic save-drain characterization is
running directly on the failed original head, after T1013's Xcode chains
became terminal. Investigate both hosted failures before advancing the stack.
