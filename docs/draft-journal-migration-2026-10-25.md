# T-1149 — Do not delete a draft journal after failed migration

## Reproduced cause and smallest correction

VERIFIED on original975a754cac: migrateDraftIfNeeded calls persist, which
catches filesystem failure and returns Void, then removes the legacy journal.
The actual startup migration targets the existing quarantine owner; this is
not a proposal to assign unowned text to an arbitrary signed-in account.

One signed test seeds a real isolated53-byte journal (NFD Unicode, CRLF and
leading/trailing spaces), injects a directory-creation permission error during
destination persistence, and invokes the real store migration. Before the fix:
**0 pass /1 fail /0 skip**, exit65, assertion reports0 versus53 source bytes.
This demonstrates loss of that journal under a controlled filesystem fault,
not a physical-device incident or proof every other recovery copy disappears.

The canonical persist operation now returns true only after its nonempty atomic
write succeeds. Existing callers may discard the result; empty-input cleanup
retains its existing behavior. Migration removes the legacy source only after
true. Failed migration can therefore retry from its retained exact source.

D009 capability extraction: move the existing110-line FileStore definition
from ScreenplayLiveDraftBridge.swift to ScreenplayLiveDraftFileStore.swift.
There is one store, not a second framework. Exact transformation comparison
verified only Foundation/OSLog imports, the acknowledged return contract and
migration guard differ. Paths, owner keys, text policy, reset and read behavior
are retained; the bridge is111 lines smaller. Keep the historical internal
io.them path to preserve existing data rather than rename storage for branding.

## Proof and ownership

Owned files: them/ScreenplayLiveDraftBridge.swift,
them/ScreenplayLiveDraftFileStore.swift,
themTests/ScreenplayLiveDraftFileStoreMigrationTests.swift, this report and
TASKS.md T1149. Xcode's existing synchronized source groups own the new files;
no project membership, backend, save/outbox or auth behavior is replaced.

VERIFIED corrected signed migration/reset checks: **8/0/0**, exit0; actual
completed summary inspected and exactly8 passes/zero failures/skips asserted.
Full signed native checkpoint: **974 pass /0 fail /0 skip**, exit0, on the
erased owned91693AF0 simulator. Mac scaffold build also completed with exit0
and BUILD SUCCEEDED. Backend, scripts, workflows and project sources did not
change; no duplicate local backend run was used as a substitute for native proof.
Five migration methods cover failed write, successful exact transfer with an
unrelated owner preserved, retry/no duplication, existing destination, and
missing source. Existing three reset methods remain unchanged. Do not call
an active invocation a pass. Before/after bundles use unique1149 paths under
/private/tmp and the owned erased91693AF0 simulator, signing on.

VERIFIED proper-parent numeric D009: bridge12796→12685 (-111); index33475,
Studio17299, Root14937 and memory10463 unchanged. Diff check passes. Private
archive: /Users/halfmutantfilms/io.them-worktrees/_proof/T-1149-20261025.6LDWH7/.

## Boundaries and next checkpoint

The injected fault is directory preparation, not physical disk-full/power-loss
testing. A completed Foundation atomic write is not a proven power-loss fsync
guarantee. Simultaneous migrations/writers, corrupted existing destinations,
removal failure and physical-device storage pressure are not established by
these cases. Existing destinations are intentionally not overwritten. No new
automatic cross-account assignment or UI recovery promise is made.

A bounded history-message search found no matching repair. A deeper content
search hit an unavailable promisor object/network resolution error; that is
not proof no later preserved branch contains related work. Reconcile any
future overlap explicitly rather than discard that work.

Local branch codex/T-1149-draft-journal-migration preserves public975a754cac.
Its preceding hosted40214545174 is terminal SUCCESS: backend2964/0/4,
signed units969/0/0, strict writer1/0/0, broad V1 **36/0/25** (61 total,
not61 passes), canonical recovery stage and voice-fault1/0/0, Mac and D009
green. These are the published parent's results, not changed-head hosted proof
for the journal correction. Any normally published descendant needs fresh checks.

VERIFIED manual outside-app export observation after the human unlocked the
Mac: opened writer-loop-bf439633608d.md from Files Recents on reserved simulator
7F1A14C1 (THEM T1102 Mentor Proof 20261021, iOS26.2). Quick Look visibly shows
the controlled WRITER LOOP DRAFT BF439633608D marker with its Markdown bold
delimiters. File is35 bytes; SHA256
01f0b0af38ec0478c5ed3e05b72d9d8170c27dcb1a69910d8901c2b22b207022.
Screenshot: private archive files-external-open.png. This proves a previously
saved controlled Markdown file opens outside THEM; it is not a fresh export
of this journal candidate, generated story, physical-phone or shipping-backend
proof. The reserved simulator and file were not erased, moved or modified.

No paid call, main/production change, force/squash/replacement or review bypass.
Intended-backend physical-phone proof and current Craft GUI remain unverified.
