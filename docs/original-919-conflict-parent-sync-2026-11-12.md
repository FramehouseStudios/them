# T-1463 — Preserve original editor on published conflict authority

VERIFIED local source checkpoint, 2026-11-13 06:05 UTC. Static preparation only;
root's current first-red/auth-fixture work and runtime/hosted review remain open.

## Exact inputs and preservation

- Original #919 remote head, last verified: `9b3d9f840047faf016bac79f17a1b824883022d2`.
- Prepared child: `1c1822526ca00fc958302cd683e65274188b4969`; original 9b and
  navigation/parent 60 are verified ancestors.
- Published original #904: `c2fab4c1f680c7a5da6387500c91f2b9296f720b`, targeting
  main bc. Its live GitHub branch ref was checked independently. The #919 API
  payload still reports base_sha ce89 while naming that same #904 branch;
  this merge uses explicit published c2, not the older payload SHA or a backup.
- Merge base: `60b3da79b91f73cd5562ec4f8bab01199804c434`.
- Local preserving merge: `23c96f1ec319a53df65dbaf808d12af365fdef35`, with exact
  prepared 1c and published c2 as its two parents. No original history rewritten.

The initial merge stopped at runtime conflicts as required. All 12 stage blobs,
all 4 complete conflict working files and automatic V1 output were preserved
before any resolution. Root reviewed proposal 061c4e4e and explicitly authorized
only the 13 conflict hunks: TASKS 1, outbox 4, view model 7 and outbox tests 1.
Every live stage, backup and working hash was checked again immediately before
applying a context patch. No whole-file side checkout or overwrite was used.
TASKS retains both incoming T1460 and original T1457/T1455/T1449 blocks verbatim.

## Source identity and scope

- Outbox is byte-exact published c2, SHA-256
  `711dd6624694c84106cb4fd65c201ec6c12fdd2bfc315924816404add2deffb8`.
- Outbox tests are byte-exact published c2, SHA-256
  `e426dd96c07e2a90a2a0d6b6ccf171268e8523dee9dab170452050c6607457ae`.
  All 42 old test method bodies remain unchanged; all 6 parent additions retained.
- View model is exact c2 after replacing only its DEBUG
  `runQueuedSaveNetworkFaultUITest` function with exact child 1c bytes, SHA-256
  `233e57e0925c19a87c9e758d6e13ec1fa0e152bbbf53bc20628684478f151ec3`.
  The child guard checks selected/loaded project identity and cancellation before
  existing synthetic marker injection. Production recovery methods remain c2.
- Automatic viewport, bridge, viewport-unit, draft-recovery-unit and V1 files are
  byte-exact prepared 1c. Persistence-policy and recovery files match both inputs.
  Original editor/Unicode behavior and tests coexist with the canonical parent
  authority owner; no second queue, copied framework or duplicate capability.

The parent decisions retained include request-generation guards before/after
awaits, captured-owner interrupted saves, unparked successful-receipt authority,
explicit Load Server discard generations and late-callback fences. Existing
exact-byte checks and assertions are preserved. These are source comparisons,
not a new reproduction or native proof of the combined child.

## Static verification and limits

`xcrun swiftc -frontend -parse` exited 0 for the three resolved Swift files plus
viewport, bridge, viewport integration tests, draft recovery tests and V1 source.
Both working and staged `git diff --check` exited 0; no unresolved index stages
remain. No build, typecheck, simulator/native test, backend/npm run, port, model
call or provider request was made.

Canonical D009 ran with a temporary task-owned LOCAL base reference pointing
exactly to published c2: all five deltas 0. That local reference was removed using
its expected SHA immediately afterward. No existing tracking reference or GitHub branch was moved. The static Node tool measured `v26.7.0`.

Parent c2's 709/0/0 signed units, recovery 2/0/0, writer 1/0/0 and Mac compile exit 0 remain
inherited root evidence only. Root corrected its native fixture/controller
attribution to Node 26.7; counts are unchanged. None is rerun or promoted to a
passing combined-child claim here. Auth-refresh proof remains a separate fixture
contract; source preservation does not establish it or production readiness.

## Handoff

Owned branch/worktree: `codex/T-1463-919-conflict-parent-sync` /
`codex-T1463-919-conflict-parent-sync`.

Private evidence: `/private/tmp/them-T1463-919-parent-conflicts-dblkdpvs/` contains
preservation.json, all 12 stages/working backups, the reviewed proposal, exact
applied patch 9a3bf9c9, expectations, post-resolution identities and D009 receipts.
No original, other worktree, dirty #973, simulator 81F, main, GitHub, protection or
production state was changed. No push or PR/base update. Root owns first-red
resolution, subsequent combined verification and any original-branch advancement.
This child is not claimed ready. Production remains held. READY FOR CONTINUE.
