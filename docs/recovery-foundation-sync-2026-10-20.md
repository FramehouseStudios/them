# Original recovery on the current security/save foundation

## Preserved integration and real correction

VERIFIED local merge `0a321edf4b52d640bf7b7242888f7f8f7fd5141c` has parents:

- Original #904 `d36d4e647fdc3dae3813cccac57eb6f2d15dae7b`.
- Original #964 `5faa43d6c087813be926246be14f3425ad651880`.

Both histories remain intact. Task insertions and outbox-test insertions
conflicted; keep every original task and every test from both parents.
Runtime source merged automatically. Review found two DEBUG helper references
to the Bool removed by the inherited single save-slot capability. Those stale
references were corrected before compiling, not claimed as a failing test run.

Reuse #919 `39ca7c3b`'s existing loaded-page/cancellation guard and stronger
initial recovery assertions, originally adapted from #962 `856d7624`, against
`draftSaveSlot.isClaimed`. Both fixture preparations now require matching loaded
project, full seeded text and character count before continuing. Do not inject
expected text, retry taps, enlarge timeouts or weaken final saved-version checks.

Original corrupt-queue fail-closed hydration, queued writer restoration,
unresolved writer-choice guards and inline iPhone export chooser are preserved.
The canonical outbox remains injected for the original actual-model tests;
there is no second queue, save coordinator, persistence owner or export engine.

## Fresh bounded proof

VERIFIED, signed on erased task-owned SE375pt / iOS26.2 / build23C54 / UDID
`E8998A6B-35B1-49E3-896C-861550849927`:

- Affected outbox, save-slot and draft-recovery unit classes: **98 passed,
  0 failed, 0 skipped**. Native process exit0, actual result summary inspected.
  `/tmp/them-1082-focused/v1-ui-smoke-local-1-62163.xcresult`
  and `/tmp/them-1082-focused.log`.
- Selected real authenticated local-backend story, expired access-token
  refresh / queued relaunch / competing server version / explicit Keep Mine /
  saved draft / second relaunch: **1 passed, 0 failed, 0 skipped**. Producer
  and native summaries both pass; selected-test contract explicitly requires1.
  `/tmp/them-1082-recovery/them-save-recovery-NFrneA/recovery-ios.xcresult`
  and `/tmp/them-1082-recovery.log`.
- This is one selected recovery story, not both recovery tests or the full
  V1 suite. The ordinary reconnect story was not rerun locally in this task.
- Dummy provider, required account auth, embeddings disabled, localhost31337.
  No paid model call or real microphone. Private environment files were absent;
  only matching secure cached dependencies were temporarily linked, then unlinked.
- D009 versus actual #964 `5faa43d6`: index33626 (delta0), Studio17431
  (delta-4), Root15112 (delta0), bridge12929 (delta-23), memory API10865
  (delta0). Whitespace check passes. The approved early-stack33626 exception
  is preserved; no unrelated line removal to manufacture33603.
- Both parent ancestry checks pass. Package/lockfile/index/save-slot match
  #964 exactly. Original protected UI/bridge files and hydration/recovery
  policy files match #904 exactly. The model's intended save and DEBUG
  readiness changes were reviewed separately.

No new full backend, full signed unit bundle, full V1, macOS or provider run.
Current parent backend/runtime and pinned dependencies are inherited, not
claimed as a fresh comprehensive proof of this new integrated Swift tree.

## Adversarial coverage and limits

Answered by the affected cases: unreadable manifest is retained and stops
hydration; valid retry does not erase unrelated warnings; queued writer text
precedes server hydration; a live receipt cannot dismiss an unresolved choice;
held admission is atomic and rolls memory back on write failure; save-slot
ownership hands waiting requests back. The selected UI verifies the real
authenticated handler and exact expected final text with one saved version.

Not covered: every process-crash or storage-protection transition, all radio
failures, production migration/restore, distributed wallet reconciliation,
physical phone, intended shipping backend, paid model quality,120-page use or
native external-open export. Later durable-conflict/native-Files originals
remain preserved, separate integration work; these results do not replace them.

## GitHub and next step

Original #904 remote head remains `d36d4e64`, base remains original #964's
branch. No PR replacement, squash, force push, main merge, production change,
paid call or agent-submitted approval. Checked #964/#919 heads were not changed.

At the last inspection, both hosted V1 stages had passed. #964 was finishing
voice/macOS; #919 was running recovery. This is not a final green assertion.

DECIDED execution sequence: wait for #964's final required checks and genuine
non-author review; land only through protections. Then preserve-merge that
actual main into this local preparation and normally advance the same original
#904 for its fresh exact-head checks/review. Avoid a duplicate pre-parent-landing
full CI run. Production remains held under the human's existing decision.

Continue status: READY FOR CONTINUE.
